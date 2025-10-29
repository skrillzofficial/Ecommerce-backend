const express = require("express");
const router = express.Router();
const {
  getTicketById,
  validateTicket,
  getEventTickets,
  getTicketAnalytics,
  downloadTicket,
  resendTicketEmail,
  getUserTickets,
} = require("../controllers/ticket.controller");

const { protect, authorize } = require("../middleware/auth");

// ============================================
// USER TICKET ROUTES
// ============================================

// @desc    Get current user's tickets
// @route   GET /api/v1/tickets/my-tickets
// @access  Private (Authenticated user)
// IMPORTANT: This must come BEFORE /:id route to avoid conflict
router.get("/my-tickets", protect, getUserTickets);

// @desc    Get specific ticket details
// @route   GET /api/v1/tickets/:id
// @access  Private (Ticket owner or organizer)
router.get("/:id", protect, getTicketById);

// @desc    Download ticket as PDF
// @route   GET /api/v1/tickets/:id/download
// @access  Private (Ticket owner only)
router.get("/:id/download", protect, downloadTicket);

// @desc    Resend ticket confirmation email
// @route   POST /api/v1/tickets/:id/resend-email
// @access  Private (Ticket owner or event organizer)
router.post("/:id/resend-email", protect, resendTicketEmail);

// ============================================
// ORGANIZER-ONLY ROUTES
// ============================================

// @desc    Get tickets for a specific event
// @route   GET /api/v1/tickets/event/:eventId
// @access  Private (Organizer only)
router.get(
  "/event/:eventId",
  protect,
  authorize("organizer", "superadmin"),
  getEventTickets
);

// @desc    Get ticket analytics for an event
// @route   GET /api/v1/tickets/analytics/event/:eventId
// @access  Private (Organizer only)
router.get(
  "/analytics/event/:eventId",
  protect,
  authorize("organizer", "superadmin"),
  getTicketAnalytics
);

// @desc    Validate ticket at entrance
// @route   POST /api/v1/tickets/:id/validate
// @access  Private (Organizer only)
router.post(
  "/:id/validate",
  protect,
  authorize("organizer", "superadmin"),
  validateTicket
);

module.exports = router;