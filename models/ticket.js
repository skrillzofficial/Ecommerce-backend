const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    // Ticket Identification
    ticketNumber: {
      type: String,
      required: [true, "Ticket number is required"],
      unique: true,

    },
    qrCode: {
      type: String,
      required: true,
      
    },
    barcode: {
      type: String,
    },

    // Event Information (from Event schema)
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event ID is required"],

    },
    eventName: {
      type: String,
      required: true,
      trim: true,
    },
    eventDate: {
      type: Date,
      required: true,
    },
    eventTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"],
    },
    eventEndTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"],
    },
    eventVenue: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, "Venue name cannot exceed 200 characters"],
    },
    eventAddress: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500, "Address cannot exceed 500 characters"],
    },
    eventCity: {
      type: String,
      required: true,
      enum: [
        "Lagos", "Abuja", "Ibadan", "Port Harcourt", "Kano", "Benin",
        "Enugu", "Kaduna", "Owerri", "Jos", "Calabar", "Abeokuta", "Other"
      ],
    },
    eventCategory: {
      type: String,
      required: true,
      enum: [
        "Technology", "Business", "Marketing", "Arts", "Health", "Education",
        "Music", "Food", "Sports", "Entertainment", "Networking", "Other"
      ],
    },

    // Static Event Coordinates (from Event schema)
    eventCoordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
    },

    // Ticket Holder Information
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],

    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    userPhone: {
      type: String,
      trim: true,
    },

    // Ticket Details (aligned with Event ticketTypes)
    ticketType: {
      type: String,
      required: true,
      enum: ["Regular", "VIP", "VVIP"],
      default: "Regular",
    },
    ticketPrice: {
      type: Number,
      required: true,
      min: [0, "Price cannot be negative"],
    },
    currency: {
      type: String,
      default: "NGN",
      enum: ["NGN", "USD", "EUR", "GBP"],
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

    // Ticket Status (aligned with Event attendee status)
    status: {
      type: String,
      required: true,
      enum: {
        values: ["confirmed", "used", "cancelled", "expired"],
        message: "{VALUE} is not a valid ticket status",
      },
      default: "confirmed",
      
    },

    // Validation Information (for real-time validation)
    isCheckedIn: {
      type: Boolean,
      default: false,
    },
    checkedInAt: {
      type: Date,
    },
    validatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    validationLocation: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
      address: String,
      accuracy: Number,
    },

    // Location Tracking (for real-time location features)
    locationHistory: [
      {
        latitude: {
          type: Number,
          required: false,
          min: -90,
          max: 90,
        },
        longitude: {
          type: Number,
          required: false,
          min: -180,
          max: 180,
        },
        address: String,
        accuracy: Number,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        type: {
          type: String,
          enum: ["purchase", "validation", "check-in", "live-tracking"],
          default: "purchase",
        },
        source: {
          type: String,
          enum: ["organizer", "attendee", "system"],
          default: "system",
        },
      },
    ],

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
      
    },

    // Organizer Information (from Event schema)
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,

    },
    organizerName: {
      type: String,
      required: true,
    },
    organizerEmail: {
      type: String,
    },
    organizerCompany: {
      type: String,
    },

    // Access Permissions (based on ticket type)
    accessLevel: {
      type: String,
      enum: ["general", "vip", "vvip", "backstage", "organizer"],
      default: function() {
        if (this.ticketType === "VVIP") return "vvip";
        if (this.ticketType === "VIP") return "vip";
        return "general";
      },
    },
    allowedAreas: [{
      type: String,
      trim: true,
    }],
    benefits: [{
      type: String,
      trim: true,
    }],

    // Transfer & Resale
    isTransferable: {
      type: Boolean,
      default: true,
    },
    transferredFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    transferredTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    transferDate: {
      type: Date,
    },

    // Refund Information (aligned with Event refundPolicy)
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

    // Additional Features
    specialRequirements: {
      type: String,
      maxlength: [500, "Special requirements cannot exceed 500 characters"],
    },
    guestList: [{
      name: String,
      email: String,
      phone: String,
    }],

    // Analytics & Tracking
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastViewed: {
      type: Date,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    reminderDate: {
      type: Date,
    },

    // Security Features
    securityCode: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Timestamps
    expiresAt: {
      type: Date,
      // REMOVED: index: { expireAfterSeconds: 0 } (will be defined in schema.index() below)
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes defined ONLY ONCE here - no duplicates
ticketSchema.index({ ticketNumber: 1 });
ticketSchema.index({ qrCode: 1 });
ticketSchema.index({ eventId: 1 });
ticketSchema.index({ userId: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ transactionId: 1 });
ticketSchema.index({ organizerId: 1 });
ticketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes
ticketSchema.index({ eventId: 1, userId: 1 });
ticketSchema.index({ status: 1, eventDate: 1 });
ticketSchema.index({ userId: 1, status: 1 });
ticketSchema.index({ eventId: 1, status: 1 });
ticketSchema.index({ userEmail: 1, eventId: 1 });
ticketSchema.index({ organizerId: 1, status: 1 });
ticketSchema.index({ ticketType: 1, status: 1 });

// Additional performance indexes
ticketSchema.index({ purchaseDate: -1 });
ticketSchema.index({ checkedInAt: -1 });
ticketSchema.index({ "locationHistory.timestamp": -1 });

// Virtual Fields
ticketSchema.virtual("isActive").get(function () {
  return this.status === "confirmed" && new Date() < this.eventDate;
});

ticketSchema.virtual("isExpired").get(function () {
  return new Date() > this.eventDate;
});

ticketSchema.virtual("daysUntilEvent").get(function () {
  const now = new Date();
  const eventDate = new Date(this.eventDate);
  const diffTime = eventDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

ticketSchema.virtual("validationStatus").get(function () {
  if (this.isCheckedIn) {
    return "checked-in";
  }
  if (this.status === "used") {
    return "used";
  }
  if (this.status === "cancelled") {
    return "cancelled";
  }
  return "active";
});

ticketSchema.virtual("canBeTransferred").get(function () {
  return (
    this.isTransferable &&
    this.status === "confirmed" &&
    new Date() < this.eventDate &&
    !this.isCheckedIn
  );
});

ticketSchema.virtual("isUpcoming").get(function () {
  return new Date() < this.eventDate;
});

ticketSchema.virtual("isPast").get(function () {
  return new Date() > this.eventDate;
});

// Pre-save Middleware
ticketSchema.pre("save", function (next) {
  // Generate ticket number if not provided
  if (!this.ticketNumber) {
    this.ticketNumber = `TKT-${this.eventId.toString().slice(-6)}-${Date.now().toString().slice(-6)}`;
  }

  // Generate QR code if not provided
  if (!this.qrCode) {
    this.qrCode = `QR-${this._id.toString()}-${Date.now()}`;
  }

  // Set expiration date (7 days after event date for cleanup)
  if (!this.expiresAt) {
    const eventDate = new Date(this.eventDate);
    this.expiresAt = new Date(eventDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  // Set benefits based on ticket type
  if (this.ticketType === "VIP" && (!this.benefits || this.benefits.length === 0)) {
    this.benefits = ["Priority access", "VIP lounge", "Complimentary drinks"];
  } else if (this.ticketType === "VVIP" && (!this.benefits || this.benefits.length === 0)) {
    this.benefits = ["VVIP access", "Backstage pass", "Meet & greet", "Premium seating"];
  }

  next();
});

// Pre-save middleware for status changes
ticketSchema.pre("save", function (next) {
  if (this.isModified("status") && this.status === "used") {
    this.isCheckedIn = true;
    this.checkedInAt = new Date();
  }

  if (this.isModified("status") && this.status === "cancelled") {
    this.refundStatus = "requested";
    this.refundAmount = this.totalAmount * 0.7; // 70% refund for partial policy
  }

  next();
});

// Methods
ticketSchema.methods.validateTicket = async function (validatorId, location = null) {
  if (this.status !== "confirmed") {
    throw new Error(`Cannot validate ticket with status: ${this.status}`);
  }

  if (new Date() > this.eventDate) {
    throw new Error("Cannot validate ticket for past event");
  }

  this.status = "used";
  this.isCheckedIn = true;
  this.checkedInAt = new Date();
  this.validatedBy = validatorId;

  if (location) {
    this.validationLocation = {
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
      accuracy: location.accuracy,
    };

    // Add to location history
    this.locationHistory.push({
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
      accuracy: location.accuracy,
      type: "validation",
      source: "organizer",
      timestamp: new Date(),
    });
  }

  await this.save();
  return this;
};

ticketSchema.methods.cancelTicket = async function (reason = "") {
  if (this.status !== "confirmed") {
    throw new Error(`Cannot cancel ticket with status: ${this.status}`);
  }

  if (this.isCheckedIn) {
    throw new Error("Cannot cancel checked-in ticket");
  }

  this.status = "cancelled";
  this.refundStatus = "requested";
  this.refundReason = reason;

  // Calculate refund based on policy
  if (this.refundPolicy === "full") {
    this.refundAmount = this.totalAmount;
  } else if (this.refundPolicy === "partial") {
    this.refundAmount = this.totalAmount * 0.7; // 70% refund
  } else {
    this.refundAmount = 0;
  }

  await this.save();
  return this;
};

ticketSchema.methods.transferTicket = async function (newUserId, newUserInfo) {
  if (!this.canBeTransferred) {
    throw new Error("Ticket cannot be transferred");
  }

  this.transferredFrom = this.userId;
  this.userId = newUserId;
  
  if (newUserInfo) {
    this.userName = newUserInfo.name || this.userName;
    this.userEmail = newUserInfo.email || this.userEmail;
    this.userPhone = newUserInfo.phone || this.userPhone;
  }

  this.transferDate = new Date();

  await this.save();
  return this;
};

ticketSchema.methods.addLocationPoint = async function (location, type = "live-tracking", source = "attendee") {
  this.locationHistory.push({
    latitude: location.latitude,
    longitude: location.longitude,
    address: location.address,
    accuracy: location.accuracy,
    type: type,
    source: source,
    timestamp: new Date(),
  });

  // Keep only last 20 location points
  if (this.locationHistory.length > 20) {
    this.locationHistory = this.locationHistory.slice(-20);
  }

  await this.save();
  return this;
};

ticketSchema.methods.getRecentLocations = function (limit = 10) {
  return this.locationHistory
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

ticketSchema.methods.incrementViews = async function () {
  this.views += 1;
  this.lastViewed = new Date();
  await this.save({ validateBeforeSave: false });
};

// Static Methods
ticketSchema.statics.findByEvent = function (eventId, options = {}) {
  const query = { eventId: eventId };

  if (options.status) {
    query.status = options.status;
  }

  if (options.ticketType) {
    query.ticketType = options.ticketType;
  }

  return this.find(query)
    .populate("userId", "name email phone")
    .populate("validatedBy", "name email")
    .populate("organizerId", "name email companyName")
    .sort(options.sort || { purchaseDate: -1 });
};

ticketSchema.statics.findByUser = function (userId, options = {}) {
  const query = { userId: userId };

  if (options.status) {
    query.status = options.status;
  }

  if (options.eventId) {
    query.eventId = options.eventId;
  }

  return this.find(query)
    .populate("eventId", "title date time venue city status images")
    .populate("organizerId", "name companyName")
    .sort(options.sort || { eventDate: 1 });
};

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
        averagePrice: { $avg: "$ticketPrice" },
      },
    },
  ]);

  const ticketTypes = await this.aggregate([
    {
      $match: { eventId: new mongoose.Types.ObjectId(eventId) },
    },
    {
      $group: {
        _id: "$ticketType",
        count: { $sum: 1 },
        totalRevenue: { $sum: "$totalAmount" },
        checkedIn: { $sum: { $cond: [{ $eq: ["$isCheckedIn", true] }, 1, 0] } },
      },
    },
  ]);

  return {
    byStatus: stats,
    byType: ticketTypes,
    totalTickets: stats.reduce((sum, stat) => sum + stat.count, 0),
    totalRevenue: stats.reduce((sum, stat) => sum + stat.totalRevenue, 0),
  };
};

ticketSchema.statics.generateTicketNumber = function (eventId) {
  const timestamp = Date.now().toString().slice(-6);
  const eventCode = eventId.toString().slice(-6);
  return `TKT-${eventCode}-${timestamp}`;
};

// Query Helpers
ticketSchema.query.active = function () {
  return this.where({ status: "confirmed" });
};

ticketSchema.query.checkedIn = function () {
  return this.where({ isCheckedIn: true });
};

ticketSchema.query.byEvent = function (eventId) {
  return this.where({ eventId: eventId });
};

ticketSchema.query.byUser = function (userId) {
  return this.where({ userId: userId });
};

ticketSchema.query.byOrganizer = function (organizerId) {
  return this.where({ organizerId: organizerId });
};

ticketSchema.query.upcoming = function () {
  return this.where({ eventDate: { $gte: new Date() } });
};

module.exports = mongoose.model("Ticket", ticketSchema);