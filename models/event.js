const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: [true, "Event title is required"],
    trim: true,
    minlength: [5, "Title must be at least 5 characters"],
    maxlength: [200, "Title cannot exceed 200 characters"],
    index: true,
  },
  description: {
    type: String,
    required: [true, "Description is required"],
    trim: true,
    minlength: [50, "Description must be at least 50 characters"],
    maxlength: [5000, "Description cannot exceed 5000 characters"],
  },
  category: {
    type: String,
    required: [true, "Category is required"],
    enum: {
      values: [
        "Technology",
        "Business",
        "Marketing",
        "Arts",
        "Health",
        "Education",
        "Music",
        "Food",
        "Sports",
        "Entertainment",
        "Networking",
        "Other"
      ],
      message: "{VALUE} is not a valid category",
    },
    index: true,
  },

  // Date & Time
  date: {
    type: Date,
    required: [true, "Event date is required"],
    validate: {
      validator: function(value) {
        return value >= new Date();
      },
      message: "Event date cannot be in the past",
    },
    index: true,
  },
  time: {
    type: String,
    required: [true, "Start time is required"],
    match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"],
  },
  endTime: {
    type: String,
    required: [true, "End time is required"],
    match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"],
  },

  // Location
  venue: {
    type: String,
    required: [true, "Venue name is required"],
    trim: true,
    maxlength: [200, "Venue name cannot exceed 200 characters"],
  },
  address: {
    type: String,
    required: [true, "Address is required"],
    trim: true,
    maxlength: [500, "Address cannot exceed 500 characters"],
  },
  city: {
    type: String,
    required: [true, "City is required"],
    enum: {
      values: [
        "Lagos",
        "Abuja",
        "Ibadan",
        "Port Harcourt",
        "Kano",
        "Benin",
        "Enugu",
        "Kaduna",
        "Owerri",
        "Jos",
        "Calabar",
        "Abeokuta",
        "Other"
      ],
      message: "{VALUE} is not a supported city",
    },
    index: true,
  },
  coordinates: {
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

  // Ticket Information
  price: {
    type: Number,
    required: [true, "Ticket price is required"],
    min: [0, "Price cannot be negative"],
    default: 0,
  },
  currency: {
    type: String,
    default: "NGN",
    enum: ["NGN", "USD", "EUR", "GBP"],
  },
  capacity: {
    type: Number,
    required: [true, "Capacity is required"],
    min: [1, "Capacity must be at least 1"],
    validate: {
      validator: Number.isInteger,
      message: "Capacity must be a whole number",
    },
  },
  availableTickets: {
    type: Number,
    default: function() {
      return this.capacity;
    },
    min: 0,
  },

  // Images
  images: [{
    url: {
      type: String,
      required: true,
    },
    publicId: String, // For Cloudinary
    alt: String,
  }],
  thumbnail: {
    type: String,
    default: function() {
      return this.images && this.images.length > 0 ? this.images[0].url : "";
    },
  },

  // Organizer Information
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Organizer is required"],
    index: true,
  },
  organizerInfo: {
    name: String,
    email: String,
    phone: String,
    companyName: String,
  },

  // Event Status
  status: {
    type: String,
    enum: {
      values: ["draft", "published", "cancelled", "completed", "postponed"],
      message: "{VALUE} is not a valid status",
    },
    default: "published",
    index: true,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  isFeatured: {
    type: Boolean,
    default: false,
    index: true,
  },

  // Attendees & Bookings
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    ticketId: String,
    bookingDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["confirmed", "pending", "cancelled"],
      default: "confirmed",
    },
    checkedIn: {
      type: Boolean,
      default: false,
    },
    checkedInAt: Date,
  }],
  totalAttendees: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Statistics
  views: {
    type: Number,
    default: 0,
    min: 0,
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
  totalLikes: {
    type: Number,
    default: 0,
    min: 0,
  },
  bookings: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Revenue
  totalRevenue: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Additional Features
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
  requirements: {
    type: String,
    maxlength: [1000, "Requirements cannot exceed 1000 characters"],
  },
  agenda: [{
    time: String,
    activity: String,
    speaker: String,
  }],
  faqs: [{
    question: String,
    answer: String,
  }],
  
  // SEO & Social
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
  },
  metaDescription: String,
  socialLinks: {
    facebook: String,
    twitter: String,
    instagram: String,
    website: String,
  },

  // Cancellation & Refund
  cancellationPolicy: {
    type: String,
    maxlength: [1000, "Cancellation policy cannot exceed 1000 characters"],
  },
  refundPolicy: {
    type: String,
    enum: ["full", "partial", "no-refund"],
    default: "partial",
  },

  // Blockchain Integration
  blockchainData: {
    contractAddress: String,
    transactionHash: String,
    tokenId: String,
    verified: {
      type: Boolean,
      default: false,
    },
  },

  // Timestamps
  publishedAt: Date,
  cancelledAt: Date,
  completedAt: Date,
  deletedAt: Date,

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for performance
eventSchema.index({ title: "text", description: "text", tags: "text" });
eventSchema.index({ date: 1, status: 1 });
eventSchema.index({ category: 1, city: 1 });
eventSchema.index({ organizer: 1, status: 1 });
eventSchema.index({ price: 1 });
eventSchema.index({ createdAt: -1 });
eventSchema.index({ isFeatured: 1, status: 1 });

// Compound indexes
eventSchema.index({ status: 1, date: 1, category: 1 });
eventSchema.index({ city: 1, date: 1, price: 1 });

// Virtual for event URL
eventSchema.virtual("eventUrl").get(function() {
  return `/event/${this.slug || this._id}`;
});

// Virtual for availability
eventSchema.virtual("isAvailable").get(function() {
  return this.availableTickets > 0 && 
         this.status === "published" && 
         this.date > new Date();
});

// Virtual for sold out status
eventSchema.virtual("isSoldOut").get(function() {
  return this.availableTickets === 0;
});

// Virtual for attendance percentage
eventSchema.virtual("attendancePercentage").get(function() {
  if (this.capacity === 0) return 0;
  return Math.round((this.totalAttendees / this.capacity) * 100);
});

// Virtual for days until event
eventSchema.virtual("daysUntilEvent").get(function() {
  const now = new Date();
  const eventDate = new Date(this.date);
  const diffTime = eventDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Pre-save middleware to generate slug
eventSchema.pre("save", function(next) {
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    
    // Append timestamp to ensure uniqueness
    this.slug += `-${Date.now()}`;
  }
  next();
});

// Pre-save middleware to set publishedAt
eventSchema.pre("save", function(next) {
  if (this.isModified("status") && this.status === "published" && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

// Pre-save middleware to validate end time
eventSchema.pre("save", function(next) {
  if (this.time && this.endTime) {
    const [startHour, startMin] = this.time.split(":").map(Number);
    const [endHour, endMin] = this.endTime.split(":").map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (endMinutes <= startMinutes) {
      next(new Error("End time must be after start time"));
      return;
    }
  }
  next();
});

// Method to book ticket
eventSchema.methods.bookTicket = async function(userId) {
  if (this.availableTickets <= 0) {
    throw new Error("Event is sold out");
  }
  
  if (this.status !== "published") {
    throw new Error("Event is not available for booking");
  }
  
  // Generate unique ticket ID
  const ticketId = `TKT-${this._id.toString().slice(-6)}-${Date.now()}`;
  
  this.attendees.push({
    user: userId,
    ticketId: ticketId,
    status: "confirmed",
  });
  
  this.availableTickets -= 1;
  this.totalAttendees += 1;
  this.bookings += 1;
  this.totalRevenue += this.price;
  
  await this.save();
  
  return ticketId;
};

// Method to cancel booking
eventSchema.methods.cancelBooking = async function(userId) {
  const attendeeIndex = this.attendees.findIndex(
    a => a.user.toString() === userId.toString() && a.status === "confirmed"
  );
  
  if (attendeeIndex === -1) {
    throw new Error("Booking not found");
  }
  
  this.attendees[attendeeIndex].status = "cancelled";
  this.availableTickets += 1;
  this.totalAttendees -= 1;
  
  // Handle refund based on policy
  if (this.refundPolicy !== "no-refund") {
    this.totalRevenue -= this.price;
  }
  
  await this.save();
};

// Method to check in attendee
eventSchema.methods.checkInAttendee = async function(ticketId) {
  const attendee = this.attendees.find(a => a.ticketId === ticketId);
  
  if (!attendee) {
    throw new Error("Invalid ticket ID");
  }
  
  if (attendee.checkedIn) {
    throw new Error("Ticket already used");
  }
  
  attendee.checkedIn = true;
  attendee.checkedInAt = new Date();
  
  await this.save();
  
  return attendee;
};

// Method to increment views
eventSchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save({ validateBeforeSave: false });
};

// Method to toggle like
eventSchema.methods.toggleLike = async function(userId) {
  const index = this.likes.indexOf(userId);
  
  if (index > -1) {
    this.likes.splice(index, 1);
    this.totalLikes -= 1;
  } else {
    this.likes.push(userId);
    this.totalLikes += 1;
  }
  
  await this.save({ validateBeforeSave: false });
};

// Method to cancel event
eventSchema.methods.cancelEvent = async function(reason) {
  this.status = "cancelled";
  this.cancelledAt = new Date();
  this.isActive = false;
  
  // Update all confirmed attendees to cancelled
  this.attendees.forEach(attendee => {
    if (attendee.status === "confirmed") {
      attendee.status = "cancelled";
    }
  });
  
  await this.save();
  
};

// Method to complete event
eventSchema.methods.completeEvent = async function() {
  this.status = "completed";
  this.completedAt = new Date();
  await this.save();
};

// Static method to find upcoming events
eventSchema.statics.findUpcoming = function(limit = 10) {
  return this.find({
    status: "published",
    date: { $gte: new Date() },
    isActive: true,
  })
    .sort({ date: 1 })
    .limit(limit)
    .populate("organizer", "firstName lastName userName companyName");
};

// Static method to find featured events
eventSchema.statics.findFeatured = function(limit = 6) {
  return this.find({
    status: "published",
    isFeatured: true,
    date: { $gte: new Date() },
    isActive: true,
  })
    .sort({ date: 1 })
    .limit(limit)
    .populate("organizer", "firstName lastName userName");
};

// Static method to search events
eventSchema.statics.searchEvents = function(query, filters = {}) {
  const searchQuery = {
    status: "published",
    isActive: true,
    date: { $gte: new Date() },
  };
  
  if (query) {
    searchQuery.$text = { $search: query };
  }
  
  if (filters.category) {
    searchQuery.category = filters.category;
  }
  
  if (filters.city) {
    searchQuery.city = filters.city;
  }
  
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    searchQuery.price = {};
    if (filters.minPrice !== undefined) searchQuery.price.$gte = filters.minPrice;
    if (filters.maxPrice !== undefined) searchQuery.price.$lte = filters.maxPrice;
  }
  
  if (filters.startDate || filters.endDate) {
    searchQuery.date = {};
    if (filters.startDate) searchQuery.date.$gte = new Date(filters.startDate);
    if (filters.endDate) searchQuery.date.$lte = new Date(filters.endDate);
  }
  
  return this.find(searchQuery)
    .sort(filters.sort || { date: 1 })
    .populate("organizer", "firstName lastName userName companyName");
};

// Static method to get event statistics
eventSchema.statics.getStatistics = async function(organizerId) {
  const stats = await this.aggregate([
    {
      $match: {
        organizer: mongoose.Types.ObjectId(organizerId),
        status: { $ne: "draft" },
      },
    },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        publishedEvents: {
          $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] },
        },
        completedEvents: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        totalAttendees: { $sum: "$totalAttendees" },
        totalRevenue: { $sum: "$totalRevenue" },
        totalViews: { $sum: "$views" },
        avgAttendance: { $avg: "$totalAttendees" },
        avgRevenue: { $avg: "$totalRevenue" },
      },
    },
  ]);
  
  return stats[0] || {
    totalEvents: 0,
    publishedEvents: 0,
    completedEvents: 0,
    totalAttendees: 0,
    totalRevenue: 0,
    totalViews: 0,
    avgAttendance: 0,
    avgRevenue: 0,
  };
};

// Query helper for active events
eventSchema.query.active = function() {
  return this.where({ isActive: true, status: "published" });
};

// Query helper for upcoming events
eventSchema.query.upcoming = function() {
  return this.where({ date: { $gte: new Date() } });
};

module.exports = mongoose.model("Event", eventSchema);