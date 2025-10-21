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
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    userName: {
      type: String,
      trim: true,
    },
    userPhone: {
      type: String,
      trim: true,
    },

    // Event & Ticket Information
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    eventTitle: {
      type: String,
      required: true,
    },
    eventDate: {
      type: Date,
      required: true,
    },
    eventOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Ticket Details with Types Support
    tickets: [
      {
        ticketId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Ticket",
        },
        ticketType: {
          type: String,
          enum: ["Regular", "VIP", "VVIP"],
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        unitPrice: {
          type: Number,
          required: true,
          min: 0,
        },
        subtotal: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],

    // Pricing
    amount: {
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
    serviceFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Payment Status
    status: {
      type: String,
      enum: [
        "pending",
        "success",
        "failed",
        "abandoned",
        "refunded",
        "partially_refunded",
      ],
      default: "pending",
      index: true,
    },
    paymentChannel: {
      type: String,
      enum: [
        "card",
        "bank",
        "ussd",
        "qr",
        "mobile_money",
        "bank_transfer",
        "eft",
      ],
      default: null,
    },
    paymentMethod: {
      type: String,
      default: null,
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
      default: null,
    },
    accessCode: {
      type: String,
      default: null,
    },

    // Transaction Metadata
    metadata: {
      orderId: String,
      ticketNumbers: [String],
      qrCodes: [String],
      bookingReference: String,
      customFields: mongoose.Schema.Types.Mixed,
    },

    // Timestamps
    paidAt: {
      type: Date,
      default: null,
      index: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },

    // Failure Tracking
    failureReason: {
      type: String,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
    },

    // Refund Information
    refund: {
      status: {
        type: String,
        enum: [
          "not_requested",
          "requested",
          "processing",
          "completed",
          "rejected",
        ],
        default: "not_requested",
      },
      requestedAt: Date,
      processedAt: Date,
      amount: Number,
      reason: String,
      refundReference: String,
      refundedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      rejectionReason: String,
    },

    // Tracking
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    deviceInfo: {
      type: String,
      default: null,
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

// ============ INDEXES ============
transactionSchema.index({ email: 1, status: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ userId: 1, status: 1 });
transactionSchema.index({ eventId: 1, status: 1 });
transactionSchema.index({ "tickets.ticketId": 1 });
transactionSchema.index({ paidAt: -1 });
transactionSchema.index({ reference: 1, status: 1 });

// ============ VIRTUALS ============

// Amount in main currency (not kobo)
transactionSchema.virtual("amountInCurrency").get(function () {
  return this.amount / 100;
});

// Total amount in main currency
transactionSchema.virtual("totalAmountInCurrency").get(function () {
  return this.totalAmount / 100;
});

// Total tickets count
transactionSchema.virtual("totalTickets").get(function () {
  return this.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0);
});

// Is refundable
transactionSchema.virtual("isRefundable").get(function () {
  return (
    this.status === "success" &&
    this.refund.status === "not_requested" &&
    this.eventDate > new Date()
  );
});

// ============ INSTANCE METHODS ============

// Check if transaction is pending
transactionSchema.methods.isPending = function () {
  return this.status === "pending";
};

// Check if transaction is successful
transactionSchema.methods.isSuccessful = function () {
  return this.status === "success";
};

// Check if transaction is refunded
transactionSchema.methods.isRefunded = function () {
  return this.status === "refunded" || this.status === "partially_refunded";
};

// Mark as paid
transactionSchema.methods.markAsPaid = async function (paystackData) {
  this.status = "success";
  this.paidAt = new Date();
  this.verifiedAt = new Date();
  this.paystackData = paystackData;
  this.paymentChannel = paystackData.channel;
  this.paymentMethod =
    paystackData.authorization?.card_type || paystackData.channel;

  return await this.save();
};

// Mark as failed
transactionSchema.methods.markAsFailed = async function (reason) {
  this.status = "failed";
  this.failureReason = reason;
  this.attempts += 1;

  return await this.save();
};

// Request refund
transactionSchema.methods.requestRefund = async function (reason, requestedBy) {
  if (!this.isRefundable) {
    throw new Error("Transaction is not eligible for refund");
  }

  this.refund = {
    status: "requested",
    requestedAt: new Date(),
    reason: reason,
    amount: this.totalAmount,
  };

  return await this.save();
};

// Process refund
transactionSchema.methods.processRefund = async function (
  refundedBy,
  refundReference
) {
  if (this.refund.status !== "requested") {
    throw new Error("No refund request found");
  }

  this.refund.status = "completed";
  this.refund.processedAt = new Date();
  this.refund.refundedBy = refundedBy;
  this.refund.refundReference = refundReference;
  this.status = "refunded";

  return await this.save();
};

// Reject refund
transactionSchema.methods.rejectRefund = async function (
  rejectionReason,
  rejectedBy
) {
  if (this.refund.status !== "requested") {
    throw new Error("No refund request found");
  }

  this.refund.status = "rejected";
  this.refund.processedAt = new Date();
  this.refund.rejectionReason = rejectionReason;
  this.refund.refundedBy = rejectedBy;

  return await this.save();
};

// Update metadata
transactionSchema.methods.updateMetadata = async function (newMetadata) {
  this.metadata = { ...this.metadata, ...newMetadata };
  return await this.save();
};

// ============ STATIC METHODS ============

// Find by reference
transactionSchema.statics.findByReference = function (reference) {
  return this.findOne({ reference });
};

// Get user transactions
transactionSchema.statics.getUserTransactions = function (
  userId,
  options = {}
) {
  const { limit = 10, status, eventId } = options;

  const query = { userId };
  if (status) query.status = status;
  if (eventId) query.eventId = eventId;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("eventId", "title date venue city")
    .populate("tickets.ticketId", "ticketNumber qrCode status");
};

// Get event transactions
transactionSchema.statics.getEventTransactions = function (
  eventId,
  options = {}
) {
  const { status, limit } = options;

  const query = { eventId };
  if (status) query.status = status;

  const queryBuilder = this.find(query)
    .sort({ createdAt: -1 })
    .populate("userId", "firstName lastName email phone");

  if (limit) queryBuilder.limit(limit);

  return queryBuilder;
};

// Get successful transactions
transactionSchema.statics.getSuccessfulTransactions = function (filters = {}) {
  return this.find({ ...filters, status: "success" })
    .sort({ paidAt: -1 })
    .populate("eventId", "title date venue")
    .populate("userId", "firstName lastName email");
};

// Get transactions by ticket
transactionSchema.statics.getByTicketId = function (ticketId) {
  return this.findOne({ "tickets.ticketId": ticketId });
};

// Get revenue statistics
transactionSchema.statics.getRevenueStats = async function (filters = {}) {
  const matchQuery = { status: "success" };

  if (filters.eventId)
    matchQuery.eventId = new mongoose.Types.ObjectId(filters.eventId);
  if (filters.organizerId)
    matchQuery.eventOrganizer = new mongoose.Types.ObjectId(
      filters.organizerId
    );
  if (filters.startDate || filters.endDate) {
    matchQuery.paidAt = {};
    if (filters.startDate) matchQuery.paidAt.$gte = new Date(filters.startDate);
    if (filters.endDate) matchQuery.paidAt.$lte = new Date(filters.endDate);
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalAmount" },
        totalTransactions: { $sum: 1 },
        totalTickets: {
          $sum: {
            $reduce: {
              input: "$tickets",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.quantity"] },
            },
          },
        },
        avgTransactionValue: { $avg: "$totalAmount" },
        revenueByChannel: {
          $push: {
            channel: "$paymentChannel",
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
      totalTickets: 0,
      avgTransactionValue: 0,
      revenueByChannel: [],
    }
  );
};

// Get pending refunds
transactionSchema.statics.getPendingRefunds = function () {
  return this.find({
    "refund.status": "requested",
  })
    .sort({ "refund.requestedAt": 1 })
    .populate("userId", "firstName lastName email")
    .populate("eventId", "title date");
};

// ============ MIDDLEWARE ============

// Pre-save hook
transactionSchema.pre("save", function (next) {
  // Generate transaction ID if new
  if (this.isNew && !this.transactionId) {
    this.transactionId = `TXN-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)
      .toUpperCase()}`;
  }

  // Calculate total amount if not set
  if (!this.totalAmount && this.amount) {
    this.totalAmount = this.amount + (this.serviceFee || 0);
  }

  next();
});

// Post-save hook for notifications
transactionSchema.post("save", async function (doc) {
  // You can emit events here for email notifications, webhooks, etc.
  if (doc.status === "success" && !doc.notificationSent) {
    // Trigger email notification
    // EventEmitter or Queue system can be used here
  }
});

module.exports = mongoose.model("Transaction", transactionSchema);
