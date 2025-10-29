const express = require("express");
const router = express.Router();
const {
  bookEventTicket,
  cancelBooking,
  getMyBookings,
  getBooking,
  initializeBookingPayment,
} = require("../controllers/bookingController");

const { protect, authorize } = require("../middleware/auth");
const { validateBooking } = require("../middleware/validation");

// ============================================
// BOOKING ROUTES (User bookings)
// ============================================

// Get user's bookings
router.get("/my-bookings", protect, getMyBookings);

// Get single booking
router.get("/:id", protect, getBooking);

// Initialize payment for existing booking
router.post("/:id/pay", protect, initializeBookingPayment);

// Cancel booking
router.delete("/:id", protect, cancelBooking);


module.exports = router;