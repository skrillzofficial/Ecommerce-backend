const Event = require("../models/event");
const ErrorResponse = require("../utils/errorResponse");

const eventMiddleware = {
  // Validate event ownership
  validateOwnership: async (req, res, next) => {
    try {
      const event = await Event.findById(req.params.id);

      if (!event) {
        return next(new ErrorResponse("Event not found", 404));
      }

      // Check if user is the organizer
      const eventOrganizerId =
        event.organizer._id?.toString() || event.organizer.toString();
      const currentUserId =
        req.user._id?.toString() ||
        req.user.id?.toString() ||
        req.user.userId?.toString();

      if (
        eventOrganizerId !== currentUserId &&
        req.user.role !== "superadmin"
      ) {
        return next(
          new ErrorResponse("Not authorized to access this event", 403)
        );
      }

      req.event = event;
      next();
    } catch (error) {
      next(error);
    }
  },

  // Validate event is published (for booking operations)
  validatePublished: (req, res, next) => {
    if (req.event.status !== "published") {
      return next(new ErrorResponse("Event is not available for booking", 400));
    }
    next();
  },

  // Validate event date is in future (skip for drafts in editing)
  validateFutureEvent: (req, res, next) => {
    // Skip validation for draft events
    if (req.event.status === "draft") {
      return next();
    }

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
      const selectedTicket = event.ticketTypes.find(
        (tt) => tt.name === ticketType
      );

      if (!selectedTicket) {
        return next(
          new ErrorResponse(`Ticket type '${ticketType}' not found`, 400)
        );
      }

      if (selectedTicket.availableTickets < quantity) {
        return next(
          new ErrorResponse(`Not enough ${ticketType} tickets available`, 400)
        );
      }
    } else if (event.availableTickets < quantity) {
      return next(new ErrorResponse("Not enough tickets available", 400));
    }

    next();
  },

  // Validate event can be published (all required fields present)
  validateCanPublish: async (req, res, next) => {
    try {
      const event = req.event || (await Event.findById(req.params.id));

      if (!event) {
        return next(new ErrorResponse("Event not found", 404));
      }

      // If not trying to publish, skip validation
      if (req.body.status !== "published") {
        return next();
      }

      const errors = [];

      // Check all required fields for publishing
      if (!event.description && !req.body.description) {
        errors.push("Description is required to publish");
      }
      if (!event.category && !req.body.category) {
        errors.push("Category is required to publish");
      }
      if (!event.date && !req.body.date) {
        errors.push("Event date is required to publish");
      }
      if (!event.time && !req.body.time) {
        errors.push("Start time is required to publish");
      }
      if (!event.endTime && !req.body.endTime) {
        errors.push("End time is required to publish");
      }
      if (!event.venue && !req.body.venue) {
        errors.push("Venue is required to publish");
      }
      if (!event.address && !req.body.address) {
        errors.push("Address is required to publish");
      }
      if (!event.city && !req.body.city) {
        errors.push("City/State is required to publish");
      }

      // Check pricing
      const hasTicketTypes =
        event.ticketTypes?.length > 0 ||
        (req.body.ticketTypes &&
          JSON.parse(req.body.ticketTypes || "[]").length > 0);

      if (!hasTicketTypes) {
        if (
          (!event.price && !req.body.price) ||
          (!event.capacity && !req.body.capacity)
        ) {
          errors.push("Price and capacity are required to publish");
        }
      }

      if (errors.length > 0) {
        return next(
          new ErrorResponse(`Cannot publish event: ${errors.join(", ")}`, 400)
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  },

  // Add virtual fields to response
  addVirtualFields: (req, res, next) => {
    const originalJson = res.json;

    res.json = function (data) {
      if (data.success && data.data) {
        if (Array.isArray(data.data)) {
          // Handle array of events
          data.data = data.data.map((event) => ({
            ...(event.toObject ? event.toObject() : event),
            eventUrl: `/event/${event.slug || event._id}`,
            isAvailable: eventMiddleware.isEventAvailable(event),
            isSoldOut: eventMiddleware.isEventSoldOut(event),
            totalCapacity: eventMiddleware.getTotalCapacity(event),
            totalAvailableTickets:
              eventMiddleware.getTotalAvailableTickets(event),
            attendancePercentage:
              eventMiddleware.getAttendancePercentage(event),
            daysUntilEvent: eventMiddleware.getDaysUntilEvent(event),
            priceRange: eventMiddleware.getPriceRange(event),
            isDraft: event.status === "draft",
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
            totalAvailableTickets:
              eventMiddleware.getTotalAvailableTickets(event),
            attendancePercentage:
              eventMiddleware.getAttendancePercentage(event),
            daysUntilEvent: eventMiddleware.getDaysUntilEvent(event),
            priceRange: eventMiddleware.getPriceRange(event),
            isDraft: event.status === "draft",
          };
        }
      }
      originalJson.call(this, data);
    };
    next();
  },

  // Check if event is available (drafts are never available)
  isEventAvailable: (event) => {
    // Drafts are never available for booking
    if (event.status === "draft") {
      return false;
    }

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
    // Drafts can't be sold out
    if (event.status === "draft") {
      return false;
    }

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
      return event.ticketTypes.reduce(
        (sum, tt) => sum + tt.availableTickets,
        0
      );
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
    // Return null for drafts without dates
    if (!event.date) {
      return null;
    }

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
      return minPrice === maxPrice
        ? minPrice
        : { min: minPrice, max: maxPrice };
    }
    return event.price || 0;
  },

  // Check if event is editable (only drafts and future published events)
  isEventEditable: (event) => {
    if (event.status === "draft") {
      return true;
    }

    if (event.status === "published") {
      const now = new Date();
      const eventDate = new Date(event.date);
      return eventDate > now;
    }

    return false;
  },

  // Filter out drafts for public queries
  filterPublicEvents: (req, res, next) => {
    // If user is not authenticated or not an organizer, filter drafts
    if (!req.user || req.user.role !== "organizer") {
      req.query.status = "published";
    }
    next();
  },
};

module.exports = eventMiddleware;
