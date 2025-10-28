const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    // Ticket Identification
    ticketNumber: {
      type: String,
      required: [true, "Ticket number is required"],
      unique: true,
      index: true, // ✅ KEEP this - remove the separate index below
    },
    qrCode: {
      type: String,
      required: true,
      unique: true,
      index: true, // ✅ KEEP this - remove the separate index below
    },
    barcode: {
      type: String,
      unique: true,
      index: true, // ✅ KEEP this
    },

    // Event Reference
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event ID is required"],
      index: true, // ✅ KEEP this
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
      index: true, // ✅ KEEP this
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
      enum: ["confirmed", "checked-in", "cancelled", "expired", "refunded"],
      default: "confirmed",
      index: true, // ✅ KEEP this
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
      index: true, // ✅ KEEP this
    },

    // Booking Reference
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true, // ✅ KEEP this
    },

    // Organizer Information
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // ✅ KEEP this
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
      index: true, // ✅ KEEP this
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes - REMOVED DUPLICATES
// ❌ REMOVED: ticketSchema.index({ ticketNumber: 1 }); // Duplicate of field definition
// ❌ REMOVED: ticketSchema.index({ qrCode: 1 }); // Duplicate of field definition
// ❌ REMOVED: ticketSchema.index({ bookingId: 1 }); // Duplicate of field definition

ticketSchema.index({ eventId: 1, userId: 1 });
ticketSchema.index({ eventId: 1, status: 1 });
ticketSchema.index({ userId: 1, status: 1 });
ticketSchema.index({ organizerId: 1, status: 1 });
ticketSchema.index({ purchaseDate: -1 });

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
  if (this.status !== "confirmed") {
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
  
  return {
    virtualLink: this.virtualEventLink,
    accessType: this.accessType,
    eventName: this.eventName,
    eventStartDate: this.eventStartDate
  };
};

// STATIC METHODS

// Static method to find tickets by event with pagination
ticketSchema.statics.findByEvent = function (eventId, options = {}) {
  const { status, page = 1, limit = 50, sort = "-purchaseDate" } = options;
  
  const query = { eventId };
  if (status) query.status = status;

  return this.find(query)
    .populate("userId", "firstName lastName email phone profilePicture")
    .populate("checkedInBy", "firstName lastName")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to find tickets by user
ticketSchema.statics.findByUser = function (userId, options = {}) {
  const { status, page = 1, limit = 20, sort = "-purchaseDate" } = options;
  
  const query = { userId };
  if (status) query.status = status;

  return this.find(query)
    .populate("eventId", "title startDate endDate time venue city images organizer eventType")
    .populate("organizerId", "firstName lastName companyName profilePicture")
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
      },
    },
  ]);

  return {
    byStatus: stats,
    total: total[0] || {
      totalTickets: 0,
      totalRevenue: 0,
      checkedInTickets: 0,
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

module.exports = mongoose.model("Ticket", ticketSchema);