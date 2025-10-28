// src/services/contributionService.ts - Journey 2: Contribution Management
import { Context } from '@devvit/public-api';

export interface Contribution {
    id: string;
    postId: string;
    authorId: string;
    authorName: string;
    text: string;
    wordCount: number;
    timestamp: number;
    votes: number;
    status: 'active' | 'winner' | 'expired';
    redditCommentId: string;
}

export interface VotingSession {
    postId: string;
    contributions: string[]; // contribution IDs
    startTime: number;
    endTime: number;
    status: 'active' | 'completed' | 'expired';
    winnerId?: string;
    chapterNumber: number;
}

export class ContributionService {
    private context: Context;

    constructor(context: Context) {
        this.context = context;
    }

    /**
     * Store a new contribution
     */
    async storeContribution(contribution: Contribution): Promise<void> {
        try {
            await this.context.redis.set(`contribution:${contribution.id}`, JSON.stringify(contribution));

            // Add to post's contribution list
            const contributionsKey = `contributions:${contribution.postId}`;
            const existingContributions = await this.context.redis.get(contributionsKey);
            const contributions = existingContributions ? JSON.parse(existingContributions) : [];

            if (!contributions.includes(contribution.id)) {
                contributions.push(contribution.id);
                await this.context.redis.set(contributionsKey, JSON.stringify(contributions));
            }

            console.log(`[ContributionService] Stored contribution: ${contribution.id}`);
        } catch (error) {
            console.error('[ContributionService] Failed to store contribution:', error);
            throw error;
        }
    }

    /**
     * Get all contributions for a post
     */
    async getContributions(postId: string): Promise<Contribution[]> {
        try {
            const contributionsKey = `contributions:${postId}`;
            const contributionIds = await this.context.redis.get(contributionsKey);

            if (!contributionIds) {
                return [];
            }

            const ids = JSON.parse(contributionIds);
            const contributions: Contribution[] = [];

            for (const id of ids) {
                const contributionData = await this.context.redis.get(`contribution:${id}`);
                if (contributionData) {
                    contributions.push(JSON.parse(contributionData));
                }
            }

            return contributions.sort((a, b) => b.votes - a.votes);
        } catch (error) {
            console.error('[ContributionService] Failed to get contributions:', error);
            return [];
        }
    }

    /**
     * Update contribution vote count from Reddit
     */
    async updateContributionVotes(contributionId: string): Promise<void> {
        try {
            const contributionData = await this.context.redis.get(`contribution:${contributionId}`);
            if (!contributionData) return;

            const contribution = JSON.parse(contributionData) as Contribution;

            // Get current vote count from Reddit comment
            const comment = await this.context.reddit.getCommentById(contribution.redditCommentId);
            contribution.votes = comment.score || 0;

            await this.context.redis.set(`contribution:${contributionId}`, JSON.stringify(contribution));
        } catch (error) {
            console.error('[ContributionService] Failed to update votes:', error);
        }
    }

    /**
     * Start a new voting session
     */
    async startVotingSession(postId: string, chapterNumber: number): Promise<VotingSession> {
        try {
            const now = Date.now();
            const endTime = now + (24 * 60 * 60 * 1000); // 24 hours

            const session: VotingSession = {
                postId,
                contributions: [],
                startTime: now,
                endTime,
                status: 'active',
                chapterNumber
            };

            await this.context.redis.set(`voting_session:${postId}:${chapterNumber}`, JSON.stringify(session));
            console.log(`[ContributionService] Started voting session for post ${postId}, chapter ${chapterNumber}`);

            return session;
        } catch (error) {
            console.error('[ContributionService] Failed to start voting session:', error);
            throw error;
        }
    }

    /**
     * Process voting and determine winner
     */
    async processVoting(postId: string, chapterNumber: number): Promise<string | null> {
        try {
            const sessionKey = `voting_session:${postId}:${chapterNumber}`;
            const sessionData = await this.context.redis.get(sessionKey);

            if (!sessionData) {
                console.log(`[ContributionService] No voting session found for ${postId}:${chapterNumber}`);
                return null;
            }

            const session = JSON.parse(sessionData) as VotingSession;

            if (session.status !== 'active' || Date.now() < session.endTime) {
                return null; // Not ready to process
            }

            // Get all contributions and their current vote counts
            const contributions = await this.getContributions(postId);

            if (contributions.length === 0) {
                session.status = 'expired';
                await this.context.redis.set(sessionKey, JSON.stringify(session));
                return null;
            }

            // Update vote counts from Reddit
            for (const contribution of contributions) {
                await this.updateContributionVotes(contribution.id);
            }

            // Get updated contributions with current votes
            const updatedContributions = await this.getContributions(postId);

            // Find winner (highest votes)
            const winner = updatedContributions.reduce((prev, current) =>
                (current.votes > prev.votes) ? current : prev
            );

            // Update session with winner
            session.status = 'completed';
            session.winnerId = winner.id;
            await this.context.redis.set(sessionKey, JSON.stringify(session));

            // Update winner contribution status
            winner.status = 'winner';
            await this.context.redis.set(`contribution:${winner.id}`, JSON.stringify(winner));

            // Mark other contributions as expired
            for (const contribution of updatedContributions) {
                if (contribution.id !== winner.id) {
                    contribution.status = 'expired';
                    await this.context.redis.set(`contribution:${contribution.id}`, JSON.stringify(contribution));
                }
            }

            console.log(`[ContributionService] Voting completed for ${postId}:${chapterNumber}, winner: ${winner.id}`);
            return winner.id;

        } catch (error) {
            console.error('[ContributionService] Failed to process voting:', error);
            return null;
        }
    }

    /**
     * Send winner notification
     */
    async notifyWinner(winnerId: string): Promise<void> {
        try {
            const contributionData = await this.context.redis.get(`contribution:${winnerId}`);
            if (!contributionData) return;

            const contribution = JSON.parse(contributionData) as Contribution;

            // Get story metadata for context
            const storyMetadata = await this.context.redis.get(`story_post:${contribution.postId}`);
            if (!storyMetadata) return;

            const story = JSON.parse(storyMetadata);

            // Send Reddit PM to winner
            await this.context.reddit.sendPrivateMessage({
                to: contribution.authorName,
                subject: '🎉 Your chapter won!',
                text: `Congratulations! Your contribution to "${story.title}" was selected by the community!

Your chapter has been added to the main story.

📊 **Final Score:** ${contribution.votes} upvotes
🏆 **Rank:** #1 of multiple submissions
📝 **Word count:** ${contribution.wordCount} words

Keep contributing! You're helping build something amazing.

---
🤖 This message was sent by StoryWeave`
            });

            console.log(`[ContributionService] Winner notification sent to ${contribution.authorName}`);
        } catch (error) {
            console.error('[ContributionService] Failed to send winner notification:', error);
        }
    }

    /**
     * Validate contribution format and word count
     */
    validateContribution(text: string, wordLimit: string): { valid: boolean; error?: string; wordCount: number } {
        const wordCount = text.trim().split(/\s+/).length;
        const [minWords, maxWords] = wordLimit.split('-').map(Number);

        if (wordCount < minWords) {
            return {
                valid: false,
                error: `Too few words: ${wordCount}/${minWords} minimum`,
                wordCount
            };
        }

        if (wordCount > maxWords) {
            return {
                valid: false,
                error: `Too many words: ${wordCount}/${maxWords} maximum`,
                wordCount
            };
        }

        return { valid: true, wordCount };
    }

    /**
     * Extract contribution text from comment body
     */
    extractContribution(commentBody: string): string | null {
        const match = commentBody.match(/CONTRIBUTION:\s*([\s\S]*)/);
        return match ? match[1].trim() : null;
    }

    /**
     * Get active voting sessions that need processing
     */
    async getExpiredVotingSessions(): Promise<VotingSession[]> {
        try {
            // In a real implementation, you'd maintain an index of active sessions
            // For now, this is a placeholder
            return [];
        } catch (error) {
            console.error('[ContributionService] Failed to get expired sessions:', error);
            return [];
        }
    }
}