const Event = require("../models/event");
const ErrorResponse = require("../utils/errorResponse");

const eventMiddleware = {
  // Pre-save middleware for events
  preSave: function(next) {
    // Generate slug if not provided
    if (this.isModified("title") && !this.slug) {
      this.slug = this.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") + `-${Date.now()}`;
    }

    // Set publishedAt if publishing
    if (this.isModified("status") && this.status === "published" && !this.publishedAt) {
      this.publishedAt = new Date();
    }

    // Validate end time
    if (this.time && this.endTime) {
      try {
        const [startHour, startMin] = this.time.split(":").map(Number);
        const [endHour, endMin] = this.endTime.split(":").map(Number);

        // Validate time components
        if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
          return next(new Error("Invalid time format"));
        }

        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        if (endMinutes <= startMinutes) {
          return next(new Error("End time must be after start time"));
        }
      } catch (error) {
        return next(new Error("Invalid time format"));
      }
    }

    // Initialize ticket types availableTickets
    if (this.ticketTypes && this.ticketTypes.length > 0) {
      this.ticketTypes.forEach((ticketType) => {
        if (ticketType.availableTickets === undefined) {
          ticketType.availableTickets = ticketType.capacity;
        }
      });
    }

    // Set default thumbnail
    if (!this.thumbnail && this.images && this.images.length > 0) {
      this.thumbnail = this.images[0].url;
    }

    next();
  },

  // Validate event ownership
  validateOwnership: async (req, res, next) => {
    try {
      const event = await Event.findById(req.params.id);
      
      if (!event) {
        return next(new ErrorResponse("Event not found", 404));
      }

      if (event.organizer.toString() !== req.user.id) {
        return next(new ErrorResponse("Not authorized to access this event", 403));
      }

      req.event = event;
      next();
    } catch (error) {
      next(error);
    }
  },

  // Validate event is published
  validatePublished: (req, res, next) => {
    if (req.event.status !== "published") {
      return next(new ErrorResponse("Event is not available for booking", 400));
    }
    next();
  },

  // Validate event date is in future
  validateFutureEvent: (req, res, next) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(req.event.date);
    eventDate.setHours(0, 0, 0, 0);
    
    if (eventDate < today) {
      return next(new ErrorResponse("Event has already passed", 400));
    }
    next();
  },

  // Validate event capacity for booking
  validateCapacity: (req, res, next) => {
    const { quantity = 1, ticketType = "Regular" } = req.body;
    const event = req.event;

    if (event.ticketTypes && event.ticketTypes.length > 0) {
      const selectedTicket = event.ticketTypes.find(tt => tt.name === ticketType);
      
      if (!selectedTicket) {
        return next(new ErrorResponse(`Ticket type '${ticketType}' not found`, 400));
      }
      
      if (selectedTicket.availableTickets < quantity) {
        return next(new ErrorResponse(`Not enough ${ticketType} tickets available`, 400));
      }
    } else if (event.availableTickets < quantity) {
      return next(new ErrorResponse("Not enough tickets available", 400));
    }

    next();
  },

  // Add virtual fields to response
  addVirtualFields: (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(data) {
      if (data.success && data.data) {
        if (Array.isArray(data.data)) {
          // Handle array of events
          data.data = data.data.map(event => ({
            ...event.toObject ? event.toObject() : event,
            eventUrl: `/event/${event.slug || event._id}`,
            isAvailable: eventMiddleware.isEventAvailable(event),
            isSoldOut: eventMiddleware.isEventSoldOut(event),
            totalCapacity: eventMiddleware.getTotalCapacity(event),
            totalAvailableTickets: eventMiddleware.getTotalAvailableTickets(event),
            attendancePercentage: eventMiddleware.getAttendancePercentage(event),
            daysUntilEvent: eventMiddleware.getDaysUntilEvent(event),
            priceRange: eventMiddleware.getPriceRange(event)
          }));
        } else if (data.data.toObject) {
          // Handle single event
          const event = data.data;
          data.data = {
            ...event.toObject(),
            eventUrl: `/event/${event.slug || event._id}`,
            isAvailable: eventMiddleware.isEventAvailable(event),
            isSoldOut: eventMiddleware.isEventSoldOut(event),
            totalCapacity: eventMiddleware.getTotalCapacity(event),
            totalAvailableTickets: eventMiddleware.getTotalAvailableTickets(event),
            attendancePercentage: eventMiddleware.getAttendancePercentage(event),
            daysUntilEvent: eventMiddleware.getDaysUntilEvent(event),
            priceRange: eventMiddleware.getPriceRange(event)
          };
        }
      }
      originalJson.call(this, data);
    };
    next();
  },

  // Check if event is available
  isEventAvailable: (event) => {
    const now = new Date();
    const isFutureDate = new Date(event.date) > now;
    const isPublished = event.status === "published";

    if (event.ticketTypes && event.ticketTypes.length > 0) {
      const hasAvailableTickets = event.ticketTypes.some(
        (tt) => tt.availableTickets > 0
      );
      return hasAvailableTickets && isPublished && isFutureDate;
    }
    return event.availableTickets > 0 && isPublished && isFutureDate;
  },

  // Check if event is sold out
  isEventSoldOut: (event) => {
    if (event.ticketTypes && event.ticketTypes.length > 0) {
      return event.ticketTypes.every((tt) => tt.availableTickets === 0);
    }
    return event.availableTickets === 0;
  },

  // Get total capacity
  getTotalCapacity: (event) => {
    if (event.ticketTypes && event.ticketTypes.length > 0) {
      return event.ticketTypes.reduce((sum, tt) => sum + tt.capacity, 0);
    }
    return event.capacity || 0;
  },

  // Get total available tickets
  getTotalAvailableTickets: (event) => {
    if (event.ticketTypes && event.ticketTypes.length > 0) {
      return event.ticketTypes.reduce((sum, tt) => sum + tt.availableTickets, 0);
    }
    return event.availableTickets || 0;
  },

  // Get attendance percentage
  getAttendancePercentage: (event) => {
    const totalCap = eventMiddleware.getTotalCapacity(event);
    if (totalCap === 0) return 0;
    return Math.round((event.totalAttendees / totalCap) * 100);
  },

  // Get days until event
  getDaysUntilEvent: (event) => {
    const now = new Date();
    const eventDate = new Date(event.date);
    const diffTime = eventDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  },

  // Get price range
  getPriceRange: (event) => {
    if (event.ticketTypes && event.ticketTypes.length > 0) {
      const prices = event.ticketTypes.map((tt) => tt.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      return minPrice === maxPrice ? minPrice : { min: minPrice, max: maxPrice };
    }
    return event.price || 0;
  }
};

module.exports = eventMiddleware;