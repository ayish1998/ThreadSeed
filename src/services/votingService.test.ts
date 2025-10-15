import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VotingService } from './votingService.js';
import type { WeightedVoteParams, SentenceSubmission } from './votingService.js';
import type { WeightedVote, VotingMetrics } from '../types/story.js';

// Mock Context for testing
const mockContext = {
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    smembers: vi.fn(),
    expire: vi.fn(),
    keys: vi.fn()
  }
};

describe('VotingService', () => {
  let votingService: VotingService;

  beforeEach(() => {
    vi.clearAllMocks();
    votingService = new VotingService(mockContext as any);
  });

  describe('calculateUserWeight', () => {
    it('should return base weight for new user', async () => {
      mockContext.redis.get.mockResolvedValue(null);
      mockContext.redis.set.mockResolvedValue('OK');

      const weight = await votingService.calculateUserWeight('user123', 'testsubreddit');
      
      // New user gets base weight calculation: log10(100/100 + 1) + 1 + participation + quality + activity
      // = log10(2) + 1 + 2 + 1 + 0 = ~2.83
      expect(weight).toBeCloseTo(2.83, 1);
      expect(mockContext.redis.set).toHaveBeenCalledWith(
        'user:user123:reputation:testsubreddit',
        expect.stringContaining('"reputation":100')
      );
    });

    it('should calculate weight based on reputation and participation', async () => {
      const reputationData = {
        userId: 'user123',
        subredditName: 'testsubreddit',
        reputation: 500,
        totalVotes: 50,
        averageVoteScore: 3.5,
        participationDays: 60,
        lastActivity: Date.now() - (2 * 24 * 60 * 60 * 1000), // 2 days ago
        qualityRating: 7.5
      };

      mockContext.redis.get.mockResolvedValue(JSON.stringify(reputationData));

      const weight = await votingService.calculateUserWeight('user123', 'testsubreddit');
      
      // Should be higher than base weight due to good reputation and participation
      expect(weight).toBeGreaterThan(1.0);
      expect(weight).toBeLessThanOrEqual(10); // Max weight cap
    });

    it('should apply weight bounds correctly', async () => {
      const highReputationData = {
        userId: 'user123',
        subredditName: 'testsubreddit',
        reputation: 10000,
        totalVotes: 1000,
        averageVoteScore: 10,
        participationDays: 365,
        lastActivity: Date.now(),
        qualityRating: 10
      };

      mockContext.redis.get.mockResolvedValue(JSON.stringify(highReputationData));

      const weight = await votingService.calculateUserWeight('user123', 'testsubreddit');
      
      expect(weight).toBeLessThanOrEqual(10); // Should not exceed max weight
    });
  });

  describe('castWeightedVote', () => {
    it('should successfully cast a weighted vote', async () => {
      const voteParams: WeightedVoteParams = {
        userId: 'user123',
        sentenceId: 'sentence456',
        storyId: 'story789',
        subredditName: 'testsubreddit',
        voteType: 'upvote'
      };

      // Mock user reputation data
      const reputationData = {
        userId: 'user123',
        subredditName: 'testsubreddit',
        reputation: 200,
        totalVotes: 10,
        averageVoteScore: 2.0,
        participationDays: 30,
        lastActivity: Date.now(),
        qualityRating: 6.0
      };

      mockContext.redis.get
        .mockResolvedValueOnce(JSON.stringify(reputationData)) // For calculateUserWeight
        .mockResolvedValueOnce(null) // No existing vote
        .mockResolvedValueOnce('[]') // No existing votes for sentence
        .mockResolvedValueOnce(null); // No sentence data for reputation update

      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.sadd.mockResolvedValue(1);
      mockContext.redis.smembers.mockResolvedValue([]);

      const result = await votingService.castWeightedVote(voteParams);

      expect(result.success).toBe(true);
      expect(result.vote).toBeDefined();
      expect(result.vote?.voteType).toBe('upvote');
      expect(result.vote?.userId).toBe('user123');
      expect(result.metrics).toBeDefined();
    });

    it('should handle existing vote replacement', async () => {
      const voteParams: WeightedVoteParams = {
        userId: 'user123',
        sentenceId: 'sentence456',
        storyId: 'story789',
        subredditName: 'testsubreddit',
        voteType: 'downvote'
      };

      const existingVote: WeightedVote = {
        id: 'old_vote',
        userId: 'user123',
        weight: 1.5,
        timestamp: Date.now() - 1000,
        voteType: 'upvote',
        sentenceId: 'sentence456',
        subredditName: 'testsubreddit'
      };

      const reputationData = {
        userId: 'user123',
        subredditName: 'testsubreddit',
        reputation: 200,
        totalVotes: 10,
        averageVoteScore: 2.0,
        participationDays: 30,
        lastActivity: Date.now(),
        qualityRating: 6.0
      };

      mockContext.redis.get
        .mockResolvedValueOnce(JSON.stringify(reputationData)) // For calculateUserWeight
        .mockResolvedValueOnce(JSON.stringify(existingVote)) // Existing vote check
        .mockResolvedValueOnce(JSON.stringify(existingVote)) // Existing vote for removal
        .mockResolvedValueOnce('[]') // No existing votes for sentence after removal
        .mockResolvedValueOnce(null); // No sentence data

      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.sadd.mockResolvedValue(1);
      mockContext.redis.srem.mockResolvedValue(1);
      mockContext.redis.del.mockResolvedValue(1);
      mockContext.redis.smembers.mockResolvedValue([]);

      const result = await votingService.castWeightedVote(voteParams);

      expect(result.success).toBe(true);
      expect(result.vote?.voteType).toBe('downvote');
      expect(mockContext.redis.srem).toHaveBeenCalledWith('sentence:sentence456:votes', 'old_vote');
      expect(mockContext.redis.del).toHaveBeenCalledWith('vote:old_vote');
    });

    it('should reject invalid vote parameters', async () => {
      const invalidVoteParams: WeightedVoteParams = {
        userId: '',
        sentenceId: 'sentence456',
        storyId: 'story789',
        subredditName: 'testsubreddit',
        voteType: 'upvote'
      };

      const result = await votingService.castWeightedVote(invalidVoteParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid vote parameters');
    });
  });

  describe('handleMultipleSubmissions', () => {
    it('should create voting session for multiple submissions', async () => {
      const submissions: SentenceSubmission[] = [
        {
          id: 'sub1',
          content: 'First submission',
          authorId: 'user1',
          authorName: 'User One',
          submittedAt: Date.now(),
          storyId: 'story123',
          position: 5
        },
        {
          id: 'sub2',
          content: 'Second submission',
          authorId: 'user2',
          authorName: 'User Two',
          submittedAt: Date.now(),
          storyId: 'story123',
          position: 5
        }
      ];

      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.sadd.mockResolvedValue(1);
      mockContext.redis.expire.mockResolvedValue(1);

      const votingSession = await votingService.handleMultipleSubmissions('story123', submissions);

      expect(votingSession.storyId).toBe('story123');
      expect(votingSession.position).toBe(5);
      expect(votingSession.submissions).toHaveLength(2);
      expect(votingSession.status).toBe('active');
      expect(mockContext.redis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^voting_session:/),
        expect.any(String)
      );
    });

    it('should reject submissions with different positions', async () => {
      const submissions: SentenceSubmission[] = [
        {
          id: 'sub1',
          content: 'First submission',
          authorId: 'user1',
          authorName: 'User One',
          submittedAt: Date.now(),
          storyId: 'story123',
          position: 5
        },
        {
          id: 'sub2',
          content: 'Second submission',
          authorId: 'user2',
          authorName: 'User Two',
          submittedAt: Date.now(),
          storyId: 'story123',
          position: 6 // Different position
        }
      ];

      await expect(votingService.handleMultipleSubmissions('story123', submissions))
        .rejects.toThrow('All submissions must be for the same story position');
    });

    it('should reject less than 2 submissions', async () => {
      const submissions: SentenceSubmission[] = [
        {
          id: 'sub1',
          content: 'Only submission',
          authorId: 'user1',
          authorName: 'User One',
          submittedAt: Date.now(),
          storyId: 'story123',
          position: 5
        }
      ];

      await expect(votingService.handleMultipleSubmissions('story123', submissions))
        .rejects.toThrow('Multiple submissions handler requires at least 2 submissions');
    });
  });

  describe('voteOnSubmission', () => {
    it('should allow voting on submission in active session', async () => {
      const votingSession = {
        id: 'session123',
        storyId: 'story456',
        position: 3,
        submissions: [
          {
            id: 'sub1',
            content: 'Test submission',
            authorId: 'author1',
            authorName: 'Author One',
            submittedAt: Date.now(),
            storyId: 'story456',
            position: 3
          }
        ],
        votes: {},
        deadline: Date.now() + 1000000, // Future deadline
        status: 'active',
        createdAt: Date.now()
      };

      const reputationData = {
        userId: 'voter1',
        subredditName: 'testsubreddit',
        reputation: 150,
        totalVotes: 5,
        averageVoteScore: 1.5,
        participationDays: 15,
        lastActivity: Date.now(),
        qualityRating: 5.5
      };

      mockContext.redis.get
        .mockResolvedValueOnce(JSON.stringify(votingSession))
        .mockResolvedValueOnce(JSON.stringify(reputationData));

      mockContext.redis.set.mockResolvedValue('OK');

      const result = await votingService.voteOnSubmission(
        'session123',
        'sub1',
        'voter1',
        'testsubreddit',
        'quality'
      );

      expect(result.success).toBe(true);
      expect(result.vote?.voteType).toBe('quality');
      expect(result.vote?.userId).toBe('voter1');
    });

    it('should prevent voting on own submission', async () => {
      const votingSession = {
        id: 'session123',
        storyId: 'story456',
        position: 3,
        submissions: [
          {
            id: 'sub1',
            content: 'Test submission',
            authorId: 'author1',
            authorName: 'Author One',
            submittedAt: Date.now(),
            storyId: 'story456',
            position: 3
          }
        ],
        votes: {},
        deadline: Date.now() + 1000000,
        status: 'active',
        createdAt: Date.now()
      };

      mockContext.redis.get.mockResolvedValueOnce(JSON.stringify(votingSession));

      const result = await votingService.voteOnSubmission(
        'session123',
        'sub1',
        'author1', // Same as submission author
        'testsubreddit',
        'upvote'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot vote on your own submission');
    });

    it('should reject voting on expired session', async () => {
      const expiredSession = {
        id: 'session123',
        storyId: 'story456',
        position: 3,
        submissions: [
          {
            id: 'sub1',
            content: 'Test submission',
            authorId: 'author1',
            authorName: 'Author One',
            submittedAt: Date.now(),
            storyId: 'story456',
            position: 3
          }
        ],
        votes: {},
        deadline: Date.now() - 1000, // Past deadline
        status: 'active',
        createdAt: Date.now() - 100000
      };

      mockContext.redis.get.mockResolvedValueOnce(JSON.stringify(expiredSession));

      const result = await votingService.voteOnSubmission(
        'session123',
        'sub1',
        'voter1',
        'testsubreddit',
        'upvote'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Voting session has expired');
    });
  });

  describe('content quality control', () => {
    it('should hide sentence below quality threshold', async () => {
      const metrics: VotingMetrics = {
        sentenceId: 'sentence123',
        totalVotes: 5,
        weightedScore: -6, // Below threshold of -5
        qualityRating: 2.0,
        controversyScore: 0.5,
        hiddenBelowThreshold: false,
        lastUpdated: Date.now()
      };

      mockContext.redis.get.mockResolvedValue(JSON.stringify(metrics));
      mockContext.redis.set.mockResolvedValue('OK');

      const result = await votingService.hideSentenceBelowThreshold('sentence123');

      expect(result).toBe(true);
      expect(mockContext.redis.set).toHaveBeenCalledWith('sentence:sentence123:hidden', 'true');
      expect(mockContext.redis.set).toHaveBeenCalledWith(
        'sentence:sentence123:hidden_at',
        expect.any(String)
      );
    });

    it('should not hide sentence above quality threshold', async () => {
      const metrics: VotingMetrics = {
        sentenceId: 'sentence123',
        totalVotes: 5,
        weightedScore: 2, // Above threshold
        qualityRating: 7.0,
        controversyScore: 0.3,
        hiddenBelowThreshold: false,
        lastUpdated: Date.now()
      };

      mockContext.redis.get.mockResolvedValue(JSON.stringify(metrics));

      const result = await votingService.hideSentenceBelowThreshold('sentence123');

      expect(result).toBe(false);
      expect(mockContext.redis.set).not.toHaveBeenCalledWith('sentence:sentence123:hidden', 'true');
    });

    it('should unhide sentence when score improves', async () => {
      const metrics: VotingMetrics = {
        sentenceId: 'sentence123',
        totalVotes: 8,
        weightedScore: 1, // Above threshold now
        qualityRating: 6.5,
        controversyScore: 0.4,
        hiddenBelowThreshold: true,
        lastUpdated: Date.now()
      };

      mockContext.redis.get
        .mockResolvedValueOnce(JSON.stringify(metrics))
        .mockResolvedValueOnce('true'); // Is currently hidden

      mockContext.redis.del.mockResolvedValue(1);
      mockContext.redis.set.mockResolvedValue('OK');

      const result = await votingService.unhideSentenceAboveThreshold('sentence123');

      expect(result).toBe(true);
      expect(mockContext.redis.del).toHaveBeenCalledWith('sentence:sentence123:hidden');
      expect(mockContext.redis.del).toHaveBeenCalledWith('sentence:sentence123:hidden_at');
    });

    it('should calculate controversy score correctly', async () => {
      const votes: WeightedVote[] = [
        {
          id: 'vote1',
          userId: 'user1',
          weight: 2.0,
          timestamp: Date.now(),
          voteType: 'upvote',
          sentenceId: 'sentence123',
          subredditName: 'test'
        },
        {
          id: 'vote2',
          userId: 'user2',
          weight: 1.5,
          timestamp: Date.now(),
          voteType: 'downvote',
          sentenceId: 'sentence123',
          subredditName: 'test'
        },
        {
          id: 'vote3',
          userId: 'user3',
          weight: 1.0,
          timestamp: Date.now(),
          voteType: 'upvote',
          sentenceId: 'sentence123',
          subredditName: 'test'
        }
      ];

      mockContext.redis.smembers.mockResolvedValue(['vote1', 'vote2', 'vote3']);
      mockContext.redis.get
        .mockResolvedValueOnce(JSON.stringify(votes[0]))
        .mockResolvedValueOnce(JSON.stringify(votes[1]))
        .mockResolvedValueOnce(JSON.stringify(votes[2]));

      mockContext.redis.set.mockResolvedValue('OK');

      const metrics = await votingService['updateVotingMetrics']('sentence123');

      expect(metrics.controversyScore).toBeGreaterThan(0);
      expect(metrics.controversyScore).toBeLessThanOrEqual(2);
      expect(metrics.totalVotes).toBe(3);
      expect(metrics.weightedScore).toBe(1.5); // 2.0 + 1.0 - 1.5
    });
  });

  describe('getTopQualitySentences', () => {
    it('should return top quality sentences sorted correctly', async () => {
      const story = {
        sentences: [
          { id: 'sentence1' },
          { id: 'sentence2' },
          { id: 'sentence3' }
        ]
      };

      const metrics1: VotingMetrics = {
        sentenceId: 'sentence1',
        totalVotes: 5,
        weightedScore: 8,
        qualityRating: 8.5,
        controversyScore: 0.2,
        hiddenBelowThreshold: false,
        lastUpdated: Date.now()
      };

      const metrics2: VotingMetrics = {
        sentenceId: 'sentence2',
        totalVotes: 3,
        weightedScore: 5,
        qualityRating: 7.0,
        controversyScore: 0.1,
        hiddenBelowThreshold: false,
        lastUpdated: Date.now()
      };

      const metrics3: VotingMetrics = {
        sentenceId: 'sentence3',
        totalVotes: 8,
        weightedScore: 12,
        qualityRating: 9.0,
        controversyScore: 0.3,
        hiddenBelowThreshold: false,
        lastUpdated: Date.now()
      };

      mockContext.redis.get
        .mockResolvedValueOnce(JSON.stringify(story))
        .mockResolvedValueOnce(JSON.stringify(metrics1))
        .mockResolvedValueOnce(JSON.stringify(metrics2))
        .mockResolvedValueOnce(JSON.stringify(metrics3));

      const topSentences = await votingService.getTopQualitySentences('story123', 3);

      expect(topSentences).toHaveLength(3);
      expect(topSentences[0].sentenceId).toBe('sentence3'); // Highest quality rating
      expect(topSentences[1].sentenceId).toBe('sentence1');
      expect(topSentences[2].sentenceId).toBe('sentence2');
    });
  });
});