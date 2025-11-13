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
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address"],
  },
  phone: {
    type: String,
    trim: true,
    match: [/^\+?[\d\s\-\(\)]{10,}$/, "Please provide a valid phone number"],
  },
  location: {
    type: String,
    trim: true,
    maxlength: [100, "Location cannot be more than 100 characters"],
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
  password: {
    type: String,
    required: function() {
      return !this.googleId;
    },
    minlength: [6, "Password must be at least 6 characters"],
    select: false,
  },
  
  // KEEP existing role field for backward compatibility
  role: {
    type: String,
    enum: ["superadmin", "organizer", "attendee"],
    default: "attendee",
  },
  
  // NEW: Multiple roles support (optional, for users who want multiple roles)
  roles: {
    type: [String],
    enum: ["superadmin", "organizer", "attendee"],
    default: function() {
      // Initialize with the primary role if not set
      return this.role ? [this.role] : ["attendee"];
    }
  },
  
  // NEW: Active role for role switching (falls back to primary role)
  activeRole: {
    type: String,
    enum: ["superadmin", "organizer", "attendee"],
    default: function() {
      return this.role || "attendee";
    }
  },
  
  googleId: {
    type: String,
    sparse: true,
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
  
  loginHistory: [{
    ipAddress: String,
    userAgent: String,
    device: String,
    location: String,
    loginTime: {
      type: Date,
      default: Date.now
    },
    isSuccessful: {
      type: Boolean,
      default: true
    }
  }],
  
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
    businessRegistration: {
      number: String,
      document: String,
      verified: { type: Boolean, default: false }
    }
  },
  
  preferences: {
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    newsletter: { type: Boolean, default: true },
    eventReminders: { type: Boolean, default: true },
    marketingEmails: { type: Boolean, default: false },
    
    notifications: {
      email: {
        ticketPurchases: { type: Boolean, default: true },
        eventReminders: { type: Boolean, default: true },
        loginAlerts: { type: Boolean, default: true },
        securityAlerts: { type: Boolean, default: true },
        promotional: { type: Boolean, default: false },
        eventUpdates: { type: Boolean, default: true },
        bookingConfirmations: { type: Boolean, default: true },
        paymentReceipts: { type: Boolean, default: true },
        refundUpdates: { type: Boolean, default: true }
      },
      push: {
        ticketPurchases: { type: Boolean, default: true },
        eventReminders: { type: Boolean, default: true },
        loginAlerts: { type: Boolean, default: true },
        securityAlerts: { type: Boolean, default: true },
        promotional: { type: Boolean, default: false },
        eventUpdates: { type: Boolean, default: true },
        bookingConfirmations: { type: Boolean, default: true },
        paymentReceipts: { type: Boolean, default: true },
        refundUpdates: { type: Boolean, default: true }
      }
    }
  },

  wallet: {
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "NGN", enum: ["NGN", "USD", "EUR", "GBP"] },
    lastPayoutAt: Date
  },

  socialLinks: {
    website: String,
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String
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

// Virtual for organizer display name
userSchema.virtual("organizerDisplayName").get(function() {
  const currentRole = this.activeRole || this.role;
  if (currentRole === "organizer" && this.organizerInfo?.companyName) {
    return this.organizerInfo.companyName;
  }
  return this.fullName;
});

// Virtual to check if user can create events
userSchema.virtual("canCreateEvents").get(function() {
  const userRoles = this.roles || [this.role];
  return userRoles.includes("organizer") && 
         this.isVerified && 
         this.status === "active" &&
         (this.organizerInfo?.verified === true || this.activeRole === "organizer");
});

// Virtual to get role display name
userSchema.virtual("roleDisplay").get(function() {
  const roleNames = {
    attendee: "Attendee",
    organizer: "Event Organizer",
    superadmin: "Super Admin"
  };
  const currentRole = this.activeRole || this.role;
  return roleNames[currentRole] || currentRole;
});

// Indexes
userSchema.index({ userName: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1 });
userSchema.index({ roles: 1 });
userSchema.index({ activeRole: 1 });
userSchema.index({ "organizerInfo.verificationStatus": 1 });
userSchema.index({ status: 1 });
userSchema.index({ emailVerificationToken: 1 });
userSchema.index({ passwordResetToken: 1 });
userSchema.index({ createdAt: 1 });
userSchema.index({ isVerified: 1, status: 1 });
userSchema.index({ "loginHistory.loginTime": -1 });

// Compound indexes
userSchema.index({ email: 1, status: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ activeRole: 1, status: 1 });
userSchema.index({ "organizerInfo.verified": 1, status: 1 });

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

// Pre-save middleware to sync role fields for backward compatibility
userSchema.pre("save", function(next) {
  // If this is a new document or roles/activeRole are not set, initialize them
  if (this.isNew || !this.roles || this.roles.length === 0) {
    this.roles = [this.role];
    this.activeRole = this.role;
  }
  
  // Ensure activeRole is in roles array
  if (this.activeRole && !this.roles.includes(this.activeRole)) {
    this.roles.push(this.activeRole);
  }
  
  // Keep the primary role field in sync with activeRole for backward compatibility
  this.role = this.activeRole || this.role;
  
  next();
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
  
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  
  return verificationToken;
};

// Method to create password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = this.generateSecureToken(32);
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  
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

// NEW: Method to switch active role
userSchema.methods.switchRole = async function(newRole) {
  if (!["attendee", "organizer", "superadmin"].includes(newRole)) {
    throw new Error("Invalid role. Must be 'attendee', 'organizer', or 'superadmin'");
  }

  // Initialize roles array if it doesn't exist (backward compatibility)
  if (!this.roles || this.roles.length === 0) {
    this.roles = [this.role];
  }

  // Add role to roles array if not already present
  if (!this.roles.includes(newRole)) {
    this.roles.push(newRole);
  }

  // Update active role
  this.activeRole = newRole;
  
  // Sync primary role field for backward compatibility
  this.role = newRole;
  
  return await this.save();
};

// NEW: Method to check if user has a specific role
userSchema.methods.hasRole = function(role) {
  // Check in roles array first, fallback to primary role field
  if (this.roles && this.roles.length > 0) {
    return this.roles.includes(role);
  }
  return this.role === role;
};

// NEW: Method to check if user can switch to a role
userSchema.methods.canSwitchToRole = function(role) {
  return this.hasRole(role);
};

// NEW: Method to get current active role (with fallback)
userSchema.methods.getCurrentRole = function() {
  return this.activeRole || this.role || "attendee";
};

// NEW: Method to get all user roles (with fallback)
userSchema.methods.getAllRoles = function() {
  if (this.roles && this.roles.length > 0) {
    return this.roles;
  }
  return [this.role];
};

// Method to record login and create notification
userSchema.methods.recordLogin = async function(loginData) {
  const { ipAddress, userAgent, device, location } = loginData;
  
  this.loginCount += 1;
  this.lastLogin = new Date();
  
  this.loginHistory.unshift({
    ipAddress,
    userAgent,
    device: device || this._detectDevice(userAgent),
    location: location || 'Unknown',
    loginTime: new Date()
  });
  
  if (this.loginHistory.length > 10) {
    this.loginHistory = this.loginHistory.slice(0, 10);
  }
  
  await this.save();
  
  const isSuspicious = await this._checkSuspiciousLogin(loginData);
  
  if (this.preferences.notifications?.push?.loginAlerts || 
      this.preferences.notifications?.email?.loginAlerts) {
    
    const Notification = mongoose.model('Notification');
    await Notification.createLoginNotification(this._id, {
      ipAddress,
      device: device || this._detectDevice(userAgent),
      location: location || 'Unknown',
      isSuspicious
    });
  }
  
  return { isSuspicious };
};

// Helper method to detect device from user agent
userSchema.methods._detectDevice = function(userAgent) {
  if (!userAgent) return 'Unknown Device';
  
  if (userAgent.includes('Mobile')) {
    if (userAgent.includes('Android')) return 'Android Mobile';
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    return 'Mobile Device';
  }
  
  if (userAgent.includes('Mac')) return 'Mac';
  if (userAgent.includes('Windows')) return 'Windows PC';
  if (userAgent.includes('Linux')) return 'Linux PC';
  
  return 'Desktop';
};

// Method to check for suspicious login
userSchema.methods._checkSuspiciousLogin = async function(currentLogin) {
  if (this.loginHistory.length < 2) {
    return false;
  }
  
  const recentLogins = this.loginHistory.slice(1, 4);
  const commonLocations = new Set(recentLogins.map(login => login.location));
  const commonDevices = new Set(recentLogins.map(login => login.device));
  
  const currentDevice = currentLogin.device || this._detectDevice(currentLogin.userAgent);
  const currentLocation = currentLogin.location || 'Unknown';
  
  if (!commonLocations.has(currentLocation) && !commonDevices.has(currentDevice)) {
    return true;
  }
  
  return false;
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

// Method to verify organizer
userSchema.methods.verifyOrganizer = function(notes = "") {
  if (!this.hasRole("organizer")) {
    throw new Error("Only organizers can be verified");
  }
  
  this.organizerInfo.verified = true;
  this.organizerInfo.verificationStatus = "approved";
  this.organizerInfo.verificationNotes = notes;
  this.organizerInfo.verifiedAt = new Date();
  
  return this.save();
};

// Method to update wallet balance
userSchema.methods.updateWallet = async function(amount, type = "add") {
  if (!this.hasRole("organizer")) {
    throw new Error("Only organizers have wallets");
  }
  
  if (type === "add") {
    this.wallet.balance += amount;
  } else if (type === "subtract") {
    if (this.wallet.balance < amount) {
      throw new Error("Insufficient wallet balance");
    }
    this.wallet.balance -= amount;
  }
  
  return this.save();
};

// Method to get public profile (safe for public viewing)
userSchema.methods.getPublicProfile = function() {
  return {
    _id: this._id,
    userName: this.userName,
    firstName: this.firstName,
    lastName: this.lastName,
    fullName: this.fullName,
    profilePicture: this.profilePicture,
    bio: this.bio,
    role: this.getCurrentRole(),
    organizerInfo: this.organizerInfo ? {
      companyName: this.organizerInfo.companyName,
      website: this.organizerInfo.website,
      verified: this.organizerInfo.verified,
    } : undefined,
    socialLinks: this.socialLinks,
    createdAt: this.createdAt,
  };
};

// Method to get user profile (for authenticated user)
userSchema.methods.getProfile = function() {
  return {
    _id: this._id,
    firstName: this.firstName,
    lastName: this.lastName,
    fullName: this.fullName,
    userName: this.userName,
    email: this.email,
    phone: this.phone,
    location: this.location,
    role: this.getCurrentRole(), // Primary role for compatibility
    roles: this.getAllRoles(), // All available roles
    activeRole: this.getCurrentRole(), // Currently active role
    profilePicture: this.profilePicture,
    bio: this.bio,
    isVerified: this.isVerified,
    isActive: this.isActive,
    organizerInfo: this.organizerInfo,
    preferences: this.preferences,
    socialLinks: this.socialLinks,
    wallet: this.wallet,
    status: this.status,
    lastLogin: this.lastLogin,
    loginCount: this.loginCount,
    recentLogins: this.loginHistory.slice(0, 3),
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
    loginHistory: this.loginHistory,
    verificationResendAttempts: this.verificationResendAttempts?.length || 0,
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

// Static method to find verified organizers (works with both old and new formats)
userSchema.statics.findVerifiedOrganizers = function() {
  return this.find({ 
    $or: [
      { roles: "organizer" },
      { role: "organizer" }
    ],
    status: "active",
    "organizerInfo.verified": true 
  });
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
      $project: {
        role: { $ifNull: ["$activeRole", "$role"] },
        status: 1,
        isVerified: 1,
        googleId: 1,
        loginCount: 1,
        organizerVerified: "$organizerInfo.verified"
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
        },
        avgLoginCount: { $avg: "$loginCount" }
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
      $project: {
        role: { $ifNull: ["$activeRole", "$role"] },
        status: 1,
        isVerified: 1,
        googleId: 1,
        loginCount: 1,
        organizerVerified: "$organizerInfo.verified",
        hasOrganizerRole: {
          $or: [
            { $eq: ["$role", "organizer"] },
            { $in: ["organizer", { $ifNull: ["$roles", []] }] }
          ]
        }
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
        totalOrganizers: {
          $sum: {
            $cond: ["$hasOrganizerRole", 1, 0]
          }
        },
        verifiedOrganizers: {
          $sum: {
            $cond: [
              { 
                $and: [
                  "$hasOrganizerRole",
                  { $eq: ["$organizerVerified", true] }
                ]
              }, 1, 0
            ]
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
      totalOrganizers: 0,
      verifiedOrganizers: 0,
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

// Query helper for verified organizers only
userSchema.query.verifiedOrganizers = function() {
  return this.where({ 
    $or: [
      { roles: "organizer" },
      { role: "organizer" }
    ],
    status: "active",
    "organizerInfo.verified": true 
  });
};

module.exports = mongoose.model("User", userSchema);