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
    required: [true, "Please enter a username"],
    trim: true,
  },
  onboardingCompleted: {
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
    required: [true, "Please enter a password"],
    minlength: [6, "Password must be at least 6 characters"],
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

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
