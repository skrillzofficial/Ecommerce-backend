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
      trim: true,
      minlength: [50, "Description must be at least 50 characters"],
      maxlength: [5000, "Description cannot exceed 5000 characters"],
      required: function () {
        return this.status === "published";
      },
    },
    longDescription: {
      type: String,
      trim: true,
      maxlength: [10000, "Long description cannot exceed 10000 characters"],
    },
    category: {
      type: String,
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
          "Lifestyle",
          "Other",
        ],
        message: "{VALUE} is not a valid category",
      },
      required: function () {
        return this.status === "published";
      },
      index: true,
    },

    // Event Type (Physical, Virtual, Hybrid)
    eventType: {
      type: String,
      enum: ["physical", "virtual", "hybrid"],
      default: "physical",
      required: function () {
        return this.status === "published";
      },
      index: true,
    },

    // Virtual Event Link
    virtualEventLink: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          if (this.eventType === "virtual" || this.eventType === "hybrid") {
            return v && v.length > 0;
          }
          return true;
        },
        message: "Virtual event link is required for virtual and hybrid events"
      }
    },

    // Date & Time (Multi-day support)
    startDate: {
      type: Date,
      required: function () {
        return this.status === "published";
      },
      validate: {
        validator: function (value) {
          if (this.status === "draft") return true;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const eventDate = new Date(value);
          eventDate.setHours(0, 0, 0, 0);
          return eventDate >= today;
        },
        message: "Event date cannot be in the past",
      },
      index: true,
    },
    endDate: {
      type: Date,
      required: function () {
        return this.status === "published";
      },
      validate: {
        validator: function (value) {
          if (this.status === "draft") return true;
          return !this.startDate || value >= this.startDate;
        },
        message: "End date cannot be before start date",
      },
    },
    time: {
      type: String,
      required: function () {
        return this.status === "published";
      },
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"],
    },
    endTime: {
      type: String,
      required: function () {
        return this.status === "published";
      },
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"],
    },

    // Legacy date field for backward compatibility
    date: {
      type: Date,
      validate: {
        validator: function (value) {
          if (this.status === "draft") return true;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const eventDate = new Date(value);
          eventDate.setHours(0, 0, 0, 0);
          return eventDate >= today;
        },
        message: "Event date cannot be in the past",
      },
      index: true,
    },

    // Location Information
    venue: {
      type: String,
      trim: true,
      maxlength: [200, "Venue name cannot exceed 200 characters"],
      required: function () {
        return this.status === "published" && (this.eventType === "physical" || this.eventType === "hybrid");
      },
    },
    address: {
      type: String,
      trim: true,
      maxlength: [500, "Address cannot exceed 500 characters"],
      required: function () {
        return this.status === "published" && (this.eventType === "physical" || this.eventType === "hybrid");
      },
    },
    state: {
      type: String,
      enum: {
        values: [
          "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
          "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
          "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa",
          "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
          "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun",
          "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe",
          "Zamfara",
        ],
        message: "{VALUE} is not a supported state",
      },
      required: function () {
        return this.status === "published" && (this.eventType === "physical" || this.eventType === "hybrid");
      },
      index: true,
    },
    city: {
      type: String,
      required: function () {
        return this.status === "published" && (this.eventType === "physical" || this.eventType === "hybrid");
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

    // Ticket Types with Pricing
    ticketTypes: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
          maxlength: [50, "Ticket type name cannot exceed 50 characters"],
        },
        price: {
          type: Number,
          required: true,
          min: [0, "Price cannot be negative"],
          default: 0,
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
          default: function () {
            return this.capacity;
          },
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
        isFree: {
          type: Boolean,
          default: function () {
            return this.price === 0;
          },
        },
        accessType: {
          type: String,
          enum: ["physical", "virtual", "both"],
          default: "both"
        }
      },
    ],

    // Legacy fields (backward compatibility)
    price: {
      type: Number,
      min: [0, "Price cannot be negative"],
      default: 0,
      required: function () {
        return (
          this.status === "published" &&
          (!this.ticketTypes || this.ticketTypes.length === 0)
        );
      },
    },
    capacity: {
      type: Number,
      min: [1, "Capacity must be at least 1"],
      validate: {
        validator: Number.isInteger,
        message: "Capacity must be a whole number",
      },
      required: function () {
        return (
          this.status === "published" &&
          (!this.ticketTypes || this.ticketTypes.length === 0)
        );
      },
    },
    availableTickets: {
      type: Number,
      min: 0,
      default: function () {
        return this.capacity;
      },
    },
    ticketDescription: {
      type: String,
      maxlength: [500, "Ticket description cannot exceed 500 characters"],
    },
    ticketBenefits: [{
      type: String,
      trim: true,
    }],

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

    // Social Banner Feature
    socialBanner: {
      url: String,
      publicId: String,
      alt: String,
    },
    socialBannerEnabled: {
      type: Boolean,
      default: false,
    },

    // Community/Groups Feature
    community: {
      whatsapp: {
        enabled: {
          type: Boolean,
          default: false,
        },
        link: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true;
              return /^https?:\/\/(chat\.whatsapp\.com|wa\.me|whatsapp\.com)\//.test(v);
            },
            message: "Invalid WhatsApp link format",
          },
        },
        description: {
          type: String,
          maxlength: [200, "Description cannot exceed 200 characters"],
        },
      },
      telegram: {
        enabled: {
          type: Boolean,
          default: false,
        },
        link: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true;
              return /^https?:\/\/(t\.me|telegram\.me|telegram\.dog)\//.test(v);
            },
            message: "Invalid Telegram link format",
          },
        },
        description: {
          type: String,
          maxlength: [200, "Description cannot exceed 200 characters"],
        },
      },
      discord: {
        enabled: {
          type: Boolean,
          default: false,
        },
        link: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true;
              return /^https?:\/\/(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\//.test(v);
            },
            message: "Invalid Discord link format",
          },
        },
        description: {
          type: String,
          maxlength: [200, "Description cannot exceed 200 characters"],
        },
      },
      slack: {
        enabled: {
          type: Boolean,
          default: false,
        },
        link: {
          type: String,
          trim: true,
          validate: {
            validator: function (v) {
              if (!v) return true;
              return /^https?:\/\/[a-zA-Z0-9-]+\.slack\.com\//.test(v);
            },
            message: "Invalid Slack link format",
          },
        },
        description: {
          type: String,
          maxlength: [200, "Description cannot exceed 200 characters"],
        },
      },
    },
    communityEnabled: {
      type: Boolean,
      default: false,
    },

    // Payment Agreement
    agreement: {
      acceptedTerms: {
        type: Boolean,
        default: false,
      },
      acceptedAt: Date,
      serviceFee: {
        type: {
          type: String,
          enum: ["percentage", "fixed"],
          default: "percentage"
        },
        amount: {
          type: Number,
          min: 0,
          default: 5
        }
      },
      estimatedAttendance: {
        type: String,
        enum: ["1-100", "101-500", "501-1000", "1001-5000", "5001+"],
      },
      paymentTerms: {
        type: String,
        enum: ["upfront", "post-event", "milestone", "free"],
        default: "post-event",
      },
      agreementVersion: {
        type: String,
        default: "1.0",
      },
      termsUrl: String,
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
      default: "draft",
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
    totalBookings: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAttendees: {
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
    includes: [
      {
        type: String,
        trim: true,
        maxlength: [200, "Each include cannot exceed 200 characters"],
      },
    ],
    requirements: [
      {
        type: String,
        trim: true,
        maxlength: [200, "Each requirement cannot exceed 200 characters"],
      },
    ],

    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
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
    currency: {
      type: String,
      default: "NGN",
      enum: ["NGN", "USD", "EUR", "GBP"],
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

// ==================== INDEXES ====================
eventSchema.index({ title: "text", description: "text", tags: "text" });
eventSchema.index({ startDate: 1, status: 1 });
eventSchema.index({ date: 1, status: 1 });
eventSchema.index({ endDate: 1, status: 1 });
eventSchema.index({ eventType: 1, status: 1 });
eventSchema.index({ category: 1, city: 1 });
eventSchema.index({ state: 1, city: 1 });
eventSchema.index({ organizer: 1, status: 1 });
eventSchema.index({ price: 1 });
eventSchema.index({ createdAt: -1 });
eventSchema.index({ isFeatured: 1, status: 1 });
eventSchema.index({ "communityEnabled": 1, "status": 1 });
eventSchema.index({ "socialBannerEnabled": 1 });
eventSchema.index({ "agreement.acceptedTerms": 1 });

// ==================== VIRTUALS ====================
eventSchema.virtual("eventUrl").get(function () {
  return `/event/${this.slug || this._id}`;
});

eventSchema.virtual("isAvailable").get(function () {
  const now = new Date();
  const eventDate = this.startDate || this.date;
  const isFutureDate = eventDate > now;
  const isPublished = this.status === "published";

  if (this.ticketTypes && this.ticketTypes.length > 0) {
    const hasAvailableTickets = this.ticketTypes.some(
      (tt) => tt.availableTickets > 0
    );
    return hasAvailableTickets && isPublished && isFutureDate;
  }
  return this.availableTickets > 0 && isPublished && isFutureDate;
});

eventSchema.virtual("isSoldOut").get(function () {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    return this.ticketTypes.every((tt) => tt.availableTickets === 0);
  }
  return this.availableTickets === 0;
});

eventSchema.virtual("totalCapacity").get(function () {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    return this.ticketTypes.reduce((sum, tt) => sum + tt.capacity, 0);
  }
  return this.capacity || 0;
});

eventSchema.virtual("totalAvailableTickets").get(function () {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    return this.ticketTypes.reduce((sum, tt) => sum + tt.availableTickets, 0);
  }
  return this.availableTickets || 0;
});

eventSchema.virtual("hasFreeTickets").get(function () {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    return this.ticketTypes.some((tt) => tt.price === 0);
  }
  return this.price === 0;
});

eventSchema.virtual("attendancePercentage").get(function () {
  const totalCap = this.totalCapacity;
  if (totalCap === 0) return 0;
  return Math.round((this.totalAttendees / totalCap) * 100);
});

eventSchema.virtual("daysUntilEvent").get(function () {
  const now = new Date();
  const eventDate = new Date(this.startDate || this.date);
  const diffTime = eventDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

eventSchema.virtual("priceRange").get(function () {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    const prices = this.ticketTypes.map((tt) => tt.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    return minPrice === maxPrice ? minPrice : { min: minPrice, max: maxPrice };
  }
  return this.price || 0;
});

eventSchema.virtual("hasCommunity").get(function () {
  return this.communityEnabled && (
    this.community?.whatsapp?.enabled ||
    this.community?.telegram?.enabled || 
    this.community?.discord?.enabled ||
    this.community?.slack?.enabled
  );
});

eventSchema.virtual("activeCommunityLinks").get(function () {
  if (!this.communityEnabled) return [];
  
  const links = [];
  if (this.community?.whatsapp?.enabled && this.community.whatsapp.link) {
    links.push({ platform: 'whatsapp', link: this.community.whatsapp.link, description: this.community.whatsapp.description });
  }
  if (this.community?.telegram?.enabled && this.community.telegram.link) {
    links.push({ platform: 'telegram', link: this.community.telegram.link, description: this.community.telegram.description });
  }
  if (this.community?.discord?.enabled && this.community.discord.link) {
    links.push({ platform: 'discord', link: this.community.discord.link, description: this.community.discord.description });
  }
  if (this.community?.slack?.enabled && this.community.slack.link) {
    links.push({ platform: 'slack', link: this.community.slack.link, description: this.community.slack.description });
  }
  
  return links;
});

eventSchema.virtual("hasSocialBanner").get(function () {
  return this.socialBannerEnabled && this.socialBanner?.url;
});

eventSchema.virtual("isPaidEvent").get(function () {
  if (this.ticketTypes && this.ticketTypes.length > 0) {
    return this.ticketTypes.some(tt => tt.price > 0);
  }
  return this.price > 0;
});

eventSchema.virtual("isMultiDay").get(function () {
  return this.startDate && this.endDate && this.startDate.getTime() !== this.endDate.getTime();
});

eventSchema.virtual("isVirtual").get(function () {
  return this.eventType === "virtual";
});

eventSchema.virtual("isHybrid").get(function () {
  return this.eventType === "hybrid";
});

eventSchema.virtual("isPhysical").get(function () {
  return this.eventType === "physical";
});

eventSchema.virtual("eventDuration").get(function () {
  if (!this.startDate || !this.endDate) return 0;
  const diffTime = Math.abs(this.endDate - this.startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
});

// ==================== PRE-SAVE MIDDLEWARE ====================

// Ensure slug is never null
eventSchema.pre("save", function (next) {
  if (!this.slug || this.slug === null || this.slug === "") {
    this.slug = `event-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 11)}`;
  }
  next();
});

// FLEXIBLE DATE SYNC - Handle both date systems
eventSchema.pre("save", function (next) {
  // If startDate is provided but date is not, sync date from startDate
  if (this.startDate && !this.date) {
    this.date = this.startDate;
  }
  
  // If date is provided but startDate is not (legacy events), sync startDate from date
  if (this.date && !this.startDate) {
    this.startDate = this.date;
    if (!this.endDate) {
      this.endDate = this.date;
    }
  }
  
  // Ensure endDate defaults to startDate if not provided
  if (this.startDate && !this.endDate) {
    this.endDate = this.startDate;
  }
  
  next();
});

// Validate virtual event link
eventSchema.pre("save", function (next) {
  if ((this.eventType === "virtual" || this.eventType === "hybrid") && 
      this.status === "published" && 
      !this.virtualEventLink) {
    return next(new Error("Virtual event link is required for virtual and hybrid events"));
  }
  next();
});

// Initialize and validate number fields
eventSchema.pre("save", function (next) {
  const safeNumber = (value, defaultValue = 0) => {
    if (value === undefined || value === null || isNaN(value)) {
      return defaultValue;
    }
    return Number(value);
  };

  if (this.ticketTypes && this.ticketTypes.length > 0) {
    this.ticketTypes.forEach((ticketType) => {
      ticketType.price = safeNumber(ticketType.price, 0);
      ticketType.capacity = safeNumber(ticketType.capacity, 1);
      ticketType.availableTickets = safeNumber(
        ticketType.availableTickets,
        ticketType.capacity
      );
      ticketType.isFree = ticketType.price === 0;
      
      if (this.eventType === "hybrid" && !ticketType.accessType) {
        ticketType.accessType = "both";
      }
    });
  } else {
    this.price = safeNumber(this.price, 0);
    this.capacity = safeNumber(this.capacity, 1);
    this.availableTickets = safeNumber(this.availableTickets, this.capacity);
  }

  this.totalAttendees = safeNumber(this.totalAttendees, 0);
  this.totalBookings = safeNumber(this.totalBookings, 0);
  this.totalRevenue = safeNumber(this.totalRevenue, 0);
  this.views = safeNumber(this.views, 0);
  this.totalLikes = safeNumber(this.totalLikes, 0);

  if (this.coordinates) {
    this.coordinates.latitude = safeNumber(this.coordinates.latitude, 0);
    this.coordinates.longitude = safeNumber(this.coordinates.longitude, 0);
  }

  next();
});

// Generate proper slug
eventSchema.pre("save", async function (next) {
  try {
    if (this.slug && this.slug.startsWith("event-")) {
      const baseSlug = this.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const uniqueId = this._id
        ? this._id.toString().slice(-6)
        : Date.now().toString().slice(-6);

      let slug = `${baseSlug}-${uniqueId}`;

      const Event = this.constructor;
      let counter = 1;
      let existingEvent = await Event.findOne({ slug, _id: { $ne: this._id } });

      while (existingEvent) {
        slug = `${baseSlug}-${uniqueId}-${counter}`;
        existingEvent = await Event.findOne({ slug, _id: { $ne: this._id } });
        counter++;

        if (counter > 50) {
          slug = `event-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`;
          break;
        }
      }

      this.slug = slug;
    }
    next();
  } catch (error) {
    console.error("Error generating slug:", error);
    next();
  }
});

// Set publishedAt timestamp
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

// Validate end time
eventSchema.pre("save", function (next) {
  if (this.status === "draft") {
    return next();
  }

  if (this.time && this.endTime) {
    try {
      const [startHour, startMin] = this.time.split(":").map(Number);
      const [endHour, endMin] = this.endTime.split(":").map(Number);

      if (
        isNaN(startHour) ||
        isNaN(startMin) ||
        isNaN(endHour) ||
        isNaN(endMin)
      ) {
        return next(new Error("Invalid time format"));
      }

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (endMinutes <= startMinutes) {
        return next(new Error("End time must be after start time"));
      }
    } catch (error) {
      return next(new Error("Invalid time format"));
    }
  }
  next();
});

// ✅ FIXED: Validate community and agreement - Only runs on save operations
eventSchema.pre("save", function (next) {
  // Community validation
  if (this.communityEnabled) {
    const communityPlatforms = ['whatsapp', 'telegram', 'discord', 'slack'];
    let hasValidLink = false;
    
    for (const platform of communityPlatforms) {
      if (this.community?.[platform]?.enabled && this.community[platform].link) {
        hasValidLink = true;
        break;
      }
    }
    
    if (!hasValidLink) {
      return next(new Error("At least one community platform must have a valid link when community is enabled"));
    }
  }
  
  // ✅ CRITICAL FIX: Payment agreement validation
  // Only check actual fields, not virtual properties
  // Only validate when creating/modifying relevant fields
  if (this.status === "published") {
    // Determine if event has paid tickets by checking actual fields
    let hasPaidTickets = false;
    
    if (this.ticketTypes && this.ticketTypes.length > 0) {
      hasPaidTickets = this.ticketTypes.some(tt => tt.price > 0);
    } else if (this.price > 0) {
      hasPaidTickets = true;
    }
    
    // Only validate when document is new or relevant fields are being modified
    const isRelevantChange = this.isNew || 
                             this.isModified('status') || 
                             this.isModified('ticketTypes') || 
                             this.isModified('price');
    
    // Check terms acceptance for paid events
    if (hasPaidTickets && isRelevantChange && !this.agreement?.acceptedTerms) {
      return next(new Error("Terms must be accepted for paid events"));
    }
  }
  
  next();
});

// ==================== INSTANCE METHODS ====================

eventSchema.methods.regenerateSlug = async function () {
  const baseSlug = this.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const uniqueId = this._id.toString().slice(-6);
  let slug = `${baseSlug}-${uniqueId}`;

  let counter = 1;
  while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
    slug = `${baseSlug}-${uniqueId}-${counter}`;
    counter++;
  }

  this.slug = slug;
  await this.save({ validateBeforeSave: false });

  return this.slug;
};

eventSchema.methods.acceptAgreement = async function (termsData = {}) {
  this.agreement = {
    acceptedTerms: true,
    acceptedAt: new Date(),
    serviceFee: termsData.serviceFee || this.agreement?.serviceFee || { type: "percentage", amount: 5 },
    estimatedAttendance: termsData.estimatedAttendance || this.agreement?.estimatedAttendance,
    paymentTerms: termsData.paymentTerms || this.agreement?.paymentTerms || "post-event",
    agreementVersion: termsData.agreementVersion || "1.0",
    termsUrl: termsData.termsUrl,
  };
  
  await this.save();
  return this.agreement;
};

eventSchema.methods.enableCommunity = async function (platform, link, description = "") {
  if (!this.community) {
    this.community = {};
  }
  
  if (!this.community[platform]) {
    this.community[platform] = {};
  }
  
  this.community[platform].enabled = true;
  this.community[platform].link = link;
  this.community[platform].description = description;
  this.communityEnabled = true;
  
  await this.save();
  return this.community;
};

eventSchema.methods.disableCommunity = async function (platform) {
  if (this.community?.[platform]) {
    this.community[platform].enabled = false;
    
    const hasEnabledPlatforms = Object.values(this.community).some(
      platformConfig => platformConfig && platformConfig.enabled
    );
    
    this.communityEnabled = hasEnabledPlatforms;
  }
  
  await this.save();
  return this.community;
};

eventSchema.methods.setSocialBanner = async function (bannerData) {
  this.socialBanner = {
    url: bannerData.url,
    publicId: bannerData.publicId,
    alt: bannerData.alt || this.title,
  };
  this.socialBannerEnabled = true;
  
  await this.save();
  return this.socialBanner;
};

eventSchema.methods.incrementViews = async function () {
  this.views = (Number(this.views) || 0) + 1;
  await this.save({ validateBeforeSave: false });
};

eventSchema.methods.toggleLike = async function (userId) {
  const index = this.likes.indexOf(userId);

  if (index > -1) {
    this.likes.splice(index, 1);
    this.totalLikes = Math.max(0, (Number(this.totalLikes) || 0) - 1);
  } else {
    this.likes.push(userId);
    this.totalLikes = (Number(this.totalLikes) || 0) + 1;
  }

  await this.save({ validateBeforeSave: false });
};

eventSchema.methods.cancelEvent = async function (reason) {
  this.status = "cancelled";
  this.cancelledAt = new Date();
  this.isActive = false;

  const Ticket = mongoose.model("Ticket");
  await Ticket.updateMany(
    { eventId: this._id, status: "confirmed" },
    {
      status: "cancelled",
      refundStatus: "requested",
    }
  );

  await this.save();
};

eventSchema.methods.completeEvent = async function () {
  this.status = "completed";
  this.completedAt = new Date();

  const Ticket = mongoose.model("Ticket");
  await Ticket.updateMany(
    { eventId: this._id, status: "confirmed" },
    { status: "expired" }
  );

  await this.save();
};

eventSchema.methods.getEffectiveDate = function () {
  return this.startDate || this.date;
};

eventSchema.methods.getEffectiveEndDate = function () {
  if (this.endDate) return this.endDate;
  if (this.startDate) return this.startDate;
  return this.date;
};

eventSchema.methods.usesLegacyDate = function () {
  return this.date && !this.startDate;
};

eventSchema.methods.usesNewDateSystem = function () {
  return !!this.startDate;
};

// ==================== STATIC METHODS ====================

eventSchema.statics.findUpcoming = function (limit = 10) {
  const now = new Date();
  return this.find({
    status: "published",
    isActive: true,
    $or: [
      { startDate: { $gte: now } },
      { date: { $gte: now, $exists: true }, startDate: { $exists: false } }
    ],
  })
    .sort({ startDate: 1, date: 1 })
    .limit(limit)
    .populate("organizer", "firstName lastName userName companyName profilePicture");
};

eventSchema.statics.findFeatured = function (limit = 6) {
  const now = new Date();
  return this.find({
    status: "published",
    isFeatured: true,
    isActive: true,
    $or: [
      { startDate: { $gte: now } },
      { date: { $gte: now, $exists: true }, startDate: { $exists: false } }
    ],
  })
    .sort({ startDate: 1, date: 1 })
    .limit(limit)
    .populate("organizer", "firstName lastName userName profilePicture");
};

eventSchema.statics.searchEvents = function (query, filters = {}) {
  const now = new Date();
  
  const searchQuery = {
    status: "published",
    isActive: true,
    $or: [
      { startDate: { $gte: now } },
      { date: { $gte: now, $exists: true }, startDate: { $exists: false } }
    ],
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

  if (filters.state) {
    searchQuery.state = filters.state;
  }

  if (filters.eventType) {
    searchQuery.eventType = filters.eventType;
  }

  // Price filtering
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const priceConditions = [];

    const legacyPriceQuery = { price: {} };
    if (filters.minPrice !== undefined)
      legacyPriceQuery.price.$gte = parseFloat(filters.minPrice);
    if (filters.maxPrice !== undefined)
      legacyPriceQuery.price.$lte = parseFloat(filters.maxPrice);
    priceConditions.push(legacyPriceQuery);

    const ticketTypePriceQuery = { "ticketTypes.price": {} };
    if (filters.minPrice !== undefined)
      ticketTypePriceQuery["ticketTypes.price"].$gte = parseFloat(filters.minPrice);
    if (filters.maxPrice !== undefined)
      ticketTypePriceQuery["ticketTypes.price"].$lte = parseFloat(filters.maxPrice);
    priceConditions.push(ticketTypePriceQuery);

    if (!searchQuery.$and) searchQuery.$and = [];
    searchQuery.$and.push({ $or: priceConditions });
  }

  // Date range filtering
  if (filters.startDate || filters.endDate) {
    const dateConditions = [];
    
    const startDateQuery = { startDate: {} };
    if (filters.startDate) startDateQuery.startDate.$gte = new Date(filters.startDate);
    if (filters.endDate) startDateQuery.startDate.$lte = new Date(filters.endDate);
    dateConditions.push(startDateQuery);
    
    const legacyDateQuery = { 
      date: {},
      startDate: { $exists: false }
    };
    if (filters.startDate) legacyDateQuery.date.$gte = new Date(filters.startDate);
    if (filters.endDate) legacyDateQuery.date.$lte = new Date(filters.endDate);
    dateConditions.push(legacyDateQuery);
    
    if (!searchQuery.$and) searchQuery.$and = [];
    searchQuery.$and.push({ $or: dateConditions });
  }

  return this.find(searchQuery)
    .sort(filters.sort || { startDate: 1, date: 1 })
    .populate("organizer", "firstName lastName userName companyName profilePicture");
};

eventSchema.statics.getStatistics = async function (organizerId) {
  const stats = await this.aggregate([
    {
      $match: {
        organizer: new mongoose.Types.ObjectId(organizerId),
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

eventSchema.statics.getFlexibleDateMatch = function (dateFilter = {}) {
  const match = {};
  
  if (dateFilter.$gte || dateFilter.$lte || dateFilter.$gt || dateFilter.$lt) {
    match.$or = [
      { startDate: dateFilter },
      { 
        date: { ...dateFilter, $exists: true },
        startDate: { $exists: false }
      }
    ];
  }
  
  return match;
};

eventSchema.statics.migrateToFlexibleDates = async function () {
  try {
    const eventsToMigrate = await this.find({
      date: { $exists: true },
      startDate: { $exists: false }
    });

    console.log(`Found ${eventsToMigrate.length} events to migrate`);

    let migrated = 0;
    for (const event of eventsToMigrate) {
      event.startDate = event.date;
      event.endDate = event.date;
      await event.save({ validateBeforeSave: false });
      migrated++;
    }

    console.log(`Successfully migrated ${migrated} events`);
    return { success: true, migrated };
  } catch (error) {
    console.error("Migration error:", error);
    return { success: false, error: error.message };
  }
};

eventSchema.statics.getDateFieldName = function (event) {
  return event && event.startDate ? 'startDate' : 'date';
};

// ==================== QUERY HELPERS ====================

eventSchema.query.active = function () {
  return this.where({ isActive: true, status: "published" });
};

eventSchema.query.upcoming = function () {
  const now = new Date();
  return this.where({
    $or: [
      { startDate: { $gte: now } },
      { date: { $gte: now, $exists: true }, startDate: { $exists: false } }
    ]
  });
};

eventSchema.query.past = function () {
  const now = new Date();
  return this.where({
    $or: [
      { startDate: { $lt: now } },
      { date: { $lt: now, $exists: true }, startDate: { $exists: false } }
    ]
  });
};

eventSchema.query.featured = function () {
  return this.where({ isFeatured: true, status: "published" });
};

eventSchema.query.withCommunity = function () {
  return this.where({ communityEnabled: true });
};

eventSchema.query.virtual = function () {
  return this.where({ eventType: "virtual" });
};

eventSchema.query.hybrid = function () {
  return this.where({ eventType: "hybrid" });
};

eventSchema.query.physical = function () {
  return this.where({ eventType: "physical" });
};

eventSchema.query.byOrganizer = function (organizerId) {
  return this.where({ organizer: organizerId });
};

eventSchema.query.byCategory = function (category) {
  return this.where({ category });
};

eventSchema.query.byCity = function (city) {
  return this.where({ city });
};

eventSchema.query.byState = function (state) {
  return this.where({ state });
};

eventSchema.query.free = function () {
  return this.where({
    $or: [
      { price: 0 },
      { "ticketTypes.price": 0 }
    ]
  });
};

eventSchema.query.paid = function () {
  return this.where({
    $or: [
      { price: { $gt: 0 } },
      { "ticketTypes.price": { $gt: 0 } }
    ]
  });
};

module.exports = mongoose.model("Event", eventSchema)