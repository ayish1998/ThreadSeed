// src/services/gamificationService.ts
import { Context } from '@devvit/public-api';
import {
  UserProfile,
  Badge,
  Achievement,
  UserStatistics,
  UserPreferences,
  AchievementReward,
  AchievementRequirement,
  validateUserProfile,
  validateBadge,
  calculateUserLevel,
  calculateReputationForLevel,
  updateAchievementProgress
} from '../types/story.js';

// Interfaces for gamification service functionality
export interface CreateUserProfileParams {
  userId: string;
  username: string;
  subredditName: string;
}

export interface ReputationUpdateParams {
  userId: string;
  subredditName: string;
  change: number;
  reason: string;
  sourceId?: string; // Story ID, sentence ID, etc.
}

export interface BadgeAwardParams {
  userId: string;
  badgeId: string;
  subredditName: string;
  reason?: string;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  reputation: number;
  level: number;
  badges: Badge[];
  rank: number;
  change?: number; // Position change from previous period
}

export interface LeaderboardOptions {
  subredditName: string;
  category?: 'overall' | 'storytelling' | 'community' | 'quality';
  period?: 'daily' | 'weekly' | 'monthly' | 'all-time';
  limit?: number;
  offset?: number;
}

export class GamificationService {
  private context: Context;
  private readonly LEVEL_MULTIPLIER = 100;
  private readonly MAX_LEVEL = 100;
  private readonly REPUTATION_DECAY_RATE = 0.95; // 5% decay per month for inactive users

  constructor(context: Context) {
    this.context = context;
  }

  /**
   * Create or get user profile with reputation management
   * Requirements: 4.1, 4.4
   */
  async createUserProfile(params: CreateUserProfileParams): Promise<UserProfile> {
    try {
      const { userId, username, subredditName } = params;
      const profileKey = `user:${userId}:profile:${subredditName}`;

      // Check if profile already exists
      const existingProfileData = await this.context.redis.get(profileKey);
      if (existingProfileData) {
        return JSON.parse(existingProfileData);
      }

      // Create new user profile
      const initialStatistics: UserStatistics = {
        totalSentences: 0,
        totalVotes: 0,
        averageVoteScore: 0,
        storiesStarted: 0,
        storiesCompleted: 0,
        branchesCreated: 0,
        daysActive: 1,
        longestStreak: 1,
        currentStreak: 1,
        favoriteCategories: [],
        totalReputation: 100 // Starting reputation
      };

      const defaultPreferences: UserPreferences = {
        notifications: {
          storyUpdates: true,
          achievements: true,
          mentions: true,
          weeklyDigest: true
        },
        privacy: {
          showProfile: true,
          showStatistics: true,
          showBadges: true
        },
        interface: {
          theme: 'auto',
          compactMode: false,
          showTypingIndicators: true
        }
      };

      const userProfile: UserProfile = {
        userId,
        username,
        reputation: 100,
        level: 1,
        badges: [],
        achievements: [],
        statistics: initialStatistics,
        preferences: defaultPreferences,
        joinedAt: Date.now(),
        lastActive: Date.now()
      };

      // Validate profile
      if (!validateUserProfile(userProfile)) {
        throw new Error('Invalid user profile data');
      }

      // Store profile
      await this.context.redis.set(profileKey, JSON.stringify(userProfile));

      // Add to subreddit users set using key-value storage
      const usersKey = `subreddit:${subredditName}:users`;
      const existingUsers = await this.context.redis.get(usersKey);
      const usersList = existingUsers ? JSON.parse(existingUsers) : [];
      if (!usersList.includes(userId)) {
        usersList.push(userId);
        await this.context.redis.set(usersKey, JSON.stringify(usersList));
      }

      // Initialize daily activity tracking
      await this.updateDailyActivity(userId, subredditName);

      // Award welcome badge
      await this.awardWelcomeBadge(userId, subredditName);

      console.log(`Created user profile for ${username} (${userId}) in ${subredditName}`);
      return userProfile;

    } catch (error) {
      console.error('Failed to create user profile:', error);
      throw new Error('Failed to create user profile');
    }
  }

  /**
   * Get user profile by ID and subreddit
   */
  async getUserProfile(userId: string, subredditName: string): Promise<UserProfile | null> {
    try {
      const profileKey = `user:${userId}:profile:${subredditName}`;
      const profileData = await this.context.redis.get(profileKey);

      if (!profileData) {
        return null;
      }

      const profile: UserProfile = JSON.parse(profileData);

      // Update last active timestamp
      profile.lastActive = Date.now();
      await this.context.redis.set(profileKey, JSON.stringify(profile));

      return profile;
    } catch (error) {
      console.error('Failed to get user profile:', error);
      return null;
    }
  }

  /**
   * Update user reputation based on community engagement
   * Requirements: 4.1, 4.4
   */
  async updateReputation(params: ReputationUpdateParams): Promise<UserProfile | null> {
    try {
      const { userId, subredditName, change, reason, sourceId } = params;

      // Get user profile
      let profile = await this.getUserProfile(userId, subredditName);
      if (!profile) {
        // Create profile if it doesn't exist
        const username = await this.getUsernameFromReddit(userId);
        profile = await this.createUserProfile({ userId, username, subredditName });
      }

      // Apply reputation change
      const oldReputation = profile.reputation;
      profile.reputation = Math.max(0, profile.reputation + change);

      // Update level based on new reputation
      const newLevel = calculateUserLevel(profile.reputation);
      const oldLevel = profile.level;
      profile.level = Math.min(this.MAX_LEVEL, newLevel);

      // Update statistics
      profile.statistics.totalReputation = profile.reputation;
      profile.lastActive = Date.now();

      // Check for level up achievements
      if (newLevel > oldLevel) {
        await this.handleLevelUp(userId, subredditName, newLevel, oldLevel);
      }

      // Store updated profile
      const profileKey = `user:${userId}:profile:${subredditName}`;
      await this.context.redis.set(profileKey, JSON.stringify(profile));

      // Log reputation change
      await this.logReputationChange(userId, subredditName, {
        oldReputation,
        newReputation: profile.reputation,
        change,
        reason,
        sourceId,
        timestamp: Date.now()
      });

      console.log(`Updated reputation for ${profile.username}: ${oldReputation} -> ${profile.reputation} (${change > 0 ? '+' : ''}${change}) - ${reason}`);

      return profile;

    } catch (error) {
      console.error('Failed to update reputation:', error);
      return null;
    }
  }

  /**
   * Calculate reputation based on sentence votes and community engagement
   */
  async calculateReputationFromVotes(userId: string, subredditName: string): Promise<number> {
    try {
      // Get all sentences by this user in the subreddit
      const userSentencesKey = `user:${userId}:sentences:${subredditName}`;
      const sentenceIdsData = await this.context.redis.get(userSentencesKey);
      const sentenceIds = sentenceIdsData ? JSON.parse(sentenceIdsData) : [];

      let totalReputationFromVotes = 0;

      for (const sentenceId of sentenceIds) {
        // Get voting metrics for each sentence
        const metricsData = await this.context.redis.get(`metrics:${sentenceId}`);
        if (metricsData) {
          const metrics = JSON.parse(metricsData);

          // Calculate reputation from weighted score
          const reputationFromSentence = Math.max(0, metrics.weightedScore * 2);
          totalReputationFromVotes += reputationFromSentence;

          // Bonus for high quality ratings
          if (metrics.qualityRating >= 8) {
            totalReputationFromVotes += 10;
          }
        }
      }

      return Math.round(totalReputationFromVotes);

    } catch (error) {
      console.error('Failed to calculate reputation from votes:', error);
      return 0;
    }
  }

  /**
   * Add user level progression with milestone rewards
   */
  async handleLevelUp(userId: string, subredditName: string, newLevel: number, oldLevel: number): Promise<void> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return;

      // Award level-up badges for milestone levels
      const milestones = [5, 10, 25, 50, 75, 100];

      for (const milestone of milestones) {
        if (newLevel >= milestone && oldLevel < milestone) {
          await this.awardLevelMilestoneBadge(userId, subredditName, milestone);
        }
      }

      // Award reputation bonus for level up
      const reputationBonus = newLevel * 10;
      await this.updateReputation({
        userId,
        subredditName,
        change: reputationBonus,
        reason: `Level up to ${newLevel}`,
        sourceId: `level_up_${newLevel}`
      });

      console.log(`User ${profile.username} leveled up from ${oldLevel} to ${newLevel} in ${subredditName}`);

    } catch (error) {
      console.error('Failed to handle level up:', error);
    }
  }

  /**
   * Update daily activity tracking and streak calculation
   */
  async updateDailyActivity(userId: string, subredditName: string): Promise<void> {
    try {
      const today = new Date().toDateString();
      const activityKey = `user:${userId}:activity:${subredditName}:${today}`;

      // Check if already active today
      const alreadyActive = await this.context.redis.get(activityKey);
      if (alreadyActive) return;

      // Mark as active today
      await this.context.redis.set(activityKey, '1');
      await this.context.redis.expire(activityKey, 24 * 60 * 60); // Expire after 24 hours

      // Update profile statistics
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return;

      profile.statistics.daysActive += 1;

      // Calculate streak
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = `user:${userId}:activity:${subredditName}:${yesterday.toDateString()}`;
      const wasActiveYesterday = await this.context.redis.get(yesterdayKey);

      if (wasActiveYesterday) {
        // Continue streak
        profile.statistics.currentStreak += 1;
        profile.statistics.longestStreak = Math.max(
          profile.statistics.longestStreak,
          profile.statistics.currentStreak
        );
      } else {
        // Reset streak
        profile.statistics.currentStreak = 1;
      }

      // Save updated profile
      const profileKey = `user:${userId}:profile:${subredditName}`;
      await this.context.redis.set(profileKey, JSON.stringify(profile));

      // Check for streak achievements
      await this.checkStreakAchievements(userId, subredditName, profile.statistics.currentStreak);

    } catch (error) {
      console.error('Failed to update daily activity:', error);
    }
  }

  /**
   * Award welcome badge to new users
   */
  private async awardWelcomeBadge(userId: string, subredditName: string): Promise<void> {
    try {
      const welcomeBadge: Badge = {
        id: 'welcome',
        name: 'Welcome to StoryWeave',
        description: 'Awarded for joining the community',
        iconUrl: '🎉',
        rarity: 'common',
        earnedAt: Date.now(),
        category: 'participation'
      };

      await this.awardBadge({
        userId,
        badgeId: welcomeBadge.id,
        subredditName,
        reason: 'Welcome to the community!'
      }, welcomeBadge);

    } catch (error) {
      console.error('Failed to award welcome badge:', error);
    }
  }

  /**
   * Award level milestone badges
   */
  private async awardLevelMilestoneBadge(userId: string, subredditName: string, level: number): Promise<void> {
    try {
      const milestoneRarities: Record<number, Badge['rarity']> = {
        5: 'common',
        10: 'common',
        25: 'rare',
        50: 'epic',
        75: 'epic',
        100: 'legendary'
      };

      const milestoneBadge: Badge = {
        id: `level_${level}`,
        name: `Level ${level} Master`,
        description: `Reached level ${level} through dedication and skill`,
        iconUrl: level >= 50 ? '👑' : level >= 25 ? '🏆' : '⭐',
        rarity: milestoneRarities[level] || 'common',
        earnedAt: Date.now(),
        category: 'participation'
      };

      await this.awardBadge({
        userId,
        badgeId: milestoneBadge.id,
        subredditName,
        reason: `Reached level ${level}`
      }, milestoneBadge);

    } catch (error) {
      console.error('Failed to award level milestone badge:', error);
    }
  }

  /**
   * Check and award streak-based achievements
   */
  private async checkStreakAchievements(userId: string, subredditName: string, currentStreak: number): Promise<void> {
    try {
      const streakMilestones = [7, 30, 100, 365];

      for (const milestone of streakMilestones) {
        if (currentStreak === milestone) {
          const streakBadge: Badge = {
            id: `streak_${milestone}`,
            name: `${milestone} Day Streak`,
            description: `Maintained activity for ${milestone} consecutive days`,
            iconUrl: milestone >= 365 ? '🔥' : milestone >= 100 ? '⚡' : '📅',
            rarity: milestone >= 365 ? 'legendary' : milestone >= 100 ? 'epic' : 'rare',
            earnedAt: Date.now(),
            category: 'participation'
          };

          await this.awardBadge({
            userId,
            badgeId: streakBadge.id,
            subredditName,
            reason: `${milestone} day activity streak`
          }, streakBadge);
        }
      }

    } catch (error) {
      console.error('Failed to check streak achievements:', error);
    }
  }

  /**
   * Award badge to user
   */
  async awardBadge(params: BadgeAwardParams, badge?: Badge): Promise<boolean> {
    try {
      const { userId, badgeId, subredditName, reason } = params;

      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return false;

      // Check if user already has this badge
      const existingBadge = profile.badges.find(b => b.id === badgeId);
      if (existingBadge) {
        console.log(`User ${profile.username} already has badge ${badgeId}`);
        return false;
      }

      // Get badge definition if not provided
      let badgeToAward = badge;
      if (!badgeToAward) {
        badgeToAward = await this.getBadgeDefinition(badgeId);
        if (!badgeToAward) {
          console.error(`Badge definition not found: ${badgeId}`);
          return false;
        }
      }

      // Set earned timestamp
      badgeToAward.earnedAt = Date.now();

      // Validate badge
      if (!validateBadge(badgeToAward)) {
        console.error(`Invalid badge data: ${badgeId}`);
        return false;
      }

      // Add badge to profile
      profile.badges.push(badgeToAward);

      // Award reputation bonus based on badge rarity
      const reputationBonus = this.getBadgeReputationBonus(badgeToAward.rarity);
      profile.reputation += reputationBonus;
      profile.statistics.totalReputation = profile.reputation;

      // Save updated profile
      const profileKey = `user:${userId}:profile:${subredditName}`;
      await this.context.redis.set(profileKey, JSON.stringify(profile));

      // Log badge award
      await this.logBadgeAward(userId, subredditName, badgeToAward, reason);

      console.log(`Awarded ${badgeToAward.rarity} badge "${badgeToAward.name}" to ${profile.username} (+${reputationBonus} reputation)`);

      return true;

    } catch (error) {
      console.error('Failed to award badge:', error);
      return false;
    }
  }

  /**
   * Get reputation bonus for badge rarity
   */
  private getBadgeReputationBonus(rarity: Badge['rarity']): number {
    const bonuses = {
      common: 10,
      rare: 25,
      epic: 50,
      legendary: 100
    };
    return bonuses[rarity] || 10;
  }

  /**
   * Get badge definition by ID
   */
  private async getBadgeDefinition(badgeId: string): Promise<Badge | undefined> {
    try {
      const badgeData = await this.context.redis.get(`badge:${badgeId}`);
      return badgeData ? JSON.parse(badgeData) : undefined;
    } catch (error) {
      console.error('Failed to get badge definition:', error);
      return undefined;
    }
  }

  /**
   * Log reputation change for audit trail
   */
  private async logReputationChange(userId: string, subredditName: string, change: any): Promise<void> {
    try {
      const logKey = `user:${userId}:reputation_log:${subredditName}`;
      const logEntry = JSON.stringify(change);

      // Add to list (keep last 100 entries) using key-value storage
      const existingLog = await this.context.redis.get(logKey);
      const logEntries = existingLog ? JSON.parse(existingLog) : [];
      logEntries.unshift(logEntry); // Add to beginning
      const trimmedLog = logEntries.slice(0, 100); // Keep last 100
      await this.context.redis.set(logKey, JSON.stringify(trimmedLog));

    } catch (error) {
      console.error('Failed to log reputation change:', error);
    }
  }

  /**
   * Log badge award for audit trail
   */
  private async logBadgeAward(userId: string, subredditName: string, badge: Badge, reason?: string): Promise<void> {
    try {
      const logKey = `user:${userId}:badge_log:${subredditName}`;
      const logEntry = JSON.stringify({
        badge,
        reason,
        timestamp: Date.now()
      });

      // Add to list (keep last 50 entries) using key-value storage
      const existingLog = await this.context.redis.get(logKey);
      const logEntries = existingLog ? JSON.parse(existingLog) : [];
      logEntries.unshift(logEntry); // Add to beginning
      const trimmedLog = logEntries.slice(0, 50); // Keep last 50
      await this.context.redis.set(logKey, JSON.stringify(trimmedLog));

    } catch (error) {
      console.error('Failed to log badge award:', error);
    }
  }

  /**
   * Get username from Reddit API (fallback method)
   */
  private async getUsernameFromReddit(userId: string): Promise<string> {
    try {
      // This would typically use the Reddit API to get username
      // For now, return a placeholder
      return `User_${userId.slice(-8)}`;
    } catch (error) {
      console.error('Failed to get username from Reddit:', error);
      return `User_${userId.slice(-8)}`;
    }
  }

  /**
   * Update user statistics based on activity
   */
  async updateUserStatistics(userId: string, subredditName: string, activity: {
    type: 'sentence' | 'vote' | 'story_start' | 'story_complete' | 'branch_create';
    value?: number;
    metadata?: any;
  }): Promise<void> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return;

      // Update statistics based on activity type
      switch (activity.type) {
        case 'sentence':
          profile.statistics.totalSentences += 1;
          break;
        case 'vote':
          profile.statistics.totalVotes += 1;
          if (activity.value !== undefined) {
            // Recalculate average vote score
            const totalScore = profile.statistics.averageVoteScore * (profile.statistics.totalVotes - 1) + activity.value;
            profile.statistics.averageVoteScore = totalScore / profile.statistics.totalVotes;
          }
          break;
        case 'story_start':
          profile.statistics.storiesStarted += 1;
          break;
        case 'story_complete':
          profile.statistics.storiesCompleted += 1;
          break;
        case 'branch_create':
          profile.statistics.branchesCreated += 1;
          break;
      }

      // Update last active
      profile.lastActive = Date.now();

      // Save updated profile
      const profileKey = `user:${userId}:profile:${subredditName}`;
      await this.context.redis.set(profileKey, JSON.stringify(profile));

      // Check for activity-based achievements
      await this.checkActivityAchievements(userId, subredditName, profile.statistics);

    } catch (error) {
      console.error('Failed to update user statistics:', error);
    }
  }

  /**
   * Check and award activity-based achievements
   */
  private async checkActivityAchievements(userId: string, subredditName: string, stats: UserStatistics): Promise<void> {
    try {
      // Sentence milestones
      const sentenceMilestones = [10, 50, 100, 500, 1000];
      for (const milestone of sentenceMilestones) {
        if (stats.totalSentences === milestone) {
          const badge: Badge = {
            id: `sentences_${milestone}`,
            name: `${milestone} Sentences`,
            description: `Contributed ${milestone} sentences to stories`,
            iconUrl: '✍️',
            rarity: milestone >= 1000 ? 'legendary' : milestone >= 500 ? 'epic' : milestone >= 100 ? 'rare' : 'common',
            earnedAt: Date.now(),
            category: 'storytelling'
          };
          await this.awardBadge({ userId, badgeId: badge.id, subredditName }, badge);
        }
      }

      // Story completion milestones
      const completionMilestones = [1, 5, 10, 25, 50];
      for (const milestone of completionMilestones) {
        if (stats.storiesCompleted === milestone) {
          const badge: Badge = {
            id: `completed_${milestone}`,
            name: `${milestone} Stories Completed`,
            description: `Helped complete ${milestone} collaborative stories`,
            iconUrl: '📚',
            rarity: milestone >= 50 ? 'legendary' : milestone >= 25 ? 'epic' : milestone >= 10 ? 'rare' : 'common',
            earnedAt: Date.now(),
            category: 'storytelling'
          };
          await this.awardBadge({ userId, badgeId: badge.id, subredditName }, badge);
        }
      }

    } catch (error) {
      console.error('Failed to check activity achievements:', error);
    }
  }

  /**
   * Get user's reputation history
   */
  async getReputationHistory(userId: string, subredditName: string, limit: number = 20): Promise<any[]> {
    try {
      const logKey = `user:${userId}:reputation_log:${subredditName}`;
      const logData = await this.context.redis.get(logKey);
      const logEntries = logData ? JSON.parse(logData) : [];

      return logEntries.slice(0, limit).map((entry: any) => JSON.parse(entry));
    } catch (error) {
      console.error('Failed to get reputation history:', error);
      return [];
    }
  }

  /**
   * Get user's badge history
   */
  async getBadgeHistory(userId: string, subredditName: string, limit: number = 20): Promise<any[]> {
    try {
      const logKey = `user:${userId}:badge_log:${subredditName}`;
      const logData = await this.context.redis.get(logKey);
      const logEntries = logData ? JSON.parse(logData) : [];

      return logEntries.slice(0, limit).map((entry: any) => JSON.parse(entry));
    } catch (error) {
      console.error('Failed to get badge history:', error);
      return [];
    }
  }

  /**
   * Achievement and Badge System Implementation
   * Requirements: 4.2
   */

  /**
   * Initialize default achievements for a subreddit
   */
  async initializeDefaultAchievements(subredditName: string): Promise<void> {
    try {
      const defaultAchievements = this.getDefaultAchievements();

      for (const achievement of defaultAchievements) {
        const achievementKey = `achievement:${achievement.id}`;
        await this.context.redis.set(achievementKey, JSON.stringify(achievement));
        // Add to achievements list using key-value storage
        const achievementsKey = `subreddit:${subredditName}:achievements`;
        const existingAchievements = await this.context.redis.get(achievementsKey);
        const achievementsList = existingAchievements ? JSON.parse(existingAchievements) : [];
        if (!achievementsList.includes(achievement.id)) {
          achievementsList.push(achievement.id);
          await this.context.redis.set(achievementsKey, JSON.stringify(achievementsList));
        }
      }

      console.log(`Initialized ${defaultAchievements.length} default achievements for ${subredditName}`);

    } catch (error) {
      console.error('Failed to initialize default achievements:', error);
    }
  }

  /**
   * Get default achievement definitions
   */
  private getDefaultAchievements(): Achievement[] {
    return [
      // Storytelling achievements
      {
        id: 'first_sentence',
        name: 'First Words',
        description: 'Write your first sentence in a collaborative story',
        progress: 0,
        maxProgress: 1,
        reward: {
          type: 'badge',
          value: 'first_sentence_badge',
          description: 'First Sentence Badge'
        },
        category: 'storytelling',
        isCompleted: false,
        requirements: [
          {
            type: 'sentence_count',
            target: 1,
            current: 0
          }
        ]
      },
      {
        id: 'prolific_writer',
        name: 'Prolific Writer',
        description: 'Contribute 100 sentences across all stories',
        progress: 0,
        maxProgress: 100,
        reward: {
          type: 'badge',
          value: 'prolific_writer_badge',
          description: 'Prolific Writer Badge'
        },
        category: 'storytelling',
        isCompleted: false,
        requirements: [
          {
            type: 'sentence_count',
            target: 100,
            current: 0
          }
        ]
      },
      {
        id: 'story_starter',
        name: 'Story Starter',
        description: 'Start 5 new collaborative stories',
        progress: 0,
        maxProgress: 5,
        reward: {
          type: 'badge',
          value: 'story_starter_badge',
          description: 'Story Starter Badge'
        },
        category: 'storytelling',
        isCompleted: false,
        requirements: [
          {
            type: 'story_completion',
            target: 5,
            current: 0
          }
        ]
      },
      {
        id: 'story_finisher',
        name: 'Story Finisher',
        description: 'Help complete 10 collaborative stories',
        progress: 0,
        maxProgress: 10,
        reward: {
          type: 'badge',
          value: 'story_finisher_badge',
          description: 'Story Finisher Badge'
        },
        category: 'storytelling',
        isCompleted: false,
        requirements: [
          {
            type: 'story_completion',
            target: 10,
            current: 0
          }
        ]
      },
      // Community achievements
      {
        id: 'helpful_voter',
        name: 'Helpful Voter',
        description: 'Cast 50 quality votes on community sentences',
        progress: 0,
        maxProgress: 50,
        reward: {
          type: 'reputation',
          value: 100,
          description: '100 Reputation Points'
        },
        category: 'community',
        isCompleted: false,
        requirements: [
          {
            type: 'vote_score',
            target: 50,
            current: 0
          }
        ]
      },
      {
        id: 'community_champion',
        name: 'Community Champion',
        description: 'Maintain a 30-day activity streak',
        progress: 0,
        maxProgress: 30,
        reward: {
          type: 'badge',
          value: 'community_champion_badge',
          description: 'Community Champion Badge'
        },
        category: 'community',
        isCompleted: false,
        requirements: [
          {
            type: 'consecutive_days',
            target: 30,
            current: 0
          }
        ]
      },
      // Quality achievements
      {
        id: 'quality_contributor',
        name: 'Quality Contributor',
        description: 'Achieve an average vote score of 8.0 or higher',
        progress: 0,
        maxProgress: 1,
        reward: {
          type: 'badge',
          value: 'quality_contributor_badge',
          description: 'Quality Contributor Badge'
        },
        category: 'quality',
        isCompleted: false,
        requirements: [
          {
            type: 'vote_score',
            target: 8,
            current: 0
          }
        ]
      },
      {
        id: 'master_storyteller',
        name: 'Master Storyteller',
        description: 'Reach 1000 reputation points through quality contributions',
        progress: 0,
        maxProgress: 1000,
        reward: {
          type: 'badge',
          value: 'master_storyteller_badge',
          description: 'Master Storyteller Badge'
        },
        category: 'quality',
        isCompleted: false,
        requirements: [
          {
            type: 'community_engagement',
            target: 1000,
            current: 0
          }
        ]
      }
    ];
  }

  /**
   * Track achievement progress for a user
   */
  async trackAchievementProgress(userId: string, subredditName: string): Promise<void> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return;

      // Get all achievements for this subreddit
      const achievementsKey = `subreddit:${subredditName}:achievements`;
      const achievementsData = await this.context.redis.get(achievementsKey);
      const achievementIds = achievementsData ? JSON.parse(achievementsData) : [];

      for (const achievementId of achievementIds) {
        const achievementData = await this.context.redis.get(`achievement:${achievementId}`);
        if (!achievementData) continue;

        const achievement: Achievement = JSON.parse(achievementData);

        // Skip if already completed
        if (achievement.isCompleted) continue;

        // Update achievement progress based on user statistics
        const updatedAchievement = updateAchievementProgress(achievement, profile.statistics);

        // Check if achievement was just completed
        if (updatedAchievement.isCompleted && !achievement.isCompleted) {
          await this.completeAchievement(userId, subredditName, updatedAchievement);
        }

        // Update user's achievement in profile
        const userAchievementIndex = profile.achievements.findIndex(a => a.id === achievementId);
        if (userAchievementIndex >= 0) {
          profile.achievements[userAchievementIndex] = updatedAchievement;
        } else {
          profile.achievements.push(updatedAchievement);
        }
      }

      // Save updated profile
      const profileKey = `user:${userId}:profile:${subredditName}`;
      await this.context.redis.set(profileKey, JSON.stringify(profile));

    } catch (error) {
      console.error('Failed to track achievement progress:', error);
    }
  }

  /**
   * Complete an achievement and award rewards
   */
  private async completeAchievement(userId: string, subredditName: string, achievement: Achievement): Promise<void> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return;

      // Award the achievement reward
      switch (achievement.reward.type) {
        case 'badge':
          const badge = await this.createAchievementBadge(achievement);
          await this.awardBadge({
            userId,
            badgeId: badge.id,
            subredditName,
            reason: `Completed achievement: ${achievement.name}`
          }, badge);
          break;

        case 'reputation':
          await this.updateReputation({
            userId,
            subredditName,
            change: Number(achievement.reward.value),
            reason: `Achievement completed: ${achievement.name}`,
            sourceId: achievement.id
          });
          break;

        case 'title':
          // Award special title (could be implemented as a special badge)
          const titleBadge: Badge = {
            id: `title_${achievement.id}`,
            name: String(achievement.reward.value),
            description: achievement.reward.description,
            iconUrl: '🏅',
            rarity: 'epic',
            earnedAt: Date.now(),
            category: 'special'
          };
          await this.awardBadge({
            userId,
            badgeId: titleBadge.id,
            subredditName,
            reason: `Earned title: ${achievement.name}`
          }, titleBadge);
          break;

        case 'feature_unlock':
          // Feature unlocks could be tracked separately
          await this.unlockFeature(userId, subredditName, String(achievement.reward.value));
          break;
      }

      console.log(`User ${profile.username} completed achievement: ${achievement.name}`);

    } catch (error) {
      console.error('Failed to complete achievement:', error);
    }
  }

  /**
   * Create a badge for an achievement
   */
  private async createAchievementBadge(achievement: Achievement): Promise<Badge> {
    const rarityMap: Record<string, Badge['rarity']> = {
      'storytelling': 'common',
      'community': 'rare',
      'quality': 'epic',
      'special': 'legendary'
    };

    const iconMap: Record<string, string> = {
      'storytelling': '✍️',
      'community': '🤝',
      'quality': '⭐',
      'special': '👑'
    };

    return {
      id: String(achievement.reward.value),
      name: achievement.name,
      description: achievement.description,
      iconUrl: iconMap[achievement.category] || '🏆',
      rarity: rarityMap[achievement.category] || 'common',
      earnedAt: Date.now(),
      category: achievement.category as Badge['category']
    };
  }

  /**
   * Unlock a feature for a user
   */
  private async unlockFeature(userId: string, subredditName: string, feature: string): Promise<void> {
    try {
      const featureKey = `user:${userId}:features:${subredditName}`;
      const existingFeatures = await this.context.redis.get(featureKey);
      const featuresList = existingFeatures ? JSON.parse(existingFeatures) : [];
      if (!featuresList.includes(feature)) {
        featuresList.push(feature);
        await this.context.redis.set(featureKey, JSON.stringify(featuresList));
      }

      console.log(`Unlocked feature "${feature}" for user ${userId} in ${subredditName}`);
    } catch (error) {
      console.error('Failed to unlock feature:', error);
    }
  }

  /**
   * Get user's unlocked features
   */
  async getUserFeatures(userId: string, subredditName: string): Promise<string[]> {
    try {
      const featureKey = `user:${userId}:features:${subredditName}`;
      const featuresData = await this.context.redis.get(featureKey);
      return featuresData ? JSON.parse(featuresData) : [];
    } catch (error) {
      console.error('Failed to get user features:', error);
      return [];
    }
  }

  /**
   * Create custom achievement for a subreddit
   */
  async createCustomAchievement(subredditName: string, achievement: Omit<Achievement, 'id' | 'isCompleted' | 'completedAt'>): Promise<Achievement> {
    try {
      const achievementId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newAchievement: Achievement = {
        id: achievementId,
        ...achievement,
        isCompleted: false,
        progress: 0
      };

      // Store achievement definition
      await this.context.redis.set(`achievement:${achievementId}`, JSON.stringify(newAchievement));
      // Add to achievements list using key-value storage
      const achievementsKey = `subreddit:${subredditName}:achievements`;
      const existingAchievements = await this.context.redis.get(achievementsKey);
      const achievementsList = existingAchievements ? JSON.parse(existingAchievements) : [];
      if (!achievementsList.includes(achievementId)) {
        achievementsList.push(achievementId);
        await this.context.redis.set(achievementsKey, JSON.stringify(achievementsList));
      }

      console.log(`Created custom achievement "${newAchievement.name}" for ${subredditName}`);

      return newAchievement;

    } catch (error) {
      console.error('Failed to create custom achievement:', error);
      throw new Error('Failed to create custom achievement');
    }
  }

  /**
   * Get all achievements for a subreddit
   */
  async getSubredditAchievements(subredditName: string): Promise<Achievement[]> {
    try {
      const achievementsKey = `subreddit:${subredditName}:achievements`;
      const achievementsData = await this.context.redis.get(achievementsKey);
      const achievementIds = achievementsData ? JSON.parse(achievementsData) : [];
      const achievements: Achievement[] = [];

      for (const achievementId of achievementIds) {
        const achievementData = await this.context.redis.get(`achievement:${achievementId}`);
        if (achievementData) {
          achievements.push(JSON.parse(achievementData));
        }
      }

      return achievements;

    } catch (error) {
      console.error('Failed to get subreddit achievements:', error);
      return [];
    }
  }

  /**
   * Get user's completed achievements
   */
  async getUserCompletedAchievements(userId: string, subredditName: string): Promise<Achievement[]> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return [];

      return profile.achievements.filter(achievement => achievement.isCompleted);

    } catch (error) {
      console.error('Failed to get user completed achievements:', error);
      return [];
    }
  }

  /**
   * Get user's progress on all achievements
   */
  async getUserAchievementProgress(userId: string, subredditName: string): Promise<Achievement[]> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return [];

      // Update progress before returning
      await this.trackAchievementProgress(userId, subredditName);

      // Get updated profile
      const updatedProfile = await this.getUserProfile(userId, subredditName);
      return updatedProfile?.achievements || [];

    } catch (error) {
      console.error('Failed to get user achievement progress:', error);
      return [];
    }
  }

  /**
   * Award badge with automatic rarity and category detection
   */
  async awardAutomaticBadge(userId: string, subredditName: string, badgeType: string, value: number): Promise<void> {
    try {
      const badgeDefinitions = this.getAutomaticBadgeDefinitions();
      const badgeConfig = badgeDefinitions[badgeType];

      if (!badgeConfig) {
        console.warn(`Unknown automatic badge type: ${badgeType}`);
        return;
      }

      // Find the appropriate tier for the value
      const tier = badgeConfig.tiers.find(t => value >= t.threshold);
      if (!tier) return;

      const badge: Badge = {
        id: `${badgeType}_${tier.threshold}`,
        name: tier.name,
        description: tier.description.replace('{value}', value.toString()),
        iconUrl: tier.icon,
        rarity: tier.rarity,
        earnedAt: Date.now(),
        category: badgeConfig.category
      };

      await this.awardBadge({
        userId,
        badgeId: badge.id,
        subredditName,
        reason: `Reached ${value} ${badgeType}`
      }, badge);

    } catch (error) {
      console.error('Failed to award automatic badge:', error);
    }
  }

  /**
   * Get automatic badge definitions with tiers
   */
  private getAutomaticBadgeDefinitions(): Record<string, {
    category: Badge['category'];
    tiers: Array<{
      threshold: number;
      name: string;
      description: string;
      icon: string;
      rarity: Badge['rarity'];
    }>;
  }> {
    return {
      sentences: {
        category: 'storytelling',
        tiers: [
          { threshold: 1000, name: 'Master Storyteller', description: 'Contributed {value} sentences', icon: '👑', rarity: 'legendary' },
          { threshold: 500, name: 'Expert Writer', description: 'Contributed {value} sentences', icon: '🏆', rarity: 'epic' },
          { threshold: 100, name: 'Prolific Writer', description: 'Contributed {value} sentences', icon: '📝', rarity: 'rare' },
          { threshold: 50, name: 'Active Writer', description: 'Contributed {value} sentences', icon: '✍️', rarity: 'common' },
          { threshold: 10, name: 'Budding Writer', description: 'Contributed {value} sentences', icon: '📖', rarity: 'common' }
        ]
      },
      votes: {
        category: 'community',
        tiers: [
          { threshold: 1000, name: 'Vote Master', description: 'Cast {value} votes', icon: '🗳️', rarity: 'legendary' },
          { threshold: 500, name: 'Active Voter', description: 'Cast {value} votes', icon: '👍', rarity: 'epic' },
          { threshold: 100, name: 'Community Supporter', description: 'Cast {value} votes', icon: '🤝', rarity: 'rare' },
          { threshold: 50, name: 'Helpful Member', description: 'Cast {value} votes', icon: '👋', rarity: 'common' }
        ]
      },
      reputation: {
        category: 'quality',
        tiers: [
          { threshold: 5000, name: 'Legendary Contributor', description: 'Earned {value} reputation', icon: '🌟', rarity: 'legendary' },
          { threshold: 2000, name: 'Master Contributor', description: 'Earned {value} reputation', icon: '⭐', rarity: 'epic' },
          { threshold: 1000, name: 'Expert Contributor', description: 'Earned {value} reputation', icon: '🏅', rarity: 'rare' },
          { threshold: 500, name: 'Quality Contributor', description: 'Earned {value} reputation', icon: '✨', rarity: 'common' }
        ]
      },
      streak: {
        category: 'participation',
        tiers: [
          { threshold: 365, name: 'Year-Long Dedication', description: '{value} day streak', icon: '🔥', rarity: 'legendary' },
          { threshold: 100, name: 'Consistent Contributor', description: '{value} day streak', icon: '⚡', rarity: 'epic' },
          { threshold: 30, name: 'Monthly Regular', description: '{value} day streak', icon: '📅', rarity: 'rare' },
          { threshold: 7, name: 'Weekly Visitor', description: '{value} day streak', icon: '📆', rarity: 'common' }
        ]
      }
    };
  }

  /**
   * Check and award automatic badges based on user statistics
   */
  async checkAutomaticBadges(userId: string, subredditName: string): Promise<void> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return;

      const stats = profile.statistics;

      // Check sentence badges
      await this.awardAutomaticBadge(userId, subredditName, 'sentences', stats.totalSentences);

      // Check vote badges
      await this.awardAutomaticBadge(userId, subredditName, 'votes', stats.totalVotes);

      // Check reputation badges
      await this.awardAutomaticBadge(userId, subredditName, 'reputation', stats.totalReputation);

      // Check streak badges
      await this.awardAutomaticBadge(userId, subredditName, 'streak', stats.longestStreak);

    } catch (error) {
      console.error('Failed to check automatic badges:', error);
    }
  }

  /**
   * Get badge categories with counts
   */
  async getBadgeCategories(userId: string, subredditName: string): Promise<Record<Badge['category'], number>> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return {} as Record<Badge['category'], number>;

      const categories: Record<Badge['category'], number> = {
        storytelling: 0,
        community: 0,
        quality: 0,
        participation: 0,
        special: 0
      };

      for (const badge of profile.badges) {
        categories[badge.category] = (categories[badge.category] || 0) + 1;
      }

      return categories;

    } catch (error) {
      console.error('Failed to get badge categories:', error);
      return {} as Record<Badge['category'], number>;
    }
  }

  /**
   * Get badges by rarity for a user
   */
  async getBadgesByRarity(userId: string, subredditName: string): Promise<Record<Badge['rarity'], Badge[]>> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return {} as Record<Badge['rarity'], Badge[]>;

      const rarities: Record<Badge['rarity'], Badge[]> = {
        common: [],
        rare: [],
        epic: [],
        legendary: []
      };

      for (const badge of profile.badges) {
        rarities[badge.rarity].push(badge);
      }

      return rarities;

    } catch (error) {
      console.error('Failed to get badges by rarity:', error);
      return {} as Record<Badge['rarity'], Badge[]>;
    }
  }  /*
*
   * Community Leaderboards Implementation
   * Requirements: 4.5
   */

  /**
   * Generate monthly leaderboard with top contributor rankings
   */
  async generateMonthlyLeaderboard(options: LeaderboardOptions): Promise<LeaderboardEntry[]> {
    try {
      const { subredditName, category = 'overall', period = 'monthly', limit = 50, offset = 0 } = options;

      // Get time range for the period
      const timeRange = this.getTimeRangeForPeriod(period);

      // Get all users in the subreddit
      const usersKey = `subreddit:${subredditName}:users`;
      const usersData = await this.context.redis.get(usersKey);
      const userIds = usersData ? JSON.parse(usersData) : [];
      const leaderboardEntries: Array<{
        userId: string;
        username: string;
        score: number;
        profile: UserProfile;
      }> = [];

      for (const userId of userIds) {
        const profile = await this.getUserProfile(userId, subredditName);
        if (!profile) continue;

        // Calculate score based on category and period
        const score = await this.calculateLeaderboardScore(userId, subredditName, category, timeRange);

        if (score > 0) {
          leaderboardEntries.push({
            userId,
            username: profile.username,
            score,
            profile
          });
        }
      }

      // Sort by score (highest first)
      leaderboardEntries.sort((a, b) => b.score - a.score);

      // Convert to LeaderboardEntry format with rankings
      const leaderboard: LeaderboardEntry[] = leaderboardEntries
        .slice(offset, offset + limit)
        .map((entry, index) => ({
          userId: entry.userId,
          username: entry.username,
          reputation: entry.profile.reputation,
          level: entry.profile.level,
          badges: entry.profile.badges,
          rank: offset + index + 1
        }));

      // Store leaderboard for caching
      const leaderboardKey = `leaderboard:${subredditName}:${category}:${period}`;
      await this.context.redis.set(leaderboardKey, JSON.stringify(leaderboard));
      await this.context.redis.expire(leaderboardKey, 60 * 60); // Cache for 1 hour

      return leaderboard;

    } catch (error) {
      console.error('Failed to generate monthly leaderboard:', error);
      return [];
    }
  }

  /**
   * Get time range for leaderboard period
   */
  private getTimeRangeForPeriod(period: 'daily' | 'weekly' | 'monthly' | 'all-time'): { start: number; end: number } {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    switch (period) {
      case 'daily':
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        return { start: startOfDay.getTime(), end: now };

      case 'weekly':
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return { start: startOfWeek.getTime(), end: now };

      case 'monthly':
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        return { start: startOfMonth.getTime(), end: now };

      case 'all-time':
      default:
        return { start: 0, end: now };
    }
  }

  /**
   * Calculate leaderboard score based on category and time period
   */
  private async calculateLeaderboardScore(
    userId: string,
    subredditName: string,
    category: string,
    timeRange: { start: number; end: number }
  ): Promise<number> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) return 0;

      let score = 0;

      switch (category) {
        case 'overall':
          // Overall score combines multiple factors
          score += profile.reputation * 0.4;
          score += profile.statistics.totalSentences * 2;
          score += profile.statistics.totalVotes * 0.5;
          score += profile.badges.length * 10;
          score += profile.statistics.storiesCompleted * 20;
          break;

        case 'storytelling':
          // Focus on storytelling contributions
          score += profile.statistics.totalSentences * 5;
          score += profile.statistics.storiesStarted * 15;
          score += profile.statistics.storiesCompleted * 25;
          score += profile.statistics.branchesCreated * 10;

          // Bonus for storytelling badges
          const storytellingBadges = profile.badges.filter(b => b.category === 'storytelling');
          score += storytellingBadges.length * 20;
          break;

        case 'community':
          // Focus on community engagement
          score += profile.statistics.totalVotes * 2;
          score += profile.statistics.currentStreak * 5;
          score += profile.statistics.daysActive * 3;

          // Bonus for community badges
          const communityBadges = profile.badges.filter(b => b.category === 'community');
          score += communityBadges.length * 15;
          break;

        case 'quality':
          // Focus on quality contributions
          score += profile.reputation * 0.8;
          score += profile.statistics.averageVoteScore * 50;

          // Bonus for quality badges
          const qualityBadges = profile.badges.filter(b => b.category === 'quality');
          score += qualityBadges.length * 30;

          // Penalty for low average scores
          if (profile.statistics.averageVoteScore < 0) {
            score *= 0.5;
          }
          break;

        default:
          score = profile.reputation;
      }

      // Apply time-based filtering for non-all-time periods
      if (timeRange.start > 0) {
        score = await this.applyTimeBasedScoring(userId, subredditName, score, timeRange);
      }

      return Math.round(score);

    } catch (error) {
      console.error('Failed to calculate leaderboard score:', error);
      return 0;
    }
  }

  /**
   * Apply time-based scoring for period leaderboards
   */
  private async applyTimeBasedScoring(
    userId: string,
    subredditName: string,
    baseScore: number,
    timeRange: { start: number; end: number }
  ): Promise<number> {
    try {
      // Get activity within the time range
      let periodScore = 0;

      // Check daily activity within the period
      const daysInPeriod = Math.ceil((timeRange.end - timeRange.start) / (24 * 60 * 60 * 1000));
      let activeDaysInPeriod = 0;

      for (let i = 0; i < daysInPeriod; i++) {
        const checkDate = new Date(timeRange.start + (i * 24 * 60 * 60 * 1000));
        const activityKey = `user:${userId}:activity:${subredditName}:${checkDate.toDateString()}`;
        const wasActive = await this.context.redis.get(activityKey);

        if (wasActive) {
          activeDaysInPeriod++;
        }
      }

      // Calculate period-specific score
      const activityRatio = activeDaysInPeriod / daysInPeriod;
      periodScore = baseScore * activityRatio;

      // Bonus for consistent activity
      if (activityRatio > 0.8) {
        periodScore *= 1.2; // 20% bonus for high activity
      } else if (activityRatio > 0.5) {
        periodScore *= 1.1; // 10% bonus for moderate activity
      }

      return periodScore;

    } catch (error) {
      console.error('Failed to apply time-based scoring:', error);
      return baseScore * 0.5; // Default to half score on error
    }
  }

  /**
   * Get cached leaderboard or generate new one
   */
  async getLeaderboard(options: LeaderboardOptions): Promise<LeaderboardEntry[]> {
    try {
      const { subredditName, category = 'overall', period = 'monthly' } = options;
      const leaderboardKey = `leaderboard:${subredditName}:${category}:${period}`;

      // Try to get cached leaderboard
      const cachedLeaderboard = await this.context.redis.get(leaderboardKey);
      if (cachedLeaderboard) {
        return JSON.parse(cachedLeaderboard);
      }

      // Generate new leaderboard if not cached
      return await this.generateMonthlyLeaderboard(options);

    } catch (error) {
      console.error('Failed to get leaderboard:', error);
      return [];
    }
  }

  /**
   * Get user's position in leaderboard
   */
  async getUserLeaderboardPosition(userId: string, options: LeaderboardOptions): Promise<{
    rank: number;
    score: number;
    totalUsers: number;
  } | null> {
    try {
      const { subredditName, category = 'overall', period = 'monthly' } = options;

      // Get full leaderboard (without limit)
      const fullLeaderboard = await this.generateMonthlyLeaderboard({
        ...options,
        limit: 10000, // Large limit to get all users
        offset: 0
      });

      const userEntry = fullLeaderboard.find(entry => entry.userId === userId);

      if (!userEntry) {
        return null;
      }

      const timeRange = this.getTimeRangeForPeriod(period);
      const score = await this.calculateLeaderboardScore(userId, subredditName, category, timeRange);

      return {
        rank: userEntry.rank,
        score,
        totalUsers: fullLeaderboard.length
      };

    } catch (error) {
      console.error('Failed to get user leaderboard position:', error);
      return null;
    }
  }

  /**
   * Create category-specific leaderboards
   */
  async getCategoryLeaderboards(subredditName: string, period: 'daily' | 'weekly' | 'monthly' | 'all-time' = 'monthly'): Promise<Record<string, LeaderboardEntry[]>> {
    try {
      const categories: Array<'overall' | 'storytelling' | 'community' | 'quality'> = ['overall', 'storytelling', 'community', 'quality'];
      const leaderboards: Record<string, LeaderboardEntry[]> = {};

      for (const category of categories) {
        leaderboards[category] = await this.getLeaderboard({
          subredditName,
          category,
          period,
          limit: 10 // Top 10 for each category
        });
      }

      return leaderboards;

    } catch (error) {
      console.error('Failed to get category leaderboards:', error);
      return {};
    }
  }

  /**
   * Get leaderboard with position changes from previous period
   */
  async getLeaderboardWithChanges(options: LeaderboardOptions): Promise<LeaderboardEntry[]> {
    try {
      const currentLeaderboard = await this.getLeaderboard(options);

      // Get previous period leaderboard for comparison
      const previousPeriod = this.getPreviousPeriod(options.period || 'monthly');
      const previousOptions = { ...options, period: previousPeriod };
      const previousLeaderboard = await this.getLeaderboard(previousOptions);

      // Calculate position changes
      const leaderboardWithChanges = currentLeaderboard.map(entry => {
        const previousEntry = previousLeaderboard.find(prev => prev.userId === entry.userId);
        const change = previousEntry ? previousEntry.rank - entry.rank : 0;

        return {
          ...entry,
          change
        };
      });

      return leaderboardWithChanges;

    } catch (error) {
      console.error('Failed to get leaderboard with changes:', error);
      return await this.getLeaderboard(options);
    }
  }

  /**
   * Get previous period for comparison
   */
  private getPreviousPeriod(period: 'daily' | 'weekly' | 'monthly' | 'all-time'): 'daily' | 'weekly' | 'monthly' | 'all-time' {
    // For simplicity, return the same period
    // In a real implementation, this would calculate the actual previous period
    return period;
  }

  /**
   * Get top contributors for a specific time period
   */
  async getTopContributors(subredditName: string, period: 'daily' | 'weekly' | 'monthly' = 'monthly', limit: number = 10): Promise<LeaderboardEntry[]> {
    try {
      return await this.getLeaderboard({
        subredditName,
        category: 'overall',
        period,
        limit
      });

    } catch (error) {
      console.error('Failed to get top contributors:', error);
      return [];
    }
  }

  /**
   * Get rising stars (users with biggest improvements)
   */
  async getRisingStars(subredditName: string, limit: number = 10): Promise<LeaderboardEntry[]> {
    try {
      const leaderboardWithChanges = await this.getLeaderboardWithChanges({
        subredditName,
        category: 'overall',
        period: 'monthly',
        limit: 100 // Get more entries to find rising stars
      });

      // Filter and sort by positive changes
      const risingStars = leaderboardWithChanges
        .filter(entry => (entry.change || 0) > 0)
        .sort((a, b) => (b.change || 0) - (a.change || 0))
        .slice(0, limit);

      return risingStars;

    } catch (error) {
      console.error('Failed to get rising stars:', error);
      return [];
    }
  }

  /**
   * Get leaderboard statistics
   */
  async getLeaderboardStats(subredditName: string): Promise<{
    totalUsers: number;
    activeUsers: number;
    averageReputation: number;
  }> {
    try {
      const usersKey = `subreddit:${subredditName}:users`;
      const usersData = await this.context.redis.get(usersKey);
      const userIds = usersData ? JSON.parse(usersData) : [];
      const totalUsers = userIds.length;

      if (totalUsers === 0) {
        return {
          totalUsers: 0,
          activeUsers: 0,
          averageReputation: 0
        };
      }

      let activeUsers = 0;
      let totalReputation = 0;
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

      for (const userId of userIds) {
        const profile = await this.getUserProfile(userId, subredditName);
        if (profile) {
          totalReputation += profile.reputation;
          if (profile.lastActive > oneWeekAgo) {
            activeUsers++;
          }
        }
      }

      return {
        totalUsers,
        activeUsers,
        averageReputation: Math.round(totalReputation / totalUsers)
      };

    } catch (error) {
      console.error('Failed to get leaderboard stats:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        averageReputation: 0
      };
    }
  }

  /**
   * Get comprehensive leaderboard statistics
   */
  async getComprehensiveLeaderboardStats(subredditName: string): Promise<{
    totalUsers: number;
    activeUsers: number;
    averageReputation: number;
    topReputation: number;
    totalBadges: number;
    totalAchievements: number;
  }> {
    try {
      const usersKey = `subreddit:${subredditName}:users`;
      const usersData = await this.context.redis.get(usersKey);
      const userIds = usersData ? JSON.parse(usersData) : [];

      let totalReputation = 0;
      let topReputation = 0;
      let activeUsers = 0;
      let totalBadges = 0;
      let totalAchievements = 0;

      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      for (const userId of userIds) {
        const profile = await this.getUserProfile(userId, subredditName);
        if (!profile) continue;

        totalReputation += profile.reputation;
        topReputation = Math.max(topReputation, profile.reputation);
        totalBadges += profile.badges.length;
        totalAchievements += profile.achievements.filter(a => a.isCompleted).length;

        if (profile.lastActive > thirtyDaysAgo) {
          activeUsers++;
        }
      }

      return {
        totalUsers: userIds.length,
        activeUsers,
        averageReputation: userIds.length > 0 ? Math.round(totalReputation / userIds.length) : 0,
        topReputation,
        totalBadges,
        totalAchievements
      };

    } catch (error) {
      console.error('Failed to get leaderboard stats:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        averageReputation: 0,
        topReputation: 0,
        totalBadges: 0,
        totalAchievements: 0
      };
    }
  }

  /**
   * Create leaderboard display components data
   */
  async getLeaderboardDisplayData(subredditName: string): Promise<{
    overall: LeaderboardEntry[];
    storytelling: LeaderboardEntry[];
    community: LeaderboardEntry[];
    quality: LeaderboardEntry[];
    risingStars: LeaderboardEntry[];
    stats: any;
  }> {
    try {
      const [overall, storytelling, community, quality, risingStars, stats] = await Promise.all([
        this.getLeaderboard({ subredditName, category: 'overall' as const, limit: 10 }),
        this.getLeaderboard({ subredditName, category: 'storytelling' as const, limit: 10 }),
        this.getLeaderboard({ subredditName, category: 'community' as const, limit: 10 }),
        this.getLeaderboard({ subredditName, category: 'quality' as const, limit: 10 }),
        this.getRisingStars(subredditName, 5),
        this.getLeaderboardStats(subredditName)
      ]);

      return {
        overall,
        storytelling,
        community,
        quality,
        risingStars,
        stats
      };

    } catch (error) {
      console.error('Failed to get leaderboard display data:', error);
      return {
        overall: [],
        storytelling: [],
        community: [],
        quality: [],
        risingStars: [],
        stats: {}
      };
    }
  }

  /**
   * Schedule leaderboard updates (to be called periodically)
   */
  async scheduleLeaderboardUpdates(subredditName: string): Promise<void> {
    try {
      const categories = ['overall', 'storytelling', 'community', 'quality'];
      const periods = ['daily', 'weekly', 'monthly'];

      for (const category of categories) {
        for (const period of periods) {
          // Clear cached leaderboard to force regeneration
          const leaderboardKey = `leaderboard:${subredditName}:${category}:${period}`;
          await this.context.redis.del(leaderboardKey);

          // Generate fresh leaderboard
          await this.generateMonthlyLeaderboard({
            subredditName,
            category: category as 'overall' | 'storytelling' | 'community' | 'quality',
            period: period as any,
            limit: 100
          });
        }
      }

      console.log(`Updated leaderboards for ${subredditName}`);

    } catch (error) {
      console.error('Failed to schedule leaderboard updates:', error);
    }
  }

  /**
   * Get user recognition features for community engagement
   */
  async getUserRecognition(userId: string, subredditName: string): Promise<{
    currentRank: number | null;
    badges: Badge[];
    recentAchievements: Achievement[];
    streakInfo: {
      current: number;
      longest: number;
      daysActive: number;
    };
    contributionSummary: {
      totalSentences: number;
      storiesCompleted: number;
      averageVoteScore: number;
      reputation: number;
    };
  }> {
    try {
      const profile = await this.getUserProfile(userId, subredditName);
      if (!profile) {
        return {
          currentRank: null,
          badges: [],
          recentAchievements: [],
          streakInfo: { current: 0, longest: 0, daysActive: 0 },
          contributionSummary: { totalSentences: 0, storiesCompleted: 0, averageVoteScore: 0, reputation: 0 }
        };
      }

      // Get current leaderboard position
      const position = await this.getUserLeaderboardPosition(userId, {
        subredditName,
        category: 'overall',
        period: 'monthly'
      });

      // Get recent achievements (completed in last 30 days)
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const recentAchievements = profile.achievements.filter(
        a => a.isCompleted && a.completedAt && a.completedAt > thirtyDaysAgo
      );

      return {
        currentRank: position?.rank || null,
        badges: profile.badges.slice(-5), // Last 5 badges earned
        recentAchievements,
        streakInfo: {
          current: profile.statistics.currentStreak,
          longest: profile.statistics.longestStreak,
          daysActive: profile.statistics.daysActive
        },
        contributionSummary: {
          totalSentences: profile.statistics.totalSentences,
          storiesCompleted: profile.statistics.storiesCompleted,
          averageVoteScore: profile.statistics.averageVoteScore,
          reputation: profile.reputation
        }
      };

    } catch (error) {
      console.error('Failed to get user recognition:', error);
      return {
        currentRank: null,
        badges: [],
        recentAchievements: [],
        streakInfo: { current: 0, longest: 0, daysActive: 0 },
        contributionSummary: { totalSentences: 0, storiesCompleted: 0, averageVoteScore: 0, reputation: 0 }
      };
    }
  }
}