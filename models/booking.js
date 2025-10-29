const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    // Order Identification
    orderNumber: {
      type: String,
      required: [true, "Order number is required"],
      unique: true,
      index: true, 
    },
    shortId: {
      type: String,
      unique: true,
      sparse: true,
      index: true, 
    },

    // Event & User References
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event reference is required"],
      index: true, 
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true, 
    },
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Organizer reference is required"],
      index: true, 
    },

    // Ticket Information
    tickets: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticket",
        index: true, 
      },
    ],

    // Ticket Details (snapshot at time of booking)
    ticketDetails: [
      {
        ticketType: {
          type: String,
          required: true,
          trim: true,
        },
        ticketTypeId: {
          type: mongoose.Schema.Types.ObjectId,
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
        benefits: [String],
        accessType: {
          type: String,
          enum: ["physical", "virtual", "both"],
          default: "both"
        },
        // NEW: Track individual ticket generation
        generatedTickets: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: "Ticket"
        }]
      },
    ],

    // NEW: Ticket Generation Status
    ticketGeneration: {
      status: {
        type: String,
        enum: ["pending", "in-progress", "completed", "failed", "partial"],
        default: "pending"
      },
      generatedCount: {
        type: Number,
        default: 0
      },
      failedTickets: [{
        ticketIndex: Number,
        error: String,
        retryCount: Number
      }],
      lastGenerationAttempt: Date,
      completedAt: Date
    },

    // Pricing Information
    totalTickets: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Total tickets must be a whole number",
      },
    },
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
      enum: ["NGN", "USD", "EUR", "GBP"],
      uppercase: true,
    },

    // Booking Status
    status: {
      type: String,
      required: true,
      enum: {
        values: ["pending", "confirmed", "cancelled", "refunded", "expired"],
        message: "{VALUE} is not a valid booking status",
      },
      default: "pending",
      index: true, 
    },

    // Payment Information
    paymentStatus: {
      type: String,
      required: true,
      enum: {
        values: [
          "pending",
          "processing",
          "completed",
          "failed",
          "refunded",
          "partially_refunded",
        ],
        message: "{VALUE} is not a valid payment status",
      },
      default: "pending",
      index: true, 
    },
    paymentMethod: {
      type: String,
      enum: [
        "card",
        "bank_transfer",
        "wallet",
        "free"
      ],
      required: function () {
        return this.paymentStatus !== "free";
      },
    },
    paymentGateway: {
      type: String,
      trim: true,
    },
    paymentReference: {
      type: String,
      trim: true,
      index: true,
    },
    transactionId: {
      type: String,
      trim: true,
      index: true,
    },
    paymentDetails: {
      gatewayResponse: mongoose.Schema.Types.Mixed,
      authorizationUrl: String,
      paymentUrl: String,
      paidAt: Date,
      failureReason: String,
    },

    // Booking Timeline
    bookingDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    confirmedAt: Date,
    cancelledAt: Date,
    expiredAt: Date,
    refundedAt: Date,

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
    refundDetails: {
      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      gatewayRefundId: String,
      refundMethod: String,
      notes: String,
    },

    // Customer Information (snapshot at time of booking)
    customerInfo: {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },
      phone: {
        type: String,
        trim: true,
      },
      billingAddress: {
        street: String,
        city: String,
        state: String,
        country: {
          type: String,
          default: "Nigeria",
        },
        postalCode: String,
      },
    },

    // Event Information (snapshot at time of booking)
    eventSnapshot: {
      title: {
        type: String,
        required: true,
      },
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
      time: String,
      endTime: String,
      venue: String,
      address: String,
      state: String,
      city: String,
      eventType: {
        type: String,
        enum: ["physical", "virtual", "hybrid"],
        default: "physical"
      },
      virtualEventLink: String,
      organizerName: String,
      organizerCompany: String,
      refundPolicy: {
        type: String,
        enum: ["full", "partial", "no-refund"],
        default: "partial",
      },
      category: String,
    },

    // Additional Features
    promoCode: {
      code: String,
      discountType: {
        type: String,
        enum: ["percentage", "fixed"],
      },
      discountValue: Number,
    },
    notes: {
      type: String,
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
    },
    specialRequirements: {
      type: String,
      maxlength: [500, "Special requirements cannot exceed 500 characters"],
    },

    // Analytics & Tracking
    ipAddress: String,
    userAgent: String,
    source: {
      type: String,
      enum: ["web", "mobile", "api", "admin"],
      default: "web",
    },
    deviceInfo: {
      platform: String,
      browser: String,
      isMobile: Boolean,
    },

    // Notifications
    notifications: {
      confirmationSent: {
        type: Boolean,
        default: false,
      },
      reminderSent: {
        type: Boolean,
        default: false,
      },
      reminderDate: Date,
      lastNotified: Date,
      ticketsGeneratedSent: {
        type: Boolean,
        default: false
      }
    },

    // Security
    securityToken: {
      type: String,
      unique: true,
      sparse: true,
    },

    // NEW: Download tracking
    downloadHistory: [{
      downloadedAt: Date,
      downloadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      ipAddress: String,
      userAgent: String,
      ticketsDownloaded: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticket"
      }]
    }]
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
bookingSchema.index({ user: 1, bookingDate: -1 });
bookingSchema.index({ event: 1, status: 1 });
bookingSchema.index({ organizer: 1, status: 1 });
bookingSchema.index({ paymentStatus: 1, bookingDate: -1 });
bookingSchema.index({ "eventSnapshot.startDate": 1 });
bookingSchema.index({ "customerInfo.email": 1, event: 1 });
bookingSchema.index({ "eventSnapshot.eventType": 1 });
bookingSchema.index({ "eventSnapshot.category": 1 });
bookingSchema.index({ "eventSnapshot.state": 1, "eventSnapshot.city": 1 });
bookingSchema.index({ status: 1, paymentStatus: 1 });
bookingSchema.index({ user: 1, event: 1 });
bookingSchema.index({ organizer: 1, createdAt: -1 });
// NEW: Index for ticket generation status
bookingSchema.index({ "ticketGeneration.status": 1 });
bookingSchema.index({ "ticketGeneration.completedAt": 1 });

// Virtual Fields
bookingSchema.virtual("isActive").get(function () {
  return this.status === "confirmed" && new Date() < this.eventSnapshot.startDate;
});

bookingSchema.virtual("isUpcoming").get(function () {
  return new Date() < this.eventSnapshot.startDate;
});

bookingSchema.virtual("isPast").get(function () {
  return new Date() > this.eventSnapshot.endDate;
});

bookingSchema.virtual("canBeCancelled").get(function () {
  if (this.status !== "confirmed") return false;
  if (this.isPast) return false;

  const eventDate = new Date(this.eventSnapshot.startDate);
  const now = new Date();
  const hoursUntilEvent = (eventDate - now) / (1000 * 60 * 60);

  return hoursUntilEvent > 24;
});

bookingSchema.virtual("canBeRefunded").get(function () {
  if (this.status !== "confirmed") return false;
  if (this.paymentStatus !== "completed") return false;
  if (this.isPast) return false;

  const eventDate = new Date(this.eventSnapshot.startDate);
  const now = new Date();
  const hoursUntilEvent = (eventDate - now) / (1000 * 60 * 60);

  return hoursUntilEvent > 24 && this.refundStatus === "none";
});

bookingSchema.virtual("totalCheckedIn").get(function () {
  return 0; // This will be calculated from tickets
});

bookingSchema.virtual("bookingAge").get(function () {
  return (new Date() - this.bookingDate) / (1000 * 60 * 60);
});

bookingSchema.virtual("isVirtualEvent").get(function () {
  return this.eventSnapshot.eventType === "virtual";
});

bookingSchema.virtual("isHybridEvent").get(function () {
  return this.eventSnapshot.eventType === "hybrid";
});

bookingSchema.virtual("isPhysicalEvent").get(function () {
  return this.eventSnapshot.eventType === "physical";
});

bookingSchema.virtual("hasVirtualAccess").get(function () {
  if (!this.ticketDetails || this.ticketDetails.length === 0) return false;
  return this.ticketDetails.some(ticket => 
    ticket.accessType === "virtual" || ticket.accessType === "both"
  );
});

bookingSchema.virtual("hasPhysicalAccess").get(function () {
  if (!this.ticketDetails || this.ticketDetails.length === 0) return false;
  return this.ticketDetails.some(ticket => 
    ticket.accessType === "physical" || ticket.accessType === "both"
  );
});

// NEW: Ticket Generation Virtuals
bookingSchema.virtual("ticketsGenerated").get(function () {
  return this.ticketGeneration.status === "completed";
});

bookingSchema.virtual("ticketsGenerationPending").get(function () {
  return this.ticketGeneration.status === "pending" || this.ticketGeneration.status === "in-progress";
});

bookingSchema.virtual("allTicketsAvailable").get(function () {
  if (!this.ticketsGenerated) return false;
  return this.ticketGeneration.generatedCount === this.totalTickets;
});

bookingSchema.virtual("downloadableTickets").get(function () {
  if (!this.tickets || this.tickets.length === 0) return [];
  return this.tickets.filter(ticket => 
    ticket.status === "confirmed" || ticket.status === "checked-in"
  );
});

// Pre-save Middleware
bookingSchema.pre("save", function (next) {
  if (!this.orderNumber) {
    this.orderNumber = `ORD-${Date.now().toString().slice(-8)}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;
  }

  if (!this.shortId) {
    this.shortId = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  if (!this.securityToken) {
    this.securityToken =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
  }

  if (
    this.isModified("status") &&
    this.status === "confirmed" &&
    !this.confirmedAt
  ) {
    this.confirmedAt = new Date();
  }

  if (
    this.isModified("status") &&
    this.status === "cancelled" &&
    !this.cancelledAt
  ) {
    this.cancelledAt = new Date();
  }

  if (this.status === "pending" && !this.expiredAt) {
    this.expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  if (this.ticketDetails && this.ticketDetails.length > 0) {
    this.totalTickets = this.ticketDetails.reduce(
      (sum, ticket) => sum + ticket.quantity,
      0
    );
    this.subtotalAmount = this.ticketDetails.reduce(
      (sum, ticket) => sum + ticket.subtotal,
      0
    );

    if (!this.totalAmount) {
      this.totalAmount =
        this.subtotalAmount +
        this.serviceFee +
        this.taxAmount -
        this.discountAmount;
    }
  }

  // NEW: Update ticket generation status
  if (this.tickets && this.tickets.length > 0) {
    this.ticketGeneration.generatedCount = this.tickets.length;
    if (this.ticketGeneration.generatedCount === this.totalTickets) {
      this.ticketGeneration.status = "completed";
      if (!this.ticketGeneration.completedAt) {
        this.ticketGeneration.completedAt = new Date();
      }
    } else if (this.ticketGeneration.generatedCount > 0) {
      this.ticketGeneration.status = "partial";
    }
  }

  next();
});

// Pre-save validation
bookingSchema.pre("save", function (next) {
  const calculatedTotal =
    this.subtotalAmount +
    this.serviceFee +
    this.taxAmount -
    this.discountAmount;
  if (Math.abs(this.totalAmount - calculatedTotal) > 0.01) {
    return next(new Error("Total amount does not match calculated amount"));
  }

  if (this.paymentMethod === "free" && this.totalAmount > 0) {
    return next(new Error("Free bookings must have total amount of 0"));
  }

  if (this.eventSnapshot.eventType === "hybrid" && this.ticketDetails) {
    const hasValidAccessType = this.ticketDetails.every(ticket => 
      ticket.accessType && ["physical", "virtual", "both"].includes(ticket.accessType)
    );
    if (!hasValidAccessType) {
      return next(new Error("All tickets must have valid access types for hybrid events"));
    }
  }

  next();
});

// Instance Methods
bookingSchema.methods.confirmBooking = async function (paymentData = {}) {
  if (this.status !== "pending") {
    throw new Error(`Cannot confirm booking with status: ${this.status}`);
  }

  this.status = "confirmed";
  this.paymentStatus = "completed";
  this.confirmedAt = new Date();

  if (paymentData.transactionId) {
    this.transactionId = paymentData.transactionId;
  }
  if (paymentData.paymentReference) {
    this.paymentReference = paymentData.paymentReference;
  }

  await this.save();
  return this;
};

bookingSchema.methods.cancelBooking = async function (reason = "") {
  if (!this.canBeCancelled) {
    throw new Error("Booking cannot be cancelled");
  }

  this.status = "cancelled";
  this.cancelledAt = new Date();
  this.refundStatus = "requested";
  this.refundReason = reason || "Customer requested cancellation";

  if (this.eventSnapshot.refundPolicy === "full") {
    this.refundAmount = this.totalAmount;
  } else if (this.eventSnapshot.refundPolicy === "partial") {
    this.refundAmount = this.totalAmount * 0.7;
  } else {
    this.refundAmount = 0;
  }

  await this.save();
  return this;
};

bookingSchema.methods.processRefund = async function (
  processedBy,
  refundData = {}
) {
  if (this.refundStatus !== "requested" && this.refundStatus !== "approved") {
    throw new Error("Refund must be requested or approved before processing");
  }

  this.refundStatus = "processing";
  this.refundDetails = {
    processedBy: processedBy,
    gatewayRefundId: refundData.gatewayRefundId,
    refundMethod: refundData.refundMethod || this.paymentMethod,
    notes: refundData.notes,
  };

  await this.save();
  return this;
};

bookingSchema.methods.completeRefund = async function () {
  if (this.refundStatus !== "processing") {
    throw new Error("Refund must be processing to complete");
  }

  this.refundStatus = "completed";
  this.paymentStatus = "refunded";
  this.status = "refunded";
  this.refundedAt = new Date();

  await this.save();
  return this;
};

bookingSchema.methods.addTicket = async function (ticketId) {
  if (this.status !== "pending" && this.status !== "confirmed") {
    throw new Error("Cannot add tickets to cancelled or refunded booking");
  }

  if (!this.tickets.includes(ticketId)) {
    this.tickets.push(ticketId);
    this.ticketGeneration.generatedCount = this.tickets.length;
    
    // Update status if all tickets are generated
    if (this.ticketGeneration.generatedCount === this.totalTickets) {
      this.ticketGeneration.status = "completed";
      this.ticketGeneration.completedAt = new Date();
    } else if (this.ticketGeneration.generatedCount > 0) {
      this.ticketGeneration.status = "partial";
    }
    
    await this.save();
  }

  return this;
};

// NEW: Method to add multiple tickets at once
bookingSchema.methods.addMultipleTickets = async function (ticketIds) {
  if (this.status !== "pending" && this.status !== "confirmed") {
    throw new Error("Cannot add tickets to cancelled or refunded booking");
  }

  const newTickets = ticketIds.filter(ticketId => 
    !this.tickets.includes(ticketId)
  );

  if (newTickets.length > 0) {
    this.tickets.push(...newTickets);
    this.ticketGeneration.generatedCount = this.tickets.length;
    
    // Update status if all tickets are generated
    if (this.ticketGeneration.generatedCount === this.totalTickets) {
      this.ticketGeneration.status = "completed";
      this.ticketGeneration.completedAt = new Date();
    } else if (this.ticketGeneration.generatedCount > 0) {
      this.ticketGeneration.status = "partial";
    }
    
    await this.save();
  }

  return this;
};

// NEW: Method to get virtual event access
bookingSchema.methods.getVirtualAccessLink = function () {
  if (!this.isVirtualEvent && !this.isHybridEvent) {
    throw new Error("This booking is not for a virtual or hybrid event");
  }
  
  if (!this.hasVirtualAccess) {
    throw new Error("This booking does not include virtual access");
  }
  
  return this.eventSnapshot.virtualEventLink;
};

// NEW: Method to track download
bookingSchema.methods.trackDownload = async function (userId, ipAddress, userAgent, ticketIds = []) {
  const downloadRecord = {
    downloadedAt: new Date(),
    downloadedBy: userId,
    ipAddress,
    userAgent,
    ticketsDownloaded: ticketIds.length > 0 ? ticketIds : this.tickets
  };

  this.downloadHistory.push(downloadRecord);
  await this.save();
  
  return downloadRecord;
};

// NEW: Method to get download statistics
bookingSchema.methods.getDownloadStats = function () {
  return {
    totalDownloads: this.downloadHistory.length,
    lastDownload: this.downloadHistory.length > 0 ? 
      this.downloadHistory[this.downloadHistory.length - 1].downloadedAt : null,
    uniqueIps: [...new Set(this.downloadHistory.map(d => d.ipAddress))].length,
    ticketsDownloaded: this.downloadHistory.reduce((acc, curr) => 
      acc + curr.ticketsDownloaded.length, 0
    )
  };
};

// NEW: Method to check if all tickets are generated and ready
bookingSchema.methods.areTicketsReady = function () {
  return this.ticketGeneration.status === "completed" && 
         this.tickets.length === this.totalTickets;
};

// Static Methods
bookingSchema.statics.findByUser = function (userId, options = {}) {
  const { status, page = 1, limit = 20, sort = "-bookingDate" } = options;

  const query = { user: userId };
  if (status) query.status = status;

  return this.find(query)
    .populate("event", "title startDate endDate time venue city images status eventType")
    .populate("tickets", "ticketNumber status checkedInAt approvalStatus")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

bookingSchema.statics.findByEvent = function (eventId, options = {}) {
  const { status, page = 1, limit = 50, sort = "bookingDate" } = options;

  const query = { event: eventId };
  if (status) query.status = status;

  return this.find(query)
    .populate("user", "firstName lastName email phone")
    .populate("tickets", "ticketNumber ticketType status checkedInAt")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

bookingSchema.statics.findByOrganizer = function (organizerId, options = {}) {
  const { status, page = 1, limit = 50, sort = "-createdAt" } = options;

  const query = { organizer: organizerId };
  if (status) query.status = status;

  return this.find(query)
    .populate("event", "title startDate endDate time venue eventType")
    .populate("user", "firstName lastName email")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

// NEW: Find bookings with incomplete ticket generation
bookingSchema.statics.findWithIncompleteTickets = function (options = {}) {
  const { page = 1, limit = 50, olderThanHours = 1 } = options;

  const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

  return this.find({
    status: "confirmed",
    "ticketGeneration.status": { $in: ["pending", "in-progress", "partial"] },
    "ticketGeneration.lastGenerationAttempt": { $lt: cutoffTime }
  })
  .populate("event", "title startDate")
  .populate("user", "firstName lastName email")
  .sort("createdAt")
  .skip((page - 1) * limit)
  .limit(limit);
};

bookingSchema.statics.getRevenueStats = async function (
  organizerId,
  period = "month"
) {
  const dateFilter = getDateFilter(period);

  const stats = await this.aggregate([
    {
      $match: {
        organizer: new mongoose.Types.ObjectId(organizerId),
        status: "confirmed",
        paymentStatus: "completed",
        bookingDate: dateFilter,
      },
    },
    {
      $group: {
        _id: null,
        totalBookings: { $sum: 1 },
        totalRevenue: { $sum: "$totalAmount" },
        totalTickets: { $sum: "$totalTickets" },
        averageOrderValue: { $avg: "$totalAmount" },
      },
    },
  ]);

  return (
    stats[0] || {
      totalBookings: 0,
      totalRevenue: 0,
      totalTickets: 0,
      averageOrderValue: 0,
    }
  );
};

// NEW: Get stats by event type
bookingSchema.statics.getStatsByEventType = async function (organizerId) {
  const stats = await this.aggregate([
    {
      $match: {
        organizer: new mongoose.Types.ObjectId(organizerId),
        status: "confirmed",
        paymentStatus: "completed",
      },
    },
    {
      $group: {
        _id: "$eventSnapshot.eventType",
        totalBookings: { $sum: 1 },
        totalRevenue: { $sum: "$totalAmount" },
        totalTickets: { $sum: "$totalTickets" },
      },
    },
  ]);

  return stats;
};

// NEW: Get ticket generation statistics
bookingSchema.statics.getTicketGenerationStats = async function (organizerId) {
  const stats = await this.aggregate([
    {
      $match: {
        organizer: new mongoose.Types.ObjectId(organizerId),
        status: "confirmed"
      }
    },
    {
      $group: {
        _id: "$ticketGeneration.status",
        count: { $sum: 1 },
        totalTickets: { $sum: "$totalTickets" },
        generatedTickets: { $sum: "$ticketGeneration.generatedCount" }
      }
    }
  ]);

  const completionStats = await this.aggregate([
    {
      $match: {
        organizer: new mongoose.Types.ObjectId(organizerId),
        status: "confirmed",
        "ticketGeneration.status": "completed"
      }
    },
    {
      $group: {
        _id: null,
        avgGenerationTime: {
          $avg: {
            $subtract: [
              "$ticketGeneration.completedAt",
              "$confirmedAt"
            ]
          }
        }
      }
    }
  ]);

  return {
    byStatus: stats,
    completionTime: completionStats[0] || { avgGenerationTime: 0 }
  };
};

bookingSchema.statics.expirePendingBookings = async function () {
  const result = await this.updateMany(
    {
      status: "pending",
      expiredAt: { $lt: new Date() },
    },
    {
      $set: { status: "expired" },
    }
  );

  return result;
};

// Query Helpers
bookingSchema.query.active = function () {
  return this.where({ status: "confirmed" });
};

bookingSchema.query.pending = function () {
  return this.where({ status: "pending" });
};

bookingSchema.query.paid = function () {
  return this.where({ paymentStatus: "completed" });
};

bookingSchema.query.upcoming = function () {
  return this.where({ "eventSnapshot.startDate": { $gt: new Date() } });
};

bookingSchema.query.byPeriod = function (startDate, endDate) {
  return this.where({ bookingDate: { $gte: startDate, $lte: endDate } });
};

bookingSchema.query.virtualEvents = function () {
  return this.where({ "eventSnapshot.eventType": "virtual" });
};

bookingSchema.query.hybridEvents = function () {
  return this.where({ "eventSnapshot.eventType": "hybrid" });
};

bookingSchema.query.physicalEvents = function () {
  return this.where({ "eventSnapshot.eventType": "physical" });
};

bookingSchema.query.byCategory = function (category) {
  return this.where({ "eventSnapshot.category": category });
};

bookingSchema.query.byState = function (state) {
  return this.where({ "eventSnapshot.state": state });
};

// NEW: Ticket generation query helpers
bookingSchema.query.withCompletedTickets = function () {
  return this.where({ "ticketGeneration.status": "completed" });
};

bookingSchema.query.withPendingTickets = function () {
  return this.where({ "ticketGeneration.status": { $in: ["pending", "in-progress", "partial"] } });
};

bookingSchema.query.withFailedTickets = function () {
  return this.where({ "ticketGeneration.status": "failed" });
};

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

module.exports = mongoose.model("Booking", bookingSchema);