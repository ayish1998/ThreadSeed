import { describe, it, expect } from 'vitest';
import { 
  validateSentence, 
  validateStoryTitle,
  validateWeightedVote,
  calculateWeightedScore,
  calculateControversyScore,
  validateBranchingRule,
  validateBranchHierarchy,
  buildBranchTree,
  validateUserProfile,
  validateBadge,
  calculateUserLevel,
  calculateReputationForLevel,
  updateAchievementProgress,
  type WeightedVote,
  type BranchingRule,
  type StoryBranch,
  type UserProfile,
  type Badge,
  type Achievement,
  type UserStatistics
} from './story.js';

describe('Story Validation', () => {
  describe('validateSentence', () => {
    it('should accept valid sentences', () => {
      expect(validateSentence('This is a valid sentence.')).toBe(true);
      expect(validateSentence('Short.')).toBe(true);
    });

    it('should reject empty or whitespace-only sentences', () => {
      expect(validateSentence('')).toBe(false);
      expect(validateSentence('   ')).toBe(false);
      expect(validateSentence('\n\t')).toBe(false);
    });

    it('should reject sentences that are too long', () => {
      const longSentence = 'a'.repeat(281);
      expect(validateSentence(longSentence)).toBe(false);
    });

    it('should accept sentences at the character limit', () => {
      const maxLengthSentence = 'a'.repeat(280);
      expect(validateSentence(maxLengthSentence)).toBe(true);
    });
  });

  describe('validateStoryTitle', () => {
    it('should accept valid titles', () => {
      expect(validateStoryTitle('My Great Story')).toBe(true);
      expect(validateStoryTitle('A')).toBe(true);
    });

    it('should reject empty or whitespace-only titles', () => {
      expect(validateStoryTitle('')).toBe(false);
      expect(validateStoryTitle('   ')).toBe(false);
    });

    it('should reject titles that are too long', () => {
      const longTitle = 'a'.repeat(101);
      expect(validateStoryTitle(longTitle)).toBe(false);
    });

    it('should accept titles at the character limit', () => {
      const maxLengthTitle = 'a'.repeat(100);
      expect(validateStoryTitle(maxLengthTitle)).toBe(true);
    });
  });
});

describe('Enhanced Data Model Validation', () => {
  describe('WeightedVote Validation', () => {
    it('should accept valid weighted votes', () => {
      const validVote: Partial<WeightedVote> = {
        userId: 'user123',
        sentenceId: 'sentence456',
        subredditName: 'testsubreddit',
        weight: 1.5,
        voteType: 'upvote'
      };
      expect(validateWeightedVote(validVote)).toBe(true);
    });

    it('should reject votes with missing required fields', () => {
      expect(validateWeightedVote({})).toBe(false);
      expect(validateWeightedVote({ userId: 'user123' })).toBe(false);
      expect(validateWeightedVote({ userId: 'user123', sentenceId: 'sentence456' })).toBe(false);
    });

    it('should reject votes with invalid weight', () => {
      const invalidVote: Partial<WeightedVote> = {
        userId: 'user123',
        sentenceId: 'sentence456',
        subredditName: 'testsubreddit',
        weight: 0.05, // Too low
        voteType: 'upvote'
      };
      expect(validateWeightedVote(invalidVote)).toBe(false);

      invalidVote.weight = 15; // Too high
      expect(validateWeightedVote(invalidVote)).toBe(false);
    });

    it('should reject votes with invalid vote type', () => {
      const invalidVote: Partial<WeightedVote> = {
        userId: 'user123',
        sentenceId: 'sentence456',
        subredditName: 'testsubreddit',
        weight: 1.0,
        voteType: 'invalid' as any
      };
      expect(validateWeightedVote(invalidVote)).toBe(false);
    });
  });

  describe('Weighted Score Calculation', () => {
    it('should calculate weighted scores correctly', () => {
      const votes: WeightedVote[] = [
        {
          id: '1',
          userId: 'user1',
          weight: 2.0,
          timestamp: Date.now(),
          voteType: 'upvote',
          sentenceId: 'sentence1',
          subredditName: 'test'
        },
        {
          id: '2',
          userId: 'user2',
          weight: 1.5,
          timestamp: Date.now(),
          voteType: 'quality',
          sentenceId: 'sentence1',
          subredditName: 'test'
        },
        {
          id: '3',
          userId: 'user3',
          weight: 1.0,
          timestamp: Date.now(),
          voteType: 'downvote',
          sentenceId: 'sentence1',
          subredditName: 'test'
        }
      ];

      const score = calculateWeightedScore(votes);
      expect(score).toBe(2.5); // (2.0 + 1.5) - 1.0
    });

    it('should return 0 for empty vote array', () => {
      expect(calculateWeightedScore([])).toBe(0);
    });
  });

  describe('Controversy Score Calculation', () => {
    it('should calculate controversy scores correctly', () => {
      const controversialVotes: WeightedVote[] = [
        {
          id: '1',
          userId: 'user1',
          weight: 2.0,
          timestamp: Date.now(),
          voteType: 'upvote',
          sentenceId: 'sentence1',
          subredditName: 'test'
        },
        {
          id: '2',
          userId: 'user2',
          weight: 2.0,
          timestamp: Date.now(),
          voteType: 'downvote',
          sentenceId: 'sentence1',
          subredditName: 'test'
        }
      ];

      const score = calculateControversyScore(controversialVotes);
      expect(score).toBe(1.0); // Perfect balance = max controversy
    });

    it('should return 0 for non-controversial content', () => {
      const nonControversialVotes: WeightedVote[] = [
        {
          id: '1',
          userId: 'user1',
          weight: 2.0,
          timestamp: Date.now(),
          voteType: 'upvote',
          sentenceId: 'sentence1',
          subredditName: 'test'
        }
      ];

      expect(calculateControversyScore(nonControversialVotes)).toBe(0);
      expect(calculateControversyScore([])).toBe(0);
    });
  });

  describe('Branching Rule Validation', () => {
    it('should accept valid branching rules', () => {
      const validRule: Partial<BranchingRule> = {
        storyId: 'story123',
        triggerCondition: 'vote_threshold_reached',
        maxBranches: 3,
        votingPeriod: 1440, // 24 hours
        mergeThreshold: 5
      };
      expect(validateBranchingRule(validRule)).toBe(true);
    });

    it('should reject rules with missing required fields', () => {
      expect(validateBranchingRule({})).toBe(false);
      expect(validateBranchingRule({ storyId: 'story123' })).toBe(false);
    });

    it('should reject rules with invalid numeric values', () => {
      const invalidRule: Partial<BranchingRule> = {
        storyId: 'story123',
        triggerCondition: 'test',
        maxBranches: 0, // Too low
        votingPeriod: 1440,
        mergeThreshold: 5
      };
      expect(validateBranchingRule(invalidRule)).toBe(false);

      invalidRule.maxBranches = 15; // Too high
      expect(validateBranchingRule(invalidRule)).toBe(false);

      invalidRule.maxBranches = 3;
      invalidRule.votingPeriod = 30; // Too short
      expect(validateBranchingRule(invalidRule)).toBe(false);
    });
  });

  describe('Branch Hierarchy Validation', () => {
    it('should accept valid branch hierarchies', () => {
      const validBranches: StoryBranch[] = [
        {
          id: 'branch1',
          name: 'Main',
          description: 'Main branch',
          startingSentenceId: 'sentence1',
          isActive: true,
          parentBranchId: undefined,
          childBranches: ['branch2'],
          popularity: 10,
          mergeCandidate: false,
          branchType: 'decision',
          createdAt: Date.now(),
          createdBy: 'user1'
        },
        {
          id: 'branch2',
          name: 'Alternative',
          description: 'Alternative path',
          startingSentenceId: 'sentence2',
          isActive: true,
          parentBranchId: 'branch1',
          childBranches: [],
          popularity: 5,
          mergeCandidate: false,
          branchType: 'alternative',
          createdAt: Date.now(),
          createdBy: 'user2'
        }
      ];

      expect(validateBranchHierarchy(validBranches)).toBe(true);
    });

    it('should reject hierarchies with orphaned branches', () => {
      const invalidBranches: StoryBranch[] = [
        {
          id: 'branch1',
          name: 'Main',
          description: 'Main branch',
          startingSentenceId: 'sentence1',
          isActive: true,
          parentBranchId: 'nonexistent', // Parent doesn't exist
          childBranches: [],
          popularity: 10,
          mergeCandidate: false,
          branchType: 'decision',
          createdAt: Date.now(),
          createdBy: 'user1'
        }
      ];

      expect(validateBranchHierarchy(invalidBranches)).toBe(false);
    });
  });

  describe('Branch Tree Building', () => {
    it('should build valid branch trees', () => {
      const branches: StoryBranch[] = [
        {
          id: 'root',
          name: 'Root',
          description: 'Root branch',
          startingSentenceId: 'sentence1',
          isActive: true,
          parentBranchId: undefined,
          childBranches: ['child1', 'child2'],
          popularity: 10,
          mergeCandidate: false,
          branchType: 'decision',
          createdAt: Date.now(),
          createdBy: 'user1'
        },
        {
          id: 'child1',
          name: 'Child 1',
          description: 'First child',
          startingSentenceId: 'sentence2',
          isActive: true,
          parentBranchId: 'root',
          childBranches: [],
          popularity: 5,
          mergeCandidate: false,
          branchType: 'alternative',
          createdAt: Date.now(),
          createdBy: 'user2'
        },
        {
          id: 'child2',
          name: 'Child 2',
          description: 'Second child',
          startingSentenceId: 'sentence3',
          isActive: false,
          parentBranchId: 'root',
          childBranches: [],
          popularity: 3,
          mergeCandidate: true,
          branchType: 'experimental',
          createdAt: Date.now(),
          createdBy: 'user3'
        }
      ];

      const tree = buildBranchTree(branches, 'root');
      expect(tree.rootBranchId).toBe('root');
      expect(tree.totalBranches).toBe(3);
      expect(tree.activeBranches).toBe(2);
      expect(tree.maxDepth).toBe(1);
    });

    it('should throw error for missing root branch', () => {
      const branches: StoryBranch[] = [];
      expect(() => buildBranchTree(branches, 'nonexistent')).toThrow();
    });
  });

  describe('User Profile Validation', () => {
    it('should accept valid user profiles', () => {
      const validProfile: Partial<UserProfile> = {
        userId: 'user123',
        username: 'testuser',
        reputation: 100,
        level: 5
      };
      expect(validateUserProfile(validProfile)).toBe(true);
    });

    it('should reject profiles with missing required fields', () => {
      expect(validateUserProfile({})).toBe(false);
      expect(validateUserProfile({ userId: 'user123' })).toBe(false);
    });

    it('should reject profiles with invalid values', () => {
      const invalidProfile: Partial<UserProfile> = {
        userId: 'user123',
        username: 'testuser',
        reputation: -10, // Negative reputation
        level: 5
      };
      expect(validateUserProfile(invalidProfile)).toBe(false);

      invalidProfile.reputation = 100;
      invalidProfile.level = 0; // Invalid level
      expect(validateUserProfile(invalidProfile)).toBe(false);

      invalidProfile.level = 101; // Too high level
      expect(validateUserProfile(invalidProfile)).toBe(false);
    });
  });

  describe('Badge Validation', () => {
    it('should accept valid badges', () => {
      const validBadge: Partial<Badge> = {
        id: 'badge123',
        name: 'First Story',
        description: 'Created your first story',
        rarity: 'common',
        category: 'storytelling'
      };
      expect(validateBadge(validBadge)).toBe(true);
    });

    it('should reject badges with missing required fields', () => {
      expect(validateBadge({})).toBe(false);
      expect(validateBadge({ id: 'badge123' })).toBe(false);
    });

    it('should reject badges with invalid rarity or category', () => {
      const invalidBadge: Partial<Badge> = {
        id: 'badge123',
        name: 'Test Badge',
        description: 'Test description',
        rarity: 'invalid' as any,
        category: 'storytelling'
      };
      expect(validateBadge(invalidBadge)).toBe(false);

      invalidBadge.rarity = 'common';
      invalidBadge.category = 'invalid' as any;
      expect(validateBadge(invalidBadge)).toBe(false);
    });
  });

  describe('Level Calculation', () => {
    it('should calculate user levels correctly', () => {
      expect(calculateUserLevel(0)).toBe(1);
      expect(calculateUserLevel(100)).toBe(2);
      expect(calculateUserLevel(400)).toBe(3);
      expect(calculateUserLevel(900)).toBe(4);
    });

    it('should calculate reputation for levels correctly', () => {
      expect(calculateReputationForLevel(1)).toBe(0);
      expect(calculateReputationForLevel(2)).toBe(100);
      expect(calculateReputationForLevel(3)).toBe(400);
      expect(calculateReputationForLevel(4)).toBe(900);
    });
  });

  describe('Achievement Progress Updates', () => {
    it('should update achievement progress correctly', () => {
      const achievement: Achievement = {
        id: 'ach1',
        name: 'Prolific Writer',
        description: 'Write 10 sentences',
        progress: 0,
        maxProgress: 10,
        reward: { type: 'badge', value: 'writer_badge', description: 'Writer badge' },
        category: 'writing',
        isCompleted: false,
        requirements: [
          { type: 'sentence_count', target: 10, current: 0 }
        ]
      };

      const userStats: UserStatistics = {
        totalSentences: 7,
        totalVotes: 0,
        averageVoteScore: 0,
        storiesStarted: 0,
        storiesCompleted: 0,
        branchesCreated: 0,
        daysActive: 0,
        longestStreak: 0,
        currentStreak: 0,
        favoriteCategories: [],
        totalReputation: 0
      };

      const updated = updateAchievementProgress(achievement, userStats);
      expect(updated.progress).toBe(7);
      expect(updated.requirements[0].current).toBe(7);
      expect(updated.isCompleted).toBe(false);
    });

    it('should mark achievements as completed when requirements are met', () => {
      const achievement: Achievement = {
        id: 'ach1',
        name: 'Prolific Writer',
        description: 'Write 10 sentences',
        progress: 0,
        maxProgress: 10,
        reward: { type: 'badge', value: 'writer_badge', description: 'Writer badge' },
        category: 'writing',
        isCompleted: false,
        requirements: [
          { type: 'sentence_count', target: 10, current: 0 }
        ]
      };

      const userStats: UserStatistics = {
        totalSentences: 15,
        totalVotes: 0,
        averageVoteScore: 0,
        storiesStarted: 0,
        storiesCompleted: 0,
        branchesCreated: 0,
        daysActive: 0,
        longestStreak: 0,
        currentStreak: 0,
        favoriteCategories: [],
        totalReputation: 0
      };

      const updated = updateAchievementProgress(achievement, userStats);
      expect(updated.progress).toBe(10);
      expect(updated.requirements[0].current).toBe(10);
      expect(updated.isCompleted).toBe(true);
      expect(updated.completedAt).toBeDefined();
    });
  });
});