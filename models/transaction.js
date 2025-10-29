const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    // Transaction Identification
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
    },

    // User Information
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Event & Booking Information
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: function() {
        // ✅ NOT required for service_fee with draft events
        return this.type !== 'service_fee' || !this.metadata?.isDraft;
      },
      index: true,
    },
    
    // ✅ ADD TYPE FIELD (should be at the top)
    type: {
      type: String,
      enum: ['event_booking', 'service_fee', 'withdrawal', 'refund'],
      default: 'event_booking',
    },
    
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: function() {
        // ✅ Only required for event_booking type
        return this.type === 'event_booking';
      },
      index: true,
    },

    // Event Snapshot
    eventTitle: {
      type: String,
      required: true,
    },
    eventStartDate: {
      type: Date,
      required: true,
    },
    eventEndDate: {
      type: Date,
    },
    eventOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Pricing
    subtotalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    serviceFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
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
      uppercase: true,
      enum: ["NGN", "USD", "EUR", "GBP"],
    },

    // Payment Status
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      default: "pending",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["card", "bank_transfer", "wallet", "free"],
      required: true,
    },
    paymentGateway: {
      type: String,
      default: "paystack",
    },

    // Paystack Integration
    paystackData: {
      id: Number,
      domain: String,
      status: String,
      reference: String,
      amount: Number,
      message: String,
      gateway_response: String,
      paid_at: Date,
      created_at: Date,
      channel: String,
      currency: String,
      ip_address: String,
      metadata: mongoose.Schema.Types.Mixed,
      fees: Number,
      customer: {
        id: Number,
        first_name: String,
        last_name: String,
        email: String,
        customer_code: String,
        phone: String,
        risk_action: String,
      },
      authorization: {
        authorization_code: String,
        bin: String,
        last4: String,
        exp_month: String,
        exp_year: String,
        channel: String,
        card_type: String,
        bank: String,
        country_code: String,
        brand: String,
        reusable: Boolean,
        signature: String,
        account_name: String,
      },
      plan: mongoose.Schema.Types.Mixed,
      subaccount: mongoose.Schema.Types.Mixed,
      split: mongoose.Schema.Types.Mixed,
      order_id: String,
      requested_amount: Number,
    },

    authorizationUrl: {
      type: String,
    },
    accessCode: {
      type: String,
    },

    // Transaction Timeline
    transactionDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    paidAt: {
      type: Date,
      index: true,
    },
    failedAt: {
      type: Date,
    },

    // Refund Information
    refundStatus: {
      type: String,
      enum: [
        "none",
        "requested",
        "approved",
        "processing",
        "completed",
        "denied",
      ],
      default: "none",
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    refundReason: {
      type: String,
      maxlength: [500, "Refund reason cannot exceed 500 characters"],
    },
    refundedAt: {
      type: Date,
    },
    refundDetails: {
      gatewayRefundId: String,
      refundMethod: String,
      notes: String,
    },

    // Failure Tracking
    failureReason: {
      type: String,
    },
    attempts: {
      type: Number,
      default: 0,
    },

    // Tracking
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },

    // Notification
    notificationSent: {
      type: Boolean,
      default: false,
    },
    receiptSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
transactionSchema.index({ userId: 1, transactionDate: -1 });
transactionSchema.index({ eventId: 1, status: 1 });
transactionSchema.index({ status: 1, transactionDate: -1 });
transactionSchema.index({ refundStatus: 1 });
transactionSchema.index({ type: 1, status: 1 }); // ✅ Add index for type

// ============ VIRTUALS ============

// Amount in main currency (not kobo)
transactionSchema.virtual("amountInCurrency").get(function () {
  return this.subtotalAmount / 100;
});

// Total amount in main currency
transactionSchema.virtual("totalAmountInCurrency").get(function () {
  return this.totalAmount / 100;
});

// Is successful transaction
transactionSchema.virtual("isSuccessful").get(function () {
  return this.status === "completed";
});

// Is pending transaction
transactionSchema.virtual("isPending").get(function () {
  return this.status === "pending" || this.status === "processing";
});

// Is refundable
transactionSchema.virtual("isRefundable").get(function () {
  return (
    this.status === "completed" &&
    this.refundStatus === "none" &&
    this.eventStartDate > new Date()
  );
});

// Payment age in hours
transactionSchema.virtual("paymentAge").get(function () {
  if (!this.paidAt) return null;
  return (new Date() - this.paidAt) / (1000 * 60 * 60);
});

// ============ INSTANCE METHODS ============

// Mark as completed
transactionSchema.methods.markAsCompleted = async function (paystackData) {
  this.status = "completed";
  this.paidAt = new Date();
  this.paystackData = paystackData;
  if (paystackData.channel) {
    this.paymentMethod = paystackData.channel;
  }

  return await this.save();
};

// Mark as failed
transactionSchema.methods.markAsFailed = async function (reason) {
  this.status = "failed";
  this.failureReason = reason;
  this.failedAt = new Date();
  this.attempts += 1;

  return await this.save();
};

// Request refund
transactionSchema.methods.requestRefund = async function (reason) {
  if (!this.isRefundable) {
    throw new Error("Transaction is not eligible for refund");
  }

  this.refundStatus = "requested";
  this.refundReason = reason;
  this.refundAmount = this.totalAmount;

  return await this.save();
};

// Process refund
transactionSchema.methods.processRefund = async function (refundData = {}) {
  if (this.refundStatus !== "requested" && this.refundStatus !== "approved") {
    throw new Error("Refund must be requested or approved before processing");
  }

  this.refundStatus = "processing";
  this.refundDetails = {
    gatewayRefundId: refundData.gatewayRefundId,
    refundMethod: refundData.refundMethod || this.paymentMethod,
    notes: refundData.notes,
  };

  return await this.save();
};

// Complete refund
transactionSchema.methods.completeRefund = async function () {
  if (this.refundStatus !== "processing") {
    throw new Error("Refund must be processing to complete");
  }

  this.refundStatus = "completed";
  this.status = "refunded";
  this.refundedAt = new Date();

  return await this.save();
};

// ============ STATIC METHODS ============

// Find by reference
transactionSchema.statics.findByReference = function (reference) {
  return this.findOne({ reference });
};

// Get user transactions
transactionSchema.statics.findByUser = function (userId, options = {}) {
  const { status, page = 1, limit = 20, sort = "-transactionDate" } = options;

  const query = { userId };
  if (status) query.status = status;

  return this.find(query)
    .populate("eventId", "title startDate venue city images")
    .populate("bookingId", "orderNumber totalTickets")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

// Get event transactions
transactionSchema.statics.findByEvent = function (eventId, options = {}) {
  const { status, page = 1, limit = 50 } = options;

  const query = { eventId };
  if (status) query.status = status;

  return this.find(query)
    .populate("userId", "firstName lastName email phone")
    .populate("bookingId", "orderNumber totalTickets")
    .sort({ transactionDate: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Get transactions by booking
transactionSchema.statics.findByBooking = function (bookingId) {
  return this.find({ bookingId })
    .populate("eventId", "title startDate venue")
    .populate("userId", "firstName lastName email");
};

// Get revenue statistics
transactionSchema.statics.getRevenueStats = async function (
  organizerId,
  period = "month"
) {
  const dateFilter = getDateFilter(period);

  const stats = await this.aggregate([
    {
      $match: {
        status: "completed",
        transactionDate: dateFilter,
      },
    },
    {
      $lookup: {
        from: "events",
        localField: "eventId",
        foreignField: "_id",
        as: "event",
      },
    },
    {
      $unwind: "$event",
    },
    {
      $match: {
        "event.organizer": new mongoose.Types.ObjectId(organizerId),
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalAmount" },
        totalTransactions: { $sum: 1 },
        averageTransactionValue: { $avg: "$totalAmount" },
        revenueByPaymentMethod: {
          $push: {
            method: "$paymentMethod",
            amount: "$totalAmount",
          },
        },
      },
    },
  ]);

  return (
    stats[0] || {
      totalRevenue: 0,
      totalTransactions: 0,
      averageTransactionValue: 0,
      revenueByPaymentMethod: [],
    }
  );
};

// Get pending transactions (for cleanup)
transactionSchema.statics.getPendingTransactions = function (hoursOld = 24) {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - hoursOld);

  return this.find({
    status: "pending",
    createdAt: { $lt: cutoff },
  });
};

// ============ MIDDLEWARE ============

// Pre-save hook
transactionSchema.pre("save", function (next) {
  // Generate reference if new and not provided
  if (this.isNew && !this.reference) {
    this.reference = `TXN-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;
  }

  // Generate transaction ID if new
  if (this.isNew && !this.transactionId) {
    this.transactionId = `TXN-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;
  }

  // Set transaction date
  if (!this.transactionDate) {
    this.transactionDate = new Date();
  }

  next();
});

// Helper function for date filtering
function getDateFilter(period) {
  const now = new Date();
  const filter = {};

  switch (period) {
    case "today":
      filter.$gte = new Date(now.setHours(0, 0, 0, 0));
      filter.$lte = new Date(now.setHours(23, 59, 59, 999));
      break;
    case "week":
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      filter.$gte = startOfWeek;
      break;
    case "month":
      filter.$gte = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "year":
      filter.$gte = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      filter.$gte = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return filter;
}

module.exports = mongoose.model("Transaction", transactionSchema);