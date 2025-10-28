// src/main.tsx - ThreadSmith Simplified Implementation
import { Devvit, Context, useAsync } from '@devvit/public-api';
import { StoryThreadView } from './components/StoryThreadView';
import { CommunityDashboard } from './components/CommunityDashboard';
import { VotingService } from './services/votingService.js';
import { ExportService } from './services/exportService.js';

// ThreadSmith Post Router - Simplified routing for story posts
const ThreadSmithRouter: Devvit.BlockComponent<{ context: Context }> = ({ context }) => {
  const { data: routeData, loading } = useAsync(async () => {
    try {
      const postId = context.postId;
      console.log(`[ThreadSmithRouter] PostId: ${postId}`);
      if (!postId) {
        console.error('[ThreadSmithRouter] No postId available');
        return 'story_hub';
      }

      const post = await context.reddit.getPostById(postId);
      console.log(`[ThreadSmithRouter] Checking post: ${post.title}`);

      // Check if this post has story metadata
      const postMetadata = await context.redis.get(`story_post:${post.id}`);
      if (postMetadata) {
        const metadata = JSON.parse(postMetadata);
        console.log(`[ThreadSmithRouter] Found metadata, postType: ${metadata.postType}`);

        if (metadata.postType === 'story_thread') {
          return 'story_thread';
        } else if (metadata.postType === 'story_hub') {
          return 'story_hub';
        }
      }

      // Check title patterns for routing
      if (post.title.includes('📚') || post.title.includes('Story Hub') || post.title.includes('Community Dashboard')) {
        console.log('[ThreadSmithRouter] Story Hub detected');
        return 'story_hub';
      }

      if (post.title.includes('📖')) {
        console.log('[ThreadSmithRouter] Story Thread detected');
        return 'story_thread';
      }

      // Default to story hub
      console.log('[ThreadSmithRouter] Default - showing Story Hub');
      return 'story_hub';

    } catch (error) {
      console.error('[ThreadSmithRouter] Failed to determine route:', error);
      return 'story_hub';
    }
  });

  if (loading) {
    return (
      <vstack height="100%" width="100%" alignment="middle center" padding="large">
        <text size="large">Loading ThreadSmith...</text>
      </vstack>
    );
  }

  console.log(`[ThreadSmithRouter] Rendering component for route: ${routeData}`);

  switch (routeData) {
    case 'story_thread':
      console.log('[ThreadSmithRouter] Rendering StoryThreadView');
      return <StoryThreadView context={context} />;
    case 'story_hub':
      console.log('[ThreadSmithRouter] Rendering CommunityDashboard');
      return <CommunityDashboard context={context} userData={{ subreddit: { name: 'WritingPrompts' } }} onSelectStory={() => { }} onBack={() => { }} />;
    default:
      console.log('[ThreadSmithRouter] Rendering CommunityDashboard (default)');
      return <CommunityDashboard context={context} userData={{ subreddit: { name: 'WritingPrompts' } }} onSelectStory={() => { }} onBack={() => { }} />;
  }
};

// ThreadSmith Story Hub Preview Component
interface StoryHubPreviewProps {
  subredditName: string;
}

const StoryHubPreview: Devvit.BlockComponent<StoryHubPreviewProps> = ({ subredditName }) => {
  return (
    <vstack
      height="100%"
      width="100%"
      alignment="middle center"
      padding="large"
      gap="medium"
      backgroundColor="#0d1117"
      cornerRadius="medium"
    >
      <text size="xxlarge">📚</text>
      <text size="xlarge" weight="bold" color="#ff4500">THREADSMITH HUB</text>
      <text size="medium" color="#d7dadc">r/{subredditName}</text>
      <text size="small" color="#818384" alignment="center">
        Collaborative storytelling community center
      </text>

      <vstack gap="small" alignment="center">
        <hstack gap="medium" alignment="center">
          <text size="small" color="#46d160">📖 Active Stories</text>
          <text size="small" color="#7c3aed">✅ Completed</text>
          <text size="small" color="#58a6ff">📊 Stats</text>
        </hstack>
        <hstack gap="medium" alignment="center">
          <text size="small" color="#f85149">🔥 Trending</text>
          <text size="small" color="#ff4500">🏆 Contributors</text>
          <text size="small" color="#46d160">📥 PDF Downloads</text>
        </hstack>
      </vstack>

      <text size="small" color="#58a6ff" weight="bold" alignment="center">
        Browse stories • Vote on chapters • Download PDFs
      </text>
    </vstack>
  );
};

// ThreadSmith Story Thread Preview Component
interface StoryThreadPreviewProps {
  title: string;
  genre: string;
  contentRating: string;
  duration: string;
  wordLimit: string;
  opening: string;
}

const StoryThreadPreview: Devvit.BlockComponent<StoryThreadPreviewProps> = ({
  title,
  genre,
  contentRating,
  duration,
  wordLimit,
  opening
}) => {
  const getGenreIcon = (genre: string): string => {
    const icons: Record<string, string> = {
      'fantasy': '🧙‍♂️',
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

  const getDurationDisplay = (duration: string): string => {
    const displays: Record<string, string> = {
      '3days': '3 days',
      '7days': '7 days',
      '14days': '14 days',
      '30days': '30 days',
      'ongoing': 'Ongoing'
    };
    return displays[duration] || '7 days';
  };

  const getContentRatingDisplay = (rating: string): { icon: string; color: string; text: string } => {
    const ratings: Record<string, { icon: string; color: string; text: string }> = {
      'general': { icon: '🟢', color: '#39d353', text: 'All Ages' },
      'teen': { icon: '🟡', color: '#f59e0b', text: 'Teen (13+)' },
      'mature': { icon: '🔴', color: '#f85149', text: 'Mature (18+)' }
    };
    return ratings[rating] || ratings['general'];
  };

  return (
    <vstack
      height="100%"
      width="100%"
      padding="medium"
      gap="medium"
      backgroundColor="#0d1117"
      cornerRadius="medium"
    >
      <hstack width="100%" alignment="start">
        <hstack gap="small" alignment="middle" grow>
          <text size="large">{getGenreIcon(genre)}</text>
          <vstack grow>
            <text size="large" weight="bold" color="#f0f6fc">{title}</text>
            <hstack gap="small" alignment="start">
              <text
                size="small"
                color={getGenreColor(genre)}
                weight="bold"
              >
                {genre.toUpperCase()}
              </text>
              <text size="small" color="#7d8590">•</text>
              <text size="small" color={getContentRatingDisplay(contentRating).color}>
                {getContentRatingDisplay(contentRating).icon} {getContentRatingDisplay(contentRating).text}
              </text>
              <text size="small" color="#7d8590">•</text>
              <text size="small" color="#f85149">
                {getDurationDisplay(duration)}
              </text>
            </hstack>
          </vstack>
        </hstack>
      </hstack>

      <vstack gap="small" backgroundColor="#161b22" padding="medium" cornerRadius="small" grow>
        <text size="small" weight="bold" color="#58a6ff">📖 THREADSMITH STORY</text>
        <vstack backgroundColor="#0d1117" padding="medium" cornerRadius="small" grow>
          <text size="medium" color="#e6edf3" wrap>
            "{opening.length > 150 ? opening.substring(0, 150) + '...' : opening}"
          </text>
        </vstack>
        <hstack alignment="center" gap="small">
          <text size="small" color="#39d353">👥 Waiting for contributors</text>
          <text size="small" color="#7d8590">•</text>
          <text size="small" color="#58a6ff">📝 {wordLimit} words</text>
        </hstack>
        <button appearance="primary" size="small">
          [Contribute Chapter →]
        </button>
      </vstack>

      <vstack alignment="center" gap="small">
        <text size="small" color="#58a6ff" weight="bold">
          ✍️ Reply to bot comment with "CONTRIBUTION:"
        </text>
        <text size="small" color="#7d8590" alignment="center">
          Community votes decide the next chapter!
        </text>
      </vstack>
    </vstack>
  );
};

// Helper function to get current chapter number
async function getCurrentChapterNumber(context: any, postId: string): Promise<number> {
  try {
    const chaptersKey = `story_chapters:${postId}`;
    const chaptersData = await context.redis.get(chaptersKey);
    const chapters = chaptersData ? JSON.parse(chaptersData) : [];
    return chapters.length + 1; // Next chapter number
  } catch (error) {
    console.error('[getCurrentChapterNumber] Error:', error);
    return 1; // Default to chapter 1
  }
}

// Journey 2: Send winner notification PM
async function sendWinnerNotification(context: Context, winner: any, storyId: string) {
  try {
    const { reddit } = context;

    // Get story details
    const post = await reddit.getPostById(storyId);
    const storyTitle = post.title.replace('📖 ', '');

    // Send PM to winner
    await reddit.sendPrivateMessage({
      to: winner.authorName,
      subject: '🎉 Your chapter won!',
      text: `Congratulations, u/${winner.authorName}!

Your contribution to "${storyTitle}" has been selected by the community!

📊 **VOTING RESULTS:**
- Your submission: ${winner.votes} upvotes
- Rank: #1 of ${winner.totalSubmissions || 'multiple'} submissions
- Winning margin: +${winner.margin || 'several'} votes

Your chapter has been officially added as Chapter ${winner.chapter} of the story!

🎁 **ACHIEVEMENT UNLOCKED:** "First Win" badge earned!

Keep contributing! You're helping build something amazing.

View the story: ${post.url}

────────────────────────────
This story will continue for ${winner.daysRemaining || 'several'} more days. Consider contributing to Chapter ${winner.chapter + 1}!`
    });

    console.log(`[WinnerNotification] PM sent to ${winner.authorName}`);
  } catch (error) {
    console.error('[sendWinnerNotification] Error:', error);
  }
}

// Add chapter to story
async function addChapterToStory(context: Context, storyId: string, winner: any) {
  try {
    const chaptersKey = `story_chapters:${storyId}`;
    const chaptersData = await context.redis.get(chaptersKey);
    const chapters = chaptersData ? JSON.parse(chaptersData) : [];

    const newChapter = {
      chapterNumber: winner.chapter,
      authorId: winner.authorId,
      authorName: winner.authorName,
      text: winner.text,
      votes: winner.votes,
      addedAt: Date.now(),
      wordCount: winner.wordCount
    };

    chapters.push(newChapter);
    await context.redis.set(chaptersKey, JSON.stringify(chapters));

    // Update story metadata
    const storyMetadata = await context.redis.get(`story_post:${storyId}`);
    if (storyMetadata) {
      const metadata = JSON.parse(storyMetadata);
      metadata.lastChapterTime = Date.now();
      metadata.currentChapter = winner.chapter;
      await context.redis.set(`story_post:${storyId}`, JSON.stringify(metadata));
    }

    console.log(`[addChapterToStory] Chapter ${winner.chapter} added to story ${storyId}`);
  } catch (error) {
    console.error('[addChapterToStory] Error:', error);
  }
}

// Journey 2: Voting results processing (simplified for demo)
// In production, this would be a proper scheduled job

// Helper function to check and process voting results
async function checkAndProcessVotingResults(context: Context, storyId: string) {
  try {
    const { reddit } = context;

    // Get story metadata
    const storyMetadata = await context.redis.get(`story_post:${storyId}`);
    if (!storyMetadata) return;

    const metadata = JSON.parse(storyMetadata);

    // Check if 24 hours have passed since last chapter
    const lastChapterTime = metadata.lastChapterTime || metadata.createdAt;
    const now = Date.now();
    const hoursElapsed = (now - lastChapterTime) / (1000 * 60 * 60);

    if (hoursElapsed >= 24) {
      // Get all contributions for this story
      const contributionsKey = `contributions:${storyId}`;
      const contributionsData = await context.redis.get(contributionsKey);
      const contributions = contributionsData ? JSON.parse(contributionsData) : [];

      if (contributions.length > 0) {
        // Find winner (highest voted contribution)
        const winner = contributions.reduce((prev: any, current: any) =>
          (prev.votes > current.votes) ? prev : current
        );

        // Send winner notification
        await sendWinnerNotification(context, winner, storyId);

        // Update story with new chapter
        await addChapterToStory(context, storyId, winner);

        // Clear contributions for next round
        await context.redis.del(contributionsKey);

        console.log(`[VotingResults] Winner selected for story ${storyId}: ${winner.authorName}`);
      }
    }
  } catch (error) {
    console.error('[checkAndProcessVotingResults] Error:', error);
  }
}

// Configure the app
Devvit.configure({
  redditAPI: true,
  redis: true,
});

// ThreadSmith Comment Detection - Simplified Contribution System
Devvit.addTrigger({
  event: 'CommentSubmit',
  onEvent: async (event, context) => {
    const { reddit } = context;

    try {
      if (!event.comment) return;

      const comment = await reddit.getCommentById(event.comment.id);
      const post = await reddit.getPostById(comment.postId);

      // Check if this is a story post
      const storyMetadata = await context.redis.get(`story_post:${post.id}`);
      if (!storyMetadata) return; // Not a story post

      const metadata = JSON.parse(storyMetadata);
      if (metadata.postType !== 'story_thread') return; // Not a story thread

      // Check if comment starts with "CONTRIBUTION:"
      if (comment.body.toUpperCase().startsWith('CONTRIBUTION:')) {
        console.log(`[CommentTrigger] ThreadSmith contribution detected in post ${post.id}`);

        // Extract the contribution text
        const contributionText = comment.body.substring(13).trim(); // Remove "CONTRIBUTION:" prefix

        // Validate word count (300-500 words as per spec)
        const wordCount = contributionText.split(/\s+/).length;
        const isValidWordCount = wordCount >= 300 && wordCount <= 500;

        // Get current chapter number
        const currentChapter = await getCurrentChapterNumber(context, post.id);

        // Check if user already contributed to this round
        const votingService = new VotingService(context as any);
        const canContribute = await votingService.canUserContribute(post.id, comment.authorId || 'unknown');

        if (!canContribute) {
          await reddit.submitComment({
            id: comment.id,
            text: `❌ **Sorry u/${comment.authorName}!**

You can only submit one contribution per voting round.

Your previous contribution for Chapter ${currentChapter} is already being voted on.

──────────────────────────────
🤖 ThreadSmith Bot`
          });
          return;
        }

        // Store the contribution
        const contributionData = {
          id: `contrib_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          commentId: comment.id,
          authorId: comment.authorId || 'unknown',
          authorName: comment.authorName || 'Anonymous',
          text: contributionText,
          wordCount,
          submittedAt: Date.now(),
          chapter: currentChapter,
          storyId: post.id,
          isValid: isValidWordCount
        };

        await context.redis.set(`contribution:${comment.id}`, JSON.stringify(contributionData));

        // Add to current voting round
        if (isValidWordCount) {
          await votingService.addContribution(post.id, currentChapter, contributionData);
        }

        // Bot confirmation reply
        const validationIcon = isValidWordCount ? '✅' : '⚠️';
        const isDev = process.env.NODE_ENV === 'development';
        const votingDuration = isDev ? '2 minutes' : '24 hours';

        await reddit.submitComment({
          id: comment.id,
          text: `${validationIcon} **Thank you u/${comment.authorName}!**

${isValidWordCount
              ? 'Your chapter has been submitted for community voting.'
              : `Word count error: ${wordCount} words (need 300-500 words)`}

📊 **Voting Status:** ${isValidWordCount ? 'Active' : 'Invalid - Please resubmit'}
⏱️ **Voting ends in:** ${votingDuration}
📝 **Word count:** ${wordCount} words ${isValidWordCount ? '✓' : '❌'}
🎯 **Chapter:** ${currentChapter}

${isValidWordCount
              ? 'Community will vote with Reddit upvotes. Most upvoted wins!'
              : 'Please reply again with a 300-500 word contribution.'}

──────────────────────────────
🤖 ThreadSmith Bot`
        });

        console.log(`[CommentTrigger] Contribution processed for comment ${comment.id}, valid: ${isValidWordCount}`);
      }
    } catch (error) {
      console.error('[CommentTrigger] Error processing comment:', error);
    }
  }
});

// ThreadSmith Custom Post Type - Handles all story-related UI
Devvit.addCustomPostType({
  name: 'ThreadSmith',
  height: 'tall',
  render: (context) => {
    console.log('[CustomPostType] Rendering ThreadSmith custom post');
    try {
      return <ThreadSmithRouter context={context} />;
    } catch (error) {
      console.error('[CustomPostType] Error rendering ThreadSmith:', error);
      return (
        <vstack height="100%" width="100%" alignment="middle center" padding="large">
          <text size="large" color="#ff4500">Error Loading ThreadSmith</text>
          <text color="#818384">Please check the logs</text>
        </vstack>
      );
    }
  },
});

// All posts now use the single StoryWeave custom post type with routing

// ThreadSmith Story Creation Menu
Devvit.addMenuItem({
  label: '📖 Create Story',
  location: 'subreddit',
  onPress: async (_event, context) => {
    const { ui } = context;
    console.log('[MenuItem] Create Story pressed - opening ThreadSmith form');

    try {
      ui.showForm(threadSmithCreationForm);
    } catch (error) {
      console.error('[MenuItem] Failed to open story creation form:', error);
      ui.showToast({ text: '❌ Failed to open form. Please try again.' });
    }
  },
});

// ThreadSmith Story Creation Form - Simplified
const threadSmithCreationForm = Devvit.createForm(
  {
    fields: [
      {
        name: 'title',
        label: 'Story Title *',
        type: 'string',
        required: true,
        helpText: 'Give your story an engaging title',
      },
      {
        name: 'genre',
        label: 'Genre *',
        type: 'select',
        required: true,
        options: [
          { label: '🧙‍♂️ Fantasy', value: 'fantasy' },
          { label: '🚀 Sci-Fi', value: 'scifi' },
          { label: '🔍 Mystery', value: 'mystery' },
          { label: '💕 Romance', value: 'romance' },
          { label: '👻 Horror', value: 'horror' },
          { label: '🏠 Slice of Life', value: 'slice_of_life' },
          { label: '📖 Other', value: 'other' },
        ],
      },
      {
        name: 'contentRating',
        label: 'Content Rating *',
        type: 'select',
        required: true,
        options: [
          { label: '🟢 General (All Ages)', value: 'general' },
          { label: '🟡 Teen (13+)', value: 'teen' },
          { label: '🔴 Mature (18+)', value: 'mature' },
        ],
      },
      {
        name: 'opening',
        label: 'Opening Paragraph *',
        type: 'paragraph',
        required: true,
        helpText: 'Write the opening that sets the scene (100-500 words)',
      },
      {
        name: 'duration',
        label: 'Story Duration *',
        type: 'select',
        required: true,
        options: [
          { label: '3 days (3 chapters)', value: '3days' },
          { label: '7 days (7 chapters)', value: '7days' },
          { label: '14 days (14 chapters)', value: '14days' },
          { label: '30 days (30 chapters)', value: '30days' },
          { label: 'Ongoing (no limit)', value: 'ongoing' },
        ],
      },
    ],
    title: '📖 Create ThreadSmith Story',
    acceptLabel: 'Create Story 🚀',
    cancelLabel: 'Cancel',
  },
  async (event, context) => {
    const { reddit, ui } = context;
    console.log('[ThreadSmithForm] Form submitted with data:', event.values);

    try {
      let subreddit;
      try {
        subreddit = await reddit.getCurrentSubreddit();
      } catch (subredditError) {
        console.error('[ThreadSmithForm] Cannot access subreddit (may be private):', subredditError);
        // Use demo mode instead of failing
        subreddit = { name: 'demo_subreddit' };
        ui.showToast({ text: '⚠️ Using demo mode - subreddit access limited' });
      }
      
      const user = await reddit.getCurrentUser();

      // Validate form data
      const { title, genre, contentRating, opening, duration } = event.values;

      // Extract values from arrays (Devvit form values are arrays)
      const titleStr = Array.isArray(title) ? title[0] : title;
      const genreStr = Array.isArray(genre) ? genre[0] : genre;
      const contentRatingStr = Array.isArray(contentRating) ? contentRating[0] : contentRating;
      const openingStr = Array.isArray(opening) ? opening[0] : opening;
      const durationStr = Array.isArray(duration) ? duration[0] : duration;

      if (!titleStr || titleStr.length > 200) {
        ui.showToast({ text: '❌ Title must be 1-200 characters' });
        return;
      }

      const openingWordCount = openingStr.split(/\s+/).length;
      if (!openingStr || openingWordCount < 100 || openingWordCount > 500) {
        ui.showToast({ text: '❌ Opening must be 100-500 words' });
        return;
      }

      // Show loading message
      ui.showToast({ text: '✨ Creating your ThreadSmith story...' });

      let post;
      if (subreddit.name === 'demo_subreddit') {
        // Demo mode - create story without Reddit API
        const { DemoDataService } = await import('./services/demoDataService.js');
        const demoService = new DemoDataService(context);
        
        const demoStory = {
          id: `demo_story_${Date.now()}`,
          title: titleStr,
          genre: genreStr,
          contentRating: contentRatingStr,
          opening: openingStr,
          duration: durationStr,
          createdAt: Date.now(),
          status: 'active' as const,
          currentChapter: 1,
          chapters: []
        };
        
        await context.redis.set(`demo_story:${demoStory.id}`, JSON.stringify(demoStory));
        
        // Add to demo stories list
        const existingList = await context.redis.get('demo_stories_list');
        const storyIds = existingList ? JSON.parse(existingList) : [];
        storyIds.push(demoStory.id);
        await context.redis.set('demo_stories_list', JSON.stringify(storyIds));
        
        post = { id: demoStory.id };
        console.log(`[ThreadSmithForm] Demo story created: ${demoStory.id}`);
      } else {
        // Normal mode - create Reddit post
        post = await reddit.submitPost({
          title: `📖 ${titleStr}`,
          subredditName: subreddit.name,
          preview: (
            <StoryThreadPreview
              title={titleStr}
              genre={genreStr}
              contentRating={contentRatingStr}
              duration={durationStr}
              wordLimit="300-500"
              opening={openingStr}
            />
          ),
        });
      }

      // Store story metadata
      const storyMetadata = {
        genre: genreStr,
        contentRating: contentRatingStr,
        opening: openingStr,
        duration: durationStr,
        wordLimit: '300-500', // Fixed for ThreadSmith
        createdBy: user?.id,
        createdAt: Date.now(),
        status: 'active',
        postType: 'story_thread',
        currentChapter: 1,
        lastChapterTime: Date.now()
      };

      await context.redis.set(`story_post:${post.id}`, JSON.stringify(storyMetadata));
      console.log(`[ThreadSmithForm] Stored story metadata for post: ${post.id}`);

      // Initialize voting service and start first round
      const votingService = new VotingService(context);
      await votingService.startVotingRound(post.id, 1);

      // Create pinned instruction comment
      const isDev = process.env.NODE_ENV === 'development';
      const votingDuration = isDev ? '2 minutes' : '24 hours';

      const instructionComment = await reddit.submitComment({
        id: post.id,
        text: `📌 **THREADSMITH BOT (PINNED)**

📝 **HOW TO CONTRIBUTE:**

Reply to this comment to add Chapter 1!

**FORMAT:**
\`\`\`
CONTRIBUTION:
[Your 300-500 word chapter here]
\`\`\`

**RULES:**
• 300-500 words per contribution
• One contribution per user per round
• Stay true to ${genreStr} genre
• Voting window: ${votingDuration}
• Most Reddit upvotes wins!

📋 **COMMUNITY GUIDELINES:**
✅ Be respectful and constructive
✅ Build on the opening paragraph
✅ No spam or inappropriate content

**OPENING:**
${openingStr}

**Current Status:** Accepting Chapter 1 contributions
**Voting ends in:** ${votingDuration}

Good luck, storytellers! ✨

────────────────────────────────
🤖 ThreadSmith Bot • 0 contributions received`,
      });

      console.log(`[ThreadSmithForm] Story thread created: ${post.id}`);

      // Success message and navigation
      if (subreddit.name === 'demo_subreddit') {
        ui.showToast({ text: '🎉 Demo story created! Check the Story Hub to see it.' });
      } else {
        ui.showToast({ text: '🎉 Your ThreadSmith story is live!' });
        ui.navigateTo(post);
      }

    } catch (error) {
      console.error('[ThreadSmithForm] Failed to create story thread:', error);
      ui.showToast({ text: '❌ Failed to create story. Please try again.' });
    }
  }
);

// Demo Data Seeding Menu (for testing)
Devvit.addMenuItem({
  label: '🧪 Seed Demo Stories',
  location: 'subreddit',
  onPress: async (_event, context) => {
    const { ui } = context;
    console.log('[MenuItem] Seeding demo stories...');

    try {
      const { DemoDataService } = await import('./services/demoDataService.js');
      const demoService = new DemoDataService(context);
      
      await demoService.seedDemoStories();
      
      ui.showToast({ text: '✅ Demo stories seeded! Check the Story Hub.' });
    } catch (error) {
      console.error('[MenuItem] Failed to seed demo stories:', error);
      ui.showToast({ text: '❌ Failed to seed demo stories.' });
    }
  },
});

// ThreadSmith Story Hub Menu
Devvit.addMenuItem({
  label: '📚 Story Hub',
  location: 'subreddit',
  onPress: async (_event, context) => {
    const { reddit, ui } = context;
    console.log('[MenuItem] ThreadSmith Story Hub pressed');

    try {
      let subreddit;
      try {
        subreddit = await reddit.getCurrentSubreddit();
      } catch (subredditError) {
        console.error('[MenuItem] Cannot access subreddit (may be private):', subredditError);
        // Use demo mode instead of failing
        subreddit = { name: 'demo_subreddit' };
        ui.showToast({ text: '⚠️ Using demo mode - subreddit access limited' });
      }
      
      console.log(`[MenuItem] Creating ThreadSmith Hub post in r/${subreddit.name}`);

      let post;
      if (subreddit.name === 'demo_subreddit') {
        // Demo mode - create hub without Reddit API
        const { DemoDataService } = await import('./services/demoDataService.js');
        const demoService = new DemoDataService(context);
        
        // Ensure demo stories are seeded
        await demoService.seedDemoStories();
        
        post = { id: `demo_hub_${Date.now()}` };
        
        // Store hub metadata for routing
        await context.redis.set(`story_post:${post.id}`, JSON.stringify({
          postType: 'story_hub',
          createdAt: Date.now()
        }));
        
        console.log(`[MenuItem] Demo Hub created successfully: ${post.id}`);
        ui.showToast({ text: '✅ Demo Story Hub ready! Browse sample stories.' });
      } else {
        // Normal mode - create Reddit post
        post = await reddit.submitPost({
          title: '📚 ThreadSmith Hub: Community Stories',
          subredditName: subreddit.name,
          preview: (
            <StoryHubPreview subredditName={subreddit.name} />
          ),
        });

        // Store hub metadata for routing
        await context.redis.set(`story_post:${post.id}`, JSON.stringify({
          postType: 'story_hub',
          createdAt: Date.now()
        }));

        console.log(`[MenuItem] ThreadSmith Hub post created successfully: ${post.id}`);
        ui.showToast({ text: '✅ ThreadSmith Hub created! Browse community stories.' });
        ui.navigateTo(post);
      }
    } catch (error) {
      console.error('[MenuItem] Failed to create ThreadSmith Hub post:', error);
      ui.showToast({ text: '❌ Failed to create post. Check logs.' });
    }
  },
});

// ThreadSmith Scheduler - Automated Winner Selection
// Note: Devvit scheduler jobs are defined differently in production
// This is a placeholder for the automated winner selection system

// Journey 2: Comment Detection System for Contributions
Devvit.addTrigger({
  event: 'CommentSubmit',
  onEvent: async (event, context) => {
    const { reddit, redis } = context;
    console.log('[CommentTrigger] Comment submitted:', event.comment?.id);

    try {
      const comment = event.comment;
      if (!comment?.body) return;

      // Check if comment contains "CONTRIBUTION:" keyword
      if (!comment.body.includes('CONTRIBUTION:')) return;

      console.log('[CommentTrigger] Contribution detected in comment:', comment.id);

      // Get the post this comment belongs to
      const post = await reddit.getPostById(comment.postId);

      // Check if this is a story thread post
      const storyMetadata = await redis.get(`story_post:${post.id}`);
      if (!storyMetadata) {
        console.log('[CommentTrigger] Not a story thread post, ignoring');
        return;
      }

      const metadata = JSON.parse(storyMetadata);

      // Extract contribution text (everything after "CONTRIBUTION:")
      const contributionMatch = comment.body.match(/CONTRIBUTION:\s*([\s\S]*)/);
      if (!contributionMatch) {
        console.log('[CommentTrigger] Invalid contribution format');
        return;
      }

      const contributionText = contributionMatch[1].trim();

      // Validate word count
      const wordCount = contributionText.split(/\s+/).length;
      const wordLimitRange = metadata.wordLimit; // e.g., "300-500"
      const [minWords, maxWords] = wordLimitRange.split('-').map(Number);

      if (wordCount < minWords || wordCount > maxWords) {
        // Reply with word count error
        await reddit.submitComment({
          id: comment.id,
          text: `❌ **Word Count Error**

Your contribution has ${wordCount} words, but the limit is ${wordLimitRange} words.

Please edit your comment to fit within the word limit.

---
🤖 This is an automated response from StoryWeave`
        });
        return;
      }

      // Store contribution data
      const contributionData = {
        id: comment.id,
        postId: post.id,
        authorId: comment.author || 'unknown',
        authorName: comment.author || 'unknown',
        text: contributionText,
        wordCount,
        timestamp: Date.now(),
        votes: 0,
        status: 'active',
        redditCommentId: comment.id
      };

      await redis.set(`contribution:${comment.id}`, JSON.stringify(contributionData));

      // Add to post's contribution list
      const contributionsKey = `contributions:${post.id}`;
      const existingContributions = await redis.get(contributionsKey);
      const contributions = existingContributions ? JSON.parse(existingContributions) : [];
      contributions.push(comment.id);
      await redis.set(contributionsKey, JSON.stringify(contributions));

      // Reply with success message
      await reddit.submitComment({
        id: comment.id,
        text: `✅ **Thank you for your contribution, u/${comment.author}!**

Your chapter has been submitted for community voting.

📊 **Voting Status:** Active  
⏱️ **Voting ends in:** 23 hours  
📝 **Word count:** ${wordCount} words  

May the best story win! 🏆

---
🤖 This is an automated response from StoryWeave`
      });

      console.log(`[CommentTrigger] Contribution processed successfully: ${comment.id}`);

    } catch (error) {
      console.error('[CommentTrigger] Failed to process contribution:', error);
    }
  },
});

// ThreadSmith Automated Winner Selection
// In production, this would be implemented as a scheduled job
// For the demo, winner selection happens when voting periods expire

// Configure the app
Devvit.configure({
  redditAPI: true,
  redis: true,
});

export default Devvit;