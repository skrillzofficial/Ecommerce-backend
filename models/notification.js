const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'ticket_purchase', 
      'event_reminder', 
      'event_update', 
      'event_cancelled', // ADDED: For cancelled events
      'booking_confirmed', // ADDED: Booking status updates
      'booking_cancelled', // ADDED: Booking cancellations
      'payment_success', // ADDED: Payment confirmations
      'payment_failed', // ADDED: Payment failures
      'refund_processed', // ADDED: Refund notifications
      'system', 
      'promotional',
      'login_alert',
      'security_alert',
      'profile_update'
    ],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  relatedEntity: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedEntityModel'
  },
  relatedEntityModel: {
    type: String,
    enum: ['Event', 'Ticket', 'Booking', 'Transaction', 'User', 'LoginSession', null]
  },
  expiresAt: {
    type: Date,
    default: null
  },
  // ADDED: Delivery status for push/email notifications
  deliveryStatus: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    push: { type: Boolean, default: false },
    sms: { type: Boolean, default: false }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 }); // ADDED: For type-based queries
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for checking if notification is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for notification age in hours
notificationSchema.virtual('ageInHours').get(function() {
  return (new Date() - this.createdAt) / (1000 * 60 * 60);
});

// ============ STATIC METHODS ============

// Static method to create login notification
notificationSchema.statics.createLoginNotification = async function(userId, loginData) {
  const { ipAddress, device, location, isSuspicious = false } = loginData;
  
  let title, message, priority;
  
  if (isSuspicious) {
    title = '🚨 Suspicious Login Detected';
    message = `New login from ${device} at ${location} (IP: ${ipAddress}). If this wasn't you, please secure your account.`;
    priority = 'critical';
  } else {
    title = '🔐 New Login';
    message = `New login from ${device} at ${location} (IP: ${ipAddress}).`;
    priority = 'medium';
  }

  return await this.create({
    user: userId,
    type: 'login_alert',
    title,
    message,
    data: {
      ipAddress,
      device,
      location,
      isSuspicious,
      loginTime: new Date()
    },
    priority
  });
};

// UPDATED: Ticket purchase notification to match your schemas
notificationSchema.statics.createTicketPurchaseNotification = async function(userId, bookingData, eventData) {
  return await this.create({
    user: userId,
    type: 'ticket_purchase',
    title: '🎉 Ticket Purchase Confirmed!',
    message: `You successfully purchased ${bookingData.totalTickets} ticket(s) for "${eventData.title}"`,
    data: {
      bookingId: bookingData._id,
      eventId: eventData._id,
      eventTitle: eventData.title,
      ticketQuantity: bookingData.totalTickets,
      totalAmount: bookingData.totalAmount,
      eventStartDate: eventData.startDate, // UPDATED: Use startDate
      orderNumber: bookingData.orderNumber
    },
    relatedEntity: bookingData._id,
    relatedEntityModel: 'Booking',
    priority: 'medium'
  });
};

// UPDATED: Event reminder notification to match your schemas
notificationSchema.statics.createEventReminderNotification = async function(userId, eventData, daysUntil) {
  return await this.create({
    user: userId,
    type: 'event_reminder',
    title: '⏰ Event Reminder',
    message: `"${eventData.title}" is in ${daysUntil} day${daysUntil > 1 ? 's' : ''}!`,
    data: {
      eventId: eventData._id,
      eventTitle: eventData.title,
      eventStartDate: eventData.startDate, // UPDATED: Use startDate
      eventEndDate: eventData.endDate, // ADDED: For multi-day events
      daysUntil: daysUntil
    },
    relatedEntity: eventData._id,
    relatedEntityModel: 'Event',
    priority: 'medium',
    expiresAt: new Date(eventData.startDate) // UPDATED: Use startDate
  });
};

// NEW: Booking confirmation notification
notificationSchema.statics.createBookingConfirmationNotification = async function(userId, bookingData) {
  return await this.create({
    user: userId,
    type: 'booking_confirmed',
    title: '✅ Booking Confirmed',
    message: `Your booking #${bookingData.orderNumber} has been confirmed.`,
    data: {
      bookingId: bookingData._id,
      orderNumber: bookingData.orderNumber,
      totalTickets: bookingData.totalTickets,
      totalAmount: bookingData.totalAmount
    },
    relatedEntity: bookingData._id,
    relatedEntityModel: 'Booking',
    priority: 'medium'
  });
};

// NEW: Payment success notification
notificationSchema.statics.createPaymentSuccessNotification = async function(userId, transactionData) {
  return await this.create({
    user: userId,
    type: 'payment_success',
    title: '💳 Payment Successful',
    message: `Your payment of ${transactionData.currency} ${transactionData.totalAmount} was processed successfully.`,
    data: {
      transactionId: transactionData._id,
      reference: transactionData.reference,
      amount: transactionData.totalAmount,
      currency: transactionData.currency
    },
    relatedEntity: transactionData._id,
    relatedEntityModel: 'Transaction',
    priority: 'medium'
  });
};

// NEW: Payment failed notification
notificationSchema.statics.createPaymentFailedNotification = async function(userId, transactionData) {
  return await this.create({
    user: userId,
    type: 'payment_failed',
    title: '❌ Payment Failed',
    message: `Your payment failed. Reason: ${transactionData.failureReason || 'Unknown error'}`,
    data: {
      transactionId: transactionData._id,
      reference: transactionData.reference,
      failureReason: transactionData.failureReason,
      attempts: transactionData.attempts
    },
    relatedEntity: transactionData._id,
    relatedEntityModel: 'Transaction',
    priority: 'high'
  });
};

// NEW: Refund processed notification
notificationSchema.statics.createRefundNotification = async function(userId, refundData) {
  return await this.create({
    user: userId,
    type: 'refund_processed',
    title: '💰 Refund Processed',
    message: `Your refund of ${refundData.currency} ${refundData.amount} has been processed.`,
    data: {
      refundAmount: refundData.amount,
      currency: refundData.currency,
      refundDate: refundData.processedAt,
      reason: refundData.reason
    },
    priority: 'medium'
  });
};

// NEW: Event cancellation notification
notificationSchema.statics.createEventCancellationNotification = async function(userId, eventData) {
  return await this.create({
    user: userId,
    type: 'event_cancelled',
    title: '🚫 Event Cancelled',
    message: `"${eventData.title}" has been cancelled. Your tickets will be refunded automatically.`,
    data: {
      eventId: eventData._id,
      eventTitle: eventData.title,
      cancellationReason: eventData.cancellationReason
    },
    relatedEntity: eventData._id,
    relatedEntityModel: 'Event',
    priority: 'high'
  });
};

// Static method to create security alert notification
notificationSchema.statics.createSecurityAlertNotification = async function(userId, alertData) {
  const { alertType, description, severity = 'medium' } = alertData;
  
  const priorityMap = {
    low: 'low',
    medium: 'medium', 
    high: 'high',
    critical: 'critical'
  };

  return await this.create({
    user: userId,
    type: 'security_alert',
    title: `🛡️ Security Alert: ${alertType}`,
    message: description,
    data: {
      alertType,
      severity,
      alertTime: new Date()
    },
    priority: priorityMap[severity] || 'medium'
  });
};

// ============ INSTANCE METHODS ============

// Instance method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  return this.save();
};

// NEW: Mark for email delivery
notificationSchema.methods.markEmailSent = function() {
  this.deliveryStatus.email = true;
  return this.save();
};

// NEW: Mark for push delivery
notificationSchema.methods.markPushSent = function() {
  this.deliveryStatus.push = true;
  return this.save();
};

// ============ QUERY METHODS ============

// Static method to get user notifications with pagination
notificationSchema.statics.getUserNotifications = async function(userId, options = {}) {
  const {
    limit = 20,
    page = 1,
    unreadOnly = false,
    types = [],
    priority = null
  } = options;

  const query = { user: userId };
  
  if (unreadOnly) {
    query.isRead = false;
  }
  
  if (types.length > 0) {
    query.type = { $in: types };
  }
  
  if (priority) {
    query.priority = priority;
  }

  const [notifications, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1, priority: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    notifications,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    unreadCount: unreadOnly ? total : await this.countDocuments({ 
      user: userId, 
      isRead: false 
    })
  };
};

// NEW: Get unread notifications count
notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({ 
    user: userId, 
    isRead: false 
  });
};

// NEW: Mark all as read for user
notificationSchema.statics.markAllAsRead = async function(userId) {
  return await this.updateMany(
    { user: userId, isRead: false },
    { $set: { isRead: true } }
  );
};

// NEW: Clean up old notifications (for cron job)
notificationSchema.statics.cleanupOldNotifications = async function(daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    priority: { $in: ['low', 'medium'] } // Keep high/critical notifications longer
  });
};

module.exports = mongoose.model('Notification', notificationSchema);