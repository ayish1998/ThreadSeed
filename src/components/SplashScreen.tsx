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
      backgroundColor="#0d1117"
      padding="medium"
      gap="medium"
    >
      {/* Hero Section */}
      <vstack alignment="center" gap="small">
        <text size="xxlarge" weight="bold" color="#f0f6fc">
          🧵 StoryWeave
        </text>
        <text size="medium" color="#7d8590">
          Collaborative Storytelling for Reddit
        </text>
      </vstack>

      {/* Features Grid */}
      <hstack gap="medium" alignment="center">
        <vstack alignment="center" backgroundColor="#161b22" padding="medium" cornerRadius="small" gap="small">
          <text size="large">📖</text>
          <text size="small" color="#f0f6fc" weight="bold">Start Stories</text>
          <text size="xsmall" color="#7d8590" alignment="center">Create with genres & constraints</text>
        </vstack>
        <vstack alignment="center" backgroundColor="#161b22" padding="medium" cornerRadius="small" gap="small">
          <text size="large">✍️</text>
          <text size="small" color="#f0f6fc" weight="bold">Add Chapters</text>
          <text size="xsmall" color="#7d8590" alignment="center">Contribute narrative & dialogue</text>
        </vstack>
        <vstack alignment="center" backgroundColor="#161b22" padding="medium" cornerRadius="small" gap="small">
          <text size="large">🗳️</text>
          <text size="small" color="#f0f6fc" weight="bold">Vote & Track</text>
          <text size="xsmall" color="#7d8590" alignment="center">Choose best contributions</text>
        </vstack>
      </hstack>

      {/* Call to Action */}
      <vstack alignment="center" gap="small">
        <button
          onPress={() => {
            console.log('[SplashScreen] Start button pressed');
            onStart();
          }}
          appearance="primary"
          size="large"
        >
          📖 Explore Stories
        </button>
        <text size="small" color="#7d8590">
          Join your community in creating epic tales
        </text>
      </vstack>
    </vstack>
  );
};