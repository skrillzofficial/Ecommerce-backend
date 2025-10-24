const Notification = require("../models/notification");

class NotificationService {
  /**
   * Create a new notification
   */
  static async createNotification(notificationData) {
    try {
      const notification = new Notification(notificationData);
      await notification.save();

      // Emit real-time event (for WebSocket)
      this.emitNotification(notification);

      return notification;
    } catch (error) {
      console.error("Error creating notification:", error);
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  /**
   * Create ticket purchase notification
   */
  static async createTicketPurchaseNotification(userId, ticketData, eventData) {
    try {
      const notification = await Notification.createTicketPurchaseNotification(
        userId,
        ticketData,
        eventData
      );

      return notification;
    } catch (error) {
      console.error("Error creating ticket purchase notification:", error);
      throw error;
    }
  }

  /**
   * Create login notification
   */
  static async createLoginNotification(userId, loginData) {
    try {
      const notification = await Notification.createLoginNotification(
        userId,
        loginData
      );

      return notification;
    } catch (error) {
      console.error("Error creating login notification:", error);
      throw error;
    }
  }

  /**
   * Create event reminder notification
   */
  static async createEventReminderNotification(userId, eventData, daysUntil) {
    try {
      const notification = await Notification.createEventReminderNotification(
        userId,
        eventData,
        daysUntil
      );

      return notification;
    } catch (error) {
      console.error("Error creating event reminder notification:", error);
      throw error;
    }
  }

  /**
   * Create security alert notification
   */
  static async createSecurityAlertNotification(userId, alertData) {
    try {
      const notification = await Notification.createSecurityAlertNotification(
        userId,
        alertData
      );

      return notification;
    } catch (error) {
      console.error("Error creating security alert notification:", error);
      throw error;
    }
  }

  /**
   * Create event update notification
   */
  static async createEventUpdateNotification(userId, eventData, updateType) {
    try {
      const notification = await this.createNotification({
        user: userId,
        type: "event_update",
        title: "Event Updated 🔄",
        message: `"${eventData.title}" has been ${updateType}`,
        data: {
          eventId: eventData._id,
          eventTitle: eventData.title,
          updateType: updateType,
          updatedAt: new Date(),
        },
        relatedEntity: eventData._id,
        relatedEntityModel: "Event",
        priority: "medium",
      });

      return notification;
    } catch (error) {
      console.error("Error creating event update notification:", error);
      throw error;
    }
  }

  /**
   * Create promotional notification
   */
  static async createPromotionalNotification(userId, promoData) {
    try {
      const notification = await this.createNotification({
        user: userId,
        type: "promotional",
        title: promoData.title || "Special Offer! ",
        message: promoData.message,
        data: {
          promoCode: promoData.promoCode,
          discount: promoData.discount,
          validUntil: promoData.validUntil,
          ...promoData.extraData,
        },
        priority: "low",
        expiresAt:
          promoData.validUntil ||
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
      });

      return notification;
    } catch (error) {
      console.error("Error creating promotional notification:", error);
      throw error;
    }
  }

  /**
   * Create system notification
   */
  static async createSystemNotification(userId, systemData) {
    try {
      const notification = await this.createNotification({
        user: userId,
        type: "system",
        title: systemData.title || "System Notification ⚙️",
        message: systemData.message,
        data: {
          actionRequired: systemData.actionRequired || false,
          ...systemData.extraData,
        },
        priority: systemData.priority || "medium",
      });

      return notification;
    } catch (error) {
      console.error("Error creating system notification:", error);
      throw error;
    }
  }

  /**
   * Create profile update notification
   */
  // In service/notificationService.js
// Change this method:
static async createProfileUpdateNotification(userId, updateMessage) {
  try {
    const notification = await this.createNotification({
      user: userId,
      type: "profile_update",
      title: "Profile Updated ✏️",
      message: updateMessage || "Your profile has been successfully updated", // Accept the message parameter
      data: {
        updatedAt: new Date(),
      },
      priority: "low",
    });

    return notification;
  } catch (error) {
    console.error("Error creating profile update notification:", error);
    throw error;
  }
}
  /**
   * Get user notifications with pagination and filtering
   */
  static async getUserNotifications(userId, options = {}) {
    try {
      const {
        limit = 20,
        page = 1,
        unreadOnly = false,
        types = [],
        priority = null,
        includeExpired = false,
      } = options;

      let query = { user: userId };

      if (unreadOnly) {
        query.isRead = false;
      }

      if (types.length > 0) {
        query.type = { $in: types };
      }

      if (priority) {
        query.priority = priority;
      }

      if (!includeExpired) {
        query.$or = [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }];
      }

      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(query)
          .sort({ createdAt: -1, priority: -1 })
          .limit(parseInt(limit))
          .skip((parseInt(page) - 1) * parseInt(limit))
          .lean(),

        Notification.countDocuments(query),

        Notification.countDocuments({
          user: userId,
          isRead: false,
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        }),
      ]);

      return {
        notifications,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        unreadCount,
      };
    } catch (error) {
      console.error("Error getting user notifications:", error);
      throw new Error(`Failed to get notifications: ${error.message}`);
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, user: userId },
        { isRead: true },
        { new: true }
      );

      if (!notification) {
        throw new Error("Notification not found or access denied");
      }

      return notification;
    } catch (error) {
      console.error("Error marking notification as read:", error);
      throw new Error(`Failed to mark notification as read: ${error.message}`);
    }
  }

  /**
   * Mark all notifications as read for user
   */
  static async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        {
          user: userId,
          isRead: false,
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        },
        { isRead: true }
      );

      return {
        message: "All notifications marked as read",
        updatedCount: result.modifiedCount,
      };
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      throw new Error(
        `Failed to mark all notifications as read: ${error.message}`
      );
    }
  }

  /**
   * Get unread notifications count
   */
  static async getUnreadCount(userId) {
    try {
      const count = await Notification.countDocuments({
        user: userId,
        isRead: false,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      });

      return { count };
    } catch (error) {
      console.error("Error getting unread count:", error);
      throw new Error(`Failed to get unread count: ${error.message}`);
    }
  }

  /**
   * Delete a notification
   */
  static async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        user: userId,
      });

      if (!notification) {
        throw new Error("Notification not found or access denied");
      }

      return { message: "Notification deleted successfully" };
    } catch (error) {
      console.error("Error deleting notification:", error);
      throw new Error(`Failed to delete notification: ${error.message}`);
    }
  }

  /**
   * Clean up expired notifications
   */
  static async cleanupExpiredNotifications() {
    try {
      const result = await Notification.deleteMany({
        expiresAt: { $lt: new Date() },
      });

      console.log(`Cleaned up ${result.deletedCount} expired notifications`);
      return result;
    } catch (error) {
      console.error("Error cleaning up expired notifications:", error);
      throw error;
    }
  }

  /**
   * Bulk create notifications for multiple users
   */
  static async bulkCreateNotifications(userIds, notificationData) {
    try {
      const notifications = userIds.map((userId) => ({
        ...notificationData,
        user: userId,
      }));

      const result = await Notification.insertMany(notifications);

      // Emit real-time events for each notification
      result.forEach((notification) => {
        this.emitNotification(notification);
      });

      return result;
    } catch (error) {
      console.error("Error creating bulk notifications:", error);
      throw new Error(`Failed to create bulk notifications: ${error.message}`);
    }
  }

  /**
   * Create notification for all event attendees
   */
  static async notifyEventAttendees(eventId, attendees, notificationData) {
    try {
      const userIds = attendees.map(
        (attendee) => attendee.user?._id || attendee.user
      );

      const notifications = await this.bulkCreateNotifications(userIds, {
        ...notificationData,
        data: {
          ...notificationData.data,
          eventId: eventId,
        },
        relatedEntity: eventId,
        relatedEntityModel: "Event",
      });

      return notifications;
    } catch (error) {
      console.error("Error notifying event attendees:", error);
      throw error;
    }
  }

  /**
   * Emit real-time notification via WebSocket
   */
  static emitNotification(notification) {
    try {
      // Check if WebSocket is available
      if (global.io) {
        global.io.to(notification.user.toString()).emit("new_notification", {
          ...(notification.toObject ? notification.toObject() : notification),
          realTime: true,
        });
      }

      // Also emit to admin rooms if it's a high priority notification
      if (
        notification.priority === "high" ||
        notification.priority === "critical"
      ) {
        if (global.io) {
          global.io.to("admin").emit("admin_notification", {
            ...(notification.toObject ? notification.toObject() : notification),
            realTime: true,
          });
        }
      }
    } catch (error) {
      console.error("Error emitting notification:", error);
      // Don't throw error here as it shouldn't break the main flow
    }
  }

  /**
   * Get notification statistics for dashboard
   */
  static async getNotificationStats(userId = null) {
    try {
      const matchStage = userId ? { user: userId } : {};

      const stats = await Notification.aggregate([
        { $match: matchStage },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            readCount: [{ $match: { isRead: true } }, { $count: "count" }],
            unreadCount: [{ $match: { isRead: false } }, { $count: "count" }],
            byType: [
              {
                $group: {
                  _id: "$type",
                  count: { $sum: 1 },
                  unread: {
                    $sum: { $cond: [{ $eq: ["$isRead", false] }, 1, 0] },
                  },
                },
              },
            ],
            byPriority: [
              {
                $group: {
                  _id: "$priority",
                  count: { $sum: 1 },
                  unread: {
                    $sum: { $cond: [{ $eq: ["$isRead", false] }, 1, 0] },
                  },
                },
              },
            ],
            recentActivity: [
              { $sort: { createdAt: -1 } },
              { $limit: 10 },
              {
                $project: {
                  type: 1,
                  title: 1,
                  isRead: 1,
                  createdAt: 1,
                  priority: 1,
                },
              },
            ],
          },
        },
      ]);

      return stats[0];
    } catch (error) {
      console.error("Error getting notification stats:", error);
      throw new Error(
        `Failed to get notification statistics: ${error.message}`
      );
    }
  }
}

module.exports = NotificationService;
