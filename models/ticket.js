const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    // Ticket Identification
    ticketNumber: {
      type: String,
      required: [true, "Ticket number is required"],
      unique: true,
      index: true,
    },
    qrCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    barcode: {
      type: String,
      unique: true,
      index: true,
    },

    // Event Reference
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event ID is required"],
      index: true,
    },

    // Event Snapshot
    eventName: {
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
    eventTime: {
      type: String,
    },
    eventEndTime: {
      type: String,
    },
    eventVenue: {
      type: String,
    },
    eventAddress: {
      type: String,
    },
    eventState: {
      type: String,
    },
    eventCity: {
      type: String,
    },
    eventCategory: {
      type: String,
    },
    eventType: {
      type: String,
      enum: ["physical", "virtual", "hybrid"],
    },
    virtualEventLink: {
      type: String,
    },
    eventCoordinates: {
      latitude: Number,
      longitude: Number,
    },

    // Ticket Type Information
    ticketType: {
      type: String,
      required: true,
      trim: true,
    },
    ticketTypeId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    accessType: {
      type: String,
      enum: ["physical", "virtual", "both"],
      default: "both"
    },

    // Ticket Holder Information
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },

    // User Snapshot
    userName: {
      type: String,
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    userPhone: {
      type: String,
    },

    // Pricing Information
    ticketPrice: {
      type: Number,
      required: true,
      min: [0, "Price cannot be negative"],
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      default: 1,
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be a whole number",
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, "Total amount cannot be negative"],
    },
    currency: {
      type: String,
      default: "NGN",
      enum: ["NGN", "USD", "EUR", "GBP"],
    },

    // Ticket Status
    status: {
      type: String,
      required: true,
      enum: ["confirmed", "checked-in", "cancelled", "expired", "refunded", "pending-approval", "rejected"],
      default: "confirmed",
      index: true,
    },

    // NEW: Approval System Fields
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "not-required"],
      default: "not-required",
      index: true,
    },
    approvalSubmittedAt: {
      type: Date,
    },
    approvalDecidedAt: {
      type: Date,
    },
    approvalDecidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvalQuestions: [
      {
        question: {
          type: String,
          required: true,
        },
        answer: {
          type: String,
          required: true,
        },
        required: {
          type: Boolean,
          default: false,
        },
      }
    ],
    approvalNotes: {
      type: String,
      maxlength: [1000, "Approval notes cannot exceed 1000 characters"],
    },
    rejectionReason: {
      type: String,
      maxlength: [500, "Rejection reason cannot exceed 500 characters"],
    },

    // Check-in Information
    checkedInAt: {
      type: Date,
    },
    checkedInBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    checkInLocation: {
      latitude: Number,
      longitude: Number,
      address: String,
    },

    // Purchase Information
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    paymentMethod: {
      type: String,
      enum: ["card", "bank_transfer", "wallet", "cash", "free"],
      default: "card",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "completed",
    },
    transactionId: {
      type: String,
      index: true,
    },

    // Booking Reference
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },

    // Organizer Information
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Organizer Snapshot
    organizerName: {
      type: String,
    },
    organizerEmail: {
      type: String,
    },
    organizerCompany: {
      type: String,
    },

    // Refund Information
    refundStatus: {
      type: String,
      enum: ["none", "requested", "approved", "processed", "denied"],
      default: "none",
    },
    refundAmount: {
      type: Number,
      min: 0,
    },
    refundDate: {
      type: Date,
    },
    refundReason: {
      type: String,
      maxlength: [500, "Refund reason cannot exceed 500 characters"],
    },
    refundPolicy: {
      type: String,
      enum: ["full", "partial", "no-refund"],
      default: "partial",
    },

    // Additional Information
    specialRequirements: {
      type: String,
      maxlength: [500, "Special requirements cannot exceed 500 characters"],
    },

    // Security
    securityCode: {
      type: String,
    },

    // Timestamps
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
ticketSchema.index({ eventId: 1, userId: 1 });
ticketSchema.index({ eventId: 1, status: 1 });
ticketSchema.index({ userId: 1, status: 1 });
ticketSchema.index({ organizerId: 1, status: 1 });
ticketSchema.index({ purchaseDate: -1 });
// NEW: Approval-related indexes
ticketSchema.index({ approvalStatus: 1 });
ticketSchema.index({ eventId: 1, approvalStatus: 1 });
ticketSchema.index({ organizerId: 1, approvalStatus: 1 });
ticketSchema.index({ approvalSubmittedAt: -1 });

// Virtual Fields
ticketSchema.virtual("isActive").get(function () {
  return this.status === "confirmed" && new Date() < this.expiresAt;
});

ticketSchema.virtual("isCheckedIn").get(function () {
  return this.status === "checked-in";
});

ticketSchema.virtual("isFree").get(function () {
  return this.ticketPrice === 0;
});

ticketSchema.virtual("isVirtualEvent").get(function () {
  return this.eventType === "virtual";
});

ticketSchema.virtual("isHybridEvent").get(function () {
  return this.eventType === "hybrid";
});

ticketSchema.virtual("hasVirtualAccess").get(function () {
  return this.accessType === "virtual" || this.accessType === "both";
});

ticketSchema.virtual("hasPhysicalAccess").get(function () {
  return this.accessType === "physical" || this.accessType === "both";
});

ticketSchema.virtual("canCheckIn").get(function () {
  return this.status === "confirmed" && new Date() < this.expiresAt;
});

ticketSchema.virtual("daysUntilEvent").get(function () {
  const now = new Date();
  const eventDate = new Date(this.eventStartDate);
  const diffTime = eventDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// NEW: Approval virtuals
ticketSchema.virtual("requiresApproval").get(function () {
  return this.approvalStatus === "pending" || this.approvalStatus === "not-required" ? false : true;
});

ticketSchema.virtual("isPendingApproval").get(function () {
  return this.approvalStatus === "pending";
});

ticketSchema.virtual("isApproved").get(function () {
  return this.approvalStatus === "approved";
});

ticketSchema.virtual("isRejected").get(function () {
  return this.approvalStatus === "rejected";
});

ticketSchema.virtual("canBeCheckedIn").get(function () {
  return this.status === "confirmed" && 
         new Date() < this.expiresAt && 
         (this.approvalStatus === "approved" || this.approvalStatus === "not-required");
});

ticketSchema.virtual("approvalPendingTime").get(function () {
  if (!this.approvalSubmittedAt) return 0;
  const now = new Date();
  const submittedAt = new Date(this.approvalSubmittedAt);
  return Math.ceil((now - submittedAt) / (1000 * 60 * 60 * 24)); // days
});

// PRE-SAVE MIDDLEWARE
ticketSchema.pre("save", function (next) {
  // Generate ticket number if not provided
  if (!this.ticketNumber) {
    this.ticketNumber = `TKT-${Date.now().toString().slice(-8)}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;
  }

  // Generate QR code if not provided
  if (!this.qrCode) {
    this.qrCode = `QR-${this._id ? this._id.toString() : 'TEMP'}-${Date.now()}`;
  }

  // Generate barcode if not provided
  if (!this.barcode) {
    this.barcode = `BC-${this.ticketNumber}`;
  }

  // Generate security code if not provided
  if (!this.securityCode) {
    this.securityCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Set expiration date (7 days after event start date)
  if (!this.expiresAt && this.eventStartDate) {
    this.expiresAt = new Date(this.eventStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  // Auto-set access type for event type
  if (!this.accessType) {
    if (this.eventType === "virtual") {
      this.accessType = "virtual";
    } else if (this.eventType === "physical") {
      this.accessType = "physical";
    }
  }

  // Auto-set payment method for free tickets
  if (this.ticketPrice === 0 && this.paymentMethod === "card") {
    this.paymentMethod = "free";
    this.paymentStatus = "completed";
  }

  // NEW: Handle approval status for free tickets
  if (this.ticketPrice === 0 && this.approvalStatus === "not-required" && this.isNew) {
    // For new free tickets, set to pending approval by default
    this.approvalStatus = "pending";
    this.approvalSubmittedAt = new Date();
  }

  // NEW: Sync status with approval status
  if (this.isModified('approvalStatus')) {
    if (this.approvalStatus === "rejected" && this.status === "confirmed") {
      this.status = "rejected";
    } else if (this.approvalStatus === "approved" && this.status === "pending-approval") {
      this.status = "confirmed";
    }
  }

  // NEW: Set approval submitted timestamp when questions are answered
  if (this.isModified('approvalQuestions') && this.approvalQuestions.length > 0 && !this.approvalSubmittedAt) {
    this.approvalSubmittedAt = new Date();
  }

  next();
});

// INSTANCE METHODS

// Method to check in ticket
ticketSchema.methods.checkIn = async function (checkedInBy, location = null) {
  if (this.status !== "confirmed") {
    throw new Error(`Cannot check in ticket with status: ${this.status}`);
  }

  if (new Date() > this.expiresAt) {
    throw new Error("Cannot check in expired ticket");
  }

  // NEW: Check if ticket requires and has approval
  if (this.approvalStatus === "pending") {
    throw new Error("Cannot check in ticket pending approval");
  }

  if (this.approvalStatus === "rejected") {
    throw new Error("Cannot check in rejected ticket");
  }

  this.status = "checked-in";
  this.checkedInAt = new Date();
  this.checkedInBy = checkedInBy;

  if (location) {
    this.checkInLocation = {
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
    };
  }

  await this.save();
  return this;
};

// Method to cancel ticket
ticketSchema.methods.cancel = async function (reason = "") {
  if (this.status !== "confirmed" && this.status !== "pending-approval") {
    throw new Error(`Cannot cancel ticket with status: ${this.status}`);
  }

  if (this.isCheckedIn) {
    throw new Error("Cannot cancel checked-in ticket");
  }

  this.status = "cancelled";
  this.refundStatus = "requested";
  this.refundReason = reason;

  await this.save();
  return this;
};

// NEW: Method to submit approval answers
ticketSchema.methods.submitApprovalAnswers = async function (answers) {
  if (this.approvalStatus !== "pending") {
    throw new Error("Cannot submit answers for ticket not pending approval");
  }

  this.approvalQuestions = answers;
  this.approvalSubmittedAt = new Date();

  await this.save();
  return this;
};

// NEW: Method to approve ticket
ticketSchema.methods.approve = async function (approvedBy, notes = "") {
  if (this.approvalStatus !== "pending") {
    throw new Error(`Cannot approve ticket with approval status: ${this.approvalStatus}`);
  }

  this.approvalStatus = "approved";
  this.approvalDecidedAt = new Date();
  this.approvalDecidedBy = approvedBy;
  this.approvalNotes = notes;
  this.status = "confirmed";

  await this.save();
  return this;
};

// NEW: Method to reject ticket
ticketSchema.methods.reject = async function (rejectedBy, reason = "", notes = "") {
  if (this.approvalStatus !== "pending") {
    throw new Error(`Cannot reject ticket with approval status: ${this.approvalStatus}`);
  }

  this.approvalStatus = "rejected";
  this.approvalDecidedAt = new Date();
  this.approvalDecidedBy = rejectedBy;
  this.rejectionReason = reason;
  this.approvalNotes = notes;
  this.status = "rejected";

  await this.save();
  return this;
};

// Method to verify security code
ticketSchema.methods.verifySecurityCode = function (code) {
  return this.securityCode === code;
};

// Method to generate QR code data
ticketSchema.methods.generateQRData = function () {
  return JSON.stringify({
    ticketId: this._id.toString(),
    ticketNumber: this.ticketNumber,
    eventId: this.eventId.toString(),
    securityCode: this.securityCode,
  });
};

// Method to get virtual event access (for virtual/hybrid events)
ticketSchema.methods.getVirtualAccess = function () {
  if (!this.isVirtualEvent && !this.isHybridEvent) {
    throw new Error("This ticket is not for a virtual or hybrid event");
  }
  
  if (!this.hasVirtualAccess) {
    throw new Error("This ticket does not include virtual access");
  }

  // NEW: Check approval status for free tickets
  if (this.ticketPrice === 0 && this.approvalStatus !== "approved") {
    throw new Error("Virtual access not available - ticket pending approval");
  }
  
  return {
    virtualLink: this.virtualEventLink,
    accessType: this.accessType,
    eventName: this.eventName,
    eventStartDate: this.eventStartDate
  };
};

// NEW: Method to get approval information
ticketSchema.methods.getApprovalInfo = function () {
  return {
    status: this.approvalStatus,
    submittedAt: this.approvalSubmittedAt,
    decidedAt: this.approvalDecidedAt,
    decidedBy: this.approvalDecidedBy,
    questions: this.approvalQuestions,
    notes: this.approvalNotes,
    rejectionReason: this.rejectionReason,
    isPending: this.isPendingApproval,
    isApproved: this.isApproved,
    isRejected: this.isRejected
  };
};

// STATIC METHODS

// Static method to find tickets by event with pagination
ticketSchema.statics.findByEvent = function (eventId, options = {}) {
  const { status, approvalStatus, page = 1, limit = 50, sort = "-purchaseDate" } = options;
  
  const query = { eventId };
  if (status) query.status = status;
  if (approvalStatus) query.approvalStatus = approvalStatus;

  return this.find(query)
    .populate("userId", "firstName lastName email phone profilePicture")
    .populate("checkedInBy", "firstName lastName")
    .populate("approvalDecidedBy", "firstName lastName")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to find tickets by user
ticketSchema.statics.findByUser = function (userId, options = {}) {
  const { status, approvalStatus, page = 1, limit = 20, sort = "-purchaseDate" } = options;
  
  const query = { userId };
  if (status) query.status = status;
  if (approvalStatus) query.approvalStatus = approvalStatus;

  return this.find(query)
    .populate("eventId", "title startDate endDate time venue city images organizer eventType")
    .populate("organizerId", "firstName lastName companyName profilePicture")
    .populate("approvalDecidedBy", "firstName lastName")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to get event statistics
ticketSchema.statics.getEventStats = async function (eventId) {
  const stats = await this.aggregate([
    {
      $match: { eventId: new mongoose.Types.ObjectId(eventId) },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalRevenue: { $sum: "$totalAmount" },
        totalTickets: { $sum: "$quantity" },
      },
    },
  ]);

  const approvalStats = await this.aggregate([
    {
      $match: { eventId: new mongoose.Types.ObjectId(eventId) },
    },
    {
      $group: {
        _id: "$approvalStatus",
        count: { $sum: 1 },
        totalTickets: { $sum: "$quantity" },
      },
    },
  ]);

  const total = await this.aggregate([
    {
      $match: { eventId: new mongoose.Types.ObjectId(eventId) },
    },
    {
      $group: {
        _id: null,
        totalTickets: { $sum: "$quantity" },
        totalRevenue: { $sum: "$totalAmount" },
        checkedInTickets: {
          $sum: {
            $cond: [{ $eq: ["$status", "checked-in"] }, "$quantity", 0],
          },
        },
        pendingApprovalTickets: {
          $sum: {
            $cond: [{ $eq: ["$approvalStatus", "pending"] }, "$quantity", 0],
          },
        },
      },
    },
  ]);

  return {
    byStatus: stats,
    byApprovalStatus: approvalStats,
    total: total[0] || {
      totalTickets: 0,
      totalRevenue: 0,
      checkedInTickets: 0,
      pendingApprovalTickets: 0,
    },
  };
};

// Static method to expire old tickets
ticketSchema.statics.expireOldTickets = async function () {
  const result = await this.updateMany(
    {
      status: "confirmed",
      expiresAt: { $lt: new Date() },
    },
    {
      $set: { status: "expired" },
    }
  );

  return result;
};

// Static method to find checked-in tickets for an event
ticketSchema.statics.findCheckedInTickets = function (eventId, options = {}) {
  const { page = 1, limit = 50, sort = "-checkedInAt" } = options;
  
  return this.find({ 
    eventId, 
    status: "checked-in" 
  })
    .populate("userId", "firstName lastName email phone profilePicture")
    .populate("checkedInBy", "firstName lastName")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

// NEW: Static method to find tickets pending approval
ticketSchema.statics.findPendingApproval = function (organizerId, options = {}) {
  const { page = 1, limit = 50, sort = "approvalSubmittedAt" } = options;
  
  return this.find({ 
    organizerId,
    approvalStatus: "pending"
  })
    .populate("userId", "firstName lastName email phone profilePicture")
    .populate("eventId", "title startDate endDate time venue")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

// NEW: Static method to get approval statistics for organizer
ticketSchema.statics.getApprovalStats = async function (organizerId) {
  const stats = await this.aggregate([
    {
      $match: { 
        organizerId: new mongoose.Types.ObjectId(organizerId),
        approvalStatus: { $in: ["pending", "approved", "rejected"] }
      },
    },
    {
      $group: {
        _id: "$approvalStatus",
        count: { $sum: 1 },
        totalTickets: { $sum: "$quantity" },
      },
    },
  ]);

  const pendingTimeStats = await this.aggregate([
    {
      $match: { 
        organizerId: new mongoose.Types.ObjectId(organizerId),
        approvalStatus: "pending",
        approvalSubmittedAt: { $exists: true }
      },
    },
    {
      $group: {
        _id: null,
        avgPendingDays: {
          $avg: {
            $divide: [
              { $subtract: [new Date(), "$approvalSubmittedAt"] },
              1000 * 60 * 60 * 24 // Convert to days
            ]
          }
        },
        maxPendingDays: {
          $max: {
            $divide: [
              { $subtract: [new Date(), "$approvalSubmittedAt"] },
              1000 * 60 * 60 * 24
            ]
          }
        },
      },
    },
  ]);

  return {
    byStatus: stats,
    pendingTime: pendingTimeStats[0] || { avgPendingDays: 0, maxPendingDays: 0 },
  };
};

// NEW: Static method to auto-approve tickets based on event settings
ticketSchema.statics.autoApproveTickets = async function (eventId) {
  const Event = mongoose.model("Event");
  const event = await Event.findById(eventId);
  
  if (!event || !event.attendanceApproval?.autoApprove) {
    return { success: false, message: "Auto-approval not enabled for this event" };
  }

  const result = await this.updateMany(
    {
      eventId: new mongoose.Types.ObjectId(eventId),
      approvalStatus: "pending",
      approvalSubmittedAt: { $exists: true }
    },
    {
      $set: { 
        approvalStatus: "approved",
        approvalDecidedAt: new Date(),
        status: "confirmed"
      }
    }
  );

  return {
    success: true,
    approvedCount: result.modifiedCount,
    message: `Auto-approved ${result.modifiedCount} tickets`
  };
};

module.exports = mongoose.model("Ticket", ticketSchema);