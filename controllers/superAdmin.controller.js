const User = require("../models/user");

// Create Superadmin
const createSuperadmin = async (req, res, next) => {
  try {
    const { firstName, lastName, userName, email, password } = req.body;

    // Validation
    if (!firstName || !lastName || !userName || !email || !password) {
      return next(new ErrorResponse("All fields are required", 400));
    }

    // Check if superadmin already exists
    const existingSuperadmin = await USER.findOne({ role: "superadmin" });
    if (existingSuperadmin) {
      return next(new ErrorResponse("Superadmin already exists", 409));
    }

    // Check for existing email or username
    const existingUser = await USER.findOne({
      $or: [{ email }, { userName }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return next(new ErrorResponse("Email already exists", 409));
      }
      if (existingUser.userName === userName) {
        return next(new ErrorResponse("Username already taken", 409));
      }
    }

    // Create superadmin
    const superadmin = await USER.create({
      firstName,
      lastName,
      userName,
      email,
      password,
      role: "superadmin",
      isVerified: true,
    });

    console.log(" Superadmin created successfully:", superadmin.email);

    res.status(201).json({
      success: true,
      message: "Superadmin account created successfully!",
      user: superadmin.getProfile(),
    });
  } catch (error) {
    console.error("Superadmin creation error:", error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return next(new ErrorResponse(`${field} already exists`, 409));
    }

    next(new ErrorResponse("Superadmin creation failed", 500));
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    // Check if user is superadmin
    if (req.user.role !== "superadmin") {
      return next(new ErrorResponse("Unauthorized access", 403));
    }

    const { page = 1, limit = 10, role, status, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { userName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await USER.find(filter)
      .select("-password -googleId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await USER.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / limit);

    res.status(200).json({
      success: true,
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalUsers,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    next(new ErrorResponse("Failed to fetch users", 500));
  }
};

// Superadmin: Update user status
const updateUserStatus = async (req, res, next) => {
  try {
    // Check if user is superadmin
    if (req.user.role !== "superadmin") {
      return next(new ErrorResponse("Unauthorized access", 403));
    }

    const { userId } = req.params;
    const { status } = req.body;

    if (!["active", "suspended", "banned"].includes(status)) {
      return next(new ErrorResponse("Invalid status", 400));
    }

    const user = await USER.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Prevent superadmin from modifying other superadmins
    if (user.role === "superadmin" && user._id.toString() !== req.user.userId) {
      return next(
        new ErrorResponse("Cannot modify other superadmin accounts", 403)
      );
    }

    user.status = status;
    if (status === "suspended" || status === "banned") {
      user.isActive = false;
    } else {
      user.isActive = true;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: `User status updated to ${status}`,
      user: user.getProfile(),
    });
  } catch (error) {
    console.error("Update user status error:", error);
    next(new ErrorResponse("Failed to update user status", 500));
  }
};

// Superadmin: Delete user
const deleteUser = async (req, res, next) => {
  try {
    // Check if user is superadmin
    if (req.user.role !== "superadmin") {
      return next(new ErrorResponse("Unauthorized access", 403));
    }

    const { userId } = req.params;

    const user = await USER.findById(userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Prevent superadmin from deleting other superadmins
    if (user.role === "superadmin") {
      return next(new ErrorResponse("Cannot delete superadmin accounts", 403));
    }

    // Soft delete by updating status
    user.status = "deleted";
    user.deletedAt = new Date();
    user.isActive = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    next(new ErrorResponse("Failed to delete user", 500));
  }
};

// Superadmin: Get platform statistics
const getPlatformStats = async (req, res, next) => {
  try {
    // Check if user is superadmin
    if (req.user.role !== "superadmin") {
      return next(new ErrorResponse("Unauthorized access", 403));
    }

    const stats = await USER.getUserStats();

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Get platform stats error:", error);
    next(new ErrorResponse("Failed to fetch platform statistics", 500));
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const user = await User.findByIdAndUpdate(id, { role }, { new: true });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User role updated",
      user: user.getProfile(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndUpdate(
      id,
      { status: "suspended", isActive: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User suspended",
      user: user.getProfile(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  createSuperadmin,
  getAllUsers,
  updateUserRole,
  suspendUser,
  deleteUser,
  updateUserStatus,
  getPlatformStats,
};
