const express = require("express");
const router = express.Router();
const {
  initializeTransaction, // ✅ ADD THIS MISSING IMPORT
  verifyTransaction,
  getUserTransactions,
  getTransaction,
  getEventTransactions,
  requestRefund,
  processRefund,
  getRevenueStats,
  initializeServiceFeePayment, // ✅ MOVE THIS FROM BOOKING CONTROLLER
  verifyServiceFeePayment, // ✅ MOVE THIS FROM BOOKING CONTROLLER
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
// @access  Public
router.post("/verify-service-fee/:reference", verifyServiceFeePayment);

// ============================================
// PROTECTED USER ROUTES
// ============================================

// All routes below require authentication
router.use(protect);

// @desc    Initialize payment for booking
// @route   POST /api/v1/transactions/initialize
// @access  Private
router.post("/initialize", initializeTransaction); // ✅ FIXED: Use initializeTransaction, not initializeBookingPayment

// @desc    Initialize service fee payment for free event publishing
// @route   POST /api/v1/transactions/initialize-service-fee
// @access  Private (Organizer only)
router.post(
  "/initialize-service-fee", 
  authorize("organizer", "superadmin"), 
  initializeServiceFeePayment
);

// @desc    Get user's transaction history
// @route   GET /api/v1/transactions/my-transactions
// @access  Private
router.get("/my-transactions", getUserTransactions);

// @desc    Get single transaction details
// @route   GET /api/v1/transactions/:id
// @access  Private (Transaction owner or organizer)
router.get("/:id", getTransaction);

// @desc    Request refund for transaction
// @route   POST /api/v1/transactions/:id/refund
// @access  Private (Transaction owner only)
router.post("/:id/refund", requestRefund);

// ============================================
// ORGANIZER & ADMIN ROUTES
// ============================================

// @desc    Get transactions for a specific event
// @route   GET /api/v1/transactions/event/:eventId
// @access  Private (Organizer/Superadmin only)
router.get(
  "/event/:eventId", 
  authorize("organizer", "superadmin"), 
  getEventTransactions
);

// @desc    Process refund request
// @route   PUT /api/v1/transactions/:id/refund/process
// @access  Private (Organizer/Superadmin only)
router.put(
  "/:id/refund/process", 
  authorize("organizer", "superadmin"), 
  processRefund
);

// @desc    Get revenue statistics
// @route   GET /api/v1/transactions/stats/revenue
// @access  Private (Organizer/Superadmin only)
router.get(
  "/stats/revenue", 
  authorize("organizer", "superadmin"), 
  getRevenueStats
);

module.exports = router;