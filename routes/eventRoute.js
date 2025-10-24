const express = require("express");
const router = express.Router();
const {
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
  getTicketAvailability,
} = require("../controllers/event.controller");

const { protect, authorize, optionalAuth } = require("../middleware/auth");
const { validateImages } = require("../middleware/fileUpload");
const {
  validateEventCreation,
  validateEventUpdate,
  validateBooking,
  validateQueryParams,
} = require("../middleware/validation");


// PUBLIC ROUTES (No authentication required)


// Get featured events
router.get("/featured", getFeaturedEvents);

// Get upcoming events
router.get("/upcoming", getUpcomingEvents);

// Get all events with filtering
router.get("/", optionalAuth, validateQueryParams, getAllEvents);

// Get past events
router.get('/past', optionalAuth, validateQueryParams, getPastEvents);

// PROTECTED ROUTES (Authentication required)


// User's bookings (MUST be before /:id)
router.get("/my-bookings", protect, validateQueryParams, getMyBookings);

// Organizer's events (MUST be before /:id)
router.get(
  "/organizer/my-events",
  protect,
  authorize("organizer", "superadmin"),
  validateQueryParams,
  getOrganizerEvents
);

// Organizer statistics (MUST be before /:id)
router.get(
  "/organizer/statistics",
  protect,
  authorize("organizer", "superadmin"),
  getOrganizerStatistics
);

// Create new event
router.post(
  "/create",
  protect,
  authorize("organizer", "superadmin"),
  validateImages,
  validateEventCreation,
  createEvent
);


// ROUTES WITH :id PARAMETER


// Get ticket availability (public)
router.get("/:id/ticket-availability", getTicketAvailability);

// Get single event by ID (PUBLIC - no auth needed)
router.get("/:id", getEventById);

// Book event ticket (PROTECTED)
router.post("/:id/book", protect, validateBooking, bookEventTicket);

// Cancel booking (PROTECTED)
router.delete("/:id/cancel-booking", protect, cancelBooking);

// Like/Unlike event (PROTECTED)
router.post("/:id/like", protect, toggleLikeEvent);

// Delete event image (Organizer only)
router.delete(
  "/:id/images/:imageIndex",
  protect,
  authorize("organizer", "superadmin"),
  deleteEventImage
);

// Cancel event (Organizer only)
router.patch(
  "/:id/cancel",
  protect,
  authorize("organizer", "superadmin"),
  cancelEvent
);

// Update event (Organizer only)
router.patch(
  "/:id",
  protect,
  authorize("organizer", "superadmin"),
  validateImages,
  validateEventUpdate,
  updateEvent
);

// Delete event (Organizer only)
router.delete(
  "/:id",
  protect,
  authorize("organizer", "superadmin"),
  deleteEvent
);

module.exports = router;