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
      enum: ['event_booking', 'service_fee'],
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: function() {
        return this.type === 'event_booking';
      },
    },

    // Payment Amounts
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalAmount: {
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

    // Event Info (Important for records)
    eventTitle: {
      type: String,
      required: true,
    },
    eventStartDate: {
      type: Date,
      required: true,
    },

    // ✅ ADDED: Metadata for service fee events
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Payment Gateway Data
    paystackData: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Timeline
    paidAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },

    // Refund Info
    refundStatus: {
      type: String,
      enum: ["none", "requested", "approved", "completed", "denied"],
      default: "none",
    },
    refundAmount: {
      type: Number,
      default: 0,
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

// Essential Methods
transactionSchema.methods.markAsCompleted = async function (paystackData) {
  this.status = "completed";
  this.paidAt = new Date();
  this.paystackData = paystackData;
  await this.save();
};

transactionSchema.methods.markAsFailed = async function (reason) {
  this.status = "failed";
  this.failedAt = new Date();
  await this.save();
};

module.exports = mongoose.model("Transaction", transactionSchema);