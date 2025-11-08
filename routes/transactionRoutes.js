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

// ============================================
// PUBLIC ROUTES
// ============================================

// Paystack webhook
router.post("/webhook", paystackWebhook);

// Verify transaction payment
router.get("/verify/:reference", verifyTransaction);

// ============================================
// PROTECTED ROUTES
// ============================================

// User's transaction history
router.get("/my-transactions", protect, getUserTransactions);

// Revenue statistics (Organizer/Admin only)
router.get(
  "/stats/revenue", 
  protect,
  authorize("organizer", "superadmin"), 
  getRevenueStats
);

// Initialize booking payment
router.post("/initialize", protect, initializeTransaction);

// Event transactions (Organizer/Admin only)
router.get(
  "/event/:eventId", 
  protect,
  authorize("organizer", "superadmin"), 
  getEventTransactions
);

// ============================================
// PARAMETER ROUTES
// ============================================

// Single transaction details
router.get("/:id", protect, getTransaction);

// Request refund
router.post("/:id/refund", protect, requestRefund);

// Process refund (Organizer/Admin only)
router.put(
  "/:id/refund/process", 
  protect,
  authorize("organizer", "superadmin"), 
  processRefund
);

module.exports = router;