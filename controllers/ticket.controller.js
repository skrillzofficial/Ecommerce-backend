const Ticket = require("../models/ticket");
const Event = require("../models/event");
const User = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");
const { sendTicketEmail } = require("../utils/sendEmail");
const PDFService = require("../service/pdfService");

// @desc    Get current user's tickets
// @route   GET /api/v1/tickets/my-tickets
// @access  Private (Authenticated user)
const getUserTickets = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const {
      status,
      timeFilter = "all", // upcoming, past, all
      page = 1,
      limit = 10,
      sort = "-purchaseDate",
    } = req.query;

    // Build query
    const query = { userId: userId };

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Time-based filtering for event dates (works with direct field)
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today

    if (timeFilter === "upcoming") {
      query.eventDate = { $gte: now };
    } else if (timeFilter === "past") {
      query.eventDate = { $lt: now };
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Find tickets - try to populate eventId reference if it exists
    // If eventId is just an ObjectId reference, it will be populated
    // If event details are stored directly, population does nothing (graceful fallback)
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate({
          path: "eventId",
          select:
            "title startDate endDate time venue address city state country eventType virtualEventLink images capacity organizer",
          // This populate will work if eventId is a reference, otherwise it's ignored
        })
        .populate("userId", "firstName lastName email phone profilePicture")
        .populate(
          "organizerId",
          "firstName lastName email companyName profilePicture"
        )
        .populate("checkedInBy", "firstName lastName")
        .sort(sort)
        .limit(limitNum)
        .skip(skip)
        .lean(), // Use lean() for better performance and easier manipulation
      Ticket.countDocuments(query),
    ]);

    // Transform tickets to ensure consistent structure for frontend
    // This handles BOTH cases: direct fields AND populated references
    const transformedTickets = tickets.map((ticket) => {
      // Check if eventId is populated as an object or if we have direct fields
      const hasPopulatedEvent =
        ticket.eventId &&
        typeof ticket.eventId === "object" &&
        ticket.eventId.title;
      const hasDirectFields = ticket.eventName;

      if (hasPopulatedEvent) {
        // Case 1: Event is populated - merge both structures
        return {
          ...ticket,
          // Keep direct fields if they exist
          eventName: ticket.eventName || ticket.eventId.title,
          eventDate: ticket.eventDate || ticket.eventId.startDate,
          eventTime: ticket.eventTime || ticket.eventId.time,
          eventEndTime: ticket.eventEndTime || ticket.eventId.endTime,
          eventVenue: ticket.eventVenue || ticket.eventId.venue,
          eventAddress: ticket.eventAddress || ticket.eventId.address,
          eventCity: ticket.eventCity || ticket.eventId.city,
          eventState: ticket.eventState || ticket.eventId.state,
          eventCountry: ticket.eventCountry || ticket.eventId.country,
          eventCategory: ticket.eventCategory || ticket.eventId.eventType,
          eventVirtualLink:
            ticket.eventVirtualLink || ticket.eventId.virtualEventLink,
          eventImages: ticket.eventImages || ticket.eventId.images,
          // Keep the populated eventId for reference
          eventId: ticket.eventId._id || ticket.eventId,
          eventData: ticket.eventId, // Store full event data for frontend access
        };
      } else if (hasDirectFields) {
        // Case 2: Direct fields exist - already in correct format
        return ticket;
      } else {
        // Case 3: Neither format - return as is (shouldn't happen)
        return ticket;
      }
    });

    // Get statistics for user's tickets
    const [statusStats, timeStats, totalSpent] = await Promise.all([
      // Count by status
      Ticket.aggregate([
        { $match: { userId: userId } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      // Count upcoming vs past (works with direct eventDate field)
      Ticket.aggregate([
        { $match: { userId: userId } },
        {
          $group: {
            _id: null,
            upcoming: {
              $sum: {
                $cond: [{ $gte: ["$eventDate", now] }, 1, 0],
              },
            },
            past: {
              $sum: {
                $cond: [{ $lt: ["$eventDate", now] }, 1, 0],
              },
            },
          },
        },
      ]),

      // Calculate total spent
      Ticket.aggregate([
        {
          $match: {
            userId: userId,
            status: { $in: ["confirmed", "checked-in"] },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$totalAmount" },
          },
        },
      ]),
    ]);

    // Format statistics
    const statistics = {
      total: total,
      byStatus: {
        confirmed: 0,
        pending: 0,
        cancelled: 0,
        "checked-in": 0,
      },
      upcoming: 0,
      past: 0,
      totalSpent: 0,
    };

    // Populate status counts
    statusStats.forEach((stat) => {
      if (statistics.byStatus.hasOwnProperty(stat._id)) {
        statistics.byStatus[stat._id] = stat.count;
      }
    });

    // Populate time-based counts
    if (timeStats.length > 0) {
      statistics.upcoming = timeStats[0].upcoming || 0;
      statistics.past = timeStats[0].past || 0;
    }

    // Populate total spent
    if (totalSpent.length > 0) {
      statistics.totalSpent = totalSpent[0].total || 0;
    }

    res.status(200).json({
      success: true,
      data: {
        tickets: transformedTickets,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1,
        },
        statistics,
      },
    });
  } catch (error) {
    console.error("Error in getUserTickets:", error);
    next(error);
  }
};
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
        { organizerId: userId }, // Event organizer
      ],
    })
      .populate(
        "eventId",
        "title startDate endDate time venue address city state eventType virtualEventLink images"
      )
      .populate(
        "organizerId",
        "firstName lastName email phone companyName profilePicture"
      )
      .populate("checkedInBy", "firstName lastName");

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found or access denied", 404));
    }

    res.status(200).json({
      success: true,
      data: { ticket },
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

    const ticket = await Ticket.findById(id).populate(
      "eventId",
      "organizer title startDate"
    );

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is event organizer
    if (ticket.eventId.organizer.toString() !== validatorId.toString()) {
      return next(
        new ErrorResponse("Only event organizer can validate tickets", 403)
      );
    }

    // Check if event is still valid
    if (new Date(ticket.eventId.startDate) < new Date()) {
      return next(
        new ErrorResponse("Cannot validate tickets for past events", 400)
      );
    }

    // Check if ticket is already used
    if (ticket.status === "checked-in") {
      return next(new ErrorResponse("Ticket has already been checked in", 400));
    }

    if (ticket.status !== "confirmed") {
      return next(
        new ErrorResponse(
          `Cannot check in ticket with status: ${ticket.status}`,
          400
        )
      );
    }

    const locationData =
      latitude && longitude
        ? {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            address: address || "",
            accuracy: accuracy || 50,
          }
        : null;

    // Check in the ticket
    await ticket.checkIn(validatorId, locationData);

    // Emit real-time validation
    if (global.io) {
      global.io.emit("ticket-validated", {
        ticketId: ticket._id,
        eventId: ticket.eventId._id,
        userName: ticket.userName,
        ticketType: ticket.ticketType,
        validatedAt: ticket.checkedInAt,
      });

      // Notify ticket owner
      global.io.to(`user-${ticket.userId}`).emit("ticket-checked-in", {
        ticketId: ticket._id,
        eventName: ticket.eventId.title,
        checkedInAt: ticket.checkedInAt,
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
        validationLocation: ticket.checkInLocation,
      },
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
      organizer: organizerId,
    });

    if (!event) {
      return next(
        new ErrorResponse("Not authorized to view tickets for this event", 403)
      );
    }

    const {
      status,
      ticketType,
      page = 1,
      limit = 20,
      sort = "-purchaseDate",
    } = req.query;

    // Build query with pagination
    const query = { eventId: eventId };
    if (status && status !== "all") query.status = status;
    if (ticketType && ticketType !== "all") query.ticketType = ticketType;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [tickets, total, stats] = await Promise.all([
      Ticket.find(query)
        .populate("userId", "firstName lastName email phone profilePicture")
        .sort(sort)
        .limit(limitNum)
        .skip(skip),
      Ticket.countDocuments(query),
      Ticket.getEventStats(eventId),
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
          hasPrev: pageNum > 1,
        },
        statistics: stats,
      },
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
      organizer: organizerId,
    });

    if (!event) {
      return next(
        new ErrorResponse(
          "Not authorized to view analytics for this event",
          403
        )
      );
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
          checkedInAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$checkedInAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get ticket sales by type
    const salesByType = await Ticket.aggregate([
      {
        $match: {
          eventId: event._id,
          status: "confirmed",
        },
      },
      {
        $group: {
          _id: "$ticketType",
          count: { $sum: "$quantity" },
          revenue: { $sum: "$totalAmount" },
          averagePrice: { $avg: "$ticketPrice" },
        },
      },
      {
        $sort: { revenue: -1 },
      },
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
          availableTickets: event.availableTickets,
        },
      },
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
      .populate(
        "eventId",
        "title startDate time venue address city state images"
      )
      .populate("organizerId", "companyName");

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner
    if (ticket.userId.toString() !== userId.toString()) {
      return next(
        new ErrorResponse("Not authorized to download this ticket", 403)
      );
    }

    // Generate PDF
    const pdfBuffer = await PDFService.generateTicketPDF(ticket);

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=ticket-${ticket.ticketNumber}.pdf`
    );
    res.setHeader("Content-Length", pdfBuffer.length);

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

    const ticket = await Ticket.findById(id).populate(
      "eventId",
      "title startDate time venue address"
    );

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner or event organizer
    if (
      ticket.userId.toString() !== userId.toString() &&
      ticket.organizerId.toString() !== userId.toString()
    ) {
      return next(
        new ErrorResponse("Not authorized to resend email for this ticket", 403)
      );
    }

    // Format event date for email
    const eventDate = new Date(ticket.eventId.startDate).toLocaleDateString(
      "en-US",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );

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
      isResend: true,
    });

    res.status(200).json({
      success: true,
      message: "Ticket email resent successfully",
      data: {
        sentTo: ticket.userEmail,
        sentAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserTickets,
  getTicketById,
  validateTicket,
  getEventTickets,
  getTicketAnalytics,
  downloadTicket,
  resendTicketEmail,
};
