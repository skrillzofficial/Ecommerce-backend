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
  initializeServiceFeePayment, 
  verifyServiceFeePayment, 
  paystackWebhook, 
} = require("../controllers/transactionController");

const { protect, authorize } = require("../middleware/auth");

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

// @desc    Paystack webhook for payment notifications
// @route   POST /api/v1/transactions/webhook
// @access  Public (Paystack only)
router.post("/webhook", paystackWebhook);

// @desc    Verify transaction payment
// @route   GET /api/v1/transactions/verify/:reference
// @access  Public
router.get("/verify/:reference", verifyTransaction);

// @desc    Verify service fee payment
// @route   POST /api/v1/transactions/verify-service-fee/:reference
// @access  Public (needs to be public for payment callback)
router.get("/verify-service-fee/:reference", verifyServiceFeePayment);

// ============================================
// PROTECTED ROUTES - SPECIFIC ROUTES FIRST
// ============================================
// ⚠️ CRITICAL: Define specific routes BEFORE generic :id routes
// Order matters! More specific routes must come first

// @desc    Get user's transaction history
// @route   GET /api/v1/transactions/my-transactions
// @access  Private
router.get("/my-transactions", protect, getUserTransactions);

// @desc    Get revenue statistics
// @route   GET /api/v1/transactions/stats/revenue
// @access  Private (Organizer/Superadmin only)
router.get(
  "/stats/revenue", 
  protect,
  authorize("organizer", "superadmin"), 
  getRevenueStats
);

// @desc    Initialize payment for booking
// @route   POST /api/v1/transactions/initialize
// @access  Private
router.post("/initialize", protect, initializeTransaction);

// @desc    Initialize service fee payment for free event publishing
// @route   POST /api/v1/transactions/initialize-service-fee
// @access  Private (Organizer only)
router.post(
  "/initialize-service-fee", 
  protect,
  authorize("organizer", "superadmin"), 
  initializeServiceFeePayment
);

// @desc    Get transactions for a specific event
// @route   GET /api/v1/transactions/event/:eventId
// @access  Private (Organizer/Superadmin only)
router.get(
  "/event/:eventId", 
  protect,
  authorize("organizer", "superadmin"), 
  getEventTransactions
);

// ============================================
// ROUTES WITH :reference OR :id PARAMETER
// ============================================

// @desc    Get single transaction details
// @route   GET /api/v1/transactions/:id
// @access  Private (Transaction owner or organizer)
router.get("/:id", protect, getTransaction);

// @desc    Request refund for transaction
// @route   POST /api/v1/transactions/:id/refund
// @access  Private (Transaction owner only)
router.post("/:id/refund", protect, requestRefund);

// @desc    Process refund request
// @route   PUT /api/v1/transactions/:id/refund/process
// @access  Private (Organizer/Superadmin only)
router.put(
  "/:id/refund/process", 
  protect,
  authorize("organizer", "superadmin"), 
  processRefund
);

module.exports = router;