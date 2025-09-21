const express = require("express");
const {
  createEvent,
  updateEvent,
  deleteEvent,
  getEvents,
  getEventById
} = require("../controllers/event.controller");
const { protect } = require("../middleware/auth");
const { authorizeAdmin } = require("../middleware/adminAuth");

const router = express.Router();


// Public routes (no authentication required) - Users can view events
router.get("/events", getEvents);
router.get("/events/:id", getEventById);

// Protected admin-only routes (require authentication + admin role)
router.post("/events", protect, authorizeAdmin, createEvent);
router.patch("/events/:id", protect, authorizeAdmin, updateEvent);
router.delete("/events/:id", protect, authorizeAdmin, deleteEvent);

module.exports = router;