const Event = require("../models/event");
const Booking = require("../models/booking");
const Ticket = require("../models/ticket");
const User = require("../models/user");
const Transaction = require("../models/transaction");
const ErrorResponse = require("../utils/errorResponse");
const { sendBookingEmail } = require("../utils/sendEmail");
const {
  initializePayment,
  verifyPayment,
} = require("../service/paystackService");
const NotificationService = require("../service/notificationService");
const {
  validateBookingRequest,
  calculateBookingTotals,
  checkTicketAvailability,
  updateEventAvailability,
  createTickets,
  formatEventDate,
  generateBookingEmailTemplate,
  validateEventDate,
} = require("../utils/bookingHelpers");
const mongoose = require("mongoose");

// @desc    Calculate service fee for free events based on capacity
// @route   UTILS
const calculateFreeEventServiceFee = (totalCapacity) => {
  const cap = parseInt(totalCapacity);

  if (cap <= 100) return { min: 2000, max: 3000, range: "₦2,000 – ₦3,000" };
  if (cap <= 500) return { min: 5000, max: 8000, range: "₦5,000 – ₦8,000" };
  if (cap <= 1000)
    return { min: 10000, max: 15000, range: "₦10,000 – ₦15,000" };
  if (cap <= 5000)
    return { min: 20000, max: 35000, range: "₦20,000 – ₦35,000" };
  return { min: 50000, max: null, range: "₦50,000+" };
};

// Helper function to send booking notifications
const sendBookingNotifications = async (
  event,
  user,
  booking,
  tickets,
  totalQuantity,
  totalPrice
) => {
  try {
    // User notification
    await NotificationService.createTicketPurchaseNotification(
      user._id,
      {
        _id: booking._id,
        quantity: totalQuantity,
        totalAmount: totalPrice,
      },
      {
        _id: event._id,
        title: event.title,
        startDate: event.startDate,
      }
    );

    // Organizer notification (if different from user)
    if (event.organizer.toString() !== user._id.toString()) {
      await NotificationService.createSystemNotification(event.organizer, {
        title: " New Ticket Sale",
        message: `${user.fullName} purchased ${totalQuantity} ticket(s) for "${event.title}"`,
        priority: "medium",
        data: {
          eventId: event._id,
          bookingId: booking._id,
          totalAmount: totalPrice,
        },
      });
    }

    // Send booking confirmation email
    const emailTemplate = generateBookingEmailTemplate(
      booking.ticketDetails,
      totalPrice
    );

    await sendBookingEmail({
      fullName: user.fullName,
      email: user.email,
      eventName: event.title,
      eventDate: formatEventDate(event.startDate),
      eventTime: event.time,
      eventVenue: event.venue,
      eventAddress: event.address,
      bookingId: booking.orderNumber,
      ticketDetails: emailTemplate,
      totalAmount: `₦${totalPrice.toLocaleString()}`,
      clientUrl: `${process.env.FRONTEND_URL}/bookings/${booking._id}`,
    });

    // Emit real-time updates
    if (global.io) {
      global.io.emit("new-ticket-purchase", {
        eventId: event._id,
        eventName: event.title,
        tickets: tickets.map((ticket) => ({
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          ticketType: ticket.ticketType,
          quantity: 1,
          totalPrice: ticket.ticketPrice,
        })),
        userName: user.fullName,
        totalAmount: totalPrice,
        purchaseDate: new Date(),
      });

      // Notify organizer
      global.io.to(`organizer-${event.organizer}`).emit("ticket-sold", {
        eventId: event._id,
        eventName: event.title,
        ticketsSold: totalQuantity,
        totalRevenue: totalPrice,
        userName: user.fullName,
        purchaseTime: new Date(),
      });
    }
  } catch (error) {
    console.error("Notification/email error:", error);
  }
};
// In your booking controller - update the completeFreeBooking function
const completeFreeBooking = async (
  event,
  user,
  bookings,
  totalQuantity,
  totalPrice,
  ticketDetails,
  req,
  res,
  next
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Create booking FIRST to get bookingId
    const bookingData = {
      event: event._id,
      user: user._id,
      organizer: event.organizer,
      tickets: [], 
      ticketDetails,
      totalTickets: totalQuantity,
      subtotalAmount: totalPrice,
      serviceFee: 0,
      totalAmount: totalPrice,
      currency: event.currency || "NGN",
      status: "confirmed",
      paymentStatus: "free",
      paymentMethod: "free",
      customerInfo: {
        name: user.fullName,
        email: user.email,
        phone: user.phone || "",
        billingAddress: user.organizerInfo?.address || {},
      },
      eventSnapshot: {
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        time: event.time,
        endTime: event.endTime,
        venue: event.venue,
        address: event.address,
        state: event.state,
        city: event.city,
        eventType: event.eventType,
        virtualEventLink: event.virtualEventLink,
        organizerName: event.organizerInfo?.name || "",
        organizerCompany: event.organizerInfo?.companyName || "",
        refundPolicy: event.refundPolicy || "partial",
        category: event.category,
      },
    };

    const booking = await Booking.create([bookingData], { session });

    // NOW create tickets with the bookingId
    const tickets = await createTickets(event, user, bookings, {
      session,
      bookingId: booking[0]._id, // Pass the booking ID
    });

    // Update booking with ticket references
    booking[0].tickets = tickets.map((t) => t._id);
    await booking[0].save({ session });

    // Update event availability and statistics
    await updateEventAvailability(event, bookings, { session });

    event.totalAttendees = (event.totalAttendees || 0) + totalQuantity;
    event.totalBookings = (event.totalBookings || 0) + 1;
    event.totalRevenue = (event.totalRevenue || 0) + totalPrice;
    await event.save({ session });

    await session.commitTransaction();

    // Send notifications and emails (outside transaction)
    await sendBookingNotifications(
      event,
      user,
      booking[0],
      tickets,
      totalQuantity,
      totalPrice
    );

    res.status(200).json({
      success: true,
      message: "Ticket(s) booked successfully",
      data: {
        booking: {
          id: booking[0]._id,
          orderNumber: booking[0].orderNumber,
          status: booking[0].status,
          totalTickets: totalQuantity,
          totalAmount: totalPrice,
          bookingDate: booking[0].bookingDate,
        },
        tickets: tickets.map((ticket) => ({
          id: ticket._id,
          ticketNumber: ticket.ticketNumber,
          qrCode: ticket.qrCode,
          ticketType: ticket.ticketType,
          accessType: ticket.accessType,
          price: ticket.ticketPrice,
          status: ticket.status,
          approvalStatus: ticket.approvalStatus,
        })),
        event: {
          id: event._id,
          title: event.title,
          startDate: event.startDate,
          venue: event.venue,
          eventType: event.eventType,
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Helper function for paid bookings (attendee perspective)
const initializePaidBooking = async (
  event,
  user,
  bookings,
  totalQuantity,
  totalPrice,
  ticketDetails,
  req,
  res,
  next
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Calculate platform fee (3% for paid events)
    const platformFee = Math.round(totalPrice * 0.03);
    const totalAmount = totalPrice + platformFee;

    // Create pending booking first
    const bookingData = {
      event: event._id,
      user: user._id,
      organizer: event.organizer,
      ticketDetails,
      totalTickets: totalQuantity,
      subtotalAmount: totalPrice,
      serviceFee: platformFee,
      totalAmount: totalAmount,
      currency: event.currency || "NGN",
      status: "pending",
      paymentStatus: "pending",
      paymentMethod: "card",
      customerInfo: {
        name: user.fullName,
        email: user.email,
        phone: user.phone || "",
        billingAddress: user.organizerInfo?.address || {},
      },
      eventSnapshot: {
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        time: event.time,
        endTime: event.endTime,
        venue: event.venue,
        address: event.address,
        state: event.state,
        city: event.city,
        eventType: event.eventType,
        virtualEventLink: event.virtualEventLink,
        organizerName: event.organizerInfo?.name || "",
        organizerCompany: event.organizerInfo?.companyName || "",
        refundPolicy: event.refundPolicy || "partial",
        category: event.category,
      },
    };

    const booking = await Booking.create([bookingData], { session });

    // Generate transaction reference
    const reference = `TXN-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)
      .toUpperCase()}`;

    // Create transaction record
    const transaction = await Transaction.create(
      [
        {
          reference,
          userId: user._id,
          bookingId: booking[0]._id,
          eventId: event._id,
          eventTitle: event.title,
          eventStartDate: event.startDate,
          eventOrganizer: event.organizer,
          subtotalAmount: totalPrice,
          serviceFee: platformFee,
          totalAmount: totalAmount,
          currency: event.currency || "NGN",
          status: "pending",
          paymentMethod: "card",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      ],
      { session }
    );

    await session.commitTransaction();

    // Initialize Paystack payment (outside transaction)
    const paystackResponse = await initializePayment({
      email: user.email,
      amount: totalAmount * 100, // Convert to kobo
      reference: reference,
      metadata: {
        transactionId: transaction[0]._id,
        bookingId: booking[0]._id,
        eventId: event._id,
        userId: user._id,
        ticketDetails: ticketDetails,
      },
      callback_url: `${process.env.FRONTEND_URL}/bookings/${booking[0]._id}/payment/verify`,
    });

    // Update transaction with Paystack data
    transaction[0].authorizationUrl = paystackResponse.data.authorization_url;
    transaction[0].accessCode = paystackResponse.data.access_code;
    await transaction[0].save();

    res.status(200).json({
      success: true,
      message: "Payment initialized successfully",
      data: {
        booking: {
          id: booking[0]._id,
          orderNumber: booking[0].orderNumber,
          status: booking[0].status,
          totalTickets: totalQuantity,
          totalAmount: totalAmount,
          bookingDate: booking[0].bookingDate,
        },
        payment: {
          transactionId: transaction[0]._id,
          reference: transaction[0].reference,
          authorizationUrl: transaction[0].authorizationUrl,
          amount: transaction[0].totalAmount,
          currency: transaction[0].currency,
        },
        requiresPayment: true,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// @desc    Book event tickets (multiple ticket types support)
// @route   POST /api/v1/events/:id/book
// @access  Private
const bookEventTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate booking request
    const bookings = validateBookingRequest(req.body);

    // Get event and validate
    const event = await Event.findById(id);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    if (event.status !== "published") {
      return next(new ErrorResponse("Event is not available for booking", 400));
    }

    // Check if event is in the past
    validateEventDate(event);

    // Check if user already has a booking for this event
    const existingBooking = await Booking.findOne({
      event: id,
      user: req.user.userId,
      status: "confirmed",
    });

    if (existingBooking) {
      return next(new ErrorResponse("You have already booked this event", 400));
    }

    // Get user info
    const user = await User.findById(req.user.userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Check ticket availability
    checkTicketAvailability(event, bookings);

    // Calculate totals
    const ticketTypes =
      event.ticketTypes && event.ticketTypes.length > 0
        ? event.ticketTypes
        : [
            {
              name: "General",
              price: event.price,
              benefits: [],
              accessType: "both",
            },
          ];

    const { totalQuantity, totalPrice, ticketDetails } = calculateBookingTotals(
      bookings,
      ticketTypes
    );

    // Check if this is a free event booking
    const isFreeEventBooking = totalPrice === 0;

    if (isFreeEventBooking) {
      return await completeFreeBooking(
        event,
        user,
        bookings,
        totalQuantity,
        totalPrice,
        ticketDetails,
        req,
        res,
        next
      );
    } else {
      return await initializePaidBooking(
        event,
        user,
        bookings,
        totalQuantity,
        totalPrice,
        ticketDetails,
        req,
        res,
        next
      );
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Initialize payment for existing booking
// @route   POST /api/v1/bookings/:id/pay
// @access  Private
const initializeBookingPayment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate("event")
      .populate("user", "email firstName lastName phone");

    if (!booking) {
      return next(new ErrorResponse("Booking not found", 404));
    }

    if (booking.user._id.toString() !== req.user.userId) {
      return next(
        new ErrorResponse("Not authorized to pay for this booking", 403)
      );
    }

    if (booking.paymentStatus === "completed") {
      return next(new ErrorResponse("Booking already paid", 400));
    }

    if (booking.status !== "pending") {
      return next(
        new ErrorResponse(
          "Booking cannot be paid for in its current status",
          400
        )
      );
    }

    // Check if a pending transaction already exists
    let transaction = await Transaction.findOne({
      bookingId: booking._id,
      status: "pending",
    });

    if (!transaction) {
      const reference = `TXN-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)
        .toUpperCase()}`;

      transaction = await Transaction.create({
        reference,
        userId: req.user.userId,
        bookingId: booking._id,
        eventId: booking.event._id,
        eventTitle: booking.event.title,
        eventStartDate: booking.event.startDate,
        eventOrganizer: booking.event.organizer,
        subtotalAmount: booking.subtotalAmount,
        serviceFee: booking.serviceFee,
        totalAmount: booking.totalAmount,
        currency: booking.currency,
        status: "pending",
        paymentMethod: "card",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
    }

    // Initialize Paystack payment
    const paystackResponse = await initializePayment({
      email: booking.user.email,
      amount: booking.totalAmount * 100,
      reference: transaction.reference,
      metadata: {
        transactionId: transaction._id,
        bookingId: booking._id,
        eventId: booking.event._id,
        userId: req.user.userId,
      },
      callback_url: `${process.env.FRONTEND_URL}/bookings/${booking._id}/payment/verify`,
    });

    // Update transaction with Paystack data
    transaction.authorizationUrl = paystackResponse.data.authorization_url;
    transaction.accessCode = paystackResponse.data.access_code;
    await transaction.save();

    res.status(200).json({
      success: true,
      message: "Payment initialized successfully",
      data: {
        transactionId: transaction._id,
        reference: transaction.reference,
        authorizationUrl: transaction.authorizationUrl,
        amount: transaction.totalAmount,
        currency: transaction.currency,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel booking
// @route   DELETE /api/v1/bookings/:id
// @access  Private
const cancelBooking = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate("event")
      .populate("tickets");

    if (!booking) {
      await session.abortTransaction();
      return next(new ErrorResponse("Booking not found", 404));
    }

    // Check ownership
    if (
      booking.user.toString() !== req.user.userId &&
      req.user.role !== "superadmin"
    ) {
      await session.abortTransaction();
      return next(
        new ErrorResponse("Not authorized to cancel this booking", 403)
      );
    }

    // Check if event has already started
    if (new Date(booking.eventSnapshot.startDate) < new Date()) {
      await session.abortTransaction();
      return next(
        new ErrorResponse("Cannot cancel booking for past events", 400)
      );
    }

    // Check cancellation policy
    const eventDate = new Date(booking.eventSnapshot.startDate);
    const now = new Date();
    const hoursUntilEvent = (eventDate - now) / (1000 * 60 * 60);

    if (hoursUntilEvent < 24) {
      await session.abortTransaction();
      return next(
        new ErrorResponse("Cannot cancel booking within 24 hours of event", 400)
      );
    }

    // Cancel the booking
    await booking.cancelBooking("Customer requested cancellation");

    // Update event statistics and restore availability
    const event = await Event.findById(booking.event);
    if (event) {
      event.totalAttendees = Math.max(
        0,
        event.totalAttendees - booking.totalTickets
      );
      event.totalBookings = Math.max(0, event.totalBookings - 1);
      event.totalRevenue = Math.max(
        0,
        event.totalRevenue - booking.totalAmount
      );

      // Restore ticket availability
      for (const ticketDetail of booking.ticketDetails) {
        if (event.ticketTypes && event.ticketTypes.length > 0) {
          const ticketType = event.ticketTypes.find(
            (tt) => tt.name === ticketDetail.ticketType
          );
          if (ticketType) {
            ticketType.availableTickets += ticketDetail.quantity;
          }
        } else {
          event.availableTickets += ticketDetail.quantity;
        }
      }

      await event.save({ session });
    }

    // Cancel all associated tickets
    await Ticket.updateMany(
      { _id: { $in: booking.tickets } },
      {
        status: "cancelled",
        refundStatus: "requested",
      },
      { session }
    );

    // Update transaction if exists
    const transaction = await Transaction.findOne({ bookingId: booking._id });
    if (transaction && transaction.status === "completed") {
      await transaction.requestRefund("Booking cancelled by customer");
    }

    await session.commitTransaction();

    // Send cancellation notification
    try {
      await NotificationService.createSystemNotification(booking.user, {
        title: "❌ Booking Cancelled",
        message: `Your booking for "${
          booking.eventSnapshot.title
        }" has been cancelled. Refund: ₦${
          booking.refundAmount?.toLocaleString() || 0
        }`,
        priority: "medium",
        data: {
          bookingId: booking._id,
          eventTitle: booking.eventSnapshot.title,
          refundAmount: booking.refundAmount,
        },
      });
    } catch (notificationError) {
      console.error("Notification error:", notificationError);
    }

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: {
        refundAmount: booking.refundAmount,
        cancellationFee: booking.totalAmount - (booking.refundAmount || 0),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// @desc    Get user's bookings (includes both Booking and Ticket collections)
// @route   GET /api/v1/bookings/my-bookings
// @access  Private
const getMyBookings = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10, sort = "-bookingDate" } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query for bookings
    const bookingQuery = { user: req.user.userId };
    if (status) bookingQuery.status = status;

    // Build query for tickets
    const ticketQuery = { userId: req.user.userId };
    if (status) ticketQuery.status = status;

    // Fetch both bookings and tickets in parallel
    const [bookings, tickets] = await Promise.all([
      Booking.find(bookingQuery)
        .populate(
          "event",
          "title startDate endDate time venue city images status eventType virtualEventLink"
        )
        .populate(
          "tickets",
          "ticketNumber status checkedInAt ticketType accessType"
        )
        .sort(sort)
        .lean(),
      Ticket.find(ticketQuery).sort(sort).lean(),
    ]);

    // Combine bookings and tickets
    const combinedData = [];

    // Add all bookings
    bookings.forEach((booking) => {
      combinedData.push({
        _id: booking._id,
        source: "booking",
        event: booking.event,
        tickets: booking.tickets,
        ticketDetails: booking.ticketDetails,
        totalTickets: booking.totalTickets,
        subtotalAmount: booking.subtotalAmount,
        serviceFee: booking.serviceFee,
        totalAmount: booking.totalAmount,
        currency: booking.currency,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        bookingDate: booking.bookingDate || booking.createdAt,
        orderNumber: booking.orderNumber,
        eventSnapshot: booking.eventSnapshot,
        canBeCancelled:
          new Date(
            booking.eventSnapshot?.startDate || booking.event?.startDate
          ) > new Date() && booking.status === "confirmed",
        isUpcoming:
          new Date(
            booking.eventSnapshot?.startDate || booking.event?.startDate
          ) > new Date(),
        hasVirtualAccess: booking.ticketDetails?.some(
          (td) => td.accessType === "virtual" || td.accessType === "both"
        ),
        requiresPayment:
          booking.paymentStatus === "pending" && booking.status === "pending",
      });
    });

    // Add tickets that are NOT already included in bookings
    tickets.forEach((ticket) => {
      const existsInBookings = bookings.some((booking) =>
        booking.tickets?.some((t) => t._id.toString() === ticket._id.toString())
      );

      if (!existsInBookings) {
        combinedData.push({
          _id: ticket._id,
          source: "ticket",
          event: {
            _id: ticket.eventId,
            title: ticket.eventName,
            startDate: ticket.eventDate,
            endDate: ticket.eventDate,
            time: ticket.eventTime,
            endTime: ticket.eventEndTime,
            venue: ticket.eventVenue,
            city: ticket.eventCity,
            images: [],
            status: "published",
            eventType: ticket.eventType || "physical",
          },
          tickets: [
            {
              _id: ticket._id,
              ticketNumber: ticket.ticketNumber,
              status: ticket.status,
              checkedInAt: ticket.checkedInAt,
              ticketType: ticket.ticketType,
              accessType: ticket.accessLevel || "general",
            },
          ],
          ticketDetails: [
            {
              ticketType: ticket.ticketType,
              quantity: ticket.quantity || 1,
              price: ticket.ticketPrice,
              subtotal: ticket.totalAmount || ticket.ticketPrice,
            },
          ],
          totalTickets: ticket.quantity || 1,
          subtotalAmount: ticket.ticketPrice || 0,
          serviceFee: 0,
          totalAmount: ticket.totalAmount || ticket.ticketPrice || 0,
          currency: ticket.currency || "NGN",
          status: ticket.status,
          paymentStatus: ticket.paymentStatus,
          paymentMethod: ticket.paymentMethod,
          bookingDate: ticket.purchaseDate || ticket.createdAt,
          orderNumber: ticket.ticketNumber,
          eventSnapshot: {
            title: ticket.eventName,
            startDate: ticket.eventDate,
            endDate: ticket.eventDate,
            time: ticket.eventTime,
            endTime: ticket.eventEndTime,
            venue: ticket.eventVenue,
            address: ticket.eventAddress,
            state: ticket.eventCity,
            city: ticket.eventCity,
            eventType: ticket.eventType || "physical",
            virtualEventLink: ticket.virtualEventLink || "",
            organizerName: ticket.organizerName,
            organizerCompany: ticket.organizerCompany,
            refundPolicy: ticket.refundPolicy || "partial",
            category: ticket.eventCategory,
          },
          canBeCancelled:
            new Date(ticket.eventDate) > new Date() &&
            ticket.status === "confirmed",
          isUpcoming: new Date(ticket.eventDate) > new Date(),
          hasVirtualAccess:
            ticket.accessLevel === "virtual" || ticket.accessLevel === "both",
          requiresPayment:
            ticket.paymentStatus === "pending" && ticket.status === "pending",
        });
      }
    });

    // Sort combined data by booking date
    combinedData.sort((a, b) => {
      const dateA = new Date(a.bookingDate);
      const dateB = new Date(b.bookingDate);
      return sort.startsWith("-") ? dateB - dateA : dateA - dateB;
    });

    // Apply pagination to combined data
    const total = combinedData.length;
    const paginatedData = combinedData.slice(skip, skip + limitNum);

    res.status(200).json({
      success: true,
      data: {
        bookings: paginatedData,
        pagination: {
          total,
          page: pageNum,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1,
        },
        summary: {
          totalBookings: bookings.length,
          totalTickets: tickets.length,
          totalCombined: total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single booking
// @route   GET /api/v1/bookings/:id
// @access  Private
const getBooking = async (req, res, next) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findOne({
      _id: id,
      user: req.user.userId,
    })
      .populate(
        "event",
        "title startDate endDate time venue city images eventType virtualEventLink"
      )
      .populate(
        "tickets",
        "ticketNumber qrCode status checkedInAt ticketType accessType ticketPrice"
      )
      .populate("organizer", "firstName lastName profilePicture organizerInfo");

    if (!booking) {
      return next(new ErrorResponse("Booking not found", 404));
    }

    // Get transaction if exists
    const transaction = await Transaction.findOne({ bookingId: booking._id });

    res.status(200).json({
      success: true,
      data: {
        booking,
        transaction: transaction || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Check in attendee
// @route   POST /api/v1/events/:eventId/check-in/:ticketId
// @access  Private (Organizer only)
const checkInAttendee = async (req, res, next) => {
  try {
    const { eventId, ticketId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    // Check organizer authorization
    if (
      event.organizer.toString() !== req.user.userId &&
      req.user.role !== "superadmin"
    ) {
      return next(
        new ErrorResponse("Not authorized to check in attendees", 403)
      );
    }

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return next(new ErrorResponse("Ticket not found", 404));
    }

    if (ticket.eventId.toString() !== eventId) {
      return next(
        new ErrorResponse("Ticket does not belong to this event", 400)
      );
    }

    if (ticket.status !== "confirmed") {
      return next(new ErrorResponse("Ticket is not valid for check-in", 400));
    }

    // Check in the ticket
    await ticket.checkIn(req.user.userId, {
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      address: req.body.address,
    });

    res.status(200).json({
      success: true,
      message: "Attendee checked in successfully",
      data: {
        ticket: {
          id: ticket._id,
          ticketNumber: ticket.ticketNumber,
          userName: ticket.userName,
          ticketType: ticket.ticketType,
          checkedInAt: ticket.checkedInAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  bookEventTicket,
  initializeBookingPayment,
  cancelBooking,
  getMyBookings,
  getBooking,
  checkInAttendee,
};
