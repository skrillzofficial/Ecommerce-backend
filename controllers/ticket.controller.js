const Ticket = require("../models/ticket");
const Event = require("../models/event");
const User = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");

// @desc    Purchase ticket (main entry point)
// @route   POST /api/v1/tickets/purchase
// @access  Private
const purchaseTicket = async (req, res, next) => {
  try {
    const { eventId, ticketType = "Regular", quantity = 1 } = req.body;
    const userId = req.user.id; 

    // Validate inputs
    if (!eventId) {
      return next(new ErrorResponse("Event ID is required", 400));
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1) {
      return next(new ErrorResponse("Quantity must be at least 1", 400));
    }

    if (parsedQuantity > 10) {
      return next(new ErrorResponse("Cannot purchase more than 10 tickets at once", 400));
    }

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Get event
    const event = await Event.findById(eventId);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Validate event is available for booking
    if (event.status !== "published") {
      return next(new ErrorResponse("Event is not available for booking", 400));
    }

    if (event.date < new Date()) {
      return next(new ErrorResponse("Cannot purchase tickets for past events", 400));
    }

    // Check if user already booked
    const existingBooking = event.attendees.find(
      (a) => a.user.toString() === userId && a.status === "confirmed"
    );

    if (existingBooking) {
      return next(new ErrorResponse("You have already booked this event", 400));
    }

    // Prepare user info for ticket
    const userInfo = {
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone || ""
    };

    // Use event's bookTicket method (which creates the Ticket document)
    const bookingResult = await event.bookTicket(userId, userInfo, ticketType, parsedQuantity);

    // Emit real-time update via Socket.IO
    if (global.io) {
      global.io.emit('new-ticket-purchase', {
        eventId: event._id,
        eventName: event.title,
        ticketId: bookingResult.ticketId,
        userName: userInfo.name,
        ticketType: ticketType,
        quantity: parsedQuantity,
        totalAmount: bookingResult.totalPrice,
        purchaseDate: new Date()
      });

      // Notify organizer
      global.io.to(`organizer-${event.organizer}`).emit('ticket-sold', {
        eventId: event._id,
        ticketId: bookingResult.ticketId,
        userName: userInfo.name,
        ticketType: ticketType,
        quantity: parsedQuantity,
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
    
    // Provide more specific error messages
    if (error.message.includes('available') || error.message.includes('capacity')) {
      return next(new ErrorResponse(error.message, 400));
    }
    
    if (error.message.includes('already booked')) {
      return next(new ErrorResponse(error.message, 400));
    }
    
    res.status(400).json({
      success: false,
      message: error.message || "Failed to purchase ticket"
    });
  }
};

// @desc    Purchase multiple tickets (different types)
// @route   POST /api/v1/tickets/purchase-multiple
// @access  Private
const purchaseMultipleTickets = async (req, res, next) => {
  try {
    const { eventId, ticketBookings } = req.body;
    const userId = req.user.id;

    // Validate inputs
    if (!eventId) {
      return next(new ErrorResponse("Event ID is required", 400));
    }

    if (!ticketBookings || !Array.isArray(ticketBookings) || ticketBookings.length === 0) {
      return next(new ErrorResponse("At least one ticket booking is required", 400));
    }

    // Validate each ticket booking
    let totalQuantity = 0;
    for (const booking of ticketBookings) {
      const { ticketType, quantity } = booking;
      
      if (!ticketType || !quantity) {
        return next(new ErrorResponse("Each booking must have ticketType and quantity", 400));
      }
      
      const parsedQuantity = parseInt(quantity);
      if (isNaN(parsedQuantity) || parsedQuantity < 1) {
        return next(new ErrorResponse(`Invalid quantity for ${ticketType} tickets`, 400));
      }
      
      if (parsedQuantity > 10) {
        return next(new ErrorResponse(`Cannot book more than 10 ${ticketType} tickets at once`, 400));
      }
      
      totalQuantity += parsedQuantity;
    }

    if (totalQuantity > 20) {
      return next(new ErrorResponse("Cannot purchase more than 20 tickets total in one transaction", 400));
    }

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Get event
    const event = await Event.findById(eventId);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Validate event is available for booking
    if (event.status !== "published") {
      return next(new ErrorResponse("Event is not available for booking", 400));
    }

    if (event.date < new Date()) {
      return next(new ErrorResponse("Cannot purchase tickets for past events", 400));
    }

    // Check if user already booked
    const existingBooking = event.attendees.find(
      (a) => a.user.toString() === userId && a.status === "confirmed"
    );

    if (existingBooking) {
      return next(new ErrorResponse("You have already booked this event", 400));
    }

    // Prepare user info
    const userInfo = {
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone || ""
    };

    // Use event's bookTickets method for multiple ticket types
    const bookingResult = await event.bookTickets(userId, userInfo, ticketBookings);

    // Emit real-time updates via Socket.IO
    if (global.io) {
      global.io.emit('new-ticket-purchase', {
        eventId: event._id,
        eventName: event.title,
        tickets: bookingResult.tickets,
        userName: userInfo.name,
        totalAmount: bookingResult.totalPrice,
        purchaseDate: new Date()
      });

      // Notify organizer
      global.io.to(`organizer-${event.organizer}`).emit('ticket-sold', {
        eventId: event._id,
        tickets: bookingResult.tickets,
        userName: userInfo.name,
        totalAmount: bookingResult.totalPrice
      });
    }

    res.status(201).json({
      success: true,
      message: "Tickets purchased successfully",
      data: bookingResult
    });

  } catch (error) {
    console.error("Multiple ticket purchase error:", error);
    
    if (error.message.includes('available') || error.message.includes('capacity')) {
      return next(new ErrorResponse(error.message, 400));
    }
    
    if (error.message.includes('already booked')) {
      return next(new ErrorResponse(error.message, 400));
    }
    
    res.status(400).json({
      success: false,
      message: error.message || "Failed to purchase tickets"
    });
  }
};

// @desc    Get user's tickets
// @route   GET /api/v1/tickets/my-tickets
// @access  Private
const getUserTickets = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10, sort = "eventDate" } = req.query;

    // Build query
    const query = { userId: userId };
    if (status && status !== 'all') {
      query.status = status;
    }

    // Parse pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort options
    let sortOption = {};
    switch (sort) {
      case "eventDate":
        sortOption = { eventDate: 1 };
        break;
      case "-eventDate":
        sortOption = { eventDate: -1 };
        break;
      case "purchaseDate":
        sortOption = { purchaseDate: -1 };
        break;
      case "ticketType":
        sortOption = { ticketType: 1 };
        break;
      default:
        sortOption = { eventDate: 1 };
    }

    // Execute query
    const tickets = await Ticket.find(query)
      .populate('eventId', 'title date time venue city images status organizer')
      .populate('organizerId', 'firstName lastName companyName profilePicture')
      .sort(sortOption)
      .limit(limitNum)
      .skip(skip);

    // Get total count
    const total = await Ticket.countDocuments(query);

    // Format response
    const formattedTickets = tickets.map(ticket => ({
      _id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      qrCode: ticket.qrCode,
      event: {
        _id: ticket.eventId._id,
        title: ticket.eventId.title,
        date: ticket.eventId.date,
        time: ticket.eventId.time,
        venue: ticket.eventId.venue,
        city: ticket.eventId.city,
        images: ticket.eventId.images,
        status: ticket.eventId.status,
        organizer: ticket.organizerId
      },
      ticketType: ticket.ticketType,
      quantity: ticket.quantity,
      totalAmount: ticket.totalAmount,
      status: ticket.status,
      isCheckedIn: ticket.isCheckedIn,
      checkedInAt: ticket.checkedInAt,
      purchaseDate: ticket.purchaseDate,
      eventDate: ticket.eventDate,
      isActive: ticket.isActive,
      isExpired: ticket.isExpired,
      daysUntilEvent: ticket.daysUntilEvent,
      validationStatus: ticket.validationStatus
    }));

    res.status(200).json({
      success: true,
      data: {
        tickets: formattedTickets,
        totalPages: Math.ceil(total / limitNum),
        currentPage: pageNum,
        totalTickets: total
      }
    });

  } catch (error) {
    console.error("Get user tickets error:", error);
    next(new ErrorResponse("Failed to fetch tickets", 500));
  }
};

// @desc    Get ticket by ID (for validation/display)
// @route   GET /api/v1/tickets/:ticketId
// @access  Private
const getTicketById = async (req, res, next) => {
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
    .populate('eventId', 'title date time venue address city coordinates liveLocation organizer')
    .populate('organizerId', 'firstName lastName email phone companyName profilePicture')
    .populate('validatedBy', 'firstName lastName email');

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found or access denied", 404));
    }

    // Format response
    const formattedTicket = {
      _id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      qrCode: ticket.qrCode,
      barcode: ticket.barcode,
      event: {
        _id: ticket.eventId._id,
        title: ticket.eventId.title,
        date: ticket.eventId.date,
        time: ticket.eventId.time,
        endTime: ticket.eventId.endTime,
        venue: ticket.eventId.venue,
        address: ticket.eventId.address,
        city: ticket.eventId.city,
        coordinates: ticket.eventId.coordinates,
        liveLocation: ticket.eventId.liveLocation,
        organizer: ticket.organizerId
      },
      user: {
        _id: ticket.userId,
        name: ticket.userName,
        email: ticket.userEmail,
        phone: ticket.userPhone
      },
      ticketType: ticket.ticketType,
      ticketPrice: ticket.ticketPrice,
      currency: ticket.currency,
      quantity: ticket.quantity,
      totalAmount: ticket.totalAmount,
      status: ticket.status,
      isCheckedIn: ticket.isCheckedIn,
      checkedInAt: ticket.checkedInAt,
      validatedBy: ticket.validatedBy,
      validationLocation: ticket.validationLocation,
      purchaseDate: ticket.purchaseDate,
      paymentMethod: ticket.paymentMethod,
      paymentStatus: ticket.paymentStatus,
      accessLevel: ticket.accessLevel,
      allowedAreas: ticket.allowedAreas,
      benefits: ticket.benefits,
      isTransferable: ticket.isTransferable,
      refundStatus: ticket.refundStatus,
      refundAmount: ticket.refundAmount,
      refundPolicy: ticket.refundPolicy,
      specialRequirements: ticket.specialRequirements,
      guestList: ticket.guestList,
      isActive: ticket.isActive,
      isExpired: ticket.isExpired,
      daysUntilEvent: ticket.daysUntilEvent,
      validationStatus: ticket.validationStatus,
      canBeTransferred: ticket.canBeTransferred,
      locationHistory: ticket.locationHistory
    };

    // Increment views if user is ticket owner
    if (ticket.userId.toString() === userId) {
      await ticket.incrementViews();
    }

    res.status(200).json({
      success: true,
      data: formattedTicket
    });

  } catch (error) {
    console.error("Get ticket error:", error);
    next(new ErrorResponse("Failed to fetch ticket", 500));
  }
};

// @desc    Validate ticket (for organizers)
// @route   POST /api/v1/tickets/:ticketId/validate
// @access  Private
const validateTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const validatorId = req.user.id;
    const { latitude, longitude, address, accuracy } = req.body;

    const ticket = await Ticket.findById(ticketId)
      .populate('eventId', 'organizer title date');

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is event organizer
    if (ticket.eventId.organizer.toString() !== validatorId.toString()) {
      return next(new ErrorResponse("Only event organizer can validate tickets", 403));
    }

    // Check if event is still valid
    if (ticket.eventId.date < new Date()) {
      return next(new ErrorResponse("Cannot validate tickets for past events", 400));
    }

    // Check if ticket is already used
    if (ticket.status === "used") {
      return next(new ErrorResponse("Ticket has already been used", 400));
    }

    if (ticket.isCheckedIn) {
      return next(new ErrorResponse("Ticket is already checked in", 400));
    }

    const locationData = latitude && longitude ? {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      address: address || '',
      accuracy: accuracy || 50
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
        ticketType: ticket.ticketType,
        validatedAt: ticket.checkedInAt,
        validatedBy: validatorId
      });

      // Notify ticket owner
      global.io.to(`user-${ticket.userId}`).emit('ticket-checked-in', {
        ticketId: ticket._id,
        eventName: ticket.eventId.title,
        checkedInAt: ticket.checkedInAt
      });
    }

    res.status(200).json({
      success: true,
      message: "Ticket validated successfully",
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        userName: ticket.userName,
        ticketType: ticket.ticketType,
        validatedAt: ticket.checkedInAt,
        validationLocation: ticket.validationLocation
      }
    });

  } catch (error) {
    console.error("Ticket validation error:", error);
    
    if (error.message.includes('already') || error.message.includes('past event')) {
      return next(new ErrorResponse(error.message, 400));
    }
    
    res.status(400).json({
      success: false,
      message: error.message || "Failed to validate ticket"
    });
  }
};

// @desc    Cancel ticket
// @route   POST /api/v1/tickets/:ticketId/cancel
// @access  Private
const cancelTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    const ticket = await Ticket.findById(ticketId)
      .populate('eventId', 'organizer title date refundPolicy');

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner or event organizer
    if (ticket.userId.toString() !== userId.toString() && 
        ticket.eventId.organizer.toString() !== userId.toString()) {
      return next(new ErrorResponse("Not authorized to cancel this ticket", 403));
    }

    // Check if ticket can be cancelled
    if (ticket.status !== "confirmed") {
      return next(new ErrorResponse(`Cannot cancel ticket with status: ${ticket.status}`, 400));
    }

    if (ticket.isCheckedIn) {
      return next(new ErrorResponse("Cannot cancel checked-in ticket", 400));
    }

    if (ticket.eventId.date < new Date()) {
      return next(new ErrorResponse("Cannot cancel ticket for past event", 400));
    }

    // Use ticket's cancel method
    await ticket.cancelTicket(reason);

    // Update event statistics
    const event = await Event.findById(ticket.eventId._id);
    if (event) {
      // Find and update attendee record
      const attendeeIndex = event.attendees.findIndex(
        a => a.ticketId && a.ticketId.toString() === ticketId
      );
      
      if (attendeeIndex !== -1) {
        event.attendees[attendeeIndex].status = "cancelled";
        
        // Restore ticket availability
        if (event.ticketTypes && event.ticketTypes.length > 0) {
          const ticketTypeObj = event.ticketTypes.find(tt => tt.name === ticket.ticketType);
          if (ticketTypeObj) {
            ticketTypeObj.availableTickets += ticket.quantity;
          }
        } else {
          event.availableTickets += ticket.quantity;
        }
        
        // Update statistics
        event.totalAttendees = Math.max(0, event.totalAttendees - ticket.quantity);
        event.totalRevenue = Math.max(0, event.totalRevenue - ticket.totalAmount);
        
        await event.save();
      }
    }

    // Emit real-time cancellation
    if (global.io) {
      global.io.emit('ticket-cancelled', {
        ticketId: ticket._id,
        eventId: ticket.eventId._id,
        userName: ticket.userName,
        ticketType: ticket.ticketType,
        refundAmount: ticket.refundAmount,
        cancelledBy: userId
      });
    }

    res.status(200).json({
      success: true,
      message: "Ticket cancelled successfully",
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        refundAmount: ticket.refundAmount,
        refundStatus: ticket.refundStatus,
        status: ticket.status
      }
    });

  } catch (error) {
    console.error("Ticket cancellation error:", error);
    
    if (error.message.includes('Cannot cancel') || error.message.includes('checked-in')) {
      return next(new ErrorResponse(error.message, 400));
    }
    
    res.status(400).json({
      success: false,
      message: error.message || "Failed to cancel ticket"
    });
  }
};

// @desc    Transfer ticket to another user
// @route   POST /api/v1/tickets/:ticketId/transfer
// @access  Private
const transferTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;
    const { newUserId, newUserEmail } = req.body;

    if (!newUserId && !newUserEmail) {
      return next(new ErrorResponse("Either newUserId or newUserEmail is required", 400));
    }

    const ticket = await Ticket.findById(ticketId)
      .populate('eventId', 'date');

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner
    if (ticket.userId.toString() !== userId.toString()) {
      return next(new ErrorResponse("Only ticket owner can transfer ticket", 403));
    }

    // Find new user
    let newUser;
    if (newUserId) {
      newUser = await User.findById(newUserId);
    } else if (newUserEmail) {
      newUser = await User.findOne({ email: newUserEmail.toLowerCase() });
    }

    if (!newUser) {
      return next(new ErrorResponse("New user not found", 404));
    }

    // Check if transferring to same user
    if (newUser._id.toString() === userId.toString()) {
      return next(new ErrorResponse("Cannot transfer ticket to yourself", 400));
    }

    // Prepare new user info
    const newUserInfo = {
      name: `${newUser.firstName} ${newUser.lastName}`,
      email: newUser.email,
      phone: newUser.phone || ""
    };

    // Use ticket's transfer method
    await ticket.transferTicket(newUser._id, newUserInfo);

    // Emit real-time transfer notification
    if (global.io) {
      global.io.emit('ticket-transferred', {
        ticketId: ticket._id,
        eventId: ticket.eventId._id,
        fromUserId: userId,
        toUserId: newUser._id,
        toUserName: newUserInfo.name,
        transferDate: ticket.transferDate
      });

      // Notify new ticket owner
      global.io.to(`user-${newUser._id}`).emit('ticket-received', {
        ticketId: ticket._id,
        eventName: ticket.eventName,
        fromUserName: ticket.userName,
        transferDate: ticket.transferDate
      });
    }

    res.status(200).json({
      success: true,
      message: "Ticket transferred successfully",
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        newOwner: {
          userId: newUser._id,
          name: newUserInfo.name,
          email: newUserInfo.email
        },
        transferDate: ticket.transferDate
      }
    });

  } catch (error) {
    console.error("Ticket transfer error:", error);
    
    if (error.message.includes('cannot be transferred') || error.message.includes('yourself')) {
      return next(new ErrorResponse(error.message, 400));
    }
    
    res.status(400).json({
      success: false,
      message: error.message || "Failed to transfer ticket"
    });
  }
};

// @desc    Get event tickets (for organizers)
// @route   GET /api/v1/tickets/event/:eventId
// @access  Private
const getEventTickets = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.id;

    // Verify organizer owns the event
    const event = await Event.findOne({
      _id: eventId,
      organizer: organizerId
    });

    if (!event) {
      return next(new ErrorResponse("Not authorized to view tickets for this event", 403));
    }

    const { status, ticketType, page = 1, limit = 20, sort = "purchaseDate" } = req.query;

    // Build query
    const query = { eventId: eventId };
    if (status && status !== 'all') query.status = status;
    if (ticketType && ticketType !== 'all') query.ticketType = ticketType;

    // Parse pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort options
    let sortOption = {};
    switch (sort) {
      case "purchaseDate":
        sortOption = { purchaseDate: -1 };
        break;
      case "ticketType":
        sortOption = { ticketType: 1 };
        break;
      case "userName":
        sortOption = { userName: 1 };
        break;
      case "checkedInAt":
        sortOption = { checkedInAt: -1 };
        break;
      default:
        sortOption = { purchaseDate: -1 };
    }

    // Execute query
    const tickets = await Ticket.find(query)
      .populate('userId', 'firstName lastName email phone profilePicture')
      .sort(sortOption)
      .limit(limitNum)
      .skip(skip);

    // Get statistics
    const stats = await Ticket.getEventStats(eventId);

    // Format response
    const formattedTickets = tickets.map(ticket => ({
      _id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      qrCode: ticket.qrCode,
      user: ticket.userId ? {
        _id: ticket.userId._id,
        name: `${ticket.userId.firstName} ${ticket.userId.lastName}`,
        email: ticket.userId.email,
        phone: ticket.userId.phone,
        profilePicture: ticket.userId.profilePicture
      } : {
        name: ticket.userName,
        email: ticket.userEmail,
        phone: ticket.userPhone
      },
      ticketType: ticket.ticketType,
      quantity: ticket.quantity,
      totalAmount: ticket.totalAmount,
      status: ticket.status,
      isCheckedIn: ticket.isCheckedIn,
      checkedInAt: ticket.checkedInAt,
      purchaseDate: ticket.purchaseDate,
      validationStatus: ticket.validationStatus
    }));

    res.status(200).json({
      success: true,
      data: {
        tickets: formattedTickets,
        stats,
        totalPages: Math.ceil(stats.totalTickets / limitNum),
        currentPage: pageNum,
        totalTickets: stats.totalTickets
      }
    });

  } catch (error) {
    console.error("Get event tickets error:", error);
    next(new ErrorResponse("Failed to fetch event tickets", 500));
  }
};

// @desc    Get ticket analytics for organizer
// @route   GET /api/v1/tickets/analytics/event/:eventId
// @access  Private
const getTicketAnalytics = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.id;

    // Verify organizer owns the event
    const event = await Event.findOne({
      _id: eventId,
      organizer: organizerId
    });

    if (!event) {
      return next(new ErrorResponse("Not authorized to view analytics for this event", 403));
    }

    // Get detailed statistics
    const stats = await Ticket.getEventStats(eventId);

    // Get check-in timeline (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const checkInTimeline = await Ticket.aggregate([
      {
        $match: {
          eventId: event._id,
          isCheckedIn: true,
          checkedInAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$checkedInAt"
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get ticket sales by hour (for event day)
    const salesByHour = await Ticket.aggregate([
      {
        $match: {
          eventId: event._id,
          status: "confirmed"
        }
      },
      {
        $group: {
          _id: {
            $hour: "$purchaseDate"
          },
          count: { $sum: 1 },
          revenue: { $sum: "$totalAmount" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get popular ticket types
    const popularTicketTypes = await Ticket.aggregate([
      {
        $match: {
          eventId: event._id,
          status: "confirmed"
        }
      },
      {
        $group: {
          _id: "$ticketType",
          count: { $sum: "$quantity" },
          revenue: { $sum: "$totalAmount" },
          averagePrice: { $avg: "$ticketPrice" }
        }
      },
      {
        $sort: { revenue: -1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: stats,
        checkInTimeline,
        salesByHour,
        popularTicketTypes,
        event: {
          title: event.title,
          date: event.date,
          totalCapacity: event.totalCapacity,
          attendancePercentage: event.attendancePercentage
        }
      }
    });

  } catch (error) {
    console.error("Get ticket analytics error:", error);
    next(new ErrorResponse("Failed to fetch ticket analytics", 500));
  }
};

// @desc    Add location point to ticket (for live tracking)
// @route   POST /api/v1/tickets/:ticketId/location
// @access  Private
const addTicketLocation = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;
    const { latitude, longitude, address, accuracy, type = "live-tracking" } = req.body;

    if (!latitude || !longitude) {
      return next(new ErrorResponse("Latitude and longitude are required", 400));
    }

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner
    if (ticket.userId.toString() !== userId.toString()) {
      return next(new ErrorResponse("Only ticket owner can add location", 403));
    }

    const locationData = {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      address: address || '',
      accuracy: accuracy || 50
    };

    // Use ticket's addLocationPoint method
    await ticket.addLocationPoint(locationData, type, "attendee");

    // Emit real-time location update (to organizer only)
    if (global.io) {
      global.io.to(`organizer-${ticket.organizerId}`).emit('attendee-location-update', {
        ticketId: ticket._id,
        userName: ticket.userName,
        location: locationData,
        timestamp: new Date(),
        type: type
      });
    }

    res.status(200).json({
      success: true,
      message: "Location added successfully",
      data: {
        ticketId: ticket._id,
        location: locationData,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error("Add ticket location error:", error);
    next(new ErrorResponse("Failed to add location", 500));
  }
};

// @desc    Get ticket location history
// @route   GET /api/v1/tickets/:ticketId/location-history
// @access  Private
const getTicketLocationHistory = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;
    const { limit = 20 } = req.query;

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner or event organizer
    if (ticket.userId.toString() !== userId.toString() && 
        ticket.organizerId.toString() !== userId.toString()) {
      return next(new ErrorResponse("Not authorized to view location history", 403));
    }

    const locationHistory = ticket.getRecentLocations(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        locationHistory,
        totalLocations: ticket.locationHistory.length
      }
    });

  } catch (error) {
    console.error("Get location history error:", error);
    next(new ErrorResponse("Failed to fetch location history", 500));
  }
};

// @desc    Download ticket as PDF
// @route   GET /api/v1/tickets/:ticketId/download
// @access  Private
const downloadTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;

    const ticket = await Ticket.findById(ticketId)
      .populate('eventId', 'title date time venue address city')
      .populate('organizerId', 'companyName');

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner
    if (ticket.userId.toString() !== userId.toString()) {
      return next(new ErrorResponse("Not authorized to download this ticket", 403));
    }

    // For now, return ticket data - in a real implementation, you'd generate a PDF
    // This is a placeholder for PDF generation logic
    const ticketData = {
      ticketNumber: ticket.ticketNumber,
      event: {
        title: ticket.eventId.title,
        date: ticket.eventId.date,
        time: ticket.eventId.time,
        venue: ticket.eventId.venue,
        address: ticket.eventId.address,
        city: ticket.eventId.city
      },
      user: {
        name: ticket.userName,
        email: ticket.userEmail
      },
      ticketType: ticket.ticketType,
      quantity: ticket.quantity,
      totalAmount: ticket.totalAmount,
      purchaseDate: ticket.purchaseDate,
      qrCode: ticket.qrCode
    };

    // In a real implementation, you would:
    // 1. Use a PDF generation library like pdfkit or puppeteer
    // 2. Generate a beautiful ticket layout
    // 3. Include QR code image
    // 4. Set proper headers for PDF download

    res.status(200).json({
      success: true,
      message: "PDF generation would happen here - returning ticket data for now",
      data: ticketData,
      downloadUrl: `/api/v1/tickets/${ticketId}/pdf` // Placeholder for actual PDF endpoint
    });

  } catch (error) {
    console.error("Download ticket error:", error);
    next(new ErrorResponse("Failed to download ticket", 500));
  }
};

// @desc    Resend ticket email
// @route   POST /api/v1/tickets/:ticketId/resend-email
// @access  Private
const resendTicketEmail = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;

    const ticket = await Ticket.findById(ticketId)
      .populate('eventId', 'title date time venue address');

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner or event organizer
    if (ticket.userId.toString() !== userId.toString() && 
        ticket.organizerId.toString() !== userId.toString()) {
      return next(new ErrorResponse("Not authorized to resend email for this ticket", 403));
    }

    // Format event date for email
    const eventDate = new Date(ticket.eventId.date).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Prepare ticket details for email
    const ticketDetails = `
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0;">${ticket.ticketType} x ${ticket.quantity}</td>
          <td style="padding: 5px 0; text-align: right;">₦${(ticket.totalAmount / ticket.quantity).toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; border-bottom: 1px solid #e0e0e0;">Subtotal</td>
          <td style="padding: 5px 0; text-align: right; border-bottom: 1px solid #e0e0e0;">₦${ticket.totalAmount.toLocaleString()}</td>
        </tr>
      </table>
    `;

    // Send booking confirmation email
    try {
      await sendBookingEmail({
        fullName: ticket.userName,
        email: ticket.userEmail,
        eventName: ticket.eventId.title,
        eventDate: eventDate,
        eventTime: ticket.eventId.time,
        eventVenue: ticket.eventId.venue,
        eventAddress: ticket.eventId.address,
        bookingId: ticket.ticketId.toString(),
        ticketDetails: ticketDetails,
        totalAmount: `₦${ticket.totalAmount.toLocaleString()}`,
        clientUrl: `${process.env.FRONTEND_URL}/tickets/${ticket._id}`,
        isResend: true
      });

      res.status(200).json({
        success: true,
        message: "Ticket email resent successfully",
        data: {
          sentTo: ticket.userEmail,
          sentAt: new Date()
        }
      });

    } catch (emailError) {
      console.error("Failed to resend ticket email:", emailError);
      return next(new ErrorResponse("Failed to resend ticket email", 500));
    }

  } catch (error) {
    console.error("Resend ticket email error:", error);
    next(new ErrorResponse("Failed to resend ticket email", 500));
  }
};

module.exports = {
  purchaseTicket,
  purchaseMultipleTickets,
  getUserTickets,
  getTicketById,
  validateTicket,
  cancelTicket,
  transferTicket,
  getEventTickets,
  getTicketAnalytics,
  addTicketLocation,
  getTicketLocationHistory,
  downloadTicket,
  resendTicketEmail
};