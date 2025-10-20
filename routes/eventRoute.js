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
  getTicketAvailability, // NEW
} = require("../controllers/event.controller");

const { protect, authorize, optionalAuth } = require("../middleware/auth");
const { validateImages } = require("../middleware/fileUpload");
const {
  validateEventCreation,
  validateEventUpdate,
  validateBooking,
  validateQueryParams,
} = require("../middleware/validation");



// Get featured events
router.get("/featured", getFeaturedEvents);

// Get upcoming events
router.get("/upcoming", getUpcomingEvents);

// Get all events with filtering (optionalAuth allows organizers to see drafts)
router.get("/", optionalAuth, validateQueryParams, getAllEvents);

// GET SINGLE EVENT BY ID OR SLUG 
router.get("/:id", getEventById);


router.use(protect); // All routes below require authentication

// IMPORTANT: Specific routes MUST come before parameterized routes
// Get user's bookings (MUST be before /:id)
router.get("/my-bookings", validateQueryParams, getMyBookings);



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


// Get ticket availability for an event (NEW - PUBLIC ACCESS)
// Moving this before authentication requirement since it should be public
router.get("/:id/ticket-availability", getTicketAvailability);

// Book event ticket
router.post("/:id/book", validateBooking, bookEventTicket);

// Cancel booking
router.delete("/:id/cancel-booking", cancelBooking);

// Like/Unlike event
router.post("/:id/like", toggleLikeEvent);

// Delete event image (Organizer only)
router.delete(
  "/:id/images/:imageIndex",
  authorize("organizer", "superadmin"),
  deleteEventImage
);

// Cancel event (Organizer only)
router.patch("/:id/cancel", authorize("organizer", "superadmin"), cancelEvent);



// Update event (Organizer only)
router.patch(
  "/:id",
  authorize("organizer", "superadmin"),
  validateImages,
  validateEventUpdate,
  updateEvent
);

// Delete event (Organizer only)
router.delete("/:id", authorize("organizer", "superadmin"), deleteEvent);



module.exports = router;