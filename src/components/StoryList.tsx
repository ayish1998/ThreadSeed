// src/components/StoryList.tsx
import { Context, Devvit, useState, useAsync } from '@devvit/public-api';
import { Story } from '../types/story.js';
import { StoryService } from '../services/storyService.js';

interface StoryListProps {
  context: Context;
  userData: any;
  onSelectStory: (storyId: string) => void;
}

export const StoryList: Devvit.BlockComponent<StoryListProps> = ({ 
  context, 
  userData, 
  onSelectStory 
}) => {
  console.log(`[StoryList] Rendering for r/${userData.subreddit.name}`);
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const storyService = new StoryService(context);

  const { data: stories, loading } = useAsync(async () => {
    console.log('[StoryList] Loading stories...');
    try {
      const loadedStories = await storyService.getSubredditStories(userData.subreddit.name);
      console.log(`[StoryList] Loaded ${loadedStories.length} stories`);
      return loadedStories;
    } catch (err) {
      console.error('[StoryList] Failed to load stories:', err);
      return [];
    }
  });

  const handleCreateStory = async () => {
    if (!newStoryTitle.trim() || isCreating) return;
    
    console.log(`[StoryList] Creating story: ${newStoryTitle}`);
    setIsCreating(true);
    
    try {
      const story = await storyService.createStory(
        newStoryTitle,
        userData.user.id,
        userData.subreddit.name
      );
      
      console.log(`[StoryList] Story created: ${story.id}`);
      setNewStoryTitle('');
      setShowCreateForm(false);
      onSelectStory(story.id);
    } catch (error) {
      console.error('[StoryList] Failed to create story:', error);
    } finally {
      setIsCreating(false);
    }
  };

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

  if (loading) {
    return (
      <vstack height="100%" width="100%" alignment="middle center" padding="large">
        <text>Loading stories...</text>
      </vstack>
    );
  }

  return (
    <vstack height="100%" width="100%" padding="medium" gap="medium">
      <hstack width="100%" alignment="middle space-between">
        <vstack>
          <text size="large" weight="bold">🧵 Active Stories</text>
          <text size="small" color="#818384">
            r/{userData.subreddit.name}
          </text>
        </vstack>
        <button 
          onPress={() => {
            console.log(`[StoryList] Toggle create form: ${!showCreateForm}`);
            setShowCreateForm(!showCreateForm);
          }}
          appearance="primary"
          size="small"
        >
          {showCreateForm ? 'Cancel' : 'New Story'}
        </button>
      </hstack>

      {showCreateForm && (
        <vstack 
          backgroundColor="#1a1a1b" 
          padding="medium" 
          cornerRadius="medium"
          gap="small"
        >
          <text weight="bold">Create New Story</text>
          <textField
            placeholder="Enter story title..."
            value={newStoryTitle}
            onTextChange={setNewStoryTitle}
          />
          <hstack gap="small">
            <button 
              onPress={handleCreateStory}
              disabled={!newStoryTitle.trim() || isCreating}
              appearance="primary"
              size="small"
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
            <button 
              onPress={() => setShowCreateForm(false)}
              appearance="secondary"
              size="small"
            >
              Cancel
            </button>
          </hstack>
        </vstack>
      )}

      <vstack gap="small" grow>
        {stories && stories.length > 0 ? (
          stories.map((story: Story) => {
            const sentenceCount = story.sentences?.length || 0;
            const contributorCount = story.metadata?.totalContributors || 0;
            const lastSentence = sentenceCount > 0 ? story.sentences[sentenceCount - 1] : null;
            
            return (
              <vstack
                key={story.id}
                backgroundColor="#1a1a1b"
                padding="medium"
                cornerRadius="medium"
                onPress={() => {
                  console.log(`[StoryList] Story selected: ${story.id}`);
                  onSelectStory(story.id);
                }}
              >
                <hstack width="100%" alignment="middle space-between">
                  <text weight="bold" size="medium">{story.title}</text>
                  <text size="small" color="#818384">
                    {formatTimeAgo(story.metadata.lastActivity)}
                  </text>
                </hstack>
                
                <hstack gap="medium" alignment="start top">
                  <text size="small" color="#46d160">
                    {sentenceCount} sentences
                  </text>
                  <text size="small" color="#ff4500">
                    {contributorCount} contributors
                  </text>
                </hstack>
                
                {lastSentence && (
                  <text size="small" color="#d7dadc" maxWidth="100%">
                    Latest: "{lastSentence.content}"
                  </text>
                )}
              </vstack>
            );
          })
        ) : (
          <vstack alignment="middle center" padding="large" gap="medium">
            <text size="large">📚</text>
            <text color="#818384">No active stories yet</text>
            <text size="small" color="#818384" alignment="center">
              Be the first to start a collaborative story in this community!
            </text>
          </vstack>
        )}
      </vstack>
    </vstack>
  );
};