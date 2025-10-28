// src/components/StorySplashScreen.tsx - Journey 1: Story Creation Splash Screen
import { Devvit } from '@devvit/public-api';

interface StorySplashScreenProps {
    title: string;
    genre: string;
    subredditName: string;
    onComplete: () => void;
}

export const StorySplashScreen: Devvit.BlockComponent<StorySplashScreenProps> = ({
    title,
    genre,
    subredditName,
    onComplete
}) => {
    const getGenreIcon = (genre: string): string => {
        const icons: Record<string, string> = {
            'fantasy': '🌙',
            'scifi': '🚀',
            'mystery': '🔍',
            'romance': '💕',
            'horror': '👻',
            'slice_of_life': '🏠',
            'other': '📖'
        };
        return icons[genre] || '📖';
    };

    const getGenreColor = (genre: string): string => {
        const colors: Record<string, string> = {
            'fantasy': '#7c3aed',
            'scifi': '#0ea5e9',
            'mystery': '#f59e0b',
            'romance': '#ec4899',
            'horror': '#dc2626',
            'slice_of_life': '#10b981',
            'other': '#6b7280'
        };
        return colors[genre] || '#6b7280';
    };

    // Auto-dismiss after 1.5 seconds
    setTimeout(() => {
        onComplete();
    }, 1500);

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
                <text size="xxlarge">{getGenreIcon(genre)}</text>

                <vstack alignment="center" gap="small">
                    <text size="large" weight="bold" color="#f0f6fc">{title}</text>
                    <text size="medium" color={getGenreColor(genre)} weight="bold">
                        ⭐ {genre.toUpperCase()} ⭐
                    </text>
                </vstack>

                <vstack alignment="center" gap="small">
                    <text size="small" color="#7d8590">A collaborative story by</text>
                    <text size="small" color="#58a6ff" weight="bold">r/{subredditName}</text>
                </vstack>

                <vstack alignment="center" gap="small">
                    <text size="small" color="#39d353">✨ Loading story...</text>
                </vstack>
            </vstack>

            {/* Mystical gradient background effect simulation */}
            <vstack alignment="center">
                <text size="small" color="#7c3aed">✨</text>
                <text size="small" color="#ec4899">⭐</text>
                <text size="small" color="#0ea5e9">✨</text>
            </vstack>
        </vstack>
    );
};