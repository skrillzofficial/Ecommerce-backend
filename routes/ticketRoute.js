const express = require("express");
const router = express.Router();
const {
  purchaseTicket,
  purchaseMultipleTickets,
  getUserTickets,
  getTicketById,
  validateTicket,
  cancelTicket,
  transferTicket,
  getEventTickets,
  getTicketAnalytics,
  addTicketLocation,
  getTicketLocationHistory,
  downloadTicket,
  resendTicketEmail,
} = require("../controllers/ticket.controller");

const { protect, authorize } = require("../middleware/auth");

// ============================================
// ALL ROUTES REQUIRE AUTHENTICATION
// ============================================

// Purchase single ticket
router.post("/purchase", protect, purchaseTicket);

// Purchase multiple tickets (different types)
router.post("/purchase-multiple", protect, purchaseMultipleTickets);

// Get user's tickets
router.get("/my-tickets", protect, getUserTickets);

// Get tickets for a specific event (Organizer only)
router.get(
  "/event/:eventId",
  protect,
  authorize("organizer", "superadmin"),
  getEventTickets
);

// Get ticket analytics for an event (Organizer only)
router.get(
  "/analytics/event/:eventId",
  protect,
  authorize("organizer", "superadmin"),
  getTicketAnalytics
);

// ============================================
// ROUTES WITH :ticketId PARAMETER
// ============================================

// Get specific ticket details
router.get("/:ticketId", protect, getTicketById);

// Validate ticket at entrance (Organizer only)
router.post(
  "/:ticketId/validate",
  protect,
  authorize("organizer", "superadmin"),
  validateTicket
);

// Cancel ticket
router.post("/:ticketId/cancel", protect, cancelTicket);

// Transfer ticket to another user
router.post("/:ticketId/transfer", protect, transferTicket);

// Add location point to ticket (for live tracking)
router.post("/:ticketId/location", protect, addTicketLocation);

// Get ticket location history
router.get("/:ticketId/location-history", protect, getTicketLocationHistory);

// Download ticket as PDF
router.get("/:ticketId/download", protect, downloadTicket);

// Resend ticket confirmation email
router.post("/:ticketId/resend-email", protect, resendTicketEmail);

module.exports = router;