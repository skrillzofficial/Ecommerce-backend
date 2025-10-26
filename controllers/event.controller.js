const Event = require("../models/event");
const User = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");
const { parseVoiceQuery } = require("../utils/voiceSearchParser");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const { sendBookingEmail } = require("../utils/sendEmail");
const NotificationService = require("../service/notificationService");

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

    // Parse ticket types if it's a string
    let parsedTicketTypes = ticketTypes;
    if (typeof ticketTypes === "string") {
      try {
        parsedTicketTypes = JSON.parse(ticketTypes);
      } catch (e) {
        console.error("Error parsing ticketTypes:", e);
        parsedTicketTypes = null;
      }
    }

    // Validate ticket types OR legacy pricing
    if (
      parsedTicketTypes &&
      Array.isArray(parsedTicketTypes) &&
      parsedTicketTypes.length > 0
    ) {
      for (const ticket of parsedTicketTypes) {
        if (!ticket.name || ticket.price === undefined || !ticket.capacity) {
          return next(
            new ErrorResponse(
              "Each ticket type must have name, price, and capacity",
              400
            )
          );
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

          if (image.tempFilePath && fs.existsSync(image.tempFilePath)) {
            fs.unlink(image.tempFilePath, (err) => {
              if (err && err.code !== "ENOENT") {
                console.error("Failed to delete temp file:", err);
              }
            });
          }
        } catch (uploadError) {
          console.error("Image upload error:", uploadError);
          for (const uploadedImg of uploadedImages) {
            try {
              await cloudinary.uploader.destroy(uploadedImg.publicId);
            } catch (cleanupError) {
              console.error("Cleanup error:", cleanupError);
            }
          }
          return next(new ErrorResponse("Failed to upload event images", 500));
        }
      }
    }

    // Parse arrays from form data
    const safeParseArray = (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          return value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
        }
      }
      return [];
    };

    const parsedTags = safeParseArray(tags);
    const parsedIncludes = safeParseArray(includes);
    const parsedRequirements = safeParseArray(requirements);

    // Safe number parsing function
    const safeParseNumber = (value, defaultValue = 0) => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

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
      tags: parsedTags,
      includes: parsedIncludes,
      requirements: parsedRequirements,
      cancellationPolicy,
      refundPolicy: refundPolicy || "partial",
      status: "published",
      isActive: true,
    };

    // Add ticket types OR legacy pricing with safe number parsing
    if (
      parsedTicketTypes &&
      Array.isArray(parsedTicketTypes) &&
      parsedTicketTypes.length > 0
    ) {
      eventData.ticketTypes = parsedTicketTypes.map((ticket) => ({
        name: ticket.name,
        price: safeParseNumber(ticket.price, 0),
        capacity: safeParseNumber(ticket.capacity, 1),
        availableTickets: safeParseNumber(ticket.capacity, 1),
        description: ticket.description || "",
        benefits: ticket.benefits || [],
        isFree: safeParseNumber(ticket.price, 0) === 0,
      }));

      eventData.price = 0;
      eventData.capacity = parsedTicketTypes.reduce(
        (sum, t) => sum + safeParseNumber(t.capacity, 1),
        0
      );
      eventData.availableTickets = eventData.capacity;
    } else {
      eventData.price = safeParseNumber(price, 0);
      eventData.capacity = safeParseNumber(capacity, 1);
      eventData.availableTickets = safeParseNumber(capacity, 1);
    }

    // Create event
    const event = await Event.create(eventData);

    // Create event creation notification
    try {
      await NotificationService.createSystemNotification(req.user.userId, {
        title: "🎉 Event Created Successfully!",
        message: `Your event "${event.title}" has been created and is now live.`,
        priority: "medium",
        data: {
          eventId: event._id,
          eventTitle: event.title,
        },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create event creation notification:",
        notificationError
      );
    }

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
    let {
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
      isVoiceSearch = false,
    } = req.query;

    // Parse voice search query if flagged
    if (isVoiceSearch === "true" && search) {
      console.log("Voice search detected:", search);
      const voiceParams = parseVoiceQuery(search);
      console.log("Parsed voice parameters:", voiceParams);

      search = voiceParams.search || search;
      category = voiceParams.category || category;
      city = voiceParams.city || city;
      minPrice = voiceParams.minPrice || minPrice;
      maxPrice = voiceParams.maxPrice || maxPrice;
      startDate = voiceParams.startDate || startDate;
      endDate = voiceParams.endDate || endDate;
    }

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

    // Filter by price range
    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceQuery = [];

      if (minPrice !== undefined || maxPrice !== undefined) {
        const legacyPriceQuery = { price: {} };
        if (minPrice !== undefined)
          legacyPriceQuery.price.$gte = parseFloat(minPrice);
        if (maxPrice !== undefined)
          legacyPriceQuery.price.$lte = parseFloat(maxPrice);
        priceQuery.push(legacyPriceQuery);
      }

      if (minPrice !== undefined || maxPrice !== undefined) {
        const ticketTypePriceQuery = { "ticketTypes.price": {} };
        if (minPrice !== undefined)
          ticketTypePriceQuery["ticketTypes.price"].$gte = parseFloat(minPrice);
        if (maxPrice !== undefined)
          ticketTypePriceQuery["ticketTypes.price"].$lte = parseFloat(maxPrice);
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
      ...(isVoiceSearch === "true" && {
        voiceSearchParams: {
          originalQuery: req.query.search,
          parsedCategory: category,
          parsedCity: city,
          parsedPriceRange: { min: minPrice, max: maxPrice },
          parsedDateRange: { start: startDate, end: endDate },
        },
      }),
    });
  } catch (error) {
    console.error("Get all events error:", error);
    next(new ErrorResponse("Failed to fetch events", 500));
  }
};

// @desc    Get past events
// @route   GET /api/v1/events/past
// @access  Public
const getPastEvents = async (req, res, next) => {
  try {
    const {
      search,
      category,
      city,
      page = 1,
      limit = 12,
      sort = "-date",
    } = req.query;

    // Build query for past events
    const query = {
      isActive: true,
      status: "published",
      date: { $lt: new Date() },
    };

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

    // Sorting
    let sortOption = {};
    switch (sort) {
      case "date":
        sortOption = { date: 1 };
        break;
      case "-date":
        sortOption = { date: -1 };
        break;
      case "popular":
        sortOption = { views: -1, totalLikes: -1 };
        break;
      case "attendees":
        sortOption = { totalAttendees: -1 };
        break;
      default:
        sortOption = { date: -1 };
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
      data: events,
    });
  } catch (error) {
    console.error("Get past events error:", error);
    next(new ErrorResponse("Failed to fetch past events", 500));
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
    if (req.body["tags[]"]) {
      req.body.tags = Array.isArray(req.body["tags[]"])
        ? req.body["tags[]"]
        : [req.body["tags[]"]];
      delete req.body["tags[]"];
    }

    if (req.body["includes[]"]) {
      req.body.includes = Array.isArray(req.body["includes[]"])
        ? req.body["includes[]"]
        : [req.body["includes[]"]];
      delete req.body["includes[]"];
    }

    if (req.body["requirements[]"]) {
      req.body.requirements = Array.isArray(req.body["requirements[]"])
        ? req.body["requirements[]"]
        : [req.body["requirements[]"]];
      delete req.body["requirements[]"];
    }

    if (req.body["existingImages[]"]) {
      req.body.existingImages = Array.isArray(req.body["existingImages[]"])
        ? req.body["existingImages[]"]
        : [req.body["existingImages[]"]];
      delete req.body["existingImages[]"];
    }

    if (req.body["imagesToDelete[]"]) {
      req.body.imagesToDelete = Array.isArray(req.body["imagesToDelete[]"])
        ? req.body["imagesToDelete[]"]
        : [req.body["imagesToDelete[]"]];
      delete req.body["imagesToDelete[]"];
    }

    // Handle JSON fields from frontend
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

    if (
      req.body.existingImages &&
      typeof req.body.existingImages === "string"
    ) {
      try {
        req.body.existingImages = JSON.parse(req.body.existingImages);
      } catch (e) {
        console.error("Error parsing existingImages:", e);
      }
    }

    if (
      req.body.imagesToDelete &&
      typeof req.body.imagesToDelete === "string"
    ) {
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
          await cloudinary.uploader.destroy(publicId);
          event.images = event.images.filter(
            (img) => img.publicId !== publicId
          );
        } catch (cloudinaryError) {
          console.error("Cloudinary delete error:", cloudinaryError);
        }
      }
    }

    // Handle existing images update
    if (req.body.existingImages && Array.isArray(req.body.existingImages)) {
      event.images = event.images.filter((img) =>
        req.body.existingImages.includes(img.url)
      );
    }

    // Safe number parsing function
    const safeParseNumber = (value, defaultValue = 0) => {
      if (value === undefined || value === null) return defaultValue;
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

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
          event[field] = safeParseNumber(
            req.body[field],
            field === "capacity" ? 1 : 0
          );
        } else if (field === "ticketTypes") {
          if (Array.isArray(req.body[field])) {
            event[field] = req.body[field].map((ticket) => ({
              name: ticket.name,
              price: safeParseNumber(ticket.price, 0),
              capacity: safeParseNumber(ticket.capacity, 1),
              availableTickets: safeParseNumber(
                ticket.availableTickets !== undefined
                  ? ticket.availableTickets
                  : ticket.capacity,
                safeParseNumber(ticket.capacity, 1)
              ),
              description: ticket.description || "",
              benefits: ticket.benefits || [],
              isFree: safeParseNumber(ticket.price, 0) === 0,
            }));
          }
        } else if (
          field === "tags" ||
          field === "includes" ||
          field === "requirements"
        ) {
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
    if (
      req.body.capacity &&
      req.body.capacity > event.capacity &&
      !event.ticketTypes?.length
    ) {
      const increase =
        safeParseNumber(req.body.capacity) - safeParseNumber(event.capacity);
      event.availableTickets =
        safeParseNumber(event.availableTickets) + increase;
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

// @desc    Book event tickets (multiple ticket types support)
// @route   POST /api/v1/events/:id/book
// @access  Private
const bookEventTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ticketBookings, userInfo } = req.body;

    // Validate input
    if (
      !ticketBookings ||
      !Array.isArray(ticketBookings) ||
      ticketBookings.length === 0
    ) {
      return next(
        new ErrorResponse("Please provide at least one ticket booking", 400)
      );
    }

    // Validate each ticket booking
    for (const booking of ticketBookings) {
      const { ticketType, quantity } = booking;
      if (!ticketType || !quantity) {
        return next(
          new ErrorResponse(
            "Each booking must have ticketType and quantity",
            400
          )
        );
      }

      const parsedQuantity = parseInt(quantity);
      if (isNaN(parsedQuantity) || parsedQuantity < 1) {
        return next(
          new ErrorResponse(`Invalid quantity for ${ticketType} tickets`, 400)
        );
      }

      if (parsedQuantity > 10) {
        return next(
          new ErrorResponse(
            `Cannot book more than 10 ${ticketType} tickets at once`,
            400
          )
        );
      }
    }

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

    // Get user info for booking
    const user = await User.findById(req.user.userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Prepare user info for booking
    const bookingUserInfo = {
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone || "",
    };

    // Book tickets using the new method
    const bookingResult = await event.bookTickets(
      req.user.userId,
      bookingUserInfo,
      ticketBookings
    );

    // Create ticket purchase notifications for each ticket
    try {
      for (const ticket of bookingResult.tickets) {
        await NotificationService.createTicketPurchaseNotification(
          req.user.userId,
          {
            _id: ticket.ticketId,
            quantity: ticket.quantity,
            totalAmount: ticket.totalPrice,
            ticketType: ticket.ticketType,
          },
          {
            _id: event._id,
            title: event.title,
            date: event.date,
          }
        );
      }
    } catch (notificationError) {
      console.error(
        "Failed to create ticket purchase notification:",
        notificationError
      );
    }

    // Format event date for email
    const eventDate = new Date(event.date).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Prepare ticket details for email
    const ticketDetails = bookingResult.tickets
      .map(
        (ticket) => `
      <tr>
        <td style="padding: 5px 0;">${ticket.ticketType} x ${
          ticket.quantity
        }</td>
        <td style="padding: 5px 0; text-align: right;">₦${(
          ticket.totalPrice / ticket.quantity
        ).toLocaleString()}</td>
      </tr>
    `
      )
      .join("");

    const emailTemplate = `
      <table style="width: 100%; border-collapse: collapse;">
        ${ticketDetails}
        <tr>
          <td style="padding: 5px 0; border-bottom: 1px solid #e0e0e0;">Subtotal</td>
          <td style="padding: 5px 0; text-align: right; border-bottom: 1px solid #e0e0e0;">₦${bookingResult.totalPrice.toLocaleString()}</td>
        </tr>
      </table>
    `;

    // Send booking confirmation email
    try {
      await sendBookingEmail({
        fullName: bookingUserInfo.name,
        email: bookingUserInfo.email,
        eventName: event.title,
        eventDate: eventDate,
        eventTime: event.time,
        eventVenue: event.venue,
        eventAddress: event.address,
        bookingId: bookingResult.tickets[0].ticketId.toString(),
        ticketDetails: emailTemplate,
        totalAmount: `₦${bookingResult.totalPrice.toLocaleString()}`,
        clientUrl: `${process.env.FRONTEND_URL}/bookings/${bookingResult.tickets[0].ticketId}`,
      });
    } catch (emailError) {
      console.error("Failed to send booking email:", emailError);
    }

    // Emit real-time updates via Socket.IO
    if (global.io) {
      global.io.emit("new-ticket-purchase", {
        eventId: event._id,
        eventName: event.title,
        tickets: bookingResult.tickets,
        userName: bookingUserInfo.name,
        totalAmount: bookingResult.totalPrice,
        purchaseDate: new Date(),
      });

      // Notify organizer
      global.io.to(`organizer-${event.organizer}`).emit("ticket-sold", {
        eventId: event._id,
        tickets: bookingResult.tickets,
        userName: bookingUserInfo.name,
        totalAmount: bookingResult.totalPrice,
      });
    }

    res.status(200).json({
      success: true,
      message: "Ticket(s) booked successfully",
      booking: {
        tickets: bookingResult.tickets,
        totalQuantity: bookingResult.totalQuantity,
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

    // Create booking cancellation notification
    try {
      await NotificationService.createSystemNotification(req.user.userId, {
        title: "❌ Booking Cancelled",
        message: `Your booking for "${event.title}" has been cancelled successfully.`,
        priority: "medium",
      });
    } catch (notificationError) {
      console.error(
        "Failed to create cancellation notification:",
        notificationError
      );
    }

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

// @desc    Complete event
// @route   PUT /api/v1/events/:id/complete
// @access  Private (Organizer only)
const completeEvent = async (req, res, next) => {
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
        new ErrorResponse("Not authorized to complete this event", 403)
      );
    }

    await event.completeEvent();

    res.status(200).json({
      success: true,
      message: "Event marked as completed",
      event,
    });
  } catch (error) {
    console.error("Complete event error:", error);
    next(new ErrorResponse("Failed to complete event", 500));
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

// @desc    Parse voice search query
// @route   POST /api/v1/events/voice-search
// @access  Public
const parseVoiceSearch = async (req, res, next) => {
  try {
    const { query } = req.body;

    if (!query) {
      return next(
        new ErrorResponse("Please provide a voice search query", 400)
      );
    }

    const parsedParams = parseVoiceQuery(query);

    res.status(200).json({
      success: true,
      originalQuery: query,
      parsedParameters: parsedParams,
      message: "Voice query parsed successfully",
    });
  } catch (error) {
    console.error("Parse voice search error:", error);
    next(new ErrorResponse("Failed to parse voice search", 500));
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
      availability = event.ticketTypes.map((ticket) => ({
        type: ticket.name,
        price: ticket.price,
        capacity: ticket.capacity,
        available: ticket.availableTickets,
        soldOut: ticket.availableTickets === 0,
        percentageSold: Math.round(
          ((ticket.capacity - ticket.availableTickets) / ticket.capacity) * 100
        ),
        isFree: ticket.price === 0,
      }));
    } else {
      availability = [
        {
          type: "General",
          price: event.price,
          capacity: event.capacity,
          available: event.availableTickets,
          soldOut: event.availableTickets === 0,
          percentageSold: Math.round(
            ((event.capacity - event.availableTickets) / event.capacity) * 100
          ),
          isFree: event.price === 0,
        },
      ];
    }

    res.status(200).json({
      success: true,
      availability,
      totalCapacity: event.totalCapacity,
      totalAvailable: event.totalAvailableTickets,
      isSoldOut: event.isSoldOut,
      hasFreeTickets: event.hasFreeTickets,
    });
  } catch (error) {
    console.error("Get ticket availability error:", error);
    next(new ErrorResponse("Failed to fetch ticket availability", 500));
  }
};

// @desc    Check in attendee
// @route   POST /api/v1/events/:id/check-in/:ticketId
// @access  Private (Organizer only)
const checkInAttendee = async (req, res, next) => {
  try {
    const { id, ticketId } = req.params;

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
        new ErrorResponse("Not authorized to check in attendees", 403)
      );
    }

    const attendee = await event.checkInAttendee(ticketId);

    res.status(200).json({
      success: true,
      message: "Attendee checked in successfully",
      attendee: {
        userName: attendee.userInfo?.name || "Unknown",
        ticketType: attendee.ticketType,
        checkedInAt: attendee.checkedInAt,
      },
    });
  } catch (error) {
    console.error("Check in attendee error:", error);
    next(
      new ErrorResponse(error.message || "Failed to check in attendee", 500)
    );
  }
};

// @desc    Start live location sharing
// @route   POST /api/v1/events/:id/start-location-sharing
// @access  Private (Organizer only)
const startLocationSharing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, address, accuracy } = req.body;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.userId) {
      return next(
        new ErrorResponse("Only event organizer can share location", 403)
      );
    }

    const locationData = {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      address: address || "",
      accuracy: accuracy || 50,
    };

    const liveLocation = await event.startLocationSharing(
      req.user.userId,
      locationData
    );

    // Emit real-time update
    if (global.io) {
      global.io.emit("location-sharing-started", {
        eventId: event._id,
        eventName: event.title,
        location: liveLocation.currentLocation,
        startedBy: req.user.userId,
      });
    }

    res.status(200).json({
      success: true,
      message: "Location sharing started",
      liveLocation,
    });
  } catch (error) {
    console.error("Start location sharing error:", error);
    next(
      new ErrorResponse(
        error.message || "Failed to start location sharing",
        500
      )
    );
  }
};

// @desc    Update live location
// @route   PUT /api/v1/events/:id/update-location
// @access  Private (Organizer only)
const updateLiveLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, address, accuracy } = req.body;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.userId) {
      return next(
        new ErrorResponse("Only event organizer can update location", 403)
      );
    }

    const locationData = {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      address: address || "",
      accuracy: accuracy || 50,
    };

    const liveLocation = await event.updateLiveLocation(
      req.user.userId,
      locationData
    );

    // Emit real-time update
    if (global.io) {
      global.io.emit("location-updated", {
        eventId: event._id,
        eventName: event.title,
        location: liveLocation.currentLocation,
        updatedAt: liveLocation.lastUpdated,
      });
    }

    res.status(200).json({
      success: true,
      message: "Location updated",
      liveLocation,
    });
  } catch (error) {
    console.error("Update live location error:", error);
    next(new ErrorResponse(error.message || "Failed to update location", 500));
  }
};

// @desc    Stop live location sharing
// @route   POST /api/v1/events/:id/stop-location-sharing
// @access  Private (Organizer only)
const stopLocationSharing = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.userId) {
      return next(
        new ErrorResponse("Only event organizer can stop location sharing", 403)
      );
    }

    await event.stopLocationSharing(req.user.userId);

    // Emit real-time update
    if (global.io) {
      global.io.emit("location-sharing-stopped", {
        eventId: event._id,
        eventName: event.title,
        stoppedBy: req.user.userId,
      });
    }

    res.status(200).json({
      success: true,
      message: "Location sharing stopped",
    });
  } catch (error) {
    console.error("Stop location sharing error:", error);
    next(
      new ErrorResponse(error.message || "Failed to stop location sharing", 500)
    );
  }
};

// @desc    Search events with advanced filters
// @route   GET /api/v1/events/search/advanced
// @access  Public
const searchEventsAdvanced = async (req, res, next) => {
  try {
    const {
      query,
      category,
      city,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      hasFreeTickets,
      isOnline,
      page = 1,
      limit = 12,
      sort = "date",
    } = req.query;

    const searchQuery = {
      status: "published",
      isActive: true,
      date: { $gte: new Date() },
    };

    if (query) {
      searchQuery.$text = { $search: query };
    }

    if (category) {
      searchQuery.category = category;
    }

    if (city) {
      searchQuery.city = city;
    }

    // Price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceQuery = [];

      if (minPrice !== undefined || maxPrice !== undefined) {
        const legacyPriceQuery = { price: {} };
        if (minPrice !== undefined)
          legacyPriceQuery.price.$gte = parseFloat(minPrice);
        if (maxPrice !== undefined)
          legacyPriceQuery.price.$lte = parseFloat(maxPrice);
        priceQuery.push(legacyPriceQuery);
      }

      if (minPrice !== undefined || maxPrice !== undefined) {
        const ticketTypePriceQuery = { "ticketTypes.price": {} };
        if (minPrice !== undefined)
          ticketTypePriceQuery["ticketTypes.price"].$gte = parseFloat(minPrice);
        if (maxPrice !== undefined)
          ticketTypePriceQuery["ticketTypes.price"].$lte = parseFloat(maxPrice);
        priceQuery.push(ticketTypePriceQuery);
      }

      if (priceQuery.length > 0) {
        searchQuery.$or = priceQuery;
      }
    }

    // Date range filter
    if (startDate || endDate) {
      searchQuery.date = {};
      if (startDate) searchQuery.date.$gte = new Date(startDate);
      if (endDate) searchQuery.date.$lte = new Date(endDate);
    }

    // Free tickets filter
    if (hasFreeTickets === "true") {
      searchQuery.$or = [{ price: 0 }, { "ticketTypes.price": 0 }];
    }

    // Online events filter
    if (isOnline === "true") {
      searchQuery.venue = { $regex: /online|virtual|zoom|meet|webinar/i };
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
    const events = await Event.find(searchQuery)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .populate(
        "organizer",
        "firstName lastName userName profilePicture organizerInfo"
      );

    const total = await Event.countDocuments(searchQuery);

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      events,
      filters: {
        query,
        category,
        city,
        minPrice,
        maxPrice,
        startDate,
        endDate,
        hasFreeTickets,
        isOnline,
      },
    });
  } catch (error) {
    console.error("Advanced search error:", error);
    next(new ErrorResponse("Failed to search events", 500));
  }
};

module.exports = {
  createEvent,
  getAllEvents,
  getPastEvents,
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
  completeEvent,
  getFeaturedEvents,
  getUpcomingEvents,
  parseVoiceSearch,
  getTicketAvailability,
  checkInAttendee,
  startLocationSharing,
  updateLiveLocation,
  stopLocationSharing,
  searchEventsAdvanced,
};
