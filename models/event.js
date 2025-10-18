const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
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
          "Other",
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
        validator: function (value) {
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
          "Other",
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

    // NEW: Ticket Types with Pricing
    ticketTypes: [
      {
        name: {
          type: String,
          required: true,
          enum: ["Regular", "VIP", "VVIP"],
        },
        price: {
          type: Number,
          required: true,
          min: [0, "Price cannot be negative"],
        },
        capacity: {
          type: Number,
          required: true,
          min: [1, "Capacity must be at least 1"],
          validate: {
            validator: Number.isInteger,
            message: "Capacity must be a whole number",
          },
        },
        availableTickets: {
          type: Number,
          min: 0,
        },
        description: {
          type: String,
          maxlength: [500, "Description cannot exceed 500 characters"],
        },
        benefits: [
          {
            type: String,
            trim: true,
          },
        ],
      },
    ],

    // Legacy fields (kept for backward compatibility)
    price: {
      type: Number,
      min: [0, "Price cannot be negative"],
      default: 0,
      required: function () {
        // Only required if no ticket types are defined
        return !this.ticketTypes || this.ticketTypes.length === 0;
      },
    },
    currency: {
      type: String,
      default: "NGN",
      enum: ["NGN", "USD", "EUR", "GBP"],
    },
    capacity: {
      type: Number,
      min: [1, "Capacity must be at least 1"],
      validate: {
        validator: Number.isInteger,
        message: "Capacity must be a whole number",
      },
      required: function () {
        // Only required if no ticket types are defined
        return !this.ticketTypes || this.ticketTypes.length === 0;
      },
    },
    availableTickets: {
      type: Number,
      min: 0,
    },

    // Images
    images: [
      {
        url: {
          type: String,
          required: true,
        },
        publicId: String,
        alt: String,
      },
    ],
    thumbnail: {
      type: String,
      default: function () {
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

    // Attendees & Bookings (UPDATED)
    attendees: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        ticketId: String,
        ticketType: {
          type: String,
          enum: ["Regular", "VIP", "VVIP"],
          default: "Regular",
        },
        quantity: {
          type: Number,
          default: 1,
          min: 1,
        },
        totalPrice: {
          type: Number,
          required: true,
        },
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
      },
    ],
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
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
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
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    requirements: [
      {
        type: String,
        trim: true,
        maxlength: [200, "Each requirement cannot exceed 200 characters"],
      },
    ],
    agenda: [
      {
        time: String,
        activity: String,
        speaker: String,
      },
    ],
    faqs: [
      {
        question: String,
        answer: String,
      },
    ],

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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
eventSchema.index({ title: "text", description: "text", tags: "text" });
eventSchema.index({ date: 1, status: 1 });
eventSchema.index({ category: 1, city: 1 });
eventSchema.index({ organizer: 1, status: 1 });
eventSchema.index({ price: 1 });
eventSchema.index({ createdAt: -1 });
eventSchema.index({ isFeatured: 1, status: 1 });
eventSchema.index({ status: 1, date: 1, category: 1 });
eventSchema.index({ city: 1, date: 1, price: 1 });

// Virtual for event URL
eventSchema.virtual("eventUrl").get(function () {
  return `/event/${this.slug || this._id}`;
});

// Virtual for availability
eventSchema.virtual("isAvailable").get(function () {
  // Check if using ticket types
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    const hasAvailableTickets = this.ticketTypes.some(
      (tt) => tt.availableTickets > 0
    );
    return (
      hasAvailableTickets &&
      this.status === "published" &&
      this.date > new Date()
    );
  }
  // Legacy check
  return (
    this.availableTickets > 0 &&
    this.status === "published" &&
    this.date > new Date()
  );
});

// Virtual for sold out status
eventSchema.virtual("isSoldOut").get(function () {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    return this.ticketTypes.every((tt) => tt.availableTickets === 0);
  }
  return this.availableTickets === 0;
});

// Virtual for total capacity
eventSchema.virtual("totalCapacity").get(function () {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    return this.ticketTypes.reduce((sum, tt) => sum + tt.capacity, 0);
  }
  return this.capacity || 0;
});

// Virtual for total available tickets
eventSchema.virtual("totalAvailableTickets").get(function () {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    return this.ticketTypes.reduce((sum, tt) => sum + tt.availableTickets, 0);
  }
  return this.availableTickets || 0;
});

// Virtual for attendance percentage
eventSchema.virtual("attendancePercentage").get(function () {
  const totalCap = this.totalCapacity;
  if (totalCap === 0) return 0;
  return Math.round((this.totalAttendees / totalCap) * 100);
});

// Virtual for days until event
eventSchema.virtual("daysUntilEvent").get(function () {
  const now = new Date();
  const eventDate = new Date(this.date);
  const diffTime = eventDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Virtual for price range
eventSchema.virtual("priceRange").get(function () {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    const prices = this.ticketTypes.map((tt) => tt.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    return minPrice === maxPrice ? minPrice : { min: minPrice, max: maxPrice };
  }
  return this.price || 0;
});

// Pre-save middleware to initialize ticket types availableTickets
eventSchema.pre("save", function (next) {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    this.ticketTypes.forEach((ticketType) => {
      if (ticketType.availableTickets === undefined) {
        ticketType.availableTickets = ticketType.capacity;
      }
    });
  }
  next();
});

// Pre-save middleware to generate slug
eventSchema.pre("save", function (next) {
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    this.slug += `-${Date.now()}`;
  }
  next();
});

// Pre-save middleware to set publishedAt
eventSchema.pre("save", function (next) {
  if (
    this.isModified("status") &&
    this.status === "published" &&
    !this.publishedAt
  ) {
    this.publishedAt = new Date();
  }
  next();
});

// Pre-save middleware to validate end time
eventSchema.pre("save", function (next) {
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

// Method to book ticket (UPDATED)
eventSchema.methods.bookTicket = async function (
  userId,
  ticketType = "Regular",
  quantity = 1
) {
  // Check if using ticket types
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    const selectedTicket = this.ticketTypes.find(
      (tt) => tt.name === ticketType
    );

    if (!selectedTicket) {
      throw new Error(`Ticket type ${ticketType} not found`);
    }

    if (selectedTicket.availableTickets < quantity) {
      throw new Error(`Not enough ${ticketType} tickets available`);
    }

    if (this.status !== "published") {
      throw new Error("Event is not available for booking");
    }

    const ticketId = `TKT-${this._id.toString().slice(-6)}-${Date.now()}`;
    const totalPrice = selectedTicket.price * quantity;

    this.attendees.push({
      user: userId,
      ticketId: ticketId,
      ticketType: ticketType,
      quantity: quantity,
      totalPrice: totalPrice,
      status: "confirmed",
    });

    selectedTicket.availableTickets -= quantity;
    this.totalAttendees += quantity;
    this.bookings += 1;
    this.totalRevenue += totalPrice;

    await this.save();

    return { ticketId, ticketType, quantity, totalPrice };
  } else {
    // Legacy booking (backward compatibility)
    if (this.availableTickets < quantity) {
      throw new Error("Not enough tickets available");
    }

    if (this.status !== "published") {
      throw new Error("Event is not available for booking");
    }

    const ticketId = `TKT-${this._id.toString().slice(-6)}-${Date.now()}`;
    const totalPrice = this.price * quantity;

    this.attendees.push({
      user: userId,
      ticketId: ticketId,
      quantity: quantity,
      totalPrice: totalPrice,
      status: "confirmed",
    });

    this.availableTickets -= quantity;
    this.totalAttendees += quantity;
    this.bookings += 1;
    this.totalRevenue += totalPrice;

    await this.save();

    return { ticketId, quantity, totalPrice };
  }
};

// Method to cancel booking (UPDATED)
eventSchema.methods.cancelBooking = async function (userId) {
  const attendeeIndex = this.attendees.findIndex(
    (a) => a.user.toString() === userId.toString() && a.status === "confirmed"
  );

  if (attendeeIndex === -1) {
    throw new Error("Booking not found");
  }

  const attendee = this.attendees[attendeeIndex];
  attendee.status = "cancelled";

  // Restore tickets
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    const ticketType = this.ticketTypes.find(
      (tt) => tt.name === attendee.ticketType
    );
    if (ticketType) {
      ticketType.availableTickets += attendee.quantity;
    }
  } else {
    this.availableTickets += attendee.quantity;
  }

  this.totalAttendees -= attendee.quantity;

  if (this.refundPolicy !== "no-refund") {
    this.totalRevenue -= attendee.totalPrice;
  }

  await this.save();
};

// Method to check in attendee
eventSchema.methods.checkInAttendee = async function (ticketId) {
  const attendee = this.attendees.find((a) => a.ticketId === ticketId);

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
eventSchema.methods.incrementViews = async function () {
  this.views += 1;
  await this.save({ validateBeforeSave: false });
};

// Method to toggle like
eventSchema.methods.toggleLike = async function (userId) {
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
eventSchema.methods.cancelEvent = async function (reason) {
  this.status = "cancelled";
  this.cancelledAt = new Date();
  this.isActive = false;

  this.attendees.forEach((attendee) => {
    if (attendee.status === "confirmed") {
      attendee.status = "cancelled";
    }
  });

  await this.save();
};

// Method to complete event
eventSchema.methods.completeEvent = async function () {
  this.status = "completed";
  this.completedAt = new Date();
  await this.save();
};

// Static method to find upcoming events
eventSchema.statics.findUpcoming = function (limit = 10) {
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
eventSchema.statics.findFeatured = function (limit = 6) {
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
eventSchema.statics.searchEvents = function (query, filters = {}) {
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
    if (filters.minPrice !== undefined)
      searchQuery.price.$gte = filters.minPrice;
    if (filters.maxPrice !== undefined)
      searchQuery.price.$lte = filters.maxPrice;
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
eventSchema.statics.getStatistics = async function (organizerId) {
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

  return (
    stats[0] || {
      totalEvents: 0,
      publishedEvents: 0,
      completedEvents: 0,
      totalAttendees: 0,
      totalRevenue: 0,
      totalViews: 0,
      avgAttendance: 0,
      avgRevenue: 0,
    }
  );
};

// Query helper for active events
eventSchema.query.active = function () {
  return this.where({ isActive: true, status: "published" });
};

// Query helper for upcoming events
eventSchema.query.upcoming = function () {
  return this.where({ date: { $gte: new Date() } });
};

module.exports = mongoose.model("Event", eventSchema);
