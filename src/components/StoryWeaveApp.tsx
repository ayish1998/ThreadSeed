import { Context, Devvit, useState, useAsync } from '@devvit/public-api';
import { StoryList } from './StoryList.js';
import { StoryBuilder } from './StoryBuilder.js';
import { SplashScreen } from './SplashScreen.js';

interface StoryWeaveAppProps {
  context: Context;
}

export const StoryWeaveApp: Devvit.BlockComponent<StoryWeaveAppProps> = ({ context }) => {
  const [currentView, setCurrentView] = useState<'splash' | 'list' | 'builder'>('splash');
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  // Load user data and permissions
  const { data: userData, loading: userLoading } = useAsync(async () => {
    try {
      const user = await context.reddit.getCurrentUser();
      const subreddit = await context.reddit.getCurrentSubreddit();
      
      return {
        user,
        subreddit,
        canPost: true, // TODO: Check actual permissions
      };
    } catch (error) {
      console.error('Failed to load user data:', error);
      return null;
    }
  });

  const handleStartStory = () => {
    setCurrentView('list');
  };

  const handleSelectStory = (storyId: string) => {
    setSelectedStoryId(storyId);
    setCurrentView('builder');
  };

  const handleBackToList = () => {
    setSelectedStoryId(null);
    setCurrentView('list');
  };

  if (userLoading || !userData) {
    return (
      <vstack height="100%" width="100%" alignment="middle center">
        <text>Loading StoryWeave...</text>
      </vstack>
    );
  }

  switch (currentView) {
    case 'splash':
      return <SplashScreen onStart={handleStartStory} />;
    
    case 'list':
      return (
        <StoryList 
          context={context}
          userData={userData}
          onSelectStory={handleSelectStory}
        />
      );
    
    case 'builder':
      return (
        <StoryBuilder
          context={context}
          userData={userData}
          storyId={selectedStoryId!}
          onBack={handleBackToList}
        />
      );
    
    default:
      return <SplashScreen onStart={handleStartStory} />;
  }
};