// services/notificationService.test.ts - COMPLETE VERSION

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationService, Notification, BroadcastMessage } from './notificationService.js';

// Mock Context
const mockContext = {
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    hSet: vi.fn(),
    hGet: vi.fn(),
    hGetAll: vi.fn(),
    hDel: vi.fn(),
    sAdd: vi.fn(),
    sRem: vi.fn(),
    sMembers: vi.fn(),
    sCard: vi.fn(),
    lPush: vi.fn(),
    lRange: vi.fn(),
    lTrim: vi.fn(),
    keys: vi.fn(),
    expire: vi.fn()
  }
};

describe('NotificationService', () => {
  let notificationService: NotificationService;
  const testUserId = 'user123';
  const testStoryId = 'story456';

  beforeEach(() => {
    vi.clearAllMocks();
    notificationService = new NotificationService(mockContext as any);
  });

  describe('Notification Management', () => {
    it('should send notification to user', async () => {
      mockContext.redis.hSet.mockResolvedValue(1);
      mockContext.redis.get.mockResolvedValue(null);
      mockContext.redis.setex.mockResolvedValue('OK');

      const notificationId = await notificationService.sendNotification({
        userId: testUserId,
        type: 'story_update',
        title: 'Story Updated',
        message: 'New sentence added',
        priority: 'medium'
      });

      expect(notificationId).toMatch(/^notif_/);
      expect(mockContext.redis.hSet).toHaveBeenCalledWith(
        `notifications:${testUserId}`,
        expect.any(String),
        expect.stringContaining('Story Updated')
      );
    });

    it('should get user notifications', async () => {
      const mockNotifications = {
        'notif_1': JSON.stringify({
          id: 'notif_1',
          userId: testUserId,
          type: 'story_update',
          title: 'Test',
          message: 'Test message',
          timestamp: Date.now(),
          read: false,
          priority: 'medium'
        })
      };

      mockContext.redis.hGetAll.mockResolvedValue(mockNotifications);

      const notifications = await notificationService.getUserNotifications(testUserId);

      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Test');
    });

    it('should mark notification as read', async () => {
      const notification: Notification = {
        id: 'notif_1',
        userId: testUserId,
        type: 'story_update',
        title: 'Test',
        message: 'Test message',
        timestamp: Date.now(),
        read: false,
        priority: 'medium'
      };

      mockContext.redis.hGet.mockResolvedValue(JSON.stringify(notification));
      mockContext.redis.hSet.mockResolvedValue(1);

      const result = await notificationService.markAsRead(testUserId, 'notif_1');

      expect(result).toBe(true);
      expect(mockContext.redis.hSet).toHaveBeenCalledWith(
        `notifications:${testUserId}`,
        'notif_1',
        expect.stringContaining('"read":true')
      );
    });

    it('should get unread count', async () => {
      const mockNotifications = {
        'notif_1': JSON.stringify({ read: false, timestamp: Date.now() }),
        'notif_2': JSON.stringify({ read: false, timestamp: Date.now() }),
        'notif_3': JSON.stringify({ read: true, timestamp: Date.now() })
      };

      mockContext.redis.hGetAll.mockResolvedValue(mockNotifications);

      const count = await notificationService.getUnreadCount(testUserId);

      expect(count).toBe(2);
    });

    it('should send bulk notifications', async () => {
      mockContext.redis.hSet.mockResolvedValue(1);
      mockContext.redis.get.mockResolvedValue(null);
      mockContext.redis.setex.mockResolvedValue('OK');

      const userIds = ['user1', 'user2', 'user3'];
      const notificationIds = await notificationService.sendBulkNotifications(userIds, {
        type: 'story_update',
        title: 'Bulk Update',
        message: 'Test bulk notification',
        priority: 'low'
      });

      expect(notificationIds).toHaveLength(3);
      expect(mockContext.redis.hSet).toHaveBeenCalledTimes(3);
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast to story', async () => {
      mockContext.redis.sMembers.mockResolvedValue(['user1', 'user2']);
      mockContext.redis.hSet.mockResolvedValue(1);
      mockContext.redis.expire.mockResolvedValue(1);
      mockContext.redis.lPush.mockResolvedValue(1);
      mockContext.redis.lTrim.mockResolvedValue('OK');

      await notificationService.broadcastToStory(testStoryId, {
        storyId: testStoryId,
        type: 'story_update',
        data: { message: 'Test broadcast' }
      });

      expect(mockContext.redis.hSet).toHaveBeenCalledWith(
        `broadcasts:${testStoryId}`,
        expect.any(String),
        expect.stringContaining('Test broadcast')
      );
      expect(mockContext.redis.lPush).toHaveBeenCalledTimes(2); // 2 users
    });

    it('should get user broadcasts', async () => {
      const mockBroadcasts = [
        JSON.stringify({
          id: 'broadcast_1',
          storyId: testStoryId,
          type: 'story_update',
          data: {},
          timestamp: Date.now()
        })
      ];

      mockContext.redis.lRange.mockResolvedValue(mockBroadcasts);

      const broadcasts = await notificationService.getUserBroadcasts(testUserId, 10);

      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0].storyId).toBe(testStoryId);
    });
  });

  describe('Typing Indicators', () => {
    it('should start typing indicator', async () => {
      mockContext.redis.hSet.mockResolvedValue(1);
      mockContext.redis.expire.mockResolvedValue(1);
      mockContext.redis.setex.mockResolvedValue('OK');
      mockContext.redis.sMembers.mockResolvedValue([]);
      mockContext.redis.lPush.mockResolvedValue(1);
      mockContext.redis.lTrim.mockResolvedValue('OK');
      mockContext.redis.hGetAll.mockResolvedValue({});

      await notificationService.startTyping(testUserId, 'TestUser', testStoryId);

      expect(mockContext.redis.hSet).toHaveBeenCalledWith(
        `typing_indicators:${testStoryId}`,
        testUserId,
        expect.stringContaining('TestUser')
      );
    });

    it('should stop typing indicator', async () => {
      mockContext.redis.hDel.mockResolvedValue(1);
      mockContext.redis.setex.mockResolvedValue('OK');
      mockContext.redis.sMembers.mockResolvedValue([]);
      mockContext.redis.lPush.mockResolvedValue(1);
      mockContext.redis.lTrim.mockResolvedValue('OK');
      mockContext.redis.hGetAll.mockResolvedValue({});
      mockContext.redis.hGet.mockResolvedValue(null);

      await notificationService.stopTyping(testUserId, 'TestUser', testStoryId);

      expect(mockContext.redis.hDel).toHaveBeenCalledWith(
        `typing_indicators:${testStoryId}`,
        testUserId
      );
    });

    it('should get typing indicators', async () => {
      const now = Date.now();
      const mockIndicators = {
        'user1': JSON.stringify({
          userId: 'user1',
          username: 'User1',
          storyId: testStoryId,
          startedAt: now,
          lastActivity: now,
          isTyping: true
        }),
        'user2': JSON.stringify({
          userId: 'user2',
          username: 'User2',
          storyId: testStoryId,
          startedAt: now - 40000, // Stale
          lastActivity: now - 40000,
          isTyping: true
        })
      };

      mockContext.redis.hGetAll.mockResolvedValue(mockIndicators);
      mockContext.redis.hDel.mockResolvedValue(1);

      const indicators = await notificationService.getTypingIndicators(testStoryId);

      expect(indicators).toHaveLength(1); // Only fresh indicator
      expect(indicators[0].userId).toBe('user1');
      expect(mockContext.redis.hDel).toHaveBeenCalled(); // Stale indicator removed
    });
  });

  describe('User Presence', () => {
    it('should join story', async () => {
      mockContext.redis.sAdd.mockResolvedValue(1);
      mockContext.redis.hSet.mockResolvedValue(1);
      mockContext.redis.setex.mockResolvedValue('OK');
      mockContext.redis.expire.mockResolvedValue(1);
      mockContext.redis.sMembers.mockResolvedValue([]);
      mockContext.redis.lPush.mockResolvedValue(1);
      mockContext.redis.lTrim.mockResolvedValue('OK');
      mockContext.redis.hGetAll.mockResolvedValue({});

      await notificationService.joinStory(testUserId, 'TestUser', testStoryId);

      expect(mockContext.redis.sAdd).toHaveBeenCalledWith(
        `story_active_users:${testStoryId}`,
        testUserId
      );
      expect(mockContext.redis.hSet).toHaveBeenCalledWith(
        `story_user_details:${testStoryId}`,
        testUserId,
        expect.stringContaining('TestUser')
      );
    });

    it('should leave story', async () => {
      mockContext.redis.sRem.mockResolvedValue(1);
      mockContext.redis.hDel.mockResolvedValue(1);
      mockContext.redis.del.mockResolvedValue(1);
      mockContext.redis.setex.mockResolvedValue('OK');
      mockContext.redis.sMembers.mockResolvedValue([]);
      mockContext.redis.lPush.mockResolvedValue(1);
      mockContext.redis.lTrim.mockResolvedValue('OK');
      mockContext.redis.hGetAll.mockResolvedValue({});
      mockContext.redis.hGet.mockResolvedValue(null);

      await notificationService.leaveStory(testUserId, 'TestUser', testStoryId);

      expect(mockContext.redis.sRem).toHaveBeenCalledWith(
        `story_active_users:${testStoryId}`,
        testUserId
      );
      expect(mockContext.redis.del).toHaveBeenCalledWith(
        `user_presence:${testUserId}:${testStoryId}`
      );
    });

    it('should get active users', async () => {
      const now = Date.now();
      const mockUsers = {
        'user1': JSON.stringify({
          userId: 'user1',
          username: 'User1',
          joinedAt: now,
          lastSeen: now,
          isOnline: true,
          activityStatus: 'active'
        }),
        'user2': JSON.stringify({
          userId: 'user2',
          username: 'User2',
          joinedAt: now - 400000,
          lastSeen: now - 400000, // Inactive
          isOnline: true,
          activityStatus: 'active'
        })
      };

      mockContext.redis.sMembers.mockResolvedValue(['user1', 'user2']);
      mockContext.redis.hGetAll.mockResolvedValue(mockUsers);
      mockContext.redis.sRem.mockResolvedValue(1);
      mockContext.redis.hDel.mockResolvedValue(1);

      const activeUsers = await notificationService.getActiveUsers(testStoryId);

      expect(activeUsers).toHaveLength(1); // Only active user
      expect(activeUsers[0].userId).toBe('user1');
      expect(mockContext.redis.sRem).toHaveBeenCalled(); // Inactive user removed
    });

    it('should update user presence', async () => {
      mockContext.redis.setex.mockResolvedValue('OK');
      mockContext.redis.hGet.mockResolvedValue(JSON.stringify({
        userId: testUserId,
        username: 'TestUser',
        lastSeen: Date.now() - 1000,
        activityStatus: 'active'
      }));
      mockContext.redis.hSet.mockResolvedValue(1);

      await notificationService.updateUserPresence(testUserId, testStoryId, 'typing');

      expect(mockContext.redis.setex).toHaveBeenCalledWith(
        `user_presence:${testUserId}:${testStoryId}`,
        300,
        expect.stringContaining('typing')
      );
    });

    it('should get user presence', async () => {
      const mockPresence = {
        userId: testUserId,
        storyId: testStoryId,
        status: 'viewing' as const,
        lastActivity: Date.now(),
        sessionId: 'session_123'
      };

      mockContext.redis.get.mockResolvedValue(JSON.stringify(mockPresence));

      const presence = await notificationService.getUserPresence(testUserId, testStoryId);

      expect(presence).toBeDefined();
      expect(presence?.status).toBe('viewing');
      expect(presence?.userId).toBe(testUserId);
    });
  });

  describe('Story Activity', () => {
    it('should get story activity', async () => {
      const now = Date.now();
      
      // Mock active users
      mockContext.redis.sMembers.mockResolvedValue(['user1']);
      mockContext.redis.hGetAll
        .mockResolvedValueOnce({ // For active users
          'user1': JSON.stringify({
            userId: 'user1',
            username: 'User1',
            joinedAt: now,
            lastSeen: now,
            isOnline: true,
            activityStatus: 'active'
          })
        })
        .mockResolvedValueOnce({}); // For typing indicators

      // Mock recent activity
      mockContext.redis.lRange.mockResolvedValue([
        JSON.stringify({
          id: 'activity_1',
          type: 'sentence_added',
          userId: 'user1',
          username: 'User1',
          storyId: testStoryId,
          timestamp: now
        })
      ]);

      mockContext.redis.sCard.mockResolvedValue(5);

      const activity = await notificationService.getStoryActivity(testStoryId);

      expect(activity.storyId).toBe(testStoryId);
      expect(activity.activeUsers).toHaveLength(1);
      expect(activity.totalParticipants).toBe(5);
      expect(activity.recentActivity).toHaveLength(1);
    });

    it('should get recent activity', async () => {
      const mockActivities = [
        JSON.stringify({
          id: 'activity_1',
          type: 'sentence_added',
          userId: 'user1',
          username: 'User1',
          storyId: testStoryId,
          timestamp: Date.now()
        })
      ];

      mockContext.redis.lRange.mockResolvedValue(mockActivities);

      const activities = await notificationService.getRecentActivity(testStoryId, 10);

      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe('sentence_added');
    });

    it('should send heartbeat', async () => {
      mockContext.redis.setex.mockResolvedValue('OK');
      mockContext.redis.hGet
        .mockResolvedValueOnce(JSON.stringify({ // For user presence
          userId: testUserId,
          username: 'TestUser',
          lastSeen: Date.now(),
          activityStatus: 'active'
        }))
        .mockResolvedValueOnce(null); // No typing indicator

      mockContext.redis.hSet.mockResolvedValue(1);

      await notificationService.sendHeartbeat(testUserId, testStoryId);

      expect(mockContext.redis.setex).toHaveBeenCalledWith(
        `user_presence:${testUserId}:${testStoryId}`,
        300,
        expect.any(String)
      );
    });
  });

  describe('Simultaneous Submission Handling', () => {
    it('should accept submission with no conflicts', async () => {
      mockContext.redis.get
        .mockResolvedValueOnce(null) // No existing queue
        .mockResolvedValueOnce(JSON.stringify({ // Queue after waiting
          storyId: testStoryId,
          position: 5,
          submissions: [{
            id: 'submission_1',
            storyId: testStoryId,
            content: 'Test sentence',
            authorId: testUserId,
            authorName: 'TestUser',
            submittedAt: Date.now(),
            position: 5
          }],
          queuedAt: Date.now(),
          processingStatus: 'queued'
        }))
        .mockResolvedValueOnce(JSON.stringify({ // Story data
          id: testStoryId,
          sentences: [],
          metadata: { lastActivity: Date.now(), totalContributors: 0 }
        }));

      mockContext.redis.setex.mockResolvedValue('OK');
      mockContext.redis.del.mockResolvedValue(1);
      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.sMembers.mockResolvedValue([]);
      mockContext.redis.hSet.mockResolvedValue(1);
      mockContext.redis.lPush.mockResolvedValue(1);
      mockContext.redis.lTrim.mockResolvedValue('OK');
      mockContext.redis.hGetAll.mockResolvedValue({});

      const result = await notificationService.submitSentence({
        storyId: testStoryId,
        content: 'Test sentence',
        authorId: testUserId,
        authorName: 'TestUser',
        position: 5
      });

      expect(result.status).toBe('accepted');
      expect(result.submissionId).toMatch(/^submission_/);
    });

    it('should detect conflicts and create voting session', async () => {
      const existingQueue = {
        storyId: testStoryId,
        position: 5,
        submissions: [{
          id: 'submission_1',
          storyId: testStoryId,
          content: 'First sentence',
          authorId: 'user1',
          authorName: 'User1',
          submittedAt: Date.now() - 1000,
          position: 5
        }],
        queuedAt: Date.now() - 1000,
        processingStatus: 'queued' as const
      };

      mockContext.redis.get.mockResolvedValue(JSON.stringify(existingQueue));
      mockContext.redis.setex.mockResolvedValue('OK');
      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.expire.mockResolvedValue(1);
      mockContext.redis.sMembers.mockResolvedValue([]);
      mockContext.redis.hSet.mockResolvedValue(1);
      mockContext.redis.lPush.mockResolvedValue(1);
      mockContext.redis.lTrim.mockResolvedValue('OK');
      mockContext.redis.hGetAll.mockResolvedValue({});

      const result = await notificationService.submitSentence({
        storyId: testStoryId,
        content: 'Second sentence',
        authorId: testUserId,
        authorName: 'TestUser',
        position: 5
      });

      expect(result.status).toBe('queued_for_voting');
      expect(result.votingSessionId).toBeDefined();
      expect(mockContext.redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^voting_session:/),
        expect.any(String)
      );
    });

    it('should vote on submission', async () => {
      const votingSession = {
        id: 'session_123',
        storyId: testStoryId,
        position: 5,
        submissions: [
          {
            id: 'submission_1',
            storyId: testStoryId,
            content: 'Test',
            authorId: 'user1',
            authorName: 'User1',
            submittedAt: Date.now(),
            position: 5
          }
        ],
        votes: [],
        status: 'active' as const,
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        participantCount: 0,
        requiredVotes: 3
      };

      mockContext.redis.get.mockResolvedValue(JSON.stringify(votingSession));
      mockContext.redis.set.mockResolvedValue('OK');

      const result = await notificationService.voteOnSubmission(
        'session_123',
        'submission_1',
        testUserId,
        2.5,
        'approve'
      );

      expect(result).toBe(true);
      expect(mockContext.redis.set).toHaveBeenCalledWith(
        'voting_session:session_123',
        expect.stringContaining('"approve"')
      );
    });

    it('should prevent voting on own submission', async () => {
      const votingSession = {
        id: 'session_123',
        storyId: testStoryId,
        position: 5,
        submissions: [
          {
            id: 'submission_1',
            storyId: testStoryId,
            content: 'Test',
            authorId: testUserId, // Same as voter
            authorName: 'TestUser',
            submittedAt: Date.now(),
            position: 5
          }
        ],
        votes: [],
        status: 'active' as const,
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        participantCount: 0,
        requiredVotes: 3
      };

      mockContext.redis.get.mockResolvedValue(JSON.stringify(votingSession));

      const result = await notificationService.voteOnSubmission(
        'session_123',
        'submission_1',
        testUserId, // Same as author
        2.5,
        'approve'
      );

      expect(result).toBe(false);
      expect(mockContext.redis.set).not.toHaveBeenCalled();
    });

    it('should get active voting sessions', async () => {
      const mockSession = {
        id: 'session_123',
        storyId: testStoryId,
        position: 5,
        submissions: [],
        votes: [],
        status: 'active' as const,
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        participantCount: 0,
        requiredVotes: 3
      };

      mockContext.redis.keys.mockResolvedValue(['voting_session:session_123']);
      mockContext.redis.get.mockResolvedValue(JSON.stringify(mockSession));

      const sessions = await notificationService.getActiveVotingSessions(testStoryId);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('session_123');
    });

    it('should create conflict resolution', async () => {
      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.expire.mockResolvedValue(1);

      const submissions = [{
        id: 'submission_1',
        storyId: testStoryId,
        content: 'Test',
        authorId: testUserId,
        authorName: 'TestUser',
        submittedAt: Date.now(),
        position: 5
      }];

      const resolutionId = await notificationService.createConflictResolution(
        testStoryId,
        'simultaneous_submission',
        submissions
      );

      expect(resolutionId).toMatch(/^resolution_/);
      expect(mockContext.redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^conflict_resolution:/),
        expect.any(String)
      );
    });

    it('should resolve conflict', async () => {
      const mockResolution = {
        id: 'resolution_123',
        storyId: testStoryId,
        conflictType: 'simultaneous_submission' as const,
        submissions: [],
        resolutionMethod: 'community_vote' as const
      };

      mockContext.redis.get.mockResolvedValue(JSON.stringify(mockResolution));
      mockContext.redis.set.mockResolvedValue('OK');

      const result = await notificationService.resolveConflict(
        'resolution_123',
        'submission_1',
        'moderator_123',
        'Best quality submission'
      );

      expect(result).toBe(true);
      expect(mockContext.redis.set).toHaveBeenCalledWith(
        'conflict_resolution:resolution_123',
        expect.stringContaining('Best quality submission')
      );
    });
  });

  describe('Cleanup and Maintenance', () => {
    it('should cleanup expired notifications', async () => {
      const now = Date.now();
      const mockNotifications = {
        'notif_1': JSON.stringify({
          id: 'notif_1',
          userId: testUserId,
          expiresAt: now - 1000, // Expired
          timestamp: now - 10000
        }),
        'notif_2': JSON.stringify({
          id: 'notif_2',
          userId: testUserId,
          expiresAt: now + 10000, // Not expired
          timestamp: now
        })
      };

      mockContext.redis.keys.mockResolvedValue(['notifications:user123']);
      mockContext.redis.hGetAll.mockResolvedValue(mockNotifications);
      mockContext.redis.hDel.mockResolvedValue(1);

      await notificationService.cleanupExpiredNotifications();

      expect(mockContext.redis.hDel).toHaveBeenCalledWith(
        'notifications:user123',
        'notif_1'
      );
    });

    it('should cleanup inactive users', async () => {
      mockContext.redis.keys.mockResolvedValue(['story_active_users:story456']);
      mockContext.redis.sMembers.mockResolvedValue(['user1']);
      mockContext.redis.hGetAll.mockResolvedValue({
        'user1': JSON.stringify({
          userId: 'user1',
          username: 'User1',
          joinedAt: Date.now() - 400000,
          lastSeen: Date.now() - 400000, // Inactive
          isOnline: true,
          activityStatus: 'active'
        })
      });
      mockContext.redis.sRem.mockResolvedValue(1);
      mockContext.redis.hDel.mockResolvedValue(1);

      await notificationService.cleanupInactiveUsers();

      expect(mockContext.redis.sRem).toHaveBeenCalled();
      expect(mockContext.redis.hDel).toHaveBeenCalled();
    });

    it('should process expired voting sessions', async () => {
      const expiredSession = {
        id: 'session_123',
        storyId: testStoryId,
        position: 5,
        submissions: [{
          id: 'submission_1',
          storyId: testStoryId,
          content: 'Test',
          authorId: testUserId,
          authorName: 'TestUser',
          submittedAt: Date.now(),
          position: 5
        }],
        votes: [],
        status: 'active' as const,
        createdAt: Date.now() - 100000,
        expiresAt: Date.now() - 1000, // Expired
        participantCount: 0,
        requiredVotes: 3
      };

      mockContext.redis.keys.mockResolvedValue(['voting_session:session_123']);
      mockContext.redis.get
        .mockResolvedValueOnce(JSON.stringify(expiredSession)) // For processing
        .mockResolvedValueOnce(JSON.stringify(expiredSession)) // For expiring
        .mockResolvedValueOnce(JSON.stringify({ // Story data
          id: testStoryId,
          sentences: [],
          metadata: { lastActivity: Date.now(), totalContributors: 0 }
        }));
      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.sMembers.mockResolvedValue([]);
      mockContext.redis.hSet.mockResolvedValue(1);
      mockContext.redis.lPush.mockResolvedValue(1);
      mockContext.redis.lTrim.mockResolvedValue('OK');
      mockContext.redis.hGetAll.mockResolvedValue({});

      await notificationService.processExpiredVotingSessions();

      expect(mockContext.redis.set).toHaveBeenCalledWith(
        'voting_session:session_123',
        expect.stringContaining('"status":"expired"')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle notification send errors gracefully', async () => {
      mockContext.redis.hSet.mockRejectedValue(new Error('Redis error'));

      await expect(notificationService.sendNotification({
        userId: testUserId,
        type: 'story_update',
        title: 'Test',
        message: 'Test',
        priority: 'medium'
      })).rejects.toThrow('Failed to send notification');
    });

    it('should return empty array on getUserNotifications error', async () => {
      mockContext.redis.hGetAll.mockRejectedValue(new Error('Redis error'));

      const notifications = await notificationService.getUserNotifications(testUserId);

      expect(notifications).toEqual([]);
    });

    it('should return 0 on getUnreadCount error', async () => {
      mockContext.redis.hGetAll.mockRejectedValue(new Error('Redis error'));

      const count = await notificationService.getUnreadCount(testUserId);

      expect(count).toBe(0);
    });

    it('should return empty array on getTypingIndicators error', async () => {
      mockContext.redis.hGetAll.mockRejectedValue(new Error('Redis error'));

      const indicators = await notificationService.getTypingIndicators(testStoryId);

      expect(indicators).toEqual([]);
    });

    it('should handle submission errors', async () => {
      mockContext.redis.get.mockRejectedValue(new Error('Redis error'));

      await expect(notificationService.submitSentence({
        storyId: testStoryId,
        content: 'Test',
        authorId: testUserId,
        authorName: 'TestUser',
        position: 5
      })).rejects.toThrow();
    });
  });
});