const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: [50, "First name cannot be more than 50 characters"],
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: [50, "Last name cannot be more than 50 characters"],
  },
  userName: {
    type: String,
    required: function() {
      return !this.googleId;
    },
    trim: true,
    minlength: [3, "Username must be at least 3 characters"],
    maxlength: [30, "Username cannot be more than 30 characters"],
    match: [/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"],
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address"],
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId;
    },
    minlength: [6, "Password must be at least 6 characters"],
    select: false,
  },
  role: {
    type: String,
    enum: ["superadmin", "organizer", "attendee"],
    default: "attendee",
  },
  googleId: {
    type: String,
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
    maxlength: [500, "Bio cannot be more than 500 characters"],
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ["active", "suspended", "deleted", "banned"],
    default: "active",
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  verificationResendAttempts: {
    type: [Date],
    default: [],
    select: false,
  },
  passwordResetToken: String,
  passwordResetExpires: Date,
  lastLogin: {
    type: Date,
    default: Date.now,
  },
  loginCount: {
    type: Number,
    default: 0,
  },
  organizerInfo: {
    companyName: {
      type: String,
      trim: true,
      maxlength: [100, "Company name cannot be more than 100 characters"],
    },
    website: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+\..+$/, "Please provide a valid website URL"],
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "unverified"],
      default: "unverified",
    },
    verificationNotes: String,
    verifiedAt: Date,
  },
  preferences: {
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    newsletter: { type: Boolean, default: true },
    eventReminders: { type: Boolean, default: true },
    marketingEmails: { type: Boolean, default: false },
  },
  deletedAt: Date,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for full name
userSchema.virtual("fullName").get(function() {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ userName: 1 });
userSchema.index({ role: 1 });
userSchema.index({ "organizerInfo.verificationStatus": 1 });
userSchema.index({ status: 1 });
userSchema.index({ emailVerificationToken: 1 });
userSchema.index({ passwordResetToken: 1 });
userSchema.index({ createdAt: 1 });
userSchema.index({ isVerified: 1, status: 1 });

// Compound indexes
userSchema.index({ email: 1, status: 1 });
userSchema.index({ role: 1, status: 1 });

// Pre-save middleware for password hashing
userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) {
    return next();
  }
  
  if (!this.password) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware for username generation for Google users
userSchema.pre("save", async function(next) {
  if (this.googleId && !this.userName) {
    try {
      const baseUsername = this.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
      let username = baseUsername.substring(0, 15);
      let counter = 1;
      const originalUsername = username;

      while (await this.constructor.findOne({ userName: username })) {
        username = `${originalUsername}${counter}`;
        counter++;
        if (counter > 100) {
          throw new Error("Could not generate unique username");
        }
      }

      this.userName = username;
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Password comparison failed");
  }
};

// Method to generate secure random token with fallback
userSchema.methods.generateSecureToken = function(length = 32) {
  try {
    return crypto.randomBytes(length).toString('hex');
  } catch (error) {
    console.error("crypto.randomBytes failed, using Math.random fallback:", error.message);
    
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length * 2; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }
};

// Method to create email verification token
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = this.generateSecureToken(32);
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

// Method to create password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = this.generateSecureToken(32);
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Method to verify email
userSchema.methods.verifyEmail = function() {
  this.isVerified = true;
  this.emailVerificationToken = undefined;
  this.emailVerificationExpires = undefined;
  this.verificationResendAttempts = [];
  return this.save();
};

// Method to mark as deleted (soft delete)
userSchema.methods.softDelete = function() {
  this.status = "deleted";
  this.isActive = false;
  this.deletedAt = new Date();
  return this.save();
};

// Method to restore user
userSchema.methods.restore = function() {
  this.status = "active";
  this.isActive = true;
  this.deletedAt = undefined;
  return this.save();
};

// Method to suspend user
userSchema.methods.suspend = function() {
  this.status = "suspended";
  this.isActive = false;
  return this.save();
};

// Method to ban user
userSchema.methods.ban = function() {
  this.status = "banned";
  this.isActive = false;
  return this.save();
};

// Method to get public profile (safe for public viewing)
userSchema.methods.getPublicProfile = function() {
  return {
    _id: this._id,
    userName: this.userName,
    firstName: this.firstName,
    lastName: this.lastName,
    profilePicture: this.profilePicture,
    bio: this.bio,
    organizerInfo: this.organizerInfo ? {
      companyName: this.organizerInfo.companyName,
      website: this.organizerInfo.website,
      verified: this.organizerInfo.verified,
    } : undefined,
    createdAt: this.createdAt,
  };
};

// Method to get user profile (for authenticated user)
userSchema.methods.getProfile = function() {
  return {
    _id: this._id,
    firstName: this.firstName,
    lastName: this.lastName,
    userName: this.userName,
    email: this.email,
    role: this.role,
    profilePicture: this.profilePicture,
    bio: this.bio,
    isVerified: this.isVerified,
    isActive: this.isActive,
    organizerInfo: this.organizerInfo,
    preferences: this.preferences,
    status: this.status,
    lastLogin: this.lastLogin,
    loginCount: this.loginCount,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Method to get detailed profile (for admin/user management)
userSchema.methods.getDetailedProfile = function() {
  const profile = this.getProfile();
  return {
    ...profile,
    googleId: this.googleId,
    emailVerificationToken: this.emailVerificationToken ? "***" : undefined,
    passwordResetToken: this.passwordResetToken ? "***" : undefined,
    deletedAt: this.deletedAt,
  };
};

// Static method to find active users
userSchema.statics.findActiveUsers = function() {
  return this.find({ status: "active", isActive: true });
};

// Static method to find by email (case insensitive)
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

// Static method to find by username
userSchema.statics.findByUsername = function(userName) {
  return this.findOne({ userName: userName.trim() });
};

// Static method to get user statistics
userSchema.statics.getUserStats = async function() {
  const userCounts = await this.aggregate([
    {
      $match: {
        status: { $ne: "deleted" }
      }
    },
    {
      $group: {
        _id: "$role",
        count: { $sum: 1 },
        activeUsers: { 
          $sum: { 
            $cond: [{ $eq: ["$status", "active"] }, 1, 0] 
          } 
        },
        verifiedUsers: {
          $sum: {
            $cond: [{ $eq: ["$isVerified", true] }, 1, 0]
          }
        },
        googleUsers: {
          $sum: {
            $cond: [{ $ne: ["$googleId", null] }, 1, 0]
          }
        }
      }
    }
  ]);

  const totalStats = await this.aggregate([
    {
      $match: {
        status: { $ne: "deleted" }
      }
    },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        totalActive: { 
          $sum: { 
            $cond: [{ $eq: ["$status", "active"] }, 1, 0] 
          } 
        },
        totalVerified: {
          $sum: {
            $cond: [{ $eq: ["$isVerified", true] }, 1, 0]
          }
        },
        totalGoogleUsers: {
          $sum: {
            $cond: [{ $ne: ["$googleId", null] }, 1, 0]
          }
        },
        avgLoginCount: { $avg: "$loginCount" }
      }
    }
  ]);

  const recentUsers = await this.aggregate([
    {
      $match: {
        status: "active",
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return {
    byRole: userCounts,
    overall: totalStats[0] || { 
      totalUsers: 0, 
      totalActive: 0, 
      totalVerified: 0, 
      totalGoogleUsers: 0,
      avgLoginCount: 0 
    },
    recentRegistrations: recentUsers
  };
};

// Static method to cleanup expired tokens
userSchema.statics.cleanupExpiredTokens = async function() {
  const now = new Date();
  
  const result = await this.updateMany(
    {
      $or: [
        { 
          emailVerificationExpires: { $lt: now },
          emailVerificationToken: { $exists: true }
        },
        {
          passwordResetExpires: { $lt: now },
          passwordResetToken: { $exists: true }
        }
      ]
    },
    {
      $unset: {
        emailVerificationToken: "",
        emailVerificationExpires: "",
        passwordResetToken: "",
        passwordResetExpires: ""
      }
    }
  );

  return result;
};

// Static method to delete unverified users older than 7 days
userSchema.statics.deleteUnverifiedOlderThan = async function(days = 7) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const result = await this.deleteMany({
    isVerified: false,
    createdAt: { $lt: cutoffDate },
    status: { $ne: "deleted" }
  });

  return result;
};

// Query helper to exclude deleted users
userSchema.query.excludeDeleted = function() {
  return this.where({ status: { $ne: "deleted" } });
};

// Query helper for active users only
userSchema.query.activeOnly = function() {
  return this.where({ status: "active", isActive: true });
};

// Query helper for verified users only
userSchema.query.verifiedOnly = function() {
  return this.where({ isVerified: true });
};

module.exports = mongoose.model("User", userSchema);