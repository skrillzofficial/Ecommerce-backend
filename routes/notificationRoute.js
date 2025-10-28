const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const NotificationService = require('../service/notificationService');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get user notifications
// @route   GET /api/v1/notifications
// @access  Private
const getNotifications = async (req, res, next) => {
  try {
    const { limit = 20, page = 1, unreadOnly, types, priority } = req.query;
    
    const result = await NotificationService.getUserNotifications(req.user.userId, {
      limit: parseInt(limit),
      page: parseInt(page),
      unreadOnly: unreadOnly === 'true',
      types: types ? types.split(',') : [],
      priority: priority || null
    });
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    next(new ErrorResponse('Failed to fetch notifications', 500));
  }
};

// @desc    Get unread notifications count
// @route   GET /api/v1/notifications/unread-count
// @access  Private
const getUnreadCount = async (req, res, next) => {
  try {
    const result = await NotificationService.getUnreadCount(req.user.userId);
    res.status(200).json({
      success: true,
      data: {
        unreadCount: result.count
      }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    next(new ErrorResponse('Failed to fetch unread count', 500));
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/v1/notifications/:id/read
// @access  Private
const markAsRead = async (req, res, next) => {
  try {
    const notification = await NotificationService.markAsRead(req.params.id, req.user.userId);
    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: { notification }
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    
    // Handle specific errors
    if (error.message.includes('not found') || error.message.includes('Not authorized')) {
      return next(new ErrorResponse(error.message, 404));
    }
    
    next(new ErrorResponse(error.message || 'Failed to mark notification as read', 500));
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/v1/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res, next) => {
  try {
    const result = await NotificationService.markAllAsRead(req.user.userId);
    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: result
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    next(new ErrorResponse('Failed to mark all notifications as read', 500));
  }
};

// @desc    Delete notification
// @route   DELETE /api/v1/notifications/:id
// @access  Private
const deleteNotification = async (req, res, next) => {
  try {
    const result = await NotificationService.deleteNotification(req.params.id, req.user.userId);
    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
      data: result
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    
    // Handle specific errors
    if (error.message.includes('not found') || error.message.includes('Not authorized')) {
      return next(new ErrorResponse(error.message, 404));
    }
    
    next(new ErrorResponse(error.message || 'Failed to delete notification', 500));
  }
};

// @desc    Get notification statistics
// @route   GET /api/v1/notifications/stats
// @access  Private
const getNotificationStats = async (req, res, next) => {
  try {
    const stats = await NotificationService.getNotificationStats(req.user.userId);
    res.status(200).json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    next(new ErrorResponse('Failed to fetch notification statistics', 500));
  }
};

// @desc    Create notification (for testing or admin use)
// @route   POST /api/v1/notifications
// @access  Private
const createNotification = async (req, res, next) => {
  try {
    const { title, message, type, priority, data } = req.body;
    
    // Validate required fields
    if (!title || !message) {
      return next(new ErrorResponse('Title and message are required', 400));
    }

    const notification = await NotificationService.createSystemNotification(req.user.userId, {
      title,
      message,
      type: type || 'info',
      priority: priority || 'medium',
      data: data || {}
    });

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: { notification }
    });
  } catch (error) {
    console.error('Create notification error:', error);
    next(new ErrorResponse('Failed to create notification', 500));
  }
};

// ============================================
// ROUTE REGISTRATION
// ============================================

// Read operations
router.get('/unread-count', protect, getUnreadCount);
router.get('/stats', protect, getNotificationStats);
router.get('/', protect, getNotifications);

// Create operation (optional - for testing)
router.post('/', protect, createNotification);

// Update operations
router.patch('/read-all', protect, markAllAsRead);
router.patch('/:id/read', protect, markAsRead);

// Delete operation
router.delete('/:id', protect, deleteNotification);

module.exports = router;