const ErrorResponse = require("../utils/errorResponse");

const authorizeSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse("Authentication required", 401));
  }

  if (req.user.role !== "superadmin") {
    return next(new ErrorResponse("Super admin access required", 403));
  }
  next();
};

// Middleware for both superadmin and the user themselves
const authorizeUserOrSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse("Authentication required", 401));
  }

  // Allow if user is superadmin OR if user is updating their own profile
  if (req.user.role === "superadmin" || req.user._id.toString() === req.params.id) {
    return next();
  }

  return next(new ErrorResponse("Not authorized to access this resource", 403));
};

// For organizers (if needed)
const authorizeOrganizer = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse("Authentication required", 401));
  }

  if (req.user.role !== "organizer" && req.user.role !== "superadmin") {
    return next(new ErrorResponse("Organizer access required", 403));
  }
  next();
};

module.exports = { 
  authorizeSuperAdmin, 
  authorizeUserOrSuperAdmin, 
  authorizeOrganizer 
};