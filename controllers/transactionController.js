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

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > 10000000) {
      return next(new ErrorResponse("Invalid service fee amount", 400));
    }

    const isDraftEvent =
      typeof eventId === "string" && eventId.startsWith("draft-");

    console.log("Service fee payment initialization:", {
      eventId,
      isDraft: isDraftEvent,
      amount: amountNum,
      email,
      hasAgreementData: !!metadata?.agreementData,
      agreementAcceptedTerms: metadata?.agreementData?.acceptedTerms,
    });

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

    const reference = `TXN-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)
      .toUpperCase()}`;

    console.log("✅ Generated reference:", reference);

    // ✅ CRITICAL FIX: Ensure agreement data is stored in metadata
    const transactionData = {
      reference: reference,
      userId: req.user.userId,
      type: "service_fee",
      eventId: isDraftEvent ? undefined : eventId,
      bookingId: undefined,
      totalAmount: amountNum,
      subtotalAmount: amountNum,
      serviceFee: 0,
      taxAmount: 0,
      discountAmount: 0,
      currency: "NGN",
      eventTitle:
        metadata?.eventTitle ||
        metadata?.eventData?.title ||
        "Event Service Fee",
      eventStartDate:
        metadata?.eventData?.startDate ||
        metadata?.eventData?.date ||
        new Date(),
      status: "pending",
      paymentMethod: "card",
      paymentGateway: "paystack",
      metadata: {
        isDraft: isDraftEvent,
        draftEventId: isDraftEvent ? eventId : null,
        eventData: metadata?.eventData || {},
        // ✅ CRITICAL: Store agreement data with acceptedTerms = true
        agreementData: {
          ...(metadata?.agreementData || {}),
          acceptedTerms: true,
          acceptedAt:
            metadata?.agreementData?.acceptedAt || new Date().toISOString(),
        },
        attendanceRange: metadata?.attendanceRange || "unknown",
        userInfo: metadata?.userInfo || {},
        hasApprovalTickets: metadata?.hasApprovalTickets || false,
      },
    };

    console.log("📦 Transaction data prepared with agreement:", {
      reference: transactionData.reference,
      type: transactionData.type,
      isDraft: isDraftEvent,
      hasAgreementData: !!transactionData.metadata.agreementData,
      agreementAcceptedTerms:
        transactionData.metadata.agreementData.acceptedTerms,
    });

    const transaction = await Transaction.create(transactionData);

    console.log("✅ Transaction created successfully:", {
      id: transaction._id,
      reference: transaction.reference,
      type: transaction.type,
      hasMetadata: !!transaction.metadata,
      agreementAcceptedTerms:
        transaction.metadata?.agreementData?.acceptedTerms,
    });

    const paymentData = {
      email: email,
      amount: Math.round(amountNum * 100),
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

    if (error.name === "ValidationError") {
      console.error("Validation errors:", error.errors);
      const messages = Object.values(error.errors).map((err) => err.message);
      return next(new ErrorResponse(messages.join(", "), 400));
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

    console.log("🔍 Verifying service fee payment:", reference);

    const existingTransaction = await Transaction.findOne({
      reference,
      type: "service_fee",
      status: "completed",
    }).populate("eventId");

    if (existingTransaction && existingTransaction.eventId) {
      console.log("✅ Event already created for this payment:", {
        transactionId: existingTransaction._id,
        eventId: existingTransaction.eventId._id,
        eventTitle: existingTransaction.eventId.title,
      });

      return res.status(200).json({
        success: true,
        message: "Service fee payment already verified and event created",
        data: {
          transaction: {
            _id: existingTransaction._id,
            reference: existingTransaction.reference,
            amount: existingTransaction.totalAmount,
            status: existingTransaction.status,
            type: existingTransaction.type,
            metadata: existingTransaction.metadata,
          },
          event: existingTransaction.eventId,
          isDraft: false,
          alreadyProcessed: true,
        },
      });
    }

    const transaction = await Transaction.findOne({
      reference,
      type: "service_fee",
    });

    if (!transaction) {
      return next(new ErrorResponse("Service fee transaction not found", 404));
    }

    if (transaction.status === "completed" && !transaction.eventId) {
      console.log("📋 Payment verified but waiting for event creation");

      return res.status(200).json({
        success: true,
        message: "Payment verified, waiting for event creation",
        data: {
          transaction: {
            _id: transaction._id,
            reference: transaction.reference,
            amount: transaction.totalAmount,
            status: transaction.status,
            type: transaction.type,
            metadata: transaction.metadata,
          },
          isDraft: true,
          eventData: transaction.metadata?.eventData || null,
          completionEndpoint: `/api/v1/transactions/${reference}/complete-draft-event`,
        },
      });
    }

    if (transaction.status === "pending") {
      console.log("💳 Verifying payment with Paystack...");
      const verification = await verifyPayment(reference);

      console.log("Paystack verification response:", {
        status: verification.data.status,
        reference,
        isDraft: transaction.metadata?.isDraft,
      });

      if (verification.data.status === "success") {
        await markTransactionAsCompleted(transaction, verification.data);

        const isDraft = transaction.metadata?.isDraft;

        if (!isDraft && transaction.eventId) {
          console.log(
            "📝 Updating existing event status:",
            transaction.eventId
          );

          const updatedEvent = await Event.findByIdAndUpdate(
            transaction.eventId,
            {
              serviceFeePaymentStatus: "paid",
              serviceFeeReference: reference,
              serviceFeeTransaction: transaction._id,
              isActive: true,
              status: "published",
            },
            { new: true }
          );

          console.log("✅ Event updated successfully:", {
            eventId: updatedEvent._id,
            title: updatedEvent.title,
            status: updatedEvent.status,
          });

          return res.status(200).json({
            success: true,
            message:
              "Service fee payment verified and event published successfully",
            data: {
              transaction: {
                _id: transaction._id,
                reference: transaction.reference,
                amount: transaction.totalAmount,
                status: transaction.status,
                type: transaction.type,
                metadata: transaction.metadata,
              },
              event: updatedEvent,
              isDraft: false,
            },
          });
        } else if (isDraft) {
          console.log(
            "📋 Draft event - payment verified, waiting for event creation"
          );

          return res.status(200).json({
            success: true,
            message: "Service fee payment verified successfully",
            data: {
              transaction: {
                _id: transaction._id,
                reference: transaction.reference,
                amount: transaction.totalAmount,
                status: transaction.status,
                type: transaction.type,
                metadata: transaction.metadata,
              },
              isDraft: true,
              eventData: transaction.metadata?.eventData || null,
            },
          });
        }
      } else {
        console.log(
          "❌ Payment verification failed:",
          verification.data.status
        );

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
    }

    console.log("ℹ️ Transaction in unexpected state:", {
      status: transaction.status,
      hasEventId: !!transaction.eventId,
    });

    return res.status(200).json({
      success: true,
      message: `Transaction is ${transaction.status}`,
      data: {
        transaction: {
          _id: transaction._id,
          reference: transaction.reference,
          amount: transaction.totalAmount,
          status: transaction.status,
          type: transaction.type,
          metadata: transaction.metadata,
        },
        isDraft: transaction.status === "completed" && !transaction.eventId,
        event: transaction.eventId || null,
      },
    });
  } catch (error) {
    console.error("💥 Service fee verification error:", error);
    next(error);
  }
};

// ============================================
// COMPLETE FIXED transformTicketTypes AND completeDraftEventCreation
// Replace both functions with these corrected versions
// ============================================

// Helper function to transform ticket types - ADD THIS BEFORE completeDraftEventCreation
const transformTicketTypes = (ticketTypes) => {
  if (!Array.isArray(ticketTypes)) {
    console.warn("⚠️ ticketTypes is not an array:", typeof ticketTypes);
    return [];
  }

  return ticketTypes.map((ticket, index) => {
    console.log(`\n🎫 Processing ticket ${index + 1}:`, {
      name: ticket.name,
      price: ticket.price,
      capacity: ticket.capacity,
      requiresApproval: ticket.requiresApproval,
      approvalQuestionsType: typeof ticket.approvalQuestions,
      approvalQuestionsValue: ticket.approvalQuestions,
    });

    // ✅ Parse capacity BEFORE creating object
    const capacityValue =
      parseInt(ticket.capacity) || parseInt(ticket.quantity) || 100;

    const transformedTicket = {
      name: ticket.name || "General Admission",
      price: parseFloat(ticket.price) || 0,
      capacity: capacityValue, // ✅ Use parsed capacity
      description: ticket.description || "",
      requiresApproval:
        ticket.requiresApproval === true || ticket.requiresApproval === "true",
    };

    // ✅ CRITICAL: Transform approval questions to proper schema format
    if (transformedTicket.requiresApproval && ticket.approvalQuestions) {
      // Case 1: Already an array
      if (Array.isArray(ticket.approvalQuestions)) {
        transformedTicket.approvalQuestions = ticket.approvalQuestions
          .map((q) => {
            if (typeof q === "string") {
              return { question: q, type: "text", required: true };
            }
            return {
              question: q.question || q.text || "",
              type: q.type || "text",
              required: q.required !== false,
              options: q.options || undefined,
            };
          })
          .filter((q) => q.question && q.question.trim());
      }
      // Case 2: Single string
      else if (typeof ticket.approvalQuestions === "string") {
        console.log(
          `✅ Converting string to array: "${ticket.approvalQuestions}"`
        );
        transformedTicket.approvalQuestions = [
          {
            question: ticket.approvalQuestions,
            type: "text",
            required: true,
          },
        ];
      }
      // Case 3: Single object
      else if (
        typeof ticket.approvalQuestions === "object" &&
        ticket.approvalQuestions !== null
      ) {
        console.log(`✅ Wrapping object in array:`, ticket.approvalQuestions);
        transformedTicket.approvalQuestions = [
          {
            question:
              ticket.approvalQuestions.question ||
              ticket.approvalQuestions.text ||
              "",
            type: ticket.approvalQuestions.type || "text",
            required: ticket.approvalQuestions.required !== false,
            options: ticket.approvalQuestions.options || undefined,
          },
        ];
      }

      // Ensure at least one question
      if (
        !transformedTicket.approvalQuestions ||
        transformedTicket.approvalQuestions.length === 0
      ) {
        console.warn(
          `⚠️ Ticket "${ticket.name}" requires approval but has no valid questions.`
        );
        transformedTicket.approvalQuestions = [
          {
            question: "Why would you like to attend this event?",
            type: "text",
            required: true,
          },
        ];
      }

      console.log(
        `✅ Final approval questions for "${transformedTicket.name}":`,
        transformedTicket.approvalQuestions
      );
    } else {
      transformedTicket.approvalQuestions = [];
    }

    // Add additional fields if present
    if (ticket.benefits) transformedTicket.benefits = ticket.benefits;
    if (ticket.accessType) transformedTicket.accessType = ticket.accessType;
    if (ticket.maxAttendees)
      transformedTicket.maxAttendees = parseInt(ticket.maxAttendees);
    if (ticket.approvalDeadline)
      transformedTicket.approvalDeadline = new Date(ticket.approvalDeadline);

    console.log(`✅ Transformed ticket:`, {
      name: transformedTicket.name,
      price: transformedTicket.price,
      capacity: transformedTicket.capacity,
      requiresApproval: transformedTicket.requiresApproval,
      approvalQuestionsCount: transformedTicket.approvalQuestions?.length || 0,
    });

    return transformedTicket;
  });
};

// @desc    Complete draft event creation after service fee payment
// @route   POST /api/v1/transactions/:reference/complete-draft-event
// @access  Private (Organizer only)
const completeDraftEventCreation = async (req, res, next) => {
  try {
    const { reference } = req.params;

    console.log("🎯 Completing draft event creation:", reference);

    // ✅ CRITICAL FIX: Check if event already exists for this transaction FIRST
    const existingTransaction = await Transaction.findOne({
      reference,
      type: "service_fee",
      status: "completed",
    }).populate("eventId");

    if (!existingTransaction) {
      return next(
        new ErrorResponse("Transaction not found or not completed", 404)
      );
    }

    // ✅ CRITICAL: If event already exists, return it immediately
    if (existingTransaction.eventId) {
      console.log("✅ Event already created for this payment:", {
        transactionId: existingTransaction._id,
        eventId: existingTransaction.eventId._id,
        eventTitle: existingTransaction.eventId.title,
      });

      return res.status(200).json({
        success: true,
        message: "Event already created for this payment",
        data: {
          transaction: {
            _id: existingTransaction._id,
            reference: existingTransaction.reference,
            amount: existingTransaction.totalAmount,
            status: existingTransaction.status,
          },
          event: existingTransaction.eventId,
          isDraft: false,
          alreadyProcessed: true,
        },
      });
    }

    // ✅ Authorization checks
    const transactionUserId =
      existingTransaction.userId?._id?.toString() ||
      existingTransaction.userId?.toString();
    const currentUserId = req.user.userId.toString();

    const isTransactionOwner = transactionUserId === currentUserId;
    const isSuperAdmin = req.user.role === "superadmin";
    const isOrganizer = req.user.role === "organizer";

    if (!isTransactionOwner && !isSuperAdmin) {
      return next(
        new ErrorResponse("Not authorized to complete this event.", 403)
      );
    }

    if (!isOrganizer && !isSuperAdmin) {
      return next(new ErrorResponse("Only organizers can create events", 403));
    }

    const isDraft = existingTransaction.metadata?.isDraft;
    if (!isDraft) {
      return next(new ErrorResponse("Not a draft event transaction", 400));
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    // Helper functions
    const parseCapacity = (capacityValue) => {
      if (capacityValue === undefined || capacityValue === null) return 100;
      const num = Number(capacityValue);
      return isNaN(num) ? 100 : Math.max(1, Math.round(num));
    };

    const parsePrice = (priceValue) => {
      if (priceValue === undefined || priceValue === null) return 0;
      const num = Number(priceValue);
      return isNaN(num) ? 0 : Math.max(0, num);
    };

    const sourceEventData = existingTransaction.metadata?.eventData || {};
    const agreementData = existingTransaction.metadata?.agreementData || {};

    console.log("🔍 Source event data:", {
      hasTicketTypes: !!sourceEventData.ticketTypes,
      ticketTypesCount: sourceEventData.ticketTypes?.length,
    });

    // Build agreement object
    const validEstimatedAttendance = [
      "1-100",
      "101-500",
      "501-1000",
      "1001-5000",
      "5001+",
    ];
    const rawEstimatedAttendance =
      agreementData.estimatedAttendance ||
      existingTransaction.metadata?.attendanceRange;

    let estimatedAttendance = "1-100";
    if (
      rawEstimatedAttendance &&
      validEstimatedAttendance.includes(rawEstimatedAttendance)
    ) {
      estimatedAttendance = rawEstimatedAttendance;
    }

    const eventAgreement = {
      acceptedTerms: true,
      acceptedAt: agreementData.acceptedAt
        ? new Date(agreementData.acceptedAt)
        : new Date(),
      serviceFee: agreementData.serviceFee || { type: "percentage", amount: 5 },
      estimatedAttendance: estimatedAttendance,
      paymentTerms: "upfront",
      agreementVersion: agreementData.agreementVersion || "1.0",
      termsUrl: agreementData.termsUrl || undefined,
    };

    // Transform ticket types
    const transformTicketTypes = (ticketTypes) => {
      if (!Array.isArray(ticketTypes)) {
        console.warn("⚠️ ticketTypes is not an array:", typeof ticketTypes);
        return [];
      }

      return ticketTypes.map((ticket, index) => {
        const capacityValue =
          parseInt(ticket.capacity) || parseInt(ticket.quantity) || 100;

        const transformedTicket = {
          name: ticket.name || "General Admission",
          price: parseFloat(ticket.price) || 0,
          capacity: capacityValue,
          description: ticket.description || "",
          requiresApproval:
            ticket.requiresApproval === true ||
            ticket.requiresApproval === "true",
        };

        // Transform approval questions
        if (transformedTicket.requiresApproval && ticket.approvalQuestions) {
          if (Array.isArray(ticket.approvalQuestions)) {
            transformedTicket.approvalQuestions = ticket.approvalQuestions
              .map((q) => {
                if (typeof q === "string") {
                  return { question: q, type: "text", required: true };
                }
                return {
                  question: q.question || q.text || "",
                  type: q.type || "text",
                  required: q.required !== false,
                  options: q.options || undefined,
                };
              })
              .filter((q) => q.question && q.question.trim());
          } else if (typeof ticket.approvalQuestions === "string") {
            transformedTicket.approvalQuestions = [
              {
                question: ticket.approvalQuestions,
                type: "text",
                required: true,
              },
            ];
          } else if (
            typeof ticket.approvalQuestions === "object" &&
            ticket.approvalQuestions !== null
          ) {
            transformedTicket.approvalQuestions = [
              {
                question:
                  ticket.approvalQuestions.question ||
                  ticket.approvalQuestions.text ||
                  "",
                type: ticket.approvalQuestions.type || "text",
                required: ticket.approvalQuestions.required !== false,
                options: ticket.approvalQuestions.options || undefined,
              },
            ];
          }

          if (
            !transformedTicket.approvalQuestions ||
            transformedTicket.approvalQuestions.length === 0
          ) {
            transformedTicket.approvalQuestions = [
              {
                question: "Why would you like to attend this event?",
                type: "text",
                required: true,
              },
            ];
          }
        } else {
          transformedTicket.approvalQuestions = [];
        }

        if (ticket.benefits) transformedTicket.benefits = ticket.benefits;
        if (ticket.accessType) transformedTicket.accessType = ticket.accessType;
        if (ticket.maxAttendees)
          transformedTicket.maxAttendees = parseInt(ticket.maxAttendees);
        if (ticket.approvalDeadline)
          transformedTicket.approvalDeadline = new Date(
            ticket.approvalDeadline
          );

        return transformedTicket;
      });
    };

    const transformedTicketTypes = sourceEventData.ticketTypes
      ? transformTicketTypes(sourceEventData.ticketTypes)
      : [];

    console.log("🎫 Ticket types transformation complete:", {
      originalCount: sourceEventData.ticketTypes?.length || 0,
      transformedCount: transformedTicketTypes.length,
    });

    // Build final event data
    const finalEventData = {
      ...sourceEventData,

      capacity: parseCapacity(sourceEventData.capacity),
      price: parsePrice(sourceEventData.price),

      organizer: req.user.userId,
      status: "published",
      isActive: true,
      serviceFeePaymentStatus: "paid",
      serviceFeeReference: reference,
      serviceFeeTransaction: existingTransaction._id,
      publishedAt: new Date(),

      agreement: eventAgreement,

      title: sourceEventData.title || "Event Title",
      description: sourceEventData.description || "Event description",
      date: sourceEventData.date || sourceEventData.startDate || new Date(),
      startDate:
        sourceEventData.startDate || sourceEventData.date || new Date(),
      endDate:
        sourceEventData.endDate ||
        sourceEventData.startDate ||
        sourceEventData.date ||
        new Date(),
      time: sourceEventData.time || "12:00",
      endTime: sourceEventData.endTime || "13:00",

      city: sourceEventData.city || sourceEventData.state || "Lagos",
      state: sourceEventData.state || "Lagos",
      venue: sourceEventData.venue || "Venue",
      address: sourceEventData.address || "Address",
      category: sourceEventData.category || "Other",
      eventType: sourceEventData.eventType || "physical",

      availableTickets: parseCapacity(sourceEventData.capacity),
      totalTickets: parseCapacity(sourceEventData.capacity),

      ticketTypes: transformedTicketTypes,
    };

    console.log("🛠 Final event data prepared:", {
      title: finalEventData.title,
      ticketTypesCount: finalEventData.ticketTypes?.length,
    });

    // ✅ CRITICAL: Create event with transaction lock
    const event = await Event.create(finalEventData);

    // ✅ CRITICAL: Immediately update transaction to link event
    existingTransaction.eventId = event._id;
    existingTransaction.metadata.isDraft = false;
    existingTransaction.metadata.eventCreatedAt = new Date();
    await existingTransaction.save();

    console.log("✅ Event created successfully:", {
      eventId: event._id,
      title: event.title,
      ticketTypes: event.ticketTypes?.length,
    });

    res.status(201).json({
      success: true,
      message: "Event created and published successfully",
      data: {
        transaction: {
          _id: existingTransaction._id,
          reference: existingTransaction.reference,
          amount: existingTransaction.totalAmount,
          status: existingTransaction.status,
        },
        event,
        isDraft: false,
      },
    });
  } catch (error) {
    console.error("💥 Error completing draft event:", error);

    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors)
        .map((err) => err.message)
        .join(", ");
      return next(
        new ErrorResponse(`Event validation failed: ${errorMessages}`, 400)
      );
    }

    if (error.code === 11000) {
      return next(
        new ErrorResponse("Event with similar details already exists", 400)
      );
    }

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
  completeDraftEventCreation,
};
