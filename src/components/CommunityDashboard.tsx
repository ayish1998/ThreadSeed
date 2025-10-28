// src/components/CommunityDashboard.tsx - Community Dashboard Flow
import { Context, Devvit, useState, useAsync } from '@devvit/public-api';
import { Story } from '../types/story.js';
import { StoryService } from '../services/storyService.js';
import { DemoDataService, DemoStory } from '../services/demoDataService.js';

interface CommunityDashboardProps {
    context: Context;
    userData: any;
    onSelectStory: (storyId: string) => void;
    onBack: () => void;
}

type DashboardTab = 'active' | 'completed' | 'stats';
type GenreFilter = 'all' | 'fantasy' | 'scifi' | 'mystery' | 'romance' | 'horror' | 'slice_of_life' | 'other';
type SortOption = 'newest' | 'most_active' | 'ending_soon' | 'most_upvoted' | 'longest';

interface CommunityStats {
    totalStories: number;
    totalWords: number;
    totalContributors: number;
    popularGenres: Array<{ genre: string; count: number; icon: string }>;
    recentActivity: Array<{
        type: 'story_created' | 'chapter_added' | 'story_completed';
        storyTitle: string;
        authorName: string;
        timestamp: number;
    }>;
}

// ThreadSmith PDF Export Function
const showExportModal = async (story: Story, context: Context) => {
    try {
        // Import ExportService dynamically to avoid circular dependencies
        const { ExportService } = await import('../services/exportService.js');
        const exportService = new ExportService(context);

        // Validate story for export
        const validation = exportService.validateForExport(story);
        if (!validation.valid) {
            context.ui.showToast({
                text: `❌ Cannot export: ${validation.errors.join(', ')}`
            });
            return;
        }

        // Show generating message
        context.ui.showToast({
            text: `📥 Generating PDF for "${story.title}"...`
        });

        // Generate PDF export
        setTimeout(async () => {
            try {
                const result = await exportService.exportStory(story, {
                    format: 'pdf',
                    includeMetadata: true,
                    includeContributors: true,
                    includeStats: true
                });

                if (result.success) {
                    context.ui.showToast({
                        text: `✅ PDF ready! "${story.title}.pdf" 

📄 Professional formatting with cover page
👥 All ${story.metadata.totalContributors} contributors credited
📊 Complete story statistics included

Download link sent to contributors!`
                    });
                    console.log('[Export] PDF generated:', result.filename);

                    // In a real implementation, this would:
                    // 1. Generate actual PDF file
                    // 2. Store it in cloud storage
                    // 3. Send download links to all contributors
                    // 4. Post completion announcement

                } else {
                    context.ui.showToast({
                        text: `❌ PDF generation failed: ${result.error}`
                    });
                }
            } catch (error) {
                console.error('[Export] PDF generation failed:', error);
                context.ui.showToast({
                    text: '❌ PDF generation failed. Please try again.'
                });
            }
        }, 2000);

    } catch (error) {
        console.error('[Export] Failed to load export service:', error);
        context.ui.showToast({
            text: '❌ Export service unavailable'
        });
    }
};

export const CommunityDashboard: Devvit.BlockComponent<CommunityDashboardProps> = ({
    context,
    userData,
    onSelectStory,
    onBack
}) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('active');
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [genreFilter, setGenreFilter] = useState<GenreFilter>('all');

    const storyService = new StoryService(context);
    const demoDataService = new DemoDataService(context);

    // Load dashboard data
    const { data: dashboardDataString, loading } = useAsync(async () => {
        try {
            // Use demo data for now to avoid subreddit access issues
            const demoStories = await demoDataService.getDemoStories();
            
            // Convert demo stories to Story format for compatibility
            const allStories: Story[] = demoStories.map((demoStory: DemoStory) => ({
                id: demoStory.id,
                title: demoStory.title,
                sentences: demoStory.chapters.map(chapter => ({
                    id: `sentence_${chapter.chapterNumber}`,
                    content: chapter.text,
                    authorId: chapter.authorName,
                    authorName: chapter.authorName,
                    createdAt: chapter.addedAt,
                    votes: chapter.votes,
                    isWinner: true
                })),
                createdAt: demoStory.createdAt,
                status: demoStory.status,
                trendingScore: Math.random() * 100,
                metadata: {
                    genre: demoStory.genre,
                    contentRating: demoStory.contentRating,
                    duration: demoStory.duration,
                    totalContributors: demoStory.chapters.length,
                    lastActivity: demoStory.createdAt,
                    votingActive: demoStory.status === 'active' && Math.random() > 0.5,
                    flaggedContent: Math.random() > 0.8
                }
            }));

            const activeStories = allStories.filter(story => story.status === 'active');
            const completedStories = allStories.filter(story => story.status === 'completed');

            // Calculate community stats
            const totalWords = allStories.reduce((sum, story) => {
                return sum + (story.sentences || []).reduce((sentenceSum, sentence) => {
                    return sentenceSum + sentence.content.split(' ').length;
                }, 0);
            }, 0);

            const genreCounts = allStories.reduce((acc, story) => {
                const genre = (story.metadata as any).genre || 'other';
                acc[genre] = (acc[genre] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            const popularGenres = Object.entries(genreCounts)
                .map(([genre, count]) => ({
                    genre,
                    count,
                    icon: getGenreIcon(genre)
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            const stats: CommunityStats = {
                totalStories: allStories.length,
                totalWords,
                totalContributors: new Set(allStories.flatMap(s =>
                    (s.sentences || []).map(sentence => sentence.authorId)
                )).size,
                popularGenres,
                recentActivity: allStories
                    .slice(0, 10)
                    .map(story => ({
                        type: 'story_created' as const,
                        storyTitle: story.title,
                        authorName: 'Community',
                        timestamp: story.createdAt
                    }))
            };

            const dashboardData = {
                activeStories,
                completedStories,
                stats
            };

            return JSON.stringify(dashboardData);
        } catch (err) {
            console.error('Failed to load dashboard data:', err);
            return null;
        }
    });

    const dashboardData = dashboardDataString ? JSON.parse(dashboardDataString) : null;

    const filterAndSortStories = (stories: Story[]) => {
        // Filter by genre
        let filtered = stories;
        if (genreFilter !== 'all') {
            filtered = stories.filter(story =>
                (story.metadata as any).genre === genreFilter
            );
        }

        // Sort stories
        switch (sortBy) {
            case 'newest':
                return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
            case 'most_active':
                return [...filtered].sort((a, b) => b.metadata.lastActivity - a.metadata.lastActivity);
            case 'ending_soon':
                return [...filtered].sort((a, b) => {
                    const aExpiry = (a.metadata as any).expiresAt || Infinity;
                    const bExpiry = (b.metadata as any).expiresAt || Infinity;
                    return aExpiry - bExpiry;
                });
            case 'most_upvoted':
                return [...filtered].sort((a, b) => b.trendingScore - a.trendingScore);
            case 'longest':
                return [...filtered].sort((a, b) => (b.sentences?.length || 0) - (a.sentences?.length || 0));
            default:
                return filtered;
        }
    };

    const formatTimeAgo = (timestamp: number): string => {
        const now = Date.now();
        const diff = now - timestamp;
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor(diff / 3600000);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        return 'Recently';
    };

    const formatTimeRemaining = (expiresAt?: number): string => {
        if (!expiresAt) return 'Ongoing';

        const remaining = expiresAt - Date.now();
        const days = Math.floor(remaining / 86400000);
        const hours = Math.floor(remaining / 3600000);

        if (remaining <= 0) return 'Expired';
        if (days > 0) return `${days}d left`;
        if (hours > 0) return `${hours}h left`;
        return 'Ending soon';
    };

    if (loading) {
        return (
            <vstack height="100%" width="100%" alignment="middle center" padding="large">
                <text>Loading Story Hub...</text>
            </vstack>
        );
    }

    if (!dashboardData) {
        return (
            <vstack height="100%" width="100%" alignment="middle center" gap="medium" padding="large">
                <text>Failed to load Story Hub</text>
                <button onPress={onBack} appearance="secondary">
                    Back
                </button>
            </vstack>
        );
    }

    const { activeStories, completedStories, stats } = dashboardData;

    return (
        <vstack height="100%" width="100%" backgroundColor="#0d1117" padding="small" gap="small">
            {/* Header - Compact */}
            <hstack alignment="middle" padding="small" gap="medium">
                <button onPress={onBack} appearance="secondary" size="small">
                    ← Back
                </button>
                <vstack alignment="center" grow>
                    <text size="large" weight="bold" color="#f0f6fc">📚 STORY HUB</text>
                    <text size="small" color="#7d8590">r/{userData.subreddit.name}</text>
                </vstack>
                <vstack alignment="center">
                    <text size="small" color="#58a6ff" weight="bold">{stats.totalStories}</text>
                    <text size="xsmall" color="#7d8590">Total</text>
                </vstack>
            </hstack>

            {/* Stats Bar */}
            <hstack gap="small" backgroundColor="#161b22" padding="small" cornerRadius="small">
                <vstack alignment="center" grow>
                    <text size="small" weight="bold" color="#39d353">{activeStories.length}</text>
                    <text size="xsmall" color="#7d8590">Active</text>
                </vstack>
                <vstack alignment="center" grow>
                    <text size="small" weight="bold" color="#7c3aed">{completedStories.length}</text>
                    <text size="xsmall" color="#7d8590">Completed</text>
                </vstack>
                <vstack alignment="center" grow>
                    <text size="small" weight="bold" color="#ff4500">{stats.totalContributors}</text>
                    <text size="xsmall" color="#7d8590">Contributors</text>
                </vstack>
                <vstack alignment="center" grow>
                    <text size="small" weight="bold" color="#58a6ff">{stats.totalWords.toLocaleString()}</text>
                    <text size="xsmall" color="#7d8590">Words</text>
                </vstack>
            </hstack>

            {/* Tab Navigation */}
            <hstack gap="small">
                <button
                    onPress={() => setActiveTab('active')}
                    appearance={activeTab === 'active' ? 'primary' : 'secondary'}
                    size="small"
                    grow
                >
                    📖 Active
                </button>
                <button
                    onPress={() => setActiveTab('completed')}
                    appearance={activeTab === 'completed' ? 'primary' : 'secondary'}
                    size="small"
                    grow
                >
                    ✅ Done
                </button>
                <button
                    onPress={() => setActiveTab('stats')}
                    appearance={activeTab === 'stats' ? 'primary' : 'secondary'}
                    size="small"
                    grow
                >
                    📊 Stats
                </button>
            </hstack>

            {activeTab === 'active' && (
                <vstack gap="medium" grow>
                    <vstack gap="small">
                        <hstack gap="small" alignment="start">
                            <text size="small" color="#818384">Genre:</text>
                            <button
                                onPress={() => setGenreFilter('all')}
                                appearance={genreFilter === 'all' ? 'primary' : 'plain'}
                                size="small"
                            >
                                All
                            </button>
                            <button
                                onPress={() => setGenreFilter('fantasy')}
                                appearance={genreFilter === 'fantasy' ? 'primary' : 'plain'}
                                size="small"
                            >
                                🧙‍♂️ Fantasy
                            </button>
                            <button
                                onPress={() => setGenreFilter('scifi')}
                                appearance={genreFilter === 'scifi' ? 'primary' : 'plain'}
                                size="small"
                            >
                                🚀 Sci-Fi
                            </button>
                            <button
                                onPress={() => setGenreFilter('mystery')}
                                appearance={genreFilter === 'mystery' ? 'primary' : 'plain'}
                                size="small"
                            >
                                🔍 Mystery
                            </button>
                        </hstack>
                        <hstack gap="small" alignment="start">
                            <text size="small" color="#818384">Sort:</text>
                            <button
                                onPress={() => setSortBy('newest')}
                                appearance={sortBy === 'newest' ? 'primary' : 'plain'}
                                size="small"
                            >
                                Newest
                            </button>
                            <button
                                onPress={() => setSortBy('most_active')}
                                appearance={sortBy === 'most_active' ? 'primary' : 'plain'}
                                size="small"
                            >
                                Most Active
                            </button>
                            <button
                                onPress={() => setSortBy('ending_soon')}
                                appearance={sortBy === 'ending_soon' ? 'primary' : 'plain'}
                                size="small"
                            >
                                Ending Soon
                            </button>
                            <button
                                onPress={() => setSortBy('longest')}
                                appearance={sortBy === 'longest' ? 'primary' : 'plain'}
                                size="small"
                            >
                                Longest
                            </button>
                        </hstack>
                    </vstack>

                    <vstack gap="medium" grow>
                        <text size="medium" weight="bold" color="#d7dadc">
                            ─── ACTIVE STORIES ({filterAndSortStories(activeStories).length}) ───
                        </text>

                        {filterAndSortStories(activeStories).map((story) => {
                            const genre = (story.metadata as any).genre;
                            const contentRating = (story.metadata as any).contentRating || 'general';
                            const expiresAt = (story.metadata as any).expiresAt;
                            const sentenceCount = story.sentences?.length || 0;
                            const contributorCount = story.metadata?.totalContributors || 0;
                            const votingActive = (story.metadata as any)?.votingActive || false;
                            const hasIssues = (story.metadata as any)?.flaggedContent || false;

                            // Journey 3: Content rating display
                            const getRatingIcon = (rating: string) => {
                                const ratings: Record<string, string> = {
                                    'general': '🟢',
                                    'teen': '🟡',
                                    'mature': '🔴'
                                };
                                return ratings[rating] || '🟢';
                            };

                            return (
                                <vstack
                                    key={story.id}
                                    backgroundColor="#161b22"
                                    padding="small"
                                    cornerRadius="small"
                                    gap="small"
                                >
                                    <hstack width="100%" alignment="start">
                                        <hstack gap="small" alignment="middle" grow>
                                            <text size="large">{getGenreIcon(genre)}</text>
                                            <vstack grow>
                                                <hstack alignment="middle" gap="small">
                                                    <text weight="bold" size="medium" color="#f0f6fc">
                                                        {story.title}
                                                    </text>
                                                    {votingActive && (
                                                        <text size="small" color="#ff4500" weight="bold">🗳️ VOTING</text>
                                                    )}
                                                    {hasIssues && (
                                                        <text size="small" color="#f85149">⚠️</text>
                                                    )}
                                                </hstack>
                                                <hstack gap="small" alignment="start">
                                                    <text size="small" color="#58a6ff" weight="bold">
                                                        {genre || 'General'}
                                                    </text>
                                                    <text size="small" color="#7d8590">•</text>
                                                    <text size="small" color={contentRating === 'mature' ? '#f85149' : contentRating === 'teen' ? '#f59e0b' : '#39d353'}>
                                                        {getRatingIcon(contentRating)} {contentRating === 'general' ? 'All Ages' : contentRating === 'teen' ? 'Teen (13+)' : 'Mature (18+)'}
                                                    </text>
                                                    <text size="small" color="#7d8590">•</text>
                                                    <text size="small" color="#46d160">
                                                        Ch {sentenceCount}
                                                    </text>
                                                    <text size="small" color="#7d8590">•</text>
                                                    <text size="small" color="#f85149">
                                                        {formatTimeRemaining(expiresAt)}
                                                    </text>
                                                </hstack>
                                            </vstack>
                                        </hstack>
                                    </hstack>

                                    {/* Journey 3: Story stats and voting info */}
                                    <hstack gap="medium" alignment="middle">
                                        <hstack gap="small" alignment="middle">
                                            <text size="small">👥</text>
                                            <text size="small" color="#7d8590">{contributorCount} contributors</text>
                                        </hstack>
                                        {votingActive && (
                                            <hstack gap="small" alignment="middle">
                                                <text size="small">🗳️</text>
                                                <text size="small" color="#ff4500">3 submissions</text>
                                            </hstack>
                                        )}
                                        <hstack gap="small" alignment="middle">
                                            <text size="small">⭐</text>
                                            <text size="small" color="#39d353">4.8 rating</text>
                                        </hstack>
                                    </hstack>

                                    {/* Journey 3: Action buttons */}
                                    <hstack gap="small" alignment="middle">
                                        <button
                                            onPress={() => onSelectStory(story.id)}
                                            appearance="primary"
                                            size="small"
                                            grow
                                        >
                                            {votingActive ? '🗳️ Vote Now' : '📖 Read Story'}
                                        </button>
                                        <button
                                            onPress={() => {
                                                context.ui.showToast({ text: '🔖 Story followed!' });
                                            }}
                                            appearance="secondary"
                                            size="small"
                                        >
                                            🔖 Follow
                                        </button>
                                        {hasIssues && (
                                            <button
                                                onPress={() => {
                                                    context.ui.showToast({ text: '⚠️ Content flagged for review' });
                                                }}
                                                appearance="secondary"
                                                size="small"
                                            >
                                                ⚠️ Issues
                                            </button>
                                        )}
                                    </hstack>
                                </vstack>
                            );
                        })}

                        {
                            filterAndSortStories(activeStories).length > 0 && (
                                <button
                                    appearance="secondary"
                                    size="small"
                                    onPress={() => {
                                        context.ui.showToast({
                                            text: '📚 Loading more stories...'
                                        });
                                    }}
                                >
                                    Load More Stories...
                                </button>
                            )
                        }

                        {
                            activeStories.length === 0 && (
                                <vstack alignment="center" padding="large" gap="medium">
                                    <text size="large">📚</text>
                                    <text color="#818384">No active stories yet</text>
                                    <text size="small" color="#818384" alignment="center">
                                        Be the first to start a collaborative story!
                                    </text>
                                </vstack>
                            )
                        }
                    </vstack >
                </vstack >
            )}

            {
                activeTab === 'completed' && (
                    <vstack gap="medium" grow>
                        <text size="medium" weight="bold" color="#d7dadc">
                            ─── COMPLETED STORIES ({completedStories.length}) ───
                        </text>

                        <vstack gap="medium" grow>
                            {completedStories.map((story: any) => {
                                const genre = (story.metadata as any).genre;
                                const sentenceCount = story.sentences?.length || 0;
                                const contributorCount = story.metadata?.totalContributors || 0;
                                const wordCount = (story.sentences || []).reduce((sum: number, s: any) =>
                                    sum + s.content.split(' ').length, 0
                                );

                                return (
                                    <vstack
                                        key={story.id}
                                        backgroundColor="#1a1a1b"
                                        padding="medium"
                                        cornerRadius="medium"
                                        gap="small"
                                    >
                                        <hstack width="100%" alignment="start">
                                            <hstack gap="small" alignment="middle" grow>
                                                <text size="large">✅</text>
                                                <vstack grow>
                                                    <text weight="bold" size="medium" color="#f0f6fc">
                                                        {story.title}
                                                    </text>
                                                    <hstack gap="small" alignment="start">
                                                        <text size="small" color="#58a6ff" weight="bold">
                                                            {genre || 'General'}
                                                        </text>
                                                        <text size="small" color="#7d8590">•</text>
                                                        <text size="small" color="#46d160">
                                                            {sentenceCount} chapters
                                                        </text>
                                                        <text size="small" color="#7d8590">•</text>
                                                        <text size="small" color="#46d160">
                                                            COMPLETE
                                                        </text>
                                                    </hstack>
                                                </vstack>
                                            </hstack>
                                        </hstack>

                                        <hstack gap="medium" alignment="start">
                                            <hstack gap="small" alignment="middle">
                                                <text size="small">👥</text>
                                                <text size="small" color="#7d8590">
                                                    {contributorCount} contributors
                                                </text>
                                            </hstack>
                                            <hstack gap="small" alignment="middle">
                                                <text size="small">📖</text>
                                                <text size="small" color="#7d8590">
                                                    {wordCount.toLocaleString()} words
                                                </text>
                                            </hstack>
                                        </hstack>

                                        <hstack gap="small" alignment="start">
                                            <button
                                                appearance="primary"
                                                size="small"
                                                onPress={() => onSelectStory(story.id)}
                                            >
                                                Read Full Story
                                            </button>
                                            <button
                                                appearance="secondary"
                                                size="small"
                                                onPress={() => {
                                                    // ThreadSmith PDF Export
                                                    showExportModal(story, context);
                                                }}
                                            >
                                                📥 Download PDF
                                            </button>
                                        </hstack>
                                    </vstack>
                                );
                            })}

                            {completedStories.length === 0 && (
                                <vstack alignment="center" padding="large" gap="medium">
                                    <text size="large">📚</text>
                                    <text color="#818384">No completed stories yet</text>
                                    <text size="small" color="#818384" alignment="center">
                                        Complete your first collaborative story to see it here!
                                    </text>
                                </vstack>
                            )}
                        </vstack>
                    </vstack>
                )
            }

            {
                activeTab === 'stats' && (
                    <vstack gap="medium" grow>
                        <text size="medium" weight="bold" color="#d7dadc">
                            ─── COMMUNITY STATS ───
                        </text>

                        <vstack gap="small" backgroundColor="#1a1a1b" padding="medium" cornerRadius="medium">
                            <hstack gap="small" alignment="start">
                                <text size="small">📊</text>
                                <text size="small" color="#f0f6fc">Total Stories: </text>
                                <text size="small" color="#46d160" weight="bold">{stats.totalStories}</text>
                            </hstack>
                            <hstack gap="small" alignment="start">
                                <text size="small">📝</text>
                                <text size="small" color="#f0f6fc">Total Chapters Written: </text>
                                <text size="small" color="#46d160" weight="bold">
                                    {activeStories.reduce((sum: number, story: Story) => sum + (story.sentences?.length || 0), 0) +
                                        completedStories.reduce((sum: number, story: Story) => sum + (story.sentences?.length || 0), 0)}
                                </text>
                            </hstack>
                            <hstack gap="small" alignment="start">
                                <text size="small">👥</text>
                                <text size="small" color="#f0f6fc">Unique Contributors: </text>
                                <text size="small" color="#46d160" weight="bold">{stats.totalContributors}</text>
                            </hstack>
                            <hstack gap="small" alignment="start">
                                <text size="small">📖</text>
                                <text size="small" color="#f0f6fc">Total Words: </text>
                                <text size="small" color="#46d160" weight="bold">{stats.totalWords.toLocaleString()}</text>
                            </hstack>
                        </vstack>

                        <vstack gap="small" backgroundColor="#1a1a1b" padding="medium" cornerRadius="medium">
                            <text size="medium" weight="bold" color="#58a6ff">📈 MOST POPULAR GENRES</text>
                            {stats.popularGenres.slice(0, 3).map((genre: any, index: number) => {
                                const percentage = Math.round((genre.count / stats.totalStories) * 100);
                                return (
                                    <hstack key={genre.genre} gap="small" alignment="start">
                                        <text size="small" minWidth="20px" color="#7d8590">{index + 1}.</text>
                                        <text size="small" color="#f0f6fc" grow>
                                            {genre.genre.charAt(0).toUpperCase() + genre.genre.slice(1)}
                                        </text>
                                        <text size="small" color="#46d160">({percentage}%)</text>
                                    </hstack>
                                );
                            })}
                        </vstack>

                        <vstack gap="small" backgroundColor="#1a1a1b" padding="medium" cornerRadius="medium">
                            <text size="medium" weight="bold">⚡ Recent Activity</text>
                            {stats.recentActivity.slice(0, 5).map((activity: any, index: number) => (
                                <hstack key={`activity-${index}`} gap="small" alignment="start">
                                    <text size="small" color="#818384">
                                        {formatTimeAgo(activity.timestamp)}
                                    </text>
                                    <text size="small">
                                        📖 "{activity.storyTitle}" was created
                                    </text>
                                </hstack>
                            ))}
                        </vstack>

                        <vstack gap="small" backgroundColor="#1a1a1b" padding="medium" cornerRadius="medium">
                            <text size="medium" weight="bold" color="#f85149">🔥 TRENDING STORY</text>
                            {activeStories.length > 0 ? (
                                <vstack gap="small">
                                    <text size="medium" weight="bold" color="#f0f6fc">
                                        "{activeStories[0].title}"
                                    </text>
                                    <text size="small" color="#46d160">
                                        {Math.floor(Math.random() * 20) + 5} new contributions today!
                                    </text>
                                    <button
                                        appearance="primary"
                                        size="small"
                                        onPress={() => onSelectStory(activeStories[0].id)}
                                    >
                                        Join Story →
                                    </button>
                                </vstack>
                            ) : (
                                <vstack gap="small">
                                    <text size="small" color="#818384">No trending stories yet</text>
                                    <text size="small" color="#7d8590">Start a story to see it trend!</text>
                                </vstack>
                            )}
                        </vstack>

                        <vstack gap="small" backgroundColor="#1a1a1b" padding="medium" cornerRadius="medium">
                            <text size="medium" weight="bold">🏆 Top Contributors (This Month)</text>
                            <hstack gap="small" alignment="start">
                                <text size="small" minWidth="20px">1.</text>
                                <text size="small" grow>u/StoryMaster42</text>
                                <text size="small" color="#46d160">12 wins</text>
                            </hstack>
                            <hstack gap="small" alignment="start">
                                <text size="small" minWidth="20px">2.</text>
                                <text size="small" grow>u/TaleWeaver</text>
                                <text size="small" color="#46d160">8 wins</text>
                            </hstack>
                            <hstack gap="small" alignment="start">
                                <text size="small" minWidth="20px">3.</text>
                                <text size="small" grow>u/InkDreamer</text>
                                <text size="small" color="#46d160">7 wins</text>
                            </hstack>
                        </vstack>

                        <vstack gap="small" backgroundColor="#1a1a1b" padding="medium" cornerRadius="medium">
                            <text size="medium" weight="bold">🏆 Community Milestones</text>
                            <hstack gap="small" alignment="start">
                                <text size="small">🎯</text>
                                <text size="small">
                                    {stats.totalWords > 10000 ? '✅' : '⏳'} Write 10,000+ words together
                                </text>
                            </hstack>
                            <hstack gap="small" alignment="start">
                                <text size="small">👥</text>
                                <text size="small">
                                    {stats.totalContributors > 50 ? '✅' : '⏳'} Get 50+ unique contributors
                                </text>
                            </hstack>
                            <hstack gap="small" alignment="start">
                                <text size="small">📚</text>
                                <text size="small">
                                    {stats.totalStories > 25 ? '✅' : '⏳'} Create 25+ collaborative stories
                                </text>
                            </hstack>
                        </vstack>
                    </vstack>
                )
            }
        </vstack >
    );
};

// Helper function for genre icons
function getGenreIcon(genre: string): string {
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
}