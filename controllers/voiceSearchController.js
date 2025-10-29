const Event = require("../models/event");
const ErrorResponse = require("../utils/errorResponse");
const { parseVoiceQuery } = require("../utils/voiceSearchParser"); // Import your parser

// @desc    Parse voice query and search events
// @route   POST /api/v1/events/voice-search
// @access  Public
const parseVoiceSearch = async (req, res, next) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return next(new ErrorResponse('Voice query is required', 400));
    }

    // Use your existing parser
    const parsedQuery = parseVoiceQuery(query);
    
    // Build MongoDB search query
    const searchQuery = buildEventSearchQuery(parsedQuery);
    
    // Search events with the parsed filters
    const events = await Event.find(searchQuery)
      .populate('organizer', 'firstName lastName userName profilePicture organizerInfo')
      .limit(20)
      .sort({ startDate: 1 });

    // Get event statistics for the search
    const eventStats = await getEventStats(searchQuery);

    res.status(200).json({
      success: true,
      message: 'Voice search completed successfully',
      data: {
        originalQuery: query,
        parsedFilters: parsedQuery,
        events,
        statistics: eventStats,
        resultCount: events.length,
        searchSummary: generateSearchSummary(parsedQuery, events.length)
      }
    });

  } catch (error) {
    next(error);
  }
};

// Build MongoDB query from parsed voice query
const buildEventSearchQuery = (parsedQuery) => {
  const query = {
    status: 'published',
    isActive: true
  };

  // Text search
  if (parsedQuery.search) {
    query.$or = [
      { title: { $regex: parsedQuery.search, $options: 'i' } },
      { description: { $regex: parsedQuery.search, $options: 'i' } },
      { tags: { $in: [new RegExp(parsedQuery.search, 'i')] } }
    ];
  }

  // Category filter
  if (parsedQuery.category) {
    query.category = parsedQuery.category;
  }

  // Location filter
  if (parsedQuery.city) {
    query.$or = [
      { city: { $regex: parsedQuery.city, $options: 'i' } },
      { venue: { $regex: parsedQuery.city, $options: 'i' } },
      { address: { $regex: parsedQuery.city, $options: 'i' } }
    ];
  }

  // Price filters
  if (parsedQuery.maxPrice !== undefined || parsedQuery.minPrice !== undefined) {
    query.$or = [
      { price: {} },
      { 'ticketTypes.price': {} }
    ];

    if (parsedQuery.maxPrice !== undefined) {
      if (parsedQuery.maxPrice === 0) {
        // Free events
        query.$or[0].price = 0;
        query.$or[1]['ticketTypes.price'] = 0;
      } else {
        query.$or[0].price = { $lte: parsedQuery.maxPrice };
        query.$or[1]['ticketTypes.price'] = { $lte: parsedQuery.maxPrice };
      }
    }

    if (parsedQuery.minPrice !== undefined) {
      query.$or[0].price = { ...query.$or[0].price, $gte: parsedQuery.minPrice };
      query.$or[1]['ticketTypes.price'] = { ...query.$or[1]['ticketTypes.price'], $gte: parsedQuery.minPrice };
    }
  }

  // Date filters
  if (parsedQuery.startDate || parsedQuery.endDate) {
    query.startDate = {};
    
    if (parsedQuery.startDate) {
      query.startDate.$gte = new Date(parsedQuery.startDate);
    }
    
    if (parsedQuery.endDate) {
      query.startDate.$lte = new Date(parsedQuery.endDate);
    }
  } else {
    // Default to upcoming events if no date specified
    query.startDate = { $gte: new Date() };
  }

  return query;
};

// Get statistics for the search results
const getEventStats = async (searchQuery) => {
  try {
    const stats = await Event.aggregate([
      { $match: searchQuery },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          totalPrice: { $sum: '$price' },
          averagePrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' }
        }
      }
    ]);

    return stats[0] || {
      totalEvents: 0,
      totalPrice: 0,
      averagePrice: 0,
      minPrice: 0,
      maxPrice: 0
    };
  } catch (error) {
    console.error('Error getting event stats:', error);
    return {
      totalEvents: 0,
      totalPrice: 0,
      averagePrice: 0,
      minPrice: 0,
      maxPrice: 0
    };
  }
};

// Generate human-readable search summary
const generateSearchSummary = (parsedQuery, resultCount) => {
  const parts = [];
  
  if (parsedQuery.search) {
    parts.push(`"${parsedQuery.search}"`);
  }
  
  if (parsedQuery.category) {
    parts.push(parsedQuery.category.toLowerCase());
  }
  
  if (parsedQuery.city) {
    parts.push(`in ${parsedQuery.city}`);
  }
  
  if (parsedQuery.maxPrice === 0) {
    parts.push('free events');
  } else if (parsedQuery.maxPrice) {
    parts.push(`under ₦${parsedQuery.maxPrice.toLocaleString()}`);
  } else if (parsedQuery.minPrice) {
    parts.push(`over ₦${parsedQuery.minPrice.toLocaleString()}`);
  }
  
  if (parsedQuery.startDate) {
    const startDate = new Date(parsedQuery.startDate);
    const endDate = parsedQuery.endDate ? new Date(parsedQuery.endDate) : null;
    
    if (isToday(startDate)) {
      parts.push('today');
    } else if (isTomorrow(startDate)) {
      parts.push('tomorrow');
    } else if (isThisWeekend(startDate, endDate)) {
      parts.push('this weekend');
    } else {
      parts.push(`from ${startDate.toLocaleDateString()}`);
      if (endDate) {
        parts.push(`to ${endDate.toLocaleDateString()}`);
      }
    }
  }
  
  const summary = parts.length > 0 
    ? `Found ${resultCount} events ${parts.join(' ')}`
    : `Found ${resultCount} events`;
  
  return summary;
};

// Date helper functions
const isToday = (date) => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

const isTomorrow = (date) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.toDateString() === tomorrow.toDateString();
};

const isThisWeekend = (startDate, endDate) => {
  const startDay = startDate.getDay();
  const isSaturday = startDay === 6;
  const isSunday = startDay === 0;
  const isWeekendRange = endDate && (endDate.getTime() - startDate.getTime()) <= 2 * 24 * 60 * 60 * 1000;
  
  return (isSaturday || isSunday) && isWeekendRange;
};

// @desc    Get voice search suggestions
// @route   GET /api/v1/events/voice-search/suggestions
// @access  Public
const getVoiceSuggestions = async (req, res, next) => {
  try {
    const { query } = req.query;

    if (!query) {
      return next(new ErrorResponse('Query parameter is required', 400));
    }

    const parsedQuery = parseVoiceQuery(query);
    
    // Get popular categories matching the query
    const categories = await Event.aggregate([
      {
        $match: {
          status: 'published',
          isActive: true,
          $or: [
            { title: { $regex: query, $options: 'i' } },
            { category: { $regex: query, $options: 'i' } }
          ]
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Get popular locations
    const locations = await Event.aggregate([
      {
        $match: {
          status: 'published',
          isActive: true,
          city: { $exists: true, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$city',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Get popular event types
    const eventTypes = await Event.aggregate([
      {
        $match: {
          status: 'published',
          isActive: true,
          eventType: { $exists: true, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$eventType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 3 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        originalQuery: query,
        parsedQuery,
        suggestions: {
          categories: categories.map(cat => ({ name: cat._id, count: cat.count })),
          locations: locations.map(loc => ({ name: loc._id, count: loc.count })),
          eventTypes: eventTypes.map(type => ({ name: type._id, count: type.count })),
          popularSearches: [
            "Tech events in Lagos this weekend",
            "Free music concerts",
            "Business networking events",
            "Food festivals in Abuja",
            "Sports events tomorrow"
          ]
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  parseVoiceSearch,
  getVoiceSuggestions
};