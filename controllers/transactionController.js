const Transaction = require('../models/transaction');
const Event = require('../models/event');
const Ticket = require('../models/ticket');
const User = require('../models/user');
const { initializePayment, verifyPayment } = require('../service/paystackService');
const { sendPaymentEmail, sendBookingEmail } = require('../utils/sendEmail');
const crypto = require('crypto');
const Paystack = require('../service/paystackService');

// Helper functions for webhook
async function handleSuccessfulCharge(data) {
  const transaction = await Transaction.findByReference(data.reference);
  if (transaction && transaction.status === 'pending') {
    await transaction.markAsPaid(data);
  }
}

async function handleFailedCharge(data) {
  const transaction = await Transaction.findByReference(data.reference);
  if (transaction) {
    await transaction.markAsFailed(data.gateway_response);
  }
}

async function handleRefundProcessed(data) {
  const transaction = await Transaction.findByReference(data.reference);
  if (transaction) {
    await transaction.processRefund(null, data.refund_reference);
  }
}

// @desc    Initialize payment for event booking
// @route   POST /api/transactions/initialize
// @access  Private
const initializeTransaction = async (req, res) => {
  try {
    const { eventId, tickets, userInfo } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!eventId || !tickets || tickets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Event ID and tickets are required'
      });
    }

    // Get event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Validate event is bookable
    if (event.status !== 'published') {
      return res.status(400).json({
        success: false,
        message: 'Event is not available for booking'
      });
    }

    if (event.date < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot book tickets for past events'
      });
    }

    // Calculate total amount and validate tickets
    let totalAmount = 0;
    const ticketDetails = [];

    for (const ticket of tickets) {
      const ticketType = event.ticketTypes.find(
        tt => tt.name === ticket.ticketType
      );

      if (!ticketType) {
        return res.status(400).json({
          success: false,
          message: `Ticket type ${ticket.ticketType} not found`
        });
      }

      if (ticketType.availableTickets < ticket.quantity) {
        return res.status(400).json({
          success: false,
          message: `Not enough ${ticket.ticketType} tickets available`
        });
      }

      const subtotal = ticketType.price * ticket.quantity;
      totalAmount += subtotal;

      ticketDetails.push({
        ticketType: ticket.ticketType,
        quantity: ticket.quantity,
        unitPrice: ticketType.price,
        subtotal: subtotal
      });
    }

    // Calculate service fee (2.5% + 100 NGN flat fee)
    const serviceFee = Math.round((totalAmount * 0.025) + 100);
    const finalAmount = totalAmount + serviceFee;

    // Generate unique reference
    const reference = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create transaction record
    const transaction = new Transaction({
      reference,
      userId,
      email: userInfo?.email || req.user.email,
      userName: userInfo?.name || `${req.user.firstName} ${req.user.lastName}`,
      userPhone: userInfo?.phone || req.user.phone,
      eventId: event._id,
      eventTitle: event.title,
      eventDate: event.date,
      eventOrganizer: event.organizer,
      tickets: ticketDetails,
      amount: totalAmount,
      serviceFee,
      totalAmount: finalAmount,
      currency: event.currency,
      status: 'pending',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await transaction.save();

    // Initialize Paystack payment
    const paystackResponse = await initializePayment({
      email: transaction.email,
      amount: finalAmount * 100, 
      reference: reference,
      metadata: {
        transactionId: transaction._id,
        eventId: event._id,
        eventTitle: event.title,
        userId: userId,
        tickets: ticketDetails
      },
      callback_url: `${process.env.FRONTEND_URL}/payment/verify?reference=${reference}`
    });

    // Update transaction with Paystack data
    transaction.authorizationUrl = paystackResponse.data.authorization_url;
    transaction.accessCode = paystackResponse.data.access_code;
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Payment initialized successfully',
      data: {
        transactionId: transaction._id,
        reference: transaction.reference,
        authorizationUrl: transaction.authorizationUrl,
        accessCode: transaction.accessCode,
        amount: transaction.totalAmount,
        currency: transaction.currency
      }
    });

  } catch (error) {
    console.error('Initialize transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize payment',
      error: error.message
    });
  }
};

// @desc    Verify payment
// @route   GET /api/transactions/verify/:reference
// @access  Public
const verifyTransaction = async (req, res) => {
  try {
    const { reference } = req.params;

    // Find transaction
    const transaction = await Transaction.findByReference(reference);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if already verified
    if (transaction.status === 'success') {
      return res.status(200).json({
        success: true,
        message: 'Transaction already verified',
        data: {
          transaction,
          alreadyVerified: true
        }
      });
    }

    // Verify with Paystack
    const paystackResponse = await verifyPayment(reference);

    if (paystackResponse.data.status === 'success') {
      // Mark transaction as paid
      await transaction.markAsPaid(paystackResponse.data);

      // Get event
      const event = await Event.findById(transaction.eventId);
      
      // Book tickets for each ticket type
      const bookedTickets = [];
      for (const ticketItem of transaction.tickets) {
        const bookingResult = await event.bookTicket(
          transaction.userId,
          {
            name: transaction.userName,
            email: transaction.email,
            phone: transaction.userPhone
          },
          ticketItem.ticketType,
          ticketItem.quantity
        );

        bookedTickets.push(bookingResult);
      }

      // Update transaction with ticket IDs
      await transaction.updateMetadata({
        ticketIds: bookedTickets.map(t => t.ticketId),
        ticketNumbers: bookedTickets.map(t => t.ticketNumber),
        qrCodes: bookedTickets.map(t => t.qrCode),
        bookingReference: `BK-${Date.now()}`
      });

      // Format payment date for email
      const paymentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Format amount for email
      const formattedAmount = `₦${transaction.totalAmount.toLocaleString()}`;

      // Send payment confirmation email
      try {
        await sendPaymentEmail({
          fullName: transaction.userName,
          email: transaction.email,
          eventName: event.title,
          paymentId: transaction.reference,
          paymentDate: paymentDate,
          amount: formattedAmount,
          paymentMethod: 'Paystack',
          bookingId: bookedTickets[0]?.ticketId?.toString() || transaction._id.toString(),
          clientUrl: `${process.env.FRONTEND_URL}/bookings/${bookedTickets[0]?.ticketId || transaction._id}`
        });
      } catch (emailError) {
        console.error("Failed to send payment email:", emailError);
        // Don't fail the transaction if email fails
      }

      // Send booking confirmation email with ticket details
      try {
        const eventDate = new Date(event.date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        // Prepare detailed ticket information for email
        const totalTicketDetails = `
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0;"><strong>Ticket Summary:</strong></td>
              <td style="padding: 5px 0; text-align: right;"></td>
            </tr>
            ${transaction.tickets.map(ticket => `
              <tr>
                <td style="padding: 5px 0;">${ticket.ticketType} x ${ticket.quantity}</td>
                <td style="padding: 5px 0; text-align: right;">₦${(ticket.unitPrice * ticket.quantity).toLocaleString()}</td>
              </tr>
            `).join('')}
            <tr>
              <td style="padding: 5px 0;">Service Fee</td>
              <td style="padding: 5px 0; text-align: right;">₦${transaction.serviceFee.toLocaleString()}</td>
            </tr>
            <tr style="border-top: 1px solid #e0e0e0;">
              <td style="padding: 5px 0;"><strong>Total Amount</strong></td>
              <td style="padding: 5px 0; text-align: right;"><strong>${formattedAmount}</strong></td>
            </tr>
          </table>
        `;

        await sendBookingEmail({
          fullName: transaction.userName,
          email: transaction.email,
          eventName: event.title,
          eventDate: eventDate,
          eventTime: event.time,
          eventVenue: event.venue,
          eventAddress: event.address,
          bookingId: bookedTickets[0]?.ticketId?.toString() || transaction._id.toString(),
          ticketDetails: totalTicketDetails,
          totalAmount: formattedAmount,
          clientUrl: `${process.env.FRONTEND_URL}/bookings/${bookedTickets[0]?.ticketId || transaction._id}`
        });
      } catch (bookingEmailError) {
        console.error("Failed to send booking confirmation email:", bookingEmailError);
      }

      return res.status(200).json({
        success: true,
        message: 'Payment verified and tickets booked successfully',
        data: {
          transaction,
          tickets: bookedTickets,
          event: {
            title: event.title,
            date: event.date,
            venue: event.venue,
            address: event.address
          }
        }
      });

    } else {
      // Payment failed
      await transaction.markAsFailed(paystackResponse.data.gateway_response);

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        data: {
          transaction,
          reason: paystackResponse.data.gateway_response
        }
      });
    }

  } catch (error) {
    console.error('Verify transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
};

// @desc    Get user transactions
// @route   GET /api/transactions/my-transactions
// @access  Private
const getUserTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20, status, eventId } = req.query;

    const transactions = await Transaction.getUserTransactions(userId, {
      limit: parseInt(limit),
      status,
      eventId
    });

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });

  } catch (error) {
    console.error('Get user transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
};

// @desc    Get single transaction
// @route   GET /api/transactions/:id
// @access  Private
const getTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('eventId', 'title date venue address city category')
      .populate('userId', 'firstName lastName email phone')
      .populate('tickets.ticketId');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check authorization
    if (transaction.userId._id.toString() !== req.user._id.toString() &&
        transaction.eventOrganizer?.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this transaction'
      });
    }

    res.status(200).json({
      success: true,
      data: transaction
    });

  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction',
      error: error.message
    });
  }
};

// @desc    Get event transactions (for organizers)
// @route   GET /api/transactions/event/:eventId
// @access  Private
const getEventTransactions = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status, limit } = req.query;

    // Verify user is event organizer
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view event transactions'
      });
    }

    const transactions = await Transaction.getEventTransactions(eventId, {
      status,
      limit: limit ? parseInt(limit) : undefined
    });

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });

  } catch (error) {
    console.error('Get event transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event transactions',
      error: error.message
    });
  }
};

// @desc    Request refund
// @route   POST /api/transactions/:id/refund
// @access  Private
const requestRefund = async (req, res) => {
  try {
    const { reason } = req.body;
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Verify user owns transaction
    if (transaction.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Check if refundable
    if (!transaction.isRefundable) {
      return res.status(400).json({
        success: false,
        message: 'Transaction is not eligible for refund'
      });
    }

    await transaction.requestRefund(reason, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Refund request submitted successfully',
      data: transaction
    });

  } catch (error) {
    console.error('Request refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request refund',
      error: error.message
    });
  }
};

// @desc    Process refund (Admin/Organizer)
// @route   PUT /api/transactions/:id/refund/process
// @access  Private (Admin/Organizer)
const processRefund = async (req, res) => {
  try {
    const { action, rejectionReason } = req.body; // action: 'approve' or 'reject'
    const transaction = await Transaction.findById(req.params.id)
      .populate('eventId');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Verify user is event organizer or admin
    if (transaction.eventOrganizer.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    if (action === 'approve') {
      // Process refund with Paystack (implement Paystack refund API)
      const refundReference = `REFUND-${Date.now()}`;
      await transaction.processRefund(req.user._id, refundReference);

      // Cancel booking in event
      await transaction.eventId.cancelBooking(transaction.userId);

      res.status(200).json({
        success: true,
        message: 'Refund processed successfully',
        data: transaction
      });

    } else if (action === 'reject') {
      await transaction.rejectRefund(rejectionReason, req.user._id);

      res.status(200).json({
        success: true,
        message: 'Refund request rejected',
        data: transaction
      });

    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "approve" or "reject"'
      });
    }

  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message
    });
  }
};

// @desc    Get revenue statistics
// @route   GET /api/transactions/stats/revenue
// @access  Private (Organizer/Admin)
const getRevenueStats = async (req, res) => {
  try {
    const { eventId, startDate, endDate } = req.query;
    const filters = {};

    if (eventId) {
      // Verify user is organizer
      const event = await Event.findById(eventId);
      if (event.organizer.toString() !== req.user._id.toString() &&
          req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized'
        });
      }
      filters.eventId = eventId;
    } else {
      // Get stats for all user's events
      filters.organizerId = req.user._id;
    }

    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const stats = await Transaction.getRevenueStats(filters);

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get revenue stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue statistics',
      error: error.message
    });
  }
};

// @desc    Webhook handler for Paystack
// @route   POST /api/transactions/webhook
// @access  Public (Paystack only)
const paystackWebhook = async (req, res) => {
  try {
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).send('Invalid signature');
    }

    const event = req.body;

    switch (event.event) {
      case 'charge.success':
        await handleSuccessfulCharge(event.data);
        break;
      
      case 'charge.failed':
        await handleFailedCharge(event.data);
        break;
      
      case 'refund.processed':
        await handleRefundProcessed(event.data);
        break;
      
      default:
        console.log('Unhandled webhook event:', event.event);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error processing webhook');
  }
};

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
  handleSuccessfulCharge,
  handleFailedCharge,
  handleRefundProcessed
};