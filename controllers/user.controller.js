const USER = require("../models/user");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const ErrorResponse = require("../utils/errorResponse");

// User registration
const handleRegister = async (req, res, next) => {
  const { firstName, lastName, userName, email, password, role } = req.body;

  if (!firstName || !lastName || !userName || !email || !password) {
    return next(new ErrorResponse("All fields are required", 400));
  }

  try {
    // Check for existing email OR username separately
    const existingEmail = await USER.findOne({ email });
    const existingUsername = await USER.findOne({ userName });

    if (existingEmail) {
      return next(new ErrorResponse("Email already exists", 409));
    }

    if (existingUsername) {
      return next(new ErrorResponse("Username already taken", 409));
    }

    const user = await USER.create({
      firstName,
      lastName,
      userName,
      email,
      password,
      role: role || "user",
      isVerified: true,
      onboardingCompleted: false,
    });

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: user.getProfile(),
    });
  } catch (error) {
    console.error("Registration error:", error);
    next(new ErrorResponse("Registration failed", 500));
  }
};

// User login
const handleLogin = async (req, res, next) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return next(
      new ErrorResponse("Login identifier and password are required", 400)
    );
  }

  try {
    // Check if login is email or username
    const isEmail = login.includes("@");

    let user;
    if (isEmail) {
      user = await USER.findOne({ email: login }).select("+password");
    } else {
      user = await USER.findOne({ userName: login }).select("+password");
    }

    if (!user) {
      return next(new ErrorResponse("Invalid credentials", 401));
    }

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return next(new ErrorResponse("Invalid credentials", 401));
    }

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: user.getProfile(),
    });
  } catch (error) {
    console.error("Login error:", error);
    next(new ErrorResponse("Login failed", 500));
  }
};

// Update user details including image and bio
const handleUpdateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, userName, email, bio } = req.body;
    const authenticatedUserId = req.user.userId;

    // Check if user exists
    const user = await USER.findById(id);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Authorization check - user can only update their own profile
    if (
      user._id.toString() !== authenticatedUserId &&
      req.user.role !== "admin"
    ) {
      return next(new ErrorResponse("Not authorized to update this user", 403));
    }

    // Check if new email or username already exists (excluding current user)
    if (email && email !== user.email) {
      const existingEmail = await USER.findOne({
        email,
        _id: { $ne: id },
      });
      if (existingEmail) {
        return next(new ErrorResponse("Email already in use", 409));
      }
    }

    if (userName && userName !== user.userName) {
      const existingUsername = await USER.findOne({
        userName,
        _id: { $ne: id },
      });
      if (existingUsername) {
        return next(new ErrorResponse("Username already taken", 409));
      }
    }

    // Handle image upload if file is provided
    let imageUrl = user.image;
    if (req.file) {
      imageUrl = req.file.path;
    }

    // Update user fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (userName) updateData.userName = userName;
    if (email) updateData.email = email;
    if (bio !== undefined) updateData.bio = bio;
    if (req.file) updateData.image = imageUrl;

    // Perform the update
    const updatedUser = await USER.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser.getProfile(),
    });
  } catch (error) {
    console.error("Update user error:", error);

    if (error.name === "CastError") {
      return next(new ErrorResponse("Invalid user ID", 400));
    }
    if (error.name === "ValidationError") {
      return next(new ErrorResponse(error.message, 400));
    }

    next(new ErrorResponse("Update failed", 500));
  }
};

// Get all users (Admin only)
const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { userName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await USER.find(query)
      .select("-password -__v")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await USER.countDocuments(query);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      users: users.map((user) => user.getProfile()),
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch users", 500));
  }
};

// Get user by ID
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await USER.findById(id).select("-password -__v");

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    res.status(200).json({
      success: true,
      user: user.getProfile(),
    });
  } catch (error) {
    console.error("Get user error:", error);

    if (error.name === "CastError") {
      return next(new ErrorResponse("Invalid user ID format", 400));
    }

    next(new ErrorResponse("Failed to fetch user", 500));
  }
};

// Get current user profile (using JWT token)
const getCurrentUser = async (req, res, next) => {
  try {
    const user = await USER.findById(req.user.userId).select("-password");

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    res.status(200).json({
      success: true,
      user: user.getProfile(),
    });
  } catch (error) {
    console.error("Get current user error:", error);
    next(new ErrorResponse("Failed to fetch user profile", 500));
  }
};

// Delete single user
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Prevent users from deleting themselves (unless admin deleting another user)
    if (id === req.user.userId && req.user.role !== "admin") {
      return next(
        new ErrorResponse(
          "You cannot delete your own account using this endpoint. Use close account instead.",
          403
        )
      );
    }

    const user = await USER.findByIdAndDelete(id);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    next(new ErrorResponse("Failed to delete user", 500));
  }
};

// Payment methods (simplified implementation)
const getPaymentMethods = async (req, res, next) => {
  try {
    // In a real application, this would fetch from a PaymentMethod model
    const user = await USER.findById(req.user.userId);
    const paymentMethods = user.paymentMethods || [];

    res.status(200).json({
      success: true,
      paymentMethods,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch payment methods", 500));
  }
};

const addPaymentMethod = async (req, res, next) => {
  try {
    const { type, details } = req.body;

    if (!type || !details) {
      return next(
        new ErrorResponse("Payment method type and details are required", 400)
      );
    }

    const user = await USER.findById(req.user.userId);
    const newPaymentMethod = {
      id: Date.now().toString(),
      type,
      details,
      isDefault: false,
      createdAt: new Date(),
    };

    user.paymentMethods = user.paymentMethods || [];
    user.paymentMethods.push(newPaymentMethod);
    await user.save();

    res.status(201).json({
      success: true,
      message: "Payment method added successfully",
      paymentMethod: newPaymentMethod,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to add payment method", 500));
  }
};

const updatePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const user = await USER.findById(req.user.userId);
    const paymentMethod = user.paymentMethods?.find((pm) => pm.id === id);

    if (!paymentMethod) {
      return next(new ErrorResponse("Payment method not found", 404));
    }

    Object.assign(paymentMethod, updates);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Payment method updated successfully",
      paymentMethod,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to update payment method", 500));
  }
};

const deletePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await USER.findById(req.user.userId);
    user.paymentMethods =
      user.paymentMethods?.filter((pm) => pm.id !== id) || [];
    await user.save();

    res.status(200).json({
      success: true,
      message: "Payment method deleted successfully",
    });
  } catch (error) {
    next(new ErrorResponse("Failed to delete payment method", 500));
  }
};

// Linked accounts (OAuth integration)
const getLinkedAccounts = async (req, res, next) => {
  try {
    const user = await USER.findById(req.user.userId);
    const linkedAccounts = user.linkedAccounts || [];

    res.status(200).json({
      success: true,
      linkedAccounts,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch linked accounts", 500));
  }
};

const linkAccount = async (req, res, next) => {
  try {
    const { provider, providerId, profile } = req.body;

    if (!provider || !providerId) {
      return next(
        new ErrorResponse("Provider and provider ID are required", 400)
      );
    }

    const user = await USER.findById(req.user.userId);
    const newLinkedAccount = {
      provider,
      providerId,
      profile: profile || {},
      linkedAt: new Date(),
    };

    user.linkedAccounts = user.linkedAccounts || [];
    user.linkedAccounts.push(newLinkedAccount);
    await user.save();

    res.status(201).json({
      success: true,
      message: "Account linked successfully",
      linkedAccount: newLinkedAccount,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to link account", 500));
  }
};

const unlinkAccount = async (req, res, next) => {
  try {
    const { provider } = req.params;

    const user = await USER.findById(req.user.userId);
    user.linkedAccounts =
      user.linkedAccounts?.filter((acc) => acc.provider !== provider) || [];
    await user.save();

    res.status(200).json({
      success: true,
      message: "Account unlinked successfully",
    });
  } catch (error) {
    next(new ErrorResponse("Failed to unlink account", 500));
  }
};

// Communication preferences
const getCommunicationPrefs = async (req, res, next) => {
  try {
    const user = await USER.findById(req.user.userId);
    const communicationPrefs = user.communicationPrefs || {
      email: true,
      push: true,
      sms: false,
      newsletter: true,
      marketing: false,
    };

    res.status(200).json({
      success: true,
      communicationPrefs,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch communication preferences", 500));
  }
};

const updateCommunicationPrefs = async (req, res, next) => {
  try {
    const { email, push, sms, newsletter, marketing } = req.body;

    const user = await USER.findById(req.user.userId);
    user.communicationPrefs = {
      email: email !== undefined ? email : user.communicationPrefs?.email,
      push: push !== undefined ? push : user.communicationPrefs?.push,
      sms: sms !== undefined ? sms : user.communicationPrefs?.sms,
      newsletter:
        newsletter !== undefined
          ? newsletter
          : user.communicationPrefs?.newsletter,
      marketing:
        marketing !== undefined
          ? marketing
          : user.communicationPrefs?.marketing,
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: "Communication preferences updated successfully",
      communicationPrefs: user.communicationPrefs,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to update communication preferences", 500));
  }
};

// Close account
const closeAccount = async (req, res, next) => {
  try {
    const { password, reason } = req.body;
    const userId = req.user.userId;

    if (!password) {
      return next(
        new ErrorResponse("Password is required to close your account", 400)
      );
    }

    const user = await USER.findById(userId).select("+password");
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Verify password
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return next(new ErrorResponse("Invalid password", 401));
    }

    // Soft delete 
    user.deletedAt = new Date();
    user.status = "deleted";
    user.email = `deleted_${Date.now()}@deleted.com`;
    user.userName = `deleted_${Date.now()}`;
    await user.save();

    // In a real application, you might want to actually delete after a grace period
    // await USER.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "Account closed successfully",
    });
  } catch (error) {
    console.error("Close account error:", error);
    next(new ErrorResponse("Failed to close account", 500));
  }
};

module.exports = {
  handleRegister,
  handleLogin,
  handleUpdateUser,
  getAllUsers,
  getCurrentUser,
  getUserById,
  deleteUser,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  getLinkedAccounts,
  linkAccount,
  unlinkAccount,
  getCommunicationPrefs,
  updateCommunicationPrefs,
  closeAccount,
};
