const Transaction = require("../models/transaction");
const Booking = require("../models/booking");
const Event = require("../models/event");
const User = require("../models/user");
const {
  initializePayment,
  verifyPayment,
} = require("../service/paystackService");
const ErrorResponse = require("../utils/errorResponse");
const crypto = require("crypto");

// Helper function to mark transaction as completed
const markTransactionAsCompleted = async (transaction, paymentData) => {
  if (typeof transaction.markAsCompleted === "function") {
    await transaction.markAsCompleted(paymentData);
  } else {
    // Manual completion
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
    // Manual failure
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
      // Manual availability update
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

// @desc    Initialize transaction for booking
// @route   POST /api/v1/transactions/initialize
// @access  Private
const initializeTransaction = async (req, res, next) => {
  try {
    const { bookingId, amount, email, ticketDetails } = req.body;

    // Validate required fields
    if (!bookingId || !amount || !email) {
      return next(
        new ErrorResponse("Booking ID, amount, and email are required", 400)
      );
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > 1000000) {
      return next(new ErrorResponse("Invalid amount", 400));
    }

    // Verify booking exists and belongs to user
    const booking = await Booking.findOne({
      _id: bookingId,
      user: req.user.userId,
    });

    if (!booking) {
      return next(new ErrorResponse("Booking not found", 404));
    }

    // Create transaction record
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

    // Initialize payment with Paystack
    const paymentData = {
      email: email,
      amount: Math.round(amountNum * 100), // Convert to kobo
      reference: transaction.reference,
      metadata: {
        bookingId: bookingId,
        userId: req.user.userId,
        ticketDetails: ticketDetails,
      },
    };

    const paymentResponse = await initializePayment(paymentData);

    // Update transaction with payment authorization URL
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
// @route   GET /api/v1/transactions/verify/:reference
// @access  Public
const verifyTransaction = async (req, res, next) => {
  try {
    const { reference } = req.params;

    const transaction = await Transaction.findOne({ reference });
    if (!transaction) {
      return next(new ErrorResponse("Transaction not found", 404));
    }

    // Verify payment with Paystack
    const verification = await verifyPayment(reference);

    if (verification.data.status === "success") {
      // Update transaction status
      await markTransactionAsCompleted(transaction, verification.data);

      // Update booking status
      await Booking.findByIdAndUpdate(transaction.bookingId, {
        paymentStatus: "completed",
        status: "confirmed",
      });

      // Update event ticket counts
      const booking = await Booking.findById(transaction.bookingId);
      if (booking && booking.event) {
        await updateEventTicketAvailability(
          booking.event,
          booking.totalTickets,
          "decrement"
        );
      }

      return res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        data: {
          transaction: transaction,
          booking: booking,
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
          transaction: transaction,
        },
      });
    }
  } catch (error) {
    next(error);
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

    // Add filters if provided
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

    // Check authorization - user can view their own transactions or organizers can view their event transactions
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

    // Verify event exists and belongs to organizer
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

    // Check if user owns the transaction
    if (transaction.userId.toString() !== req.user.userId) {
      return next(
        new ErrorResponse(
          "Not authorized to request refund for this transaction",
          403
        )
      );
    }

    // Check if transaction is eligible for refund
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

    // Check event refund policy
    const event = await Event.findById(transaction.eventId);
    if (!event) {
      return next(new ErrorResponse("Event not found", 404));
    }

    const eventStartDate = new Date(event.startDate);
    const daysUntilEvent = Math.ceil(
      (eventStartDate - new Date()) / (1000 * 60 * 60 * 24)
    );

    // Use event's refund policy or default to 7 days
    const minDaysBeforeEvent = event.refundPolicy?.minDaysBeforeEvent || 7;

    if (daysUntilEvent < minDaysBeforeEvent) {
      return next(
        new ErrorResponse(
          `Refunds only allowed ${minDaysBeforeEvent} days before event`,
          400
        )
      );
    }

    // Create refund request
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

    // Validate action
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

    // Check if user is event organizer or admin
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
      // Process refund
      transaction.refundStatus = "approved";
      transaction.refundProcessedAt = new Date();
      transaction.refundAmount = transaction.amount * 0.8; // 80% refund as example
      transaction.status = "refunded";

      // Update booking status
      await Booking.findByIdAndUpdate(transaction.bookingId, {
        status: "refunded",
        refundAmount: transaction.refundAmount,
      });

      // Update event ticket availability
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

    // If not superadmin, only show organizer's events
    if (req.user.role !== "superadmin") {
      const organizerEvents = await Event.find({
        organizer: organizerId,
      }).select("_id");
      const eventIds = organizerEvents.map((event) => event._id);
      matchQuery.eventId = { $in: eventIds };
    }

    // Filter by specific event if provided
    if (eventId) {
      matchQuery.eventId = eventId;
    }

    // Date range based on period
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

// @desc    Initialize service fee payment
// @route   POST /api/v1/transactions/initialize-service-fee
// @access  Private (Organizer only)
const initializeServiceFeePayment = async (req, res, next) => {
  try {
    const { eventId, amount, email, metadata } = req.body;

    if (!eventId || !amount || !email) {
      return next(
        new ErrorResponse("Event ID, amount, and email are required", 400)
      );
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > 10000000) {
      return next(new ErrorResponse("Invalid service fee amount", 400));
    }

    // ✅ CHECK IF THIS IS A DRAFT EVENT
    const isDraftEvent =
      typeof eventId === "string" && eventId.startsWith("draft-");

    console.log("Service fee payment initialization:", {
      eventId,
      isDraft: isDraftEvent,
      amount: amountNum,
      email,
    });

    // Only verify event exists if it's not a draft
    let event = null;
    if (!isDraftEvent) {
      event = await Event.findOne({
        _id: eventId,
        organizer: req.user.userId,
      });

      if (!event) {
        return next(new ErrorResponse("Event not found", 404));
      }
    }

    // ✅ MANUALLY GENERATE REFERENCE (Don't rely on pre-save hook)
    const reference = `TXN-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)
      .toUpperCase()}`;

    console.log("✅ Generated reference:", reference);

    // ✅ Prepare transaction data with ALL required fields
    const transactionData = {
      // Core identification
      reference: reference, // ✅ MANUALLY PROVIDED
      userId: req.user.userId,
      type: "service_fee",
      
      // Event & Booking (conditionally set based on draft status)
      eventId: isDraftEvent ? undefined : eventId, // Don't set if draft
      bookingId: undefined, // Service fees never have bookings
      
      // Amounts (all required)
      totalAmount: amountNum,
      subtotalAmount: amountNum,
      serviceFee: 0,
      taxAmount: 0,
      discountAmount: 0,
      currency: "NGN",
      
      // Event snapshot (required)
      eventTitle: metadata?.eventTitle || metadata?.eventData?.title || "Event Service Fee",
      eventStartDate: metadata?.eventData?.startDate || metadata?.eventData?.date || new Date(),
      
      // Payment info
      status: "pending",
      paymentMethod: "card",
      paymentGateway: "paystack",
      
      // Metadata for draft event handling
      metadata: {
        isDraft: isDraftEvent,
        draftEventId: isDraftEvent ? eventId : null,
        eventData: metadata?.eventData || {},
        agreementData: metadata?.agreementData || {},
        attendanceRange: metadata?.attendanceRange || "unknown",
        userInfo: metadata?.userInfo || {},
        hasApprovalTickets: metadata?.hasApprovalTickets || false,
      },
    };

    console.log("📦 Transaction data prepared:", {
      reference: transactionData.reference,
      type: transactionData.type,
      isDraft: isDraftEvent,
      hasEventId: !!transactionData.eventId,
      hasBookingId: !!transactionData.bookingId,
      totalAmount: transactionData.totalAmount,
      eventTitle: transactionData.eventTitle,
    });

    // ✅ Create transaction
    const transaction = await Transaction.create(transactionData);

    console.log("✅ Transaction created successfully:", {
      id: transaction._id,
      reference: transaction.reference,
      type: transaction.type,
    });

    // Initialize payment with Paystack
    const paymentData = {
      email: email,
      amount: Math.round(amountNum * 100), // Convert to kobo
      reference: transaction.reference,
      metadata: {
        transactionId: transaction._id.toString(),
        userId: req.user.userId,
        type: "service_fee",
        isDraft: isDraftEvent,
        eventId: eventId,
      },
      callback_url:
        req.body.callback_url ||
        `${process.env.FRONTEND_URL}/dashboard/organizer/events?payment=success`,
    };

    console.log("💳 Initializing Paystack payment:", {
      reference: transaction.reference,
      amount: paymentData.amount,
      email: paymentData.email,
    });

    const paymentResponse = await initializePayment(paymentData);

    // Update transaction with payment URL
    transaction.authorizationUrl = paymentResponse.data.authorization_url;
    transaction.accessCode = paymentResponse.data.access_code;
    await transaction.save();

    console.log("🎉 Payment initialized successfully:", {
      reference: transaction.reference,
      authorizationUrl: paymentResponse.data.authorization_url,
    });

    res.status(200).json({
      success: true,
      message: "Service fee payment initialized successfully",
      data: {
        transaction: {
          _id: transaction._id,
          reference: transaction.reference,
          amount: transaction.totalAmount,
          status: transaction.status,
          type: transaction.type,
        },
        authorizationUrl: paymentResponse.data.authorization_url,
        reference: transaction.reference,
        isDraft: isDraftEvent,
      },
    });
  } catch (error) {
    console.error("💥 Service fee payment initialization error:", error);
    
    // Log validation errors
    if (error.name === 'ValidationError') {
      console.error("Validation errors:", error.errors);
      const messages = Object.values(error.errors).map(err => err.message);
      return next(new ErrorResponse(messages.join(', '), 400));
    }
    
    next(error);
  }
};

// @desc    Verify service fee payment
// @route   POST /api/v1/transactions/verify-service-fee/:reference
// @access  Public
const verifyServiceFeePayment = async (req, res, next) => {
  try {
    const { reference } = req.params;

    console.log("Verifying service fee payment:", reference);

    const transaction = await Transaction.findOne({
      reference,
      type: "service_fee",
    });

    if (!transaction) {
      return next(new ErrorResponse("Service fee transaction not found", 404));
    }

    // Verify payment with Paystack
    const verification = await verifyPayment(reference);

    console.log("Paystack verification response:", {
      status: verification.data.status,
      reference,
      isDraft: transaction.metadata?.isDraft,
    });

    if (verification.data.status === "success") {
      // Mark transaction as completed
      await markTransactionAsCompleted(transaction, verification.data);

      const isDraft = transaction.metadata?.isDraft;

      // ✅ Only update event if it exists and is not a draft
      if (!isDraft && transaction.eventId) {
        console.log("Updating existing event status:", transaction.eventId);

        await Event.findByIdAndUpdate(transaction.eventId, {
          serviceFeePaymentStatus: "paid",
          serviceFeeReference: reference,
          serviceFeeTransaction: transaction._id,
          isActive: true,
        });
      } else if (isDraft) {
        console.log(
          "Draft event - payment verified, waiting for event creation"
        );
      }

      return res.status(200).json({
        success: true,
        message: "Service fee payment verified successfully",
        data: {
          transaction: {
            _id: transaction._id,
            reference: transaction.reference,
            amount: transaction.amount,
            status: transaction.status,
            type: transaction.type,
            metadata: transaction.metadata,
          },
          isDraft: isDraft,
          eventData: transaction.metadata?.eventData || null,
        },
      });
    } else {
      console.log("Payment verification failed:", verification.data.status);

      await markTransactionAsFailed(
        transaction,
        "Service fee payment verification failed"
      );

      return res.status(400).json({
        success: false,
        message: "Service fee payment verification failed",
        data: {
          transaction: transaction,
        },
      });
    }
  } catch (error) {
    console.error("Service fee verification error:", error);
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

// Webhook helper functions
async function handleSuccessfulCharge(data) {
  try {
    const transaction = await Transaction.findOne({
      reference: data.reference,
    });
    if (transaction && transaction.status === "pending") {
      await markTransactionAsCompleted(transaction, data);

      if (transaction.type === "event_booking") {
        // Update associated booking status
        await Booking.findOneAndUpdate(
          { _id: transaction.bookingId },
          {
            paymentStatus: "completed",
            status: "confirmed",
          }
        );

        // Update event ticket counts
        const booking = await Booking.findById(transaction.bookingId);
        if (booking && booking.event) {
          await updateEventTicketAvailability(
            booking.event,
            booking.totalTickets,
            "decrement"
          );
        }
      } else if (transaction.type === "service_fee") {
        // Update event status for service fee payments
        await Event.findByIdAndUpdate(transaction.eventId, {
          status: "published",
          isActive: true,
        });
      }
    }
  } catch (error) {
    console.error("Handle successful charge error:", error);
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
        // Update associated booking status
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
      // Manual refund completion
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
  initializeServiceFeePayment,
  verifyServiceFeePayment,
  paystackWebhook,
};
