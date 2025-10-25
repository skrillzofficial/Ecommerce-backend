const Event = require("../models/event");
const User = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");
const { parseVoiceQuery } = require("../utils/voiceSearchParser");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const { sendBookingEmail } = require("../utils/sendEmail");

// Import Notification Service
const NotificationService = require("../service/notificationService");

// @desc    Create new event (supports both draft and published)
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
      status = "draft", // Default to draft
    } = req.body;

    // Validate required field (only title is required for both draft and published)
    if (!title) {
      return next(new ErrorResponse("Event title is required", 400));
    }

    // Validate user is organizer
    if (req.user.role !== "organizer") {
      return next(new ErrorResponse("Only organizers can create events", 403));
    }

    // If status is "published", validate all required fields
    if (status === "published") {
      if (
        !description ||
        !category ||
        !date ||
        !time ||
        !endTime ||
        !venue ||
        !address ||
        !city
      ) {
        return next(
          new ErrorResponse(
            "All required fields must be filled to publish event",
            400
          )
        );
      }
    }

    // Get organizer info
    const organizer = await User.findById(req.user.userId);
    if (!organizer) {
      return next(new ErrorResponse("Organizer not found", 404));
    }

    // Parse ticket types if it's a string (from form data)
    let parsedTicketTypes = ticketTypes;
    if (typeof ticketTypes === "string") {
      try {
        parsedTicketTypes = JSON.parse(ticketTypes);
      } catch (e) {
        console.error("Error parsing ticketTypes:", e);
        parsedTicketTypes = null;
      }
    }

    // Validate ticket types OR legacy pricing (only for published events)
    if (status === "published") {
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
        return next(
          new ErrorResponse(
            "Please provide pricing information to publish",
            400
          )
        );
      }
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

          // Better error handling for temp file deletion
          if (image.tempFilePath && fs.existsSync(image.tempFilePath)) {
            fs.unlink(image.tempFilePath, (err) => {
              if (err && err.code !== "ENOENT") {
                console.error("Failed to delete temp file:", err);
              }
            });
          }
        } catch (uploadError) {
          console.error("Image upload error:", uploadError);

          // Clean up any already uploaded images
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
    let parsedTags = tags;
    if (typeof tags === "string") {
      try {
        parsedTags = JSON.parse(tags);
      } catch (e) {
        parsedTags = tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }

    let parsedIncludes = includes;
    if (typeof includes === "string") {
      try {
        parsedIncludes = JSON.parse(includes);
      } catch (e) {
        parsedIncludes = [];
      }
    }

    let parsedRequirements = requirements;
    if (typeof requirements === "string") {
      try {
        parsedRequirements = JSON.parse(requirements);
      } catch (e) {
        parsedRequirements = [];
      }
    }

    // Create event data
    const eventData = {
      title,
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
      status: status, // Use the provided status (draft or published)
      isActive: true,
    };

    // Add optional fields if provided
    if (description) eventData.description = description;
    if (longDescription)
      eventData.longDescription = longDescription || description;
    if (category) eventData.category = category;
    if (date) eventData.date = new Date(date);
    if (time) eventData.time = time;
    if (endTime) eventData.endTime = endTime;
    if (venue) eventData.venue = venue;
    if (address) eventData.address = address;
    if (city) eventData.city = city;
    if (cancellationPolicy) eventData.cancellationPolicy = cancellationPolicy;
    if (refundPolicy) eventData.refundPolicy = refundPolicy;

    // Add ticket types OR legacy pricing
    if (
      parsedTicketTypes &&
      Array.isArray(parsedTicketTypes) &&
      parsedTicketTypes.length > 0
    ) {
      eventData.ticketTypes = parsedTicketTypes.map((ticket) => ({
        name: ticket.name,
        price: parseFloat(ticket.price),
        capacity: parseInt(ticket.capacity),
        availableTickets: parseInt(ticket.capacity),
        description: ticket.description || "",
        benefits: ticket.benefits || [],
      }));

      eventData.price = 0;
      eventData.capacity = parsedTicketTypes.reduce(
        (sum, t) => sum + parseInt(t.capacity),
        0
      );
      eventData.availableTickets = eventData.capacity;
    } else if (price !== undefined && capacity) {
      eventData.price = parseFloat(price);
      eventData.capacity = parseInt(capacity);
      eventData.availableTickets = parseInt(capacity);
    }

    // Create event
    const event = await Event.create(eventData);

    // Create notification based on status
    try {
      if (status === "published") {
        await NotificationService.createSystemNotification(req.user.userId, {
          title: "🎉 Event Published Successfully!",
          message: `Your event "${event.title}" is now live and visible to everyone.`,
          priority: "medium",
          data: {
            eventId: event._id,
            eventTitle: event.title,
          },
        });
      } else {
        await NotificationService.createSystemNotification(req.user.userId, {
          title: "📝 Event Saved as Draft",
          message: `Your event "${event.title}" has been saved. You can edit and publish it later.`,
          priority: "low",
          data: {
            eventId: event._id,
            eventTitle: event.title,
          },
        });
      }
    } catch (notificationError) {
      console.error("Failed to create event notification:", notificationError);
    }

    const successMessage =
      status === "published"
        ? "Event published successfully"
        : "Event saved as draft";

    res.status(201).json({
      success: true,
      message: successMessage,
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

      // Merge voice-parsed parameters (voice params take priority)
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

    // Only show published events to non-organizers or public users
    if (!req.user || req.user.role !== "organizer") {
      query.status = "published";
      query.date = { $gte: new Date() };
    } else if (status) {
      // Organizers can filter by status
      query.status = status;
    } else {
      // By default, show published events for organizers too in public view
      query.status = "published";
      query.date = { $gte: new Date() };
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
      // Include parsed parameters for debugging
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

    // Validate that id parameter exists and is not 'undefined'
    if (!id || id === "undefined") {
      return next(new ErrorResponse("Invalid event identifier", 400));
    }

    let event;

    // Check if id is a valid ObjectId format (24 hex characters)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    if (isValidObjectId) {
      // Try to find by ID first
      event = await Event.findById(id)
        .populate(
          "organizer",
          "firstName lastName userName email profilePicture organizerInfo"
        )
        .populate(
          "attendees.user",
          "firstName lastName userName profilePicture"
        );
    }

    // If not found by ID or ID wasn't valid ObjectId format, try slug
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
          // Delete from Cloudinary
          await cloudinary.uploader.destroy(publicId);

          // Remove from event images array
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
      // Keep only the images that are in existingImages array
      event.images = event.images.filter((img) =>
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
            event[field] = req.body[field].map((ticket) => ({
              name: ticket.name,
              price: parseFloat(ticket.price),
              capacity: parseInt(ticket.capacity),
              availableTickets:
                ticket.availableTickets !== undefined
                  ? parseInt(ticket.availableTickets)
                  : parseInt(ticket.capacity),
              description: ticket.description || "",
              benefits: ticket.benefits || [],
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

    //  Consistent user ID comparison
    const eventOrganizerId =
      event.organizer._id?.toString() || event.organizer.toString();
    const currentUserId =
      req.user._id?.toString() ||
      req.user.userId?.toString() ||
      req.user.id?.toString();

    console.log("Debug - User IDs:", {
      eventOrganizerId,
      currentUserId,
      user: req.user,
    });

    // Check ownership
    if (eventOrganizerId !== currentUserId && req.user.role !== "superadmin") {
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

    // For draft events with no bookings, allow hard delete
    // For published events, use soft delete
    if (event.status === "draft" && event.totalAttendees === 0) {
      // Hard delete for drafts with no bookings
      await Event.findByIdAndDelete(id);

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

      res.status(200).json({
        success: true,
        message: "Event permanently deleted successfully",
      });
    } else {
      // Soft delete for published events or events with attendees
      event.deletedAt = new Date();
      event.isActive = false;
      event.status = "cancelled";
      await event.save();

      res.status(200).json({
        success: true,
        message: "Event archived successfully",
        data: {
          eventId: event._id,
          status: event.status,
          deletedAt: event.deletedAt,
        },
      });
    }
  } catch (error) {
    console.error("Delete event error:", error);
    next(new ErrorResponse("Failed to delete event", 500));
  }
};
// @desc    Get organizer's events (including drafts)
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

    // Get counts by status for organizer dashboard
    const draftCount = await Event.countDocuments({
      organizer: req.user.userId,
      status: "draft",
      isActive: true,
    });
    const publishedCount = await Event.countDocuments({
      organizer: req.user.userId,
      status: "published",
      isActive: true,
    });

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      events,
      statusCounts: {
        draft: draftCount,
        published: publishedCount,
      },
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
    const { ticketType = "Regular", quantity = 1, userInfo } = req.body;

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

    // Book ticket with ticket type
    const bookingResult = await event.bookTicket(
      req.user.userId,
      bookingUserInfo,
      ticketType,
      quantity
    );

    // Create ticket purchase notification
    try {
      await NotificationService.createTicketPurchaseNotification(
        req.user.userId,
        {
          _id: bookingResult.ticketId,
          quantity: bookingResult.quantity,
          totalAmount: bookingResult.totalPrice,
          ticketType: bookingResult.ticketType,
        },
        {
          _id: event._id,
          title: event.title,
          date: event.date,
        }
      );
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
    const ticketDetails = `
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0;">${bookingResult.ticketType} x ${
      bookingResult.quantity
    }</td>
          <td style="padding: 5px 0; text-align: right;">₦${(
            bookingResult.totalPrice / bookingResult.quantity
          ).toLocaleString()}</td>
        </tr>
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
        bookingId: bookingResult.ticketId.toString(),
        ticketDetails: ticketDetails,
        totalAmount: `₦${bookingResult.totalPrice.toLocaleString()}`,
        clientUrl: `${process.env.FRONTEND_URL}/bookings/${bookingResult.ticketId}`,
      });
    } catch (emailError) {
      console.error("Failed to send booking email:", emailError);
    }

    res.status(200).json({
      success: true,
      message: "Ticket(s) booked successfully",
      booking: {
        ticketId: bookingResult.ticketId,
        ticketNumber: bookingResult.ticketNumber,
        qrCode: bookingResult.qrCode,
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

    // FIX: Safe destructuring with default value
    const { reason = "Event cancelled by organizer" } = req.body || {};

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Check ownership - FIXED: Use consistent user ID access
    const eventOrganizerId =
      event.organizer._id?.toString() || event.organizer.toString();
    const currentUserId =
      req.user._id?.toString() || req.user.userId?.toString();

    if (eventOrganizerId !== currentUserId && req.user.role !== "superadmin") {
      return next(
        new ErrorResponse("Not authorized to cancel this event", 403)
      );
    }

    // Additional validation: Check if event can be cancelled
    if (event.status === "cancelled") {
      return next(new ErrorResponse("Event is already cancelled", 400));
    }

    if (event.status === "completed") {
      return next(new ErrorResponse("Cannot cancel a completed event", 400));
    }

    // Check if event has already started
    const now = new Date();
    if (event.date && new Date(event.date) < now) {
      return next(
        new ErrorResponse(
          "Cannot cancel an event that has already started",
          400
        )
      );
    }

    await event.cancelEvent(reason);

    res.status(200).json({
      success: true,
      message: "Event cancelled successfully",
      data: {
        eventId: event._id,
        title: event.title,
        status: event.status,
        cancelledAt: event.cancelledAt,
        reason: reason,
      },
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
        },
      ];
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
  getFeaturedEvents,
  getUpcomingEvents,
  parseVoiceSearch,
  getTicketAvailability,
};
