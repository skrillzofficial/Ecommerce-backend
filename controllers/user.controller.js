const USER = require("../models/user");
const jwt = require("jsonwebtoken");
const ErrorResponse = require("../utils/errorResponse");

// user registration
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
    });

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token, // Send token in response
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        userName: user.userName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    next(new ErrorResponse("Registration failed", 500));
  }
};
// User login
const handleLogin = async (req, res, next) => {
  const { login, password } = req.body; // Changed from 'email' to 'login'

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
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        userName: user.userName, // Added username
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    next(new ErrorResponse("Login failed", 500));
  }
};
// Update user details including image and bio
const HandleUpdateUser = async (req, res, next) => {
  try {
    const { id } = req.params; // User ID from URL params
    const { firstName, lastName, userName, email, bio } = req.body;
    const authenticatedUserId = req.user.userId; // From JWT middleware

    // Check if user exists
    const user = await USER.findById(id);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Authorization check - user can only update their own profile
    if (user._id.toString() !== authenticatedUserId) {
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
    let imageUrl = user.image; // Keep existing image if no new one
    if (req.file) {
      // Assuming you're using multer or similar for file uploads
      imageUrl = req.file.path; // or req.file.location for AWS S3
      // Optional: Delete old image from storage
    }

    // Update user fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (userName) updateData.userName = userName;
    if (email) updateData.email = email;
    if (bio !== undefined) updateData.bio = bio; // Allow empty bio
    if (req.file) updateData.image = imageUrl;

    // Perform the update
    const updatedUser = await USER.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true } // Return updated document and run validators
    ).select("-password"); // Exclude password from response

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update user error:", error);

    // Handle specific MongoDB errors
    if (error.name === "CastError") {
      return next(new ErrorResponse("Invalid user ID", 400));
    }
    if (error.name === "ValidationError") {
      return next(new ErrorResponse(error.message, 400));
    }

    next(new ErrorResponse("Update failed", 500));
  }
};
// Get all users
const getAllUsers = async (req, res, next) => {
  try {
    // Excluding passwords and sensitive fields
    const users = await USER.find().select("-password -__v");

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    next(new ErrorResponse("Failed to fetch users", 500));
  }
};

// Delete single user
const deleteUser = async (req, res, next) => {
  try {
    const user = await USER.findByIdAndDelete(req.params.id);

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

module.exports = {
  handleRegister,
  handleLogin,
  HandleUpdateUser,
  getAllUsers,
  deleteUser,
};
