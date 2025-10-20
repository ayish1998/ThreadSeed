// src/main.tsx
import { Devvit } from '@devvit/public-api';
import { StoryWeaveApp } from './components/StoryWeaveApp.js';

// Configure the app
Devvit.configure({
  redditAPI: true,
  redis: true,
});

// Define the custom post type
Devvit.addCustomPostType({
  name: 'StoryWeave',
  height: 'tall',
  render: (context) => {
    console.log('[CustomPostType] Rendering StoryWeave custom post');
    try {
      return <StoryWeaveApp context={context} />;
    } catch (error) {
      console.error('[CustomPostType] Error rendering StoryWeaveApp:', error);
      return (
        <vstack height="100%" width="100%" alignment="middle center" padding="large">
          <text size="large" color="#ff4500">Error Loading StoryWeave</text>
          <text color="#818384">Please check the logs</text>
        </vstack>
      );
    }
  },
});

// Add menu action for creating new stories
Devvit.addMenuItem({
  label: '🧵 Create StoryWeave',
  location: 'subreddit',
  onPress: async (_event, context) => {
    const { reddit, ui } = context;

    console.log('[MenuItem] Create StoryWeave pressed');

    try {
      const subreddit = await reddit.getCurrentSubreddit();
      console.log(`[MenuItem] Creating post in r/${subreddit.name}`);

      // Create a custom post without a preview
      const post = await reddit.submitPost({
        title: '🧵 StoryWeave: Collaborative Story Building',
        subredditName: subreddit.name,
      });

      console.log(`[MenuItem] Post created successfully: ${post.id}`);
      ui.showToast({ text: '✅ StoryWeave created! Click to open.' });
      ui.navigateTo(post);

    } catch (error) {
      console.error('[MenuItem] Failed to create StoryWeave post:', error);
      ui.showToast({ text: '❌ Failed to create post. Check logs.' });
    }
  },
});

export default Devvit;