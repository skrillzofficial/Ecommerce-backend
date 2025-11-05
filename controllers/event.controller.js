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

// ==================== FLEXIBLE DATE HELPER ====================
// This helper builds queries that work with BOTH date and startDate fields
const buildFlexibleDateQuery = (operator, dateValue) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

  return {
    $or: [
      {
        startDate: { [operator]: date },
        startDate: { $exists: true },
      },
      {
        date: { [operator]: date },
        startDate: { $exists: false },
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

// @desc    Create new event with payment flow
// @route   POST /api/v1/events
// @access  Private (Organizer only)
const createEvent = async (req, res, next) => {
  try {
    console.log('=== EVENT CREATION STARTED ===');

    // Process form data
    const processedBody = processFormDataArrays(req.body);
    const parsedBody = parseJSONFields(processedBody, [
      "ticketTypes",
      "tags",
      "includes",
      "requirements",
      "attendanceApproval",
    ]);

    const {
      title,
      description,
      category,
      startDate,
      endDate,
      time,
      endTime,
      venue,
      address,
      state,
      city,
      eventType = "physical",
      virtualEventLink,
      price,
      capacity,
      ticketTypes,
      agreement,
      status = "draft",
    } = parsedBody;

    // Validate required fields
    const requiredFields = [
      "title",
      "description", 
      "category",
      "startDate",
      "time",
      "endTime",
    ];

    if (eventType !== "virtual") {
      requiredFields.push("venue", "address", "city", "state");
    }

    for (const field of requiredFields) {
      if (!parsedBody[field]) {
        return next(new ErrorResponse(`${field} is required`, 400));
      }
    }

    if (eventType === "virtual" && !virtualEventLink) {
      return next(new ErrorResponse("Virtual event link is required for virtual events", 400));
    }

    // Validate organizer role
    if (req.user.role !== "organizer" && req.user.role !== "superadmin") {
      return next(new ErrorResponse("Only organizers can create events", 403));
    }

    // Get organizer info
    const organizer = await User.findById(req.user.userId);
    if (!organizer) {
      return next(new ErrorResponse("Organizer not found", 404));
    }

    // Handle image uploads
    let uploadedImages = [];
    if (req.files && req.files.images) {
      const imageFiles = Array.isArray(req.files.images)
        ? req.files.images
        : [req.files.images];

      if (imageFiles.length > 3) {
        return next(new ErrorResponse("Maximum 3 images allowed", 400));
      }
      uploadedImages = await uploadImages(imageFiles);
    }

    // Prepare dates
    const eventDate = new Date(startDate);
    const eventEndDate = endDate ? new Date(endDate) : eventDate;

    // Build event data
    const eventData = {
      title,
      description,
      category,
      date: eventDate,
      startDate: eventDate,
      endDate: eventEndDate,
      time,
      endTime,
      eventType,
      virtualEventLink,
      organizer: req.user.userId,
      organizerInfo: {
        name: organizer.fullName || `${organizer.firstName} ${organizer.lastName}`,
        email: organizer.email,
        phone: organizer.phone,
        companyName: organizer.organizerInfo?.companyName || "",
      },
      images: uploadedImages,
      status: "draft", // ✅ Always start as draft
      isActive: true,
      venue,
      address,
      state,
      city,
    };

    // Handle agreement
    if (agreement && agreement.acceptedTerms) {
      eventData.agreement = {
        ...agreement,
        paymentTerms: "upfront",
        acceptedAt: new Date(agreement.acceptedAt || new Date()),
      };
    }

    // Handle ticket types
    let parsedTicketTypes = ticketTypes;
    if (typeof ticketTypes === "string") {
      try {
        parsedTicketTypes = JSON.parse(ticketTypes);
      } catch (e) {
        parsedTicketTypes = null;
      }
    }

    if (parsedTicketTypes && Array.isArray(parsedTicketTypes)) {
      eventData.ticketTypes = parsedTicketTypes.map((ticket) => ({
        name: ticket.name,
        price: safeParseNumber(ticket.price, 0),
        capacity: safeParseNumber(ticket.capacity, 1),
        availableTickets: safeParseNumber(ticket.capacity, 1),
        description: ticket.description || "",
        benefits: ticket.benefits || [],
        accessType: ticket.accessType || (eventType === "hybrid" ? "both" : "physical"),
        isFree: safeParseNumber(ticket.price, 0) === 0,
        requiresApproval: ticket.requiresApproval !== undefined ? 
          ticket.requiresApproval : safeParseNumber(ticket.price, 0) === 0,
      }));

      eventData.price = Math.min(...parsedTicketTypes.map(t => safeParseNumber(t.price, 0)));
      eventData.capacity = parsedTicketTypes.reduce((sum, t) => sum + safeParseNumber(t.capacity, 1), 0);
      eventData.availableTickets = eventData.capacity;
    } else {
      eventData.price = safeParseNumber(price, 0);
      eventData.capacity = safeParseNumber(capacity, 1);
      eventData.availableTickets = safeParseNumber(capacity, 1);
    }

    // ✅ FIX: Create event ONCE using .create()
    const event = await Event.create(eventData);
    console.log('✅ Event created as draft:', event._id);

    // ✅ FIX: Check if service fee payment is needed WITHOUT calling .save() again
    const needsServiceFeePayment = event.isFreeEvent && event.requiresServiceFeePayment;

    if (needsServiceFeePayment) {
      console.log('💰 Free event requires service fee payment');
      
      try {
        const paymentData = await event.initializeServiceFeePayment(
          organizer.email,
          {
            firstName: organizer.firstName,
            lastName: organizer.lastName,
            phone: organizer.phone
          }
        );

        return res.status(201).json({
          success: true,
          message: "Event created successfully. Payment required to publish.",
          event,
          requiresPayment: true,
          paymentData: {
            eventId: event._id,
            amount: paymentData.amount,
            email: paymentData.email,
            metadata: paymentData.metadata
          }
        });

      } catch (paymentError) {
        console.error('❌ Payment initialization failed:', paymentError);
        
        return res.status(201).json({
          success: true,
          message: "Event created as draft. Payment initialization failed.",
          event,
          requiresPayment: true,
          paymentError: paymentError.message
        });
      }
    } 
    
    // ✅ FIX: For paid events, update status using findByIdAndUpdate to avoid pre-save hooks
    if (!event.isFreeEvent) {
      console.log('🎉 Paid event - publishing immediately');
      
      const publishedEvent = await Event.findByIdAndUpdate(
        event._id,
        {
          status: "published",
          publishedAt: new Date()
        },
        { new: true }
      );

      return res.status(201).json({
        success: true,
        message: "Event created and published successfully",
        event: publishedEvent,
        requiresPayment: false
      });
    }

    // For events that don't need publishing
    res.status(201).json({
      success: true,
      message: "Event created successfully",
      event,
      requiresPayment: false
    });

  } catch (error) {
    console.error('❌ Event creation error:', error);
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
      ...filters
    } = req.query;

    if (isVoiceSearch === "true" && search) {
      const voiceParams = parseVoiceQuery(search);
      Object.assign(filters, voiceParams);
      search = voiceParams.search || search;
    }

    // ✅ Build flexible query (supports both date and startDate)
    const query = buildEventSearchQuery({ ...filters, search }, req.user?.role);

    // ✅ CRITICAL FIX: Apply time filter SEPARATELY (not in buildEventSearchQuery)
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

    console.log("📍 Final Query:", JSON.stringify(query, null, 2));
    console.log("🔐 User authenticated:", !!req.user);

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

    // ✅ CRITICAL FIX: Build base query WITHOUT date filter
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

    console.log("📅 Past Events Query:", JSON.stringify(finalQuery, null, 2));

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
    const query = {
      status: "published",
      isActive: true,
      ...buildFlexibleDateQuery("$gte", now),
    };

    if (category) query.category = category;
    if (city) query.city = new RegExp(city, "i");
    if (state) query.state = state;
    if (eventType) query.eventType = eventType;

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

    // ✅ Add time filter
    if (timeFilter === "upcoming") {
      Object.assign(query, buildFlexibleDateQuery("$gte", now));
    } else if (timeFilter === "past") {
      Object.assign(query, buildFlexibleDateQuery("$lt", now));
    }

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
      "attendanceApproval", // NEW: Allow attendance approval updates
    ];

    allowedUpdates.forEach((field) => {
      if (parsedBody[field] !== undefined) {
        if (field === "startDate" || field === "endDate") {
          const dateValue = new Date(parsedBody[field]);
          event[field] = dateValue;
          // ✅ Sync both date and startDate
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

            // NEW: Handle approval settings for ticket types
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

          // NEW: Update global approval settings based on ticket types
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
          // NEW: Handle direct attendance approval updates
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
              requiresApproval: ticket.requiresApproval, // NEW: Include approval requirement
              approvalQuestions: ticket.approvalQuestions, // NEW: Include approval questions
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
                requiresApproval: event.price === 0, // NEW: Free tickets require approval by default
              },
            ],
      totalCapacity: event.totalCapacity,
      totalAvailable: event.totalAvailableTickets,
      isSoldOut: event.isSoldOut,
      hasFreeTickets: event.hasFreeTickets,
      hasApprovalRequired: event.hasApprovalRequired, // NEW: Include global approval status
      attendanceApproval: event.attendanceApproval, // NEW: Include approval settings
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

    // NEW: Get approval statistics
    const approvalStats = await Event.getApprovalStatistics(req.user.userId);

    res.status(200).json({
      success: true,
      statistics: {
        ...stats,
        approval: approvalStats, // NEW: Include approval statistics
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

    // NEW: Filter events needing approval attention
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
      return next(new ErrorResponse("Approval deadline must be in the future", 400));
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
  // STREAMLINED: Only essential approval controllers
  updateApprovalSettings,
  getEventsNeedingApproval,
  getEventApprovalStats,
  updateShareableBanner,
  removeShareableBannerTemplate,
};
