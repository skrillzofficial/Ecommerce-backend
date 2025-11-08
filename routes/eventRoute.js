const express = require("express");
const router = express.Router();

// ✅ UPDATED EVENT CONTROLLER IMPORTS
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
  updateApprovalSettings,
  getEventsNeedingApproval,
  getEventApprovalStats,
  updateShareableBanner,
  removeShareableBannerTemplate,
  deleteEventImage,
  // ✅ ADD NEW CATEGORY CONTROLLERS
  getEventsByCategories,
  getEventsThisWeek,
} = require("../controllers/event.controller");

const { parseVoiceSearch, getVoiceSuggestions } = require("../controllers/voiceSearchController");

// ✅ IMPORT BOOKING CONTROLLER
const { bookEventTicket, checkInAttendee } = require("../controllers/bookingController");

const { toggleLikeEvent } = require("../controllers/interactionController");

const { protect, authorize, optionalAuth } = require("../middleware/auth");
const { validateImages } = require("../middleware/fileUpload");
const {
  validateEventCreation,
  validateEventUpdate,
  validateQueryParams,
  validateBooking,
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

// Get events by categories
router.get("/categories", validateQueryParams, getEventsByCategories);

// Get events happening this week
router.get("/this-week", validateQueryParams, getEventsThisWeek);

// Advanced search
router.get("/search/advanced", validateQueryParams, searchEventsAdvanced);

// Get all events with filtering
router.get("/all", optionalAuth, validateQueryParams, getAllEvents);

//  VOICE SEARCH ROUTES
router.post("/voice-search", parseVoiceSearch);
router.get("/voice-search/suggestions", getVoiceSuggestions);

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

//  Get events needing approval attention
router.get(
  "/organizer/needing-approval",
  protect,
  authorize("organizer", "superadmin"),
  validateQueryParams,
  getEventsNeedingApproval
);

// Create new event
router.post(
  "/",
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

// BOOK EVENT TICKETS (PROTECTED)
router.post(
  "/:id/book",
  protect,
  validateBooking,
  bookEventTicket
);

// Like/Unlike event (PROTECTED)
router.post("/:id/like", protect, toggleLikeEvent);

// Check-in attendee (Organizer only)
router.post(
  "/:id/check-in/:ticketId",
  protect,
  authorize("organizer", "superadmin"),
  checkInAttendee
);

//  Get event approval statistics (Organizer only)
router.get(
  "/:id/approval-stats",
  protect,
  authorize("organizer", "superadmin"),
  getEventApprovalStats
);

//  Update approval settings (Organizer only)
router.patch(
  "/:id/approval-settings",
  protect,
  authorize("organizer", "superadmin"),
  updateApprovalSettings
);

//  Update shareable banner settings (Organizer only)
router.patch(
  "/:id/shareable-banner",
  protect,
  authorize("organizer", "superadmin"),
  validateImages, // Allow template image upload
  updateShareableBanner
);

//  Remove shareable banner template (Organizer only)
router.delete(
  "/:id/shareable-banner/template",
  protect,
  authorize("organizer", "superadmin"),
  removeShareableBannerTemplate
);

//  Delete event image (Organizer only)
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