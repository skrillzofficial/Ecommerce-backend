const Ticket = require("../models/ticket");
const Event = require("../models/event");
const User = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");
const { sendTicketEmail } = require("../utils/sendEmail");
const PDFService = require("../service/pdfService");
const BannerService = require("../service/bannerService");
const axios = require("axios");

// @desc    Get current user's tickets
// @route   GET /api/v1/tickets/my-tickets
// @access  Private (Authenticated user)
const getUserTickets = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const {
      status,
      timeFilter = "all",
      page = 1,
      limit = 10,
      sort = "-purchaseDate",
    } = req.query;

    // Validate inputs
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

    // Build query
    const query = { userId: userId };

    // Filter by status
    if (status && status !== "all") {
      if (!["confirmed", "pending", "cancelled", "checked-in", "pending-approval"].includes(status)) {
        return next(new ErrorResponse("Invalid status filter", 400));
      }
      query.status = status;
    }

    // Time-based filtering
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (timeFilter === "upcoming") {
      query.eventDate = { $gte: now };
    } else if (timeFilter === "past") {
      query.eventDate = { $lt: now };
    } else if (timeFilter !== "all") {
      return next(new ErrorResponse("Invalid time filter", 400));
    }

    const skip = (pageNum - 1) * limitNum;

    // Find tickets
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate("userId", "firstName lastName email phone profilePicture")
        .populate("organizerId", "firstName lastName email companyName profilePicture")
        .populate("checkedInBy", "firstName lastName")
        .sort(sort)
        .limit(limitNum)
        .skip(skip)
        .lean(),
      Ticket.countDocuments(query),
    ]);

    // Get statistics
    const [statusStats, timeStats, totalSpent] = await Promise.all([
      Ticket.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Ticket.aggregate([
        { $match: { userId: userId } },
        {
          $group: {
            _id: null,
            upcoming: { $sum: { $cond: [{ $gte: ["$eventDate", now] }, 1, 0] } },
            past: { $sum: { $cond: [{ $lt: ["$eventDate", now] }, 1, 0] } },
          },
        },
      ]),
      Ticket.aggregate([
        {
          $match: {
            userId: userId,
            status: { $in: ["confirmed", "checked-in"] },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
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
        "pending-approval": 0 
      },
      upcoming: 0,
      past: 0,
      totalSpent: 0,
    };

    statusStats.forEach((stat) => {
      if (statistics.byStatus.hasOwnProperty(stat._id)) {
        statistics.byStatus[stat._id] = stat.count;
      }
    });

    if (timeStats.length > 0) {
      statistics.upcoming = timeStats[0].upcoming || 0;
      statistics.past = timeStats[0].past || 0;
    }

    if (totalSpent.length > 0) {
      statistics.totalSpent = totalSpent[0].total || 0;
    }

    res.status(200).json({
      success: true,
      data: {
        tickets,
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

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorResponse("Invalid ticket ID format", 400));
    }

    const ticket = await Ticket.findOne({
      _id: id,
      $or: [{ userId: userId }, { organizerId: userId }],
    })
      .populate("eventId", "title startDate endDate time venue address city state eventType virtualEventLink images")
      .populate("organizerId", "firstName lastName email phone companyName profilePicture")
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

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorResponse("Invalid ticket ID format", 400));
    }

    const ticket = await Ticket.findById(id).populate("eventId", "organizer title startDate");

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check organizer ownership correctly
    if (ticket.eventId.organizer.toString() !== validatorId.toString()) {
      return next(new ErrorResponse("Only event organizer can validate tickets", 403));
    }

    if (new Date(ticket.eventDate) < new Date()) {
      return next(new ErrorResponse("Cannot validate tickets for past events", 400));
    }

    if (ticket.status === "checked-in") {
      return next(new ErrorResponse("Ticket has already been checked in", 400));
    }

    if (ticket.status !== "confirmed") {
      return next(new ErrorResponse(`Cannot check in ticket with status: ${ticket.status}`, 400));
    }

    const locationData = latitude && longitude ? {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      address: address || "",
      accuracy: accuracy || 50,
    } : null;

    // Use manual check-in if method doesn't exist
    if (typeof ticket.checkIn === 'function') {
      await ticket.checkIn(validatorId, locationData);
    } else {
      // Manual check-in
      ticket.status = "checked-in";
      ticket.checkedInAt = new Date();
      ticket.checkedInBy = validatorId;
      ticket.checkInLocation = locationData;
      await ticket.save();
    }

    // Emit real-time validation
    if (global.io) {
      global.io.emit("ticket-validated", {
        ticketId: ticket._id,
        eventId: ticket.eventId._id,
        userName: ticket.userName,
        ticketType: ticket.ticketType,
        validatedAt: ticket.checkedInAt,
      });

      global.io.to(`user-${ticket.userId}`).emit("ticket-checked-in", {
        ticketId: ticket._id,
        eventName: ticket.eventName,
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

    if (!eventId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorResponse("Invalid event ID format", 400));
    }

    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) {
      return next(new ErrorResponse("Not authorized to view tickets for this event", 403));
    }

    const { status, ticketType, page = 1, limit = 20, sort = "-purchaseDate" } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const query = { eventId: eventId };
    if (status && status !== "all") {
      if (!["confirmed", "pending", "cancelled", "checked-in", "pending-approval"].includes(status)) {
        return next(new ErrorResponse("Invalid status filter", 400));
      }
      query.status = status;
    }
    if (ticketType && ticketType !== "all") query.ticketType = ticketType;

    const skip = (pageNum - 1) * limitNum;

    // Handle missing getEventStats method
    let stats = {};
    try {
      if (typeof Ticket.getEventStats === 'function') {
        stats = await Ticket.getEventStats(eventId);
      } else {
        // Fallback stats calculation
        const ticketStats = await Ticket.aggregate([
          { $match: { eventId: event._id } },
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        
        const totalTickets = await Ticket.countDocuments({ eventId: eventId });
        const totalRevenue = await Ticket.aggregate([
          { $match: { eventId: event._id, status: "confirmed" } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } }
        ]);

        stats = {
          total: totalTickets,
          confirmed: ticketStats.find(s => s._id === 'confirmed')?.count || 0,
          pending: ticketStats.find(s => s._id === 'pending')?.count || 0,
          cancelled: ticketStats.find(s => s._id === 'cancelled')?.count || 0,
          checkedIn: ticketStats.find(s => s._id === 'checked-in')?.count || 0,
          pendingApproval: ticketStats.find(s => s._id === 'pending-approval')?.count || 0,
          totalRevenue: totalRevenue[0]?.total || 0,
        };
      }
    } catch (statsError) {
      console.warn('Could not load ticket stats:', statsError);
      stats = { 
        total: 0, 
        confirmed: 0, 
        pending: 0, 
        cancelled: 0, 
        checkedIn: 0, 
        pendingApproval: 0,
        totalRevenue: 0 
      };
    }

    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate("userId", "firstName lastName email phone profilePicture")
        .sort(sort)
        .limit(limitNum)
        .skip(skip),
      Ticket.countDocuments(query),
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

    if (!eventId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorResponse("Invalid event ID format", 400));
    }

    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) {
      return next(new ErrorResponse("Not authorized to view analytics for this event", 403));
    }

    // Handle missing getEventStats method
    let stats = {};
    try {
      if (typeof Ticket.getEventStats === 'function') {
        stats = await Ticket.getEventStats(eventId);
      } else {
        // Fallback basic stats
        const ticketCounts = await Ticket.aggregate([
          { $match: { eventId: event._id } },
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        const revenueStats = await Ticket.aggregate([
          { $match: { eventId: event._id, status: "confirmed" } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } }
        ]);

        stats = {
          total: await Ticket.countDocuments({ eventId: eventId }),
          confirmed: ticketCounts.find(t => t._id === 'confirmed')?.count || 0,
          pending: ticketCounts.find(t => t._id === 'pending')?.count || 0,
          cancelled: ticketCounts.find(t => t._id === 'cancelled')?.count || 0,
          checkedIn: ticketCounts.find(t => t._id === 'checked-in')?.count || 0,
          pendingApproval: ticketCounts.find(t => t._id === 'pending-approval')?.count || 0,
          totalRevenue: revenueStats[0]?.total || 0,
        };
      }
    } catch (statsError) {
      console.warn('Could not load event stats:', statsError);
      stats = { 
        total: 0, 
        confirmed: 0, 
        pending: 0, 
        cancelled: 0, 
        checkedIn: 0, 
        pendingApproval: 0,
        totalRevenue: 0 
      };
    }

    // Get check-in timeline
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
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$checkedInAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
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
      { $sort: { revenue: -1 } },
    ]);

    // Get daily sales trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesTimeline = await Ticket.aggregate([
      {
        $match: {
          eventId: event._id,
          status: "confirmed",
          purchaseDate: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$purchaseDate" } },
          sales: { $sum: "$quantity" },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: stats,
        checkInTimeline,
        salesByType,
        salesTimeline,
        event: {
          title: event.title,
          startDate: event.startDate,
          totalCapacity: event.capacity,
          availableTickets: event.availableTickets,
          totalRevenue: event.totalRevenue || 0,
          totalBookings: event.totalBookings || 0,
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

    // Validate ticket ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorResponse("Invalid ticket ID format", 400));
    }

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
    console.error("PDF generation error:", error);
    next(new ErrorResponse("Failed to generate ticket PDF", 500));
  }
};

// @desc    Resend ticket email
// @route   POST /api/v1/tickets/:id/resend-email
// @access  Private (Ticket owner or event organizer)
const resendTicketEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Validate ticket ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorResponse("Invalid ticket ID format", 400));
    }

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

    // Rate limiting check (basic implementation)
    const lastSent = ticket.lastEmailSent;
    if (lastSent && Date.now() - lastSent.getTime() < 5 * 60 * 1000) {
      return next(
        new ErrorResponse("Please wait 5 minutes before resending email", 429)
      );
    }

    // Format event date for email
    const eventDate = new Date(ticket.eventDate).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Send ticket email
    await sendTicketEmail({
      fullName: ticket.userName,
      email: ticket.userEmail,
      eventName: ticket.eventName,
      eventDate: eventDate,
      eventTime: ticket.eventTime,
      eventVenue: ticket.eventVenue,
      eventAddress: ticket.eventAddress,
      ticketNumber: ticket.ticketNumber,
      ticketType: ticket.ticketType,
      quantity: ticket.quantity,
      totalAmount: ticket.totalAmount,
      downloadUrl: `${process.env.FRONTEND_URL}/tickets/${ticket._id}/download`,
      isResend: true,
    });

    // Update last email sent timestamp
    ticket.lastEmailSent = new Date();
    await ticket.save();

    res.status(200).json({
      success: true,
      message: "Ticket email resent successfully",
      data: {
        sentTo: ticket.userEmail,
        sentAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Email resend error:", error);
    next(new ErrorResponse("Failed to resend ticket email", 500));
  }
};

// @desc    Upload user photo for shareable banner
// @route   POST /api/v1/tickets/:id/user-photo
// @access  Private (Ticket owner only)
const uploadUserPhoto = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ticket ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorResponse("Invalid ticket ID format", 400));
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user owns the ticket
    if (ticket.userId.toString() !== req.user.userId) {
      return next(
        new ErrorResponse("Not authorized to update this ticket", 403)
      );
    }

    const event = await Event.findById(ticket.eventId);
    if (!event?.shareableBanner?.enabled) {
      return next(
        new ErrorResponse("Shareable banner not enabled for this event", 400)
      );
    }

    if (!req.files || !req.files.photo) {
      return next(new ErrorResponse("Please upload a photo", 400));
    }

    const photoFile = req.files.photo;

    // Validate photo
    if (!photoFile.mimetype.startsWith("image/")) {
      return next(new ErrorResponse("Please upload an image file", 400));
    }

    // Check allowed image types
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(photoFile.mimetype)) {
      return next(new ErrorResponse("Only JPEG, PNG and WebP images are allowed", 400));
    }

    if (photoFile.size > 5 * 1024 * 1024) {
      return next(new ErrorResponse("Photo size must be less than 5MB", 400));
    }

    // Upload user photo with error handling
    let uploadResult;
    try {
      const photoBuffer = photoFile.data;
      uploadResult = await BannerService.uploadUserPhoto(
        photoBuffer,
        req.user.userId,
        ticket.eventId
      );
    } catch (uploadError) {
      console.error("Banner service upload error:", uploadError);
      return next(new ErrorResponse("Failed to upload user photo", 500));
    }

    // Update ticket with user photo
    ticket.shareableBanner = ticket.shareableBanner || {};
    ticket.shareableBanner.userPhoto = uploadResult;
    await ticket.save();

    // Generate banner with user photo
    let bannerResult;
    try {
      const photoBuffer = photoFile.data;
      bannerResult = await BannerService.generateShareableBanner(
        ticket,
        photoBuffer
      );
    } catch (bannerError) {
      console.error("Banner generation error:", bannerError);
      return next(new ErrorResponse("Failed to generate banner", 500));
    }

    ticket.shareableBanner.generatedBanner = {
      url: bannerResult.url,
      publicId: bannerResult.publicId,
    };
    ticket.shareableBanner.generatedAt = new Date();
    ticket.shareableBanner.designSnapshot = bannerResult.designSnapshot;

    await ticket.save();

    res.status(200).json({
      success: true,
      message: "User photo uploaded and banner generated successfully",
      bannerUrl: bannerResult.url,
    });
  } catch (error) {
    console.error("Photo upload error:", error);
    next(new ErrorResponse("Failed to upload user photo", 500));
  }
};

// @desc    Generate shareable banner for ticket
// @route   POST /api/v1/tickets/:id/generate-banner
// @access  Private (Ticket owner only)
const generateShareableBanner = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ticket ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorResponse("Invalid ticket ID format", 400));
    }

    const ticket = await Ticket.findById(id).populate("eventId");
    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user owns the ticket
    if (ticket.userId.toString() !== req.user.userId) {
      return next(
        new ErrorResponse(
          "Not authorized to generate banner for this ticket",
          403
        )
      );
    }

    if (!ticket.eventId?.shareableBanner?.enabled) {
      return next(
        new ErrorResponse("Shareable banner not enabled for this event", 400)
      );
    }

    let userPhotoBuffer = null;

    // If user has uploaded a photo, use it
    if (ticket.shareableBanner?.userPhoto?.url) {
      try {
        const photoResponse = await axios({
          method: "GET",
          url: ticket.shareableBanner.userPhoto.url,
          responseType: "arraybuffer",
          timeout: 10000, // 10 second timeout
        });
        userPhotoBuffer = photoResponse.data;
      } catch (axiosError) {
        console.warn("Failed to fetch user photo, proceeding without it:", axiosError);
        // Continue without user photo - not a critical error
      }
    }

    // Generate banner with error handling
    let bannerResult;
    try {
      bannerResult = await BannerService.generateShareableBanner(
        ticket,
        userPhotoBuffer
      );
    } catch (bannerError) {
      console.error("Banner generation error:", bannerError);
      return next(new ErrorResponse("Failed to generate shareable banner", 500));
    }

    // Update ticket with generated banner
    ticket.shareableBanner = ticket.shareableBanner || {};
    ticket.shareableBanner.generatedBanner = {
      url: bannerResult.url,
      publicId: bannerResult.publicId,
    };
    ticket.shareableBanner.generatedAt = new Date();
    ticket.shareableBanner.designSnapshot = bannerResult.designSnapshot;

    await ticket.save();

    res.status(200).json({
      success: true,
      message: "Shareable banner generated successfully",
      bannerUrl: bannerResult.url,
    });
  } catch (error) {
    console.error("Banner generation error:", error);
    next(new ErrorResponse("Failed to generate shareable banner", 500));
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
  uploadUserPhoto,
  generateShareableBanner,
};