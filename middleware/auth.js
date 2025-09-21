const jwt = require("jsonwebtoken");
const User = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");

const protect = async (req, res, next) => {
  let token;

  // 1. Get token from header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  // 2. Check if token exists
  if (!token) {
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Full decoded token:", decoded);
    // Check different possible user ID properties
    const userId = decoded.userId || decoded.id || decoded._id;
    console.log("Extracted user ID:", userId);

    if (!userId) {
      return next(new ErrorResponse("Invalid token structure", 401));
    }

    const user = await User.findById(userId).select("-password");
    
    if (!user) {
      console.log(`User ${userId} not found in database`);
      return next(new ErrorResponse("User no longer exists", 401));
    }

    console.log("User found:", {
      id: user._id,
      email: user.email,
      role: user.role
    });

    req.user = user;
    next();
  } catch (err) {
    // Handle specific JWT errors
    if (err.name === "TokenExpiredError") {
      return next(new ErrorResponse("Token has expired", 401));
    }
    if (err.name === "JsonWebTokenError") {
      return next(new ErrorResponse("Invalid token", 401));
    }
    console.error("JWT verification error:", err);
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }
};

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next(new ErrorResponse("Access denied. No token provided.", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    next(new ErrorResponse("Invalid token", 401));
  }
};

module.exports = { protect, authenticate };