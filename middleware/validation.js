const Event = require("../models/event");
const Ticket = require("../models/ticket");
const ErrorResponse = require("../utils/errorResponse");

// Helper function to get value from req.body considering array notation
const getValue = (body, key) => {
  if (body[`${key}[]`] !== undefined) {
    return body[`${key}[]`];
  }
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

// Valid categories (added Lifestyle)
const VALID_CATEGORIES = [
  "Technology", "Business", "Marketing", "Arts", "Health", 
  "Education", "Music", "Food", "Sports", "Entertainment", 
  "Networking", "Lifestyle", "Other"
];

// Valid states (all 36 Nigerian states + FCT)
const VALID_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", 
  "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", 
  "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", 
  "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", 
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", 
  "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"
];

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
    status = "draft",
  } = req.body;

  const errors = [];
  const isPublishing = status === "published";

  // Title validation (ALWAYS REQUIRED)
  if (!title || title.trim().length < 5) {
    errors.push("Title must be at least 5 characters long");
  }
  if (title && title.length > 200) {
    errors.push("Title must not exceed 200 characters");
  }

  // Conditional validation for published events
  if (isPublishing) {
    if (!description || description.trim().length < 50) {
      errors.push("Description must be at least 50 characters long to publish");
    }
    if (description && description.length > 5000) {
      errors.push("Description must not exceed 5000 characters");
    }

    if (!category || !VALID_CATEGORIES.includes(category)) {
      errors.push(`Category is required to publish. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
    }

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

    if (!time || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
      errors.push("Valid start time is required to publish (HH:MM format)");
    }
    if (!endTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
      errors.push("Valid end time is required to publish (HH:MM format)");
    }

    // Validate time order
    if (time && endTime) {
      const [startHour, startMin] = time.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      if (endMinutes <= startMinutes) {
        errors.push("End time must be after start time");
      }
    }

    if (!venue || venue.trim().length < 3) {
      errors.push("Venue must be at least 3 characters long to publish");
    }
    if (venue && venue.length > 200) {
      errors.push("Venue must not exceed 200 characters");
    }

    if (!address || address.trim().length < 5) {
      errors.push("Address must be at least 5 characters long to publish");
    }
    if (address && address.length > 500) {
      errors.push("Address must not exceed 500 characters");
    }

    if (!city || !VALID_STATES.includes(city)) {
      errors.push(`State is required to publish. Must be one of: ${VALID_STATES.join(", ")}`);
    }

    // Check if using ticket types
    const ticketTypes = req.body.ticketTypes;
    let hasTicketTypes = false;
    
    if (ticketTypes) {
      try {
        const parsed = typeof ticketTypes === 'string' ? JSON.parse(ticketTypes) : ticketTypes;
        hasTicketTypes = Array.isArray(parsed) && parsed.length > 0;
      } catch (e) {}
    }

    // Only validate price/capacity if no ticket types
    if (!hasTicketTypes) {
      if (price === undefined || price === null || price === '') {
        errors.push("Price is required to publish");
      } else {
        const priceNum = safeParseNumber(price, 0);
        if (priceNum < 0) errors.push("Price must be a non-negative number");
        if (priceNum > 10000000) errors.push("Price seems unreasonably high");
      }

      if (!capacity || capacity === '') {
        errors.push("Capacity is required to publish");
      } else {
        const capacityNum = safeParseNumber(capacity, 1);
        if (capacityNum < 1) errors.push("Capacity must be at least 1");
        if (capacityNum > 100000) errors.push("Capacity seems unreasonably high");
      }
    }
  } else {
    // Optional validation for drafts
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
      if (isNaN(eventDate.getTime())) errors.push("Invalid date format");
    }
    if (time && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
      errors.push("Invalid time format (HH:MM)");
    }
    if (endTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
      errors.push("Invalid end time format (HH:MM)");
    }
    if (price !== undefined && price !== null && price !== '') {
      const priceNum = safeParseNumber(price, 0);
      if (priceNum < 0) errors.push("Price must be a non-negative number");
    }
    if (capacity !== undefined && capacity !== '') {
      const capacityNum = safeParseNumber(capacity, 1);
      if (capacityNum < 1) errors.push("Capacity must be at least 1");
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

  const isPublishing = status === 'published';

  if (title !== undefined) {
    if (title.trim().length < 5) errors.push("Title must be at least 5 characters long");
    if (title.length > 200) errors.push("Title must not exceed 200 characters");
  }

  if (description !== undefined) {
    if (isPublishing && description.trim().length < 50) {
      errors.push("Description must be at least 50 characters long to publish");
    } else if (description.trim().length > 0 && description.trim().length < 50) {
      errors.push("Description must be at least 50 characters long");
    }
    if (description.length > 5000) errors.push("Description must not exceed 5000 characters");
  }

  if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
    errors.push(`Category must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }

  if (city !== undefined && !VALID_STATES.includes(city)) {
    errors.push(`State must be one of: ${VALID_STATES.join(", ")}`);
  }

  if (date !== undefined) {
    const eventDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isNaN(eventDate.getTime())) {
      errors.push("Invalid date format");
    } else if (status !== 'draft') {
      eventDate.setHours(0, 0, 0, 0);
      if (eventDate < today) errors.push("Event date must be in the future");
    }
  }

  if (time !== undefined && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
    errors.push("Valid time is required (HH:MM format)");
  }

  if (endTime !== undefined && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
    errors.push("Valid end time is required (HH:MM format)");
  }

  if (time && endTime) {
    const [startHour, startMin] = time.split(":").map(Number);
    const [endHour, endMin] = endTime.split(":").map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (endMinutes <= startMinutes) errors.push("End time must be after start time");
  }

  if (price !== undefined) {
    const priceNum = safeParseNumber(price, 0);
    if (priceNum < 0) errors.push("Price must be a non-negative number");
  }

  if (capacity !== undefined) {
    const capacityNum = safeParseNumber(capacity, 1);
    if (capacityNum < 1) errors.push("Capacity must be at least 1");
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

  if (ticketBookings && Array.isArray(ticketBookings)) {
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
      if (qty < 1) errors.push(`Quantity for ${bookingType} must be at least 1`);
      if (qty > 10) errors.push(`Cannot book more than 10 ${bookingType} tickets at once`);

      totalQuantity += qty;

      if (!["Regular", "VIP", "VVIP", "Free"].includes(bookingType)) {
        errors.push(`Ticket type must be Regular, VIP, VVIP, or Free. Received: ${bookingType}`);
      }
    }

    if (totalQuantity > 20) errors.push("Cannot book more than 20 tickets total in one transaction");

  } else {
    // Single ticket type (legacy)
    if (quantity !== undefined) {
      const qty = safeParseNumber(quantity, 0);
      if (qty < 1) errors.push("Quantity must be at least 1");
      if (qty > 10) errors.push("Cannot book more than 10 tickets at once");
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

  if (req.query.page) {
    const page = safeParseNumber(req.query.page, 1);
    if (page < 1) errors.push("Page must be a positive integer");
  }

  if (req.query.limit) {
    const limit = safeParseNumber(req.query.limit, 12);
    if (limit < 1 || limit > 100) errors.push("Limit must be between 1 and 100");
  }

  if (req.query.minPrice) {
    const minPrice = safeParseNumber(req.query.minPrice, 0);
    if (minPrice < 0) errors.push("Minimum price must be a non-negative number");
  }

  if (req.query.maxPrice) {
    const maxPrice = safeParseNumber(req.query.maxPrice, 0);
    if (maxPrice < 0) errors.push("Maximum price must be a non-negative number");
  }

  if (req.query.startDate) {
    const startDate = new Date(req.query.startDate);
    if (isNaN(startDate.getTime())) errors.push("Invalid start date format");
  }

  if (req.query.endDate) {
    const endDate = new Date(req.query.endDate);
    if (isNaN(endDate.getTime())) errors.push("Invalid end date format");
  }

  if (req.query.sort) {
    const validSorts = ["date", "-date", "price", "-price", "popular", "newest", "eventDate", "-eventDate", "purchaseDate", "-purchaseDate"];
    if (!validSorts.includes(req.query.sort)) {
      errors.push(`Sort must be one of: ${validSorts.join(", ")}`);
    }
  }

  if (req.query.status) {
    const validStatuses = ["draft", "published", "cancelled", "completed", "postponed", "confirmed", "used", "cancelled", "expired"];
    if (!validStatuses.includes(req.query.status)) {
      errors.push(`Status must be one of: ${validStatuses.join(", ")}`);
    }
  }

  if (req.query.ticketType) {
    const validTicketTypes = ["Regular", "VIP", "VVIP", "Free", "all"];
    if (!validTicketTypes.includes(req.query.ticketType)) {
      errors.push(`Ticket type must be one of: ${validTicketTypes.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    return next(new ErrorResponse(errors.join(", "), 400));
  }

  next();
};

// Sanitize input
const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== "string") return str;
    return str.replace(/<[^>]*>/g, "").trim();
  };

  const sanitizeValue = (value) => {
    if (Array.isArray(value)) return value.map(sanitizeValue);
    if (typeof value === 'string') return sanitizeString(value);
    if (value && typeof value === 'object') {
      const sanitized = {};
      for (const key in value) {
        sanitized[key] = sanitizeValue(value[key]);
      }
      return sanitized;
    }
    return value;
  };

  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      req.body[key] = sanitizeValue(req.body[key]);
    });
  }

  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      req.query[key] = sanitizeValue(req.query[key]);
    });
  }

  next();
};

// Validate registration data
const validateRegistration = (req, res, next) => {
  const { firstName, lastName, userName, email, password, role, phoneNumber } = req.body;
  const errors = [];

  if (!firstName || firstName.trim().length < 2) errors.push("First name must be at least 2 characters long");
  if (firstName && firstName.length > 50) errors.push("First name must not exceed 50 characters");

  if (!lastName || lastName.trim().length < 2) errors.push("Last name must be at least 2 characters long");
  if (lastName && lastName.length > 50) errors.push("Last name must not exceed 50 characters");

  if (!userName || userName.trim().length < 3) errors.push("Username must be at least 3 characters long");
  if (userName && userName.length > 30) errors.push("Username must not exceed 30 characters");
  if (userName && !/^[a-zA-Z0-9_]+$/.test(userName)) {
    errors.push("Username can only contain letters, numbers, and underscores");
  }

  if (!email) errors.push("Email is required");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Please provide a valid email address");

  if (!password) errors.push("Password is required");
  else if (password.length < 6) errors.push("Password must be at least 6 characters long");
  if (password && password.length > 128) errors.push("Password must not exceed 128 characters");

  if (role) {
    const validRoles = ["attendee", "organizer"];
    if (!validRoles.includes(role)) errors.push("Role must be either 'attendee' or 'organizer'");
  }

  if (phoneNumber && !/^\+?[1-9]\d{1,14}$/.test(phoneNumber.replace(/[\s-]/g, ""))) {
    errors.push("Please provide a valid phone number");
  }

  if (errors.length > 0) return next(new ErrorResponse(errors.join(", "), 400));
  next();
};

// Validate login data
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email) errors.push("Email is required");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Please provide a valid email address");

  if (!password) errors.push("Password is required");

  if (errors.length > 0) return next(new ErrorResponse(errors.join(", "), 400));
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

// Filter out drafts for public queries
const filterPublicEvents = (req, res, next) => {
  if (!req.user || req.user.role !== "organizer") {
    req.query.status = "published";
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
  validateOrganizer,
  validateAttendee,
  filterPublicEvents,
  VALID_CATEGORIES,
  VALID_STATES,
  safeParseNumber,
  parseArray,
  getValue
};