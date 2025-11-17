const Transaction = require("../models/transaction");
const Booking = require("../models/booking");
const Event = require("../models/event");
const User = require("../models/user");
const Ticket = require("../models/ticket");
const {
  initializePayment,
  verifyPayment,
} = require("../service/paystackService");
const ErrorResponse = require("../utils/errorResponse");
const { createTickets } = require("../utils/bookingHelpers");
const { sendBookingEmail } = require("../utils/sendEmail"); // Add this import
const crypto = require("crypto");
const mongoose = require("mongoose");

// Try to import optional services
let NotificationService;
try {
  NotificationService = require("../service/notificationService");
} catch (err) {
  console.log("NotificationService not available");
}

// Helper function to mark transaction as completed
const markTransactionAsCompleted = async (transaction, paymentData) => {
  if (typeof transaction.markAsCompleted === "function") {
    await transaction.markAsCompleted(paymentData);
  } else {
    transaction.status = "completed";
    transaction.paymentDetails = paymentData;
    transaction.completedAt = new Date();
    transaction.paymentMethod = paymentData.channel || "card";
    await transaction.save();
  }
};

// Helper function to mark transaction as failed
const markTransactionAsFailed = async (transaction, reason) => {
  if (typeof transaction.markAsFailed === "function") {
    await transaction.markAsFailed(reason);
  } else {
    transaction.status = "failed";
    transaction.failedAt = new Date();
    transaction.failureReason = reason;
    await transaction.save();
  }
};

// Helper function to update event ticket availability
const updateEventTicketAvailability = async (
  eventId,
  ticketCount,
  operation
) => {
  try {
    if (typeof Event.updateTicketAvailability === "function") {
      await Event.updateTicketAvailability(eventId, ticketCount, operation);
    } else {
      const event = await Event.findById(eventId);
      if (event) {
        if (operation === "decrement") {
          event.availableTickets = Math.max(
            0,
            event.availableTickets - ticketCount
          );
        } else if (operation === "increment") {
          event.availableTickets += ticketCount;
        }
        await event.save();
      }
    }
  } catch (error) {
    console.error("Error updating ticket availability:", error);
  }
};

// Helper function to format event date for email
const formatEventDate = (dateString) => {
  if (!dateString) return 'TBD';
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// Helper function to send booking confirmation for paid events
const sendPaidBookingConfirmation = async (booking, event, user, tickets) => {
  try {
    console.log("🎫 Sending paid booking confirmation for:", user.email);
    console.log("📄 Tickets count for PDF:", tickets.length);

    await sendBookingEmail({
      fullName: user.fullName,
      email: user.email,
      eventName: event.title,
      eventDate: formatEventDate(event.startDate),
      eventTime: event.time,
      eventVenue: event.venue,
      eventAddress: event.address,
      bookingId: booking.orderNumber,
      ticketDetails: tickets, // Pass actual ticket objects for PDF generation
      totalAmount: `₦${booking.totalAmount.toLocaleString()}`,
      clientUrl: `${process.env.FRONTEND_URL}/bookings/${booking._id}`,
    });

    console.log("✅ Paid booking confirmation email sent with PDF tickets");
  } catch (error) {
    console.error("❌ Error sending paid booking confirmation:", error);
    // Don't throw error to avoid breaking the payment flow
  }
};

// @desc    Initialize transaction for booking (for attendees)
// @route   POST /api/v1/transactions/initialize
// @access  Private
const initializeTransaction = async (req, res, next) => {
  try {
    const { bookingId, amount, email, ticketDetails } = req.body;

    if (!bookingId || !amount || !email) {
      return next(
        new ErrorResponse("Booking ID, amount, and email are required", 400)
      );
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > 1000000) {
      return next(new ErrorResponse("Invalid amount", 400));
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      user: req.user.userId,
    });

    if (!booking) {
      return next(new ErrorResponse("Booking not found", 404));
    }

    const transaction = await Transaction.create({
      userId: req.user.userId,
      bookingId: bookingId,
      eventId: booking.event,
      amount: amountNum,
      currency: "NGN",
      type: "event_booking",
      status: "pending",
      paymentMethod: "paystack",
    });

    const paymentData = {
      email: email,
      amount: Math.round(amountNum * 100),
      reference: transaction.reference,
      metadata: {
        bookingId: bookingId,
        userId: req.user.userId,
        ticketDetails: ticketDetails,
      },
    };

    const paymentResponse = await initializePayment(paymentData);

    transaction.paymentUrl = paymentResponse.data.authorization_url;
    await transaction.save();

    res.status(200).json({
      success: true,
      message: "Payment initialized successfully",
      data: {
        transaction: transaction,
        paymentUrl: paymentResponse.data.authorization_url,
        reference: transaction.reference,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify transaction payment
// @route   GET /api/v1/transactions/verify-payment/:reference
// @access  Private
const verifyTransaction = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { reference } = req.params;

    const transaction = await Transaction.findOne({ reference });
    if (!transaction) {
      return next(new ErrorResponse("Transaction not found", 404));
    }

    // Check if already processed
    if (transaction.status === "completed") {
      const booking = await Booking.findById(transaction.bookingId)
        .populate("tickets")
        .populate("event", "title startDate venue");

      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        data: {
          transaction,
          booking,
        },
      });
    }

    const verification = await verifyPayment(reference);

    if (verification.data.status === "success") {
      session.startTransaction();

      // Mark transaction as completed
      await markTransactionAsCompleted(transaction, verification.data);

      // Get booking with full details
      const booking = await Booking.findById(transaction.bookingId)
        .populate("event")
        .populate("user", "fullName firstName lastName email phone")
        .session(session);

      if (!booking) {
        await session.abortTransaction();
        return next(new ErrorResponse("Booking not found", 404));
      }

      const event = booking.event;
      const user = booking.user;

      // Build bookings array for createTickets helper
      const bookingsForTickets = booking.ticketDetails.map(detail => ({
        ticketType: detail.ticketType,
        ticketTypeId: detail.ticketTypeId,
        quantity: detail.quantity,
        price: detail.price || detail.unitPrice,
        accessType: detail.accessType || "both",
        approvalQuestions: detail.approvalQuestions || [],
      }));

      // Create tickets using helper function
      const tickets = await createTickets(event, user, bookingsForTickets, {
        session,
        bookingId: booking._id,
      });

      // Update booking with ticket references
      booking.tickets = tickets.map((t) => t._id);
      booking.status = "confirmed";
      booking.paymentStatus = "completed";
      booking.ticketGeneration = {
        status: "completed",
        generatedCount: tickets.length,
        generatedAt: new Date(),
        failedTickets: [],
      };
      await booking.save({ session });

      // Update event statistics
      if (booking.totalTickets) {
        await updateEventTicketAvailability(
          event._id,
          booking.totalTickets,
          "decrement"
        );
      }

      await session.commitTransaction();

      // ✅ SEND BOOKING CONFIRMATION EMAIL WITH PDF TICKETS FOR PAID EVENTS
      await sendPaidBookingConfirmation(booking, event, user, tickets);

      // Send notifications (outside transaction)
      try {
        if (NotificationService && NotificationService.createTicketPurchaseNotification) {
          await NotificationService.createTicketPurchaseNotification(
            user._id,
            booking,
            event
          );
        }
      } catch (notifError) {
        console.error("Notification error:", notifError);
      }

      return res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        data: {
          transaction,
          booking: {
            ...booking.toObject(),
            tickets,
          },
        },
      });
    } else {
      await markTransactionAsFailed(transaction, "Payment verification failed");

      await Booking.findByIdAndUpdate(transaction.bookingId, {
        paymentStatus: "failed",
        status: "cancelled",
      });

      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
        data: {
          transaction,
        },
      });
    }
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Transaction verification error:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// @desc    Get user transactions
// @route   GET /api/v1/transactions/my-transactions
// @access  Private
const getUserTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const userId = req.user.userId;

    const query = { userId };

    if (status && status !== "all") {
      query.status = status;
    }
    if (type && type !== "all") {
      query.type = type;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("eventId", "title startDate venue images")
        .populate("bookingId", "orderNumber totalTickets"),
      Transaction.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: transactions.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single transaction
// @route   GET /api/v1/transactions/:id
// @access  Private
const getTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("eventId", "title startDate venue city images organizer")
      .populate("bookingId", "orderNumber totalTickets ticketDetails")
      .populate("userId", "firstName lastName email phone");

    if (!transaction) {
      return next(new ErrorResponse("Transaction not found", 404));
    }

    const isOwner = transaction.userId._id.toString() === req.user.userId;
    const isOrganizer =
      transaction.eventId?.organizer?.toString() === req.user.userId;

    if (!isOwner && !isOrganizer && req.user.role !== "superadmin") {
      return next(
        new ErrorResponse("Not authorized to view this transaction", 403)
      );
    }

    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get event transactions
// @route   GET /api/v1/transactions/event/:eventId
// @access  Private (Organizer/Admin)
const getEventTransactions = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    const event = await Event.findOne({
      _id: eventId,
      organizer: req.user.userId,
    });

    if (!event && req.user.role !== "superadmin") {
      return next(new ErrorResponse("Event not found or not authorized", 404));
    }

    const query = { eventId };
    if (status && status !== "all") {
      query.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("userId", "firstName lastName email")
        .populate("bookingId", "orderNumber totalTickets ticketDetails"),
      Transaction.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: transactions.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Request refund
// @route   POST /api/v1/transactions/:id/refund
// @access  Private
const requestRefund = async (req, res, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return next(new ErrorResponse("Transaction not found", 404));
    }

    if (transaction.userId.toString() !== req.user.userId) {
      return next(
        new ErrorResponse(
          "Not authorized to request refund for this transaction",
          403
        )
      );
    }

    if (transaction.status !== "completed") {
      return next(
        new ErrorResponse("Only completed transactions can be refunded", 400)
      );
    }

    if (transaction.refundStatus && transaction.refundStatus !== "none") {
      return next(
        new ErrorResponse("Refund already requested or processed", 400)
      );
    }

    const event = await Event.findById(transaction.eventId);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    const eventStartDate = new Date(event.startDate);
    const daysUntilEvent = Math.ceil(
      (eventStartDate - new Date()) / (1000 * 60 * 60 * 24)
    );

    const minDaysBeforeEvent = event.refundPolicy?.minDaysBeforeEvent || 7;

    if (daysUntilEvent < minDaysBeforeEvent) {
      return next(
        new ErrorResponse(
          `Refunds only allowed ${minDaysBeforeEvent} days before event`,
          400
        )
      );
    }

    transaction.refundStatus = "requested";
    transaction.refundRequestedAt = new Date();
    transaction.refundReason = req.body.reason || "Customer request";
    await transaction.save();

    res.status(200).json({
      success: true,
      message: "Refund requested successfully",
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Process refund
// @route   PUT /api/v1/transactions/:id/refund/process
// @access  Private (Organizer/Admin)
const processRefund = async (req, res, next) => {
  try {
    const { action, reason } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return next(
        new ErrorResponse('Action must be "approve" or "reject"', 400)
      );
    }

    const transaction = await Transaction.findById(req.params.id)
      .populate("eventId")
      .populate("bookingId");

    if (!transaction) {
      return next(new ErrorResponse("Transaction not found", 404));
    }

    const isOrganizer =
      transaction.eventId.organizer.toString() === req.user.userId;
    if (!isOrganizer && req.user.role !== "superadmin") {
      return next(
        new ErrorResponse(
          "Not authorized to process refunds for this event",
          403
        )
      );
    }

    if (transaction.refundStatus !== "requested") {
      return next(new ErrorResponse("No refund request pending", 400));
    }

    if (action === "approve") {
      transaction.refundStatus = "approved";
      transaction.refundProcessedAt = new Date();
      transaction.refundAmount = transaction.amount * 0.8;
      transaction.status = "refunded";

      await Booking.findByIdAndUpdate(transaction.bookingId, {
        status: "refunded",
        refundAmount: transaction.refundAmount,
      });

      if (transaction.bookingId && transaction.bookingId.totalTickets) {
        await updateEventTicketAvailability(
          transaction.eventId._id,
          transaction.bookingId.totalTickets,
          "increment"
        );
      }
    } else if (action === "reject") {
      transaction.refundStatus = "rejected";
      transaction.refundRejectionReason = reason;
    }

    await transaction.save();

    res.status(200).json({
      success: true,
      message: `Refund ${action}d successfully`,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get revenue statistics
// @route   GET /api/v1/transactions/stats/revenue
// @access  Private (Organizer/Admin)
const getRevenueStats = async (req, res, next) => {
  try {
    const { period = "month", eventId } = req.query;
    const organizerId = req.user.userId;

    let matchQuery = {
      status: "completed",
      type: "event_booking",
    };

    if (req.user.role !== "superadmin") {
      const organizerEvents = await Event.find({
        organizer: organizerId,
      }).select("_id");
      const eventIds = organizerEvents.map((event) => event._id);
      matchQuery.eventId = { $in: eventIds };
    }

    if (eventId) {
      matchQuery.eventId = eventId;
    }

    let dateRange = {};
    const now = new Date();

    switch (period) {
      case "week":
        dateRange.startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "month":
        dateRange.startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case "quarter":
        dateRange.startDate = new Date(now.setMonth(now.getMonth() - 3));
        break;
      case "year":
        dateRange.startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        dateRange.startDate = new Date(now.setMonth(now.getMonth() - 1));
    }

    matchQuery.createdAt = { $gte: dateRange.startDate };

    const stats = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          averageTransaction: { $avg: "$amount" },
        },
      },
    ]);

    const result = stats[0] || {
      totalRevenue: 0,
      totalTransactions: 0,
      averageTransaction: 0,
    };

    res.status(200).json({
      success: true,
      data: {
        period,
        ...result,
        startDate: dateRange.startDate,
        endDate: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Paystack webhook handler
// @route   POST /api/v1/transactions/webhook
// @access  Public (Paystack only)
const paystackWebhook = async (req, res) => {
  try {
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    switch (event.event) {
      case "charge.success":
        await handleSuccessfulCharge(event.data);
        break;

      case "charge.failed":
        await handleFailedCharge(event.data);
        break;

      case "refund.processed":
        await handleRefundProcessed(event.data);
        break;

      default:
        console.log("Unhandled webhook event:", event.event);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Error processing webhook");
  }
};

async function handleSuccessfulCharge(data) {
  const session = await mongoose.startSession();
  
  try {
    const transaction = await Transaction.findOne({
      reference: data.reference,
    });
    
    if (transaction && transaction.status === "pending") {
      session.startTransaction();
      
      await markTransactionAsCompleted(transaction, data);

      if (transaction.type === "event_booking") {
        const booking = await Booking.findById(transaction.bookingId)
          .populate("event")
          .populate("user", "fullName firstName lastName email phone")
          .session(session);

        if (booking) {
          const event = booking.event;
          const user = booking.user;

          // Build bookings array for createTickets helper
          const bookingsForTickets = booking.ticketDetails.map(detail => ({
            ticketType: detail.ticketType,
            ticketTypeId: detail.ticketTypeId,
            quantity: detail.quantity,
            price: detail.price || detail.unitPrice,
            accessType: detail.accessType || "both",
            approvalQuestions: detail.approvalQuestions || [],
          }));

          // Create tickets using helper function
          const tickets = await createTickets(event, user, bookingsForTickets, {
            session,
            bookingId: booking._id,
          });

          // Update booking
          booking.tickets = tickets.map((t) => t._id);
          booking.paymentStatus = "completed";
          booking.status = "confirmed";
          booking.ticketGeneration = {
            status: "completed",
            generatedCount: tickets.length,
            generatedAt: new Date(),
            failedTickets: [],
          };
          await booking.save({ session });

          // Update event availability
          if (booking.totalTickets) {
            await updateEventTicketAvailability(
              event._id,
              booking.totalTickets,
              "decrement"
            );
          }

          await session.commitTransaction();

          // ✅ SEND BOOKING CONFIRMATION EMAIL FOR WEBHOOK PAYMENTS TOO
          await sendPaidBookingConfirmation(booking, event, user, tickets);

          // Send notifications
          try {
            if (NotificationService && NotificationService.createTicketPurchaseNotification) {
              await NotificationService.createTicketPurchaseNotification(
                user._id,
                booking,
                event
              );
            }
          } catch (notifError) {
            console.error("Notification error:", notifError);
          }
        }
      } else {
        await session.commitTransaction();
      }
    }
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Handle successful charge error:", error);
  } finally {
    session.endSession();
  }
}

async function handleFailedCharge(data) {
  try {
    const transaction = await Transaction.findOne({
      reference: data.reference,
    });
    if (transaction) {
      await markTransactionAsFailed(transaction, data.gateway_response);

      if (transaction.type === "event_booking") {
        await Booking.findOneAndUpdate(
          { _id: transaction.bookingId },
          {
            paymentStatus: "failed",
            status: "cancelled",
          }
        );
      }
    }
  } catch (error) {
    console.error("Handle failed charge error:", error);
  }
}

async function handleRefundProcessed(data) {
  try {
    const transaction = await Transaction.findOne({
      reference: data.reference,
    });
    if (transaction) {
      transaction.refundStatus = "completed";
      transaction.refundProcessedAt = new Date();
      await transaction.save();
    }
  } catch (error) {
    console.error("Handle refund processed error:", error);
  }
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  getUserTransactions,
  getTransaction,
  getEventTransactions,
  requestRefund,
  processRefund,
  getRevenueStats,
  paystackWebhook,
};