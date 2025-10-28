// src/components/StoryCreation.tsx
import { Context, Devvit, useState } from '@devvit/public-api';
import { StoryService, Genre, Duration } from '../services/storyService.js';

interface StoryCreationProps {
  context: Context;
  userData: any;
  onStoryCreated: (storyId: string) => void;
  onCancel: () => void;
}

export const StoryCreation: Devvit.BlockComponent<StoryCreationProps> = ({
  context,
  userData,
  onStoryCreated,
  onCancel
}) => {
  const [step, setStep] = useState<'genre' | 'opening' | 'constraints' | 'duration' | 'preview'>('genre');
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);
  const [openingText, setOpeningText] = useState('');
  const [constraint, setConstraint] = useState('');
  const [duration, setDuration] = useState<Duration>('7days');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const storyService = new StoryService(context);

  const genres: Array<{ id: Genre; name: string; icon: string; description: string }> = [
    { id: 'fantasy', name: 'Fantasy', icon: '🧙‍♂️', description: 'Magic, mythical creatures, epic quests' },
    { id: 'scifi', name: 'Sci-Fi', icon: '🚀', description: 'Space exploration, future technology' },
    { id: 'mystery', name: 'Mystery', icon: '🔍', description: 'Suspense, investigation, plot twists' },
    { id: 'romance', name: 'Romance', icon: '💕', description: 'Love stories and relationships' },
    { id: 'horror', name: 'Horror', icon: '👻', description: 'Scary tales and supernatural events' },
    { id: 'slice_of_life', name: 'Slice of Life', icon: '🏠', description: 'Everyday stories and experiences' },
    { id: 'other', name: 'Other', icon: '📖', description: 'General stories without specific themes' }
  ];

  const durations: Array<{ id: Duration; name: string; description: string }> = [
    { id: '3days', name: '3 Days', description: 'Quick collaborative story' },
    { id: '7days', name: '7 Days', description: 'Standard story duration' },
    { id: '14days', name: '14 Days', description: 'Extended storytelling' },
    { id: '30days', name: '30 Days', description: 'Long-form collaboration' },
    { id: 'ongoing', name: 'Ongoing', description: 'No time limit' }
  ];

  const handleSubmit = async () => {
    if (!selectedGenre || !openingText.trim()) return;

    setIsSubmitting(true);
    try {
      const story = await storyService.createStory(
        `${genres.find(g => g.id === selectedGenre)?.name} Story`,
        userData.user.id,
        userData.subreddit.name,
        {
          genre: selectedGenre,
          openingParagraph: openingText.trim(),
          constraint: constraint.trim() || undefined,
          duration,
          creatorUsername: userData.user.username
        }
      );

      onStoryCreated(story.id);
    } catch (error) {
      console.error('Failed to create story:', error);
      // TODO: Show error toast
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 1: Genre Selection
  if (step === 'genre') {
    return (
      <vstack height="100%" width="100%" padding="medium" gap="medium">
        <hstack width="100%" alignment="start">
          <button onPress={onCancel} appearance="secondary" size="small">
            ← Cancel
          </button>
          <vstack alignment="center" grow>
            <text size="medium" weight="bold">📖 Start New Story</text>
          </vstack>
          <spacer size="small" />
        </hstack>

        <vstack gap="small">
          <text size="large" weight="bold">Step 1: Choose Genre</text>
          <text size="small" color="#818384">
            Select the type of story you want to create
          </text>
        </vstack>

        <vstack gap="small">
          {/* First row of genres */}
          <hstack gap="small" width="100%">
            {genres.slice(0, 3).map((genre) => (
              <vstack
                key={genre.id}
                backgroundColor={selectedGenre === genre.id ? "#ff4500" : "#1a1a1b"}
                padding="small"
                cornerRadius="medium"
                onPress={() => setSelectedGenre(genre.id)}
                grow
                alignment="center"
              >
                <text size="medium">{genre.icon}</text>
                <text weight="bold" size="small" alignment="center">{genre.name}</text>
                {selectedGenre === genre.id && (
                  <text color="white" size="small">✓</text>
                )}
              </vstack>
            ))}
          </hstack>

          {/* Second row of genres */}
          <hstack gap="small" width="100%">
            {genres.slice(3, 6).map((genre) => (
              <vstack
                key={genre.id}
                backgroundColor={selectedGenre === genre.id ? "#ff4500" : "#1a1a1b"}
                padding="small"
                cornerRadius="medium"
                onPress={() => setSelectedGenre(genre.id)}
                grow
                alignment="center"
              >
                <text size="medium">{genre.icon}</text>
                <text weight="bold" size="small" alignment="center">{genre.name}</text>
                {selectedGenre === genre.id && (
                  <text color="white" size="small">✓</text>
                )}
              </vstack>
            ))}
          </hstack>
        </vstack>

        <button
          onPress={() => setStep('opening')}
          disabled={!selectedGenre}
          appearance="primary"
        >
          Next: Write Opening
        </button>
      </vstack>
    );
  }

  // Step 2: Opening Paragraph
  if (step === 'opening') {
    const charCount = openingText.length;
    const isValid = charCount >= 50 && charCount <= 500;

    return (
      <vstack height="100%" width="100%" padding="medium" gap="medium">
        <hstack width="100%" alignment="start">
          <button onPress={() => setStep('genre')} appearance="secondary" size="small">
            ← Back
          </button>
          <vstack alignment="center" grow>
            <text size="medium" weight="bold">📖 Start New Story</text>
          </vstack>
          <spacer size="small" />
        </hstack>

        <vstack gap="small">
          <text size="large" weight="bold">Step 2: Write Opening</text>
          <text size="small" color="#818384">
            Write the opening paragraph (50-500 characters)
          </text>
        </vstack>

        <vstack gap="small" grow>
          <vstack backgroundColor="#262626" padding="medium" cornerRadius="small" gap="small">
            <text size="small" color="#818384">
              {openingText || `Start your ${genres.find(g => g.id === selectedGenre)?.name.toLowerCase()} story...`}
            </text>
            <button
              onPress={() => {
                const sampleText = `In the depths of an ancient library, a young apprentice discovered a tome that would change everything. The leather-bound book seemed to pulse with an otherworldly energy, its pages whispering secrets of forgotten magic.`;
                setOpeningText(sampleText);
              }}
              appearance="secondary"
              size="small"
            >
              ✏️ Write Opening
            </button>
          </vstack>
          <hstack alignment="start">
            <text size="small" color={isValid ? "#46d160" : "#ff4500"}>
              {charCount}/500 characters {charCount < 50 ? `(${50 - charCount} more needed)` : ''}
            </text>
          </hstack>
        </vstack>

        <button
          onPress={() => setStep('constraints')}
          disabled={!isValid}
          appearance="primary"
        >
          Next: Add Constraints
        </button>
      </vstack>
    );
  }

  // Step 3: Optional Constraints
  if (step === 'constraints') {
    return (
      <vstack height="100%" width="100%" padding="medium" gap="medium">
        <hstack width="100%" alignment="start">
          <button onPress={() => setStep('opening')} appearance="secondary" size="small">
            ← Back
          </button>
          <vstack alignment="center" grow>
            <text size="medium" weight="bold">📖 Start New Story</text>
          </vstack>
          <spacer size="small" />
        </hstack>

        <vstack gap="small">
          <text size="large" weight="bold">Step 3: Add Constraints (Optional)</text>
          <text size="small" color="#818384">
            Add creative constraints or requirements for contributors
          </text>
        </vstack>

        <vstack gap="small" grow>
          <vstack backgroundColor="#262626" padding="medium" cornerRadius="small" gap="small">
            <text size="small" color="#818384">
              {constraint || "e.g., 'Must include a talking cat' or 'Victorian era setting'"}
            </text>
            <button
              onPress={() => {
                const sampleConstraint = "Every chapter must include a reference to an ancient magical artifact";
                setConstraint(sampleConstraint);
              }}
              appearance="secondary"
              size="small"
            >
              ✏️ Add Constraint
            </button>
          </vstack>

          <vstack gap="small" padding="medium" backgroundColor="#1a1a1b" cornerRadius="medium">
            <text size="small" weight="bold">💡 Constraint Ideas:</text>
            <text size="small" color="#818384">• "Every sentence must rhyme"</text>
            <text size="small" color="#818384">• "Story takes place in one room"</text>
            <text size="small" color="#818384">• "No character names allowed"</text>
            <text size="small" color="#818384">• "Must be told in second person"</text>
          </vstack>
        </vstack>

        <hstack gap="small">
          <button
            onPress={() => setStep('duration')}
            appearance="secondary"
            grow
          >
            Skip
          </button>
          <button
            onPress={() => setStep('duration')}
            appearance="primary"
            grow
          >
            Next: Set Duration
          </button>
        </hstack>
      </vstack>
    );
  }

  // Step 4: Duration Selection
  if (step === 'duration') {
    return (
      <vstack height="100%" width="100%" padding="medium" gap="medium">
        <hstack width="100%" alignment="start">
          <button onPress={() => setStep('constraints')} appearance="secondary" size="small">
            ← Back
          </button>
          <vstack alignment="center" grow>
            <text size="medium" weight="bold">📖 Start New Story</text>
          </vstack>
          <spacer size="small" />
        </hstack>

        <vstack gap="small">
          <text size="large" weight="bold">Step 4: Set Duration</text>
          <text size="small" color="#818384">
            How long should this story run?
          </text>
        </vstack>

        <vstack gap="small">
          {/* First row of durations */}
          <hstack gap="small" width="100%">
            {durations.slice(0, 2).map((dur) => (
              <vstack
                key={dur.id}
                backgroundColor={duration === dur.id ? "#ff4500" : "#1a1a1b"}
                padding="small"
                cornerRadius="medium"
                onPress={() => setDuration(dur.id)}
                grow
                alignment="center"
              >
                <text weight="bold" size="small" alignment="center">{dur.name}</text>
                <text size="small" color="#818384" alignment="center">{dur.description}</text>
                {duration === dur.id && (
                  <text color="white" size="small">✓</text>
                )}
              </vstack>
            ))}
          </hstack>

          {/* Second row of durations */}
          <hstack gap="small" width="100%">
            {durations.slice(2, 4).map((dur) => (
              <vstack
                key={dur.id}
                backgroundColor={duration === dur.id ? "#ff4500" : "#1a1a1b"}
                padding="small"
                cornerRadius="medium"
                onPress={() => setDuration(dur.id)}
                grow
                alignment="center"
              >
                <text weight="bold" size="small" alignment="center">{dur.name}</text>
                <text size="small" color="#818384" alignment="center">{dur.description}</text>
                {duration === dur.id && (
                  <text color="white" size="small">✓</text>
                )}
              </vstack>
            ))}
          </hstack>
        </vstack>

        <button
          onPress={() => setStep('preview')}
          appearance="primary"
        >
          Preview & Publish
        </button>
      </vstack>
    );
  }

  // Step 5: Preview & Publish
  if (step === 'preview') {
    const selectedGenreData = genres.find(g => g.id === selectedGenre);
    const selectedDurationData = durations.find(d => d.id === duration);

    return (
      <vstack height="100%" width="100%" padding="medium" gap="medium">
        <hstack width="100%" alignment="start">
          <button onPress={() => setStep('duration')} appearance="secondary" size="small">
            ← Back
          </button>
          <vstack alignment="center" grow>
            <text size="medium" weight="bold">📖 Start New Story</text>
          </vstack>
          <spacer size="small" />
        </hstack>

        <vstack gap="small">
          <text size="large" weight="bold">Preview & Publish</text>
          <text size="small" color="#818384">
            Review your story before publishing
          </text>
        </vstack>

        <vstack gap="medium" grow backgroundColor="#1a1a1b" padding="medium" cornerRadius="medium">
          <hstack gap="small" alignment="middle">
            <text size="large">{selectedGenreData?.icon}</text>
            <text size="medium" weight="bold">{selectedGenreData?.name || 'Unknown'} Story</text>
          </hstack>

          <vstack gap="small">
            <text size="small" weight="bold" color="#ff4500">Opening:</text>
            <text size="small">{openingText}</text>
          </vstack>

          {constraint && (
            <vstack gap="small">
              <text size="small" weight="bold" color="#7c3aed">Constraint:</text>
              <text size="small">{constraint}</text>
            </vstack>
          )}

          <vstack gap="small">
            <text size="small" weight="bold" color="#46d160">Duration:</text>
            <text size="small">{selectedDurationData?.name || 'Unknown'} - {selectedDurationData?.description || 'No description'}</text>
          </vstack>
        </vstack>

        <button
          onPress={handleSubmit}
          disabled={isSubmitting}
          appearance="primary"
        >
          {isSubmitting ? 'Creating Story...' : '🎉 Publish Story'}
        </button>
      </vstack>
    );
  }

  return null;
};