import { Devvit, useState } from '@devvit/public-api';
import { StoryWeaveApp } from './components/StoryWeaveApp.js';

// Configure the app
Devvit.configure({
  redditAPI: true,
  redis: true,
});

// Add menu action for creating new stories
Devvit.addMenuItem({
  label: 'Create StoryWeave',
  location: 'subreddit',
  onPress: async (_event, context) => {
    const { reddit, ui } = context;
    
    try {
      const subreddit = await reddit.getCurrentSubreddit();
      const post = await reddit.submitPost({
        title: 'StoryWeave: Collaborative Story Building',
        subredditName: subreddit.name,
        preview: (
          <vstack height="100%" width="100%" alignment="middle center">
            <text size="large">🧵 StoryWeave</text>
            <text>Tap to start building stories together!</text>
          </vstack>
        ),
      });
      
      ui.showToast({ text: 'StoryWeave created!' });
      ui.navigateTo(post);
    } catch (error) {
      console.error('Failed to create StoryWeave post:', error);
      ui.showToast({ text: 'Failed to create StoryWeave. Please try again.' });
    }
  },
});

// Main app component
Devvit.addCustomPostType({
  name: 'StoryWeave',
  height: 'tall',
  render: (context) => {
    return <StoryWeaveApp context={context} />;
  },
});

export default Devvit;