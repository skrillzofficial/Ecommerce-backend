const express = require("express");
const router = express.Router();
const {
  initializeTransaction,
  verifyTransaction,
  getUserTransactions,
  getTransaction,
  getEventTransactions,
  requestRefund,
  processRefund,
  getRevenueStats,
  paystackWebhook,
} = require("../controllers/transactionController");
const { protect, authorize } = require("../middleware/auth");

// Public routes
router.post("/webhook", paystackWebhook);
router.get("/verify/:reference", verifyTransaction);

// Protected routes (require authentication)
router.use(protect);

// Initialize payment
router.post("/initialize", initializeTransaction);

// Get user's transactions
router.get("/my-transactions", getUserTransactions);

// Get single transaction
router.get("/:id", getTransaction);

// Get event transactions (organizer only)
router.get("/event/:eventId", getEventTransactions);

// Refund management
router.post("/:id/refund", requestRefund);
router.put(
  "/:id/refund/process",
  authorize("organizer", "admin"),
  processRefund
);

// Revenue statistics
router.get("/stats/revenue", authorize("organizer", "admin"), getRevenueStats);

module.exports = router;
