// routes/publicEventRoutes.js
const express = require("express");
const { getEvents, getEventById } = require("../controllers/event.controller");

const router = express.Router();

// Debug middleware for public routes
router.use((req, res, next) => {
  console.log('🔓 Public route accessed:', {
    method: req.method,
    path: req.path,
    timestamp: new Date().toISOString(),
    hasAuthHeader: !!req.headers.authorization
  });
  next();
});

// Public routes (no authentication required)
router.get("/events", getEvents);
router.get("/events/:id", getEventById);

module.exports = router;