import { Devvit } from '@devvit/public-api';

interface SplashScreenProps {
  onStart: () => void;
}

export const SplashScreen: Devvit.BlockComponent<SplashScreenProps> = ({ onStart }) => {
  return (
    <vstack 
      height="100%" 
      width="100%" 
      alignment="middle center"
      backgroundColor="#1a1a1b"
      padding="large"
      gap="medium"
    >
      {/* Animated logo area */}
      <vstack alignment="center middle" gap="small">
        <text size="xxlarge" weight="bold" color="#ff4500">
          🧵 StoryWeave
        </text>
        <text size="medium" color="#d7dadc">
          Collaborative Storytelling for Reddit
        </text>
      </vstack>

      {/* Feature highlights */}
      <vstack gap="small" alignment="center" padding="medium">
        <hstack gap="small" alignment="center middle">
          <text color="#46d160">✓</text>
          <text size="small" color="#d7dadc">Build stories together, one sentence at a time</text>
        </hstack>
        <hstack gap="small" alignment="center middle">
          <text color="#46d160">✓</text>
          <text size="small" color="#d7dadc">Vote on the best contributions</text>
        </hstack>
        <hstack gap="small" alignment="center middle">
          <text color="#46d160">✓</text>
          <text size="small" color="#d7dadc">Create branching narratives</text>
        </hstack>
      </vstack>

      {/* Call to action */}
      <vstack gap="medium" alignment="center">
        <button 
          onPress={onStart}
          appearance="primary"
          size="large"
        >
          Start Weaving Stories
        </button>
        
        <text size="small" color="#818384">
          Join your community in creating epic tales
        </text>
      </vstack>
    </vstack>
  );
};