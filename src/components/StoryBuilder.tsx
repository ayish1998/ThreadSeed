// src/components/StoryBuilder.tsx
import { Context, Devvit, useState, useAsync } from '@devvit/public-api';
import { Story, StorySentence } from '../types/story.js';
import { StoryService } from '../services/storyService.js';

interface StoryBuilderProps {
  context: Context;
  userData: any;
  storyId: string;
  onBack: () => void;
}

export const StoryBuilder: Devvit.BlockComponent<StoryBuilderProps> = ({ 
  context, 
  userData, 
  storyId, 
  onBack 
}) => {
  const [newSentence, setNewSentence] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const storyService = new StoryService(context);

  // Load story data
  const { data: story, loading, error } = useAsync(async () => {
    try {
      return await storyService.getStory(storyId);
    } catch (err) {
      console.error('Failed to load story:', err);
      return null;
    }
  });

  const handleAddSentence = async () => {
    if (!newSentence.trim() || isSubmitting || !story) return;
    
    setIsSubmitting(true);
    try {
      await storyService.addSentence(
        storyId,
        newSentence,
        userData.user.id,
        userData.user.username || 'Anonymous'
      );
      
      setNewSentence('');
      // TODO: Refresh story data
    } catch (error) {
      console.error('Failed to add sentence:', error);
      // TODO: Show error toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (sentenceId: string, isUpvote: boolean) => {
    try {
      await storyService.voteSentence(storyId, sentenceId, userData.user.id, isUpvote);
      // TODO: Refresh story data
    } catch (error) {
      console.error('Failed to vote:', error);
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
        <text>Loading story...</text>
      </vstack>
    );
  }

  if (!story) {
    return (
      <vstack height="100%" width="100%" alignment="middle center" gap="medium" padding="large">
        <text>Story not found</text>
        <button onPress={onBack} appearance="secondary">
          Back to Stories
        </button>
      </vstack>
    );
  }

  // Safely access arrays with fallbacks
  const sentences = story.sentences || [];
  const sentenceCount = sentences.length;
  const contributorCount = story.metadata?.totalContributors || 0;

  return (
    <vstack height="100%" width="100%" padding="medium" gap="medium">
      {/* Header */}
      <hstack width="100%" alignment="space-between middle">
        <button onPress={onBack} appearance="secondary" size="small">
          ← Back
        </button>
        <vstack alignment="center">
          <text size="medium" weight="bold">{story.title}</text>
          <text size="small" color="#818384">
            {sentenceCount} sentences • {contributorCount} contributors
          </text>
        </vstack>
        <spacer size="small" />
      </hstack>

      {/* Story content */}
      <vstack 
        grow 
        backgroundColor="#1a1a1b" 
        padding="medium" 
        cornerRadius="medium"
        gap="small"
      >
        <text weight="bold" size="medium">📖 Story</text>
        
        {sentenceCount > 0 ? (
          <vstack gap="small" maxHeight="60%">
            {sentences.map((sentence: StorySentence, index: number) => {
              // Safely access vote arrays
              const upvoters = sentence.upvoters || [];
              const downvoters = sentence.downvoters || [];
              
              return (
                <hstack key={sentence.id} width="100%" gap="small" alignment="start">
                  <text size="small" color="#818384" minWidth="20px">
                    {index + 1}.
                  </text>
                  <vstack grow gap="xsmall">
                    <text size="medium">{sentence.content}</text>
                    <hstack gap="medium" alignment="start">
                      <text size="small" color="#ff4500">
                        u/{sentence.authorName}
                      </text>
                      <text size="small" color="#818384">
                        {formatTimeAgo(sentence.createdAt)}
                      </text>
                      <hstack gap="small" alignment="center">
                        <button 
                          onPress={() => handleVote(sentence.id, true)}
                          appearance="plain"
                          size="small"
                        >
                          ↑ {upvoters.length}
                        </button>
                        <button 
                          onPress={() => handleVote(sentence.id, false)}
                          appearance="plain"
                          size="small"
                        >
                          ↓ {downvoters.length}
                        </button>
                      </hstack>
                    </hstack>
                  </vstack>
                </hstack>
              );
            })}
          </vstack>
        ) : (
          <vstack alignment="center middle" padding="large" gap="small">
            <text size="large">✨</text>
            <text color="#818384">This story is waiting for its first sentence</text>
            <text size="small" color="#818384" alignment="center">
              Be the first to start this collaborative tale!
            </text>
          </vstack>
        )}
      </vstack>

      {/* Add sentence form */}
      <vstack 
        backgroundColor="#1a1a1b" 
        padding="medium" 
        cornerRadius="medium"
        gap="small"
      >
        <text weight="bold">✍️ Add Your Sentence</text>
        <textField
          placeholder="Continue the story with one sentence..."
          value={newSentence}
          onTextChange={setNewSentence}
          multiline
        />
        <hstack gap="small" alignment="space-between">
          <text size="small" color="#818384">
            {newSentence.length}/280 characters
          </text>
          <button 
            onPress={handleAddSentence}
            disabled={!newSentence.trim() || isSubmitting || newSentence.length > 280}
            appearance="primary"
            size="small"
          >
            {isSubmitting ? 'Adding...' : 'Add Sentence'}
          </button>
        </hstack>
      </vstack>

      {/* Story stats */}
      <hstack 
        width="100%" 
        alignment="space-around" 
        backgroundColor="#1a1a1b"
        padding="small"
        cornerRadius="medium"
      >
        <vstack alignment="center">
          <text size="large" weight="bold" color="#46d160">
            {sentenceCount}
          </text>
          <text size="small" color="#818384">Sentences</text>
        </vstack>
        <vstack alignment="center">
          <text size="large" weight="bold" color="#ff4500">
            {contributorCount}
          </text>
          <text size="small" color="#818384">Contributors</text>
        </vstack>
        <vstack alignment="center">
          <text size="large" weight="bold" color="#7c3aed">
            {sentences.reduce((sum, s) => sum + (s.votes || 0), 0)}
          </text>
          <text size="small" color="#818384">Total Votes</text>
        </vstack>
      </hstack>
    </vstack>
  );
};