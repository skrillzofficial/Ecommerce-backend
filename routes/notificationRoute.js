const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth'); // FIXED: Destructure protect
const NotificationService = require('../service/notificationService');
const ErrorResponse = require('../utils/errorResponse');

// Handler functions
const getNotifications = async (req, res, next) => {
  try {
    const { limit, page, unreadOnly, types, priority } = req.query;
    const result = await NotificationService.getUserNotifications(req.user.userId, {
      limit: parseInt(limit) || 20,
      page: parseInt(page) || 1,
      unreadOnly: unreadOnly === 'true',
      types: types ? types.split(',') : [],
      priority: priority || null
    });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Get notifications error:', error);
    next(new ErrorResponse('Failed to fetch notifications', 500));
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const result = await NotificationService.getUnreadCount(req.user.userId);
    res.status(200).json({ success: true, unreadCount: result.count });
  } catch (error) {
    console.error('Get unread count error:', error);
    next(new ErrorResponse('Failed to fetch unread count', 500));
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const notification = await NotificationService.markAsRead(req.params.id, req.user.userId);
    res.status(200).json({ success: true, message: 'Notification marked as read', notification });
  } catch (error) {
    console.error('Mark as read error:', error);
    next(new ErrorResponse(error.message || 'Failed to mark notification as read', 500));
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    const result = await NotificationService.markAllAsRead(req.user.userId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Mark all as read error:', error);
    next(new ErrorResponse('Failed to mark all notifications as read', 500));
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    const result = await NotificationService.deleteNotification(req.params.id, req.user.userId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Delete notification error:', error);
    next(new ErrorResponse(error.message || 'Failed to delete notification', 500));
  }
};

const getNotificationStats = async (req, res, next) => {
  try {
    const stats = await NotificationService.getNotificationStats(req.user.userId);
    res.status(200).json({ success: true, stats });
  } catch (error) {
    console.error('Get notification stats error:', error);
    next(new ErrorResponse('Failed to fetch notification statistics', 500));
  }
};

// Register routes - FIXED: Use protect instead of auth
router.get('/unread-count', protect, getUnreadCount);
router.get('/stats', protect, getNotificationStats);
router.get('/', protect, getNotifications);
router.patch('/read-all', protect, markAllAsRead);
router.patch('/:id/read', protect, markAsRead);
router.delete('/:id', protect, deleteNotification);

module.exports = router;