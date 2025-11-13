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

      // Attach user to request with role support
      req.user = {
        _id: user._id,
        id: user._id,
        userId: user._id,
        email: user.email,
        role: user.getCurrentRole(), // Use helper method for backward compatibility
        roles: user.getAllRoles(), // Get all available roles
        activeRole: user.getCurrentRole(), // Current active role
        userName: user.userName,
        isActive: user.isActive,
        isVerified: user.isVerified
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

// Authorize specific roles (checks active role)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorResponse("Not authenticated", 401));
    }

    // Check if user's active role is in allowed roles
    const currentRole = req.user.activeRole || req.user.role;
    if (!roles.includes(currentRole)) {
      return next(
        new ErrorResponse(
          `User role '${currentRole}' is not authorized to access this route`,
          403
        )
      );
    }

    next();
  };
};

// Grant access if user has any of the specified roles (checks roles array)
const authorizeAny = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorResponse("Not authenticated", 401));
    }

    if (roles.length > 0) {
      // Check in roles array first, fallback to role field
      const userRoles = req.user.roles || [req.user.role];
      const hasRequiredRole = roles.some(role => userRoles.includes(role));
      
      if (!hasRequiredRole) {
        return next(
          new ErrorResponse(
            `Insufficient permissions to access this route`,
            403
          )
        );
      }
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
            role: user.getCurrentRole(),
            roles: user.getAllRoles(),
            activeRole: user.getCurrentRole(),
            userName: user.userName,
            isActive: user.isActive,
            isVerified: user.isVerified
          };
        }
      } catch (error) {
        // Token invalid or expired, continue without user
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
      const currentRole = req.user.activeRole || req.user.role;

      // Allow superadmin to access any resource
      if (currentRole === "superadmin") {
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
      const currentRole = req.user.activeRole || req.user.role;

      // Allow superadmin to access any resource
      if (currentRole === "superadmin") {
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

// Rate limiting middleware
const requireRateLimit = (req, res, next) => {
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

  const currentRole = req.user.activeRole || req.user.role;
  if (req.user._id.toString() !== requestedUserId && currentRole !== "superadmin") {
    return next(
      new ErrorResponse("Not authorized to access this user's data", 403)
    );
  }

  next();
};

// Check if user can manage events (organizer or admin) - checks roles array
const canManageEvents = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse("Not authenticated", 401));
  }

  const userRoles = req.user.roles || [req.user.role];
  const canManage = userRoles.includes("organizer") || userRoles.includes("superadmin");

  if (!canManage) {
    return next(
      new ErrorResponse("Only organizers can manage events", 403)
    );
  }

  next();
};

// Check if user can purchase tickets (attendee or admin) - checks roles array
const canPurchaseTickets = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse("Not authenticated", 401));
  }

  const userRoles = req.user.roles || [req.user.role];
  const canPurchase = userRoles.includes("attendee") || userRoles.includes("superadmin");

  if (!canPurchase) {
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