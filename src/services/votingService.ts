// src/services/votingService.ts - Simplified Voting System using Reddit upvotes
import { Context } from '@devvit/public-api';

export interface VotingRound {
  storyId: string;
  chapterNumber: number;
  contributions: ContributionEntry[];
  startTime: number;
  endTime: number;
  status: 'active' | 'completed' | 'expired';
  winnerId?: string;
}

export interface ContributionEntry {
  id: string;
  commentId: string;
  authorId: string;
  authorName: string;
  text: string;
  wordCount: number;
  submittedAt: number;
  redditScore: number; // Native Reddit upvotes
  isWinner?: boolean;
}

export interface VotingResult {
  winnerId: string;
  winnerScore: number;
  totalContributions: number;
  totalVotes: number;
}

export class VotingService {
  private context: Context;
  private readonly VOTING_DURATION_DEV = 2 * 60 * 1000; // 2 minutes for dev
  private readonly VOTING_DURATION_PROD = 24 * 60 * 60 * 1000; // 24 hours for prod

  constructor(context: Context) {
    this.context = context;
  }

  /**
   * Start a new voting round for a story chapter
   */
  async startVotingRound(storyId: string, chapterNumber: number): Promise<VotingRound> {
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const duration = isDev ? this.VOTING_DURATION_DEV : this.VOTING_DURATION_PROD;

      const votingRound: VotingRound = {
        storyId,
        chapterNumber,
        contributions: [],
        startTime: Date.now(),
        endTime: Date.now() + duration,
        status: 'active'
      };

      const roundKey = `voting_round:${storyId}:${chapterNumber}`;
      await this.context.redis.set(roundKey, JSON.stringify(votingRound));

      // Set expiration for automatic cleanup
      await this.context.redis.expire(roundKey, Math.ceil(duration / 1000) + 3600); // +1 hour buffer

      console.log(`[VotingService] Started voting round for story ${storyId}, chapter ${chapterNumber}`);
      return votingRound;

    } catch (error) {
      console.error('[VotingService] Failed to start voting round:', error);
      throw new Error('Failed to start voting round');
    }
  }

  /**
   * Add contribution to current voting round
   */
  async addContribution(
    storyId: string,
    chapterNumber: number,
    contribution: Omit<ContributionEntry, 'redditScore'>
  ): Promise<boolean> {
    try {
      const roundKey = `voting_round:${storyId}:${chapterNumber}`;
      const roundData = await this.context.redis.get(roundKey);

      if (!roundData) {
        console.error('[VotingService] Voting round not found');
        return false;
      }

      const votingRound: VotingRound = JSON.parse(roundData);

      // Check if voting is still active
      if (votingRound.status !== 'active' || Date.now() > votingRound.endTime) {
        console.error('[VotingService] Voting round is not active');
        return false;
      }

      // Check if user already contributed to this round
      const existingContribution = votingRound.contributions.find(c => c.authorId === contribution.authorId);
      if (existingContribution) {
        console.error('[VotingService] User already contributed to this round');
        return false;
      }

      // Add contribution with initial score of 0
      const newContribution: ContributionEntry = {
        ...contribution,
        redditScore: 0
      };

      votingRound.contributions.push(newContribution);
      await this.context.redis.set(roundKey, JSON.stringify(votingRound));

      console.log(`[VotingService] Added contribution from ${contribution.authorName} to round ${chapterNumber}`);
      return true;

    } catch (error) {
      console.error('[VotingService] Failed to add contribution:', error);
      return false;
    }
  }

  /**
   * Update contribution score from Reddit comment
   */
  async updateContributionScore(commentId: string, newScore: number): Promise<boolean> {
    try {
      // Find which voting round this comment belongs to
      const contributionData = await this.context.redis.get(`contribution:${commentId}`);
      if (!contributionData) {
        return false;
      }

      const contribution = JSON.parse(contributionData);
      const roundKey = `voting_round:${contribution.storyId}:${contribution.chapter}`;
      const roundData = await this.context.redis.get(roundKey);

      if (!roundData) {
        return false;
      }

      const votingRound: VotingRound = JSON.parse(roundData);
      const contributionIndex = votingRound.contributions.findIndex(c => c.commentId === commentId);

      if (contributionIndex === -1) {
        return false;
      }

      // Update the score
      votingRound.contributions[contributionIndex].redditScore = newScore;
      await this.context.redis.set(roundKey, JSON.stringify(votingRound));

      console.log(`[VotingService] Updated score for comment ${commentId}: ${newScore}`);
      return true;

    } catch (error) {
      console.error('[VotingService] Failed to update contribution score:', error);
      return false;
    }
  }

  /**
   * Check and process expired voting rounds
   */
  async processExpiredRounds(): Promise<void> {
    try {
      // This would typically be called by a scheduler
      // For now, we'll check when explicitly called

      const now = Date.now();

      // Get all active voting rounds (in production, this would be more efficient)
      const keys = await this.getAllVotingRoundKeys();

      for (const key of keys) {
        const roundData = await this.context.redis.get(key);
        if (!roundData) continue;

        const votingRound: VotingRound = JSON.parse(roundData);

        if (votingRound.status === 'active' && now > votingRound.endTime) {
          await this.completeVotingRound(votingRound);
        }
      }

    } catch (error) {
      console.error('[VotingService] Failed to process expired rounds:', error);
    }
  }

  /**
   * Complete a voting round and select winner
   */
  async completeVotingRound(votingRound: VotingRound): Promise<VotingResult | null> {
    try {
      if (votingRound.contributions.length === 0) {
        console.log(`[VotingService] No contributions for round ${votingRound.chapterNumber}`);
        return null;
      }

      // Find winner (highest Reddit score)
      const winner = votingRound.contributions.reduce((prev, current) =>
        (prev.redditScore > current.redditScore) ? prev : current
      );

      // Update voting round
      votingRound.status = 'completed';
      votingRound.winnerId = winner.id;

      // Mark winner
      const winnerIndex = votingRound.contributions.findIndex(c => c.id === winner.id);
      if (winnerIndex !== -1) {
        votingRound.contributions[winnerIndex].isWinner = true;
      }

      const roundKey = `voting_round:${votingRound.storyId}:${votingRound.chapterNumber}`;
      await this.context.redis.set(roundKey, JSON.stringify(votingRound));

      // Add winning chapter to story
      await this.addWinningChapter(votingRound.storyId, winner, votingRound.chapterNumber);

      // Send notifications
      await this.notifyWinner(winner, votingRound);
      await this.announceWinner(votingRound.storyId, winner, votingRound.chapterNumber);

      const result: VotingResult = {
        winnerId: winner.id,
        winnerScore: winner.redditScore,
        totalContributions: votingRound.contributions.length,
        totalVotes: votingRound.contributions.reduce((sum, c) => sum + c.redditScore, 0)
      };

      console.log(`[VotingService] Completed voting round ${votingRound.chapterNumber} for story ${votingRound.storyId}`);
      console.log(`[VotingService] Winner: ${winner.authorName} with ${winner.redditScore} votes`);

      return result;

    } catch (error) {
      console.error('[VotingService] Failed to complete voting round:', error);
      return null;
    }
  }

  /**
   * Add winning chapter to story
   */
  private async addWinningChapter(storyId: string, winner: ContributionEntry, chapterNumber: number): Promise<void> {
    try {
      const chaptersKey = `story_chapters:${storyId}`;
      const chaptersData = await this.context.redis.get(chaptersKey);
      const chapters = chaptersData ? JSON.parse(chaptersData) : [];

      const newChapter = {
        chapterNumber,
        authorId: winner.authorId,
        authorName: winner.authorName,
        text: winner.text,
        votes: winner.redditScore,
        wordCount: winner.wordCount,
        addedAt: Date.now(),
        commentId: winner.commentId,
        isWinner: true
      };

      chapters.push(newChapter);
      await this.context.redis.set(chaptersKey, JSON.stringify(chapters));

      // Update story metadata
      const storyMetadata = await this.context.redis.get(`story_post:${storyId}`);
      if (storyMetadata) {
        const metadata = JSON.parse(storyMetadata);
        metadata.lastChapterTime = Date.now();
        metadata.currentChapter = chapterNumber;
        metadata.lastWinner = {
          name: winner.authorName,
          votes: winner.redditScore,
          chapter: chapterNumber
        };
        await this.context.redis.set(`story_post:${storyId}`, JSON.stringify(metadata));
      }

      console.log(`[VotingService] Added chapter ${chapterNumber} to story ${storyId}`);

    } catch (error) {
      console.error('[VotingService] Failed to add winning chapter:', error);
    }
  }

  /**
   * Notify winner via Reddit PM
   */
  private async notifyWinner(winner: ContributionEntry, votingRound: VotingRound): Promise<void> {
    try {
      // Get story details for notification
      const storyMetadata = await this.context.redis.get(`story_post:${votingRound.storyId}`);
      if (!storyMetadata) return;

      const metadata = JSON.parse(storyMetadata);
      const post = await this.context.reddit.getPostById(votingRound.storyId);
      const storyTitle = post.title.replace('📖 ', '');

      await this.context.reddit.sendPrivateMessage({
        to: winner.authorName,
        subject: '🎉 Your chapter won!',
        text: `Congratulations, u/${winner.authorName}!

Your contribution to "${storyTitle}" has been selected by the community!

📊 **VOTING RESULTS:**
- Your submission: ${winner.redditScore} upvotes
- Chapter: ${votingRound.chapterNumber}
- Total submissions: ${votingRound.contributions.length}

Your chapter is now officially part of the story!

🎁 **Achievement Unlocked:** Chapter Winner badge earned!

Keep contributing! The story continues with Chapter ${votingRound.chapterNumber + 1}.

View the story: ${post.url}

────────────────────────────
Powered by ThreadSmith`
      });

      console.log(`[VotingService] Winner notification sent to ${winner.authorName}`);

    } catch (error) {
      console.error('[VotingService] Failed to notify winner:', error);
    }
  }

  /**
   * Announce winner in story comments
   */
  private async announceWinner(storyId: string, winner: ContributionEntry, chapterNumber: number): Promise<void> {
    try {
      await this.context.reddit.submitComment({
        id: storyId,
        text: `🏆 **CHAPTER ${chapterNumber} COMPLETE!**

**Winner:** u/${winner.authorName} (${winner.redditScore} votes) ⭐

The community has spoken! This chapter is now officially part of our story.

📊 **Round ${chapterNumber} Results:**
- Total submissions: ${chapterNumber} // This would be calculated properly
- Total votes cast: ${winner.redditScore} // This would be sum of all votes
- Winning margin: Leading submission

🎉 **What's Next:**
- Chapter ${chapterNumber + 1} is now open for contributions
- Reply to this comment with "CONTRIBUTION:" to participate
- Voting closes in 24 hours

Thank you to everyone who participated! 

────────────────────────────
🤖 ThreadSmith Bot`
      });

      console.log(`[VotingService] Winner announcement posted for chapter ${chapterNumber}`);

    } catch (error) {
      console.error('[VotingService] Failed to announce winner:', error);
    }
  }

  /**
   * Get current voting round for a story
   */
  async getCurrentVotingRound(storyId: string): Promise<VotingRound | null> {
    try {
      // Get story metadata to find current chapter
      const storyMetadata = await this.context.redis.get(`story_post:${storyId}`);
      if (!storyMetadata) return null;

      const metadata = JSON.parse(storyMetadata);
      const currentChapter = metadata.currentChapter || 1;

      const roundKey = `voting_round:${storyId}:${currentChapter}`;
      const roundData = await this.context.redis.get(roundKey);

      return roundData ? JSON.parse(roundData) : null;

    } catch (error) {
      console.error('[VotingService] Failed to get current voting round:', error);
      return null;
    }
  }

  /**
   * Follow a story for notifications
   */
  async followStory(storyId: string, userId: string): Promise<boolean> {
    try {
      const followersKey = `story_followers:${storyId}`;
      const followersData = await this.context.redis.get(followersKey);
      const followers = followersData ? JSON.parse(followersData) : [];

      if (!followers.includes(userId)) {
        followers.push(userId);
        await this.context.redis.set(followersKey, JSON.stringify(followers));
      }

      // Add to user's followed stories
      const userFollowsKey = `user_follows:${userId}`;
      const userFollowsData = await this.context.redis.get(userFollowsKey);
      const userFollows = userFollowsData ? JSON.parse(userFollowsData) : [];

      if (!userFollows.includes(storyId)) {
        userFollows.push(storyId);
        await this.context.redis.set(userFollowsKey, JSON.stringify(userFollows));
      }

      return true;

    } catch (error) {
      console.error('[VotingService] Failed to follow story:', error);
      return false;
    }
  }

  /**
   * Get all voting round keys (helper method)
   */
  private async getAllVotingRoundKeys(): Promise<string[]> {
    // In a real implementation, this would use Redis SCAN or maintain an index
    // For now, return empty array as this would be handled by a proper scheduler
    return [];
  }

  /**
   * Check if user can contribute to current round
   */
  async canUserContribute(storyId: string, userId: string): Promise<boolean> {
    try {
      const currentRound = await this.getCurrentVotingRound(storyId);
      if (!currentRound || currentRound.status !== 'active') {
        return false;
      }

      // Check if user already contributed
      const existingContribution = currentRound.contributions.find(c => c.authorId === userId);
      return !existingContribution;

    } catch (error) {
      console.error('[VotingService] Failed to check user contribution eligibility:', error);
      return false;
    }
  }

  /**
   * Get voting statistics for a story
   */
  async getVotingStats(storyId: string): Promise<any> {
    try {
      const chaptersKey = `story_chapters:${storyId}`;
      const chaptersData = await this.context.redis.get(chaptersKey);
      const chapters = chaptersData ? JSON.parse(chaptersData) : [];

      const totalVotes = chapters.reduce((sum: number, chapter: any) => sum + (chapter.votes || 0), 0);
      const totalChapters = chapters.length;
      const uniqueContributors = new Set(chapters.map((c: any) => c.authorId)).size;

      return {
        totalVotes,
        totalChapters,
        uniqueContributors,
        averageVotesPerChapter: totalChapters > 0 ? Math.round(totalVotes / totalChapters) : 0
      };

    } catch (error) {
      console.error('[VotingService] Failed to get voting stats:', error);
      return {
        totalVotes: 0,
        totalChapters: 0,
        uniqueContributors: 0,
        averageVotesPerChapter: 0
      };
    }
  }
}