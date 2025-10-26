const Event = require("../models/event");
const ErrorResponse = require("../utils/errorResponse");

// Helper function to get value from req.body considering array notation
const getValue = (body, key) => {
  // Check for array notation first (e.g., field[])
  if (body[`${key}[]`] !== undefined) {
    return body[`${key}[]`];
  }
  // Then check regular field
  return body[key];
};

// Helper function to parse array from various formats
const parseArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch (e) {
      return value.split(',').map(v => v.trim()).filter(Boolean);
    }
  }
  return [];
};

// Safe number parsing function
const safeParseNumber = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

// Updated valid categories (added Lifestyle)
const VALID_CATEGORIES = [
  "Technology",
  "Business",
  "Marketing",
  "Arts",
  "Health",
  "Education",
  "Music",
  "Food",
  "Sports",
  "Entertainment",
  "Networking",
  "Lifestyle",
  "Other"
];

// Updated valid states (all 36 Nigerian states + FCT)
const VALID_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT (Abuja)",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara"
];

// Validate event creation data (UPDATED FOR DRAFT SUPPORT)
const validateEventCreation = (req, res, next) => {
  // Enhanced debugging
  console.log('=== VALIDATE EVENT CREATION ===');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('req.body exists:', !!req.body);
  console.log('req.body type:', typeof req.body);
  console.log('req.body keys:', req.body ? Object.keys(req.body) : 'NO BODY');
  console.log('req.body content:', JSON.stringify(req.body, null, 2));
  console.log('req.files exists:', !!req.files);
  console.log('req.files keys:', req.files ? Object.keys(req.files) : 'NO FILES');

  // Check if req.body exists
  if (!req.body) {
    console.error('❌ req.body is undefined');
    return next(new ErrorResponse("Request body is missing. Please ensure you're sending form data correctly.", 400));
  }

  if (typeof req.body !== 'object') {
    console.error('❌ req.body is not an object:', typeof req.body);
    return next(new ErrorResponse("Invalid request body format", 400));
  }

  if (Object.keys(req.body).length === 0) {
    console.error('❌ req.body is empty');
    return next(new ErrorResponse("Request body is empty. At least a title is required.", 400));
  }

  const {
    title,
    description,
    category,
    date,
    time,
    endTime,
    venue,
    address,
    city,
    price,
    capacity,
    status = "draft",
  } = req.body;

  console.log('Extracted fields:', { title, status, category, date });

  const errors = [];
  const isPublishing = status === "published";

  // Title validation (ALWAYS REQUIRED)
  if (!title || title.trim().length < 5) {
    errors.push("Title must be at least 5 characters long");
  }
  if (title && title.length > 200) {
    errors.push("Title must not exceed 200 characters");
  }

  // ===== CONDITIONAL VALIDATION FOR PUBLISHED EVENTS =====
  if (isPublishing) {
    // Description validation
    if (!description || description.trim().length < 50) {
      errors.push("Description must be at least 50 characters long to publish");
    }
    if (description && description.length > 5000) {
      errors.push("Description must not exceed 5000 characters");
    }

    // Category validation 
    if (!category || !VALID_CATEGORIES.includes(category)) {
      errors.push(
        `Category is required to publish. Must be one of: ${VALID_CATEGORIES.join(", ")}`
      );
    }

    // Date validation
    if (!date) {
      errors.push("Event date is required to publish");
    } else {
      const eventDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (isNaN(eventDate.getTime())) {
        errors.push("Invalid date format");
      } else {
        eventDate.setHours(0, 0, 0, 0);
        if (eventDate < today) {
          errors.push("Event date must be in the future");
        }
      }
    }

    // Time validation
    if (!time || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
      errors.push("Valid start time is required to publish (HH:MM format)");
    }
    if (!endTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
      errors.push("Valid end time is required to publish (HH:MM format)");
    }

    // Validate time order if both are provided
    if (time && endTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time) && /^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
      const [startHour, startMin] = time.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      if (endMinutes <= startMinutes) {
        errors.push("End time must be after start time");
      }
    }

    // Venue validation
    if (!venue || venue.trim().length < 3) {
      errors.push("Venue must be at least 3 characters long to publish");
    }
    if (venue && venue.length > 200) {
      errors.push("Venue must not exceed 200 characters");
    }

    // Address validation
    if (!address || address.trim().length < 5) {
      errors.push("Address must be at least 5 characters long to publish");
    }
    if (address && address.length > 500) {
      errors.push("Address must not exceed 500 characters");
    }

    // City/State validation 
    if (!city || !VALID_STATES.includes(city)) {
      errors.push(`State is required to publish. Must be one of: ${VALID_STATES.join(", ")}`);
    }

    // Price validation - ONLY if ticketTypes is not provided
    const ticketTypes = req.body.ticketTypes;
    let hasTicketTypes = false;
    
    if (ticketTypes) {
      try {
        const parsed = typeof ticketTypes === 'string' ? JSON.parse(ticketTypes) : ticketTypes;
        hasTicketTypes = Array.isArray(parsed) && parsed.length > 0;
      } catch (e) {
        // Not valid ticket types
      }
    }

    if (!hasTicketTypes) {
      // Only validate price/capacity if no ticket types
      if (price === undefined || price === null || price === '') {
        errors.push("Price is required to publish");
      } else {
        const priceNum = safeParseNumber(price, 0);
        if (priceNum < 0) {
          errors.push("Price must be a non-negative number");
        }
        if (priceNum > 10000000) {
          errors.push("Price seems unreasonably high");
        }
      }

      // Capacity validation
      if (!capacity || capacity === '') {
        errors.push("Capacity is required to publish");
      } else {
        const capacityNum = safeParseNumber(capacity, 1);
        if (capacityNum < 1) {
          errors.push("Capacity must be at least 1");
        }
        if (capacityNum > 100000) {
          errors.push("Capacity seems unreasonably high");
        }
      }
    }
  } else {
    // ===== OPTIONAL VALIDATION FOR DRAFTS =====
    // Only validate format if fields are provided
    
    if (description && description.length > 5000) {
      errors.push("Description must not exceed 5000 characters");
    }

    if (category && !VALID_CATEGORIES.includes(category)) {
      errors.push(`Category must be one of: ${VALID_CATEGORIES.join(", ")}`);
    }

    if (city && !VALID_STATES.includes(city)) {
      errors.push(`State must be one of: ${VALID_STATES.join(", ")}`);
    }

    if (date) {
      const eventDate = new Date(date);
      if (isNaN(eventDate.getTime())) {
        errors.push("Invalid date format");
      }
    }

    if (time && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
      errors.push("Invalid time format (HH:MM)");
    }

    if (endTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
      errors.push("Invalid end time format (HH:MM)");
    }

    if (price !== undefined && price !== null && price !== '') {
      const priceNum = safeParseNumber(price, 0);
      if (priceNum < 0) {
        errors.push("Price must be a non-negative number");
      }
    }

    if (capacity !== undefined && capacity !== '') {
      const capacityNum = safeParseNumber(capacity, 1);
      if (capacityNum < 1) {
        errors.push("Capacity must be at least 1");
      }
    }
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate event update data (UPDATED FOR STATES AND CATEGORY)
const validateEventUpdate = (req, res, next) => {
  const errors = [];

  // Get values considering array notation
  const title = getValue(req.body, 'title');
  const description = getValue(req.body, 'description');
  const category = getValue(req.body, 'category');
  const city = getValue(req.body, 'city');
  const date = getValue(req.body, 'date');
  const time = getValue(req.body, 'time');
  const endTime = getValue(req.body, 'endTime');
  const price = getValue(req.body, 'price');
  const capacity = getValue(req.body, 'capacity');
  const status = getValue(req.body, 'status');

  // If updating to published status, validate all required fields
  const isPublishing = status === 'published';

  // Title validation (if provided)
  if (title !== undefined) {
    if (title.trim().length < 5) {
      errors.push("Title must be at least 5 characters long");
    }
    if (title.length > 200) {
      errors.push("Title must not exceed 200 characters");
    }
  }

  // Description validation (if provided)
  if (description !== undefined) {
    if (isPublishing && description.trim().length < 50) {
      errors.push("Description must be at least 50 characters long to publish");
    } else if (description.trim().length > 0 && description.trim().length < 50) {
      errors.push("Description must be at least 50 characters long");
    }
    if (description.length > 5000) {
      errors.push("Description must not exceed 5000 characters");
    }
  }

  // Category validation (if provided)
  if (category !== undefined) {
    if (!VALID_CATEGORIES.includes(category)) {
      errors.push(
        `Category must be one of: ${VALID_CATEGORIES.join(", ")}`
      );
    }
  }

  // City/State validation (if provided)
  if (city !== undefined) {
    if (!VALID_STATES.includes(city)) {
      errors.push(`State must be one of: ${VALID_STATES.join(", ")}`);
    }
  }

  // Date validation (if provided)
  if (date !== undefined) {
    const eventDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isNaN(eventDate.getTime())) {
      errors.push("Invalid date format");
    } else if (status !== 'draft') {
      // Only validate future date if not a draft
      eventDate.setHours(0, 0, 0, 0);
      if (eventDate < today) {
        errors.push("Event date must be in the future");
      }
    }
  }

  // Time validation (if provided)
  if (time !== undefined && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
    errors.push("Valid time is required (HH:MM format)");
  }

  if (endTime !== undefined && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
    errors.push("Valid end time is required (HH:MM format)");
  }

  // Validate time order if both are provided
  if (time && endTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time) && /^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
    const [startHour, startMin] = time.split(":").map(Number);
    const [endHour, endMin] = endTime.split(":").map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (endMinutes <= startMinutes) {
      errors.push("End time must be after start time");
    }
  }

  // Price validation (if provided)
  if (price !== undefined) {
    const priceNum = safeParseNumber(price, 0);
    if (priceNum < 0) {
      errors.push("Price must be a non-negative number");
    }
  }

  // Capacity validation (if provided)
  if (capacity !== undefined) {
    const capacityNum = safeParseNumber(capacity, 1);
    if (capacityNum < 1) {
      errors.push("Capacity must be at least 1");
    }
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate booking data
const validateBooking = (req, res, next) => {
  const { quantity, ticketType, ticketBookings } = req.body;

  const errors = [];

  // Support both single booking and multiple bookings
  if (ticketBookings && Array.isArray(ticketBookings)) {
    // Multiple ticket types
    let totalQuantity = 0;
    
    for (const booking of ticketBookings) {
      const { ticketType: bookingType, quantity: bookingQuantity } = booking;
      
      if (!bookingType) {
        errors.push("Each booking must have a ticket type");
        continue;
      }

      if (!bookingQuantity) {
        errors.push(`Quantity is required for ${bookingType} tickets`);
        continue;
      }

      const qty = safeParseNumber(bookingQuantity, 0);
      if (qty < 1) {
        errors.push(`Quantity for ${bookingType} must be at least 1`);
      }
      if (qty > 10) {
        errors.push(`Cannot book more than 10 ${bookingType} tickets at once`);
      }

      totalQuantity += qty;

      if (!["Regular", "VIP", "VVIP", "Free"].includes(bookingType)) {
        errors.push(`Ticket type must be Regular, VIP, VVIP, or Free. Received: ${bookingType}`);
      }
    }

    if (totalQuantity > 20) {
      errors.push("Cannot book more than 20 tickets total in one transaction");
    }

  } else {
    // Single ticket type (legacy)
    if (quantity !== undefined) {
      const qty = safeParseNumber(quantity, 0);
      if (qty < 1) {
        errors.push("Quantity must be at least 1");
      }
      if (qty > 10) {
        errors.push("Cannot book more than 10 tickets at once");
      }
    }

    if (ticketType && !["Regular", "VIP", "VVIP", "Free"].includes(ticketType)) {
      errors.push("Ticket type must be Regular, VIP, VVIP, or Free");
    }
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate MongoDB ObjectId
const validateObjectId = (req, res, next) => {
  const { id } = req.params;

  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new ErrorResponse("Invalid ID format", 400));
  }

  next();
};

// Validate query parameters for filtering
const validateQueryParams = (req, res, next) => {
  const errors = [];

  // Pagination
  if (req.query.page) {
    const page = safeParseNumber(req.query.page, 1);
    if (page < 1) {
      errors.push("Page must be a positive integer");
    }
  }

  if (req.query.limit) {
    const limit = safeParseNumber(req.query.limit, 12);
    if (limit < 1 || limit > 100) {
      errors.push("Limit must be between 1 and 100");
    }
  }

  // Price range
  if (req.query.minPrice) {
    const minPrice = safeParseNumber(req.query.minPrice, 0);
    if (minPrice < 0) {
      errors.push("Minimum price must be a non-negative number");
    }
  }

  if (req.query.maxPrice) {
    const maxPrice = safeParseNumber(req.query.maxPrice, 0);
    if (maxPrice < 0) {
      errors.push("Maximum price must be a non-negative number");
    }
  }

  // Date range
  if (req.query.startDate) {
    const startDate = new Date(req.query.startDate);
    if (isNaN(startDate.getTime())) {
      errors.push("Invalid start date format");
    }
  }

  if (req.query.endDate) {
    const endDate = new Date(req.query.endDate);
    if (isNaN(endDate.getTime())) {
      errors.push("Invalid end date format");
    }
  }

  // Sort
  if (req.query.sort) {
    const validSorts = ["date", "-date", "price", "-price", "popular", "newest", "eventDate", "-eventDate", "purchaseDate", "-purchaseDate"];
    if (!validSorts.includes(req.query.sort)) {
      errors.push(
        `Sort must be one of: ${validSorts.join(", ")}`
      );
    }
  }

  // Status validation (for organizers viewing their events)
  if (req.query.status) {
    const validStatuses = ["draft", "published", "cancelled", "completed", "postponed", "confirmed", "used", "cancelled", "expired"];
    if (!validStatuses.includes(req.query.status)) {
      errors.push(
        `Status must be one of: ${validStatuses.join(", ")}`
      );
    }
  }

  // Ticket type validation
  if (req.query.ticketType) {
    const validTicketTypes = ["Regular", "VIP", "VVIP", "Free", "all"];
    if (!validTicketTypes.includes(req.query.ticketType)) {
      errors.push(
        `Ticket type must be one of: ${validTicketTypes.join(", ")}`
      );
    }
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Sanitize input - Updated to handle arrays
const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== "string") return str;
    return str.replace(/<[^>]*>/g, "").trim();
  };

  const sanitizeValue = (value) => {
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    if (typeof value === 'string') {
      return sanitizeString(value);
    }
    if (value && typeof value === 'object') {
      const sanitized = {};
      for (const key in value) {
        sanitized[key] = sanitizeValue(value[key]);
      }
      return sanitized;
    }
    return value;
  };

  // Sanitize body
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      req.body[key] = sanitizeValue(req.body[key]);
    });
  }

  // Sanitize query
  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      req.query[key] = sanitizeValue(req.query[key]);
    });
  }

  next();
};

// Validate registration data
const validateRegistration = (req, res, next) => {
  const {
    firstName,
    lastName,
    userName,
    email,
    password,
    role,
    phoneNumber,
  } = req.body;

  const errors = [];

  // First name validation
  if (!firstName || firstName.trim().length < 2) {
    errors.push("First name must be at least 2 characters long");
  }
  if (firstName && firstName.length > 50) {
    errors.push("First name must not exceed 50 characters");
  }

  // Last name validation
  if (!lastName || lastName.trim().length < 2) {
    errors.push("Last name must be at least 2 characters long");
  }
  if (lastName && lastName.length > 50) {
    errors.push("Last name must not exceed 50 characters");
  }

  // Username validation
  if (!userName || userName.trim().length < 3) {
    errors.push("Username must be at least 3 characters long");
  }
  if (userName && userName.length > 30) {
    errors.push("Username must not exceed 30 characters");
  }
  if (userName && !/^[a-zA-Z0-9_]+$/.test(userName)) {
    errors.push("Username can only contain letters, numbers, and underscores");
  }

  // Email validation
  if (!email) {
    errors.push("Email is required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Please provide a valid email address");
  }

  // Password validation
  if (!password) {
    errors.push("Password is required");
  } else if (password.length < 6) {
    errors.push("Password must be at least 6 characters long");
  }
  if (password && password.length > 128) {
    errors.push("Password must not exceed 128 characters");
  }

  // Role validation
  if (role) {
    const validRoles = ["attendee", "organizer"];
    if (!validRoles.includes(role)) {
      errors.push("Role must be either 'attendee' or 'organizer'");
    }
  }

  // Phone number validation (if provided)
  if (phoneNumber && !/^\+?[1-9]\d{1,14}$/.test(phoneNumber.replace(/[\s-]/g, ""))) {
    errors.push("Please provide a valid phone number");
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate login data
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  const errors = [];

  if (!email) {
    errors.push("Email is required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Please provide a valid email address");
  }

  if (!password) {
    errors.push("Password is required");
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate password update
const validatePasswordUpdate = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  const errors = [];

  if (!currentPassword) {
    errors.push("Current password is required");
  }

  if (!newPassword) {
    errors.push("New password is required");
  } else if (newPassword.length < 6) {
    errors.push("New password must be at least 6 characters long");
  } else if (newPassword.length > 128) {
    errors.push("New password must not exceed 128 characters");
  }

  if (currentPassword && newPassword && currentPassword === newPassword) {
    errors.push("New password must be different from current password");
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate password reset
const validatePasswordReset = (req, res, next) => {
  const { newPassword } = req.body;

  const errors = [];

  if (!newPassword) {
    errors.push("New password is required");
  } else if (newPassword.length < 6) {
    errors.push("Password must be at least 6 characters long");
  } else if (newPassword.length > 128) {
    errors.push("Password must not exceed 128 characters");
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate ticket transfer
const validateTicketTransfer = (req, res, next) => {
  const { newUserId, newUserEmail } = req.body;

  const errors = [];

  if (!newUserId && !newUserEmail) {
    errors.push("Either newUserId or newUserEmail is required");
  }

  if (newUserId && !newUserId.match(/^[0-9a-fA-F]{24}$/)) {
    errors.push("Invalid new user ID format");
  }

  if (newUserEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUserEmail)) {
    errors.push("Please provide a valid email address for the new user");
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate location data
const validateLocationData = (req, res, next) => {
  const { latitude, longitude, accuracy } = req.body;

  const errors = [];

  if (latitude === undefined || longitude === undefined) {
    errors.push("Latitude and longitude are required");
  } else {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push("Latitude must be a valid number between -90 and 90");
    }
    
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push("Longitude must be a valid number between -180 and 180");
    }
  }

  if (accuracy !== undefined) {
    const acc = parseFloat(accuracy);
    if (isNaN(acc) || acc < 0) {
      errors.push("Accuracy must be a non-negative number");
    }
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate event ownership
const validateEventOwnership = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Check if user is the organizer
    const eventOrganizerId =
      event.organizer._id?.toString() || event.organizer.toString();
    const currentUserId =
      req.user._id?.toString() ||
      req.user.id?.toString() ||
      req.user.userId?.toString();

    if (
      eventOrganizerId !== currentUserId &&
      req.user.role !== "superadmin"
    ) {
      return next(
        new ErrorResponse("Not authorized to access this event", 403)
      );
    }

    req.event = event;
    next();
  } catch (error) {
    next(error);
  }
};

// Validate event is published (for booking operations)
const validatePublished = (req, res, next) => {
  if (req.event.status !== "published") {
    return next(new ErrorResponse("Event is not available for booking", 400));
  }
  next();
};

// Validate event date is in future (skip for drafts in editing)
const validateFutureEvent = (req, res, next) => {
  // Skip validation for draft events
  if (req.event.status === "draft") {
    return next();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(req.event.date);
  eventDate.setHours(0, 0, 0, 0);

  if (eventDate < today) {
    return next(new ErrorResponse("Event has already passed", 400));
  }
  next();
};

// Validate event capacity for booking
const validateCapacity = async (req, res, next) => {
  try {
    const { quantity = 1, ticketType = "Regular", ticketBookings } = req.body;
    const event = req.event;

    // Handle multiple ticket bookings
    if (ticketBookings && Array.isArray(ticketBookings)) {
      for (const booking of ticketBookings) {
        const { ticketType: bookingType, quantity: bookingQuantity } = booking;
        const parsedQuantity = safeParseNumber(bookingQuantity, 0);

        if (event.ticketTypes && event.ticketTypes.length > 0) {
          const selectedTicket = event.ticketTypes.find(
            (tt) => tt.name === bookingType
          );

          if (!selectedTicket) {
            return next(
              new ErrorResponse(`Ticket type '${bookingType}' not found`, 400)
            );
          }

          // Ensure availableTickets is a valid number
          const availableTickets = safeParseNumber(selectedTicket.availableTickets, 0);
          if (availableTickets < parsedQuantity) {
            return next(
              new ErrorResponse(`Only ${availableTickets} ${bookingType} tickets available`, 400)
            );
          }
        } else {
          // Legacy system
          const availableTickets = safeParseNumber(event.availableTickets, 0);
          if (availableTickets < parsedQuantity) {
            return next(new ErrorResponse(`Only ${availableTickets} tickets available`, 400));
          }
        }
      }
    } else {
      // Single ticket booking (legacy)
      const parsedQuantity = safeParseNumber(quantity, 0);

      if (event.ticketTypes && event.ticketTypes.length > 0) {
        const selectedTicket = event.ticketTypes.find(
          (tt) => tt.name === ticketType
        );

        if (!selectedTicket) {
          return next(
            new ErrorResponse(`Ticket type '${ticketType}' not found`, 400)
          );
        }

        const availableTickets = safeParseNumber(selectedTicket.availableTickets, 0);
        if (availableTickets < parsedQuantity) {
          return next(
            new ErrorResponse(`Only ${availableTickets} ${ticketType} tickets available`, 400)
          );
        }
      } else {
        // Legacy system
        const availableTickets = safeParseNumber(event.availableTickets, 0);
        if (availableTickets < parsedQuantity) {
          return next(new ErrorResponse(`Only ${availableTickets} tickets available`, 400));
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Validate event can be published (all required fields present)
const validateCanPublish = async (req, res, next) => {
  try {
    const event = req.event || (await Event.findById(req.params.id));

    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // If not trying to publish, skip validation
    if (req.body.status !== "published") {
      return next();
    }

    const errors = [];

    // Check all required fields for publishing
    if (!event.description && !req.body.description) {
      errors.push("Description is required to publish");
    }
    if (!event.category && !req.body.category) {
      errors.push("Category is required to publish");
    }
    if (!event.date && !req.body.date) {
      errors.push("Event date is required to publish");
    }
    if (!event.time && !req.body.time) {
      errors.push("Start time is required to publish");
    }
    if (!event.endTime && !req.body.endTime) {
      errors.push("End time is required to publish");
    }
    if (!event.venue && !req.body.venue) {
      errors.push("Venue is required to publish");
    }
    if (!event.address && !req.body.address) {
      errors.push("Address is required to publish");
    }
    if (!event.city && !req.body.city) {
      errors.push("City/State is required to publish");
    }

    // Check pricing
    const hasTicketTypes =
      event.ticketTypes?.length > 0 ||
      (req.body.ticketTypes &&
        JSON.parse(req.body.ticketTypes || "[]").length > 0);

    if (!hasTicketTypes) {
      if (
        (!event.price && !req.body.price) ||
        (!event.capacity && !req.body.capacity)
      ) {
        errors.push("Price and capacity are required to publish");
      }
    }

    if (errors.length > 0) {
      return next(
        new ErrorResponse(`Cannot publish event: ${errors.join(", ")}`, 400)
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Add virtual fields to response
const addVirtualFields = (req, res, next) => {
  const originalJson = res.json;

  res.json = function (data) {
    if (data.success && data.data) {
      if (Array.isArray(data.data)) {
        // Handle array of events
        data.data = data.data.map((event) => ({
          ...(event.toObject ? event.toObject() : event),
          eventUrl: `/event/${event.slug || event._id}`,
          isAvailable: isEventAvailable(event),
          isSoldOut: isEventSoldOut(event),
          totalCapacity: getTotalCapacity(event),
          totalAvailableTickets: getTotalAvailableTickets(event),
          attendancePercentage: getAttendancePercentage(event),
          daysUntilEvent: getDaysUntilEvent(event),
          priceRange: getPriceRange(event),
          isDraft: event.status === "draft",
        }));
      } else if (data.data.toObject) {
        // Handle single event
        const event = data.data;
        data.data = {
          ...event.toObject(),
          eventUrl: `/event/${event.slug || event._id}`,
          isAvailable: isEventAvailable(event),
          isSoldOut: isEventSoldOut(event),
          totalCapacity: getTotalCapacity(event),
          totalAvailableTickets: getTotalAvailableTickets(event),
          attendancePercentage: getAttendancePercentage(event),
          daysUntilEvent: getDaysUntilEvent(event),
          priceRange: getPriceRange(event),
          isDraft: event.status === "draft",
        };
      }
    }
    originalJson.call(this, data);
  };
  next();
};

// Check if event is available (drafts are never available)
const isEventAvailable = (event) => {
  // Drafts are never available for booking
  if (event.status === "draft") {
    return false;
  }

  const now = new Date();
  const isFutureDate = new Date(event.date) > now;
  const isPublished = event.status === "published";

  if (event.ticketTypes && event.ticketTypes.length > 0) {
    const hasAvailableTickets = event.ticketTypes.some(
      (tt) => tt.availableTickets > 0
    );
    return hasAvailableTickets && isPublished && isFutureDate;
  }
  return event.availableTickets > 0 && isPublished && isFutureDate;
};

// Check if event is sold out
const isEventSoldOut = (event) => {
  // Drafts can't be sold out
  if (event.status === "draft") {
    return false;
  }

  if (event.ticketTypes && event.ticketTypes.length > 0) {
    return event.ticketTypes.every((tt) => tt.availableTickets === 0);
  }
  return event.availableTickets === 0;
};

// Get total capacity
const getTotalCapacity = (event) => {
  if (event.ticketTypes && event.ticketTypes.length > 0) {
    return event.ticketTypes.reduce((sum, tt) => sum + tt.capacity, 0);
  }
  return event.capacity || 0;
};

// Get total available tickets
const getTotalAvailableTickets = (event) => {
  if (event.ticketTypes && event.ticketTypes.length > 0) {
    return event.ticketTypes.reduce(
      (sum, tt) => sum + tt.availableTickets,
      0
    );
  }
  return event.availableTickets || 0;
};

// Get attendance percentage
const getAttendancePercentage = (event) => {
  const totalCap = getTotalCapacity(event);
  if (totalCap === 0) return 0;
  return Math.round((event.totalAttendees / totalCap) * 100);
};

// Get days until event
const getDaysUntilEvent = (event) => {
  // Return null for drafts without dates
  if (!event.date) {
    return null;
  }

  const now = new Date();
  const eventDate = new Date(event.date);
  const diffTime = eventDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};

// Get price range
const getPriceRange = (event) => {
  if (event.ticketTypes && event.ticketTypes.length > 0) {
    const prices = event.ticketTypes.map((tt) => tt.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    return minPrice === maxPrice
      ? minPrice
      : { min: minPrice, max: maxPrice };
  }
  return event.price || 0;
};

// Check if event is editable (only drafts and future published events)
const isEventEditable = (event) => {
  if (event.status === "draft") {
    return true;
  }

  if (event.status === "published") {
    const now = new Date();
    const eventDate = new Date(event.date);
    return eventDate > now;
  }

  return false;
};

// Filter out drafts for public queries
const filterPublicEvents = (req, res, next) => {
  // If user is not authenticated or not an organizer, filter drafts
  if (!req.user || req.user.role !== "organizer") {
    req.query.status = "published";
  }
  next();
};

// Validate user is organizer
const validateOrganizer = (req, res, next) => {
  if (req.user.role !== "organizer" && req.user.role !== "superadmin") {
    return next(new ErrorResponse("Only organizers can perform this action", 403));
  }
  next();
};

// Validate user is attendee
const validateAttendee = (req, res, next) => {
  if (req.user.role !== "attendee" && req.user.role !== "superadmin") {
    return next(new ErrorResponse("Only attendees can perform this action", 403));
  }
  next();
};

// Validate ticket ownership
const validateTicketOwnership = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    // Check if user is ticket owner
    if (ticket.userId.toString() !== userId.toString() && req.user.role !== "superadmin") {
      return next(new ErrorResponse("Not authorized to access this ticket", 403));
    }

    req.ticket = ticket;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateEventCreation,
  validateEventUpdate,
  validateBooking,
  validateObjectId,
  validateQueryParams,
  sanitizeInput,
  validateRegistration,
  validateLogin,
  validatePasswordUpdate,
  validatePasswordReset,
  validateTicketTransfer,
  validateLocationData,
  validateEventOwnership,
  validatePublished,
  validateFutureEvent,
  validateCapacity,
  validateCanPublish,
  addVirtualFields,
  isEventAvailable,
  isEventSoldOut,
  getTotalCapacity,
  getTotalAvailableTickets,
  getAttendancePercentage,
  getDaysUntilEvent,
  getPriceRange,
  isEventEditable,
  filterPublicEvents,
  validateOrganizer,
  validateAttendee,
  validateTicketOwnership,
  VALID_CATEGORIES,
  VALID_STATES,
  safeParseNumber,
  parseArray,
  getValue
};