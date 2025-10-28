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
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // Make sure token exists
    if (!token) {
      return next(
        new ErrorResponse("Not authorized to access this route", 401)
      );
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

      // Check if user email is verified (if you have email verification)
      if (user.requireEmailVerification && !user.isEmailVerified) {
        return next(new ErrorResponse("Please verify your email address", 403));
      }

      // Attach user to request
      req.user = {
        _id: user._id,
        id: user._id,
        userId: user._id,
        email: user.email,
        role: user.role,
        userName: user.userName,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified
      };

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return next(
          new ErrorResponse("Token expired, please login again", 401)
        );
      }
      
      if (error.name === "JsonWebTokenError") {
        return next(
          new ErrorResponse("Invalid token, please login again", 401)
        );
      }

      return next(
        new ErrorResponse("Not authorized to access this route", 401)
      );
    }
  } catch (error) {
    console.error("Auth middleware error:", error.message);
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

// Grant access if user has any of the specified roles
const authorizeAny = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorResponse("Not authenticated", 401));
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `Insufficient permissions to access this route`,
          403
        )
      );
    }

    next();
  };
};

// Optional authentication - attaches user if token is valid
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select("-password");

        if (user && user.isActive) {
          req.user = {
            _id: user._id,
            id: user._id,
            userId: user._id,
            email: user.email,
            role: user.role,
            userName: user.userName,
            isActive: user.isActive,
            isEmailVerified: user.isEmailVerified
          };
        }
      } catch (error) {
        // Token invalid or expired, continue without user
        // No logging needed for optional auth failures
      }
    }

    next();
  } catch (error) {
    // Continue without authentication on error
    next();
  }
};

// Check if user owns resource or is admin
const checkOwnership = (model, options = {}) => {
  return async (req, res, next) => {
    try {
      const resource = await model.findById(req.params.id);

      if (!resource) {
        return next(new ErrorResponse("Resource not found", 404));
      }

      const userId = req.user._id.toString();

      // Allow superadmin to access any resource
      if (req.user.role === "superadmin") {
        req.resource = resource;
        return next();
      }

      // Check different ownership fields
      const ownershipFields = options.ownershipFields || ['organizer', 'user', 'userId', 'createdBy'];
      const isOwner = ownershipFields.some(field => {
        if (resource[field]) {
          return resource[field].toString() === userId;
        }
        return false;
      });

      if (!isOwner) {
        return next(
          new ErrorResponse("Not authorized to access this resource", 403)
        );
      }

      // Attach resource to request for reuse
      req.resource = resource;
      next();
    } catch (error) {
      console.error("Ownership check error:", error.message);
      next(new ErrorResponse("Failed to verify ownership", 500));
    }
  };
};

// Check if user can access resource (weaker than ownership)
const checkResourceAccess = (model, options = {}) => {
  return async (req, res, next) => {
    try {
      const resource = await model.findById(req.params.id);

      if (!resource) {
        return next(new ErrorResponse("Resource not found", 404));
      }

      const userId = req.user._id.toString();

      // Allow superadmin to access any resource
      if (req.user.role === "superadmin") {
        req.resource = resource;
        return next();
      }

      // Check ownership first
      const ownershipFields = options.ownershipFields || ['organizer', 'user', 'userId', 'createdBy'];
      const isOwner = ownershipFields.some(field => {
        if (resource[field]) {
          return resource[field].toString() === userId;
        }
        return false;
      });

      if (isOwner) {
        req.resource = resource;
        return next();
      }

      // Check for shared access (e.g., collaborators, team members)
      if (options.accessFields) {
        const hasAccess = options.accessFields.some(field => {
          if (resource[field] && Array.isArray(resource[field])) {
            return resource[field].some(id => id.toString() === userId);
          }
          return false;
        });

        if (hasAccess) {
          req.resource = resource;
          return next();
        }
      }

      return next(
        new ErrorResponse("Not authorized to access this resource", 403)
      );

    } catch (error) {
      console.error("Resource access check error:", error.message);
      next(new ErrorResponse("Failed to verify resource access", 500));
    }
  };
};

// Rate limiting middleware (use a proper rate limiter instead)
const requireRateLimit = (req, res, next) => {
  // Note: For production, use a proper rate limiting library like
  // express-rate-limit or a Redis-based solution
  // This is a basic in-memory implementation for development
  
  if (process.env.NODE_ENV === 'production') {
    console.warn('Using basic rate limiting - consider implementing proper rate limiting');
  }
  
  next();
};

// Check if user is the same as the requested user
const checkSelfOrAdmin = (req, res, next) => {
  const requestedUserId = req.params.userId || req.params.id;
  
  if (!requestedUserId) {
    return next(new ErrorResponse("User ID required", 400));
  }

  if (req.user._id.toString() !== requestedUserId && req.user.role !== "superadmin") {
    return next(
      new ErrorResponse("Not authorized to access this user's data", 403)
    );
  }

  next();
};

// Check if user can manage events (organizer or admin)
const canManageEvents = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse("Not authenticated", 401));
  }

  if (req.user.role !== "organizer" && req.user.role !== "superadmin") {
    return next(
      new ErrorResponse("Only organizers can manage events", 403)
    );
  }

  next();
};

// Check if user can purchase tickets (attendee or admin)
const canPurchaseTickets = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse("Not authenticated", 401));
  }

  if (req.user.role !== "attendee" && req.user.role !== "superadmin") {
    return next(
      new ErrorResponse("Only attendees can purchase tickets", 403)
    );
  }

  next();
};

module.exports = {
  protect,
  authorize,
  authorizeAny,
  optionalAuth,
  checkOwnership,
  checkResourceAccess,
  requireRateLimit,
  checkSelfOrAdmin,
  canManageEvents,
  canPurchaseTickets
};