const Event = require("../models/event");
const User = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

// @desc    Create new event
// @route   POST /api/v1/events
// @access  Private (Organizer only)
const createEvent = async (req, res, next) => {
  try {
    const {
      title,
      description,
      longDescription,
      category,
      date,
      time,
      endTime,
      venue,
      address,
      city,
      tags,
      includes,
      requirements,
      cancellationPolicy,
      refundPolicy,
      ticketTypes,
      price,
      capacity,
    } = req.body;

    // Validate required fields
    if (
      !title ||
      !description ||
      !category ||
      !date ||
      !time ||
      !endTime ||
      !venue ||
      !address ||
      !city
    ) {
      return next(new ErrorResponse("Please provide all required fields", 400));
    }

    // Parse ticket types if it's a string (from form data)
    let parsedTicketTypes = ticketTypes;
    if (typeof ticketTypes === 'string') {
      try {
        parsedTicketTypes = JSON.parse(ticketTypes);
      } catch (e) {
        console.error("Error parsing ticketTypes:", e);
        parsedTicketTypes = null;
      }
    }

    // Validate ticket types OR legacy pricing
    if (parsedTicketTypes && Array.isArray(parsedTicketTypes) && parsedTicketTypes.length > 0) {
      for (const ticket of parsedTicketTypes) {
        if (!ticket.name || ticket.price === undefined || !ticket.capacity) {
          return next(new ErrorResponse("Each ticket type must have name, price, and capacity", 400));
        }
      }
    } else if (price === undefined || !capacity) {
      return next(new ErrorResponse("Please provide pricing information", 400));
    }

    // Validate user is organizer
    if (req.user.role !== "organizer") {
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

      for (const image of imageFiles) {
        try {
          const result = await cloudinary.uploader.upload(image.tempFilePath, {
            folder: "eventry/events",
            use_filename: true,
            unique_filename: true,
            resource_type: "image",
            transformation: [
              { width: 1200, height: 600, crop: "fill" },
              { quality: "auto" },
              { format: "jpg" },
            ],
          });

          uploadedImages.push({
            url: result.secure_url,
            publicId: result.public_id,
            alt: title,
          });

          fs.unlink(image.tempFilePath, (err) => {
            if (err) console.error("Failed to delete temp file:", err);
          });
        } catch (uploadError) {
          console.error("Image upload error:", uploadError);
          return next(new ErrorResponse("Failed to upload event images", 500));
        }
      }
    }

    // Parse arrays from form data
    let parsedTags = tags;
    if (typeof tags === 'string') {
      try {
        parsedTags = JSON.parse(tags);
      } catch (e) {
        parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      }
    }

    let parsedIncludes = includes;
    if (typeof includes === 'string') {
      try {
        parsedIncludes = JSON.parse(includes);
      } catch (e) {
        parsedIncludes = [];
      }
    }

    let parsedRequirements = requirements;
    if (typeof requirements === 'string') {
      try {
        parsedRequirements = JSON.parse(requirements);
      } catch (e) {
        parsedRequirements = [];
      }
    }

    // Create event data
    const eventData = {
      title,
      description,
      longDescription: longDescription || description,
      category,
      date: new Date(date),
      time,
      endTime,
      venue,
      address,
      city,
      organizer: req.user.userId,
      organizerInfo: {
        name: `${organizer.firstName} ${organizer.lastName}`,
        email: organizer.email,
        companyName: organizer.organizerInfo?.companyName || "",
      },
      images: uploadedImages,
      tags: Array.isArray(parsedTags) ? parsedTags : [],
      includes: Array.isArray(parsedIncludes) ? parsedIncludes : [],
      requirements: Array.isArray(parsedRequirements) ? parsedRequirements : [],
      cancellationPolicy,
      refundPolicy: refundPolicy || "partial",
      status: "published",
      isActive: true,
    };

    // Add ticket types OR legacy pricing
    if (parsedTicketTypes && Array.isArray(parsedTicketTypes) && parsedTicketTypes.length > 0) {
      eventData.ticketTypes = parsedTicketTypes.map(ticket => ({
        name: ticket.name,
        price: parseFloat(ticket.price),
        capacity: parseInt(ticket.capacity),
        availableTickets: parseInt(ticket.capacity),
        description: ticket.description || "",
        benefits: ticket.benefits || [],
      }));
      
      eventData.price = 0;
      eventData.capacity = parsedTicketTypes.reduce((sum, t) => sum + parseInt(t.capacity), 0);
      eventData.availableTickets = eventData.capacity;
    } else {
      eventData.price = parseFloat(price);
      eventData.capacity = parseInt(capacity);
      eventData.availableTickets = parseInt(capacity);
    }

    // Create event
    const event = await Event.create(eventData);

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      event: event,
    });
  } catch (error) {
    console.error("Create event error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return next(new ErrorResponse(messages.join(", "), 400));
    }

    next(new ErrorResponse("Failed to create event", 500));
  }
};

// @desc    Get all events with filtering and pagination
// @route   GET /api/v1/events
// @access  Public
const getAllEvents = async (req, res, next) => {
  try {
    const {
      search,
      category,
      city,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      status,
      isFeatured,
      page = 1,
      limit = 12,
      sort = "date",
    } = req.query;

    // Build query
    const query = {
      isActive: true,
    };

    // Only show published events to non-organizers
    if (!req.user || req.user.role !== "organizer") {
      query.status = "published";
      query.date = { $gte: new Date() };
    } else if (status) {
      query.status = status;
    }

    // Search by text
    if (search) {
      query.$text = { $search: search };
    }

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by city
    if (city) {
      query.city = city;
    }

    // Filter by price range (handles both ticketTypes and legacy price)
    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceQuery = [];
      
      // Check legacy price field
      if (minPrice !== undefined || maxPrice !== undefined) {
        const legacyPriceQuery = { price: {} };
        if (minPrice !== undefined) legacyPriceQuery.price.$gte = parseFloat(minPrice);
        if (maxPrice !== undefined) legacyPriceQuery.price.$lte = parseFloat(maxPrice);
        priceQuery.push(legacyPriceQuery);
      }
      
      // Check ticket types price range
      if (minPrice !== undefined || maxPrice !== undefined) {
        const ticketTypePriceQuery = { "ticketTypes.price": {} };
        if (minPrice !== undefined) ticketTypePriceQuery["ticketTypes.price"].$gte = parseFloat(minPrice);
        if (maxPrice !== undefined) ticketTypePriceQuery["ticketTypes.price"].$lte = parseFloat(maxPrice);
        priceQuery.push(ticketTypePriceQuery);
      }
      
      if (priceQuery.length > 0) {
        query.$or = priceQuery;
      }
    }

    // Filter by date range
    if (startDate || endDate) {
      query.date = query.date || {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Filter by featured
    if (isFeatured === "true") {
      query.isFeatured = true;
    }

    // Sorting
    let sortOption = {};
    switch (sort) {
      case "date":
        sortOption = { date: 1 };
        break;
      case "-date":
        sortOption = { date: -1 };
        break;
      case "price":
        sortOption = { price: 1 };
        break;
      case "-price":
        sortOption = { price: -1 };
        break;
      case "popular":
        sortOption = { views: -1, totalLikes: -1 };
        break;
      case "newest":
        sortOption = { createdAt: -1 };
        break;
      default:
        sortOption = { date: 1 };
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const events = await Event.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .populate(
        "organizer",
        "firstName lastName userName profilePicture organizerInfo"
      );

    // Get total count for pagination
    const total = await Event.countDocuments(query);

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      events,
    });
  } catch (error) {
    console.error("Get all events error:", error);
    next(new ErrorResponse("Failed to fetch events", 500));
  }
};

// @desc    Get single event by ID or slug
// @route   GET /api/v1/events/:id
// @access  Public
const getEventById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try to find by ID first, then by slug
    let event = await Event.findById(id)
      .populate(
        "organizer",
        "firstName lastName userName email profilePicture organizerInfo"
      )
      .populate("attendees.user", "firstName lastName userName profilePicture");

    if (!event) {
      event = await Event.findOne({ slug: id })
        .populate(
          "organizer",
          "firstName lastName userName email profilePicture organizerInfo"
        )
        .populate(
          "attendees.user",
          "firstName lastName userName profilePicture"
        );
    }

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Increment views (only for published events)
    if (event.status === "published") {
      await event.incrementViews();
    }

    res.status(200).json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("Get event error:", error);
    next(new ErrorResponse("Failed to fetch event", 500));
  }
};

// @desc    Update event
// @route   PUT /api/v1/events/:id
// @access  Private (Organizer only - own events)
const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    let event = await Event.findById(id).populate("organizer", "_id");

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Check ownership
    const eventOrganizerId =
      event.organizer?._id?.toString() || event.organizer?.toString();
    const currentUserId = req.user._id?.toString() || req.user.id?.toString();

    if (eventOrganizerId !== currentUserId && req.user.role !== "superadmin") {
      return next(
        new ErrorResponse("Not authorized to update this event", 403)
      );
    }

    // Handle new image uploads
    if (req.files && req.files.images) {
      const imageFiles = Array.isArray(req.files.images)
        ? req.files.images
        : [req.files.images];

      if (event.images.length + imageFiles.length > 3) {
        return next(new ErrorResponse("Maximum 3 images allowed", 400));
      }

      for (const image of imageFiles) {
        try {
          const result = await cloudinary.uploader.upload(image.tempFilePath, {
            folder: "eventry/events",
            use_filename: true,
            unique_filename: true,
            resource_type: "image",
            transformation: [
              { width: 1200, height: 600, crop: "fill" },
              { quality: "auto" },
              { format: "jpg" },
            ],
          });

          event.images.push({
            url: result.secure_url,
            publicId: result.public_id,
            alt: event.title,
          });

          fs.unlink(image.tempFilePath, (err) => {
            if (err) console.error("Failed to delete temp file:", err);
          });
        } catch (uploadError) {
          console.error("Image upload error:", uploadError);
        }
      }
    }

    // Handle array fields that come as form data with [] notation
    if (req.body['tags[]']) {
      req.body.tags = Array.isArray(req.body['tags[]']) 
        ? req.body['tags[]'] 
        : [req.body['tags[]']];
      delete req.body['tags[]'];
    }

    if (req.body['includes[]']) {
      req.body.includes = Array.isArray(req.body['includes[]']) 
        ? req.body['includes[]'] 
        : [req.body['includes[]']];
      delete req.body['includes[]'];
    }

    if (req.body['requirements[]']) {
      req.body.requirements = Array.isArray(req.body['requirements[]']) 
        ? req.body['requirements[]'] 
        : [req.body['requirements[]']];
      delete req.body['requirements[]'];
    }

    if (req.body['existingImages[]']) {
      req.body.existingImages = Array.isArray(req.body['existingImages[]']) 
        ? req.body['existingImages[]'] 
        : [req.body['existingImages[]']];
      delete req.body['existingImages[]'];
    }

    if (req.body['imagesToDelete[]']) {
      req.body.imagesToDelete = Array.isArray(req.body['imagesToDelete[]']) 
        ? req.body['imagesToDelete[]'] 
        : [req.body['imagesToDelete[]']];
      delete req.body['imagesToDelete[]'];
    }

    // Handle JSON fields from frontend (fallback)
    if (req.body.tags && typeof req.body.tags === "string") {
      try {
        req.body.tags = JSON.parse(req.body.tags);
      } catch (e) {
        console.error("Error parsing tags:", e);
      }
    }

    if (req.body.includes && typeof req.body.includes === "string") {
      try {
        req.body.includes = JSON.parse(req.body.includes);
      } catch (e) {
        console.error("Error parsing includes:", e);
      }
    }

    if (req.body.ticketTypes && typeof req.body.ticketTypes === "string") {
      try {
        req.body.ticketTypes = JSON.parse(req.body.ticketTypes);
      } catch (e) {
        console.error("Error parsing ticketTypes:", e);
      }
    }

    if (req.body.requirements && typeof req.body.requirements === "string") {
      try {
        req.body.requirements = JSON.parse(req.body.requirements);
      } catch (e) {
        console.error("Error parsing requirements:", e);
      }
    }

    if (req.body.existingImages && typeof req.body.existingImages === "string") {
      try {
        req.body.existingImages = JSON.parse(req.body.existingImages);
      } catch (e) {
        console.error("Error parsing existingImages:", e);
      }
    }

    if (req.body.imagesToDelete && typeof req.body.imagesToDelete === "string") {
      try {
        req.body.imagesToDelete = JSON.parse(req.body.imagesToDelete);
      } catch (e) {
        console.error("Error parsing imagesToDelete:", e);
      }
    }

    // Handle image deletions
    if (req.body.imagesToDelete && Array.isArray(req.body.imagesToDelete)) {
      for (const publicId of req.body.imagesToDelete) {
        try {
          // Delete from Cloudinary
          await cloudinary.uploader.destroy(publicId);
          
          // Remove from event images array
          event.images = event.images.filter(img => img.publicId !== publicId);
        } catch (cloudinaryError) {
          console.error("Cloudinary delete error:", cloudinaryError);
        }
      }
    }

    // Handle existing images update
    if (req.body.existingImages && Array.isArray(req.body.existingImages)) {
      // Keep only the images that are in existingImages array
      event.images = event.images.filter(img => 
        req.body.existingImages.includes(img.url)
      );
    }

    // Update allowed fields
    const allowedUpdates = [
      "title",
      "description",
      "longDescription",
      "category",
      "date",
      "time",
      "endTime",
      "venue",
      "address",
      "city",
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
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "date") {
          event[field] = new Date(req.body[field]);
        } else if (field === "price" || field === "capacity") {
          event[field] = parseFloat(req.body[field]);
        } else if (field === "ticketTypes") {
          if (Array.isArray(req.body[field])) {
            event[field] = req.body[field].map(ticket => ({
              name: ticket.name,
              price: parseFloat(ticket.price),
              capacity: parseInt(ticket.capacity),
              availableTickets: ticket.availableTickets !== undefined 
                ? parseInt(ticket.availableTickets) 
                : parseInt(ticket.capacity),
              description: ticket.description || "",
              benefits: ticket.benefits || [],
            }));
          }
        } else if (field === "tags" || field === "includes" || field === "requirements") {
          if (Array.isArray(req.body[field])) {
            event[field] = req.body[field];
          } else if (typeof req.body[field] === "string") {
            event[field] = req.body[field]
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
          }
        } else {
          event[field] = req.body[field];
        }
      }
    });

    // If capacity increased (legacy), update available tickets
    if (req.body.capacity && req.body.capacity > event.capacity && !event.ticketTypes?.length) {
      const increase = req.body.capacity - event.capacity;
      event.availableTickets += increase;
    }

    await event.save();

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      event,
    });
  } catch (error) {
    console.error("Update event error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return next(new ErrorResponse(messages.join(", "), 400));
    }

    next(new ErrorResponse("Failed to update event", 500));
  }
};

// @desc    Delete event image
// @route   DELETE /api/v1/events/:id/images/:imageIndex
// @access  Private (Organizer only)
const deleteEventImage = async (req, res, next) => {
  try {
    const { id, imageIndex } = req.params;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Check ownership
    if (
      event.organizer.toString() !== req.user.userId &&
      req.user.role !== "superadmin"
    ) {
      return next(new ErrorResponse("Not authorized", 403));
    }

    const index = parseInt(imageIndex);
    if (index < 0 || index >= event.images.length) {
      return next(new ErrorResponse("Invalid image index", 400));
    }

    const image = event.images[index];

    // Delete from Cloudinary
    if (image.publicId) {
      try {
        await cloudinary.uploader.destroy(image.publicId);
      } catch (cloudinaryError) {
        console.error("Cloudinary delete error:", cloudinaryError);
      }
    }

    // Remove from array
    event.images.splice(index, 1);
    await event.save();

    res.status(200).json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Delete image error:", error);
    next(new ErrorResponse("Failed to delete image", 500));
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

    // Check ownership
    if (
      event.organizer.toString() !== req.user.userId &&
      req.user.role !== "superadmin"
    ) {
      return next(
        new ErrorResponse("Not authorized to delete this event", 403)
      );
    }

    // Check if event has bookings
    if (event.totalAttendees > 0) {
      return next(
        new ErrorResponse(
          "Cannot delete event with existing bookings. Please cancel the event instead.",
          400
        )
      );
    }

    // Delete images from Cloudinary
    for (const image of event.images) {
      if (image.publicId) {
        try {
          await cloudinary.uploader.destroy(image.publicId);
        } catch (cloudinaryError) {
          console.error("Cloudinary delete error:", cloudinaryError);
        }
      }
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
    console.error("Delete event error:", error);
    next(new ErrorResponse("Failed to delete event", 500));
  }
};

// @desc    Get organizer's events
// @route   GET /api/v1/events/organizer/my-events
// @access  Private (Organizer only)
const getOrganizerEvents = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {
      organizer: req.user.userId,
      isActive: true,
    };

    if (status) {
      query.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const events = await Event.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Event.countDocuments(query);

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      events,
    });
  } catch (error) {
    console.error("Get organizer events error:", error);
    next(new ErrorResponse("Failed to fetch organizer events", 500));
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
    console.error("Get statistics error:", error);
    next(new ErrorResponse("Failed to fetch statistics", 500));
  }
};

// @desc    Book event ticket
// @route   POST /api/v1/events/:id/book
// @access  Private
const bookEventTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ticketType = "Regular", quantity = 1 } = req.body;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    if (event.status !== "published") {
      return next(new ErrorResponse("Event is not available for booking", 400));
    }

    // Check if user already booked
    const existingBooking = event.attendees.find(
      (a) => a.user.toString() === req.user.userId && a.status === "confirmed"
    );

    if (existingBooking) {
      return next(new ErrorResponse("You have already booked this event", 400));
    }

    // Book ticket with ticket type
    const bookingResult = await event.bookTicket(req.user.userId, ticketType, quantity);

    res.status(200).json({
      success: true,
      message: "Ticket(s) booked successfully",
      booking: {
        ticketId: bookingResult.ticketId,
        ticketType: bookingResult.ticketType || ticketType,
        quantity: bookingResult.quantity || quantity,
        totalPrice: bookingResult.totalPrice,
      },
      event: {
        id: event._id,
        title: event.title,
        date: event.date,
        venue: event.venue,
      },
    });
  } catch (error) {
    console.error("Book ticket error:", error);
    next(new ErrorResponse(error.message || "Failed to book ticket", 500));
  }
};

// @desc    Cancel booking
// @route   DELETE /api/v1/events/:id/cancel-booking
// @access  Private
const cancelBooking = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    await event.cancelBooking(req.user.userId);

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    next(new ErrorResponse(error.message || "Failed to cancel booking", 500));
  }
};

// @desc    Get user's booked events
// @route   GET /api/v1/events/my-bookings
// @access  Private
const getMyBookings = async (req, res, next) => {
  try {
    const { status = "confirmed", page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const events = await Event.find({
      "attendees.user": req.user.userId,
      "attendees.status": status,
      isActive: true,
    })
      .sort({ date: 1 })
      .skip(skip)
      .limit(limitNum)
      .populate("organizer", "firstName lastName userName organizerInfo");

    // Filter to only include user's booking details
    const bookings = events.map((event) => {
      const userBooking = event.attendees.find(
        (a) => a.user.toString() === req.user.userId
      );

      return {
        event: {
          id: event._id,
          title: event.title,
          description: event.description,
          category: event.category,
          date: event.date,
          time: event.time,
          endTime: event.endTime,
          venue: event.venue,
          address: event.address,
          city: event.city,
          images: event.images,
          organizer: event.organizer,
          status: event.status,
          ticketTypes: event.ticketTypes,
        },
        booking: userBooking,
      };
    });

    const total = await Event.countDocuments({
      "attendees.user": req.user.userId,
      "attendees.status": status,
      isActive: true,
    });

    res.status(200).json({
      success: true,
      count: bookings.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      bookings,
    });
  } catch (error) {
    console.error("Get bookings error:", error);
    next(new ErrorResponse("Failed to fetch bookings", 500));
  }
};

// @desc    Like/Unlike event
// @route   POST /api/v1/events/:id/like
// @access  Private
const toggleLikeEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    await event.toggleLike(req.user.userId);

    const isLiked = event.likes.includes(req.user.userId);

    res.status(200).json({
      success: true,
      message: isLiked ? "Event liked" : "Event unliked",
      totalLikes: event.totalLikes,
      isLiked,
    });
  } catch (error) {
    console.error("Toggle like error:", error);
    next(new ErrorResponse("Failed to toggle like", 500));
  }
};

// @desc    Cancel event
// @route   PUT /api/v1/events/:id/cancel
// @access  Private (Organizer only)
const cancelEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Check ownership
    if (
      event.organizer.toString() !== req.user.userId &&
      req.user.role !== "superadmin"
    ) {
      return next(
        new ErrorResponse("Not authorized to cancel this event", 403)
      );
    }

    await event.cancelEvent(reason);

    res.status(200).json({
      success: true,
      message: "Event cancelled successfully",
      event,
    });
  } catch (error) {
    console.error("Cancel event error:", error);
    next(new ErrorResponse("Failed to cancel event", 500));
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
    console.error("Get featured events error:", error);
    next(new ErrorResponse("Failed to fetch featured events", 500));
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
    console.error("Get upcoming events error:", error);
    next(new ErrorResponse("Failed to fetch upcoming events", 500));
  }
};

// @desc    Get ticket availability by type
// @route   GET /api/v1/events/:id/ticket-availability
// @access  Public
const getTicketAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    let availability;

    if (event.ticketTypes && event.ticketTypes.length > 0) {
      availability = event.ticketTypes.map(ticket => ({
        type: ticket.name,
        price: ticket.price,
        capacity: ticket.capacity,
        available: ticket.availableTickets,
        soldOut: ticket.availableTickets === 0,
        percentageSold: Math.round(((ticket.capacity - ticket.availableTickets) / ticket.capacity) * 100),
      }));
    } else {
      availability = [{
        type: "General",
        price: event.price,
        capacity: event.capacity,
        available: event.availableTickets,
        soldOut: event.availableTickets === 0,
        percentageSold: Math.round(((event.capacity - event.availableTickets) / event.capacity) * 100),
      }];
    }

    res.status(200).json({
      success: true,
      availability,
      totalCapacity: event.totalCapacity,
      totalAvailable: event.totalAvailableTickets,
      isSoldOut: event.isSoldOut,
    });
  } catch (error) {
    console.error("Get ticket availability error:", error);
    next(new ErrorResponse("Failed to fetch ticket availability", 500));
  }
};

module.exports = {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  deleteEventImage,
  getOrganizerEvents,
  getOrganizerStatistics,
  bookEventTicket,
  cancelBooking,
  getMyBookings,
  toggleLikeEvent,
  cancelEvent,
  getFeaturedEvents,
  getUpcomingEvents,
  getTicketAvailability,
};