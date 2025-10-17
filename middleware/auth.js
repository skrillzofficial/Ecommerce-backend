const jwt = require("jsonwebtoken");
const User = require("../models/user");
const ErrorResponse = require("../utils/errorResponse");

// Protect routes - Verify JWT token
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }
    // Check for token in cookies
    else if (req.cookies.token) {
      token = req.cookies.token;
    }

    // Make sure token exists
    if (!token) {
      return next(new ErrorResponse("Not authorized to access this route", 401));
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      const user = await User.findById(decoded.userId).select("-password");

      if (!user) {
        return next(new ErrorResponse("User not found", 404));
      }

      // Check if user is active
      if (!user.isActive) {
        return next(new ErrorResponse("Account has been deactivated", 403));
      }

      //  Attach user with multiple ID formats for compatibility
      req.user = {
        _id: user._id,       
        id: user._id,         
        userId: user._id,     
        email: user.email,
        role: user.role,
        userName: user.userName,
      };

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return next(new ErrorResponse("Token expired, please login again", 401));
      }
      return next(new ErrorResponse("Not authorized to access this route", 401));
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    next(new ErrorResponse("Authentication failed", 500));
  }
};

// Authorize specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorResponse("Not authenticated", 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `User role '${req.user.role}' is not authorized to access this route`,
          403
        )
      );
    }

    next();
  };
};

const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select("-password");

        if (user && user.isActive && user.status === "active") {
          req.user = {
            _id: user._id,
            id: user._id,
            userId: user._id,
            email: user.email,
            role: user.role,
            userName: user.userName,
          };
        }
      } catch (error) {
        // Token invalid or expired, just continue without user
        console.log("Optional auth token invalid:", error.message);
      }
    }

    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    next();
  }
};

// Check if user owns resource
const checkOwnership = (model) => {
  return async (req, res, next) => {
    try {
      const resource = await model.findById(req.params.id);

      if (!resource) {
        return next(new ErrorResponse("Resource not found", 404));
      }

      // FIXED: Use consistent user ID format
      const userId = req.user._id || req.user.userId;

      // Check if user owns the resource or is superadmin
      if (
        resource.organizer?.toString() !== userId.toString() &&
        resource.user?.toString() !== userId.toString() &&
        req.user.role !== "superadmin"
      ) {
        return next(
          new ErrorResponse("Not authorized to access this resource", 403)
        );
      }

      // Attach resource to request for reuse
      req.resource = resource;
      next();
    } catch (error) {
      console.error("Ownership check error:", error);
      next(new ErrorResponse("Failed to verify ownership", 500));
    }
  };
};

// Rate limiting per user
const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = (req.user._id || req.user.userId).toString();
    const now = Date.now();
    const userRequests = requests.get(userId) || [];

    // Filter out old requests outside the window
    const recentRequests = userRequests.filter(
      (timestamp) => now - timestamp < windowMs
    );

    if (recentRequests.length >= maxRequests) {
      return next(
        new ErrorResponse(
          `Too many requests. Please try again later.`,
          429
        )
      );
    }

    // Add current request
    recentRequests.push(now);
    requests.set(userId, recentRequests);

    // Clean up old entries periodically
    if (requests.size > 10000) {
      requests.clear();
    }

    next();
  };
};

module.exports = {
  protect,
  authorize,
  optionalAuth,
  checkOwnership,
  rateLimit
};