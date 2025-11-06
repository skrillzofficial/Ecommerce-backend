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

// @desc    Initialize transaction for booking
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
// @route   GET /api/v1/transactions/verify/:reference
// @access  Public
const verifyTransaction = async (req, res, next) => {
  try {
    const { reference } = req.params;

    const transaction = await Transaction.findOne({ reference });
    if (!transaction) {
      return next(new ErrorResponse("Transaction not found", 404));
    }

    const verification = await verifyPayment(reference);

    if (verification.data.status === "success") {
      await markTransactionAsCompleted(transaction, verification.data);

      await Booking.findByIdAndUpdate(transaction.bookingId, {
        paymentStatus: "completed",
        status: "confirmed",
      });

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

//  initializeServiceFeePayment FUNCTION

const initializeServiceFeePayment = async (req, res, next) => {
  try {
    console.log('🔔 initializeServiceFeePayment CONTROLLER CALLED');
    console.log('Request body:', req.body);

    const { eventId, amount, email, metadata, callback_url } = req.body;

    // Validate required fields
    if (!eventId || !amount || !email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: eventId, amount, email'
      });
    }

    // Check if this is a draft event (starts with "draft-")
    const isDraftEvent = eventId.startsWith('draft-');
    
    console.log('📝 Event type:', isDraftEvent ? 'DRAFT' : 'EXISTING');
    console.log('Event ID:', eventId);

    //  For draft events, skip database lookup
    let eventData = null;
    
    if (!isDraftEvent) {
      // Only look up in database if it's a real event ID
      try {
        eventData = await Event.findById(eventId);
        if (!eventData) {
          return res.status(404).json({
            success: false,
            message: 'Event not found'
          });
        }
      } catch (dbError) {
        console.error('Database lookup error:', dbError);
        return res.status(400).json({
          success: false,
          message: 'Invalid event ID'
        });
      }
    } else {
      // For draft events, use metadata or create minimal event data
      eventData = {
        _id: eventId,
        title: metadata?.eventTitle || 'New Event',
        organizer: req.user.userId,
        isDraft: true
      };
      console.log('📋 Using draft event data');
    }

    // Generate unique reference
    const reference = `SRV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('💰 Initializing Paystack payment for service fee:', {
      email,
      amount,
      reference,
      eventId,
      isDraftEvent
    });

    // Initialize Paystack payment
    const paystackData = {
      email: email,
      amount: amount, 
      reference: reference,
      metadata: {
        ...metadata,
        eventId: eventId,
        isDraftEvent: isDraftEvent,
        paymentType: 'service_fee',
        userId: req.user.userId,
        custom_fields: [
          {
            display_name: "Service Type",
            variable_name: "service_type",
            value: "event_publishing"
          },
          {
            display_name: "Event Title", 
            variable_name: "event_title",
            value: metadata?.eventTitle || "New Event"
          },
          {
            display_name: "Event Type",
            variable_name: "event_type", 
            value: isDraftEvent ? "draft" : "existing"
          }
        ]
      },
      callback_url: callback_url || `${process.env.FRONTEND_URL}/payment-verification?type=service_fee`
    };

    console.log('📤 Paystack request data:', paystackData);

    // Initialize Paystack payment
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      paystackData,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { data } = paystackResponse.data;

    console.log('✅ Paystack response:', data);

    // ✅ FIX: Save transaction without trying to reference non-existent event
    const transaction = await Transaction.create({
      reference: data.reference,
      amount: amount,
      userId: req.user.userId,
      type: 'service_fee',
      status: 'pending',
      metadata: {
        ...paystackData.metadata,
        authorizationUrl: data.authorization_url,
        eventData: metadata?.eventData || null
      }
    });

    console.log('💾 Transaction created:', transaction._id);

    res.status(200).json({
      success: true,
      message: 'Service fee payment initialized',
      data: {
        authorizationUrl: data.authorization_url,
        reference: data.reference,
        accessCode: data.access_code,
        transaction: {
          _id: transaction._id,
          reference: transaction.reference,
          amount: transaction.amount
        }
      }
    });

  } catch (error) {
    console.error('❌ initializeServiceFeePayment error:', error);
    
    // More specific error handling
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid event ID format'
      });
    }
    
    if (error.response?.data?.message) {
      return res.status(400).json({
        success: false,
        message: `Paystack error: ${error.response.data.message}`
      });
    }
    
    next(error);
  }
};

// @desc    Verify service fee payment and publish event
// @route   POST /api/v1/transactions/verify-service-fee/:reference
// @access  Public
const verifyServiceFeePayment = async (req, res, next) => {
  try {
    const { reference } = req.params;

    // 1. Find transaction
    const transaction = await Transaction.findOne({ reference, type: 'service_fee' });
    
    if (!transaction) {
      return next(new ErrorResponse('Transaction not found', 404));
    }

    // 2. If already completed, return event
    if (transaction.status === 'completed') {
      const event = await Event.findById(transaction.eventId);
      return res.status(200).json({
        success: true,
        message: 'Payment already verified',
        data: { transaction, event }
      });
    }

    // 3. Verify with Paystack
    const verification = await verifyPayment(reference);

    if (verification.data.status !== 'success') {
      await transaction.markAsFailed('Payment verification failed');
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // 4. Mark transaction as completed
    await transaction.markAsCompleted(verification.data);

    // 5. Publish the EXISTING event (NO creation!)
    const event = await Event.findByIdAndUpdate(
      transaction.eventId,
      {
        status: 'published',
        publishedAt: new Date(),
        serviceFeePaymentStatus: 'paid',
        serviceFeeReference: reference,
        serviceFeeTransaction: transaction._id,
        paymentProcessed: true,
        paymentProcessedAt: new Date()
      },
      { new: true }
    );

    if (!event) {
      return next(new ErrorResponse('Event not found', 404));
    }

    console.log('✅ Event published:', event._id);

    res.status(200).json({
      success: true,
      message: 'Payment verified and event published',
      data: { transaction, event }
    });

  } catch (error) {
    console.error('Verification error:', error);
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
  try {
    const transaction = await Transaction.findOne({
      reference: data.reference,
    });
    if (transaction && transaction.status === "pending") {
      await markTransactionAsCompleted(transaction, data);

      if (transaction.type === "event_booking") {
        await Booking.findOneAndUpdate(
          { _id: transaction.bookingId },
          {
            paymentStatus: "completed",
            status: "confirmed",
          }
        );

        const booking = await Booking.findById(transaction.bookingId);
        if (booking && booking.event) {
          await updateEventTicketAvailability(
            booking.event,
            booking.totalTickets,
            "decrement"
          );
        }
      } else if (transaction.type === "service_fee") {
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
  initializeServiceFeePayment,
  verifyServiceFeePayment,
  paystackWebhook,
};
