const express = require("express");
const router = express.Router();

// ✅ ONLY EVENT CONTROLLER IMPORTS
const {
  createEvent,
  getAllEvents,
  getPastEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getOrganizerEvents,
  getOrganizerStatistics,
  cancelEvent,
  completeEvent,
  getFeaturedEvents,
  getUpcomingEvents,
  getTicketAvailability,
  searchEventsAdvanced,
} = require("../controllers/event.controller");
const { toggleLikeEvent } = require("../controllers/interactionController");
const { checkInAttendee } = require("../controllers/bookingController");

const { protect, authorize, optionalAuth } = require("../middleware/auth");
const { validateImages } = require("../middleware/fileUpload");
const {
  validateEventCreation,
  validateEventUpdate,
  validateQueryParams,
} = require("../middleware/validation");

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

// Get featured events
router.get("/featured", getFeaturedEvents);

// Get upcoming events
router.get("/upcoming", getUpcomingEvents);

// Get past events
router.get("/past", optionalAuth, validateQueryParams, getPastEvents);

// Advanced search
router.get("/search/advanced", validateQueryParams, searchEventsAdvanced);

// Get all events with filtering
router.get("/all", optionalAuth, validateQueryParams, getAllEvents);

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

// Organizer's events
router.get(
  "/organizer/my-events",
  protect,
  authorize("organizer", "superadmin"),
  validateQueryParams,
  getOrganizerEvents
);

// Organizer statistics
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

// ============================================
// ROUTES WITH :id PARAMETER
// ============================================

// Get single event by ID (PUBLIC - no auth needed)
router.get("/:id", getEventById);

// Get ticket availability (public)
router.get("/:id/ticket-availability", getTicketAvailability);

// Like/Unlike event (PROTECTED)
router.post("/:id/like", protect, toggleLikeEvent);

// Check-in attendee (Organizer only)
router.post(
  "/:id/check-in/:ticketId",
  protect,
  authorize("organizer", "superadmin"),
  checkInAttendee
);


// Cancel event (Organizer only)
router.patch(
  "/:id/cancel",
  protect,
  authorize("organizer", "superadmin"),
  cancelEvent
);

// Complete event (Organizer only)
router.put(
  "/:id/complete",
  protect,
  authorize("organizer", "superadmin"),
  completeEvent
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