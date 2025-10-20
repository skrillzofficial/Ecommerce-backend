const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticket.controller");
const { authenticate } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// Purchase ticket
router.post("/purchase", ticketController.purchaseTicket);

// Get user's tickets
router.get("/my-tickets", ticketController.getUserTickets);

// Get specific ticket
router.get("/:ticketId", ticketController.getTicketById);

// Validate ticket (organizer only)
router.post("/:ticketId/validate", ticketController.validateTicket);

// Get event tickets (organizer only)
router.get("/event/:eventId", ticketController.getEventTickets);

module.exports = router;