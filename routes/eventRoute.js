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

// PUBLIC ROUTES - No authentication required
router.get("/events", getEvents);
router.get("/events/:id", getEventById);

// PROTECTED ROUTES - Require authentication + admin role
router.use(protect); // Apply protection to all routes below this line

router.post("/events", authorizeAdmin, createEvent);
router.patch("/events/:id", authorizeAdmin, updateEvent);
router.delete("/events/:id", authorizeAdmin, deleteEvent);

module.exports = router;