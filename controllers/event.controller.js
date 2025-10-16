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
      category,
      date,
      time,
      endTime,
      venue,
      address,
      city,
      price,
      capacity,
      tags,
      requirements,
      cancellationPolicy,
      refundPolicy,
    } = req.body;

    // Validate required fields
    if (!title || !description || !category || !date || !time || !endTime || !venue || !address || !city || price === undefined || !capacity) {
      return next(new ErrorResponse("Please provide all required fields", 400));
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

          // Delete temp file
          fs.unlink(image.tempFilePath, (err) => {
            if (err) console.error("Failed to delete temp file:", err);
          });
        } catch (uploadError) {
          console.error("Image upload error:", uploadError);
          return next(new ErrorResponse("Failed to upload event images", 500));
        }
      }
    }

    // Create event data
    const eventData = {
      title,
      description,
      category,
      date: new Date(date),
      time,
      endTime,
      venue,
      address,
      city,
      price: parseFloat(price),
      capacity: parseInt(capacity),
      availableTickets: parseInt(capacity),
      organizer: req.user.userId,
      organizerInfo: {
        name: `${organizer.firstName} ${organizer.lastName}`,
        email: organizer.email,
        companyName: organizer.organizerInfo?.companyName || "",
      },
      images: uploadedImages,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(",").map(t => t.trim())) : [],
      requirements,
      cancellationPolicy,
      refundPolicy: refundPolicy || "partial",
      status: "published",
      isActive: true,
    };

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

    // Filter by price range
    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) query.price.$gte = parseFloat(minPrice);
      if (maxPrice !== undefined) query.price.$lte = parseFloat(maxPrice);
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
      .populate("organizer", "firstName lastName userName profilePicture organizerInfo");

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
      .populate("organizer", "firstName lastName userName email profilePicture organizerInfo")
      .populate("attendees.user", "firstName lastName userName profilePicture");

    if (!event) {
      event = await Event.findOne({ slug: id })
        .populate("organizer", "firstName lastName userName email profilePicture organizerInfo")
        .populate("attendees.user", "firstName lastName userName profilePicture");
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

    // Find event
    let event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.userId && req.user.role !== "superadmin") {
      return next(new ErrorResponse("Not authorized to update this event", 403));
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

    // Update allowed fields
    const allowedUpdates = [
      "title", "description", "category", "date", "time", "endTime",
      "venue", "address", "city", "price", "capacity", "tags",
      "requirements", "cancellationPolicy", "refundPolicy", "status",
      "isFeatured"
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "date") {
          event[field] = new Date(req.body[field]);
        } else if (field === "price" || field === "capacity") {
          event[field] = parseFloat(req.body[field]);
        } else if (field === "tags" && typeof req.body[field] === "string") {
          event[field] = req.body[field].split(",").map(t => t.trim());
        } else {
          event[field] = req.body[field];
        }
      }
    });

    // If capacity increased, update available tickets
    if (req.body.capacity && req.body.capacity > event.capacity) {
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
    if (event.organizer.toString() !== req.user.userId && req.user.role !== "superadmin") {
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
    if (event.organizer.toString() !== req.user.userId && req.user.role !== "superadmin") {
      return next(new ErrorResponse("Not authorized to delete this event", 403));
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
    const { quantity = 1 } = req.body;

    const event = await Event.findById(id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    if (event.status !== "published") {
      return next(new ErrorResponse("Event is not available for booking", 400));
    }

    if (event.availableTickets < quantity) {
      return next(new ErrorResponse("Not enough tickets available", 400));
    }

    // Check if user already booked
    const existingBooking = event.attendees.find(
      a => a.user.toString() === req.user.userId && a.status === "confirmed"
    );

    if (existingBooking) {
      return next(new ErrorResponse("You have already booked this event", 400));
    }

    // Book tickets
    const tickets = [];
    for (let i = 0; i < quantity; i++) {
      const ticketId = await event.bookTicket(req.user.userId);
      tickets.push(ticketId);
    }

    res.status(200).json({
      success: true,
      message: "Ticket(s) booked successfully",
      tickets,
      event: {
        id: event._id,
        title: event.title,
        date: event.date,
        venue: event.venue,
        price: event.price,
        totalPrice: event.price * quantity,
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
    const bookings = events.map(event => {
      const userBooking = event.attendees.find(
        a => a.user.toString() === req.user.userId
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
          price: event.price,
          images: event.images,
          organizer: event.organizer,
          status: event.status,
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
    if (event.organizer.toString() !== req.user.userId && req.user.role !== "superadmin") {
      return next(new ErrorResponse("Not authorized to cancel this event", 403));
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
};