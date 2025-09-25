const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, "firstname is Required"],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, "last is Required"],
    trim: true,
  },
  userName: {
    type: String,
    required: function () {
      return !this.googleId;
    },
    unique: true,
    sparse: true,
    trim: true,
  },
  onboardingCompleted: {
    type: Boolean,
    default: false,
  },
  // ✅ ADDED: Missing isVerified field
  isVerified: {
    type: Boolean,
    default: false,
  },
  preferences: {
    eventTypes: [
      {
        type: String,
        enum: [
          "Concerts",
          "Conferences",
          "Workshops",
          "Sports",
          "Networking",
          "Parties",
          "Cultural",
          "Food & Drink",
        ],
      },
    ],
    interests: [
      {
        type: String,
        enum: [
          "Technology",
          "Music",
          "Art",
          "Business",
          "Health",
          "Education",
          "Travel",
          "Food",
        ],
      },
    ],
    budgetRange: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
    },
    paymentMethods: [
      {
        id: String,
        type: {
          type: String,
          enum: ["credit_card", "debit_card", "paypal", "bank_transfer"],
        },
        details: mongoose.Schema.Types.Mixed,
        isDefault: {
          type: Boolean,
          default: false,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    linkedAccounts: [
      {
        provider: {
          type: String,
          enum: ["google", "facebook", "github", "twitter"],
        },
        providerId: String,
        profile: mongoose.Schema.Types.Mixed,
        linkedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    communicationPrefs: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      newsletter: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false },
    },

    deletedAt: Date,
    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
    },

    locationPreference: {
      type: String,
      enum: ["City Center", "Suburbs", "Online", "Anywhere", ""],
    },
    groupSize: {
      type: Number,
      min: 1,
      max: 50,
    },
  },
  email: {
    type: String,
    required: [true, "Please enter your email"],
    unique: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  password: {
    type: String,
    required: function () {
      return !this.googleId;
    },
    minlength: [6, "Password must be at least 6 characters"],
    select: false,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true, 
  },
  profilePicture: {
    type: String,
    default: "",
  },
  bio: {
    type: String,
    default: "",
    trim: true,
  },
  image: {
    type: String,
    default: "",
    trim: true,
  },

  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastActive: {
    type: Date,
    default: Date.now,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
});

// ✅ FIXED: Hash password before saving - with proper null/undefined checks
userSchema.pre("save", async function (next) {
  try {
    // Skip if password is not modified or if password is null/undefined
    if (!this.isModified("password") || !this.password) {
      return next();
    }

    // Only hash if password exists and is a string
    if (typeof this.password === 'string' && this.password.length > 0) {
      console.log("🔐 Hashing password for user:", this.email);
      this.password = await bcrypt.hash(this.password, 12);
    }
    
    next();
  } catch (error) {
    console.error("❌ Password hashing error:", error);
    next(error);
  }
});

// ✅ IMPROVED: Method to compare passwords with null checks
userSchema.methods.comparePassword = async function (candidatePassword) {
  // Return false if no password is set (OAuth users)
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};
// Method to get user profile without sensitive info
userSchema.methods.getProfile = function () {
  return {
    _id: this._id,
    firstName: this.firstName,
    lastName: this.lastName,
    userName: this.userName,
    email: this.email,
    role: this.role,
    onboardingCompleted: this.onboardingCompleted,
    bio: this.bio,
    image: this.image || this.profilePicture,
    profilePicture: this.profilePicture,
    preferences: this.preferences,
    createdAt: this.createdAt,
    lastActive: this.lastActive,
    isVerified: this.isVerified,
    googleId: this.googleId, 
  };
};

module.exports = mongoose.model("User", userSchema);