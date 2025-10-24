// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // For faster queries
  },
  type: {
    type: String,
    enum: [
      'ticket_purchase', 
      'event_reminder', 
      'event_update', 
      'system', 
      'promotional',
      'login_alert', // New type for login notifications
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
    index: true // For faster unread notifications queries
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
    enum: ['Event', 'Ticket', 'User', 'LoginSession', null]
  },
  expiresAt: {
    type: Date,
    default: null // For temporary notifications that auto-delete
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired notifications

// Virtual for checking if notification is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

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

// Static method to create ticket purchase notification
notificationSchema.statics.createTicketPurchaseNotification = async function(userId, ticketData, eventData) {
  return await this.create({
    user: userId,
    type: 'ticket_purchase',
    title: '🎉 Ticket Purchase Confirmed!',
    message: `You successfully purchased ${ticketData.quantity} ticket(s) for "${eventData.title}"`,
    data: {
      ticketId: ticketData._id,
      eventId: eventData._id,
      eventTitle: eventData.title,
      ticketQuantity: ticketData.quantity,
      totalAmount: ticketData.totalAmount,
      eventDate: eventData.date
    },
    relatedEntity: ticketData._id,
    relatedEntityModel: 'Ticket',
    priority: 'medium'
  });
};

// Static method to create event reminder notification
notificationSchema.statics.createEventReminderNotification = async function(userId, eventData, daysUntil) {
  return await this.create({
    user: userId,
    type: 'event_reminder',
    title: '⏰ Event Reminder',
    message: `"${eventData.title}" is in ${daysUntil} day${daysUntil > 1 ? 's' : ''}!`,
    data: {
      eventId: eventData._id,
      eventTitle: eventData.title,
      eventDate: eventData.date,
      daysUntil: daysUntil
    },
    relatedEntity: eventData._id,
    relatedEntityModel: 'Event',
    priority: 'medium',
    expiresAt: new Date(eventData.date) // Auto-delete after event
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

// Instance method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  return this.save();
};

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

module.exports = mongoose.model('Notification', notificationSchema);