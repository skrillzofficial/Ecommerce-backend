const mongoose = require("mongoose");
const ErrorResponse = require("./errorResponse");

// Validate booking request data
const validateBookingRequest = (bookingData) => {
  if (
    !bookingData ||
    (!bookingData.ticketBookings &&
      (!bookingData.ticketType || !bookingData.quantity))
  ) {
    throw new ErrorResponse("Please provide at least one ticket booking", 400);
  }

  let bookings = [];

  if (bookingData.ticketBookings && Array.isArray(bookingData.ticketBookings)) {
    bookings = bookingData.ticketBookings;
  } else if (bookingData.ticketType && bookingData.quantity) {
    bookings = [
      { ticketType: bookingData.ticketType, quantity: bookingData.quantity },
    ];
  }

  if (bookings.length === 0) {
    throw new ErrorResponse("Invalid booking data format", 400);
  }

  // Validate each booking
  let totalQuantity = 0;

  for (const booking of bookings) {
    const { ticketType, quantity } = booking;

    if (
      !ticketType ||
      typeof ticketType !== "string" ||
      ticketType.trim().length === 0
    ) {
      throw new ErrorResponse("Each booking must have a valid ticketType", 400);
    }

    if (!quantity) {
      throw new ErrorResponse(
        `Quantity is required for ${ticketType} tickets`,
        400
      );
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1) {
      throw new ErrorResponse(
        `Invalid quantity for ${ticketType} tickets`,
        400
      );
    }

    if (parsedQuantity > 10) {
      throw new ErrorResponse(
        `Cannot book more than 10 ${ticketType} tickets at once`,
        400
      );
    }

    totalQuantity += parsedQuantity;
  }

  if (totalQuantity > 20) {
    throw new ErrorResponse(
      "Cannot book more than 20 tickets total per order",
      400
    );
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

    const ticketTypeObj = ticketTypes.find((tt) => tt.name === ticketType);
    if (!ticketTypeObj) {
      throw new ErrorResponse(`Ticket type "${ticketType}" not found`, 400);
    }

    const ticketPrice = Number(ticketTypeObj.price);
    if (isNaN(ticketPrice) || ticketPrice < 0) {
      throw new ErrorResponse(`Invalid price for ${ticketType} tickets`, 400);
    }

    if (ticketPrice > 1000000) {
      throw new ErrorResponse(
        `Price for ${ticketType} tickets is too high`,
        400
      );
    }

    const subtotal = ticketPrice * parsedQuantity;
    totalQuantity += parsedQuantity;
    totalPrice += subtotal;

    ticketDetails.push({
      ticketType,
      ticketTypeId: ticketTypeObj._id,
      quantity: parsedQuantity,
      unitPrice: ticketPrice,
      price: ticketPrice,
      subtotal,
      benefits: ticketTypeObj.benefits || [],
      accessType: ticketTypeObj.accessType || "both",
      requiresApproval: ticketTypeObj.requiresApproval || false,
      approvalQuestions: ticketTypeObj.approvalQuestions || [],
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
      const ticketTypeObj = event.ticketTypes.find(
        (tt) => tt.name === ticketType
      );
      if (!ticketTypeObj) {
        availabilityIssues.push(
          `Ticket type "${ticketType}" not found in ${event.title}`
        );
        continue;
      }

      const availableCount = Number(ticketTypeObj.availableTickets);
      if (availableCount < parsedQuantity) {
        availabilityIssues.push(
          `Only ${availableCount} ${ticketType} ticket(s) available for ${event.title}`
        );
      }
    } else {
      const availableCount = Number(event.availableTickets);
      if (availableCount < parsedQuantity) {
        availabilityIssues.push(
          `Only ${availableCount} ticket(s) available for ${event.title}`
        );
      }
    }
  }

  if (availabilityIssues.length > 0) {
    throw new ErrorResponse(availabilityIssues.join(", "), 400);
  }
};

// Update event availability after booking
const updateEventAvailability = async (event, bookings, options = {}) => {
  for (const booking of bookings) {
    const { ticketType, quantity } = booking;
    const parsedQuantity = parseInt(quantity);

    if (event.ticketTypes && event.ticketTypes.length > 0) {
      const ticketTypeObj = event.ticketTypes.find(
        (tt) => tt.name === ticketType
      );
      if (ticketTypeObj) {
        ticketTypeObj.availableTickets = Math.max(
          0,
          ticketTypeObj.availableTickets - parsedQuantity
        );
      }
    } else {
      event.availableTickets = Math.max(
        0,
        event.availableTickets - parsedQuantity
      );
    }
  }

  if (options.session) {
    await event.save({ session: options.session });
  } else {
    await event.save();
  }
};

// Create tickets for booking
const createTickets = async (event, user, bookings, options = {}) => {
  const Ticket = mongoose.model("Ticket");
  const tickets = [];
  const session = options.session || null;

  for (const booking of bookings) {
    // ✅ CRITICAL FIX: Get price from booking object FIRST, then fallback to event ticket type
    const explicitPrice = booking.price || booking.unitPrice;
    
    // Find ticket type in event
    const ticketType = event.ticketTypes?.find(
      (tt) => tt._id.toString() === booking.ticketTypeId
    ) || {
      name: booking.ticketType || "General",
      price: explicitPrice || event.price || 0,
      benefits: [],
      accessType: booking.accessType || "both",
    };

    // ✅ CRITICAL FIX: Always prioritize price from booking object
    const finalPrice = explicitPrice !== undefined ? explicitPrice : ticketType.price;

    console.log(`Creating ticket: ${ticketType.name}, Price from booking: ${explicitPrice}, Final price: ${finalPrice}`);

    for (let i = 0; i < booking.quantity; i++) {
      try {
        const ticketNumber = `TKT-${Date.now()
          .toString()
          .slice(-8)}-${Math.random()
          .toString(36)
          .substring(2, 6)
          .toUpperCase()}`;

        const qrCode = `QR-${ticketNumber}-${Date.now()}`;
        const barcode = `BC-${ticketNumber}`;
        const securityCode = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();

        const ticketData = {
          // Identification
          ticketNumber,
          qrCode,
          barcode,
          securityCode,

          // Event reference
          eventId: event._id,

          // Event image
          image: {
            url:
              event.image?.url ||
              event.images?.[0]?.url ||
              "https://via.placeholder.com/800x400?text=Event+Ticket",
            publicId:
              event.image?.publicId || event.images?.[0]?.publicId || "default",
          },

          // Event snapshot
          eventName: event.title,
          eventStartDate: event.startDate,
          eventEndDate: event.endDate,
          eventTime: event.time,
          eventEndTime: event.endTime,
          eventVenue: event.venue,
          eventAddress: event.address,
          eventState: event.state,
          eventCity: event.city,
          eventCategory: event.category,
          eventType: event.eventType,
          virtualEventLink: event.virtualEventLink,

          // Ticket type
          ticketType: ticketType.name,
          ticketTypeId: ticketType._id || booking.ticketTypeId,
          accessType: ticketType.accessType || "both",

          // User information
          userId: user._id,
          userName: user.fullName,
          userEmail: user.email,
          userPhone: user.phone || "",

          // ✅ CRITICAL FIX: Use finalPrice instead of ticketType.price
          ticketPrice: finalPrice,
          quantity: 1,
          totalAmount: finalPrice,
          currency: event.currency || "NGN",

          // Status
          status: "confirmed",

          // Approval system
          approvalStatus: finalPrice === 0 ? "pending" : "not-required",
          approvalQuestions: booking.approvalQuestions
            ? booking.approvalQuestions.map((q) => ({
                question: q.question,
                answer: q.answer || "Not provided",
                required: q.required || false,
              }))
            : [],

          // Purchase info
          purchaseDate: new Date(),
          paymentMethod: finalPrice === 0 ? "free" : "card",
          paymentStatus: "completed",

          // Booking reference
          bookingId: options.bookingId,

          // Organizer
          organizerId: event.organizer,
          organizerName: event.organizerInfo?.name || user.fullName,
          organizerEmail: event.organizerInfo?.email || user.email,
          organizerCompany: event.organizerInfo?.companyName || "",

          // Expiration
          expiresAt: new Date(
            event.startDate.getTime() + 7 * 24 * 60 * 60 * 1000
          ),
        };

        if (ticketData.approvalQuestions.length > 0) {
          ticketData.approvalSubmittedAt = new Date();
        }

        let ticket;
        if (session) {
          ticket = new Ticket(ticketData);
          await ticket.save({ session });
        } else {
          ticket = await Ticket.create(ticketData);
        }

        tickets.push(ticket);
      } catch (error) {
        console.error(
          `Error creating ticket ${i + 1} for ${ticketType.name}:`,
          error
        );
        throw error;
      }
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
  let ticketDetailsHtml = "";

  ticketDetails.forEach((detail) => {
    ticketDetailsHtml += `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${
          detail.ticketType
        } x ${detail.quantity}</td>
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
  validateEventDate,
};