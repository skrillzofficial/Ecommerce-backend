const Event = require("../models/event");
const User = require("../models/user");
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
  validateOrganizerRole
} = require("../utils/validationHelpers");

// @desc    Create new event
// @route   POST /api/v1/events
// @access  Private (Organizer only)
const createEvent = async (req, res, next) => {
  try {
    // Process form data
    const processedBody = processFormDataArrays(req.body);
    const parsedBody = parseJSONFields(processedBody, [
      'ticketTypes', 'tags', 'includes', 'requirements'
    ]);

    const {
      title,
      description,
      longDescription,
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
      tags,
      includes,
      requirements,
      cancellationPolicy,
      refundPolicy,
      ticketTypes,
      price,
      capacity,
      ticketDescription,
      ticketBenefits
    } = parsedBody;

    // Validate required fields
    const requiredFields = [
      'title', 'description', 'category', 'startDate', 
      'time', 'endTime'
    ];
    
    if (eventType !== "virtual") {
      requiredFields.push('venue', 'address', 'city');
    }
    
    if (eventType === "virtual" && !virtualEventLink) {
      return next(new ErrorResponse("Virtual event link is required for virtual events", 400));
    }

    validateRequiredFields(parsedBody, requiredFields);

    // Validate organizer role
    validateOrganizerRole(req.user.role);

    // Validate ticket types or legacy pricing
    let parsedTicketTypes = ticketTypes;
    if (typeof ticketTypes === "string") {
      try {
        parsedTicketTypes = JSON.parse(ticketTypes);
      } catch (e) {
        parsedTicketTypes = null;
      }
    }

    if (parsedTicketTypes && Array.isArray(parsedTicketTypes)) {
      const validation = validateTicketTypes(parsedTicketTypes);
      if (!validation.isValid) {
        return next(new ErrorResponse(validation.error, 400));
      }
    } else if (price === undefined || !capacity) {
      return next(new ErrorResponse("Please provide pricing information", 400));
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

    // Prepare event data
    const eventData = {
      title,
      description,
      longDescription: longDescription || description,
      category,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : new Date(startDate),
      time,
      endTime,
      eventType,
      virtualEventLink,
      organizer: req.user.userId,
      organizerInfo: {
        name: organizer.fullName,
        email: organizer.email,
        phone: organizer.phone,
        companyName: organizer.organizerInfo?.companyName || "",
      },
      images: uploadedImages,
      tags: safeParseArray(tags),
      includes: safeParseArray(includes),
      requirements: safeParseArray(requirements),
      cancellationPolicy,
      refundPolicy: refundPolicy || "partial",
      status: "published",
      isActive: true,
    };

    // Add location for physical/hybrid events
    if (eventType !== "virtual") {
      eventData.venue = venue;
      eventData.address = address;
      eventData.state = state;
      eventData.city = city;
    }

    // Handle ticket types or legacy pricing
    if (parsedTicketTypes && Array.isArray(parsedTicketTypes)) {
      eventData.ticketTypes = parsedTicketTypes.map(ticket => ({
        name: ticket.name,
        price: safeParseNumber(ticket.price, 0),
        capacity: safeParseNumber(ticket.capacity, 1),
        availableTickets: safeParseNumber(ticket.capacity, 1),
        description: ticket.description || "",
        benefits: ticket.benefits || [],
        accessType: ticket.accessType || (eventType === "hybrid" ? "both" : "physical"),
        isFree: safeParseNumber(ticket.price, 0) === 0,
      }));

      // Set legacy fields for compatibility
      eventData.price = Math.min(...parsedTicketTypes.map(t => safeParseNumber(t.price, 0)));
      eventData.capacity = parsedTicketTypes.reduce((sum, t) => sum + safeParseNumber(t.capacity, 1), 0);
      eventData.availableTickets = eventData.capacity;
    } else {
      // Legacy single ticket type
      eventData.price = safeParseNumber(price, 0);
      eventData.capacity = safeParseNumber(capacity, 1);
      eventData.availableTickets = safeParseNumber(capacity, 1);
      eventData.ticketDescription = ticketDescription;
      eventData.ticketBenefits = safeParseArray(ticketBenefits);
    }

    // Create event
    const event = await Event.create(eventData);

    // Send notification
    try {
      await NotificationService.createSystemNotification(req.user.userId, {
        title: "🎉 Event Created Successfully!",
        message: `Your event "${event.title}" has been created and is now live.`,
        priority: "medium",
        data: { eventId: event._id, eventTitle: event.title },
      });
    } catch (notificationError) {
      console.error("Notification error:", notificationError);
    }

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      event,
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get all events with filtering and pagination
// @route   GET /api/v1/events
// @access  Public
const getAllEvents = async (req, res, next) => {
  try {
    let { search, isVoiceSearch, page = 1, limit = 12, sort = "date", ...filters } = req.query;

    // Parse voice search
    if (isVoiceSearch === "true" && search) {
      const voiceParams = parseVoiceQuery(search);
      Object.assign(filters, voiceParams);
      search = voiceParams.search || search;
    }

    // Build query and sort
    const query = buildEventSearchQuery({ ...filters, search }, req.user?.role);
    const sortOption = getSortOptions(sort);

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const [events, total] = await Promise.all([
      Event.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .populate("organizer", "firstName lastName userName profilePicture organizerInfo"),
      Event.countDocuments(query)
    ]);

    const response = {
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      events,
    };

    // Add voice search info if applicable
    if (isVoiceSearch === "true") {
      response.voiceSearchParams = {
        originalQuery: req.query.search,
        parsedFilters: filters,
      };
    }

    res.status(200).json(response);

  } catch (error) {
    next(error);
  }
};

// @desc    Get past events
// @route   GET /api/v1/events/past
// @access  Public
const getPastEvents = async (req, res, next) => {
  try {
    const { page = 1, limit = 12, sort = "-startDate", ...filters } = req.query;

    const query = {
      ...buildEventSearchQuery(filters),
      startDate: { $lt: new Date() },
      status: "published",
    };

    const sortOption = getSortOptions(sort);

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .populate("organizer", "firstName lastName userName profilePicture organizerInfo"),
      Event.countDocuments(query)
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
    next(error);
  }
};

// @desc    Get single event by ID or slug
// @route   GET /api/v1/events/:id
// @access  Public
const getEventById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try to find by ID first, then by slug
    let event = await Event.findOne({
      $or: [{ _id: id }, { slug: id }]
    })
    .populate("organizer", "firstName lastName userName email profilePicture organizerInfo socialLinks")
    .populate("likes", "firstName lastName userName profilePicture");

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Increment views for published events
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

    // Check ownership
    validateEventOwnership(event, req.user.userId, req.user.role);

    // Process form data
    const processedBody = processFormDataArrays(req.body);
    const parsedBody = parseJSONFields(processedBody, [
      'ticketTypes', 'tags', 'includes', 'requirements', 
      'existingImages', 'imagesToDelete'
    ]);

    // Handle new image uploads
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

    // Handle image deletions
    if (parsedBody.imagesToDelete && Array.isArray(parsedBody.imagesToDelete)) {
      const publicIdsToDelete = [];
      
      event.images = event.images.filter(img => {
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

    // Update allowed fields
    const allowedUpdates = [
      'title', 'description', 'longDescription', 'category',
      'startDate', 'endDate', 'time', 'endTime', 'venue', 
      'address', 'state', 'city', 'eventType', 'virtualEventLink',
      'price', 'capacity', 'tags', 'includes', 'requirements',
      'cancellationPolicy', 'refundPolicy', 'status', 'isFeatured',
      'ticketTypes', 'ticketDescription', 'ticketBenefits'
    ];

    allowedUpdates.forEach(field => {
      if (parsedBody[field] !== undefined) {
        if (field === 'startDate' || field === 'endDate') {
          event[field] = new Date(parsedBody[field]);
        } else if (field === 'price' || field === 'capacity') {
          event[field] = safeParseNumber(parsedBody[field], field === 'capacity' ? 1 : 0);
        } else if (field === 'ticketTypes' && Array.isArray(parsedBody[field])) {
          event[field] = parsedBody[field].map(ticket => ({
            ...ticket,
            price: safeParseNumber(ticket.price, 0),
            capacity: safeParseNumber(ticket.capacity, 1),
            availableTickets: safeParseNumber(ticket.availableTickets, safeParseNumber(ticket.capacity, 1)),
            isFree: safeParseNumber(ticket.price, 0) === 0,
          }));
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

    // Check for existing bookings
    if (event.totalBookings > 0) {
      return next(new ErrorResponse(
        "Cannot delete event with existing bookings. Please cancel the event instead.",
        400
      ));
    }

    // Delete images from Cloudinary
    const publicIds = event.images.map(img => img.publicId).filter(Boolean);
    if (publicIds.length > 0) {
      await deleteImages(publicIds);
    }

    // Soft delete
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

// @desc    Get featured events
// @route   GET /api/v1/events/featured
// @access  Public
const getFeaturedEvents = async (req, res, next) => {
  try {
    const { limit = 6 } = req.query;
    const events = await Event.findFeatured(parseInt(limit));

    res.status(200).json({
      success: true,
      count: events.length,
      events,
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get upcoming events
// @route   GET /api/v1/events/upcoming
// @access  Public
const getUpcomingEvents = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const events = await Event.findUpcoming(parseInt(limit));

    res.status(200).json({
      success: true,
      count: events.length,
      events,
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
      availability: event.ticketTypes?.length > 0 ? event.ticketTypes.map(ticket => ({
        type: ticket.name,
        price: ticket.price,
        capacity: ticket.capacity,
        available: ticket.availableTickets,
        soldOut: ticket.availableTickets === 0,
        percentageSold: Math.round(((ticket.capacity - ticket.availableTickets) / ticket.capacity) * 100),
        isFree: ticket.price === 0,
        accessType: ticket.accessType,
      })) : [{
        type: "General",
        price: event.price,
        capacity: event.capacity,
        available: event.availableTickets,
        soldOut: event.availableTickets === 0,
        percentageSold: Math.round(((event.capacity - event.availableTickets) / event.capacity) * 100),
        isFree: event.price === 0,
      }],
      totalCapacity: event.totalCapacity,
      totalAvailable: event.totalAvailableTickets,
      isSoldOut: event.isSoldOut,
      hasFreeTickets: event.hasFreeTickets,
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
    res.status(200).json({
      success: true,
      statistics: stats,
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
    
    // Mark event as completed
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
    const { page = 1, limit = 12, status, sort = "-createdAt" } = req.query;
    
    const query = { organizer: req.user.userId };
    
    // Filter by status if provided
    if (status && status !== 'all') {
      query.status = status;
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
      Event.countDocuments(query)
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
    
    // Cancel event
    event.status = "cancelled";
    event.isActive = false;
    await event.save();

    // Send notifications to attendees
    try {
      // You would implement notification logic here for attendees
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
    
    // Remove image from array
    event.images.splice(index, 1);
    await event.save();

    // Delete from Cloudinary
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
    const { query, category, city, state, priceMin, priceMax, date, eventType, page = 1, limit = 12 } = req.query;

    const searchQuery = buildEventSearchQuery({
      search: query,
      category,
      city,
      state,
      priceMin,
      priceMax,
      date,
      eventType
    });

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      Event.find(searchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("organizer", "firstName lastName userName profilePicture"),
      Event.countDocuments(searchQuery)
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
  searchEventsAdvanced
};