const ErrorResponse = require("./errorResponse");

// Validate required fields
const validateRequiredFields = (data, requiredFields) => {
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    throw new ErrorResponse(
      `Missing required fields: ${missingFields.join(", ")}`, 
      400
    );
  }
};

// Validate user authorization
const validateEventOwnership = (event, userId, userRole) => {
  const eventOrganizerId = event.organizer?._id?.toString() || event.organizer?.toString();
  
  if (eventOrganizerId !== userId && userRole !== "superadmin") {
    throw new ErrorResponse("Not authorized to perform this action", 403);
  }
};

// Validate organizer role
const validateOrganizerRole = (userRole) => {
  if (userRole !== "organizer") {
    throw new ErrorResponse("Only organizers can perform this action", 403);
  }
};

module.exports = {
  validateRequiredFields,
  validateEventOwnership,
  validateOrganizerRole
};