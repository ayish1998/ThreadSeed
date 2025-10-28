// src/components/StoryBuilder.tsx - Journey 2: The Contributor
import { Context, Devvit, useState, useAsync } from '@devvit/public-api';
import { Story, StorySentence } from '../types/story.js';
import { StoryService } from '../services/storyService.js';
import { NotificationBanner } from './NotificationBanner.js';

interface StoryBuilderProps {
  context: Context;
  userData: any;
  storyId: string;
  onBack: () => void;
  onShowVoting: (storyId: string) => void;
}

type ContributionType = 'narrative' | 'dialogue' | 'description' | 'twist';

export const StoryBuilder: Devvit.BlockComponent<StoryBuilderProps> = ({
  context,
  userData,
  storyId,
  onBack,
  onShowVoting
}) => {
  const [newContribution, setNewContribution] = useState('');
  const [contributionType, setContributionType] = useState<ContributionType>('narrative');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFullStory, setShowFullStory] = useState(false);
  const [showNotification, setShowNotification] = useState(true);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  const storyService = new StoryService(context);

  // Load story data
  const { data: storyData, loading, error } = useAsync(async () => {
    try {
      const story = await storyService.getStory(storyId);
      return story ? JSON.stringify(story) : null;
    } catch (err) {
      console.error('Failed to load story:', err);
      return null;
    }
  });

  const story = storyData ? JSON.parse(storyData) as Story : null;

  const contributionTypes = [
    { id: 'narrative' as ContributionType, name: '📝 Narrative', description: 'Continue the story' },
    { id: 'dialogue' as ContributionType, name: '💬 Dialogue', description: 'Add character speech' },
    { id: 'description' as ContributionType, name: '🎨 Description', description: 'Paint the scene' },
    { id: 'twist' as ContributionType, name: '🔀 Plot Twist', description: 'Change direction' }
  ];

  const handleAddContribution = async () => {
    if (!newContribution.trim() || isSubmitting || !story) return;

    // Validate contribution length (100-1000 characters as per Journey 2)
    if (newContribution.length < 100 || newContribution.length > 1000) {
      return;
    }

    setIsSubmitting(true);
    try {
      await storyService.addSentence(
        storyId,
        newContribution,
        userData.user.id,
        userData.user.username || 'Anonymous'
      );

      setNewContribution('');
      setSubmissionSuccess(true);
      // Show success notification
      setTimeout(() => setSubmissionSuccess(false), 5000);
    } catch (error) {
      console.error('Failed to add contribution:', error);
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

  const getContributionTypeIcon = (type: ContributionType): string => {
    const icons = {
      narrative: '📝',
      dialogue: '💬',
      description: '🎨',
      twist: '🔀'
    };
    return icons[type] || '📝';
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
  const genre = (story.metadata as any).genre;
  const constraint = (story.metadata as any).constraint;

  // Show latest 3 chapters by default, with option to expand
  const displaySentences = showFullStory ? sentences : sentences.slice(-3);

  return (
    <vstack height="100%" width="100%" padding="medium" gap="medium">
      {/* Header with story info */}
      <hstack width="100%" alignment="start">
        <button onPress={onBack} appearance="secondary" size="small">
          ← Back
        </button>
        <vstack alignment="center" grow>
          <hstack gap="small" alignment="center">
            {genre && <text>{getGenreIcon(genre)}</text>}
            <text size="medium" weight="bold">{story.title}</text>
          </hstack>
          <text size="small" color="#818384">
            {sentenceCount} chapters • {contributorCount} contributors
          </text>
        </vstack>
        <hstack gap="small">
          <button
            onPress={() => {
              // Journey 2: Bookmark story to follow updates
              console.log(`Bookmarking story: ${storyId}`);
            }}
            appearance="secondary"
            size="small"
          >
            🔖 Follow
          </button>
          <button
            onPress={() => onShowVoting(storyId)}
            appearance="primary"
            size="small"
          >
            🗳️ Vote
          </button>
        </hstack>
      </hstack>

      {/* Journey 3: Notification System */}
      {showNotification && (
        <NotificationBanner
          type="voting_open"
          message="🗳️ New contributions ready! Help choose the next chapter for this story."
          actionText="View Voting"
          onAction={() => onShowVoting(storyId)}
          onDismiss={() => setShowNotification(false)}
        />
      )}

      {/* Journey 2: Submission Success Notification */}
      {submissionSuccess && (
        <NotificationBanner
          type="new_contribution"
          message="✅ Your contribution has been submitted to the voting pool! Check back in 24-48 hours to see if it wins."
          onDismiss={() => setSubmissionSuccess(false)}
        />
      )}

      {/* Story constraint display */}
      {constraint && (
        <vstack
          backgroundColor="#7c3aed"
          padding="small"
          cornerRadius="medium"
        >
          <text size="small" weight="bold" color="white">📋 Story Constraint:</text>
          <text size="small" color="white">{constraint}</text>
        </vstack>
      )}

      {/* Current story content - Journey 2: Expandable timeline view */}
      <vstack
        grow
        backgroundColor="#1a1a1b"
        padding="medium"
        cornerRadius="medium"
        gap="small"
      >
        <hstack width="100%" alignment="start">
          <text weight="bold" size="medium">📖 Current Story</text>
          {sentences.length > 3 && (
            <button
              onPress={() => setShowFullStory(!showFullStory)}
              appearance="plain"
              size="small"
            >
              {showFullStory ? 'Show Latest' : 'Read Full Story'}
            </button>
          )}
        </hstack>

        {sentenceCount > 0 ? (
          <vstack gap="small" maxHeight="40%">
            {!showFullStory && sentences.length > 3 && (
              <text size="small" color="#818384" alignment="center">
                ... {sentences.length - 3} earlier chapters
              </text>
            )}

            {displaySentences.map((sentence: StorySentence, index: number) => {
              // Safely access vote arrays
              const upvoters = sentence.upvoters || [];
              const downvoters = sentence.downvoters || [];
              const actualIndex = showFullStory ? index : sentences.length - 3 + index;

              return (
                <vstack key={sentence.id} width="100%" gap="small"
                  backgroundColor="#262626" padding="xsmall" cornerRadius="small">
                  <hstack gap="small" alignment="start">
                    <text size="small" color="#818384" minWidth="30px">
                      Ch.{actualIndex + 1}
                    </text>
                    <vstack grow gap="small">
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
                </vstack>
              );
            })}
          </vstack>
        ) : (
          <vstack alignment="center middle" padding="large" gap="small">
            <text size="large">✨</text>
            <text color="#818384">This story is waiting for its first chapter</text>
            <text size="small" color="#818384" alignment="center">
              Be the first to start this collaborative tale!
            </text>
          </vstack>
        )}
      </vstack>

      {/* Journey 2: Enhanced contribution interface */}
      <vstack
        backgroundColor="#1a1a1b"
        padding="medium"
        cornerRadius="medium"
        gap="medium"
      >
        <text weight="bold">✍️ Add Your Chapter</text>

        {/* Step 1: Choose contribution type */}
        <vstack gap="small">
          <text size="small" color="#818384">Choose your contribution type:</text>
          <hstack gap="small">
            {contributionTypes.map((type) => (
              <button
                key={type.id}
                onPress={() => setContributionType(type.id)}
                appearance={contributionType === type.id ? "primary" : "secondary"}
                size="small"
              >
                {type.name}
              </button>
            ))}
          </hstack>
          <text size="small" color="#818384">
            {contributionTypes.find(t => t.id === contributionType)?.description}
          </text>
        </vstack>

        {/* Step 2: Write contribution */}
        <vstack gap="small">
          <vstack backgroundColor="#262626" padding="small" cornerRadius="small" gap="small">
            <text size="small" color="#818384">
              {newContribution || `Write your ${contributionType} contribution... (100-1000 characters)`}
            </text>
            <button
              onPress={() => {
                // In a real implementation, this would open a text input modal
                const sampleText = `This is a sample ${contributionType} contribution for the story. In a real implementation, users would be able to type their own text here.`;
                setNewContribution(sampleText);
              }}
              appearance="secondary"
              size="small"
            >
              ✏️ Edit Text
            </button>
          </vstack>

          {/* Journey 2: Preview functionality */}
          {newContribution && (
            <vstack backgroundColor="#1a1a1b" padding="small" cornerRadius="small" gap="small">
              <text size="small" weight="bold" color="#7c3aed">📖 Preview in Context:</text>
              <text size="small" color="#818384">
                ...{sentences.length > 0 ? sentences[sentences.length - 1].content.slice(-50) : 'Story beginning'}...
              </text>
              <text size="small" color="#46d160">
                {newContribution}
              </text>
              <text size="small" color="#818384">
                [Next contributor continues from here...]
              </text>
            </vstack>
          )}

          <hstack gap="small" alignment="start">
            <text size="small" color={
              newContribution.length < 100 ? "#ff4500" :
                newContribution.length > 1000 ? "#ff4500" : "#46d160"
            }>
              {newContribution.length}/1000 characters
              {newContribution.length < 100 && ` (${100 - newContribution.length} more needed)`}
            </text>
            <button
              onPress={handleAddContribution}
              disabled={!newContribution.trim() || isSubmitting ||
                newContribution.length < 100 || newContribution.length > 1000}
              appearance="primary"
              size="small"
            >
              {isSubmitting ? 'Submitting...' : `${getContributionTypeIcon(contributionType)} Submit to Voting`}
            </button>
          </hstack>
        </vstack>

        {/* Journey 2: Style guide hints */}
        <vstack gap="small" backgroundColor="#262626" padding="small" cornerRadius="small">
          <text size="small" weight="bold">💡 Writing Tips:</text>
          {contributionType === 'narrative' && (
            <text size="small" color="#818384">• Advance the plot • Build on previous chapters • Keep the pace engaging</text>
          )}
          {contributionType === 'dialogue' && (
            <text size="small" color="#818384">• Give characters distinct voices • Reveal personality • Move story forward</text>
          )}
          {contributionType === 'description' && (
            <text size="small" color="#818384">• Paint vivid scenes • Use sensory details • Set the mood</text>
          )}
          {contributionType === 'twist' && (
            <text size="small" color="#818384">• Surprise readers • Stay logical • Open new possibilities</text>
          )}
        </vstack>
      </vstack>

      {/* Journey 3: Alternate Timelines Section */}
      <vstack backgroundColor="#1a1a1b" padding="medium" cornerRadius="medium" gap="small">
        <text weight="bold" size="medium">🌿 Alternate Timelines</text>
        <text size="small" color="#818384">
          Explore different story paths that didn't make it into the main timeline
        </text>
        <button appearance="secondary" size="small">
          🔍 View Alternate Chapters
        </button>
      </vstack>

      {/* Story engagement stats */}
      <hstack
        width="100%"
        alignment="center"
        backgroundColor="#1a1a1b"
        padding="small"
        cornerRadius="medium"
      >
        <vstack alignment="center">
          <text size="large" weight="bold" color="#46d160">
            {sentenceCount}
          </text>
          <text size="small" color="#818384">Chapters</text>
        </vstack>
        <vstack alignment="center">
          <text size="large" weight="bold" color="#ff4500">
            {contributorCount}
          </text>
          <text size="small" color="#818384">Contributors</text>
        </vstack>
        <vstack alignment="center">
          <text size="large" weight="bold" color="#7c3aed">
            {sentences.reduce((sum: number, s: StorySentence) => sum + (s.votes || 0), 0)}
          </text>
          <text size="small" color="#818384">Total Votes</text>
        </vstack>
      </hstack>
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