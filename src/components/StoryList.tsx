// src/components/StoryList.tsx
import { Context, Devvit, useState, useAsync } from '@devvit/public-api';
import { Story } from '../types/story.js';
import { StoryService } from '../services/storyService.js';
import { StoryCreation } from './StoryCreation.js';

interface StoryListProps {
  context: Context;
  userData: any;
  onSelectStory: (storyId: string) => void;
  onShowDashboard: () => void;
}

export const StoryList: Devvit.BlockComponent<StoryListProps> = ({
  context,
  userData,
  onSelectStory,
  onShowDashboard
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const storyService = new StoryService(context);

  const { data: storiesData, loading } = useAsync(async () => {
    try {
      const stories = await storyService.getSubredditStories(userData.subreddit.name);
      return JSON.stringify(stories);
    } catch (err) {
      console.error('[StoryList] Failed to load stories:', err);
      return JSON.stringify([]);
    }
  });

  const stories = storiesData ? JSON.parse(storiesData) as Story[] : [];

  const handleStoryCreated = (storyId: string) => {
    setShowCreateForm(false);
    onSelectStory(storyId);
  };

  // ✅ Show StoryCreation component when creating new story
  if (showCreateForm) {
    return (
      <StoryCreation
        context={context}
        userData={userData}
        onStoryCreated={handleStoryCreated}
        onCancel={() => setShowCreateForm(false)}
      />
    );
  }

  if (loading) {
    return (
      <vstack height="100%" width="100%" alignment="middle center" padding="large">
        <text>Loading stories...</text>
      </vstack>
    );
  }

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <vstack height="100%" width="100%" padding="medium" gap="medium">
      {/* Header - Journey 1 Entry Point */}
      <hstack width="100%" alignment="start">
        <vstack>
          <text size="large" weight="bold">📖 Active Stories</text>
          <text size="small" color="#818384">
            r/{userData.subreddit.name}
          </text>
        </vstack>
        <hstack gap="small">
          <button
            onPress={onShowDashboard}
            appearance="secondary"
            size="small"
          >
            📚 Story Hub
          </button>
          <button
            onPress={() => setShowCreateForm(true)}
            appearance="primary"
            size="small"
          >
            📖 Start New Story
          </button>
        </hstack>
      </hstack>

      {/* Story List */}
      <vstack gap="small" grow>
        {stories && stories.length > 0 ? (
          stories.map((story: Story) => {
            const sentenceCount = story.sentences?.length || 0;
            const contributorCount = story.metadata?.totalContributors || 0;
            const genre = (story.metadata as any).genre;

            return (
              <vstack
                key={story.id}
                backgroundColor="#1a1a1b"
                padding="small"
                cornerRadius="medium"
                onPress={() => onSelectStory(story.id)}
              >
                <hstack width="100%" alignment="start">
                  <hstack gap="small" alignment="middle">
                    {genre && <text size="small">{getGenreIcon(genre)}</text>}
                    <text weight="bold" size="medium">{story.title}</text>
                  </hstack>
                  <text size="small" color="#818384">
                    {formatTimeAgo(story.metadata.lastActivity)}
                  </text>
                </hstack>

                <hstack gap="medium" alignment="start top">
                  <text size="small" color="#46d160">
                    {sentenceCount} chapters
                  </text>
                  <text size="small" color="#ff4500">
                    {contributorCount} contributors
                  </text>
                  {genre && (
                    <text size="small" color="#7c3aed">
                      {genre}
                    </text>
                  )}
                  {(story.metadata as any).duration && (
                    <text size="small" color="#818384">
                      {getDurationDisplay((story.metadata as any).duration)}
                    </text>
                  )}
                </hstack>
              </vstack>
            );
          })
        ) : (
          <vstack alignment="middle center" padding="large" gap="medium">
            <text size="large">📚</text>
            <text color="#818384">No active stories yet</text>
            <text size="small" color="#818384" alignment="center">
              Be the first to start a collaborative story!
            </text>
          </vstack>
        )}
      </vstack>
    </vstack>
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

// Helper function for duration display
function getDurationDisplay(duration: string): string {
  const displays: Record<string, string> = {
    '3days': '3d',
    '7days': '7d',
    '14days': '14d',
    '30days': '30d',
    'ongoing': '∞'
  };
  return displays[duration] || '7d';
}
