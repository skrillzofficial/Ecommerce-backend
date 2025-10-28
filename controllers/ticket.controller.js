const Ticket = require("../models/ticket");
const Event = require("../models/event");
const User = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");
const { sendTicketEmail } = require("../utils/sendEmail");
const PDFService = require("../service/pdfService");

// @desc    Get single ticket details
// @route   GET /api/v1/tickets/:id
// @access  Private (Ticket owner or event organizer)
const getTicketById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const ticket = await Ticket.findOne({
      _id: id,
      $or: [
        { userId: userId }, // Ticket owner
        { organizerId: userId } // Event organizer
      ]
    })
    .populate('eventId', 'title startDate endDate time venue address city state eventType virtualEventLink images')
    .populate('organizerId', 'firstName lastName email phone companyName profilePicture')
    .populate('checkedInBy', 'firstName lastName');

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found or access denied", 404));
    }

    res.status(200).json({
      success: true,
      data: { ticket }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Validate ticket (check-in attendee)
// @route   POST /api/v1/tickets/:id/validate
// @access  Private (Event organizer only)
const validateTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatorId = req.user.userId;
    const { latitude, longitude, address, accuracy } = req.body;

    const ticket = await Ticket.findById(id)
      .populate('eventId', 'organizer title startDate');

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is event organizer
    if (ticket.eventId.organizer.toString() !== validatorId.toString()) {
      return next(new ErrorResponse("Only event organizer can validate tickets", 403));
    }

    // Check if event is still valid
    if (new Date(ticket.eventId.startDate) < new Date()) {
      return next(new ErrorResponse("Cannot validate tickets for past events", 400));
    }

    // Check if ticket is already used
    if (ticket.status === "checked-in") {
      return next(new ErrorResponse("Ticket has already been checked in", 400));
    }

    if (ticket.status !== "confirmed") {
      return next(new ErrorResponse(`Cannot check in ticket with status: ${ticket.status}`, 400));
    }

    const locationData = latitude && longitude ? {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      address: address || '',
      accuracy: accuracy || 50
    } : null;

    // Check in the ticket
    await ticket.checkIn(validatorId, locationData);

    // Emit real-time validation
    if (global.io) {
      global.io.emit('ticket-validated', {
        ticketId: ticket._id,
        eventId: ticket.eventId._id,
        userName: ticket.userName,
        ticketType: ticket.ticketType,
        validatedAt: ticket.checkedInAt
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
        validationLocation: ticket.checkInLocation
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get all tickets for an event (organizer view)
// @route   GET /api/v1/tickets/event/:eventId
// @access  Private (Event organizer only)
const getEventTickets = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.userId;

    // Verify organizer owns the event
    const event = await Event.findOne({
      _id: eventId,
      organizer: organizerId
    });

    if (!event) {
      return next(new ErrorResponse("Not authorized to view tickets for this event", 403));
    }

    const { status, ticketType, page = 1, limit = 20, sort = "-purchaseDate" } = req.query;

    // Build query with pagination
    const query = { eventId: eventId };
    if (status && status !== 'all') query.status = status;
    if (ticketType && ticketType !== 'all') query.ticketType = ticketType;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [tickets, total, stats] = await Promise.all([
      Ticket.find(query)
        .populate('userId', 'firstName lastName email phone profilePicture')
        .sort(sort)
        .limit(limitNum)
        .skip(skip),
      Ticket.countDocuments(query),
      Ticket.getEventStats(eventId)
    ]);

    res.status(200).json({
      success: true,
      data: {
        tickets,
        pagination: {
          total,
          page: pageNum,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1
        },
        statistics: stats
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get ticket analytics for event
// @route   GET /api/v1/tickets/analytics/event/:eventId
// @access  Private (Event organizer only)
const getTicketAnalytics = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.userId;

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
          status: "checked-in",
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

    // Get ticket sales by type
    const salesByType = await Ticket.aggregate([
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
        salesByType,
        event: {
          title: event.title,
          startDate: event.startDate,
          totalCapacity: event.capacity,
          availableTickets: event.availableTickets
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Download ticket as PDF
// @route   GET /api/v1/tickets/:id/download
// @access  Private (Ticket owner only)
const downloadTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const ticket = await Ticket.findById(id)
      .populate('eventId', 'title startDate time venue address city state images')
      .populate('organizerId', 'companyName');

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner
    if (ticket.userId.toString() !== userId.toString()) {
      return next(new ErrorResponse("Not authorized to download this ticket", 403));
    }

    // Generate PDF
    const pdfBuffer = await PDFService.generateTicketPDF(ticket);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ticket-${ticket.ticketNumber}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF
    res.send(pdfBuffer);

  } catch (error) {
    next(error);
  }
};

// @desc    Resend ticket email
// @route   POST /api/v1/tickets/:id/resend-email
// @access  Private (Ticket owner or event organizer)
const resendTicketEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const ticket = await Ticket.findById(id)
      .populate('eventId', 'title startDate time venue address');

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner or event organizer
    if (ticket.userId.toString() !== userId.toString() && 
        ticket.organizerId.toString() !== userId.toString()) {
      return next(new ErrorResponse("Not authorized to resend email for this ticket", 403));
    }

    // Format event date for email
    const eventDate = new Date(ticket.eventId.startDate).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Send ticket email
    await sendTicketEmail({
      fullName: ticket.userName,
      email: ticket.userEmail,
      eventName: ticket.eventId.title,
      eventDate: eventDate,
      eventTime: ticket.eventId.time,
      eventVenue: ticket.eventId.venue,
      eventAddress: ticket.eventId.address,
      ticketNumber: ticket.ticketNumber,
      ticketType: ticket.ticketType,
      quantity: ticket.quantity,
      totalAmount: ticket.totalAmount,
      downloadUrl: `${process.env.FRONTEND_URL}/tickets/${ticket._id}/download`,
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

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTicketById,
  validateTicket,
  getEventTickets,
  getTicketAnalytics,
  downloadTicket,
  resendTicketEmail
};