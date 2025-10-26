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
        // 36 States + FCT
        "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
        "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
        "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa", "Kaduna",
        "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
        "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
        "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
        "FCT (Abuja)", 
        "Other"
      ],
    },
    eventCategory: {
      type: String,
      required: true,
      enum: [
        "Technology", "Business", "Marketing", "Arts", "Health", "Education",
        "Music", "Food", "Sports", "Entertainment", "Networking", "Lifestyle",
        "Other"
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
      enum: ["Regular", "VIP", "VVIP", "Free"],
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
        values: ["confirmed", "used", "cancelled", "expired", "pending"],
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

ticketSchema.virtual("isFree").get(function () {
  return this.ticketPrice === 0;
});

ticketSchema.virtual("ticketValue").get(function () {
  return this.ticketPrice * this.quantity;
});

ticketSchema.virtual("refundEligible").get(function () {
  if (this.status !== "confirmed") return false;
  if (this.isCheckedIn) return false;
  if (new Date() > this.eventDate) return false;
  
  const eventDate = new Date(this.eventDate);
  const now = new Date();
  const hoursUntilEvent = (eventDate - now) / (1000 * 60 * 60);
  
  // Only eligible for refund if more than 24 hours before event
  return hoursUntilEvent > 24;
});

// PRE-SAVE MIDDLEWARE

// Pre-save middleware for data validation and generation
ticketSchema.pre("save", function (next) {
  // Generate ticket number if not provided
  if (!this.ticketNumber) {
    this.ticketNumber = `TKT-${this.eventId ? this.eventId.toString().slice(-6) : 'EVENT'}-${Date.now().toString().slice(-6)}`;
  }

  // Generate QR code if not provided
  if (!this.qrCode) {
    this.qrCode = `QR-${this._id ? this._id.toString() : 'TEMP'}-${Date.now()}`;
  }

  // Generate barcode if not provided
  if (!this.barcode) {
    this.barcode = `BC-${this.ticketNumber}-${Date.now().toString().slice(-8)}`;
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
  } else if (this.ticketType === "Free" && (!this.benefits || this.benefits.length === 0)) {
    this.benefits = ["General admission"];
  }

  // Set payment method for free tickets
  if (this.ticketPrice === 0 && this.paymentMethod === "card") {
    this.paymentMethod = "free";
    this.paymentStatus = "completed";
  }

  // Set access level based on ticket type
  if (!this.accessLevel) {
    if (this.ticketType === "VVIP") this.accessLevel = "vvip";
    else if (this.ticketType === "VIP") this.accessLevel = "vip";
    else this.accessLevel = "general";
  }

  // Set allowed areas based on access level
  if (!this.allowedAreas || this.allowedAreas.length === 0) {
    if (this.accessLevel === "vvip") {
      this.allowedAreas = ["Main Hall", "VVIP Lounge", "Backstage", "Premium Seating"];
    } else if (this.accessLevel === "vip") {
      this.allowedAreas = ["Main Hall", "VIP Lounge", "Premium Seating"];
    } else {
      this.allowedAreas = ["Main Hall", "General Seating"];
    }
  }

  // Generate security code if not provided
  if (!this.securityCode) {
    this.securityCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  next();
});

// Pre-save middleware for status changes
ticketSchema.pre("save", function (next) {
  // Handle status changes
  if (this.isModified("status")) {
    if (this.status === "used") {
      this.isCheckedIn = true;
      this.checkedInAt = new Date();
    }

    if (this.status === "cancelled") {
      this.refundStatus = "requested";
      // Calculate refund based on policy
      if (this.refundPolicy === "full") {
        this.refundAmount = this.totalAmount;
      } else if (this.refundPolicy === "partial") {
        this.refundAmount = this.totalAmount * 0.7; // 70% refund
      } else {
        this.refundAmount = 0;
      }
    }

    if (this.status === "expired") {
      // Auto-expire tickets after event date
      this.isTransferable = false;
    }
  }

  // Handle check-in
  if (this.isModified("isCheckedIn") && this.isCheckedIn) {
    this.status = "used";
    this.checkedInAt = new Date();
  }

  // Handle refund processing
  if (this.isModified("refundStatus") && this.refundStatus === "processed") {
    this.refundDate = new Date();
  }

  next();
});

// Pre-save middleware for number validation (NaN protection)
ticketSchema.pre("save", function (next) {
  // Safe number parsing function
  const safeNumber = (value, defaultValue = 0) => {
    if (value === undefined || value === null || isNaN(value)) {
      return defaultValue;
    }
    return Number(value);
  };

  // Validate all number fields
  this.ticketPrice = safeNumber(this.ticketPrice, 0);
  this.quantity = safeNumber(this.quantity, 1);
  this.totalAmount = safeNumber(this.totalAmount, this.ticketPrice * this.quantity);
  this.refundAmount = safeNumber(this.refundAmount, 0);
  this.views = safeNumber(this.views, 0);
  this.verificationAttempts = safeNumber(this.verificationAttempts, 0);

  // Validate location coordinates
  if (this.eventCoordinates) {
    this.eventCoordinates.latitude = safeNumber(this.eventCoordinates.latitude, 0);
    this.eventCoordinates.longitude = safeNumber(this.eventCoordinates.longitude, 0);
  }

  if (this.validationLocation) {
    this.validationLocation.latitude = safeNumber(this.validationLocation.latitude, 0);
    this.validationLocation.longitude = safeNumber(this.validationLocation.longitude, 0);
    this.validationLocation.accuracy = safeNumber(this.validationLocation.accuracy, 50);
  }

  // Validate location history
  if (this.locationHistory && this.locationHistory.length > 0) {
    this.locationHistory.forEach(location => {
      location.latitude = safeNumber(location.latitude, 0);
      location.longitude = safeNumber(location.longitude, 0);
      location.accuracy = safeNumber(location.accuracy, 50);
    });
  }

  next();
});

// INSTANCE METHODS

// Method to validate ticket
ticketSchema.methods.validateTicket = async function (validatorId, location = null) {
  if (this.status !== "confirmed") {
    throw new Error(`Cannot validate ticket with status: ${this.status}`);
  }

  if (new Date() > this.eventDate) {
    throw new Error("Cannot validate ticket for past event");
  }

  if (this.isCheckedIn) {
    throw new Error("Ticket is already checked in");
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

// Method to cancel ticket
ticketSchema.methods.cancelTicket = async function (reason = "") {
  if (this.status !== "confirmed") {
    throw new Error(`Cannot cancel ticket with status: ${this.status}`);
  }

  if (this.isCheckedIn) {
    throw new Error("Cannot cancel checked-in ticket");
  }

  if (new Date() > this.eventDate) {
    throw new Error("Cannot cancel ticket for past event");
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

// Method to transfer ticket
ticketSchema.methods.transferTicket = async function (newUserId, newUserInfo) {
  if (!this.canBeTransferred) {
    throw new Error("Ticket cannot be transferred");
  }

  if (this.userId.toString() === newUserId.toString()) {
    throw new Error("Cannot transfer ticket to yourself");
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

// Method to add location point
ticketSchema.methods.addLocationPoint = async function (location, type = "live-tracking", source = "attendee") {
  // Validate location data
  if (!location.latitude || !location.longitude) {
    throw new Error("Latitude and longitude are required");
  }

  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  
  if (isNaN(lat) || lat < -90 || lat > 90) {
    throw new Error("Invalid latitude value");
  }
  
  if (isNaN(lng) || lng < -180 || lng > 180) {
    throw new Error("Invalid longitude value");
  }

  this.locationHistory.push({
    latitude: lat,
    longitude: lng,
    address: location.address || '',
    accuracy: location.accuracy || 50,
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

// Method to get recent locations
ticketSchema.methods.getRecentLocations = function (limit = 10) {
  return this.locationHistory
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

// Method to increment views
ticketSchema.methods.incrementViews = async function () {
  this.views += 1;
  this.lastViewed = new Date();
  await this.save({ validateBeforeSave: false });
};

// Method to verify security code
ticketSchema.methods.verifySecurityCode = function (code) {
  if (this.securityCode === code) {
    this.isVerified = true;
    this.verificationAttempts = 0;
    return true;
  } else {
    this.verificationAttempts += 1;
    return false;
  }
};

// Method to check if ticket can be refunded
ticketSchema.methods.canBeRefunded = function () {
  if (this.status !== "confirmed") return false;
  if (this.isCheckedIn) return false;
  if (new Date() > this.eventDate) return false;
  
  const eventDate = new Date(this.eventDate);
  const now = new Date();
  const hoursUntilEvent = (eventDate - now) / (1000 * 60 * 60);
  
  // Only eligible for refund if more than 24 hours before event
  return hoursUntilEvent > 24;
};

// Method to calculate refund amount
ticketSchema.methods.calculateRefundAmount = function () {
  if (!this.canBeRefunded()) {
    return 0;
  }

  const eventDate = new Date(this.eventDate);
  const now = new Date();
  const daysUntilEvent = (eventDate - now) / (1000 * 60 * 60 * 24);

  if (this.refundPolicy === "full") {
    return this.totalAmount;
  } else if (this.refundPolicy === "partial") {
    // Scale refund based on how close to event
    if (daysUntilEvent > 7) {
      return this.totalAmount * 0.9; // 90% refund
    } else if (daysUntilEvent > 3) {
      return this.totalAmount * 0.7; // 70% refund
    } else if (daysUntilEvent > 1) {
      return this.totalAmount * 0.5; // 50% refund
    } else {
      return this.totalAmount * 0.3; // 30% refund
    }
  } else {
    return 0; // no-refund policy
  }
};

// Method to process refund
ticketSchema.methods.processRefund = async function (reason = "") {
  if (!this.canBeRefunded()) {
    throw new Error("Ticket is not eligible for refund");
  }

  this.refundStatus = "processed";
  this.refundAmount = this.calculateRefundAmount();
  this.refundDate = new Date();
  this.refundReason = reason;

  await this.save();
  return this;
};

// Method to send reminder
ticketSchema.methods.sendReminder = async function () {
  if (this.reminderSent) {
    throw new Error("Reminder already sent for this ticket");
  }

  if (new Date() > this.eventDate) {
    throw new Error("Cannot send reminder for past event");
  }

  this.reminderSent = true;
  this.reminderDate = new Date();

  await this.save();
  return this;
};

// Method to generate QR code data
ticketSchema.methods.generateQRData = function () {
  return JSON.stringify({
    ticketId: this._id.toString(),
    ticketNumber: this.ticketNumber,
    eventId: this.eventId.toString(),
    userId: this.userId.toString(),
    securityCode: this.securityCode
  });
};

// Method to validate QR code
ticketSchema.methods.validateQRCode = function (qrData) {
  try {
    const data = JSON.parse(qrData);
    return data.ticketId === this._id.toString() && 
           data.securityCode === this.securityCode;
  } catch (error) {
    return false;
  }
};

// STATIC METHODS

// Static method to find tickets by event
ticketSchema.statics.findByEvent = function (eventId, options = {}) {
  const query = { eventId: eventId };

  if (options.status) {
    query.status = options.status;
  }

  if (options.ticketType) {
    query.ticketType = options.ticketType;
  }

  return this.find(query)
    .populate("userId", "firstName lastName email phone profilePicture")
    .populate("validatedBy", "firstName lastName email")
    .populate("organizerId", "firstName lastName email companyName profilePicture")
    .sort(options.sort || { purchaseDate: -1 });
};

// Static method to find tickets by user
ticketSchema.statics.findByUser = function (userId, options = {}) {
  const query = { userId: userId };

  if (options.status) {
    query.status = options.status;
  }

  if (options.eventId) {
    query.eventId = options.eventId;
  }

  return this.find(query)
    .populate("eventId", "title date time venue city images status organizer")
    .populate("organizerId", "firstName lastName companyName profilePicture")
    .sort(options.sort || { eventDate: 1 });
};

// Static method to find tickets by organizer
ticketSchema.statics.findByOrganizer = function (organizerId, options = {}) {
  const query = { organizerId: organizerId };

  if (options.status) {
    query.status = options.status;
  }

  if (options.eventId) {
    query.eventId = options.eventId;
  }

  return this.find(query)
    .populate("eventId", "title date time venue")
    .populate("userId", "firstName lastName email phone")
    .sort(options.sort || { purchaseDate: -1 });
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
        averagePrice: { $avg: "$ticketPrice" },
        totalTickets: { $sum: "$quantity" },
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
        totalTickets: { $sum: "$quantity" },
      },
    },
  ]);

  const totalStats = await this.aggregate([
    {
      $match: { eventId: new mongoose.Types.ObjectId(eventId) },
    },
    {
      $group: {
        _id: null,
        totalTickets: { $sum: "$quantity" },
        totalRevenue: { $sum: "$totalAmount" },
        checkedInTickets: { $sum: { $cond: [{ $eq: ["$isCheckedIn", true] }, "$quantity", 0] } },
        freeTickets: { $sum: { $cond: [{ $eq: ["$ticketPrice", 0] }, "$quantity", 0] } },
        paidTickets: { $sum: { $cond: [{ $gt: ["$ticketPrice", 0] }, "$quantity", 0] } },
      },
    },
  ]);

  return {
    byStatus: stats,
    byType: ticketTypes,
    total: totalStats[0] || {
      totalTickets: 0,
      totalRevenue: 0,
      checkedInTickets: 0,
      freeTickets: 0,
      paidTickets: 0,
    },
  };
};

// Static method to generate ticket number
ticketSchema.statics.generateTicketNumber = function (eventId) {
  const timestamp = Date.now().toString().slice(-6);
  const eventCode = eventId.toString().slice(-6);
  return `TKT-${eventCode}-${timestamp}`;
};

// Static method to find expired tickets
ticketSchema.statics.findExpiredTickets = function () {
  const now = new Date();
  return this.find({
    status: "confirmed",
    eventDate: { $lt: now }
  });
};

// Static method to auto-expire tickets
ticketSchema.statics.autoExpireTickets = async function () {
  const now = new Date();
  const result = await this.updateMany(
    {
      status: "confirmed",
      eventDate: { $lt: now }
    },
    {
      $set: { status: "expired" }
    }
  );
  return result;
};

// Static method to get popular events
ticketSchema.statics.getPopularEvents = async function (limit = 10) {
  const popularEvents = await this.aggregate([
    {
      $group: {
        _id: "$eventId",
        ticketCount: { $sum: "$quantity" },
        totalRevenue: { $sum: "$totalAmount" },
        uniqueAttendees: { $addToSet: "$userId" }
      }
    },
    {
      $lookup: {
        from: "events",
        localField: "_id",
        foreignField: "_id",
        as: "eventDetails"
      }
    },
    {
      $unwind: "$eventDetails"
    },
    {
      $project: {
        eventId: "$_id",
        eventTitle: "$eventDetails.title",
        eventDate: "$eventDetails.date",
        ticketCount: 1,
        totalRevenue: 1,
        attendeeCount: { $size: "$uniqueAttendees" }
      }
    },
    {
      $sort: { ticketCount: -1 }
    },
    {
      $limit: limit
    }
  ]);

  return popularEvents;
};

// QUERY HELPERS

// Query helper for active tickets
ticketSchema.query.active = function () {
  return this.where({ status: "confirmed" });
};

// Query helper for checked-in tickets
ticketSchema.query.checkedIn = function () {
  return this.where({ isCheckedIn: true });
};

// Query helper for tickets by event
ticketSchema.query.byEvent = function (eventId) {
  return this.where({ eventId: eventId });
};

// Query helper for tickets by user
ticketSchema.query.byUser = function (userId) {
  return this.where({ userId: userId });
};

// Query helper for tickets by organizer
ticketSchema.query.byOrganizer = function (organizerId) {
  return this.where({ organizerId: organizerId });
};

// Query helper for upcoming tickets
ticketSchema.query.upcoming = function () {
  return this.where({ eventDate: { $gte: new Date() } });
};

// Query helper for past tickets
ticketSchema.query.past = function () {
  return this.where({ eventDate: { $lt: new Date() } });
};

// Query helper for free tickets
ticketSchema.query.free = function () {
  return this.where({ ticketPrice: 0 });
};

// Query helper for paid tickets
ticketSchema.query.paid = function () {
  return this.where({ ticketPrice: { $gt: 0 } });
};

// Query helper for transferable tickets
ticketSchema.query.transferable = function () {
  return this.where({ 
    isTransferable: true,
    status: "confirmed",
    eventDate: { $gte: new Date() },
    isCheckedIn: false
  });
};

module.exports = mongoose.model("Ticket", ticketSchema);