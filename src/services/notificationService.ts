import { Context } from '@devvit/public-api';

// Real-time notification interfaces for requirements 5.2, 5.4
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  timestamp: number;
  read: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  expiresAt?: number;
}

export type NotificationType = 
  | 'story_update'
  | 'new_sentence'
  | 'branch_created'
  | 'vote_received'
  | 'achievement_earned'
  | 'story_completed'
  | 'mention'
  | 'moderation_action'
  | 'system_announcement';

export interface NotificationQueue {
  userId: string;
  notifications: Notification[];
  lastProcessed: number;
  deliveryStatus: 'pending' | 'delivered' | 'failed';
}

export interface BroadcastMessage {
  id: string;
  storyId: string;
  type: 'story_update' | 'user_joined' | 'user_left' | 'typing_start' | 'typing_stop' | 'sentence_added';
  data: Record<string, any>;
  timestamp: number;
  senderId?: string;
}

export interface DeliveryConfirmation {
  notificationId: string;
  userId: string;
  deliveredAt: number;
  status: 'delivered' | 'failed' | 'expired';
  retryCount: number;
}

// Real-time presence and typing interfaces for requirement 5.1, 5.5
export interface TypingIndicator {
  userId: string;
  username: string;
  storyId: string;
  branchId?: string;
  startedAt: number;
  lastActivity: number;
  isTyping: boolean;
}

export interface ActiveUser {
  userId: string;
  username: string;
  joinedAt: number;
  lastSeen: number;
  currentStoryId?: string;
  currentBranchId?: string;
  isOnline: boolean;
  activityStatus: 'active' | 'idle' | 'away';
}

export interface UserPresence {
  userId: string;
  storyId: string;
  status: 'viewing' | 'typing' | 'idle';
  lastActivity: number;
  sessionId: string;
}

export interface StoryActivity {
  storyId: string;
  activeUsers: ActiveUser[];
  typingUsers: TypingIndicator[];
  totalParticipants: number;
  recentActivity: ActivityEvent[];
  lastUpdated: number;
}

export interface ActivityEvent {
  id: string;
  type: 'user_joined' | 'user_left' | 'sentence_added' | 'vote_cast' | 'branch_created' | 'typing_started' | 'typing_stopped';
  userId: string;
  username: string;
  storyId: string;
  timestamp: number;
  data?: Record<string, any>;
}

/**
 * NotificationService handles real-time notifications and broadcasting
 * Implements requirements 5.2 (real-time updates) and 5.4 (notifications)
 */
export class NotificationService {
  private context: Context;
  private readonly NOTIFICATION_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly RETRY_ATTEMPTS = 3;

  constructor(context: Context) {
    this.context = context;
  }

  /**
   * Send a notification to a specific user
   */
  async sendNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Promise<string> {
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const fullNotification: Notification = {
      ...notification,
      id: notificationId,
      timestamp: Date.now(),
      read: false,
      expiresAt: notification.expiresAt || Date.now() + this.NOTIFICATION_EXPIRY
    };

    try {
      // Store notification in Redis
      await this.context.redis.hSet(
        `notifications:${notification.userId}`,
        notificationId,
        JSON.stringify(fullNotification)
      );

      // Add to user's notification queue
      await this.addToQueue(notification.userId, fullNotification);

      // Attempt immediate delivery
      await this.deliverNotification(fullNotification);

      return notificationId;
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw new Error(`Failed to send notification: ${error}`);
    }
  }

  /**
   * Send notifications to multiple users
   */
  async sendBulkNotifications(
    userIds: string[],
    notification: Omit<Notification, 'id' | 'timestamp' | 'read' | 'userId'>
  ): Promise<string[]> {
    const notificationIds: string[] = [];

    for (const userId of userIds) {
      try {
        const id = await this.sendNotification({
          ...notification,
          userId
        });
        notificationIds.push(id);
      } catch (error) {
        console.error(`Failed to send notification to user ${userId}:`, error);
      }
    }

    return notificationIds;
  }

  /**
   * Broadcast real-time updates to all active users in a story
   */
  async broadcastToStory(storyId: string, message: Omit<BroadcastMessage, 'id' | 'timestamp'>): Promise<void> {
    const broadcastId = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const fullMessage: BroadcastMessage = {
      ...message,
      id: broadcastId,
      timestamp: Date.now()
    };

    try {
      // Get all active users for this story
      const activeUsers = await this.getActiveStoryUsers(storyId);

      // Store broadcast message
      await this.context.redis.hSet(
        `broadcasts:${storyId}`,
        broadcastId,
        JSON.stringify(fullMessage)
      );

      // Set expiry for broadcast message (1 hour)
      await this.context.redis.expire(`broadcasts:${storyId}`, 3600);

      // Send to all active users
      for (const userId of activeUsers) {
        await this.deliverBroadcast(userId, fullMessage);
      }

      console.log(`Broadcast sent to ${activeUsers.length} users for story ${storyId}`);
    } catch (error) {
      console.error('Failed to broadcast message:', error);
      throw new Error(`Failed to broadcast message: ${error}`);
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId: string, limit: number = 20, offset: number = 0): Promise<Notification[]> {
    try {
      const notifications = await this.context.redis.hGetAll(`notifications:${userId}`);
      
      const parsedNotifications = Object.values(notifications)
        .map(notifStr => JSON.parse(notifStr) as Notification)
        .filter(notif => !notif.expiresAt || notif.expiresAt > Date.now())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(offset, offset + limit);

      return parsedNotifications;
    } catch (error) {
      console.error('Failed to get user notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<boolean> {
    try {
      const notificationStr = await this.context.redis.hGet(`notifications:${userId}`, notificationId);
      
      if (!notificationStr) {
        return false;
      }

      const notification = JSON.parse(notificationStr) as Notification;
      notification.read = true;

      await this.context.redis.hSet(
        `notifications:${userId}`,
        notificationId,
        JSON.stringify(notification)
      );

      return true;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    try {
      const notifications = await this.context.redis.hGetAll(`notifications:${userId}`);
      let updatedCount = 0;

      for (const [notificationId, notificationStr] of Object.entries(notifications)) {
        const notification = JSON.parse(notificationStr) as Notification;
        
        if (!notification.read) {
          notification.read = true;
          await this.context.redis.hSet(
            `notifications:${userId}`,
            notificationId,
            JSON.stringify(notification)
          );
          updatedCount++;
        }
      }

      return updatedCount;
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      return 0;
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const notifications = await this.context.redis.hGetAll(`notifications:${userId}`);
      
      return Object.values(notifications)
        .map(notifStr => JSON.parse(notifStr) as Notification)
        .filter(notif => !notif.read && (!notif.expiresAt || notif.expiresAt > Date.now()))
        .length;
    } catch (error) {
      console.error('Failed to get unread count:', error);
      return 0;
    }
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpiredNotifications(): Promise<void> {
    try {
      // This would typically be run as a background job
      const userKeys = await this.context.redis.keys('notifications:*');
      
      for (const userKey of userKeys) {
        const notifications = await this.context.redis.hGetAll(userKey);
        
        for (const [notificationId, notificationStr] of Object.entries(notifications)) {
          const notification = JSON.parse(notificationStr) as Notification;
          
          if (notification.expiresAt && notification.expiresAt < Date.now()) {
            await this.context.redis.hDel(userKey, notificationId);
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup expired notifications:', error);
    }
  }

  /**
   * Add notification to user's queue for reliable delivery
   */
  private async addToQueue(userId: string, notification: Notification): Promise<void> {
    const queueKey = `notification_queue:${userId}`;
    
    try {
      // Get current queue
      const queueStr = await this.context.redis.get(queueKey);
      let queue: NotificationQueue;

      if (queueStr) {
        queue = JSON.parse(queueStr);
      } else {
        queue = {
          userId,
          notifications: [],
          lastProcessed: Date.now(),
          deliveryStatus: 'pending'
        };
      }

      // Add notification to queue
      queue.notifications.push(notification);

      // Limit queue size
      if (queue.notifications.length > this.MAX_QUEUE_SIZE) {
        queue.notifications = queue.notifications.slice(-this.MAX_QUEUE_SIZE);
      }

      // Update queue
      await this.context.redis.setex(queueKey, 86400, JSON.stringify(queue)); // 24 hour expiry
    } catch (error) {
      console.error('Failed to add notification to queue:', error);
    }
  }

  /**
   * Deliver notification to user (placeholder for actual delivery mechanism)
   */
  private async deliverNotification(notification: Notification): Promise<void> {
    try {
      // In a real implementation, this would integrate with Reddit's notification system
      // or use WebSockets/Server-Sent Events for real-time delivery
      
      // For now, we'll just log the delivery attempt
      console.log(`Delivering notification ${notification.id} to user ${notification.userId}`);
      
      // Store delivery confirmation
      const confirmation: DeliveryConfirmation = {
        notificationId: notification.id,
        userId: notification.userId,
        deliveredAt: Date.now(),
        status: 'delivered',
        retryCount: 0
      };

      await this.context.redis.hSet(
        `delivery_confirmations:${notification.userId}`,
        notification.id,
        JSON.stringify(confirmation)
      );

    } catch (error) {
      console.error('Failed to deliver notification:', error);
      
      // Store failed delivery for retry
      const confirmation: DeliveryConfirmation = {
        notificationId: notification.id,
        userId: notification.userId,
        deliveredAt: Date.now(),
        status: 'failed',
        retryCount: 1
      };

      await this.context.redis.hSet(
        `delivery_confirmations:${notification.userId}`,
        notification.id,
        JSON.stringify(confirmation)
      );
    }
  }

  /**
   * Deliver broadcast message to user
   */
  private async deliverBroadcast(userId: string, message: BroadcastMessage): Promise<void> {
    try {
      // In a real implementation, this would use WebSockets or similar
      console.log(`Broadcasting message ${message.id} to user ${userId}`);
      
      // Store in user's broadcast inbox for retrieval
      await this.context.redis.lPush(
        `broadcast_inbox:${userId}`,
        JSON.stringify(message)
      );

      // Limit inbox size
      await this.context.redis.lTrim(`broadcast_inbox:${userId}`, 0, 49); // Keep last 50 messages
      
      // Set expiry
      await this.context.redis.expire(`broadcast_inbox:${userId}`, 3600); // 1 hour

    } catch (error) {
      console.error('Failed to deliver broadcast:', error);
    }
  }

  /**
   * Get active users for a story
   */
  private async getActiveStoryUsers(storyId: string): Promise<string[]> {
    try {
      const activeUsers = await this.context.redis.sMembers(`story_active_users:${storyId}`);
      return activeUsers;
    } catch (error) {
      console.error('Failed to get active story users:', error);
      return [];
    }
  }

  /**
   * Get recent broadcasts for a user
   */
  async getUserBroadcasts(userId: string, limit: number = 10): Promise<BroadcastMessage[]> {
    try {
      const messages = await this.context.redis.lRange(`broadcast_inbox:${userId}`, 0, limit - 1);
      
      return messages.map(msgStr => JSON.parse(msgStr) as BroadcastMessage)
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to get user broadcasts:', error);
      return [];
    }
  }

  /**
   * Send story update notification to all participants
   */
  async notifyStoryUpdate(storyId: string, updateType: string, data: Record<string, any>): Promise<void> {
    try {
      // Get story participants
      const participants = await this.getStoryParticipants(storyId);
      
      // Send notifications
      await this.sendBulkNotifications(participants, {
        type: 'story_update',
        title: 'Story Updated',
        message: `A story you're following has been updated: ${updateType}`,
        data: { storyId, updateType, ...data },
        priority: 'medium'
      });

      // Broadcast real-time update
      await this.broadcastToStory(storyId, {
        storyId,
        type: 'story_update',
        data: { updateType, ...data }
      });

    } catch (error) {
      console.error('Failed to notify story update:', error);
    }
  }

  /**
   * Get all participants of a story
   */
  private async getStoryParticipants(storyId: string): Promise<string[]> {
    try {
      const participants = await this.context.redis.sMembers(`story_participants:${storyId}`);
      return participants;
    } catch (error) {
      console.error('Failed to get story participants:', error);
      return [];
    }
  }

  // ===== TYPING INDICATORS AND USER PRESENCE METHODS =====
  // Implements requirements 5.1 (typing indicators) and 5.5 (live participant counts)

  /**
   * Start typing indicator for a user in a story
   */
  async startTyping(userId: string, username: string, storyId: string, branchId?: string): Promise<void> {
    try {
      const typingIndicator: TypingIndicator = {
        userId,
        username,
        storyId,
        branchId,
        startedAt: Date.now(),
        lastActivity: Date.now(),
        isTyping: true
      };

      // Store typing indicator
      await this.context.redis.hSet(
        `typing_indicators:${storyId}`,
        userId,
        JSON.stringify(typingIndicator)
      );

      // Set expiry for typing indicator (30 seconds)
      await this.context.redis.expire(`typing_indicators:${storyId}`, 30);

      // Update user presence
      await this.updateUserPresence(userId, storyId, 'typing');

      // Broadcast typing started event
      await this.broadcastToStory(storyId, {
        storyId,
        type: 'typing_start',
        data: { userId, username, branchId },
        senderId: userId
      });

      // Log activity event
      await this.logActivityEvent({
        type: 'typing_started',
        userId,
        username,
        storyId,
        timestamp: Date.now(),
        data: { branchId }
      });

    } catch (error) {
      console.error('Failed to start typing indicator:', error);
    }
  }

  /**
   * Stop typing indicator for a user in a story
   */
  async stopTyping(userId: string, username: string, storyId: string): Promise<void> {
    try {
      // Remove typing indicator
      await this.context.redis.hDel(`typing_indicators:${storyId}`, userId);

      // Update user presence to viewing
      await this.updateUserPresence(userId, storyId, 'viewing');

      // Broadcast typing stopped event
      await this.broadcastToStory(storyId, {
        storyId,
        type: 'typing_stop',
        data: { userId, username },
        senderId: userId
      });

      // Log activity event
      await this.logActivityEvent({
        type: 'typing_stopped',
        userId,
        username,
        storyId,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Failed to stop typing indicator:', error);
    }
  }

  /**
   * Get current typing indicators for a story
   */
  async getTypingIndicators(storyId: string): Promise<TypingIndicator[]> {
    try {
      const indicators = await this.context.redis.hGetAll(`typing_indicators:${storyId}`);
      const now = Date.now();
      const validIndicators: TypingIndicator[] = [];

      for (const [userId, indicatorStr] of Object.entries(indicators)) {
        const indicator = JSON.parse(indicatorStr) as TypingIndicator;
        
        // Remove stale indicators (older than 30 seconds)
        if (now - indicator.lastActivity > 30000) {
          await this.context.redis.hDel(`typing_indicators:${storyId}`, userId);
        } else {
          validIndicators.push(indicator);
        }
      }

      return validIndicators;
    } catch (error) {
      console.error('Failed to get typing indicators:', error);
      return [];
    }
  }

  /**
   * Update typing indicator activity (heartbeat)
   */
  async updateTypingActivity(userId: string, storyId: string): Promise<void> {
    try {
      const indicatorStr = await this.context.redis.hGet(`typing_indicators:${storyId}`, userId);
      
      if (indicatorStr) {
        const indicator = JSON.parse(indicatorStr) as TypingIndicator;
        indicator.lastActivity = Date.now();
        
        await this.context.redis.hSet(
          `typing_indicators:${storyId}`,
          userId,
          JSON.stringify(indicator)
        );
      }
    } catch (error) {
      console.error('Failed to update typing activity:', error);
    }
  }

  /**
   * Join a story (mark user as active participant)
   */
  async joinStory(userId: string, username: string, storyId: string): Promise<void> {
    try {
      const activeUser: ActiveUser = {
        userId,
        username,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        currentStoryId: storyId,
        isOnline: true,
        activityStatus: 'active'
      };

      // Add to active users set
      await this.context.redis.sAdd(`story_active_users:${storyId}`, userId);
      
      // Store user details
      await this.context.redis.hSet(
        `story_user_details:${storyId}`,
        userId,
        JSON.stringify(activeUser)
      );

      // Add to participants (persistent)
      await this.context.redis.sAdd(`story_participants:${storyId}`, userId);

      // Update user presence
      await this.updateUserPresence(userId, storyId, 'viewing');

      // Set expiry for active user (5 minutes)
      await this.context.redis.expire(`story_active_users:${storyId}`, 300);
      await this.context.redis.expire(`story_user_details:${storyId}`, 300);

      // Broadcast user joined event
      await this.broadcastToStory(storyId, {
        storyId,
        type: 'user_joined',
        data: { userId, username },
        senderId: userId
      });

      // Log activity event
      await this.logActivityEvent({
        type: 'user_joined',
        userId,
        username,
        storyId,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Failed to join story:', error);
    }
  }

  /**
   * Leave a story (remove user from active participants)
   */
  async leaveStory(userId: string, username: string, storyId: string): Promise<void> {
    try {
      // Remove from active users
      await this.context.redis.sRem(`story_active_users:${storyId}`, userId);
      await this.context.redis.hDel(`story_user_details:${storyId}`, userId);

      // Stop any typing indicators
      await this.stopTyping(userId, username, storyId);

      // Remove user presence
      await this.context.redis.del(`user_presence:${userId}:${storyId}`);

      // Broadcast user left event
      await this.broadcastToStory(storyId, {
        storyId,
        type: 'user_left',
        data: { userId, username },
        senderId: userId
      });

      // Log activity event
      await this.logActivityEvent({
        type: 'user_left',
        userId,
        username,
        storyId,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Failed to leave story:', error);
    }
  }

  /**
   * Get active users for a story with details
   */
  async getActiveUsers(storyId: string): Promise<ActiveUser[]> {
    try {
      const userIds = await this.context.redis.sMembers(`story_active_users:${storyId}`);
      const userDetails = await this.context.redis.hGetAll(`story_user_details:${storyId}`);
      const now = Date.now();
      const activeUsers: ActiveUser[] = [];

      for (const userId of userIds) {
        const userDetailStr = userDetails[userId];
        if (userDetailStr) {
          const user = JSON.parse(userDetailStr) as ActiveUser;
          
          // Check if user is still active (within 5 minutes)
          if (now - user.lastSeen <= 300000) {
            // Update activity status based on last seen
            if (now - user.lastSeen <= 60000) {
              user.activityStatus = 'active';
            } else if (now - user.lastSeen <= 180000) {
              user.activityStatus = 'idle';
            } else {
              user.activityStatus = 'away';
            }
            
            activeUsers.push(user);
          } else {
            // Remove inactive user
            await this.context.redis.sRem(`story_active_users:${storyId}`, userId);
            await this.context.redis.hDel(`story_user_details:${storyId}`, userId);
          }
        }
      }

      return activeUsers;
    } catch (error) {
      console.error('Failed to get active users:', error);
      return [];
    }
  }

  /**
   * Update user presence in a story
   */
  async updateUserPresence(userId: string, storyId: string, status: 'viewing' | 'typing' | 'idle'): Promise<void> {
    try {
      const sessionId = `session_${userId}_${Date.now()}`;
      const presence: UserPresence = {
        userId,
        storyId,
        status,
        lastActivity: Date.now(),
        sessionId
      };

      await this.context.redis.setex(
        `user_presence:${userId}:${storyId}`,
        300, // 5 minutes expiry
        JSON.stringify(presence)
      );

      // Update user details last seen
      const userDetailStr = await this.context.redis.hGet(`story_user_details:${storyId}`, userId);
      if (userDetailStr) {
        const user = JSON.parse(userDetailStr) as ActiveUser;
        user.lastSeen = Date.now();
        user.activityStatus = status === 'idle' ? 'idle' : 'active';
        
        await this.context.redis.hSet(
          `story_user_details:${storyId}`,
          userId,
          JSON.stringify(user)
        );
      }

    } catch (error) {
      console.error('Failed to update user presence:', error);
    }
  }

  /**
   * Get user presence for a story
   */
  async getUserPresence(userId: string, storyId: string): Promise<UserPresence | null> {
    try {
      const presenceStr = await this.context.redis.get(`user_presence:${userId}:${storyId}`);
      
      if (presenceStr) {
        return JSON.parse(presenceStr) as UserPresence;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get user presence:', error);
      return null;
    }
  }

  /**
   * Get complete story activity including active users and typing indicators
   */
  async getStoryActivity(storyId: string): Promise<StoryActivity> {
    try {
      const [activeUsers, typingIndicators, recentActivity] = await Promise.all([
        this.getActiveUsers(storyId),
        this.getTypingIndicators(storyId),
        this.getRecentActivity(storyId, 10)
      ]);

      const totalParticipants = await this.context.redis.sCard(`story_participants:${storyId}`);

      return {
        storyId,
        activeUsers,
        typingUsers: typingIndicators,
        totalParticipants,
        recentActivity,
        lastUpdated: Date.now()
      };
    } catch (error) {
      console.error('Failed to get story activity:', error);
      return {
        storyId,
        activeUsers: [],
        typingUsers: [],
        totalParticipants: 0,
        recentActivity: [],
        lastUpdated: Date.now()
      };
    }
  }

  /**
   * Log activity event for a story
   */
  private async logActivityEvent(event: Omit<ActivityEvent, 'id'>): Promise<void> {
    try {
      const activityEvent: ActivityEvent = {
        ...event,
        id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Add to story activity log
      await this.context.redis.lPush(
        `story_activity:${event.storyId}`,
        JSON.stringify(activityEvent)
      );

      // Keep only last 50 events
      await this.context.redis.lTrim(`story_activity:${event.storyId}`, 0, 49);

      // Set expiry (24 hours)
      await this.context.redis.expire(`story_activity:${event.storyId}`, 86400);

    } catch (error) {
      console.error('Failed to log activity event:', error);
    }
  }

  /**
   * Get recent activity events for a story
   */
  async getRecentActivity(storyId: string, limit: number = 10): Promise<ActivityEvent[]> {
    try {
      const events = await this.context.redis.lRange(`story_activity:${storyId}`, 0, limit - 1);
      
      return events.map(eventStr => JSON.parse(eventStr) as ActivityEvent)
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to get recent activity:', error);
      return [];
    }
  }

  /**
   * Cleanup inactive users and stale typing indicators
   */
  async cleanupInactiveUsers(): Promise<void> {
    try {
      // This would typically be run as a background job
      const storyKeys = await this.context.redis.keys('story_active_users:*');
      
      for (const storyKey of storyKeys) {
        const storyId = storyKey.replace('story_active_users:', '');
        
        // Clean up active users
        await this.getActiveUsers(storyId); // This method already removes inactive users
        
        // Clean up typing indicators
        await this.getTypingIndicators(storyId); // This method already removes stale indicators
      }
    } catch (error) {
      console.error('Failed to cleanup inactive users:', error);
    }
  }

  /**
   * Send heartbeat to keep user active in story
   */
  async sendHeartbeat(userId: string, storyId: string): Promise<void> {
    try {
      // Update user presence
      await this.updateUserPresence(userId, storyId, 'viewing');
      
      // If user is typing, update typing activity
      const typingIndicator = await this.context.redis.hGet(`typing_indicators:${storyId}`, userId);
      if (typingIndicator) {
        await this.updateTypingActivity(userId, storyId);
      }
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }
}