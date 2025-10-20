// src/components/StoryWeaveApp.tsx
import { Context, Devvit, useState, useAsync } from '@devvit/public-api';
import { StoryList } from './StoryList.js';
import { StoryBuilder } from './StoryBuilder.js';
import { SplashScreen } from './SplashScreen.js';

interface StoryWeaveAppProps {
  context: Context;
}

export const StoryWeaveApp: Devvit.BlockComponent<StoryWeaveAppProps> = ({ context }) => {
  console.log('[StoryWeaveApp] Component rendering');
  
  const [currentView, setCurrentView] = useState<'splash' | 'list' | 'builder'>('splash');
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  // Load user data and permissions
  const { data: userData, loading: userLoading } = useAsync(async () => {
    console.log('[StoryWeaveApp] Loading user data...');
    try {
      const user = await context.reddit.getCurrentUser();
      const subreddit = await context.reddit.getCurrentSubreddit();
      
      console.log(`[StoryWeaveApp] User loaded: ${user.username}, Subreddit: ${subreddit.name}`);
      
      return {
        user,
        subreddit,
        canPost: true,
      };
    } catch (error) {
      console.error('[StoryWeaveApp] Failed to load user data:', error);
      return null;
    }
  });

  const handleStartStory = () => {
    console.log('[StoryWeaveApp] Starting story - navigating to list');
    setCurrentView('list');
  };

  const handleSelectStory = (storyId: string) => {
    console.log(`[StoryWeaveApp] Story selected: ${storyId}`);
    setSelectedStoryId(storyId);
    setCurrentView('builder');
  };

  const handleBackToList = () => {
    console.log('[StoryWeaveApp] Navigating back to list');
    setSelectedStoryId(null);
    setCurrentView('list');
  };

  // Loading state
  if (userLoading) {
    console.log('[StoryWeaveApp] Showing loading state');
    return (
      <vstack height="100%" width="100%" alignment="middle center" padding="large">
        <text size="large">Loading StoryWeave...</text>
      </vstack>
    );
  }

  // Error state
  if (!userData) {
    console.error('[StoryWeaveApp] No user data available');
    return (
      <vstack height="100%" width="100%" alignment="middle center" padding="large" gap="medium">
        <text size="large" color="#ff4500">Failed to Load</text>
        <text color="#818384">Unable to load user data. Please refresh.</text>
      </vstack>
    );
  }

  // Main view routing
  console.log(`[StoryWeaveApp] Current view: ${currentView}`);
  
  if (currentView === 'splash') {
    return <SplashScreen onStart={handleStartStory} />;
  }
  
  if (currentView === 'list') {
    return (
      <StoryList 
        context={context}
        userData={userData}
        onSelectStory={handleSelectStory}
      />
    );
  }
  
  if (currentView === 'builder' && selectedStoryId) {
    return (
      <StoryBuilder
        context={context}
        userData={userData}
        storyId={selectedStoryId}
        onBack={handleBackToList}
      />
    );
  }

  // Fallback
  console.warn('[StoryWeaveApp] Reached fallback - showing splash screen');
  return <SplashScreen onStart={handleStartStory} />;
};