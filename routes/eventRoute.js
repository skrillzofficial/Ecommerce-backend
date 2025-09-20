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

// All events routes are protected (require authentication)
router.use(protect);

// Routes
router.post("/events", createEvent);
router.get("/events", getEvents);
router.get("/events/:id", getEventById);
router.patch("/events/:id", protect, authorizeAdmin,  updateEvent);
router.delete("/events/:id",protect, authorizeAdmin,  deleteEvent);

module.exports = router;


