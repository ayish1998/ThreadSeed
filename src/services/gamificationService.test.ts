import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GamificationService } from './gamificationService.js';
import { UserProfile, Badge, Achievement, UserStatistics } from '../types/story.js';

// Mock Context
const mockContext = {
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    sadd: vi.fn(),
    smembers: vi.fn(),
    srem: vi.fn(),
    del: vi.fn(),
    expire: vi.fn(),
    lpush: vi.fn(),
    ltrim: vi.fn(),
    lrange: vi.fn()
  }
};

describe('GamificationService', () => {
  let gamificationService: GamificationService;
  const testUserId = 'user123';
  const testUsername = 'TestUser';
  const testSubreddit = 'testsubreddit';

  beforeEach(() => {
    vi.clearAllMocks();
    gamificationService = new GamificationService(mockContext as any);
  });

  describe('User Profile and Reputation System', () => {
    describe('createUserProfile', () => {
      it('should create a new user profile with default values', async () => {
        mockContext.redis.get.mockResolvedValue(null); // No existing profile
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.sadd.mockResolvedValue(1);

        const profile = await gamificationService.createUserProfile({
          userId: testUserId,
          username: testUsername,
          subredditName: testSubreddit
        });

        expect(profile).toBeDefined();
        expect(profile.userId).toBe(testUserId);
        expect(profile.username).toBe(testUsername);
        expect(profile.reputation).toBe(100);
        expect(profile.level).toBe(1);
        expect(profile.badges).toEqual([]);
        expect(profile.achievements).toEqual([]);
        expect(profile.statistics.totalSentences).toBe(0);
        expect(profile.statistics.totalReputation).toBe(100);

        // Verify Redis calls
        expect(mockContext.redis.set).toHaveBeenCalledWith(
          `user:${testUserId}:profile:${testSubreddit}`,
          expect.stringContaining(testUsername)
        );
        expect(mockContext.redis.sadd).toHaveBeenCalledWith(
          `subreddit:${testSubreddit}:users`,
          testUserId
        );
      });

      it('should return existing profile if already exists', async () => {
        const existingProfile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 250,
          level: 3,
          badges: [],
          achievements: [],
          statistics: {} as UserStatistics,
          preferences: {} as any,
          joinedAt: Date.now() - 1000000,
          lastActive: Date.now() - 1000
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(existingProfile));

        const profile = await gamificationService.createUserProfile({
          userId: testUserId,
          username: testUsername,
          subredditName: testSubreddit
        });

        expect(profile).toEqual(existingProfile);
        expect(mockContext.redis.set).not.toHaveBeenCalled();
      });
    });

    describe('updateReputation', () => {
      it('should update user reputation and recalculate level', async () => {
        const initialProfile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 100,
          level: 1,
          badges: [],
          achievements: [],
          statistics: {
            totalReputation: 100
          } as UserStatistics,
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(initialProfile));
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.lpush.mockResolvedValue(1);
        mockContext.redis.ltrim.mockResolvedValue('OK');

        const updatedProfile = await gamificationService.updateReputation({
          userId: testUserId,
          subredditName: testSubreddit,
          change: 150,
          reason: 'Quality contribution'
        });

        expect(updatedProfile).toBeDefined();
        expect(updatedProfile!.reputation).toBe(250);
        expect(updatedProfile!.statistics.totalReputation).toBe(250);
        expect(updatedProfile!.level).toBeGreaterThan(1);

        // Verify reputation log
        expect(mockContext.redis.lpush).toHaveBeenCalledWith(
          `user:${testUserId}:reputation_log:${testSubreddit}`,
          expect.stringContaining('Quality contribution')
        );
      });

      it('should not allow reputation to go below zero', async () => {
        const initialProfile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 50,
          level: 1,
          badges: [],
          achievements: [],
          statistics: {
            totalReputation: 50
          } as UserStatistics,
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(initialProfile));
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.lpush.mockResolvedValue(1);
        mockContext.redis.ltrim.mockResolvedValue('OK');

        const updatedProfile = await gamificationService.updateReputation({
          userId: testUserId,
          subredditName: testSubreddit,
          change: -100,
          reason: 'Penalty'
        });

        expect(updatedProfile!.reputation).toBe(0);
      });
    });

    describe('calculateReputationFromVotes', () => {
      it('should calculate reputation based on sentence votes', async () => {
        const sentenceIds = ['sentence1', 'sentence2'];
        mockContext.redis.smembers.mockResolvedValue(sentenceIds);
        
        // Mock voting metrics for sentences
        mockContext.redis.get
          .mockResolvedValueOnce(JSON.stringify({ weightedScore: 10, qualityRating: 9 }))
          .mockResolvedValueOnce(JSON.stringify({ weightedScore: 5, qualityRating: 6 }));

        const reputation = await gamificationService.calculateReputationFromVotes(
          testUserId,
          testSubreddit
        );

        expect(reputation).toBe(40); // (10*2 + 5*2) + 10 bonus for high quality
        expect(mockContext.redis.smembers).toHaveBeenCalledWith(
          `user:${testUserId}:sentences:${testSubreddit}`
        );
      });

      it('should return 0 if no sentences found', async () => {
        mockContext.redis.smembers.mockResolvedValue([]);

        const reputation = await gamificationService.calculateReputationFromVotes(
          testUserId,
          testSubreddit
        );

        expect(reputation).toBe(0);
      });
    });
  });

  describe('Achievement and Badge System', () => {
    describe('awardBadge', () => {
      it('should award a badge to user and update reputation', async () => {
        const initialProfile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 100,
          level: 1,
          badges: [],
          achievements: [],
          statistics: {
            totalReputation: 100
          } as UserStatistics,
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        const badge: Badge = {
          id: 'test_badge',
          name: 'Test Badge',
          description: 'A test badge',
          iconUrl: '🏆',
          rarity: 'rare',
          earnedAt: Date.now(),
          category: 'storytelling'
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(initialProfile));
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.lpush.mockResolvedValue(1);
        mockContext.redis.ltrim.mockResolvedValue('OK');

        const result = await gamificationService.awardBadge({
          userId: testUserId,
          badgeId: badge.id,
          subredditName: testSubreddit,
          reason: 'Test achievement'
        }, badge);

        expect(result).toBe(true);

        // Verify badge was added and reputation updated
        expect(mockContext.redis.set).toHaveBeenCalledWith(
          `user:${testUserId}:profile:${testSubreddit}`,
          expect.stringContaining(badge.name)
        );

        // Verify badge log
        expect(mockContext.redis.lpush).toHaveBeenCalledWith(
          `user:${testUserId}:badge_log:${testSubreddit}`,
          expect.stringContaining('Test achievement')
        );
      });

      it('should not award duplicate badges', async () => {
        const existingBadge: Badge = {
          id: 'test_badge',
          name: 'Test Badge',
          description: 'A test badge',
          iconUrl: '🏆',
          rarity: 'rare',
          earnedAt: Date.now() - 1000,
          category: 'storytelling'
        };

        const profileWithBadge: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 100,
          level: 1,
          badges: [existingBadge],
          achievements: [],
          statistics: {
            totalReputation: 100
          } as UserStatistics,
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(profileWithBadge));

        const result = await gamificationService.awardBadge({
          userId: testUserId,
          badgeId: 'test_badge',
          subredditName: testSubreddit
        });

        expect(result).toBe(false);
        expect(mockContext.redis.set).not.toHaveBeenCalled();
      });

      it('should award correct reputation bonus based on badge rarity', async () => {
        const legendaryBadge: Badge = {
          id: 'legendary_badge',
          name: 'Legendary Badge',
          description: 'A legendary achievement',
          iconUrl: '👑',
          rarity: 'legendary',
          earnedAt: Date.now(),
          category: 'storytelling'
        };

        const initialProfile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 100,
          level: 1,
          badges: [],
          achievements: [],
          statistics: {
            totalReputation: 100
          } as UserStatistics,
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(initialProfile));
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.lpush.mockResolvedValue(1);
        mockContext.redis.ltrim.mockResolvedValue('OK');

        await gamificationService.awardBadge({
          userId: testUserId,
          badgeId: legendaryBadge.id,
          subredditName: testSubreddit
        }, legendaryBadge);

        // Verify the profile was updated with legendary badge reputation bonus (100 points)
        const setCall = mockContext.redis.set.mock.calls.find(call => 
          call[0] === `user:${testUserId}:profile:${testSubreddit}`
        );
        expect(setCall).toBeDefined();
        const updatedProfile = JSON.parse(setCall[1]);
        expect(updatedProfile.reputation).toBe(200); // 100 + 100 legendary bonus
      });
    });

    describe('updateUserStatistics', () => {
      it('should update sentence statistics correctly', async () => {
        const initialProfile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 100,
          level: 1,
          badges: [],
          achievements: [],
          statistics: {
            totalSentences: 5,
            totalVotes: 0,
            averageVoteScore: 0,
            storiesStarted: 0,
            storiesCompleted: 0,
            branchesCreated: 0,
            daysActive: 1,
            longestStreak: 1,
            currentStreak: 1,
            favoriteCategories: [],
            totalReputation: 100
          },
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(initialProfile));
        mockContext.redis.set.mockResolvedValue('OK');

        await gamificationService.updateUserStatistics(testUserId, testSubreddit, {
          type: 'sentence'
        });

        // Verify statistics were updated
        const setCall = mockContext.redis.set.mock.calls.find(call => 
          call[0] === `user:${testUserId}:profile:${testSubreddit}`
        );
        expect(setCall).toBeDefined();
        const updatedProfile = JSON.parse(setCall[1]);
        expect(updatedProfile.statistics.totalSentences).toBe(6);
      });

      it('should update vote statistics and recalculate average', async () => {
        const initialProfile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 100,
          level: 1,
          badges: [],
          achievements: [],
          statistics: {
            totalSentences: 0,
            totalVotes: 2,
            averageVoteScore: 7.5, // (8 + 7) / 2
            storiesStarted: 0,
            storiesCompleted: 0,
            branchesCreated: 0,
            daysActive: 1,
            longestStreak: 1,
            currentStreak: 1,
            favoriteCategories: [],
            totalReputation: 100
          },
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(initialProfile));
        mockContext.redis.set.mockResolvedValue('OK');

        await gamificationService.updateUserStatistics(testUserId, testSubreddit, {
          type: 'vote',
          value: 9
        });

        // Verify vote statistics were updated
        const setCall = mockContext.redis.set.mock.calls.find(call => 
          call[0] === `user:${testUserId}:profile:${testSubreddit}`
        );
        expect(setCall).toBeDefined();
        const updatedProfile = JSON.parse(setCall[1]);
        expect(updatedProfile.statistics.totalVotes).toBe(3);
        expect(updatedProfile.statistics.averageVoteScore).toBe(8); // (7.5*2 + 9) / 3
      });

      it('should update story completion statistics', async () => {
        const initialProfile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 100,
          level: 1,
          badges: [],
          achievements: [],
          statistics: {
            totalSentences: 0,
            totalVotes: 0,
            averageVoteScore: 0,
            storiesStarted: 2,
            storiesCompleted: 1,
            branchesCreated: 0,
            daysActive: 1,
            longestStreak: 1,
            currentStreak: 1,
            favoriteCategories: [],
            totalReputation: 100
          },
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(initialProfile));
        mockContext.redis.set.mockResolvedValue('OK');

        await gamificationService.updateUserStatistics(testUserId, testSubreddit, {
          type: 'story_complete'
        });

        // Verify story completion statistics were updated
        const setCall = mockContext.redis.set.mock.calls.find(call => 
          call[0] === `user:${testUserId}:profile:${testSubreddit}`
        );
        expect(setCall).toBeDefined();
        const updatedProfile = JSON.parse(setCall[1]);
        expect(updatedProfile.statistics.storiesCompleted).toBe(2);
      });
    });
  });

  describe('Level Progression System', () => {
    describe('handleLevelUp', () => {
      it('should award milestone badges for significant level increases', async () => {
        const profile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 500,
          level: 5,
          badges: [],
          achievements: [],
          statistics: {
            totalReputation: 500
          } as UserStatistics,
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(profile));
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.lpush.mockResolvedValue(1);
        mockContext.redis.ltrim.mockResolvedValue('OK');

        await gamificationService.handleLevelUp(testUserId, testSubreddit, 10, 4);

        // Should award level 5 and level 10 milestone badges
        expect(mockContext.redis.set).toHaveBeenCalledTimes(3); // Profile update + 2 badge awards
        expect(mockContext.redis.lpush).toHaveBeenCalledWith(
          `user:${testUserId}:badge_log:${testSubreddit}`,
          expect.stringContaining('Level 5 Master')
        );
        expect(mockContext.redis.lpush).toHaveBeenCalledWith(
          `user:${testUserId}:badge_log:${testSubreddit}`,
          expect.stringContaining('Level 10 Master')
        );
      });

      it('should award reputation bonus for level up', async () => {
        const profile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 200,
          level: 2,
          badges: [],
          achievements: [],
          statistics: {
            totalReputation: 200
          } as UserStatistics,
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        mockContext.redis.get.mockResolvedValue(JSON.stringify(profile));
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.lpush.mockResolvedValue(1);
        mockContext.redis.ltrim.mockResolvedValue('OK');

        await gamificationService.handleLevelUp(testUserId, testSubreddit, 3, 2);

        // Verify reputation bonus was awarded (level 3 * 10 = 30 points)
        expect(mockContext.redis.lpush).toHaveBeenCalledWith(
          `user:${testUserId}:reputation_log:${testSubreddit}`,
          expect.stringContaining('Level up to 3')
        );
      });
    });

    describe('updateDailyActivity', () => {
      it('should track daily activity and update streaks', async () => {
        const profile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 100,
          level: 1,
          badges: [],
          achievements: [],
          statistics: {
            daysActive: 5,
            currentStreak: 3,
            longestStreak: 5,
            totalReputation: 100
          } as UserStatistics,
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = `user:${testUserId}:activity:${testSubreddit}:${yesterday.toDateString()}`;

        mockContext.redis.get
          .mockResolvedValueOnce(null) // Not active today yet
          .mockResolvedValueOnce(JSON.stringify(profile)) // Get profile
          .mockResolvedValueOnce('1'); // Was active yesterday

        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.expire.mockResolvedValue(1);

        await gamificationService.updateDailyActivity(testUserId, testSubreddit);

        // Verify activity tracking
        expect(mockContext.redis.set).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`user:${testUserId}:activity:${testSubreddit}:`)),
          '1'
        );
        expect(mockContext.redis.expire).toHaveBeenCalled();

        // Verify profile update with continued streak
        const profileUpdateCall = mockContext.redis.set.mock.calls.find(call => 
          call[0] === `user:${testUserId}:profile:${testSubreddit}`
        );
        expect(profileUpdateCall).toBeDefined();
        const updatedProfile = JSON.parse(profileUpdateCall[1]);
        expect(updatedProfile.statistics.daysActive).toBe(6);
        expect(updatedProfile.statistics.currentStreak).toBe(4);
        expect(updatedProfile.statistics.longestStreak).toBe(5);
      });

      it('should reset streak if not active yesterday', async () => {
        const profile: UserProfile = {
          userId: testUserId,
          username: testUsername,
          reputation: 100,
          level: 1,
          badges: [],
          achievements: [],
          statistics: {
            daysActive: 5,
            currentStreak: 10,
            longestStreak: 15,
            totalReputation: 100
          } as UserStatistics,
          preferences: {} as any,
          joinedAt: Date.now(),
          lastActive: Date.now()
        };

        mockContext.redis.get
          .mockResolvedValueOnce(null) // Not active today yet
          .mockResolvedValueOnce(JSON.stringify(profile)) // Get profile
          .mockResolvedValueOnce(null); // Was NOT active yesterday

        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.expire.mockResolvedValue(1);

        await gamificationService.updateDailyActivity(testUserId, testSubreddit);

        // Verify streak was reset
        const profileUpdateCall = mockContext.redis.set.mock.calls.find(call => 
          call[0] === `user:${testUserId}:profile:${testSubreddit}`
        );
        expect(profileUpdateCall).toBeDefined();
        const updatedProfile = JSON.parse(profileUpdateCall[1]);
        expect(updatedProfile.statistics.currentStreak).toBe(1);
        expect(updatedProfile.statistics.longestStreak).toBe(15); // Should remain unchanged
      });
    });
  });

  describe('History and Logging', () => {
    describe('getReputationHistory', () => {
      it('should return reputation change history', async () => {
        const mockHistory = [
          JSON.stringify({
            oldReputation: 100,
            newReputation: 150,
            change: 50,
            reason: 'Quality contribution',
            timestamp: Date.now()
          }),
          JSON.stringify({
            oldReputation: 150,
            newReputation: 140,
            change: -10,
            reason: 'Minor penalty',
            timestamp: Date.now() - 1000
          })
        ];

        mockContext.redis.lrange.mockResolvedValue(mockHistory);

        const history = await gamificationService.getReputationHistory(testUserId, testSubreddit, 10);

        expect(history).toHaveLength(2);
        expect(history[0].reason).toBe('Quality contribution');
        expect(history[0].change).toBe(50);
        expect(history[1].reason).toBe('Minor penalty');
        expect(history[1].change).toBe(-10);

        expect(mockContext.redis.lrange).toHaveBeenCalledWith(
          `user:${testUserId}:reputation_log:${testSubreddit}`,
          0,
          9
        );
      });

      it('should return empty array if no history found', async () => {
        mockContext.redis.lrange.mockResolvedValue([]);

        const history = await gamificationService.getReputationHistory(testUserId, testSubreddit);

        expect(history).toEqual([]);
      });
    });

    describe('getBadgeHistory', () => {
      it('should return badge award history', async () => {
        const mockBadgeHistory = [
          JSON.stringify({
            badge: {
              id: 'welcome',
              name: 'Welcome Badge',
              rarity: 'common'
            },
            reason: 'Welcome to the community',
            timestamp: Date.now()
          })
        ];

        mockContext.redis.lrange.mockResolvedValue(mockBadgeHistory);

        const history = await gamificationService.getBadgeHistory(testUserId, testSubreddit, 5);

        expect(history).toHaveLength(1);
        expect(history[0].badge.name).toBe('Welcome Badge');
        expect(history[0].reason).toBe('Welcome to the community');

        expect(mockContext.redis.lrange).toHaveBeenCalledWith(
          `user:${testUserId}:badge_log:${testSubreddit}`,
          0,
          4
        );
      });
    });
  });

  describe('Leaderboard System', () => {
    describe('generateMonthlyLeaderboard', () => {
      it('should generate leaderboard with correct rankings', async () => {
        const userIds = ['user1', 'user2', 'user3'];
        const profiles = [
          {
            userId: 'user1',
            username: 'TopUser',
            reputation: 500,
            level: 5,
            badges: [],
            statistics: { totalReputation: 500 }
          },
          {
            userId: 'user2',
            username: 'MidUser',
            reputation: 300,
            level: 3,
            badges: [],
            statistics: { totalReputation: 300 }
          },
          {
            userId: 'user3',
            username: 'NewUser',
            reputation: 100,
            level: 1,
            badges: [],
            statistics: { totalReputation: 100 }
          }
        ];

        mockContext.redis.smembers.mockResolvedValue(userIds);
        mockContext.redis.get
          .mockResolvedValueOnce(JSON.stringify(profiles[0]))
          .mockResolvedValueOnce(JSON.stringify(profiles[1]))
          .mockResolvedValueOnce(JSON.stringify(profiles[2]));
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.expire.mockResolvedValue(1);

        const leaderboard = await gamificationService.generateMonthlyLeaderboard({
          subredditName: testSubreddit,
          category: 'overall',
          period: 'monthly',
          limit: 10
        });

        expect(leaderboard).toHaveLength(3);
        expect(leaderboard[0].username).toBe('TopUser');
        expect(leaderboard[0].rank).toBe(1);
        expect(leaderboard[1].username).toBe('MidUser');
        expect(leaderboard[1].rank).toBe(2);
        expect(leaderboard[2].username).toBe('NewUser');
        expect(leaderboard[2].rank).toBe(3);

        // Verify leaderboard was cached
        expect(mockContext.redis.set).toHaveBeenCalledWith(
          `leaderboard:${testSubreddit}:overall:monthly`,
          expect.stringContaining('TopUser')
        );
        expect(mockContext.redis.expire).toHaveBeenCalled();
      });

      it('should handle empty user list', async () => {
        mockContext.redis.smembers.mockResolvedValue([]);
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.expire.mockResolvedValue(1);

        const leaderboard = await gamificationService.generateMonthlyLeaderboard({
          subredditName: testSubreddit,
          category: 'overall'
        });

        expect(leaderboard).toEqual([]);
      });

      it('should respect limit and offset parameters', async () => {
        const userIds = ['user1', 'user2', 'user3', 'user4', 'user5'];
        const profiles = userIds.map((id, index) => ({
          userId: id,
          username: `User${index + 1}`,
          reputation: 500 - (index * 100),
          level: 5 - index,
          badges: [],
          statistics: { totalReputation: 500 - (index * 100) }
        }));

        mockContext.redis.smembers.mockResolvedValue(userIds);
        profiles.forEach(profile => {
          mockContext.redis.get.mockResolvedValueOnce(JSON.stringify(profile));
        });
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.expire.mockResolvedValue(1);

        const leaderboard = await gamificationService.generateMonthlyLeaderboard({
          subredditName: testSubreddit,
          category: 'overall',
          limit: 2,
          offset: 1
        });

        expect(leaderboard).toHaveLength(2);
        expect(leaderboard[0].username).toBe('User2');
        expect(leaderboard[0].rank).toBe(2);
        expect(leaderboard[1].username).toBe('User3');
        expect(leaderboard[1].rank).toBe(3);
      });
    });

    describe('getLeaderboard', () => {
      it('should return cached leaderboard if available', async () => {
        const cachedLeaderboard = [
          {
            userId: 'user1',
            username: 'CachedUser',
            reputation: 500,
            level: 5,
            badges: [],
            rank: 1
          }
        ];

        mockContext.redis.get.mockResolvedValue(JSON.stringify(cachedLeaderboard));

        const leaderboard = await gamificationService.getLeaderboard({
          subredditName: testSubreddit,
          category: 'overall'
        });

        expect(leaderboard).toEqual(cachedLeaderboard);
        expect(mockContext.redis.get).toHaveBeenCalledWith(
          `leaderboard:${testSubreddit}:overall:monthly`
        );
      });

      it('should generate new leaderboard if not cached', async () => {
        const userIds = ['user1'];
        const profile = {
          userId: 'user1',
          username: 'TestUser',
          reputation: 200,
          level: 2,
          badges: [],
          statistics: { totalReputation: 200 }
        };

        mockContext.redis.get.mockResolvedValueOnce(null); // No cached leaderboard
        mockContext.redis.smembers.mockResolvedValue(userIds);
        mockContext.redis.get.mockResolvedValueOnce(JSON.stringify(profile));
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.expire.mockResolvedValue(1);

        const leaderboard = await gamificationService.getLeaderboard({
          subredditName: testSubreddit,
          category: 'overall'
        });

        expect(leaderboard).toHaveLength(1);
        expect(leaderboard[0].username).toBe('TestUser');
        expect(leaderboard[0].rank).toBe(1);
      });
    });

    describe('getUserLeaderboardPosition', () => {
      it('should return user position and score', async () => {
        const userIds = ['user1', 'user2', 'user3'];
        const profiles = [
          {
            userId: 'user1',
            username: 'TopUser',
            reputation: 500,
            level: 5,
            badges: [],
            statistics: { totalReputation: 500 }
          },
          {
            userId: 'user2',
            username: 'MidUser',
            reputation: 300,
            level: 3,
            badges: [],
            statistics: { totalReputation: 300 }
          },
          {
            userId: 'user3',
            username: 'NewUser',
            reputation: 100,
            level: 1,
            badges: [],
            statistics: { totalReputation: 100 }
          }
        ];

        mockContext.redis.smembers.mockResolvedValue(userIds);
        profiles.forEach(profile => {
          mockContext.redis.get.mockResolvedValueOnce(JSON.stringify(profile));
        });
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.expire.mockResolvedValue(1);

        const position = await gamificationService.getUserLeaderboardPosition('user2', {
          subredditName: testSubreddit,
          category: 'overall'
        });

        expect(position.rank).toBe(2);
        expect(position.score).toBeGreaterThan(0);
        expect(position.totalUsers).toBe(3);
      });

      it('should return null for user not in leaderboard', async () => {
        mockContext.redis.smembers.mockResolvedValue(['user1']);
        mockContext.redis.get.mockResolvedValueOnce(JSON.stringify({
          userId: 'user1',
          username: 'OnlyUser',
          reputation: 100,
          level: 1,
          badges: [],
          statistics: { totalReputation: 100 }
        }));
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.expire.mockResolvedValue(1);

        const position = await gamificationService.getUserLeaderboardPosition('nonexistent', {
          subredditName: testSubreddit,
          category: 'overall'
        });

        expect(position).toBeNull();
      });
    });

    describe('leaderboard categories', () => {
      it('should handle different leaderboard categories', async () => {
        const userIds = ['user1'];
        const profile = {
          userId: 'user1',
          username: 'TestUser',
          reputation: 200,
          level: 2,
          badges: [],
          statistics: { 
            totalReputation: 200,
            totalSentences: 50,
            averageVoteScore: 8.5
          }
        };

        mockContext.redis.smembers.mockResolvedValue(userIds);
        mockContext.redis.get.mockResolvedValue(JSON.stringify(profile));
        mockContext.redis.set.mockResolvedValue('OK');
        mockContext.redis.expire.mockResolvedValue(1);

        // Test storytelling category
        const storytellingLeaderboard = await gamificationService.generateMonthlyLeaderboard({
          subredditName: testSubreddit,
          category: 'storytelling'
        });

        expect(storytellingLeaderboard).toHaveLength(1);
        expect(storytellingLeaderboard[0].username).toBe('TestUser');

        // Test quality category
        const qualityLeaderboard = await gamificationService.generateMonthlyLeaderboard({
          subredditName: testSubreddit,
          category: 'quality'
        });

        expect(qualityLeaderboard).toHaveLength(1);
        expect(qualityLeaderboard[0].username).toBe('TestUser');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully in createUserProfile', async () => {
      mockContext.redis.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(gamificationService.createUserProfile({
        userId: testUserId,
        username: testUsername,
        subredditName: testSubreddit
      })).rejects.toThrow('Failed to create user profile');
    });

    it('should handle Redis errors gracefully in updateReputation', async () => {
      mockContext.redis.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await gamificationService.updateReputation({
        userId: testUserId,
        subredditName: testSubreddit,
        change: 50,
        reason: 'Test'
      });

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully in awardBadge', async () => {
      mockContext.redis.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await gamificationService.awardBadge({
        userId: testUserId,
        badgeId: 'test_badge',
        subredditName: testSubreddit
      });

      expect(result).toBe(false);
    });

    it('should return 0 reputation when calculateReputationFromVotes fails', async () => {
      mockContext.redis.smembers.mockRejectedValue(new Error('Redis error'));

      const reputation = await gamificationService.calculateReputationFromVotes(testUserId, testSubreddit);

      expect(reputation).toBe(0);
    });
  });
});