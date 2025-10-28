// src/components/StoryHubSplashScreen.tsx - ThreadSmith Story Hub Splash Screen
import { Devvit, useAsync } from '@devvit/public-api';

interface StoryHubSplashScreenProps {
    subredditName: string;
    onComplete: () => void;
}

export const StoryHubSplashScreen: Devvit.BlockComponent<StoryHubSplashScreenProps> = ({
    subredditName,
    onComplete
}) => {
    // Auto-complete after a brief delay using useAsync
    useAsync(async () => {
        // Simulate loading delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        onComplete();
        return null;
    });

    return (
        <vstack
            height="100%"
            width="100%"
            alignment="middle center"
            backgroundColor="#0d1117"
            padding="large"
            gap="medium"
        >
            {/* Animated fade-in effect */}
            <vstack alignment="center" gap="medium">
                <text size="xxlarge">✨</text>
                <text size="large" weight="bold" color="#58a6ff">ThreadSmith</text>
                <text size="xxlarge">📚</text>

                <vstack alignment="center" gap="small">
                    <text size="large" weight="bold" color="#f0f6fc">STORY HUB</text>
                    <text size="medium" color="#7d8590">
                        Discover collaborative tales
                    </text>
                </vstack>

                <vstack alignment="center" gap="small">
                    <text size="small" color="#7d8590">by</text>
                    <text size="small" color="#58a6ff" weight="bold">r/{subredditName}</text>
                </vstack>

                <vstack alignment="center" gap="small">
                    <text size="small" color="#39d353">✨ Loading stories...</text>
                </vstack>
            </vstack>

            {/* Animated book flip effect simulation */}
            <vstack alignment="center" gap="small">
                <hstack gap="small">
                    <text size="small" color="#7c3aed">📖</text>
                    <text size="small" color="#ec4899">📚</text>
                    <text size="small" color="#0ea5e9">📖</text>
                </hstack>
                <hstack gap="small">
                    <text size="small" color="#f59e0b">📚</text>
                    <text size="small" color="#39d353">📖</text>
                    <text size="small" color="#f85149">📚</text>
                </hstack>
            </vstack>
        </vstack>
    );
};