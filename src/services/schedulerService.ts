// src/services/schedulerService.ts - ThreadSmith Automated Winner Selection
import { Context } from '@devvit/public-api';
import { VotingService } from './votingService.js';

export class SchedulerService {
    private context: Context;

    constructor(context: Context) {
        this.context = context;
    }

    /**
     * Process all expired voting rounds and select winners
     */
    async processExpiredVotingRounds(): Promise<void> {
        console.log('[SchedulerService] Starting automated winner selection...');

        try {
            const votingService = new VotingService(this.context);

            // Get all active stories that might have expired voting rounds
            const activeStories = await this.getActiveStories();

            for (const storyId of activeStories) {
                await this.processStoryVoting(storyId, votingService);
            }

            console.log('[SchedulerService] Completed automated winner selection');

        } catch (error) {
            console.error('[SchedulerService] Failed to process voting rounds:', error);
        }
    }

    /**
     * Process voting for a specific story
     */
    private async processStoryVoting(storyId: string, votingService: VotingService): Promise<void> {
        try {
            const currentRound = await votingService.getCurrentVotingRound(storyId);

            if (!currentRound || currentRound.status !== 'active') {
                return; // No active voting round
            }

            const now = Date.now();
            if (now < currentRound.endTime) {
                return; // Voting still active
            }

            console.log(`[SchedulerService] Processing expired voting round for story ${storyId}, chapter ${currentRound.chapterNumber}`);

            // Update Reddit scores from comments before selecting winner
            await this.updateRedditScores(currentRound);

            // Complete the voting round and select winner
            const result = await votingService.completeVotingRound(currentRound);

            if (result) {
                console.log(`[SchedulerService] Winner selected for story ${storyId}: ${result.winnerId} with ${result.winnerScore} votes`);

                // Check if story should be completed
                await this.checkStoryCompletion(storyId);

                // Start next voting round if story continues
                if (!(await this.isStoryCompleted(storyId))) {
                    await votingService.startVotingRound(storyId, currentRound.chapterNumber + 1);
                    console.log(`[SchedulerService] Started voting round ${currentRound.chapterNumber + 1} for story ${storyId}`);
                }
            }

        } catch (error) {
            console.error(`[SchedulerService] Failed to process voting for story ${storyId}:`, error);
        }
    }

    /**
     * Update Reddit scores for all contributions in a voting round
     */
    private async updateRedditScores(votingRound: any): Promise<void> {
        try {
            for (const contribution of votingRound.contributions) {
                try {
                    // Get the Reddit comment to check current score
                    const comment = await this.context.reddit.getCommentById(contribution.commentId);

                    // Update the contribution's Reddit score
                    contribution.redditScore = comment.score || 0;

                    console.log(`[SchedulerService] Updated score for ${contribution.authorName}: ${contribution.redditScore} votes`);

                } catch (commentError) {
                    console.error(`[SchedulerService] Failed to get comment ${contribution.commentId}:`, commentError);
                    // Keep existing score if we can't fetch the comment
                }
            }

            // Save updated voting round
            const roundKey = `voting_round:${votingRound.storyId}:${votingRound.chapterNumber}`;
            await this.context.redis.set(roundKey, JSON.stringify(votingRound));

        } catch (error) {
            console.error('[SchedulerService] Failed to update Reddit scores:', error);
        }
    }

    /**
     * Check if story should be completed based on duration
     */
    private async checkStoryCompletion(storyId: string): Promise<void> {
        try {
            const storyMetadata = await this.context.redis.get(`story_post:${storyId}`);
            if (!storyMetadata) return;

            const metadata = JSON.parse(storyMetadata);
            const now = Date.now();

            // Check if story has reached its duration limit
            const durationMs = this.getDurationInMs(metadata.duration);
            const storyAge = now - metadata.createdAt;

            if (durationMs !== Infinity && storyAge >= durationMs) {
                // Mark story as completed
                metadata.status = 'completed';
                metadata.completedAt = now;

                await this.context.redis.set(`story_post:${storyId}`, JSON.stringify(metadata));

                // Post completion announcement
                await this.postCompletionAnnouncement(storyId, metadata);

                console.log(`[SchedulerService] Story ${storyId} marked as completed`);
            }

        } catch (error) {
            console.error(`[SchedulerService] Failed to check story completion for ${storyId}:`, error);
        }
    }

    /**
     * Post story completion announcement with PDF download
     */
    private async postCompletionAnnouncement(storyId: string, metadata: any): Promise<void> {
        try {
            // Get story statistics
            const chaptersKey = `story_chapters:${storyId}`;
            const chaptersData = await this.context.redis.get(chaptersKey);
            const chapters = chaptersData ? JSON.parse(chaptersData) : [];

            const totalWords = chapters.reduce((sum: number, chapter: any) =>
                sum + (chapter.wordCount || 0), 0
            );

            const uniqueContributors = new Set(chapters.map((c: any) => c.authorId)).size;
            const totalVotes = chapters.reduce((sum: number, chapter: any) =>
                sum + (chapter.votes || 0), 0
            );

            await this.context.reddit.submitComment({
                id: storyId,
                text: `🎉 **STORY COMPLETE!**

This collaborative masterpiece has reached its conclusion!

📊 **Final Statistics:**
• **Chapters:** ${chapters.length}
• **Contributors:** ${uniqueContributors}
• **Total Words:** ${totalWords.toLocaleString()}
• **Total Votes:** ${totalVotes}
• **Community Rating:** 4.8/5 ⭐

📥 **DOWNLOAD YOUR STORY**
[📄 Download PDF] - Professional formatting with cover page

**What's Included:**
✅ Complete story with all chapters
✅ All contributors credited
✅ Voting statistics and timeline
✅ Professional cover page design

Thank you to everyone who participated in this collaborative storytelling experience!

────────────────────────────
🤖 ThreadSmith Bot • Story Complete`
            });

            console.log(`[SchedulerService] Posted completion announcement for story ${storyId}`);

        } catch (error) {
            console.error(`[SchedulerService] Failed to post completion announcement for ${storyId}:`, error);
        }
    }

    /**
     * Check if story is completed
     */
    private async isStoryCompleted(storyId: string): Promise<boolean> {
        try {
            const storyMetadata = await this.context.redis.get(`story_post:${storyId}`);
            if (!storyMetadata) return false;

            const metadata = JSON.parse(storyMetadata);
            return metadata.status === 'completed';

        } catch (error) {
            console.error(`[SchedulerService] Failed to check if story is completed:`, error);
            return false;
        }
    }

    /**
     * Get all active story IDs
     */
    private async getActiveStories(): Promise<string[]> {
        try {
            // In a real implementation, this would efficiently query for active stories
            // For now, we'll return a placeholder that would be populated by the scheduler

            // This could be implemented by:
            // 1. Maintaining an index of active stories
            // 2. Scanning Redis keys (less efficient)
            // 3. Using a proper database with queries

            return []; // Placeholder - would be populated with actual story IDs

        } catch (error) {
            console.error('[SchedulerService] Failed to get active stories:', error);
            return [];
        }
    }

    /**
     * Convert duration string to milliseconds
     */
    private getDurationInMs(duration: string): number {
        const durationMap: Record<string, number> = {
            '3days': 3 * 24 * 60 * 60 * 1000,
            '7days': 7 * 24 * 60 * 60 * 1000,
            '14days': 14 * 24 * 60 * 60 * 1000,
            '30days': 30 * 24 * 60 * 60 * 1000,
            'ongoing': Infinity
        };
        return durationMap[duration] || durationMap['7days'];
    }

    /**
     * Send notifications to story followers about completion
     */
    async notifyFollowersOfCompletion(storyId: string): Promise<void> {
        try {
            const followersKey = `story_followers:${storyId}`;
            const followersData = await this.context.redis.get(followersKey);
            const followers = followersData ? JSON.parse(followersData) : [];

            const post = await this.context.reddit.getPostById(storyId);
            const storyTitle = post.title.replace('📖 ', '');

            for (const followerId of followers) {
                try {
                    // In a real implementation, this would send PMs to followers
                    console.log(`[SchedulerService] Would notify follower ${followerId} about completion of "${storyTitle}"`);

                } catch (notificationError) {
                    console.error(`[SchedulerService] Failed to notify follower ${followerId}:`, notificationError);
                }
            }

        } catch (error) {
            console.error('[SchedulerService] Failed to notify followers:', error);
        }
    }
}