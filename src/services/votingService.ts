import { Context } from '@devvit/public-api';
import { 
  WeightedVote, 
  VotingMetrics, 
  validateWeightedVote,
  calculateWeightedScore,
  calculateControversyScore,
  UserProfile
} from '../types/story.js';

// Interfaces for voting service functionality
export interface WeightedVoteParams {
  userId: string;
  sentenceId: string;
  storyId: string;
  subredditName: string;
  voteType: 'upvote' | 'downvote' | 'quality' | 'creative';
}

export interface VotingResult {
  success: boolean;
  vote?: WeightedVote;
  metrics?: VotingMetrics;
  error?: string;
}

export interface SentenceSubmission {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  submittedAt: number;
  storyId: string;
  position: number;
}

export interface VotingSession {
  id: string;
  storyId: string;
  position: number;
  submissions: SentenceSubmission[];
  votes: Map<string, WeightedVote[]>; // submissionId -> votes
  deadline: number;
  status: 'active' | 'completed' | 'expired';
  winningSubmissionId?: string;
  createdAt: number;
}

export interface UserReputationData {
  userId: string;
  subredditName: string;
  reputation: number;
  totalVotes: number;
  averageVoteScore: number;
  participationDays: number;
  lastActivity: number;
  qualityRating: number; // 0-10 scale
}

export class VotingService {
  private context: Context;
  private readonly QUALITY_THRESHOLD = -5; // Sentences below this score get hidden
  private readonly MAX_VOTE_WEIGHT = 10;
  private readonly MIN_VOTE_WEIGHT = 0.1;
  private readonly BASE_REPUTATION = 100;

  constructor(context: Context) {
    this.context = context;
  }

  /**
   * Cast a weighted vote on a sentence
   * Requirements: 2.1, 2.5
   */
  async castWeightedVote(params: WeightedVoteParams): Promise<VotingResult> {
    try {
      const { userId, sentenceId, storyId, subredditName, voteType } = params;

      // Calculate user's vote weight
      const userWeight = await this.calculateUserWeight(userId, subredditName);

      // Create weighted vote
      const vote: WeightedVote = {
        id: `vote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        weight: userWeight,
        timestamp: Date.now(),
        voteType,
        sentenceId,
        subredditName
      };

      // Validate vote
      if (!validateWeightedVote(vote)) {
        return {
          success: false,
          error: 'Invalid vote parameters'
        };
      }

      // Check if user has already voted on this sentence
      const existingVoteKey = `vote:${sentenceId}:${userId}`;
      const existingVoteData = await this.context.redis.get(existingVoteKey);
      
      if (existingVoteData) {
        // Remove existing vote from sentence votes
        await this.removeExistingVote(sentenceId, userId);
      }

      // Store the new vote
      await this.context.redis.set(existingVoteKey, JSON.stringify(vote));
      await this.context.redis.sadd(`sentence:${sentenceId}:votes`, vote.id);
      await this.context.redis.set(`vote:${vote.id}`, JSON.stringify(vote));

      // Update voting metrics
      const metrics = await this.updateVotingMetrics(sentenceId);

      // Update user reputation based on vote received (if voting on others' content)
      await this.updateUserReputationFromVote(vote, storyId);

      return {
        success: true,
        vote,
        metrics
      };

    } catch (error) {
      console.error('Failed to cast weighted vote:', error);
      return {
        success: false,
        error: 'Failed to cast vote'
      };
    }
  }

  /**
   * Calculate user's vote weight based on reputation and subreddit participation
   * Requirements: 2.1, 2.5
   */
  async calculateUserWeight(userId: string, subredditName: string): Promise<number> {
    try {
      // Get user reputation data
      const reputationData = await this.getUserReputationData(userId, subredditName);
      
      if (!reputationData) {
        // New user gets base weight
        return 1.0;
      }

      // Base weight from reputation (logarithmic scale)
      const reputationWeight = Math.log10(reputationData.reputation / this.BASE_REPUTATION + 1) + 1;
      
      // Participation bonus (based on days active)
      const participationBonus = Math.min(2.0, reputationData.participationDays / 30);
      
      // Quality bonus (based on average vote score received)
      const qualityBonus = Math.min(2.0, reputationData.qualityRating / 5);
      
      // Activity bonus (recent activity gets slight boost)
      const daysSinceLastActivity = (Date.now() - reputationData.lastActivity) / (1000 * 60 * 60 * 24);
      const activityBonus = daysSinceLastActivity < 7 ? 0.5 : 0;
      
      // Calculate final weight
      let finalWeight = reputationWeight + participationBonus + qualityBonus + activityBonus;
      
      // Apply bounds
      finalWeight = Math.max(this.MIN_VOTE_WEIGHT, Math.min(this.MAX_VOTE_WEIGHT, finalWeight));
      
      return Math.round(finalWeight * 100) / 100; // Round to 2 decimal places
      
    } catch (error) {
      console.error('Failed to calculate user weight:', error);
      return 1.0; // Default weight on error
    }
  }

  /**
   * Get or create user reputation data for a subreddit
   */
  private async getUserReputationData(userId: string, subredditName: string): Promise<UserReputationData | null> {
    try {
      const key = `user:${userId}:reputation:${subredditName}`;
      const data = await this.context.redis.get(key);
      
      if (data) {
        return JSON.parse(data);
      }

      // Create initial reputation data for new user
      const initialData: UserReputationData = {
        userId,
        subredditName,
        reputation: this.BASE_REPUTATION,
        totalVotes: 0,
        averageVoteScore: 0,
        participationDays: 1,
        lastActivity: Date.now(),
        qualityRating: 5.0 // Start with neutral quality rating
      };

      await this.context.redis.set(key, JSON.stringify(initialData));
      return initialData;
      
    } catch (error) {
      console.error('Failed to get user reputation data:', error);
      return null;
    }
  }

  /**
   * Update voting metrics for a sentence
   */
  private async updateVotingMetrics(sentenceId: string): Promise<VotingMetrics> {
    try {
      // Get all votes for this sentence
      const voteIds = await this.context.redis.smembers(`sentence:${sentenceId}:votes`);
      const votes: WeightedVote[] = [];
      
      for (const voteId of voteIds) {
        const voteData = await this.context.redis.get(`vote:${voteId}`);
        if (voteData) {
          votes.push(JSON.parse(voteData));
        }
      }

      // Calculate metrics
      const weightedScore = calculateWeightedScore(votes);
      const controversyScore = calculateControversyScore(votes);
      
      // Calculate quality rating (0-10 scale)
      const qualityVotes = votes.filter(v => v.voteType === 'quality');
      const qualityRating = qualityVotes.length > 0 
        ? Math.min(10, Math.max(0, (weightedScore / votes.length) + 5))
        : 5; // Default neutral rating

      const metrics: VotingMetrics = {
        sentenceId,
        totalVotes: votes.length,
        weightedScore,
        qualityRating,
        controversyScore,
        hiddenBelowThreshold: weightedScore < this.QUALITY_THRESHOLD,
        lastUpdated: Date.now()
      };

      // Store metrics
      await this.context.redis.set(`metrics:${sentenceId}`, JSON.stringify(metrics));
      
      return metrics;
      
    } catch (error) {
      console.error('Failed to update voting metrics:', error);
      throw error;
    }
  }

  /**
   * Remove existing vote from sentence
   */
  private async removeExistingVote(sentenceId: string, userId: string): Promise<void> {
    try {
      const existingVoteKey = `vote:${sentenceId}:${userId}`;
      const existingVoteData = await this.context.redis.get(existingVoteKey);
      
      if (existingVoteData) {
        const existingVote: WeightedVote = JSON.parse(existingVoteData);
        
        // Remove from sentence votes set
        await this.context.redis.srem(`sentence:${sentenceId}:votes`, existingVote.id);
        
        // Remove vote record
        await this.context.redis.del(`vote:${existingVote.id}`);
      }
    } catch (error) {
      console.error('Failed to remove existing vote:', error);
    }
  }

  /**
   * Update user reputation based on votes received
   */
  private async updateUserReputationFromVote(vote: WeightedVote, storyId: string): Promise<void> {
    try {
      // Get sentence author to update their reputation
      const sentenceData = await this.context.redis.get(`sentence:${vote.sentenceId}`);
      if (!sentenceData) return;

      const sentence = JSON.parse(sentenceData);
      const authorId = sentence.authorId;
      
      // Don't update reputation for self-votes
      if (authorId === vote.userId) return;

      // Get author's reputation data
      const reputationData = await this.getUserReputationData(authorId, vote.subredditName);
      if (!reputationData) return;

      // Calculate reputation change based on vote
      let reputationChange = 0;
      switch (vote.voteType) {
        case 'upvote':
          reputationChange = vote.weight * 2;
          break;
        case 'quality':
          reputationChange = vote.weight * 3;
          break;
        case 'creative':
          reputationChange = vote.weight * 2.5;
          break;
        case 'downvote':
          reputationChange = -vote.weight * 1;
          break;
      }

      // Update reputation data
      reputationData.reputation += reputationChange;
      reputationData.totalVotes += 1;
      reputationData.lastActivity = Date.now();
      
      // Recalculate average vote score
      const totalScore = reputationData.averageVoteScore * (reputationData.totalVotes - 1) + (vote.weight * (vote.voteType === 'downvote' ? -1 : 1));
      reputationData.averageVoteScore = totalScore / reputationData.totalVotes;
      
      // Update quality rating based on recent votes
      reputationData.qualityRating = Math.min(10, Math.max(0, reputationData.averageVoteScore + 5));

      // Save updated reputation
      const key = `user:${authorId}:reputation:${vote.subredditName}`;
      await this.context.redis.set(key, JSON.stringify(reputationData));
      
    } catch (error) {
      console.error('Failed to update user reputation from vote:', error);
    }
  }

  /**
   * Get voting metrics for a sentence
   */
  async getVotingMetrics(sentenceId: string): Promise<VotingMetrics | null> {
    try {
      const metricsData = await this.context.redis.get(`metrics:${sentenceId}`);
      return metricsData ? JSON.parse(metricsData) : null;
    } catch (error) {
      console.error('Failed to get voting metrics:', error);
      return null;
    }
  }

  /**
   * Get all votes for a sentence
   */
  async getSentenceVotes(sentenceId: string): Promise<WeightedVote[]> {
    try {
      const voteIds = await this.context.redis.smembers(`sentence:${sentenceId}:votes`);
      const votes: WeightedVote[] = [];
      
      for (const voteId of voteIds) {
        const voteData = await this.context.redis.get(`vote:${voteId}`);
        if (voteData) {
          votes.push(JSON.parse(voteData));
        }
      }
      
      return votes;
    } catch (error) {
      console.error('Failed to get sentence votes:', error);
      return [];
    }
  }

  /**
   * Check if a sentence should be hidden based on vote threshold
   */
  async shouldHideSentence(sentenceId: string): Promise<boolean> {
    try {
      const metrics = await this.getVotingMetrics(sentenceId);
      return metrics ? metrics.hiddenBelowThreshold : false;
    } catch (error) {
      console.error('Failed to check if sentence should be hidden:', error);
      return false;
    }
  }

  /**
   * Handle multiple sentence submissions for the same story position
   * Requirements: 2.3
   */
  async handleMultipleSubmissions(storyId: string, submissions: SentenceSubmission[]): Promise<VotingSession> {
    try {
      if (submissions.length < 2) {
        throw new Error('Multiple submissions handler requires at least 2 submissions');
      }

      // Ensure all submissions are for the same position
      const position = submissions[0].position;
      if (!submissions.every(sub => sub.position === position)) {
        throw new Error('All submissions must be for the same story position');
      }

      // Create voting session
      const sessionId = `voting_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const votingDeadline = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now

      const votingSession: VotingSession = {
        id: sessionId,
        storyId,
        position,
        submissions,
        votes: new Map(),
        deadline: votingDeadline,
        status: 'active',
        createdAt: Date.now()
      };

      // Store voting session
      await this.context.redis.set(`voting_session:${sessionId}`, JSON.stringify({
        ...votingSession,
        votes: Object.fromEntries(votingSession.votes) // Convert Map to object for storage
      }));

      // Add to active voting sessions for the story
      await this.context.redis.sadd(`story:${storyId}:voting_sessions`, sessionId);

      // Set expiration for automatic cleanup
      await this.context.redis.expire(`voting_session:${sessionId}`, 25 * 60 * 60); // 25 hours

      console.log(`Created voting session ${sessionId} for story ${storyId} position ${position} with ${submissions.length} submissions`);

      return votingSession;

    } catch (error) {
      console.error('Failed to handle multiple submissions:', error);
      throw error;
    }
  }

  /**
   * Vote on a submission within a voting session
   */
  async voteOnSubmission(sessionId: string, submissionId: string, userId: string, subredditName: string, voteType: 'upvote' | 'downvote' | 'quality' | 'creative'): Promise<VotingResult> {
    try {
      // Get voting session
      const sessionData = await this.context.redis.get(`voting_session:${sessionId}`);
      if (!sessionData) {
        return {
          success: false,
          error: 'Voting session not found'
        };
      }

      const sessionObj = JSON.parse(sessionData);
      const votingSession: VotingSession = {
        ...sessionObj,
        votes: new Map(Object.entries(sessionObj.votes || {}))
      };

      // Check if session is still active
      if (votingSession.status !== 'active' || Date.now() > votingSession.deadline) {
        return {
          success: false,
          error: 'Voting session has expired'
        };
      }

      // Check if submission exists in this session
      const submission = votingSession.submissions.find(sub => sub.id === submissionId);
      if (!submission) {
        return {
          success: false,
          error: 'Submission not found in this voting session'
        };
      }

      // Prevent voting on own submission
      if (submission.authorId === userId) {
        return {
          success: false,
          error: 'Cannot vote on your own submission'
        };
      }

      // Calculate user's vote weight
      const userWeight = await this.calculateUserWeight(userId, subredditName);

      // Create vote
      const vote: WeightedVote = {
        id: `submission_vote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        weight: userWeight,
        timestamp: Date.now(),
        voteType,
        sentenceId: submissionId, // Using submissionId as sentenceId for consistency
        subredditName
      };

      // Get existing votes for this submission
      const submissionVotes = votingSession.votes.get(submissionId) || [];
      
      // Remove any existing vote from this user
      const filteredVotes = submissionVotes.filter(v => v.userId !== userId);
      
      // Add new vote
      filteredVotes.push(vote);
      votingSession.votes.set(submissionId, filteredVotes);

      // Save updated voting session
      await this.context.redis.set(`voting_session:${sessionId}`, JSON.stringify({
        ...votingSession,
        votes: Object.fromEntries(votingSession.votes)
      }));

      // Store individual vote
      await this.context.redis.set(`submission_vote:${vote.id}`, JSON.stringify(vote));

      return {
        success: true,
        vote
      };

    } catch (error) {
      console.error('Failed to vote on submission:', error);
      return {
        success: false,
        error: 'Failed to cast vote on submission'
      };
    }
  }

  /**
   * Get current voting session results
   */
  async getVotingSessionResults(sessionId: string): Promise<Array<{submission: SentenceSubmission, score: number, votes: WeightedVote[]}> | null> {
    try {
      const sessionData = await this.context.redis.get(`voting_session:${sessionId}`);
      if (!sessionData) return null;

      const sessionObj = JSON.parse(sessionData);
      const votingSession: VotingSession = {
        ...sessionObj,
        votes: new Map(Object.entries(sessionObj.votes || {}))
      };

      const results = votingSession.submissions.map(submission => {
        const votes = votingSession.votes.get(submission.id) || [];
        const score = calculateWeightedScore(votes);
        
        return {
          submission,
          score,
          votes
        };
      });

      // Sort by score (highest first)
      results.sort((a, b) => b.score - a.score);

      return results;

    } catch (error) {
      console.error('Failed to get voting session results:', error);
      return null;
    }
  }

  /**
   * Complete voting session and select winning submission
   */
  async completeVotingSession(sessionId: string): Promise<SentenceSubmission | null> {
    try {
      const sessionData = await this.context.redis.get(`voting_session:${sessionId}`);
      if (!sessionData) return null;

      const sessionObj = JSON.parse(sessionData);
      const votingSession: VotingSession = {
        ...sessionObj,
        votes: new Map(Object.entries(sessionObj.votes || {}))
      };

      // Get results
      const results = await this.getVotingSessionResults(sessionId);
      if (!results || results.length === 0) return null;

      // Select winner (highest score)
      const winner = results[0];
      
      // Update session status
      votingSession.status = 'completed';
      votingSession.winningSubmissionId = winner.submission.id;

      // Save updated session
      await this.context.redis.set(`voting_session:${sessionId}`, JSON.stringify({
        ...votingSession,
        votes: Object.fromEntries(votingSession.votes)
      }));

      console.log(`Voting session ${sessionId} completed. Winner: ${winner.submission.id} with score ${winner.score}`);

      return winner.submission;

    } catch (error) {
      console.error('Failed to complete voting session:', error);
      return null;
    }
  }

  /**
   * Check and process expired voting sessions
   */
  async processExpiredVotingSessions(storyId: string): Promise<SentenceSubmission[]> {
    try {
      const sessionIds = await this.context.redis.smembers(`story:${storyId}:voting_sessions`);
      const completedSubmissions: SentenceSubmission[] = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.context.redis.get(`voting_session:${sessionId}`);
        if (!sessionData) continue;

        const sessionObj = JSON.parse(sessionData);
        const votingSession: VotingSession = {
          ...sessionObj,
          votes: new Map(Object.entries(sessionObj.votes || {}))
        };

        // Check if session has expired
        if (votingSession.status === 'active' && Date.now() > votingSession.deadline) {
          // Mark as expired
          votingSession.status = 'expired';

          // Select winner or use fallback
          const results = await this.getVotingSessionResults(sessionId);
          let winningSubmission: SentenceSubmission;

          if (results && results.length > 0 && results[0].score > 0) {
            // Use highest scoring submission
            winningSubmission = results[0].submission;
            votingSession.winningSubmissionId = winningSubmission.id;
          } else {
            // Fallback: use first submission (or random selection)
            winningSubmission = votingSession.submissions[0];
            votingSession.winningSubmissionId = winningSubmission.id;
            console.log(`No clear winner for voting session ${sessionId}, using fallback selection`);
          }

          // Save updated session
          await this.context.redis.set(`voting_session:${sessionId}`, JSON.stringify({
            ...votingSession,
            votes: Object.fromEntries(votingSession.votes)
          }));

          completedSubmissions.push(winningSubmission);

          // Remove from active sessions
          await this.context.redis.srem(`story:${storyId}:voting_sessions`, sessionId);
        }
      }

      return completedSubmissions;

    } catch (error) {
      console.error('Failed to process expired voting sessions:', error);
      return [];
    }
  }

  /**
   * Get active voting sessions for a story
   */
  async getActiveVotingSessions(storyId: string): Promise<VotingSession[]> {
    try {
      const sessionIds = await this.context.redis.smembers(`story:${storyId}:voting_sessions`);
      const activeSessions: VotingSession[] = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.context.redis.get(`voting_session:${sessionId}`);
        if (!sessionData) continue;

        const sessionObj = JSON.parse(sessionData);
        const votingSession: VotingSession = {
          ...sessionObj,
          votes: new Map(Object.entries(sessionObj.votes || {}))
        };

        if (votingSession.status === 'active' && Date.now() <= votingSession.deadline) {
          activeSessions.push(votingSession);
        }
      }

      return activeSessions;

    } catch (error) {
      console.error('Failed to get active voting sessions:', error);
      return [];
    }
  }

  /**
   * Hide sentence when votes fall below threshold
   * Requirements: 2.2, 2.4
   */
  async hideSentenceBelowThreshold(sentenceId: string): Promise<boolean> {
    try {
      const metrics = await this.getVotingMetrics(sentenceId);
      if (!metrics) return false;

      if (metrics.weightedScore < this.QUALITY_THRESHOLD) {
        // Mark sentence as hidden
        await this.context.redis.set(`sentence:${sentenceId}:hidden`, 'true');
        await this.context.redis.set(`sentence:${sentenceId}:hidden_at`, Date.now().toString());
        
        // Update metrics to reflect hidden status
        metrics.hiddenBelowThreshold = true;
        metrics.lastUpdated = Date.now();
        await this.context.redis.set(`metrics:${sentenceId}`, JSON.stringify(metrics));

        console.log(`Hidden sentence ${sentenceId} due to low score: ${metrics.weightedScore}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to hide sentence below threshold:', error);
      return false;
    }
  }

  /**
   * Unhide sentence if score improves above threshold
   */
  async unhideSentenceAboveThreshold(sentenceId: string): Promise<boolean> {
    try {
      const metrics = await this.getVotingMetrics(sentenceId);
      if (!metrics) return false;

      const isHidden = await this.context.redis.get(`sentence:${sentenceId}:hidden`);
      
      if (isHidden === 'true' && metrics.weightedScore >= this.QUALITY_THRESHOLD) {
        // Remove hidden status
        await this.context.redis.del(`sentence:${sentenceId}:hidden`);
        await this.context.redis.del(`sentence:${sentenceId}:hidden_at`);
        
        // Update metrics
        metrics.hiddenBelowThreshold = false;
        metrics.lastUpdated = Date.now();
        await this.context.redis.set(`metrics:${sentenceId}`, JSON.stringify(metrics));

        console.log(`Unhidden sentence ${sentenceId} due to improved score: ${metrics.weightedScore}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to unhide sentence above threshold:', error);
      return false;
    }
  }

  /**
   * Check if sentence is hidden
   */
  async isSentenceHidden(sentenceId: string): Promise<boolean> {
    try {
      const isHidden = await this.context.redis.get(`sentence:${sentenceId}:hidden`);
      return isHidden === 'true';
    } catch (error) {
      console.error('Failed to check if sentence is hidden:', error);
      return false;
    }
  }

  /**
   * Get quality rating for a sentence based on weighted votes
   * Requirements: 2.2
   */
  async getQualityRating(sentenceId: string): Promise<number> {
    try {
      const metrics = await this.getVotingMetrics(sentenceId);
      return metrics ? metrics.qualityRating : 5.0; // Default neutral rating
    } catch (error) {
      console.error('Failed to get quality rating:', error);
      return 5.0;
    }
  }

  /**
   * Calculate and update quality rating for a sentence
   */
  async updateQualityRating(sentenceId: string): Promise<number> {
    try {
      const votes = await this.getSentenceVotes(sentenceId);
      
      if (votes.length === 0) {
        return 5.0; // Neutral rating for no votes
      }

      // Calculate quality based on different vote types
      let qualityScore = 0;
      let qualityVoteCount = 0;

      for (const vote of votes) {
        switch (vote.voteType) {
          case 'quality':
            qualityScore += vote.weight * 2; // Quality votes have higher impact
            qualityVoteCount += 1;
            break;
          case 'creative':
            qualityScore += vote.weight * 1.5;
            qualityVoteCount += 1;
            break;
          case 'upvote':
            qualityScore += vote.weight;
            qualityVoteCount += 1;
            break;
          case 'downvote':
            qualityScore -= vote.weight;
            qualityVoteCount += 1;
            break;
        }
      }

      // Calculate average and normalize to 0-10 scale
      const averageScore = qualityVoteCount > 0 ? qualityScore / qualityVoteCount : 0;
      const normalizedRating = Math.min(10, Math.max(0, averageScore + 5));

      // Update metrics with new quality rating
      const metrics = await this.getVotingMetrics(sentenceId);
      if (metrics) {
        metrics.qualityRating = Math.round(normalizedRating * 100) / 100; // Round to 2 decimal places
        metrics.lastUpdated = Date.now();
        await this.context.redis.set(`metrics:${sentenceId}`, JSON.stringify(metrics));
      }

      return normalizedRating;

    } catch (error) {
      console.error('Failed to update quality rating:', error);
      return 5.0;
    }
  }

  /**
   * Get controversy score for balanced voting patterns
   * Requirements: 2.4
   */
  async getControversyScore(sentenceId: string): Promise<number> {
    try {
      const metrics = await this.getVotingMetrics(sentenceId);
      return metrics ? metrics.controversyScore : 0;
    } catch (error) {
      console.error('Failed to get controversy score:', error);
      return 0;
    }
  }

  /**
   * Identify controversial sentences (high controversy score)
   */
  async getControversialSentences(storyId: string, threshold: number = 1.0): Promise<string[]> {
    try {
      // Get all sentences for the story
      const storyData = await this.context.redis.get(`story:${storyId}`);
      if (!storyData) return [];

      const story = JSON.parse(storyData);
      const controversialSentences: string[] = [];

      for (const sentence of story.sentences) {
        const metrics = await this.getVotingMetrics(sentence.id);
        if (metrics && metrics.controversyScore >= threshold) {
          controversialSentences.push(sentence.id);
        }
      }

      return controversialSentences;

    } catch (error) {
      console.error('Failed to get controversial sentences:', error);
      return [];
    }
  }

  /**
   * Get sentences that should be hidden due to low quality
   */
  async getHiddenSentences(storyId: string): Promise<string[]> {
    try {
      const storyData = await this.context.redis.get(`story:${storyId}`);
      if (!storyData) return [];

      const story = JSON.parse(storyData);
      const hiddenSentences: string[] = [];

      for (const sentence of story.sentences) {
        const isHidden = await this.isSentenceHidden(sentence.id);
        if (isHidden) {
          hiddenSentences.push(sentence.id);
        }
      }

      return hiddenSentences;

    } catch (error) {
      console.error('Failed to get hidden sentences:', error);
      return [];
    }
  }

  /**
   * Batch update voting metrics for all sentences in a story
   */
  async updateStoryVotingMetrics(storyId: string): Promise<void> {
    try {
      const storyData = await this.context.redis.get(`story:${storyId}`);
      if (!storyData) return;

      const story = JSON.parse(storyData);

      for (const sentence of story.sentences) {
        // Update metrics
        await this.updateVotingMetrics(sentence.id);
        
        // Check if sentence should be hidden/unhidden
        const metrics = await this.getVotingMetrics(sentence.id);
        if (metrics) {
          if (metrics.weightedScore < this.QUALITY_THRESHOLD) {
            await this.hideSentenceBelowThreshold(sentence.id);
          } else {
            await this.unhideSentenceAboveThreshold(sentence.id);
          }
        }
      }

      console.log(`Updated voting metrics for all sentences in story ${storyId}`);

    } catch (error) {
      console.error('Failed to update story voting metrics:', error);
    }
  }

  /**
   * Get voting statistics for a user in a subreddit
   */
  async getUserVotingStats(userId: string, subredditName: string): Promise<UserReputationData | null> {
    try {
      return await this.getUserReputationData(userId, subredditName);
    } catch (error) {
      console.error('Failed to get user voting stats:', error);
      return null;
    }
  }

  /**
   * Get top quality sentences in a story
   */
  async getTopQualitySentences(storyId: string, limit: number = 10): Promise<Array<{sentenceId: string, qualityRating: number, weightedScore: number}>> {
    try {
      const storyData = await this.context.redis.get(`story:${storyId}`);
      if (!storyData) return [];

      const story = JSON.parse(storyData);
      const qualitySentences: Array<{sentenceId: string, qualityRating: number, weightedScore: number}> = [];

      for (const sentence of story.sentences) {
        const metrics = await this.getVotingMetrics(sentence.id);
        if (metrics && !metrics.hiddenBelowThreshold) {
          qualitySentences.push({
            sentenceId: sentence.id,
            qualityRating: metrics.qualityRating,
            weightedScore: metrics.weightedScore
          });
        }
      }

      // Sort by quality rating, then by weighted score
      qualitySentences.sort((a, b) => {
        if (Math.abs(a.qualityRating - b.qualityRating) < 0.1) {
          return b.weightedScore - a.weightedScore;
        }
        return b.qualityRating - a.qualityRating;
      });

      return qualitySentences.slice(0, limit);

    } catch (error) {
      console.error('Failed to get top quality sentences:', error);
      return [];
    }
  }
}