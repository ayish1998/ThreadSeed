// src/components/SplashScreen.tsx
import { Devvit } from '@devvit/public-api';

interface SplashScreenProps {
  onStart: () => void;
}

export const SplashScreen: Devvit.BlockComponent<SplashScreenProps> = ({ onStart }) => {
  console.log('[SplashScreen] Rendering splash screen');
  
  return (
    <vstack 
      height="100%" 
      width="100%" 
      alignment="middle center"
      backgroundColor="#1a1a1b"
      padding="large"
      gap="medium"
    >
      <vstack alignment="middle center" gap="small">
        <text size="xxlarge" weight="bold" color="#ff4500">
          🧵 StoryWeave
        </text>
        <text size="medium" color="#d7dadc">
          Collaborative Storytelling for Reddit
        </text>
      </vstack>

      <vstack gap="small" alignment="middle center" padding="medium">
        <hstack gap="small" alignment="middle start">
          <text color="#46d160">✓</text>
          <text size="small" color="#d7dadc">Build stories together, one sentence at a time</text>
        </hstack>
        <hstack gap="small" alignment="middle start">
          <text color="#46d160">✓</text>
          <text size="small" color="#d7dadc">Vote on the best contributions</text>
        </hstack>
        <hstack gap="small" alignment="middle start">
          <text color="#46d160">✓</text>
          <text size="small" color="#d7dadc">Create branching narratives</text>
        </hstack>
      </vstack>

      <vstack gap="medium" alignment="middle center">
        <button 
          onPress={() => {
            console.log('[SplashScreen] Start button pressed');
            onStart();
          }}
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