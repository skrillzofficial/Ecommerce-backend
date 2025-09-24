// routes/eventRoute.js - PROTECTED ROUTES ONLY
const express = require("express");
const {
  createEvent,
  updateEvent,
  deleteEvent
} = require("../controllers/event.controller");
const { protect } = require("../middleware/auth");
const { authorizeAdmin } = require("../middleware/adminAuth");

const router = express.Router();

// All routes in this file require authentication
router.use(protect);

// Protected admin-only routes (require authentication + admin role)
router.post("/events", authorizeAdmin, createEvent);
router.patch("/events/:id", authorizeAdmin, updateEvent);
router.delete("/events/:id", authorizeAdmin, deleteEvent);

module.exports = router;