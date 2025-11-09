const Event = require("../models/event");
const User = require("../models/user");
const Ticket = require("../models/ticket");
const ErrorResponse = require("../utils/errorResponse");
const { parseVoiceQuery } = require("../utils/voiceSearchParser");
const NotificationService = require("../service/notificationService");
const {
  safeParseNumber,
  safeParseArray,
  processFormDataArrays,
  parseJSONFields,
  uploadImages,
  deleteImages,
  validateTicketTypes,
  buildEventSearchQuery,
  getSortOptions,
} = require("../utils/eventHelpers");
const {
  validateRequiredFields,
  validateEventOwnership,
  validateOrganizerRole,
} = require("../utils/validationHelpers");

// ==================== FIXED FLEXIBLE DATE HELPER ====================
// This helper builds queries that work with BOTH date and startDate fields
const buildFlexibleDateQuery = (operator, dateValue) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

  return {
    $or: [
      // Check startDate if it exists (prioritize startDate for new events)
      {
        startDate: { [operator]: date, $exists: true }
      },
      // Fallback to date field if startDate doesn't exist (old events)
      {
        date: { [operator]: date },
        startDate: { $exists: false }
      },
    ],
  };
};

// ==================== APPROVAL SYSTEM HELPERS ====================
const validateApprovalQuestions = (questions) => {
  if (!Array.isArray(questions)) {
    return { isValid: false, error: "Approval questions must be an array" };
  }

  for (const question of questions) {
    if (!question.question || typeof question.question !== "string") {
      return {
        isValid: false,
        error: "Each approval question must have a question text",
      };
    }
    if (question.question.length > 500) {
      return {
        isValid: false,
        error: "Approval question cannot exceed 500 characters",
      };
    }
    if (typeof question.required !== "boolean") {
      return {
        isValid: false,
        error: "Question required field must be boolean",
      };
    }
  }

  return { isValid: true };
};

const processTicketTypeApproval = (ticketType) => {
  // Set default approval requirement for free tickets
  if (ticketType.price === 0 && ticketType.requiresApproval === undefined) {
    ticketType.requiresApproval = true;
  }

  // Validate approval questions if approval is required
  if (ticketType.requiresApproval && ticketType.approvalQuestions) {
    const validation = validateApprovalQuestions(ticketType.approvalQuestions);
    if (!validation.isValid) {
      throw new ErrorResponse(validation.error, 400);
    }
  }

  // Ensure free tickets have isFree set correctly
  ticketType.isFree = ticketType.price === 0;

  return ticketType;
};

// @desc    Create new event
// @route   POST /api/v1/events
// @access  Private (Organizer only)
const createEvent = async (req, res, next) => {
  try {
    // Process form data
    const processedBody = processFormDataArrays(req.body);
    const parsedBody = parseJSONFields(processedBody, [
      "ticketTypes",
      "tags",
      "requirements",
    ]);

    const { title, description, startDate, category, eventType, ticketTypes } =
      parsedBody;

    // Basic validation
    if (!title || !description || !startDate || !category || !eventType) {
      return next(new ErrorResponse("Please fill in all required fields", 400));
    }

    // Upload images
    let uploadedImages = [];
    if (req.files && req.files.images) {
      const imageFiles = Array.isArray(req.files.images)
        ? req.files.images
        : [req.files.images];
      uploadedImages = await uploadImages(imageFiles);
    }

    // ✅ FIX: Ensure both date and startDate are set
    const eventStartDate = new Date(startDate);

    // Build event data
    const eventData = {
      ...parsedBody,
      startDate: eventStartDate,
      date: eventStartDate, // ✅ CRITICAL: Always set date to match startDate
      images: uploadedImages,
      image:
        uploadedImages.length > 0
          ? {
              url: uploadedImages[0].url,
              publicId: uploadedImages[0].publicId,
            }
          : null,
      organizer: req.user.userId,
      status: "published", // Events are now published immediately
      isActive: true,
    };

    // Create event
    const event = await Event.create(eventData);

    console.log("✅ Event created successfully:", {
      id: event._id,
      title: event.title,
      startDate: event.startDate,
      date: event.date,
    });

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: event,
    });
  } catch (error) {
    console.error("❌ Event creation error:", error);
    next(error);
  }
};

// @desc    Get all events with filtering and pagination
// @route   GET /api/v1/events/all
// @access  Public
const getAllEvents = async (req, res, next) => {
  try {
    let {
      search,
      isVoiceSearch,
      page = 1,
      limit = 12,
      sort = "date",
      timeFilter,
      debug = false,
      ...filters
    } = req.query;

    if (isVoiceSearch === "true" && search) {
      const voiceParams = parseVoiceQuery(search);
      Object.assign(filters, voiceParams);
      search = voiceParams.search || search;
    }

    // ✅ Build flexible query (supports both date and startDate)
    const query = buildEventSearchQuery({ ...filters, search }, req.user?.role);

    // ✅ CRITICAL FIX: Apply time filter SEPARATELY
    const now = new Date();
    if (timeFilter === "upcoming") {
      const upcomingQuery = buildFlexibleDateQuery("$gte", now);
      if (query.$and) {
        query.$and.push(upcomingQuery);
      } else if (query.$or) {
        query.$and = [{ $or: query.$or }, upcomingQuery];
        delete query.$or;
      } else {
        Object.assign(query, upcomingQuery);
      }
    } else if (timeFilter === "past") {
      const pastQuery = buildFlexibleDateQuery("$lt", now);
      if (query.$and) {
        query.$and.push(pastQuery);
      } else if (query.$or) {
        query.$and = [{ $or: query.$or }, pastQuery];
        delete query.$or;
      } else {
        Object.assign(query, pastQuery);
      }
    }

    if (debug === "true") {
      console.log("📍 Final Query:", JSON.stringify(query, null, 2));
      console.log("🔐 User authenticated:", !!req.user);
      console.log("📅 Current Date:", now.toISOString());
    }

    const sortOption = getSortOptions(sort);

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // ✅ Add debug queries if debug mode is enabled
    const debugPromises = debug === "true" ? [
      Event.countDocuments({ status: "published", isActive: true }),
      Event.countDocuments({ status: "published", isActive: false }),
      Event.countDocuments({ status: "cancelled" }),
      Event.countDocuments({ status: "draft" }),
      Event.countDocuments({}), // Total
    ] : [];

    const [events, total, ...debugCounts] = await Promise.all([
      Event.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .populate(
          "organizer",
          "firstName lastName userName profilePicture organizerInfo"
        ),
      Event.countDocuments(query),
      ...debugPromises,
    ]);

    console.log(`✅ Found ${events.length} events out of ${total} total`);

    const response = {
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      events,
    };

    if (isVoiceSearch === "true") {
      response.voiceSearchParams = {
        originalQuery: req.query.search,
        parsedFilters: filters,
      };
    }

    // ✅ Add debug info
    if (debug === "true" && debugCounts.length > 0) {
      response.debug = {
        statusBreakdown: {
          publishedActive: debugCounts[0],
          publishedInactive: debugCounts[1],
          cancelled: debugCounts[2],
          draft: debugCounts[3],
          total: debugCounts[4],
        },
        queryUsed: query,
        currentDate: now.toISOString(),
        timeFilter: timeFilter || "none",
      };
      console.log("📊 Debug Status Breakdown:", response.debug.statusBreakdown);
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("❌ getAllEvents Error:", error);
    next(error);
  }
};

// @desc    Get past events
// @route   GET /api/v1/events/past
// @access  Public
const getPastEvents = async (req, res, next) => {
  try {
    const { page = 1, limit = 12, sort = "-date", ...filters } = req.query;

    // ✅ Build base query WITHOUT date filter
    const baseQuery = buildEventSearchQuery(filters, req.user?.role);

    // ✅ Build flexible past date condition
    const now = new Date();
    const pastDateQuery = buildFlexibleDateQuery("$lt", now);

    // ✅ Combine queries properly
    let finalQuery = {
      status: "published",
      isActive: true,
      ...baseQuery,
    };

    // Handle combining with existing $or conditions
    if (baseQuery.$or) {
      finalQuery.$and = [{ $or: baseQuery.$or }, pastDateQuery];
      delete finalQuery.$or;
    } else {
      Object.assign(finalQuery, pastDateQuery);
    }

    console.log("📜 Past Events Query:", JSON.stringify(finalQuery, null, 2));

    const sortOption = getSortOptions(sort);
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      Event.find(finalQuery)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .populate(
          "organizer",
          "firstName lastName userName profilePicture organizerInfo"
        ),
      Event.countDocuments(finalQuery),
    ]);

    console.log(`✅ Found ${events.length} past events out of ${total} total`);

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      events,
    });
  } catch (error) {
    console.error("❌ getPastEvents Error:", error);
    next(error);
  }
};

// @desc    Get upcoming events
// @route   GET /api/v1/events/upcoming
// @access  Public
const getUpcomingEvents = async (req, res, next) => {
  try {
    const { limit = 10, category, city, state, eventType } = req.query;

    // ✅ Use flexible date query
    const now = new Date();
    const upcomingQuery = buildFlexibleDateQuery("$gte", now);
    
    const query = {
      status: "published",
      isActive: true,
      ...upcomingQuery,
    };

    if (category) query.category = category;
    if (city) query.city = new RegExp(city, "i");
    if (state) query.state = state;
    if (eventType) query.eventType = eventType;

    console.log("📅 Upcoming Events Query:", JSON.stringify(query, null, 2));

    const events = await Event.find(query)
      .sort({ startDate: 1, date: 1 })
      .limit(parseInt(limit))
      .populate(
        "organizer",
        "firstName lastName userName profilePicture organizerInfo"
      );

    console.log(`✅ Found ${events.length} upcoming events`);

    res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("❌ getUpcomingEvents Error:", error);
    next(error);
  }
};

// @desc    Get featured events
// @route   GET /api/v1/events/featured
// @access  Public
const getFeaturedEvents = async (req, res, next) => {
  try {
    const { limit = 6, timeFilter = "upcoming" } = req.query;

    const now = new Date();
    const query = {
      status: "published",
      isFeatured: true,
      isActive: true,
    };

    // ✅ Add time filter using flexible date query
    if (timeFilter === "upcoming") {
      Object.assign(query, buildFlexibleDateQuery("$gte", now));
    } else if (timeFilter === "past") {
      Object.assign(query, buildFlexibleDateQuery("$lt", now));
    }

    console.log("⭐ Featured Events Query:", JSON.stringify(query, null, 2));

    const events = await Event.find(query)
      .sort({ startDate: 1, date: 1 })
      .limit(parseInt(limit))
      .populate(
        "organizer",
        "firstName lastName userName profilePicture organizerInfo"
      );

    res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("❌ getFeaturedEvents Error:", error);
    next(error);
  }
};

// @desc    Get single event by ID or slug
// @route   GET /api/v1/events/:id
// @access  Public
const getEventById = async (req, res, next) => {
  try {
    const { id } = req.params;

    let event = await Event.findOne({
      $or: [{ _id: id }, { slug: id }],
    })
      .populate(
        "organizer",
        "firstName lastName userName email profilePicture organizerInfo socialLinks"
      )
      .populate("likes", "firstName lastName userName profilePicture");

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    if (event.status === "published") {
      await event.incrementViews();
    }

    res.status(200).json({
      success: true,
      event,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update event
// @route   PUT /api/v1/events/:id
// @access  Private (Organizer only - own events)
const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    let event = await Event.findById(id);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    validateEventOwnership(event, req.user.userId, req.user.role);

    const processedBody = processFormDataArrays(req.body);
    const parsedBody = parseJSONFields(processedBody, [
      "ticketTypes",
      "tags",
      "includes",
      "requirements",
      "existingImages",
      "imagesToDelete",
      "attendanceApproval",
    ]);

    if (req.files && req.files.images) {
      const imageFiles = Array.isArray(req.files.images)
        ? req.files.images
        : [req.files.images];

      if (event.images.length + imageFiles.length > 3) {
        return next(new ErrorResponse("Maximum 3 images allowed", 400));
      }

      const newImages = await uploadImages(imageFiles);
      event.images.push(...newImages);
    }

    if (parsedBody.imagesToDelete && Array.isArray(parsedBody.imagesToDelete)) {
      const publicIdsToDelete = [];

      event.images = event.images.filter((img) => {
        if (parsedBody.imagesToDelete.includes(img.publicId)) {
          publicIdsToDelete.push(img.publicId);
          return false;
        }
        return true;
      });

      if (publicIdsToDelete.length > 0) {
        await deleteImages(publicIdsToDelete);
      }
    }

    const allowedUpdates = [
      "title",
      "description",
      "longDescription",
      "category",
      "startDate",
      "endDate",
      "time",
      "endTime",
      "venue",
      "address",
      "state",
      "city",
      "eventType",
      "virtualEventLink",
      "price",
      "capacity",
      "tags",
      "includes",
      "requirements",
      "cancellationPolicy",
      "refundPolicy",
      "status",
      "isFeatured",
      "ticketTypes",
      "ticketDescription",
      "ticketBenefits",
      "attendanceApproval",
    ];

    allowedUpdates.forEach((field) => {
      if (parsedBody[field] !== undefined) {
        if (field === "startDate" || field === "endDate") {
          const dateValue = new Date(parsedBody[field]);
          event[field] = dateValue;
          // ✅ CRITICAL: Sync both date and startDate
          if (field === "startDate") {
            event.date = dateValue;
          }
        } else if (field === "price" || field === "capacity") {
          event[field] = safeParseNumber(
            parsedBody[field],
            field === "capacity" ? 1 : 0
          );
        } else if (
          field === "ticketTypes" &&
          Array.isArray(parsedBody[field])
        ) {
          event[field] = parsedBody[field].map((ticket) => {
            const processedTicket = {
              ...ticket,
              price: safeParseNumber(ticket.price, 0),
              capacity: safeParseNumber(ticket.capacity, 1),
              availableTickets: safeParseNumber(
                ticket.availableTickets,
                safeParseNumber(ticket.capacity, 1)
              ),
              isFree: safeParseNumber(ticket.price, 0) === 0,
            };

            if (ticket.requiresApproval !== undefined) {
              processedTicket.requiresApproval = ticket.requiresApproval;
            }

            if (
              ticket.approvalQuestions &&
              Array.isArray(ticket.approvalQuestions)
            ) {
              processedTicket.approvalQuestions = ticket.approvalQuestions.map(
                (q) => ({
                  question: q.question,
                  required: q.required || false,
                })
              );
            }

            return processTicketTypeApproval(processedTicket);
          });

          const hasApprovalRequired = event.ticketTypes.some(
            (ticket) => ticket.requiresApproval
          );
          if (hasApprovalRequired && !event.attendanceApproval?.enabled) {
            event.attendanceApproval = {
              enabled: true,
              autoApprove: parsedBody.attendanceApproval?.autoApprove || false,
              approvalDeadline: parsedBody.attendanceApproval?.approvalDeadline
                ? new Date(parsedBody.attendanceApproval.approvalDeadline)
                : undefined,
              instructions: parsedBody.attendanceApproval?.instructions || "",
            };
          } else if (
            !hasApprovalRequired &&
            event.attendanceApproval?.enabled
          ) {
            event.attendanceApproval.enabled = false;
          }
        } else if (field === "attendanceApproval" && parsedBody[field]) {
          event.attendanceApproval = {
            ...event.attendanceApproval,
            ...parsedBody[field],
          };
        } else {
          event[field] = parsedBody[field];
        }
      }
    });

    await event.save();

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      event,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete event
// @route   DELETE /api/v1/events/:id
// @access  Private (Organizer only - own events)
const deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    validateEventOwnership(event, req.user.userId, req.user.role);

    if (event.totalBookings > 0) {
      return next(
        new ErrorResponse(
          "Cannot delete event with existing bookings. Please cancel the event instead.",
          400
        )
      );
    }

    const publicIds = event.images.map((img) => img.publicId).filter(Boolean);
    if (publicIds.length > 0) {
      await deleteImages(publicIds);
    }

    event.deletedAt = new Date();
    event.isActive = false;
    event.status = "cancelled";
    await event.save();

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get ticket availability
// @route   GET /api/v1/events/:id/ticket-availability
// @access  Public
const getTicketAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    res.status(200).json({
      success: true,
      availability:
        event.ticketTypes?.length > 0
          ? event.ticketTypes.map((ticket) => ({
              type: ticket.name,
              price: ticket.price,
              capacity: ticket.capacity,
              available: ticket.availableTickets,
              soldOut: ticket.availableTickets === 0,
              percentageSold: Math.round(
                ((ticket.capacity - ticket.availableTickets) /
                  ticket.capacity) *
                  100
              ),
              isFree: ticket.price === 0,
              accessType: ticket.accessType,
              requiresApproval: ticket.requiresApproval,
              approvalQuestions: ticket.approvalQuestions,
            }))
          : [
              {
                type: "General",
                price: event.price,
                capacity: event.capacity,
                available: event.availableTickets,
                soldOut: event.availableTickets === 0,
                percentageSold: Math.round(
                  ((event.capacity - event.availableTickets) / event.capacity) *
                    100
                ),
                isFree: event.price === 0,
                requiresApproval: event.price === 0,
              },
            ],
      totalCapacity: event.totalCapacity,
      totalAvailable: event.totalAvailableTickets,
      isSoldOut: event.isSoldOut,
      hasFreeTickets: event.hasFreeTickets,
      hasApprovalRequired: event.hasApprovalRequired,
      attendanceApproval: event.attendanceApproval,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get organizer statistics
// @route   GET /api/v1/events/organizer/statistics
// @access  Private (Organizer only)
const getOrganizerStatistics = async (req, res, next) => {
  try {
    const stats = await Event.getStatistics(req.user.userId);
    const approvalStats = await Event.getApprovalStatistics(req.user.userId);

    res.status(200).json({
      success: true,
      statistics: {
        ...stats,
        approval: approvalStats,
      },
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch statistics", 500));
  }
};

// @desc    Complete event
// @route   PUT /api/v1/events/:id/complete
// @access  Private (Organizer only - own events)
const completeEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    validateEventOwnership(event, req.user.userId, req.user.role);

    event.status = "completed";
    event.isActive = false;
    await event.save();

    res.status(200).json({
      success: true,
      message: "Event marked as completed",
      event,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get organizer events
// @route   GET /api/v1/events/organizer/my-events
// @access  Private (Organizer only)
const getOrganizerEvents = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      status,
      sort = "-createdAt",
      timeFilter,
      needsApproval,
    } = req.query;

    const query = { organizer: req.user.userId };

    if (status && status !== "all") {
      query.status = status;
    }

    if (needsApproval === "true") {
      query["attendanceApproval.enabled"] = true;
      query.pendingApprovals = { $gt: 0 };
    }

    // ✅ Add time filter for organizer's events
    if (timeFilter) {
      const now = new Date();
      if (timeFilter === "upcoming") {
        Object.assign(query, buildFlexibleDateQuery("$gte", now));
      } else if (timeFilter === "past") {
        Object.assign(query, buildFlexibleDateQuery("$lt", now));
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate("organizer", "firstName lastName userName profilePicture"),
      Event.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      events,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch organizer events", 500));
  }
};

// @desc    Cancel event
// @route   PATCH /api/v1/events/:id/cancel
// @access  Private (Organizer only - own events)
const cancelEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    validateEventOwnership(event, req.user.userId, req.user.role);

    event.status = "cancelled";
    event.isActive = false;
    await event.save();

    try {
      await NotificationService.createSystemNotification(req.user.userId, {
        title: "Event Cancelled",
        message: `Your event "${event.title}" has been cancelled.`,
        priority: "high",
        data: { eventId: event._id, eventTitle: event.title },
      });
    } catch (notificationError) {
      console.error("Notification error:", notificationError);
    }

    res.status(200).json({
      success: true,
      message: "Event cancelled successfully",
      event,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete event image
// @route   DELETE /api/v1/events/:id/images/:imageIndex
// @access  Private (Organizer only - own events)
const deleteEventImage = async (req, res, next) => {
  try {
    const { id, imageIndex } = req.params;
    const index = parseInt(imageIndex);

    const event = await Event.findById(id);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    validateEventOwnership(event, req.user.userId, req.user.role);

    if (index < 0 || index >= event.images.length) {
      return next(new ErrorResponse("Invalid image index", 400));
    }

    const imageToDelete = event.images[index];

    event.images.splice(index, 1);
    await event.save();

    if (imageToDelete.publicId) {
      await deleteImages([imageToDelete.publicId]);
    }

    res.status(200).json({
      success: true,
      message: "Image deleted successfully",
      event,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Advanced event search
// @route   GET /api/v1/events/search/advanced
// @access  Public
const searchEventsAdvanced = async (req, res, next) => {
  try {
    const {
      query: searchQuery,
      category,
      city,
      state,
      priceMin,
      priceMax,
      date,
      eventType,
      page = 1,
      limit = 12,
      timeFilter,
    } = req.query;

    const query = buildEventSearchQuery(
      {
        search: searchQuery,
        category,
        city,
        state,
        priceMin,
        priceMax,
        date,
        eventType,
      },
      req.user?.role
    );

    // ✅ Add time filter
    if (timeFilter) {
      const now = new Date();
      if (timeFilter === "upcoming") {
        const upcomingQuery = buildFlexibleDateQuery("$gte", now);
        if (query.$and) {
          query.$and.push(upcomingQuery);
        } else if (query.$or) {
          query.$and = [{ $or: query.$or }, upcomingQuery];
          delete query.$or;
        } else {
          Object.assign(query, upcomingQuery);
        }
      } else if (timeFilter === "past") {
        const pastQuery = buildFlexibleDateQuery("$lt", now);
        if (query.$and) {
          query.$and.push(pastQuery);
        } else if (query.$or) {
          query.$and = [{ $or: query.$or }, pastQuery];
          delete query.$or;
        } else {
          Object.assign(query, pastQuery);
        }
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort({ startDate: 1, date: 1 })
        .skip(skip)
        .limit(limitNum)
        .populate("organizer", "firstName lastName userName profilePicture"),
      Event.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      events,
    });
  } catch (error) {
    next(new ErrorResponse("Search failed", 500));
  }
};

// ==================== STREAMLINED APPROVAL CONTROLLERS ====================

// @desc    Update approval settings for an event
// @route   PATCH /api/v1/events/:id/approval-settings
// @access  Private (Organizer only - own events)
const updateApprovalSettings = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { autoApprove, approvalDeadline, instructions } = req.body;

    if (approvalDeadline && new Date(approvalDeadline) < new Date()) {
      return next(
        new ErrorResponse("Approval deadline must be in the future", 400)
      );
    }

    const event = await Event.findById(id);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    validateEventOwnership(event, req.user.userId, req.user.role);

    const settings = {
      autoApprove,
      approvalDeadline: approvalDeadline
        ? new Date(approvalDeadline)
        : undefined,
      instructions,
    };

    const updatedSettings = await event.updateApprovalSettings(settings);

    res.status(200).json({
      success: true,
      message: "Approval settings updated successfully",
      approvalSettings: updatedSettings,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get events needing approval attention
// @route   GET /api/v1/events/organizer/needing-approval
// @access  Private (Organizer only)
const getEventsNeedingApproval = async (req, res, next) => {
  try {
    const { page = 1, limit = 12 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      Event.findNeedingApproval(req.user.userId).skip(skip).limit(limitNum),
      Event.countDocuments({
        organizer: req.user.userId,
        "attendanceApproval.enabled": true,
        pendingApprovals: { $gt: 0 },
      }),
    ]);

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      events,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch events needing approval", 500));
  }
};

// @desc    Get event approval statistics
// @route   GET /api/v1/events/:id/approval-stats
// @access  Private (Organizer only - own events)
const getEventApprovalStats = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    validateEventOwnership(event, req.user.userId, req.user.role);

    const stats = event.getApprovalStats();

    res.status(200).json({
      success: true,
      approvalStats: stats,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch approval statistics", 500));
  }
};

// @desc    Update shareable banner settings
// @route   PATCH /api/v1/events/:id/shareable-banner
// @access  Private (Organizer only - own events)
const updateShareableBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { enabled, required, design, instructions } = req.body;

    const event = await Event.findById(id);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    validateEventOwnership(event, req.user.userId, req.user.role);

    // Handle banner template upload
    if (req.files && req.files.template) {
      const templateFile = req.files.template;
      const uploadResult = await uploadImages([templateFile]);

      if (uploadResult.length > 0) {
        event.shareableBanner.template = {
          url: uploadResult[0].url,
          publicId: uploadResult[0].publicId,
        };
      }
    }

    // Update banner settings
    event.shareableBanner = {
      ...event.shareableBanner,
      enabled: enabled !== undefined ? enabled : event.shareableBanner.enabled,
      required:
        required !== undefined ? required : event.shareableBanner.required,
      design: design
        ? { ...event.shareableBanner.design, ...design }
        : event.shareableBanner.design,
      instructions: instructions || event.shareableBanner.instructions,
    };

    await event.save();

    res.status(200).json({
      success: true,
      message: "Shareable banner settings updated successfully",
      shareableBanner: event.shareableBanner,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove shareable banner template
// @route   DELETE /api/v1/events/:id/shareable-banner/template
// @access  Private (Organizer only - own events)
const removeShareableBannerTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    validateEventOwnership(event, req.user.userId, req.user.role);

    if (event.shareableBanner.template?.publicId) {
      await deleteImages([event.shareableBanner.template.publicId]);
    }

    event.shareableBanner.template = null;
    event.shareableBanner.enabled = false;
    await event.save();

    res.status(200).json({
      success: true,
      message: "Shareable banner template removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get events by categories
// @route   GET /api/v1/events/categories
// @access  Public
const getEventsByCategories = async (req, res, next) => {
  try {
    const {
      categories,
      page = 1,
      limit = 12,
      timeFilter = "upcoming",
      sort = "date",
    } = req.query;

    // Parse categories from query string (can be comma-separated or array)
    let categoryList = [];
    if (categories) {
      if (Array.isArray(categories)) {
        categoryList = categories;
      } else if (typeof categories === "string") {
        categoryList = categories.split(",").map((cat) => cat.trim());
      }
    }

    // Build base query
    const query = {
      status: "published",
      isActive: true,
    };

    // Add category filter if categories are provided
    if (categoryList.length > 0) {
      query.category = { $in: categoryList };
    }

    // ✅ Add time filter using flexible date query
    const now = new Date();
    if (timeFilter === "upcoming") {
      Object.assign(query, buildFlexibleDateQuery("$gte", now));
    } else if (timeFilter === "past") {
      Object.assign(query, buildFlexibleDateQuery("$lt", now));
    }
    // "all" will include both upcoming and past events

    console.log("📊 Categories Query:", JSON.stringify(query, null, 2));

    const sortOption = getSortOptions(sort);
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [events, total, categoryStats] = await Promise.all([
      Event.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .populate(
          "organizer",
          "firstName lastName userName profilePicture organizerInfo"
        ),
      Event.countDocuments(query),
      // Get category statistics for the response
      Event.aggregate([
        { $match: { status: "published", isActive: true } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Get unique categories from the results
    const uniqueCategories = [
      ...new Set(events.map((event) => event.category)),
    ];

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      categories: categoryList.length > 0 ? categoryList : uniqueCategories,
      categoryStatistics: categoryStats,
      filters: {
        categories: categoryList,
        timeFilter,
        sort,
      },
      events,
    });
  } catch (error) {
    console.error("❌ getEventsByCategories Error:", error);
    next(new ErrorResponse("Failed to fetch events by categories", 500));
  }
};

// @desc    Get events happening this week
// @route   GET /api/v1/events/this-week
// @access  Public
const getEventsThisWeek = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      city,
      state,
      eventType,
      sort = "date",
    } = req.query;

    // Calculate date range for this week
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);

    // If today is not Monday, go back to Monday
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(now.getDate() + diffToMonday);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    console.log("📅 This Week Range:", {
      startOfWeek: startOfWeek.toISOString(),
      endOfWeek: endOfWeek.toISOString(),
      today: now.toISOString(),
    });

    // ✅ Build query for events happening this week using flexible date query
    const query = {
      status: "published",
      isActive: true,
      $or: [
        // Events with startDate this week
        {
          startDate: {
            $gte: startOfWeek,
            $lte: endOfWeek,
            $exists: true,
          },
        },
        // Events with date this week (legacy)
        {
          date: {
            $gte: startOfWeek,
            $lte: endOfWeek,
          },
          startDate: { $exists: false },
        },
        // Multi-day events that span this week
        {
          $and: [
            { startDate: { $lte: endOfWeek, $exists: true } },
            { endDate: { $gte: startOfWeek, $exists: true } },
          ],
        },
      ],
    };

    // Add additional filters
    if (category) query.category = category;
    if (city) query.city = new RegExp(city, "i");
    if (state) query.state = state;
    if (eventType) query.eventType = eventType;

    console.log("🎯 This Week Query:", JSON.stringify(query, null, 2));

    const sortOption = getSortOptions(sort);
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .populate(
          "organizer",
          "firstName lastName userName profilePicture organizerInfo"
        ),
      Event.countDocuments(query),
    ]);

    // Group events by day for better frontend display
    const eventsByDay = {};
    events.forEach((event) => {
      const eventDate = event.startDate || event.date;
      const dayKey = eventDate.toISOString().split("T")[0]; // YYYY-MM-DD

      if (!eventsByDay[dayKey]) {
        eventsByDay[dayKey] = [];
      }
      eventsByDay[dayKey].push(event);
    });

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      dateRange: {
        startOfWeek: startOfWeek.toISOString(),
        endOfWeek: endOfWeek.toISOString(),
        weekNumber: getWeekNumber(startOfWeek),
      },
      filters: {
        category,
        city,
        state,
        eventType,
        sort,
      },
      eventsByDay,
      events,
    });
  } catch (error) {
    console.error("❌ getEventsThisWeek Error:", error);
    next(new ErrorResponse("Failed to fetch events for this week", 500));
  }
};

// Helper function to get week number
const getWeekNumber = (date) => {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};

module.exports = {
  createEvent,
  getAllEvents,
  getPastEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getFeaturedEvents,
  getUpcomingEvents,
  getTicketAvailability,
  getOrganizerStatistics,
  completeEvent,
  getOrganizerEvents,
  cancelEvent,
  deleteEventImage,
  searchEventsAdvanced,
  getEventsThisWeek,
  getEventsByCategories,
  // Approval controllers
  updateApprovalSettings,
  getEventsNeedingApproval,
  getEventApprovalStats,
  updateShareableBanner,
  removeShareableBannerTemplate,
};