const cloudinary = require("cloudinary").v2;
const fs = require("fs");

// Safe number parsing
const safeParseNumber = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

// Safe array parsing from form data
const safeParseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      return value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }
  return [];
};

// Process form data arrays with [] notation
const processFormDataArrays = (body) => {
  const processed = { ...body };
  
  const arrayFields = ['tags', 'includes', 'requirements', 'existingImages', 'imagesToDelete'];
  
  arrayFields.forEach(field => {
    const bracketKey = `${field}[]`;
    if (processed[bracketKey] !== undefined) {
      processed[field] = Array.isArray(processed[bracketKey]) 
        ? processed[bracketKey] 
        : [processed[bracketKey]];
      delete processed[bracketKey];
    }
  });
  
  return processed;
};

// Parse JSON fields from form data
const parseJSONFields = (body, fields) => {
  const parsed = { ...body };
  
  fields.forEach(field => {
    if (parsed[field] && typeof parsed[field] === "string") {
      try {
        parsed[field] = JSON.parse(parsed[field]);
      } catch (e) {
        console.warn(`Failed to parse ${field}:`, e.message);
        parsed[field] = safeParseArray(parsed[field]);
      }
    }
  });
  
  return parsed;
};

// Upload images to Cloudinary
const uploadImages = async (imageFiles, folder = "eventry/events") => {
  const uploadedImages = [];
  
  for (const image of imageFiles) {
    try {
      if (!image.tempFilePath || !fs.existsSync(image.tempFilePath)) {
        throw new Error('Invalid image file');
      }

      const result = await cloudinary.uploader.upload(image.tempFilePath, {
        folder,
        use_filename: true,
        unique_filename: true,
        resource_type: "auto",
        transformation: [
          { width: 1200, height: 600, crop: "limit" },
          { quality: "auto" },
          { format: "auto" },
        ],
      });

      uploadedImages.push({
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format
      });

      if (fs.existsSync(image.tempFilePath)) {
        fs.unlinkSync(image.tempFilePath);
      }
    } catch (uploadError) {
      console.error("Image upload error:", uploadError);
      
      for (const uploadedImg of uploadedImages) {
        try {
          await cloudinary.uploader.destroy(uploadedImg.publicId);
        } catch (cleanupError) {
          console.error("Cleanup error:", cleanupError);
        }
      }
      throw new Error(`Failed to upload images: ${uploadError.message}`);
    }
  }
  
  return uploadedImages;
};

// Delete images from Cloudinary
const deleteImages = async (publicIds) => {
  const deletePromises = publicIds.map(publicId => 
    cloudinary.uploader.destroy(publicId).catch(error => {
      console.error(`Failed to delete image ${publicId}:`, error);
      return { publicId, success: false, error };
    })
  );

  const results = await Promise.all(deletePromises);
  const failedDeletes = results.filter(result => !result.success);
  
  if (failedDeletes.length > 0) {
    console.warn(`Failed to delete ${failedDeletes.length} images`);
  }

  return results;
};

// Validate ticket types
const validateTicketTypes = (ticketTypes) => {
  if (!ticketTypes || !Array.isArray(ticketTypes) || ticketTypes.length === 0) {
    return { isValid: false, error: "Please provide pricing information" };
  }

  for (const [index, ticket] of ticketTypes.entries()) {
    if (!ticket.name || ticket.name.trim().length === 0) {
      return { 
        isValid: false, 
        error: `Ticket type ${index + 1}: Name is required` 
      };
    }

    if (ticket.price === undefined || ticket.price === null) {
      return { 
        isValid: false, 
        error: `Ticket type "${ticket.name}": Price is required` 
      };
    }

    const price = safeParseNumber(ticket.price, -1);
    if (price < 0) {
      return { 
        isValid: false, 
        error: `Ticket type "${ticket.name}": Price must be a non-negative number` 
      };
    }

    if (!ticket.capacity || ticket.capacity === '') {
      return { 
        isValid: false, 
        error: `Ticket type "${ticket.name}": Capacity is required` 
      };
    }

    const capacity = safeParseNumber(ticket.capacity, -1);
    if (capacity < 1) {
      return { 
        isValid: false, 
        error: `Ticket type "${ticket.name}": Capacity must be at least 1` 
      };
    }

    if (ticket.accessType && !['physical', 'virtual', 'both'].includes(ticket.accessType)) {
      return {
        isValid: false,
        error: `Ticket type "${ticket.name}": Access type must be physical, virtual, or both`
      };
    }
  }

  return { isValid: true };
};

// ============================================
// FLEXIBLE: Build event search query supporting BOTH date and startDate
// ============================================
const buildEventSearchQuery = (filters = {}, userRole = null) => {
  const {
    search,
    category,
    city,
    minPrice,
    maxPrice,
    startDate,
    endDate,
    status,
    isFeatured,
    hasFreeTickets,
    isOnline,
    eventType,
    organizer
  } = filters;

  const query = { isActive: true };

  // Show published upcoming events to everyone except organizers viewing their own events
  if (!userRole || userRole !== "organizer") {
    query.status = "published";
    // ✅ FLEXIBLE: Support both date and startDate fields using $or
    query.$or = [
      { date: { $gte: new Date() } },
      { startDate: { $gte: new Date() } }
    ];
  } else if (status) {
    query.status = status;
  }

  // Text search across multiple fields
  if (search && search.trim().length > 0) {
    const searchOr = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { venue: { $regex: search, $options: 'i' } },
      { city: { $regex: search, $options: 'i' } }
    ];
    
    // If $or already exists (from date filter), combine them using $and
    if (query.$or) {
      query.$and = [
        { $or: query.$or },
        { $or: searchOr }
      ];
      delete query.$or;
    } else {
      query.$or = searchOr;
    }
  }

  // Basic filters
  if (category) query.category = category;
  if (city) query.city = city;
  if (eventType) query.eventType = eventType;
  if (isFeatured === "true") query.isFeatured = true;

  // ✅ FLEXIBLE: Date range filter supporting both date and startDate
  if (startDate || endDate) {
    const dateRangeOr = [];
    
    if (startDate && endDate) {
      dateRangeOr.push(
        { date: { $gte: new Date(startDate), $lte: new Date(endDate) } },
        { startDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
      );
    } else if (startDate) {
      dateRangeOr.push(
        { date: { $gte: new Date(startDate) } },
        { startDate: { $gte: new Date(startDate) } }
      );
    } else if (endDate) {
      dateRangeOr.push(
        { date: { $lte: new Date(endDate) } },
        { startDate: { $lte: new Date(endDate) } }
      );
    }

    if (dateRangeOr.length > 0) {
      if (query.$and) {
        query.$and.push({ $or: dateRangeOr });
      } else if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: dateRangeOr }
        ];
        delete query.$or;
      } else {
        query.$or = dateRangeOr;
      }
    }
  }

  // Price range - handle both legacy price and ticket types
  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceQueries = [];

    // Legacy price field
    const legacyQuery = { price: {} };
    if (minPrice !== undefined) legacyQuery.price.$gte = safeParseNumber(minPrice);
    if (maxPrice !== undefined) legacyQuery.price.$lte = safeParseNumber(maxPrice);
    priceQueries.push(legacyQuery);

    // Ticket types price
    const ticketQuery = { "ticketTypes.price": {} };
    if (minPrice !== undefined) ticketQuery["ticketTypes.price"].$gte = safeParseNumber(minPrice);
    if (maxPrice !== undefined) ticketQuery["ticketTypes.price"].$lte = safeParseNumber(maxPrice);
    priceQueries.push(ticketQuery);

    if (priceQueries.length > 0) {
      if (query.$and) {
        query.$and.push({ $or: priceQueries });
      } else if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: priceQueries }
        ];
        delete query.$or;
      } else {
        query.$or = priceQueries;
      }
    }
  }

  // Free tickets filter
  if (hasFreeTickets === "true") {
    const freeTicketQueries = [
      { price: 0 }, 
      { "ticketTypes.price": 0 }
    ];

    if (query.$and) {
      query.$and.push({ $or: freeTicketQueries });
    } else if (query.$or) {
      query.$and = [
        { $or: query.$or },
        { $or: freeTicketQueries }
      ];
      delete query.$or;
    } else {
      query.$or = freeTicketQueries;
    }
  }

  // Online events filter
  if (isOnline === "true") {
    query.eventType = "virtual";
  }

  console.log('🔍 Built Event Query:', JSON.stringify(query, null, 2));
  
  return query;
};

// ✅ FLEXIBLE: Get sort options supporting both date and startDate
const getSortOptions = (sort = "date") => {
  const sortOptions = {
    // Try date first, fallback to startDate
    "date": { date: 1, startDate: 1 },
    "-date": { date: -1, startDate: -1 },
    "price": { price: 1 },
    "-price": { price: -1 },
    "popular": { totalLikes: -1, views: -1 },
    "newest": { createdAt: -1 },
    "oldest": { createdAt: 1 },
    "attendees": { totalAttendees: -1 },
    "name": { title: 1 },
    "-name": { title: -1 }
  };

  return sortOptions[sort] || { date: 1, startDate: 1 };
};

// Calculate service fee for free events
const calculateFreeEventServiceFee = (totalCapacity) => {
  const cap = parseInt(totalCapacity);
  
  if (cap <= 100) return { min: 2000, max: 3000, range: "₦2,000 – ₦3,000" };
  if (cap <= 500) return { min: 5000, max: 8000, range: "₦5,000 – ₦8,000" };
  if (cap <= 1000) return { min: 10000, max: 15000, range: "₦10,000 – ₦15,000" };
  if (cap <= 5000) return { min: 20000, max: 35000, range: "₦20,000 – ₦35,000" };
  return { min: 50000, max: null, range: "₦50,000+" };
};

// Generate event slug
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") + `-${Date.now()}`;
};

module.exports = {
  safeParseNumber,
  safeParseArray,
  processFormDataArrays,
  parseJSONFields,
  uploadImages,
  deleteImages,
  validateTicketTypes,
  buildEventSearchQuery,
  getSortOptions,
  calculateFreeEventServiceFee,
  generateSlug
};