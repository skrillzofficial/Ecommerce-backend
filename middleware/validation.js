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

// Validate event creation data
const validateEventCreation = (req, res, next) => {
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
  } = req.body;

  const errors = [];

  // Title validation
  if (!title || title.trim().length < 5) {
    errors.push("Title must be at least 5 characters long");
  }
  if (title && title.length > 200) {
    errors.push("Title must not exceed 200 characters");
  }

  // Description validation
  if (!description || description.trim().length < 50) {
    errors.push("Description must be at least 50 characters long");
  }
  if (description && description.length > 5000) {
    errors.push("Description must not exceed 5000 characters");
  }

  // Category validation 
  const validCategories = [
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
    "Other"
  ];
  if (!category || !validCategories.includes(category)) {
    errors.push(
      `Category must be one of: ${validCategories.join(", ")}`
    );
  }

  // Date validation
  if (!date) {
    errors.push("Event date is required");
  } else {
    const eventDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isNaN(eventDate.getTime())) {
      errors.push("Invalid date format");
    } else if (eventDate < today) {
      errors.push("Event date must be in the future");
    }
  }

  // Time validation
  if (!time || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
    errors.push("Valid time is required (HH:MM format)");
  }
  if (!endTime || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(endTime)) {
    errors.push("Valid end time is required (HH:MM format)");
  }

  // Venue validation
  if (!venue || venue.trim().length < 3) {
    errors.push("Venue must be at least 3 characters long");
  }

  // Address validation
  if (!address || address.trim().length < 5) {
    errors.push("Address must be at least 5 characters long");
  }

  // City validation 
  const validCities = [
    "Lagos",
    "Abuja",
    "Ibadan",
    "Port Harcourt",
    "Kano",
    "Benin",
    "Enugu",
    "Kaduna",
    "Owerri",
    "Jos",
    "Calabar",
    "Abeokuta",
    "Other"
  ];
  if (!city || !validCities.includes(city)) {
    errors.push(`City must be one of: ${validCities.join(", ")}`);
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
      errors.push("Price is required");
    } else {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        errors.push("Price must be a non-negative number");
      }
      if (priceNum > 10000000) {
        errors.push("Price seems unreasonably high");
      }
    }

    // Capacity validation
    if (!capacity || capacity === '') {
      errors.push("Capacity is required");
    } else {
      const capacityNum = parseInt(capacity);
      if (isNaN(capacityNum) || capacityNum < 1) {
        errors.push("Capacity must be at least 1");
      }
      if (capacityNum > 100000) {
        errors.push("Capacity seems unreasonably high");
      }
    }
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Validate event update data
const validateEventUpdate = (req, res, next) => {
  const errors = [];

  // Get values considering array notation
  const title = getValue(req.body, 'title');
  const description = getValue(req.body, 'description');
  const category = getValue(req.body, 'category');
  const city = getValue(req.body, 'city');
  const date = getValue(req.body, 'date');
  const price = getValue(req.body, 'price');
  const capacity = getValue(req.body, 'capacity');

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
    if (description.trim().length < 50) {
      errors.push("Description must be at least 50 characters long");
    }
    if (description.length > 5000) {
      errors.push("Description must not exceed 5000 characters");
    }
  }

  // Category validation (if provided)
  if (category !== undefined) {
    const validCategories = [
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
      "Other"
    ];
    if (!validCategories.includes(category)) {
      errors.push(
        `Category must be one of: ${validCategories.join(", ")}`
      );
    }
  }

  // City validation (if provided)
  if (city !== undefined) {
    const validCities = [
      "Lagos",
      "Abuja",
      "Ibadan",
      "Port Harcourt",
      "Kano",
      "Benin",
      "Enugu",
      "Kaduna",
      "Owerri",
      "Jos",
      "Calabar",
      "Abeokuta",
      "Other"
    ];
    if (!validCities.includes(city)) {
      errors.push(`City must be one of: ${validCities.join(", ")}`);
    }
  }

  // Date validation (if provided)
  if (date !== undefined) {
    const eventDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isNaN(eventDate.getTime())) {
      errors.push("Invalid date format");
    } else if (eventDate < today) {
      errors.push("Event date must be in the future");
    }
  }

  // Price validation (if provided)
  if (price !== undefined) {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      errors.push("Price must be a non-negative number");
    }
  }

  // Capacity validation (if provided)
  if (capacity !== undefined) {
    const capacityNum = parseInt(capacity);
    if (isNaN(capacityNum) || capacityNum < 1) {
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
  const { quantity } = req.body;

  if (quantity !== undefined) {
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
      return next(new ErrorResponse("Quantity must be at least 1", 400));
    }
    if (qty > 10) {
      return next(
        new ErrorResponse("Cannot book more than 10 tickets at once", 400)
      );
    }
  }

  next();
};

// Validate MongoDB ObjectId
const validateObjectId = (req, res, next) => {
  const { id } = req.params;

  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return next();
  }

  next();
};

// Validate query parameters for filtering
const validateQueryParams = (req, res, next) => {
  const errors = [];

  // Pagination
  if (req.query.page) {
    const page = parseInt(req.query.page);
    if (isNaN(page) || page < 1) {
      errors.push("Page must be a positive integer");
    }
  }

  if (req.query.limit) {
    const limit = parseInt(req.query.limit);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      errors.push("Limit must be between 1 and 100");
    }
  }

  // Price range
  if (req.query.minPrice) {
    const minPrice = parseFloat(req.query.minPrice);
    if (isNaN(minPrice) || minPrice < 0) {
      errors.push("Minimum price must be a non-negative number");
    }
  }

  if (req.query.maxPrice) {
    const maxPrice = parseFloat(req.query.maxPrice);
    if (isNaN(maxPrice) || maxPrice < 0) {
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
    const validSorts = ["date", "-date", "price", "-price", "popular", "newest"];
    if (!validSorts.includes(req.query.sort)) {
      errors.push(
        `Sort must be one of: ${validSorts.join(", ")}`
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
  validatePasswordReset
};