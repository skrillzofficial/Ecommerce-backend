const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/event.controller");

const { protect, authorize, optionalAuth } = require("../middleware/auth");
const { validateImages } = require("../middleware/fileUpload");
const {
  validateEventCreation,
  validateEventUpdate,
  validateBooking,
  validateQueryParams,
} = require("../middleware/validation");

//  PUBLIC ROUTES
// These routes don't require authentication

// Get featured events
router.get("/featured", getFeaturedEvents);

// Get upcoming events
router.get("/upcoming", getUpcomingEvents);

// Get all events with filtering (optionalAuth allows organizers to see drafts)
router.get("/", optionalAuth, validateQueryParams, getAllEvents);

// GET SINGLE EVENT BY ID OR SLUG 
// This should be publicly accessible to all users
router.get("/:id", getEventById);

// PROTECTED ROUTES (ALL USERS)
router.use(protect); // All routes below require authentication

// IMPORTANT: Specific routes MUST come before parameterized routes
// Get user's bookings (MUST be before /:id)
router.get("/my-bookings", validateQueryParams, getMyBookings);

// Book event ticket
router.post("/:id/book", validateBooking, bookEventTicket);

// Cancel booking
router.delete("/:id/cancel-booking", cancelBooking);

// Like/Unlike event
router.post("/:id/like", toggleLikeEvent);

//  ORGANIZER ONLY ROUTES
// These routes require organizer or superadmin role

// Get organizer's events (MUST be before /:id)
router.get(
  "/organizer/my-events",
  authorize("organizer", "superadmin"),
  validateQueryParams,
  getOrganizerEvents
);

// Get organizer statistics (MUST be before /:id)
router.get(
  "/organizer/statistics",
  authorize("organizer", "superadmin"),
  getOrganizerStatistics
);

// Create new event
router.post(
  "/create",
  authorize("organizer", "superadmin"),
  validateImages,
  validateEventCreation,
  createEvent
);

// Update event
router.patch(
  "/:id",
  authorize("organizer", "superadmin"),
  validateImages,
  validateEventUpdate,
  updateEvent
);

// Delete event image
router.delete(
  "/:id/images/:imageIndex",
  authorize("organizer", "superadmin"),
  deleteEventImage
);

// Cancel event
router.patch("/:id/cancel", authorize("organizer", "superadmin"), cancelEvent);

// Delete event
router.delete("/:id", authorize("organizer", "superadmin"), deleteEvent);



module.exports = router;
