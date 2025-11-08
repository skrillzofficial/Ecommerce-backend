const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    // Core Identification
    reference: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Transaction Type & Purpose
    type: {
      type: String,
      enum: ['event_booking'], // Removed 'service_fee'
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true, // Now always required since only event_booking exists
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },

    // Payment Amounts
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "NGN",
    },

    // Payment Status & Method
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["card", "bank_transfer", "wallet"],
      required: true,
    },

    // Payment Gateway Data
    paymentUrl: {
      type: String, // For Paystack authorization URL
    },
    paymentDetails: {
      type: mongoose.Schema.Types.Mixed, // Store payment gateway response
    },

    // Timeline
    completedAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    failureReason: {
      type: String,
    },

    // Refund Info
    refundStatus: {
      type: String,
      enum: ["none", "requested", "approved", "rejected", "completed"],
      default: "none",
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundRequestedAt: {
      type: Date,
    },
    refundProcessedAt: {
      type: Date,
    },
    refundReason: {
      type: String,
    },
    refundRejectionReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Essential Indexes
transactionSchema.index({ reference: 1 });
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ eventId: 1 });
transactionSchema.index({ bookingId: 1 });
transactionSchema.index({ type: 1 });

// Essential Methods
transactionSchema.methods.markAsCompleted = async function (paymentData) {
  this.status = "completed";
  this.completedAt = new Date();
  this.paymentDetails = paymentData;
  this.paymentMethod = paymentData.channel || "card";
  await this.save();
};

transactionSchema.methods.markAsFailed = async function (reason) {
  this.status = "failed";
  this.failedAt = new Date();
  this.failureReason = reason;
  await this.save();
};

// Virtual for formatted amount display
transactionSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: this.currency,
  }).format(this.amount);
});

// Set toJSON to include virtuals
transactionSchema.set('toJSON', {
  virtuals: true,
});

module.exports = mongoose.model("Transaction", transactionSchema);