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
  const userIdString = userId?.toString();
  
  console.log(" Ownership Validation:", {
    eventId: event._id?.toString(),
    eventTitle: event.title,
    eventOrganizerId,
    userId: userIdString,
    userRole,
    match: eventOrganizerId === userIdString
  });
  
  if (eventOrganizerId !== userIdString && userRole !== "superadmin") {
    console.error("❌ Authorization failed:", {
      expected: eventOrganizerId,
      received: userIdString,
      role: userRole
    });
    throw new ErrorResponse("Not authorized to perform this action", 403);
  }
  
  console.log("✅ Authorization successful");
};

// Validate organizer role
const validateOrganizerRole = (userRole) => {
  if (userRole !== "organizer" && userRole !== "superadmin") {
    throw new ErrorResponse("Only organizers can perform this action", 403);
  }
};

module.exports = {
  validateRequiredFields,
  validateEventOwnership,
  validateOrganizerRole
};