const USER = require("../models/user");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const ErrorResponse = require("../utils/errorResponse");
const { OAuth2Client } = require("google-auth-library");
const {
  sendWelcomeEmail,
  sendResetEmail,
  sendResendVerificationEmail,
} = require("../utils/sendEmail");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

// Import Notification Service
const NotificationService = require("../service/notificationService");

const deleteExpiredUnverifiedUsers = async () => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const result = await USER.deleteMany({
      isVerified: false,
      createdAt: { $lt: sevenDaysAgo },
    });

    if (result.deletedCount > 0) {
      console.log(
        ` Cleanup: Deleted ${result.deletedCount} unverified users older than 7 days`
      );
    }
  } catch (error) {
    console.error(" Cleanup error:", error);
  }
};

// Helper function to get client IP and location
const getClientInfo = (req) => {
  const ipAddress =
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null);

  const userAgent = req.get("User-Agent") || "Unknown";

  // Simple device detection
  let device = "Unknown Device";
  if (userAgent.includes("Mobile")) {
    if (userAgent.includes("Android")) device = "Android Mobile";
    else if (userAgent.includes("iPhone")) device = "iPhone";
    else if (userAgent.includes("iPad")) device = "iPad";
    else device = "Mobile Device";
  } else if (userAgent.includes("Mac")) device = "Mac";
  else if (userAgent.includes("Windows")) device = "Windows PC";
  else if (userAgent.includes("Linux")) device = "Linux PC";

  // For location, you might want to use a geoIP service in production
  const location = "Unknown";

  return { ipAddress, userAgent, device, location };
};

const handleRegister = async (req, res, next) => {
  const { userName, email, password, userType } = req.body;

  if (!userName || !email || !password || !userType) {
    return next(new ErrorResponse("All fields are required", 400));
  }

  if (!["attendee", "organizer"].includes(userType)) {
    return next(new ErrorResponse("Invalid user type", 400));
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new ErrorResponse("Please provide a valid email address", 400));
  }

  if (password.length < 6) {
    return next(
      new ErrorResponse("Password must be at least 6 characters", 400)
    );
  }

  try {
    const existingUser = await USER.findOne({
      $or: [{ email: email.toLowerCase() }, { userName: userName }],
    });

    if (existingUser) {
      if (existingUser.email.toLowerCase() === email.toLowerCase()) {
        return next(new ErrorResponse("Email already exists", 409));
      }
      if (existingUser.userName === userName) {
        return next(new ErrorResponse("Username already taken", 409));
      }
    }

    const firstName = userName.split(" ")[0] || userName;
    const lastName = userName.split(" ").slice(1).join(" ") || "User";

    const user = await USER.create({
      firstName,
      lastName,
      userName,
      email: email.toLowerCase(),
      password,
      role: userType,
      isVerified: false,
    });

    console.log(" User created:", user.email);

    let verificationToken;
    try {
      verificationToken = user.createEmailVerificationToken();
      await user.save({ validateBeforeSave: false });
    } catch (tokenError) {
      console.error(" Token creation failed:", tokenError);
      return next(
        new ErrorResponse("Failed to generate verification token", 500)
      );
    }

    try {
      const clientUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
      console.log(" Sending verification email to:", user.email);

      const emailSent = await sendWelcomeEmail({
        fullName: user.firstName + " " + user.lastName,
        clientUrl: clientUrl,
        email: user.email,
      });

      if (emailSent) {
        console.log(" Registration successful, email sent");

        // Create welcome notification
        try {
          await NotificationService.createSystemNotification(user._id, {
            title: "🎉 Welcome to Eventry!",
            message: `Welcome ${user.firstName}! Your account has been created successfully. Please verify your email to get started.`,
            actionRequired: true,
          });
        } catch (notificationError) {
          console.error(
            "Failed to create welcome notification:",
            notificationError
          );
        }

        res.status(201).json({
          success: true,
          message:
            "Account created successfully! Please check your email to verify your account.",
        });
      } else {
        console.warn(
          " Email failed to send, but user created. Advising resend."
        );
        res.status(201).json({
          success: true,
          message:
            "Account created but email failed. Use 'Resend Verification' to send the link.",
        });
      }
    } catch (emailError) {
      console.error(" Email error caught:", emailError);
      res.status(201).json({
        success: true,
        message:
          "Account created but email failed. Use 'Resend Verification' to send the link.",
      });
    }
  } catch (error) {
    console.error(" Registration error:", error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const message =
        field === "email" ? "Email already exists" : "Username already taken";
      return next(new ErrorResponse(message, 409));
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return next(new ErrorResponse(messages.join(", "), 400));
    }

    next(new ErrorResponse("Registration failed. Please try again.", 500));
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    console.log("=== VERIFY EMAIL ROUTE HIT ===");
    const token = req.query.token || req.params.token;

    if (!token) {
      console.log(" No token provided");
      return res.status(400).json({
        success: false,
        message: "Invalid verification token",
      });
    }

    console.log("Raw token from request:", token);
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    console.log("Hashed token:", hashedToken.substring(0, 20));

    const userWithToken = await USER.findOne({
      emailVerificationToken: hashedToken,
    });

    if (userWithToken && userWithToken.isVerified) {
      console.log(" User already verified, allowing login");

      const jwtToken = jwt.sign(
        {
          userId: userWithToken._id,
          email: userWithToken.email,
          role: userWithToken.role,
          userName: userWithToken.userName,
        },
        process.env.JWT_SECRET,
        { expiresIn: "2d" }
      );

      return res.status(200).json({
        success: true,
        message: "Email already verified! Logging you in...",
        token: jwtToken,
        user: userWithToken.getProfile(),
      });
    }

    const user = await USER.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      console.log(" No valid user found with matching token");

      const expiredUser = await USER.findOne({
        emailVerificationToken: hashedToken,
      });

      if (expiredUser) {
        console.log(" Token found but EXPIRED");
        return res.status(400).json({
          success: false,
          message: "Verification link has expired. Please request a new one.",
          expired: true,
        });
      }

      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification token",
      });
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    console.log(" Email verified successfully for:", user.email);

    // Create email verification success notification
    try {
      await NotificationService.createSystemNotification(user._id, {
        title: "✅ Email Verified Successfully!",
        message: "Your email has been verified. Welcome to Eventry!",
        priority: "medium",
      });
    } catch (notificationError) {
      console.error(
        "Failed to create verification notification:",
        notificationError
      );
    }

    const jwtToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        userName: user.userName,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    res.status(200).json({
      success: true,
      message: "Email verified successfully!",
      token: jwtToken,
      user: user.getProfile(),
    });
  } catch (error) {
    console.error(" Email verification error:", error);
    res.status(500).json({
      success: false,
      message: "Email verification failed",
      error: error.message,
    });
  }
};

const resendVerificationEmail = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return next(new ErrorResponse("Email is required", 400));
    }

    const user = await USER.findOne({ email: email.toLowerCase() });

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (user.isVerified) {
      return next(new ErrorResponse("Email is already verified", 400));
    }

    // Check resend attempt limit (optional: max 3 attempts per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentAttempts = user.verificationResendAttempts || [];
    const recentCount = recentAttempts.filter(
      (attempt) => new Date(attempt) > oneHourAgo
    ).length;

    if (recentCount >= 3) {
      return next(
        new ErrorResponse(
          "Too many resend attempts. Please try again in 1 hour.",
          429
        )
      );
    }

    const verificationToken = user.createEmailVerificationToken();

    // Track resend attempts
    if (!user.verificationResendAttempts) {
      user.verificationResendAttempts = [];
    }
    user.verificationResendAttempts.push(new Date());

    await user.save({ validateBeforeSave: false });

    try {
      const clientUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
      console.log("Resending verification email to:", user.email);

      const emailSent = await sendResendVerificationEmail({
        fullName: user.firstName + " " + user.lastName,
        clientUrl: clientUrl,
        email: user.email,
      });

      if (emailSent) {
        console.log(" Resend successful");
        res.status(200).json({
          success: true,
          message: "Verification email sent successfully! Check your inbox.",
        });
      } else {
        return next(
          new ErrorResponse(
            "Failed to send verification email. Please try again.",
            500
          )
        );
      }
    } catch (emailError) {
      console.error(" Email error:", emailError);
      return next(
        new ErrorResponse(
          "Failed to send verification email. Please try again.",
          500
        )
      );
    }
  } catch (error) {
    console.error(" Resend verification error:", error);
    next(new ErrorResponse("Failed to resend verification email", 500));
  }
};

const handleLogin = async (req, res, next) => {
  const { email, password, userType } = req.body;

  if (!email || !password || !userType) {
    return next(
      new ErrorResponse("Email, password, and user type are required", 400)
    );
  }

  if (!["attendee", "organizer", "superadmin"].includes(userType)) {
    return next(new ErrorResponse("Invalid user type", 400));
  }

  try {
    const user = await USER.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    if (!user) {
      return next(new ErrorResponse("Invalid email or password", 401));
    }

    if (!user.isActive || user.status !== "active") {
      return next(
        new ErrorResponse(
          "Your account has been suspended or deactivated. Please contact support.",
          403
        )
      );
    }

    if (user.role !== userType) {
      return next(
        new ErrorResponse(
          `Please select "${user.role}" account type for this email`,
          401
        )
      );
    }

    if (!user.isVerified) {
      return next(
        new ErrorResponse(
          "Please verify your email before logging in. Check your email for the verification link.",
          401
        )
      );
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return next(new ErrorResponse("Invalid email or password", 401));
    }

    // Record login with client info for notifications
    const clientInfo = getClientInfo(req);
    const loginResult = await user.recordLogin(clientInfo);

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        userName: user.userName,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: user.getProfile(),
      // Include security info for frontend
      securityAlert: loginResult.isSuspicious
        ? "New device/location detected. Please verify this login."
        : null,
    });
  } catch (error) {
    next(new ErrorResponse("Login failed. Please try again.", 500));
  }
};

const handleGoogleAuth = async (req, res, next) => {
  const { token, userType } = req.body;

  if (!token || !userType) {
    return next(
      new ErrorResponse("Google token and user type are required", 400)
    );
  }

  if (userType === "superadmin") {
    return next(
      new ErrorResponse(
        "Google authentication is not available for superadmin",
        400
      )
    );
  }

  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload.email_verified) {
      return next(new ErrorResponse("Google email not verified", 400));
    }

    const { email, given_name, family_name, sub: googleId, picture } = payload;

    let user = await USER.findOne({
      $or: [{ email: email.toLowerCase() }, { googleId }],
    });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.profilePicture = picture || user.profilePicture;
        user.isVerified = true;
        await user.save();
      }

      if (user.role !== userType) {
        return next(
          new ErrorResponse(
            `Please select "${user.role}" account type for this email`,
            401
          )
        );
      }

      // Record login for Google auth too
      const clientInfo = getClientInfo(req);
      await user.recordLogin(clientInfo);
    } else {
      const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
      let userName = baseUsername.substring(0, 15);
      let counter = 1;
      const originalUserName = userName;

      while (await USER.findOne({ userName })) {
        userName = `${originalUserName}${counter}`;
        counter++;
        if (counter > 100)
          throw new Error("Could not generate unique username");
      }

      const userData = {
        firstName: given_name || "User",
        lastName: family_name || "",
        userName,
        email: email.toLowerCase(),
        googleId,
        profilePicture: picture || "",
        role: userType,
        isVerified: true,
        lastLogin: new Date(),
        loginCount: 1,
      };

      user = await USER.create(userData);

      // Create welcome notification for Google signup
      try {
        await NotificationService.createSystemNotification(user._id, {
          title: "🎉 Welcome to Eventry!",
          message: `Welcome ${user.firstName}! Your account has been created with Google.`,
          priority: "medium",
        });
      } catch (notificationError) {
        console.error(
          "Failed to create welcome notification:",
          notificationError
        );
      }
    }

    const jwtToken = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        userName: user.userName,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    res.status(200).json({
      success: true,
      message: "Google authentication successful",
      token: jwtToken,
      user: user.getProfile(),
    });
  } catch (error) {
    if (
      error.message.includes("Token used too late") ||
      error.message.includes("Invalid token")
    ) {
      return next(new ErrorResponse("Invalid or expired Google token", 400));
    }

    if (error.code === 11000) {
      return next(
        new ErrorResponse("User with this email already exists", 409)
      );
    }

    next(new ErrorResponse("Google authentication failed", 500));
  }
};

const getCurrentUser = async (req, res, next) => {
  try {
    const user = await USER.findById(
      req.user.userId || req.user._id || req.user.id
    );

    if (!user) {
      console.log(" No user ID found in request");
      return next(new ErrorResponse("User not found", 404));
    }

    res.status(200).json({
      success: true,
      user: user.getProfile(),
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch user profile", 500));
  }
};

const updateProfile = async (req, res, next) => {
  try {
    console.log("Update profile request received:", {
      body: req.body,
      files: req.files ? Object.keys(req.files) : "No files",
      user: req.user.userId,
    });

    // Handle both JSON and FormData
    const {
      userName,
      bio,
      firstName,
      lastName,
      preferences,
      phone,
      location,
      email,
    } = req.body;

    const userId = req.user.userId;

    const user = await USER.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Store old values for comparison
    const oldValues = {
      userName: user.userName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      location: user.location,
      bio: user.bio,
    };

    const changes = [];

    // Validate and update username
    if (userName && userName !== oldValues.userName) {
      const existingUser = await USER.findOne({
        userName: userName.trim(),
        _id: { $ne: userId }, // Exclude current user
      });
      if (existingUser) {
        return next(new ErrorResponse("Username already taken", 409));
      }
      user.userName = userName.trim();
      changes.push(`username from "${oldValues.userName}" to "${userName}"`);
    }

    // Update basic profile fields
    if (firstName && firstName !== oldValues.firstName) {
      user.firstName = firstName.trim();
      changes.push(`first name to "${firstName}"`);
    }

    if (lastName && lastName !== oldValues.lastName) {
      user.lastName = lastName.trim();
      changes.push(`last name to "${lastName}"`);
    }

    if (bio !== undefined && bio !== oldValues.bio) {
      user.bio = bio.trim();
      changes.push("bio");
    }

    if (phone !== undefined && phone !== oldValues.phone) {
      user.phone = phone.trim();
      changes.push("phone number");
    }

    if (location !== undefined && location !== oldValues.location) {
      user.location = location.trim();
      changes.push(`location to "${location}"`);
    }

    // Handle email update with validation
    if (email && email !== oldValues.email) {
      const normalizedEmail = email.toLowerCase().trim();
      // Check if email already exists
      const existingUser = await USER.findOne({
        email: normalizedEmail,
        _id: { $ne: userId }, // Exclude current user
      });
      if (existingUser) {
        return next(new ErrorResponse("Email already taken", 409));
      }
      user.email = normalizedEmail;
      user.isVerified = false; // Require re-verification for email changes
      changes.push(`email to ${email}`);
    }

    // Handle preferences (could be string from FormData or object from JSON)
    if (preferences) {
      try {
        const prefs =
          typeof preferences === "string"
            ? JSON.parse(preferences)
            : preferences;
        user.preferences = { ...user.preferences, ...prefs };
        changes.push("preferences");
      } catch (error) {
        console.error("Error parsing preferences:", error);
        // Continue without preferences if parsing fails
      }
    }

    // Handle profile picture upload (already validated by middleware)
    if (req.files && req.files.profilePicture) {
      const profilePicture = req.files.profilePicture;

      try {
        console.log("Uploading profile picture to Cloudinary...");

        const result = await cloudinary.uploader.upload(
          profilePicture.tempFilePath,
          {
            folder: "inklune/profilePictures",
            use_filename: true,
            unique_filename: true,
            resource_type: "image",
            transformation: [
              { width: 500, height: 500, crop: "limit" },
              { quality: "auto" },
              { format: "jpg" },
            ],
          }
        );

        // Delete old profile picture from Cloudinary if it exists
        if (user.profilePicture) {
          try {
            const oldPublicId = user.profilePicture
              .split("/")
              .pop()
              .split(".")[0];
            await cloudinary.uploader.destroy(
              `inklune/profilePictures/${oldPublicId}`
            );
            console.log("Old profile picture deleted from Cloudinary");
          } catch (deleteError) {
            console.error("Error deleting old profile picture:", deleteError);
            // Continue even if deletion fails
          }
        }

        user.profilePicture = result.secure_url;
        changes.push("profile picture");
        console.log(
          "Profile picture uploaded successfully:",
          result.secure_url
        );

        // Clean up temp file
        if (
          profilePicture.tempFilePath &&
          fs.existsSync(profilePicture.tempFilePath)
        ) {
          fs.unlink(profilePicture.tempFilePath, (err) => {
            if (err) console.error("Failed to delete temp file:", err);
            else console.log("Temp file cleaned up");
          });
        }
      } catch (uploadError) {
        console.error("Profile picture upload error:", uploadError);
        return next(new ErrorResponse("Failed to upload profile picture", 500));
      }
    }

    // Only save if there are changes
    if (changes.length > 0) {
      await user.save();
      console.log("User profile updated successfully. Changes:", changes);

      // Create profile update notification
      try {
        const updateMessage =
          changes.length === 1
            ? `Updated ${changes[0]}`
            : `Updated ${changes.slice(0, -1).join(", ")} and ${
                changes[changes.length - 1]
              }`;

        const Notification = require("../models/notification");
        await Notification.create({
          user: user._id,
          title: "Profile Updated",
          message: updateMessage,
          type: "profile_update",
          isRead: false,
        });

        console.log("Profile update notification created");
      } catch (notificationError) {
        console.error(
          "Failed to create profile update notification:",
          notificationError
        );
      }

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        user: user.getProfile(),
        changes: changes,
      });
    } else {
      res.status(200).json({
        success: true,
        message: "No changes detected",
        user: user.getProfile(),
      });
    }
  } catch (error) {
    console.error("Update profile error:", error);
    next(new ErrorResponse("Failed to update profile", 500));
  }
};
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return next(new ErrorResponse("Email is required", 400));
    }

    const user = await USER.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If the email exists, a password reset link has been sent",
      });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      const clientUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      const emailSent = await sendResetEmail({
        fullName: user.firstName + " " + user.lastName,
        clientUrl: clientUrl,
        email: user.email,
      });

      res.status(200).json({
        success: true,
        message: "If the email exists, a password reset link has been sent",
      });
    } catch (emailError) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return next(
        new ErrorResponse("Failed to send reset email. Please try again.", 500)
      );
    }
  } catch (error) {
    next(new ErrorResponse("Failed to process password reset", 500));
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.query;
    const { password } = req.body;

    if (!token) {
      return next(new ErrorResponse("Invalid reset token", 400));
    }

    if (!password || password.length < 6) {
      return next(
        new ErrorResponse("Password must be at least 6 characters", 400)
      );
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await USER.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return next(new ErrorResponse("Invalid or expired reset token", 400));
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Create security alert for password reset
    try {
      const clientInfo = getClientInfo(req);
      await NotificationService.createSecurityAlertNotification(user._id, {
        alertType: "Password Reset",
        description: `Your password was reset from ${clientInfo.device} (IP: ${clientInfo.ipAddress}).`,
        severity: "high",
      });
    } catch (notificationError) {
      console.error(
        "Failed to create security notification:",
        notificationError
      );
    }

    const jwtToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        userName: user.userName,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    res.status(200).json({
      success: true,
      message: "Password reset successfully!",
      token: jwtToken,
      user: user.getProfile(),
    });
  } catch (error) {
    next(new ErrorResponse("Password reset failed", 500));
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    if (!currentPassword || !newPassword) {
      return next(
        new ErrorResponse("Current password and new password are required", 400)
      );
    }

    if (newPassword.length < 6) {
      return next(
        new ErrorResponse("New password must be at least 6 characters", 400)
      );
    }

    const user = await USER.findById(userId).select("+password");
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return next(new ErrorResponse("Current password is incorrect", 401));
    }

    user.password = newPassword;
    await user.save();

    // Create security alert for password change
    try {
      const clientInfo = getClientInfo(req);
      await NotificationService.createSecurityAlertNotification(user._id, {
        alertType: "Password Changed",
        description: `Your password was changed from ${clientInfo.device} (IP: ${clientInfo.ipAddress}).`,
        severity: "high",
      });
    } catch (notificationError) {
      console.error(
        "Failed to create security notification:",
        notificationError
      );
    }

    res.status(200).json({
      success: true,
      message: "Password changed successfully!",
    });
  } catch (error) {
    next(new ErrorResponse("Failed to change password", 500));
  }
};

const updatePreferences = async (req, res, next) => {
  try {
    const { preferences } = req.body;
    const userId = req.user.userId;

    const user = await USER.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (preferences) {
      user.preferences = { ...user.preferences, ...preferences };
      await user.save();

      // Create notification for preference changes
      try {
        await NotificationService.createSystemNotification(user._id, {
          title: "⚙️ Preferences Updated",
          message:
            "Your notification preferences have been updated successfully.",
          priority: "low",
        });
      } catch (notificationError) {
        console.error(
          "Failed to create preferences notification:",
          notificationError
        );
      }
    }

    res.status(200).json({
      success: true,
      message: "Preferences updated successfully",
      preferences: user.preferences,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to update preferences", 500));
  }
};

const logout = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(new ErrorResponse("Logout failed", 500));
  }
};

const checkUsernameAvailability = async (req, res, next) => {
  try {
    const { username } = req.query;

    if (!username) {
      return next(new ErrorResponse("Username is required", 400));
    }

    if (username.length < 3) {
      return next(
        new ErrorResponse("Username must be at least 3 characters", 400)
      );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return next(
        new ErrorResponse(
          "Username can only contain letters, numbers, and underscores",
          400
        )
      );
    }

    const existingUser = await USER.findOne({ userName: username });

    res.status(200).json({
      success: true,
      available: !existingUser,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to check username availability", 500));
  }
};

const checkEmailAvailability = async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email) {
      return next(new ErrorResponse("Email is required", 400));
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(
        new ErrorResponse("Please provide a valid email address", 400)
      );
    }

    const existingUser = await USER.findOne({ email: email.toLowerCase() });

    res.status(200).json({
      success: true,
      available: !existingUser,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to check email availability", 500));
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { password } = req.body;

    if (!password) {
      return next(
        new ErrorResponse("Password is required to delete account", 400)
      );
    }

    const user = await USER.findById(userId).select("+password");
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return next(new ErrorResponse("Incorrect password", 401));
    }

    if (user.profilePicture && user.profilePicture.includes("cloudinary")) {
      try {
        const publicId = user.profilePicture.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(
          `inklune/profilePictures/${publicId}`
        );
      } catch (cloudinaryError) {
        console.error("Failed to delete Cloudinary image:", cloudinaryError);
      }
    }

    // Create security alert before deleting account
    try {
      const clientInfo = getClientInfo(req);
      await NotificationService.createSecurityAlertNotification(user._id, {
        alertType: "Account Deleted",
        description: `Your account was deleted from ${clientInfo.device} (IP: ${clientInfo.ipAddress}).`,
        severity: "critical",
      });
    } catch (notificationError) {
      console.error(
        "Failed to create account deletion notification:",
        notificationError
      );
    }

    await USER.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    next(new ErrorResponse("Failed to delete account", 500));
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await USER.findById(userId).select(
      "-email -role -isVerified -preferences"
    );

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    res.status(200).json({
      success: true,
      user: {
        userName: user.userName,
        firstName: user.firstName,
        lastName: user.lastName,
        bio: user.bio,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch user profile", 500));
  }
};
// NEW: Switch Role Function
const switchRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const userId = req.user.userId;

    console.log("🔄 Role switch requested:", { userId, requestedRole: role });

    if (!role) {
      return next(new ErrorResponse("Role is required", 400));
    }

    if (!["attendee", "organizer"].includes(role)) {
      return next(
        new ErrorResponse(
          "Invalid role. Must be either 'attendee' or 'organizer'",
          400
        )
      );
    }

    const user = await USER.findById(userId);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (!user.isActive || user.status !== "active") {
      return next(
        new ErrorResponse(
          "Your account has been suspended or deactivated. Please contact support.",
          403
        )
      );
    }

    const oldRole = user.getCurrentRole();

    // Switch role using the model method
    await user.switchRole(role);

    console.log(`✅ Role switched from ${oldRole} to ${role} for user: ${user.email}`);

    // Create notification about role switch
    try {
      const roleNames = {
        attendee: "Attendee",
        organizer: "Event Organizer"
      };

      await NotificationService.createSystemNotification(user._id, {
        title: "🔄 Role Switched Successfully",
        message: `You are now in ${roleNames[role]} mode. You can switch back anytime from your dashboard.`,
        priority: "medium",
      });
    } catch (notificationError) {
      console.error("Failed to create role switch notification:", notificationError);
    }

    // Generate new token with updated role
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.getCurrentRole(),
        roles: user.getAllRoles(),
        userName: user.userName,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    res.status(200).json({
      success: true,
      message: `Successfully switched to ${role} mode`,
      data: {
        user: user.getProfile(),
        token,
        previousRole: oldRole,
        newRole: role,
      },
    });

  } catch (error) {
    console.error("❌ Error switching role:", error);
    
    if (error.message.includes("Invalid role")) {
      return next(new ErrorResponse(error.message, 400));
    }

    next(new ErrorResponse("Failed to switch role. Please try again.", 500));
  }
};

module.exports = {
  handleRegister,
  handleLogin,
  handleGoogleAuth,
  verifyEmail,
  resendVerificationEmail,
  getCurrentUser,
  updateProfile,
  forgotPassword,
  resetPassword,
  changePassword,
  updatePreferences,
  logout,
  checkUsernameAvailability,
  checkEmailAvailability,
  deleteAccount,
  getUserProfile,
  deleteExpiredUnverifiedUsers,
  switchRole
};
