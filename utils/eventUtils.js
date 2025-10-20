const eventUtils = {
  // Generate slug for event
  generateSlug: (title) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") + `-${Date.now()}`;
  },

  // Validate event time
  validateEventTime: (time, endTime) => {
    try {
      const [startHour, startMin] = time.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);

      // Validate time components
      if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
        throw new Error("Invalid time format");
      }

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (endMinutes <= startMinutes) {
        throw new Error("End time must be after start time");
      }
      return true;
    } catch (error) {
      throw new Error("Invalid time format");
    }
  },

  // Initialize ticket types
  initializeTicketTypes: (ticketTypes) => {
    if (ticketTypes && ticketTypes.length > 0) {
      return ticketTypes.map(ticketType => ({
        ...ticketType,
        availableTickets: ticketType.availableTickets === undefined 
          ? ticketType.capacity 
          : ticketType.availableTickets
      }));
    }
    return ticketTypes;
  },

  // Set default thumbnail
  setDefaultThumbnail: (images) => {
    return images && images.length > 0 ? images[0].url : "";
  },

  // Virtual field getters
  getVirtualFields: (event) => {
    return {
      eventUrl: `/event/${event.slug || event._id}`,
      isAvailable: eventUtils.isEventAvailable(event),
      isSoldOut: eventUtils.isEventSoldOut(event),
      totalCapacity: eventUtils.getTotalCapacity(event),
      totalAvailableTickets: eventUtils.getTotalAvailableTickets(event),
      attendancePercentage: eventUtils.getAttendancePercentage(event),
      daysUntilEvent: eventUtils.getDaysUntilEvent(event),
      priceRange: eventUtils.getPriceRange(event)
    };
  },

  // Check if event is available
  isEventAvailable: (event) => {
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
  },

  // Check if event is sold out
  isEventSoldOut: (event) => {
    if (event.ticketTypes && event.ticketTypes.length > 0) {
      return event.ticketTypes.every((tt) => tt.availableTickets === 0);
    }
    return event.availableTickets === 0;
  },

  // Get total capacity
  getTotalCapacity: (event) => {
    if (event.ticketTypes && event.ticketTypes.length > 0) {
      return event.ticketTypes.reduce((sum, tt) => sum + tt.capacity, 0);
    }
    return event.capacity || 0;
  },

  // Get total available tickets
  getTotalAvailableTickets: (event) => {
    if (event.ticketTypes && event.ticketTypes.length > 0) {
      return event.ticketTypes.reduce((sum, tt) => sum + tt.availableTickets, 0);
    }
    return event.availableTickets || 0;
  },

  // Get attendance percentage
  getAttendancePercentage: (event) => {
    const totalCap = eventUtils.getTotalCapacity(event);
    if (totalCap === 0) return 0;
    return Math.round((event.totalAttendees / totalCap) * 100);
  },

  // Get days until event
  getDaysUntilEvent: (event) => {
    const now = new Date();
    const eventDate = new Date(event.date);
    const diffTime = eventDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  },

  // Get price range
  getPriceRange: (event) => {
    if (event.ticketTypes && event.ticketTypes.length > 0) {
      const prices = event.ticketTypes.map((tt) => tt.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      return minPrice === maxPrice ? minPrice : { min: minPrice, max: maxPrice };
    }
    return event.price || 0;
  },

  // Format price for display
  formatPrice: (price, currency = "NGN") => {
    const formatter = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return formatter.format(price);
  },

  // Calculate event duration in hours
  calculateDuration: (startTime, endTime) => {
    const [startHour, startMin] = startTime.split(":").map(Number);
    const [endHour, endMin] = endTime.split(":").map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return (endMinutes - startMinutes) / 60;
  }
};

module.exports = eventUtils;