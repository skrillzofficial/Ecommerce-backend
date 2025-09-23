const ErrorResponse = require("../utils/errorResponse");

const authorizeAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse("Authentication required", 401));
  }

  if (req.user.role !== "admin") {
    return next(new ErrorResponse("Admin access required", 403));
  }
  next();
};

// Middleware for both admin and the user themselves
const authorizeUserOrAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse("Authentication required", 401));
  }

  // Allow if user is admin OR if user is updating their own profile
  if (req.user.role === "admin" || req.user._id.toString() === req.params.id) {
    return next();
  }

  return next(new ErrorResponse("Not authorized to access this resource", 403));
};

module.exports = { authorizeAdmin, authorizeUserOrAdmin };
