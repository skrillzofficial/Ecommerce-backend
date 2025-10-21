const Ticket = require("../models/ticket");
const Event = require("../models/event");
const User = require("../models/user");

// Purchase ticket (main entry point)
const purchaseTicket = async (req, res) => {
  try {
    const { eventId, ticketType = "Regular", quantity = 1 } = req.body;
    const userId = req.user.id; 

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Get event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    // Prepare user info for ticket
    const userInfo = {
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone
    };

    // Use event's bookTicket method (which creates the Ticket document)
    const bookingResult = await event.bookTicket(userId, userInfo, ticketType, quantity);

    // Emit real-time update via Socket.IO
    if (global.io) {
      global.io.emit('new-ticket-purchase', {
        eventId: event._id,
        eventName: event.title,
        ticketId: bookingResult.ticketId,
        userName: userInfo.name,
        ticketType: ticketType,
        quantity: quantity,
        totalAmount: bookingResult.totalPrice,
        purchaseDate: new Date()
      });

      // Notify organizer
      global.io.to(`organizer-${event.organizer}`).emit('ticket-sold', {
        eventId: event._id,
        ticketId: bookingResult.ticketId,
        userName: userInfo.name,
        ticketType: ticketType,
        quantity: quantity,
        totalAmount: bookingResult.totalPrice
      });
    }

    res.status(201).json({
      success: true,
      message: "Ticket purchased successfully",
      data: bookingResult
    });

  } catch (error) {
    console.error("Ticket purchase error:", error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get user's tickets
const getUserTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { userId: userId };
    if (status && status !== 'all') {
      query.status = status;
    }

    const tickets = await Ticket.find(query)
      .populate('eventId', 'title date time venue city images status')
      .populate('organizerId', 'name companyName')
      .sort({ eventDate: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Ticket.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        tickets,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalTickets: total
      }
    });

  } catch (error) {
    console.error("Get user tickets error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tickets"
    });
  }
};

// Get ticket by ID (for validation/display)
const getTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;

    const ticket = await Ticket.findOne({
      _id: ticketId,
      $or: [
        { userId: userId }, // Ticket owner
        { organizerId: userId } // Event organizer
      ]
    })
    .populate('eventId', 'title date time venue address city coordinates liveLocation')
    .populate('organizerId', 'name email phone companyName')
    .populate('validatedBy', 'name email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found or access denied"
      });
    }

    res.status(200).json({
      success: true,
      data: ticket
    });

  } catch (error) {
    console.error("Get ticket error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ticket"
    });
  }
};

// Validate ticket (for organizers)
const validateTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const validatorId = req.user.id;
    const { latitude, longitude, address, accuracy } = req.body;

    const ticket = await Ticket.findById(ticketId)
      .populate('eventId', 'organizer title');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    // Check if user is event organizer
    if (ticket.eventId.organizer.toString() !== validatorId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only event organizer can validate tickets"
      });
    }

    const locationData = latitude && longitude ? {
      latitude, longitude, address, accuracy
    } : null;

    // Use ticket's validate method
    await ticket.validateTicket(validatorId, locationData);

    // Update event attendee check-in status
    await ticket.eventId.checkInAttendee(ticketId);

    // Emit real-time validation
    if (global.io) {
      global.io.emit('ticket-validated', {
        ticketId: ticket._id,
        eventId: ticket.eventId._id,
        userName: ticket.userName,
        validatedAt: ticket.checkedInAt,
        validatedBy: validatorId
      });
    }

    res.status(200).json({
      success: true,
      message: "Ticket validated successfully",
      data: {
        ticketId: ticket._id,
        userName: ticket.userName,
        ticketType: ticket.ticketType,
        validatedAt: ticket.checkedInAt
      }
    });

  } catch (error) {
    console.error("Ticket validation error:", error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get event tickets (for organizers)
const getEventTickets = async (req, res) => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.id;

    // Verify organizer owns the event
    const event = await Event.findOne({
      _id: eventId,
      organizer: organizerId
    });

    if (!event) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view tickets for this event"
      });
    }

    const { status, ticketType, page = 1, limit = 20 } = req.query;

    const query = { eventId: eventId };
    if (status && status !== 'all') query.status = status;
    if (ticketType && ticketType !== 'all') query.ticketType = ticketType;

    const tickets = await Ticket.find(query)
      .populate('userId', 'name email phone')
      .sort({ purchaseDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Ticket.countDocuments(query);
    const stats = await Ticket.getEventStats(eventId);

    res.status(200).json({
      success: true,
      data: {
        tickets,
        stats,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalTickets: total
      }
    });

  } catch (error) {
    console.error("Get event tickets error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch event tickets"
    });
  }
};

module.exports = {
  purchaseTicket,
  getUserTickets,
  getTicketById,
  validateTicket,
  getEventTickets
};