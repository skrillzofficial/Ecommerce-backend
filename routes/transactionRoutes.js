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

// Protected routes
router.get("/my-transactions", protect, getUserTransactions);
router.get("/stats/revenue", protect, authorize("organizer", "superadmin"), getRevenueStats);
router.post("/initialize", protect, initializeTransaction);
router.get("/event/:eventId", protect, authorize("organizer", "superadmin"), getEventTransactions);

// Verification (must be before /:id)
router.get("/verify-payment/:reference", protect, verifyTransaction);

// Parameter routes
router.get("/:id", protect, getTransaction);
router.post("/:id/refund", protect, requestRefund);
router.put("/:id/refund/process", protect, authorize("organizer", "superadmin"), processRefund);

module.exports = router;