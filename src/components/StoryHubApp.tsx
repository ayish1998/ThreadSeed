// src/components/StoryHubApp.tsx - Journey 4: Dedicated Story Hub Application
import { Context, Devvit, useState, useAsync } from '@devvit/public-api';
import { CommunityDashboard } from './CommunityDashboard.js';
import { StoryBuilder } from './StoryBuilder.js';
import { StoryHubSplashScreen } from './StoryHubSplashScreen.js';

interface StoryHubAppProps {
    context: Context;
}

export const StoryHubApp: Devvit.BlockComponent<StoryHubAppProps> = ({ context }) => {
    console.log('[StoryHubApp] Component rendering');

    const [currentView, setCurrentView] = useState<'dashboard' | 'story'>('dashboard');
    const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

    // Load user data and permissions
    const { data: userDataString, loading: userLoading } = useAsync(async () => {
        console.log('[StoryHubApp] Loading user data...');
        try {
            const user = await context.reddit.getCurrentUser();
            
            let subreddit;
            try {
                subreddit = await context.reddit.getCurrentSubreddit();
            } catch (subredditError) {
                console.error('[StoryHubApp] Cannot access subreddit (may be private):', subredditError);
                // Use a fallback subreddit name or handle gracefully
                subreddit = { name: 'unknown' };
            }

            console.log(`[StoryHubApp] User loaded: ${user?.username}, Subreddit: ${subreddit.name}`);

            return JSON.stringify({
                user,
                subreddit,
                canPost: true,
            });
        } catch (error) {
            console.error('[StoryHubApp] Failed to load user data:', error);
            return null;
        }
    });

    const userData = userDataString ? JSON.parse(userDataString) : null;

    const handleSelectStory = (storyId: string) => {
        console.log(`[StoryHubApp] Story selected: ${storyId}`);
        setSelectedStoryId(storyId);
        setCurrentView('story');
    };

    const handleBackToDashboard = () => {
        console.log('[StoryHubApp] Navigating back to dashboard');
        setSelectedStoryId(null);
        setCurrentView('dashboard');
    };

    // Loading state
    if (userLoading) {
        console.log('[StoryHubApp] Showing loading state');
        return (
            <vstack height="100%" width="100%" alignment="middle center" padding="large">
                <text size="large">Loading Story Hub...</text>
            </vstack>
        );
    }

    // Error state
    if (!userData) {
        console.error('[StoryHubApp] No user data available');
        return (
            <vstack height="100%" width="100%" alignment="middle center" padding="large" gap="medium">
                <text size="large" color="#ff4500">Failed to Load Story Hub</text>
                <text color="#818384">Unable to load user data. Please refresh.</text>
            </vstack>
        );
    }

    // Main view routing
    console.log(`[StoryHubApp] Current view: ${currentView}`);

    // Skip splash screen for now - go directly to dashboard

    if (currentView === 'dashboard') {
        return (
            <CommunityDashboard
                context={context}
                userData={userData}
                onSelectStory={handleSelectStory}
                onBack={() => {
                    // In a real implementation, this might navigate back to subreddit
                    context.ui.showToast({ text: '📚 Story Hub - Use browser back to return to subreddit' });
                }}
            />
        );
    }

    if (currentView === 'story' && selectedStoryId) {
        return (
            <StoryBuilder
                context={context}
                userData={userData}
                storyId={selectedStoryId}
                onBack={handleBackToDashboard}
                onShowVoting={() => {
                    // Handle voting view if needed
                    console.log('[StoryHubApp] Voting view requested');
                }}
            />
        );
    }

    // Fallback
    console.warn('[StoryHubApp] Reached fallback - showing dashboard');
    return (
        <CommunityDashboard
            context={context}
            userData={userData}
            onSelectStory={handleSelectStory}
            onBack={() => {
                context.ui.showToast({ text: '📚 Story Hub - Use browser back to return to subreddit' });
            }}
        />
    );
};