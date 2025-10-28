// src/components/StoryThreadView.tsx - ThreadSmith Story View
import { Context, Devvit, useState, useAsync } from '@devvit/public-api';
import { VotingService } from '../services/votingService.js';
import { ExportService } from '../services/exportService.js';
import { StorySplashScreen } from './StorySplashScreen.js';

interface StoryThreadViewProps {
    context: Context;
}

interface StoryMetadata {
    title: string;
    genre: string;
    opening: string;
    constraint?: string;
    duration: string;
    wordLimit: string;
    createdBy: string;
    createdAt: number;
    status: string;
    contributors: number;
    chapters: number;
    totalWords: number;
    timeRemaining: string;
    // ThreadSmith voting and winner data
    votingActive: boolean;
    submissionCount: number;
    leadingContributor?: string;
    leadingVotes?: number;
    votingEndsIn?: string;
    lastWinner?: {
        name: string;
        votes: number;
        chapter: number;
    };
    isCompleted: boolean;
    canDownloadPDF: boolean;
}

export const StoryThreadView: Devvit.BlockComponent<StoryThreadViewProps> = ({ context }) => {
    const [showInstructions, setShowInstructions] = useState(false);
    const [showSplash, setShowSplash] = useState(false);
    const [isFirstView, setIsFirstView] = useState(true);

    // Load story metadata from the current post
    const { data: storyDataString, loading } = useAsync(async () => {
        try {
            const post = await context.reddit.getPostById(context.postId || '');
            console.log(`[StoryThreadView] Loading story data for post: ${post.id}`);

            // Get story metadata from Redis
            const metadataString = await context.redis.get(`story_post:${post.id}`);
            if (!metadataString) {
                console.error('[StoryThreadView] No story metadata found');
                return null;
            }

            const metadata = JSON.parse(metadataString);

            // Calculate dynamic stats
            const now = Date.now();
            const timeElapsed = now - metadata.createdAt;
            const durationMs = getDurationInMs(metadata.duration);
            const timeRemainingMs = durationMs === Infinity ? Infinity :
                Math.max(0, durationMs - timeElapsed);
            const timeRemaining = timeRemainingMs === Infinity ? 'Ongoing' : timeRemainingMs;

            // Get real chapter and contributor data
            const chaptersKey = `story_chapters:${post.id}`;
            const chaptersData = await context.redis.get(chaptersKey);
            const chapters = chaptersData ? JSON.parse(chaptersData) : [];

            const chapterCount = chapters.length + 1; // +1 for opening
            const contributorCount = new Set([metadata.createdBy, ...chapters.map((c: any) => c.authorId)]).size;
            const totalWords = metadata.opening.split(' ').length +
                chapters.reduce((sum: number, chapter: any) => sum + (chapter.wordCount || 0), 0);

            // ThreadSmith: Check for active voting using VotingService
            const votingService = new VotingService(context);
            const currentVotingRound = await votingService.getCurrentVotingRound(post.id);

            const votingActive = currentVotingRound?.status === 'active' || false;
            const submissionCount = currentVotingRound?.contributions.length || 0;
            let leadingContributor = undefined;
            let leadingVotes = 0;

            if (currentVotingRound && currentVotingRound.contributions.length > 0) {
                const leader = currentVotingRound.contributions.reduce((prev: any, current: any) =>
                    (prev.redditScore > current.redditScore) ? prev : current
                );
                leadingContributor = leader.authorName;
                leadingVotes = leader.redditScore;
            }

            // Get last chapter winner if available
            const lastChapter = chapters[chapters.length - 1];
            const lastWinner = lastChapter ? {
                name: lastChapter.authorName,
                votes: lastChapter.votes,
                chapter: lastChapter.chapterNumber
            } : undefined;

            // Calculate voting time remaining
            let votingEndsIn = undefined;
            if (currentVotingRound && currentVotingRound.status === 'active') {
                const remaining = currentVotingRound.endTime - now;
                const isDev = process.env.NODE_ENV === 'development';
                if (isDev) {
                    const minutes = Math.floor(remaining / (60 * 1000));
                    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
                    votingEndsIn = remaining > 0 ? `${minutes}m ${seconds}s` : 'Ending soon';
                } else {
                    const hours = Math.floor(remaining / (60 * 60 * 1000));
                    votingEndsIn = remaining > 0 ? `${hours}h` : 'Ending soon';
                }
            }

            // Check if story is completed and PDF is available
            const isCompleted = metadata.status === 'completed';
            const canDownloadPDF = isCompleted;

            const storyData: StoryMetadata = {
                title: post.title.replace('📖 ', ''),
                genre: metadata.genre,
                opening: metadata.opening,
                constraint: metadata.constraint,
                duration: metadata.duration,
                wordLimit: metadata.wordLimit,
                createdBy: metadata.createdBy,
                createdAt: metadata.createdAt,
                status: metadata.status,
                contributors: contributorCount,
                chapters: chapterCount,
                totalWords: totalWords,
                lastWinner: lastWinner,
                timeRemaining: timeRemainingMs === Infinity ? 'Ongoing' : formatTimeRemaining(timeRemainingMs),
                // ThreadSmith voting data
                votingActive,
                submissionCount,
                leadingContributor,
                leadingVotes,
                votingEndsIn,
                isCompleted,
                canDownloadPDF
            };

            // Check if this is a newly created story (less than 5 minutes old)
            const isNewStory = (now - metadata.createdAt) < (5 * 60 * 1000);
            if (isNewStory && isFirstView) {
                setShowSplash(true);
                setIsFirstView(false);
            }

            return JSON.stringify(storyData);
        } catch (error) {
            console.error('[StoryThreadView] Failed to load story data:', error);
            return null;
        }
    });

    const storyData = storyDataString ? JSON.parse(storyDataString) as StoryMetadata : null;

    const getGenreIcon = (genre: string): string => {
        const icons: Record<string, string> = {
            'fantasy': '🧙‍♂️',
            'scifi': '🚀',
            'mystery': '🔍',
            'romance': '💕',
            'horror': '👻',
            'slice_of_life': '🏠',
            'other': '📖'
        };
        return icons[genre] || '📖';
    };

    const getGenreColor = (genre: string): string => {
        const colors: Record<string, string> = {
            'fantasy': '#7c3aed',
            'scifi': '#0ea5e9',
            'mystery': '#f59e0b',
            'romance': '#ec4899',
            'horror': '#dc2626',
            'slice_of_life': '#10b981',
            'other': '#6b7280'
        };
        return colors[genre] || '#6b7280';
    };

    const handleAddChapter = () => {
        setShowInstructions(true);
    };

    const handleTakeMeThere = () => {
        context.ui.showToast({
            text: '💬 Scroll down to find the pinned comment and reply with your chapter!'
        });
        setShowInstructions(false);
    };

    const handleViewSubmissions = () => {
        // In Journey 3, this would open the voting interface
        context.ui.showToast({
            text: '🗳️ Opening voting interface...'
        });
        // Would navigate to VotingInterface component
    };

    const handleReadFullStory = () => {
        // In a real implementation, this would show the full story
        context.ui.showToast({
            text: '📖 Full story view coming soon! For now, read the chapters in the comments.'
        });
    };

    const handleFollowStory = async () => {
        try {
            const user = await context.reddit.getCurrentUser();
            if (!user) {
                context.ui.showToast({ text: '❌ Please log in to follow stories' });
                return;
            }

            const post = await context.reddit.getPostById(context.postId || '');
            const votingService = new VotingService(context);
            await votingService.followStory(post.id, user.id);

            context.ui.showToast({
                text: '🔖 Story followed! You\'ll be notified of voting updates.'
            });
        } catch (error) {
            console.error('[StoryThreadView] Failed to follow story:', error);
            context.ui.showToast({ text: '❌ Failed to follow story' });
        }
    };

    const handleDownloadPDF = async () => {
        if (!storyData) return;

        try {
            context.ui.showToast({ text: '📥 Generating PDF...' });

            const exportService = new ExportService(context);

            // Create a story object from the current data
            const story = {
                id: context.postId || '',
                title: storyData.title,
                subredditName: 'WritingPrompts',
                createdBy: 'user',
                createdAt: Date.now(),
                status: 'completed' as const,
                sentences: [], // Would be populated from chapters
                branches: [],
                metadata: {
                    totalContributors: storyData.contributors,
                    lastActivity: Date.now(),
                    tags: [],
                    isPublic: true
                },
                category: {
                    id: 'general',
                    name: 'General',
                    description: 'General stories',
                    subredditSpecific: false
                },
                description: '',
                estimatedDuration: 0,
                progressPercentage: 100,
                trendingScore: 0,
                analytics: {
                    totalViews: 0,
                    uniqueContributors: storyData.contributors,
                    averageSessionDuration: 0,
                    completionRate: 100,
                    engagementScore: 0,
                    peakConcurrentUsers: 1,
                    lastUpdated: Date.now()
                },
                crossPostData: []
            };

            const result = await exportService.exportStory(story, {
                format: 'pdf' as const,
                includeMetadata: true,
                includeContributors: true,
                includeStats: true
            });

            if (result.success) {
                context.ui.showToast({
                    text: `✅ PDF ready! "${storyData.title}.pdf"

📄 Professional formatting with cover page
👥 All contributors credited
📊 Complete story statistics

Download starting...`
                });
            } else {
                context.ui.showToast({
                    text: `❌ PDF generation failed: ${result.error}`
                });
            }
        } catch (error) {
            console.error('[StoryThreadView] Failed to generate PDF:', error);
            context.ui.showToast({ text: '❌ Failed to generate PDF' });
        }
    };

    if (loading) {
        return (
            <vstack height="100%" width="100%" alignment="middle center" padding="large">
                <text size="large">Loading story...</text>
            </vstack>
        );
    }

    if (!storyData) {
        return (
            <vstack height="100%" width="100%" alignment="middle center" padding="large" gap="medium">
                <text size="large" color="#ff4500">Story Not Found</text>
                <text color="#818384">Unable to load story data</text>
            </vstack>
        );
    }

    // Show splash screen for newly created stories
    if (showSplash) {
        return (
            <StorySplashScreen
                title={storyData.title}
                genre={storyData.genre}
                subredditName="WritingPrompts"
                onComplete={() => setShowSplash(false)}
            />
        );
    }

    // Instructions Modal
    if (showInstructions) {
        return (
            <vstack height="100%" width="100%" alignment="middle center" padding="large" gap="medium">
                <vstack
                    backgroundColor="#1a1a1b"
                    padding="large"
                    cornerRadius="medium"
                    gap="medium"
                    alignment="center"
                >
                    <text size="large" weight="bold" color="#ff4500">📝 How to Contribute</text>

                    <vstack gap="small" alignment="center">
                        <text size="medium" alignment="center">
                            To contribute, scroll down to the pinned comment and reply with your chapter!
                        </text>
                        <text size="small" color="#818384" alignment="center">
                            Remember to start with: CONTRIBUTION:
                        </text>
                    </vstack>

                    <vstack
                        backgroundColor="#262626"
                        padding="medium"
                        cornerRadius="small"
                        gap="small"
                    >
                        <text size="small" weight="bold" color="#46d160">Example Format:</text>
                        <text size="small" color="#d7dadc">
                            CONTRIBUTION:
                        </text>
                        <text size="small" color="#d7dadc">
                            The wizard's apprentice reached for the ancient tome, her fingers trembling with anticipation...
                        </text>
                    </vstack>

                    <hstack gap="medium">
                        <button
                            onPress={() => setShowInstructions(false)}
                            appearance="secondary"
                        >
                            Cancel
                        </button>
                        <button
                            onPress={handleTakeMeThere}
                            appearance="primary"
                        >
                            Take Me There
                        </button>
                    </hstack>
                </vstack>
            </vstack>
        );
    }

    // Main Story Thread View - Clean, Modern Layout
    return (
        <vstack height="100%" width="100%" backgroundColor="#0d1117" padding="small" gap="small">
            {/* Completion Banner for Finished Stories */}
            {storyData.isCompleted && (
                <vstack backgroundColor="#39d353" padding="small" cornerRadius="small" alignment="center" gap="small">
                    <text size="medium" weight="bold" color="white">🎉 STORY COMPLETE!</text>
                    <text size="small" color="white" alignment="center">
                        This collaborative masterpiece is finished! Download the PDF to keep forever.
                    </text>
                </vstack>
            )}

            {/* Header Section - Compact */}
            <hstack gap="medium" alignment="middle" padding="small" minHeight="60px">
                <text size="xlarge">{getGenreIcon(storyData.genre)}</text>
                <vstack grow gap="none">
                    <text size="large" weight="bold" color="#f0f6fc">{storyData.title}</text>
                    <hstack gap="small" alignment="start">
                        <text size="small" color={getGenreColor(storyData.genre)} weight="bold">
                            {storyData.genre.toUpperCase()}
                        </text>
                        {storyData.constraint ? (
                            <>
                                <text size="small" color="#7d8590">•</text>
                                <text size="small" color="#a5a5a5">
                                    {storyData.constraint}
                                </text>
                            </>
                        ) : null}
                    </hstack>
                </vstack>
                {storyData.isCompleted ? (
                    <vstack backgroundColor="#39d353" padding="xsmall" cornerRadius="small" alignment="center">
                        <text size="xsmall" color="white" weight="bold">✅ COMPLETE</text>
                    </vstack>
                ) : storyData.votingActive ? (
                    <vstack backgroundColor="#ff4500" padding="xsmall" cornerRadius="small" alignment="center">
                        <text size="xsmall" color="white" weight="bold">🗳️ VOTING</text>
                    </vstack>
                ) : null}
            </hstack>

            {/* Main Content Area - Side by Side Layout */}
            <hstack gap="small" grow>
                {/* Left Column - Story Content */}
                <vstack width="65%" gap="small" grow>
                    {/* Story Preview */}
                    <vstack backgroundColor="#161b22" padding="medium" cornerRadius="small" gap="small" grow>
                        <hstack alignment="middle" gap="small">
                            <text size="medium" weight="bold" color="#58a6ff">📖 Current Story</text>
                            {storyData.chapters > 1 && (
                                <button onPress={handleReadFullStory} appearance="plain" size="small">
                                    Read All ({storyData.chapters} chapters)
                                </button>
                            )}
                        </hstack>

                        {/* Show latest chapter if available, otherwise opening */}
                        {storyData.lastWinner ? (
                            <>
                                <hstack alignment="middle" gap="small">
                                    <text size="small" weight="bold" color="#39d353">📜 LATEST CHAPTER</text>
                                    <text size="small" color="#7d8590">Winner: u/{storyData.lastWinner.name} ({storyData.lastWinner.votes} votes) ⭐</text>
                                </hstack>
                                <vstack backgroundColor="#0d1117" padding="medium" cornerRadius="small" grow>
                                    <text size="medium" color="#e6edf3" wrap>
                                        {/* In real implementation, would show actual chapter text */}
                                        Lyra's fingers traced the edge of the nightmare she'd captured. It writhed in her palm, a small shadow-serpent that hissed warnings in a language older than the city itself...
                                    </text>
                                    <button onPress={handleReadFullStory} appearance="plain" size="small">
                                        [Read Full Chapter →]
                                    </button>
                                </vstack>
                            </>
                        ) : (
                            <>
                                <text size="small" weight="bold" color="#7c3aed">Chapter 1 - Opening:</text>
                                <vstack backgroundColor="#0d1117" padding="medium" cornerRadius="small" grow>
                                    <text size="medium" color="#e6edf3" wrap>
                                        {storyData.opening}
                                    </text>
                                </vstack>
                            </>
                        )}
                    </vstack>

                    {/* Action Buttons */}
                    <hstack gap="small">
                        {storyData.isCompleted ? (
                            <>
                                <button onPress={handleDownloadPDF} appearance="primary" grow>
                                    📥 Download PDF
                                </button>
                                <button onPress={handleReadFullStory} appearance="secondary" grow>
                                    📖 Read Full Story
                                </button>
                            </>
                        ) : (
                            <>
                                <button onPress={handleAddChapter} appearance="primary" grow>
                                    ✍️ Add Chapter
                                </button>
                                <button onPress={handleFollowStory} appearance="secondary" grow>
                                    🔖 Follow
                                </button>
                            </>
                        )}
                    </hstack>
                </vstack>

                {/* Right Column - Stats & Voting */}
                <vstack width="35%" gap="small">
                    {/* Stats Grid */}
                    <vstack backgroundColor="#161b22" padding="small" cornerRadius="small" gap="small">
                        <text size="small" weight="bold" color="#58a6ff">📊 Story Stats</text>
                        <hstack gap="small">
                            <vstack alignment="center" grow>
                                <text size="medium" weight="bold" color="#7c3aed">{storyData.contributors}</text>
                                <text size="xsmall" color="#7d8590">Contributors</text>
                            </vstack>
                            <vstack alignment="center" grow>
                                <text size="medium" weight="bold" color="#ff4500">{storyData.chapters}</text>
                                <text size="xsmall" color="#7d8590">Chapters</text>
                            </vstack>
                        </hstack>
                        <hstack gap="small">
                            <vstack alignment="center" grow>
                                <text size="medium" weight="bold" color="#39d353">{storyData.totalWords.toLocaleString()}</text>
                                <text size="xsmall" color="#7d8590">Words</text>
                            </vstack>
                            <vstack alignment="center" grow>
                                <text size="medium" weight="bold" color="#f85149">{storyData.timeRemaining}</text>
                                <text size="xsmall" color="#7d8590">Remaining</text>
                            </vstack>
                        </hstack>
                    </vstack>

                    {/* Voting Section - Enhanced Journey 1 Display */}
                    {storyData.votingActive ? (
                        <vstack backgroundColor="#161b22" padding="small" cornerRadius="small" gap="small">
                            <text size="small" weight="bold" color="#ff4500">🗳️ VOTING ROUND {storyData.chapters}</text>
                            <text size="small" color="#7d8590">⏱️ Ends in: {storyData.votingEndsIn || '18h 32m'}</text>
                            <vstack gap="small">
                                <text size="small" color="#e6edf3">{storyData.submissionCount} submissions competing for Ch {storyData.chapters}</text>
                                <hstack alignment="middle" gap="small">
                                    <text size="small" color="#39d353" weight="bold">TOP:</text>
                                    <text size="small" color="#e6edf3" grow>
                                        {storyData.leadingContributor || 'u/FantasyFan42'}
                                    </text>
                                    <text size="small" color="#ff4500" weight="bold">
                                        {storyData.leadingVotes || 45} votes
                                    </text>
                                </hstack>
                            </vstack>
                            <button onPress={handleViewSubmissions} appearance="primary" size="small">
                                View All Submissions ↓
                            </button>
                        </vstack>
                    ) : storyData.chapters === 1 ? (
                        <vstack backgroundColor="#161b22" padding="small" cornerRadius="small" gap="small">
                            <text size="small" weight="bold" color="#58a6ff">🗳️ VOTING: Not yet active</text>
                            <text size="small" color="#7d8590">Waiting for first contributions...</text>
                            <vstack gap="small">
                                <text size="small" color="#e6edf3">• {storyData.wordLimit} words</text>
                                <text size="small" color="#e6edf3">• Stay in {storyData.genre} genre</text>
                                <text size="small" color="#e6edf3">• 24h voting period</text>
                                <text size="small" color="#e6edf3">• Most votes wins!</text>
                            </vstack>
                        </vstack>
                    ) : storyData.lastWinner ? (
                        <vstack backgroundColor="#161b22" padding="small" cornerRadius="small" gap="small">
                            <text size="small" weight="bold" color="#39d353">🏆 CHAPTER {storyData.lastWinner.chapter} COMPLETE</text>
                            <hstack alignment="middle" gap="small">
                                <text size="small" color="#7d8590">Winner:</text>
                                <text size="small" color="#39d353" weight="bold" grow>u/{storyData.lastWinner.name}</text>
                                <text size="small" color="#ff4500" weight="bold">⭐</text>
                            </hstack>
                            <text size="small" color="#7d8590">({storyData.lastWinner.votes} votes)</text>
                            <vstack gap="small">
                                <text size="small" weight="bold" color="#58a6ff">🗳️ VOTING ROUND {storyData.chapters}</text>
                                <text size="small" color="#7d8590">Accepting contributions for Ch {storyData.chapters}</text>
                                <text size="small" color="#f85149">⏱️ Next voting ends in: 23h 15m</text>
                            </vstack>
                        </vstack>
                    ) : (
                        <vstack backgroundColor="#161b22" padding="small" cornerRadius="small" gap="small">
                            <text size="small" weight="bold" color="#58a6ff">🗳️ VOTING ROUND {storyData.chapters}</text>
                            <text size="small" color="#7d8590">Accepting contributions for Ch {storyData.chapters}</text>
                            <vstack gap="small">
                                <text size="small" color="#e6edf3">• {storyData.wordLimit} words</text>
                                <text size="small" color="#e6edf3">• Stay in {storyData.genre} genre</text>
                                <text size="small" color="#e6edf3">• 24h voting period</text>
                                <text size="small" color="#e6edf3">• Most votes wins!</text>
                            </vstack>
                        </vstack>
                    )}

                    {/* Instructions */}
                    <vstack backgroundColor="#0d1117" padding="small" cornerRadius="small" gap="small" alignment="center">
                        <text size="xsmall" color="#7d8590" alignment="center">
                            💡 Scroll to pinned comment
                        </text>
                        <text size="xsmall" color="#7d8590" alignment="center">
                            Reply with "CONTRIBUTION:"
                        </text>
                    </vstack>
                </vstack>
            </hstack>
        </vstack>
    );
};

// Helper functions
function getDurationInMs(duration: string): number {
    const durationMap: Record<string, number> = {
        '3days': 3 * 24 * 60 * 60 * 1000,
        '7days': 7 * 24 * 60 * 60 * 1000,
        '14days': 14 * 24 * 60 * 60 * 1000,
        '30days': 30 * 24 * 60 * 60 * 1000,
        'ongoing': Infinity
    };
    return durationMap[duration] || durationMap['7days'];
}

function formatTimeRemaining(timeMs: number): string {
    if (timeMs === Infinity) return 'Ongoing';
    if (timeMs <= 0) return 'Ended';

    const days = Math.floor(timeMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((timeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h left`;
    return 'Ending soon';
}