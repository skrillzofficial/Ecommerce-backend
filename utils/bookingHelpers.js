const ErrorResponse = require("./errorResponse");
const Ticket = require("../models/ticket"); // Added missing import

// Validate booking request data
const validateBookingRequest = (bookingData) => {
  if (!bookingData || (!bookingData.ticketBookings && (!bookingData.ticketType || !bookingData.quantity))) {
    throw new ErrorResponse("Please provide at least one ticket booking", 400);
  }

  let bookings = [];
  
  if (bookingData.ticketBookings && Array.isArray(bookingData.ticketBookings)) {
    bookings = bookingData.ticketBookings;
  } else if (bookingData.ticketType && bookingData.quantity) {
    bookings = [{ ticketType: bookingData.ticketType, quantity: bookingData.quantity }];
  }

  if (bookings.length === 0) {
    throw new ErrorResponse("Invalid booking data format", 400);
  }

  // Validate each booking
  let totalQuantity = 0;
  
  for (const booking of bookings) {
    const { ticketType, quantity } = booking;
    
    if (!ticketType || typeof ticketType !== 'string' || ticketType.trim().length === 0) {
      throw new ErrorResponse("Each booking must have a valid ticketType", 400);
    }

    if (!quantity) {
      throw new ErrorResponse(`Quantity is required for ${ticketType} tickets`, 400);
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1) {
      throw new ErrorResponse(`Invalid quantity for ${ticketType} tickets`, 400);
    }

    if (parsedQuantity > 10) {
      throw new ErrorResponse(`Cannot book more than 10 ${ticketType} tickets at once`, 400);
    }

    totalQuantity += parsedQuantity;
  }

  if (totalQuantity > 20) {
    throw new ErrorResponse("Cannot book more than 20 tickets total per order", 400);
  }

  return bookings;
};

// Calculate booking totals
const calculateBookingTotals = (bookings, ticketTypes) => {
  let totalQuantity = 0;
  let totalPrice = 0;
  const ticketDetails = [];

  for (const booking of bookings) {
    const { ticketType, quantity } = booking;
    const parsedQuantity = parseInt(quantity);

    const ticketTypeObj = ticketTypes.find(tt => tt.name === ticketType);
    if (!ticketTypeObj) {
      throw new ErrorResponse(`Ticket type "${ticketType}" not found`, 400);
    }

    const ticketPrice = Number(ticketTypeObj.price);
    if (isNaN(ticketPrice) || ticketPrice < 0) {
      throw new ErrorResponse(`Invalid price for ${ticketType} tickets`, 400);
    }

    if (ticketPrice > 1000000) { // 1 million Naira max
      throw new ErrorResponse(`Price for ${ticketType} tickets is too high`, 400);
    }

    const subtotal = ticketPrice * parsedQuantity;
    totalQuantity += parsedQuantity;
    totalPrice += subtotal;

    ticketDetails.push({
      ticketType,
      ticketTypeId: ticketTypeObj._id,
      quantity: parsedQuantity,
      unitPrice: ticketPrice,
      subtotal,
      benefits: ticketTypeObj.benefits || [],
      accessType: ticketTypeObj.accessType || "both",
      requiresApproval: ticketTypeObj.requiresApproval || false,
      approvalQuestions: ticketTypeObj.approvalQuestions || []
    });
  }

  return { totalQuantity, totalPrice, ticketDetails };
};

// Check ticket availability
const checkTicketAvailability = (event, bookings) => {
  const availabilityIssues = [];

  for (const booking of bookings) {
    const { ticketType, quantity } = booking;
    const parsedQuantity = parseInt(quantity);

    if (event.ticketTypes && event.ticketTypes.length > 0) {
      const ticketTypeObj = event.ticketTypes.find(tt => tt.name === ticketType);
      if (!ticketTypeObj) {
        availabilityIssues.push(`Ticket type "${ticketType}" not found in ${event.title}`);
        continue;
      }

      const availableCount = Number(ticketTypeObj.availableTickets);
      if (availableCount < parsedQuantity) {
        availabilityIssues.push(`Only ${availableCount} ${ticketType} ticket(s) available for ${event.title}`);
      }
    } else {
      // Legacy system
      const availableCount = Number(event.availableTickets);
      if (availableCount < parsedQuantity) {
        availabilityIssues.push(`Only ${availableCount} ticket(s) available for ${event.title}`);
      }
    }
  }

  if (availabilityIssues.length > 0) {
    throw new ErrorResponse(availabilityIssues.join(", "), 400);
  }
};

// Update event availability after booking
const updateEventAvailability = async (event, bookings) => {
  for (const booking of bookings) {
    const { ticketType, quantity } = booking;
    const parsedQuantity = parseInt(quantity);

    if (event.ticketTypes && event.ticketTypes.length > 0) {
      const ticketTypeObj = event.ticketTypes.find(tt => tt.name === ticketType);
      if (ticketTypeObj) {
        ticketTypeObj.availableTickets = Math.max(0, ticketTypeObj.availableTickets - parsedQuantity);
      }
    } else {
      // Legacy system
      event.availableTickets = Math.max(0, event.availableTickets - parsedQuantity);
    }
  }

  await event.save();
};

// Create individual tickets
const createTickets = async (event, user, bookings) => {
  const tickets = [];

  for (const booking of bookings) {
    const { ticketType, quantity } = booking;
    const parsedQuantity = parseInt(quantity);

    const ticketTypeObj = event.ticketTypes?.find(tt => tt.name === ticketType);

    for (let i = 0; i < parsedQuantity; i++) {
      const ticketData = {
        eventId: event._id,
        eventName: event.title,
        eventDate: event.startDate, // For compatibility
        eventStartDate: event.startDate,
        eventEndDate: event.endDate,
        eventTime: event.time,
        eventEndTime: event.endTime,
        eventVenue: event.venue,
        eventAddress: event.address,
        eventState: event.state,
        eventCity: event.city,
        eventCountry: event.country,
        eventCategory: event.category,
        eventType: event.eventType,
        virtualEventLink: event.virtualEventLink,
        eventCoordinates: event.coordinates,
        userId: user._id,
        userName: user.fullName,
        userEmail: user.email,
        userPhone: user.phone || "",
        ticketType: ticketType,
        ticketPrice: ticketTypeObj ? ticketTypeObj.price : event.price,
        quantity: 1,
        totalAmount: ticketTypeObj ? ticketTypeObj.price : event.price,
        accessType: ticketTypeObj?.accessType || (event.eventType === "virtual" ? "virtual" : "physical"),
        organizerId: event.organizer,
        organizerName: event.organizerInfo?.name || "",
        organizerEmail: event.organizerInfo?.email || "",
        organizerCompany: event.organizerInfo?.companyName || "",
        refundPolicy: event.refundPolicy || "partial",
        status: "confirmed",
        paymentStatus: "completed",
        currency: "NGN"
      };

      // Handle approval requirements
      if (ticketTypeObj?.requiresApproval) {
        ticketData.status = "pending-approval";
        ticketData.requiresApproval = true;
        ticketData.approvalQuestions = ticketTypeObj.approvalQuestions || [];
      }

      const ticket = await Ticket.create(ticketData);
      tickets.push(ticket);
    }
  }

  return tickets;
};

// Format event date for display
const formatEventDate = (date) => {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// Generate email template for booking confirmation
const generateBookingEmailTemplate = (ticketDetails, totalPrice) => {
  let ticketDetailsHtml = '';

  ticketDetails.forEach(detail => {
    ticketDetailsHtml += `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${detail.ticketType} x ${detail.quantity}</td>
        <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #e0e0e0;">₦${detail.unitPrice.toLocaleString()}</td>
        <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #e0e0e0;">₦${detail.subtotal.toLocaleString()}</td>
      </tr>
    `;
  });

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
      <thead>
        <tr style="background-color: #f8f9fa;">
          <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Ticket Type</th>
          <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Unit Price</th>
          <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${ticketDetailsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding: 10px; text-align: right; font-weight: bold; border-top: 2px solid #ddd;">Total:</td>
          <td style="padding: 10px; text-align: right; font-weight: bold; border-top: 2px solid #ddd;">₦${totalPrice.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>
  `;
};

// Validate event date is not in past
const validateEventDate = (event) => {
  if (new Date(event.startDate) < new Date()) {
    throw new ErrorResponse("Cannot book tickets for past events", 400);
  }
};

module.exports = {
  validateBookingRequest,
  calculateBookingTotals,
  checkTicketAvailability,
  updateEventAvailability,
  createTickets,
  formatEventDate,
  generateBookingEmailTemplate,
  validateEventDate
};