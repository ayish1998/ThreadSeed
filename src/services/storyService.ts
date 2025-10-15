import { Context } from '@devvit/public-api';
import { 
  Story, 
  StorySentence, 
  StoryBranch, 
  StoryCategory,
  validateSentence, 
  validateStoryTitle 
} from '../types/story.js';

// Search and filtering interfaces
export interface SearchQuery {
  query: string;
  category?: string;
  status?: 'active' | 'completed' | 'archived';
  tags?: string[];
  subredditName?: string;
  sortBy?: 'relevance' | 'recent' | 'trending' | 'popular';
  limit?: number;
  offset?: number;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  query: SearchQuery;
}

export interface StoryFilters {
  category?: string;
  minDuration?: number;
  maxDuration?: number;
  minContributors?: number;
  tags?: string[];
  status?: 'active' | 'completed' | 'archived';
  sortBy?: 'recent' | 'popular' | 'trending' | 'completion';
  limit?: number;
  offset?: number;
}

export interface TimeFrame {
  start: number;
  end: number;
  period: 'hour' | 'day' | 'week' | 'month';
}

export class StoryService {
  private context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  // Create a new story
  async createStory(title: string, creatorId: string, subredditName: string): Promise<Story> {
    if (!validateStoryTitle(title)) {
      throw new Error('Invalid story title');
    }

    const storyId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const story: Story = {
      id: storyId,
      title: title.trim(),
      subredditName,
      createdBy: creatorId,
      createdAt: Date.now(),
      status: 'active',
      sentences: [],
      branches: [],
      metadata: {
        totalContributors: 1,
        lastActivity: Date.now(),
        tags: [],
        isPublic: true,
      },
    };

    try {
      await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));
      await this.context.redis.sadd(`subreddit:${subredditName}:stories`, storyId);
      await this.context.redis.sadd(`user:${creatorId}:stories`, storyId);
      
      return story;
    } catch (error) {
      console.error('Failed to create story:', error);
      throw new Error('Failed to create story');
    }
  }

  // Get story by ID
  async getStory(storyId: string): Promise<Story | null> {
    try {
      const storyData = await this.context.redis.get(`story:${storyId}`);
      return storyData ? JSON.parse(storyData) : null;
    } catch (error) {
      console.error('Failed to get story:', error);
      return null;
    }
  }

  // Add sentence to story
  async addSentence(
    storyId: string, 
    content: string, 
    authorId: string, 
    authorName: string,
    parentSentenceId?: string
  ): Promise<StorySentence | null> {
    if (!validateSentence(content)) {
      throw new Error('Invalid sentence content');
    }

    try {
      const story = await this.getStory(storyId);
      if (!story || story.status !== 'active') {
        throw new Error('Story not found or not active');
      }

      const sentenceId = `sentence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const sentence: StorySentence = {
        id: sentenceId,
        content: content.trim(),
        authorId,
        authorName,
        createdAt: Date.now(),
        votes: 0,
        upvoters: [],
        downvoters: [],
        parentSentenceId,
        order: story.sentences.length,
      };

      story.sentences.push(sentence);
      story.metadata.lastActivity = Date.now();
      
      // Update contributor count if new contributor
      const isNewContributor = !story.sentences.some(s => s.authorId === authorId);
      if (isNewContributor) {
        story.metadata.totalContributors++;
      }

      await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));
      await this.context.redis.set(`sentence:${sentenceId}`, JSON.stringify(sentence));
      
      return sentence;
    } catch (error) {
      console.error('Failed to add sentence:', error);
      throw error;
    }
  }

  // Vote on a sentence
  async voteSentence(storyId: string, sentenceId: string, userId: string, isUpvote: boolean): Promise<boolean> {
    try {
      const story = await this.getStory(storyId);
      if (!story) return false;

      const sentenceIndex = story.sentences.findIndex(s => s.id === sentenceId);
      if (sentenceIndex === -1) return false;

      const sentence = story.sentences[sentenceIndex];
      
      // Remove previous vote if exists
      sentence.upvoters = sentence.upvoters.filter(id => id !== userId);
      sentence.downvoters = sentence.downvoters.filter(id => id !== userId);
      
      // Add new vote
      if (isUpvote) {
        sentence.upvoters.push(userId);
      } else {
        sentence.downvoters.push(userId);
      }
      
      sentence.votes = sentence.upvoters.length - sentence.downvoters.length;
      
      await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));
      await this.context.redis.set(`sentence:${sentenceId}`, JSON.stringify(sentence));
      
      return true;
    } catch (error) {
      console.error('Failed to vote on sentence:', error);
      return false;
    }
  }

  // Get stories for a subreddit
  async getSubredditStories(subredditName: string, limit: number = 10): Promise<Story[]> {
    try {
      const storyIds = await this.context.redis.smembers(`subreddit:${subredditName}:stories`);
      const stories: Story[] = [];
      
      for (const storyId of storyIds.slice(0, limit)) {
        const story = await this.getStory(storyId);
        if (story && story.status === 'active') {
          stories.push(story);
        }
      }
      
      // Sort by last activity
      return stories.sort((a, b) => b.metadata.lastActivity - a.metadata.lastActivity);
    } catch (error) {
      console.error('Failed to get subreddit stories:', error);
      return [];
    }
  }

  // Enhanced search functionality with Redis-based search
  async searchStories(query: SearchQuery): Promise<SearchResult<Story>> {
    try {
      const { 
        query: searchQuery, 
        category, 
        status, 
        tags, 
        subredditName, 
        sortBy = 'relevance', 
        limit = 10, 
        offset = 0 
      } = query;

      let storyIds: string[] = [];

      // Get story IDs based on subreddit filter
      if (subredditName) {
        storyIds = await this.context.redis.smembers(`subreddit:${subredditName}:stories`);
      } else {
        // Get all story IDs from all subreddits (this could be optimized with a global index)
        const allSubreddits = await this.context.redis.keys('subreddit:*:stories');
        for (const key of allSubreddits) {
          const ids = await this.context.redis.smembers(key);
          storyIds.push(...ids);
        }
      }

      // Filter and score stories
      const scoredStories: Array<{ story: Story; score: number }> = [];
      
      for (const storyId of storyIds) {
        const story = await this.getStory(storyId);
        if (!story) continue;

        // Apply status filter
        if (status && story.status !== status) continue;

        // Apply category filter
        if (category && story.category?.id !== category) continue;

        // Apply tag filter
        if (tags && tags.length > 0) {
          const hasMatchingTag = tags.some(tag => 
            story.metadata.tags.includes(tag)
          );
          if (!hasMatchingTag) continue;
        }

        // Calculate relevance score
        let score = 0;
        const searchTerms = searchQuery.toLowerCase().split(' ').filter(term => term.length > 0);
        
        for (const term of searchTerms) {
          // Title matches (highest weight)
          if (story.title.toLowerCase().includes(term)) {
            score += 10;
          }
          
          // Description matches
          if (story.description?.toLowerCase().includes(term)) {
            score += 5;
          }
          
          // Tag matches
          if (story.metadata.tags.some(tag => tag.toLowerCase().includes(term))) {
            score += 3;
          }
          
          // Category matches
          if (story.category?.name.toLowerCase().includes(term)) {
            score += 3;
          }
          
          // Content matches (in sentences)
          const contentMatches = story.sentences.filter(sentence => 
            sentence.content.toLowerCase().includes(term)
          ).length;
          score += contentMatches * 1;
        }

        // Boost score based on story metrics
        if (sortBy === 'trending') {
          score += story.trendingScore || 0;
        } else if (sortBy === 'popular') {
          score += story.metadata.totalContributors * 2;
          score += story.sentences.reduce((sum, s) => sum + s.votes, 0) * 0.1;
        }

        if (score > 0 || searchQuery.trim() === '') {
          scoredStories.push({ story, score });
        }
      }

      // Sort results
      scoredStories.sort((a, b) => {
        switch (sortBy) {
          case 'recent':
            return b.story.metadata.lastActivity - a.story.metadata.lastActivity;
          case 'trending':
            return (b.story.trendingScore || 0) - (a.story.trendingScore || 0);
          case 'popular':
            return b.story.metadata.totalContributors - a.story.metadata.totalContributors;
          case 'relevance':
          default:
            return b.score - a.score;
        }
      });

      // Apply pagination
      const total = scoredStories.length;
      const paginatedResults = scoredStories.slice(offset, offset + limit);
      const hasMore = offset + limit < total;

      return {
        items: paginatedResults.map(item => item.story),
        total,
        hasMore,
        query
      };

    } catch (error) {
      console.error('Failed to search stories:', error);
      return {
        items: [],
        total: 0,
        hasMore: false,
        query
      };
    }
  }

  // Get trending stories with time-based trending score calculation
  async getTrendingStories(subredditName: string, timeframe: TimeFrame): Promise<Story[]> {
    try {
      const storyIds = await this.context.redis.smembers(`subreddit:${subredditName}:stories`);
      const trendingStories: Array<{ story: Story; trendingScore: number }> = [];
      
      const now = Date.now();
      const timeframeDuration = timeframe.end - timeframe.start;
      
      for (const storyId of storyIds) {
        const story = await this.getStory(storyId);
        if (!story || story.status !== 'active') continue;

        // Calculate trending score based on recent activity
        let trendingScore = 0;
        
        // Recent activity weight (more recent = higher score)
        const timeSinceLastActivity = now - story.metadata.lastActivity;
        const activityRecency = Math.max(0, 1 - (timeSinceLastActivity / timeframeDuration));
        trendingScore += activityRecency * 50;
        
        // Contributor growth rate
        const contributorScore = story.metadata.totalContributors * 10;
        trendingScore += contributorScore;
        
        // Sentence engagement (votes and recent additions)
        const recentSentences = story.sentences.filter(s => 
          s.createdAt >= timeframe.start && s.createdAt <= timeframe.end
        );
        const recentEngagement = recentSentences.reduce((sum, s) => sum + Math.max(0, s.votes), 0);
        trendingScore += recentEngagement * 2;
        
        // Velocity bonus (sentences per hour in timeframe)
        const hoursInTimeframe = timeframeDuration / (1000 * 60 * 60);
        const velocity = recentSentences.length / Math.max(1, hoursInTimeframe);
        trendingScore += velocity * 5;
        
        // Store calculated trending score
        story.trendingScore = trendingScore;
        await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));
        
        if (trendingScore > 0) {
          trendingStories.push({ story, trendingScore });
        }
      }
      
      // Sort by trending score and return top stories
      return trendingStories
        .sort((a, b) => b.trendingScore - a.trendingScore)
        .slice(0, 20)
        .map(item => item.story);
        
    } catch (error) {
      console.error('Failed to get trending stories:', error);
      return [];
    }
  }

  // Get stories by category with filtering and pagination
  async getStoriesByCategory(category: StoryCategory, filters: StoryFilters): Promise<Story[]> {
    try {
      const {
        minDuration,
        maxDuration,
        minContributors,
        tags,
        status,
        sortBy = 'recent',
        limit = 10,
        offset = 0
      } = filters;

      // Get all stories that match the category
      let storyIds: string[] = [];
      
      if (category.subredditSpecific && filters.subredditName) {
        storyIds = await this.context.redis.smembers(`subreddit:${filters.subredditName}:stories`);
      } else if (filters.subredditName) {
        // Search in specific subreddit even for non-subreddit-specific categories
        storyIds = await this.context.redis.smembers(`subreddit:${filters.subredditName}:stories`);
      } else {
        // Search across all subreddits for this category
        const allSubreddits = await this.context.redis.keys('subreddit:*:stories');
        if (allSubreddits && Array.isArray(allSubreddits)) {
          for (const key of allSubreddits) {
            const ids = await this.context.redis.smembers(key);
            storyIds.push(...ids);
          }
        }
      }

      const filteredStories: Story[] = [];
      
      for (const storyId of storyIds) {
        const story = await this.getStory(storyId);
        if (!story) continue;

        // Category filter
        if (story.category?.id !== category.id) continue;

        // Status filter
        if (status && story.status !== status) continue;

        // Duration filters
        if (minDuration && story.estimatedDuration < minDuration) continue;
        if (maxDuration && story.estimatedDuration > maxDuration) continue;

        // Contributor filter
        if (minContributors && story.metadata.totalContributors < minContributors) continue;

        // Tag filter
        if (tags && tags.length > 0) {
          const hasMatchingTag = tags.some(tag => 
            story.metadata.tags.includes(tag)
          );
          if (!hasMatchingTag) continue;
        }

        filteredStories.push(story);
      }

      // Sort stories
      filteredStories.sort((a, b) => {
        switch (sortBy) {
          case 'popular':
            return b.metadata.totalContributors - a.metadata.totalContributors;
          case 'trending':
            return (b.trendingScore || 0) - (a.trendingScore || 0);
          case 'completion':
            return b.progressPercentage - a.progressPercentage;
          case 'recent':
          default:
            return b.metadata.lastActivity - a.metadata.lastActivity;
        }
      });

      // Apply pagination
      return filteredStories.slice(offset, offset + limit);

    } catch (error) {
      console.error('Failed to get stories by category:', error);
      return [];
    }
  }

  // Archive inactive stories after 7 days of inactivity
  async archiveInactiveStories(cutoffDate: number = Date.now() - (7 * 24 * 60 * 60 * 1000)): Promise<string[]> {
    try {
      const archivedStoryIds: string[] = [];
      
      // Get all subreddit story sets
      const subredditKeys = await this.context.redis.keys('subreddit:*:stories');
      
      for (const subredditKey of subredditKeys) {
        const storyIds = await this.context.redis.smembers(subredditKey);
        
        for (const storyId of storyIds) {
          const story = await this.getStory(storyId);
          if (!story) continue;
          
          // Check if story is inactive and eligible for archiving
          if (story.status === 'active' && story.metadata.lastActivity < cutoffDate) {
            // Update story status to archived
            story.status = 'archived';
            story.metadata.lastActivity = Date.now(); // Update to mark when archived
            
            // Calculate final progress percentage
            const targetSentences = story.category?.template?.maxSentences || 50;
            story.progressPercentage = Math.min(100, (story.sentences.length / targetSentences) * 100);
            
            // Save updated story
            await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));
            
            // Move to archived stories set
            const subredditName = story.subredditName;
            await this.context.redis.srem(`subreddit:${subredditName}:stories`, storyId);
            await this.context.redis.sadd(`subreddit:${subredditName}:archived`, storyId);
            
            archivedStoryIds.push(storyId);
            
            console.log(`Archived inactive story: ${storyId} (${story.title})`);
          }
        }
      }
      
      return archivedStoryIds;
    } catch (error) {
      console.error('Failed to archive inactive stories:', error);
      return [];
    }
  }

  // Update story progress tracking with completion percentage calculation
  async updateStoryProgress(storyId: string): Promise<boolean> {
    try {
      const story = await this.getStory(storyId);
      if (!story) return false;

      // Calculate progress based on various factors
      const targetSentences = story.category?.template?.maxSentences || 50;
      const sentenceProgress = (story.sentences.length / targetSentences) * 100;
      
      // Factor in story completion indicators
      let completionBonus = 0;
      const lastSentence = story.sentences[story.sentences.length - 1];
      
      if (lastSentence) {
        const content = lastSentence.content.toLowerCase();
        // Check for story ending indicators
        const endingIndicators = [
          'the end', 'fin', 'concluded', 'finally', 'epilogue',
          'and they lived', 'years later', 'in conclusion'
        ];
        
        if (endingIndicators.some(indicator => content.includes(indicator))) {
          completionBonus = 20; // Bonus for natural story endings
        }
      }
      
      // Calculate final progress percentage
      story.progressPercentage = Math.min(100, sentenceProgress + completionBonus);
      
      // Update story status based on progress
      if (story.progressPercentage >= 100 && story.status === 'active') {
        story.status = 'completed';
        story.metadata.lastActivity = Date.now();
        
        // Move to completed stories set
        await this.context.redis.srem(`subreddit:${story.subredditName}:stories`, storyId);
        await this.context.redis.sadd(`subreddit:${story.subredditName}:completed`, storyId);
        
        console.log(`Story completed: ${storyId} (${story.title})`);
      }
      
      // Update analytics
      if (!story.analytics) {
        story.analytics = {
          totalViews: 0,
          uniqueContributors: story.metadata.totalContributors,
          averageSessionDuration: 0,
          completionRate: story.progressPercentage,
          engagementScore: 0,
          peakConcurrentUsers: 0,
          lastUpdated: Date.now()
        };
      } else {
        story.analytics.completionRate = story.progressPercentage;
        story.analytics.uniqueContributors = story.metadata.totalContributors;
        story.analytics.lastUpdated = Date.now();
      }
      
      // Calculate engagement score
      const totalVotes = story.sentences.reduce((sum, s) => sum + Math.max(0, s.votes), 0);
      const avgVotesPerSentence = story.sentences.length > 0 ? totalVotes / story.sentences.length : 0;
      story.analytics.engagementScore = (avgVotesPerSentence * story.metadata.totalContributors) / 10;
      
      await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));
      return true;
      
    } catch (error) {
      console.error('Failed to update story progress:', error);
      return false;
    }
  }

  // Implement story status transitions (active -> completed -> archived)
  async transitionStoryStatus(storyId: string, newStatus: 'active' | 'completed' | 'archived', reason?: string): Promise<boolean> {
    try {
      const story = await this.getStory(storyId);
      if (!story) return false;

      const oldStatus = story.status;
      
      // Validate status transition
      const validTransitions: Record<string, string[]> = {
        'active': ['completed', 'archived'],
        'completed': ['archived'],
        'archived': [] // Archived stories cannot be transitioned
      };
      
      if (!validTransitions[oldStatus]?.includes(newStatus)) {
        console.warn(`Invalid status transition from ${oldStatus} to ${newStatus} for story ${storyId}`);
        return false;
      }
      
      // Update story status
      story.status = newStatus;
      story.metadata.lastActivity = Date.now();
      
      // Handle status-specific logic
      switch (newStatus) {
        case 'completed':
          // Ensure progress is at 100%
          story.progressPercentage = 100;
          
          // Update analytics for completion
          if (story.analytics) {
            story.analytics.completionRate = 100;
            story.analytics.lastUpdated = Date.now();
          }
          
          // Move to completed stories set
          await this.context.redis.srem(`subreddit:${story.subredditName}:stories`, storyId);
          await this.context.redis.sadd(`subreddit:${story.subredditName}:completed`, storyId);
          break;
          
        case 'archived':
          // Move to archived stories set
          if (oldStatus === 'active') {
            await this.context.redis.srem(`subreddit:${story.subredditName}:stories`, storyId);
          } else if (oldStatus === 'completed') {
            await this.context.redis.srem(`subreddit:${story.subredditName}:completed`, storyId);
          }
          await this.context.redis.sadd(`subreddit:${story.subredditName}:archived`, storyId);
          break;
      }
      
      // Log the transition
      console.log(`Story ${storyId} transitioned from ${oldStatus} to ${newStatus}${reason ? ` (${reason})` : ''}`);
      
      // Save updated story
      await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));
      
      return true;
      
    } catch (error) {
      console.error('Failed to transition story status:', error);
      return false;
    }
  }

  // Get stories by status for management purposes
  async getStoriesByStatus(subredditName: string, status: 'active' | 'completed' | 'archived', limit: number = 10): Promise<Story[]> {
    try {
      let setKey: string;
      
      switch (status) {
        case 'active':
          setKey = `subreddit:${subredditName}:stories`;
          break;
        case 'completed':
          setKey = `subreddit:${subredditName}:completed`;
          break;
        case 'archived':
          setKey = `subreddit:${subredditName}:archived`;
          break;
        default:
          return [];
      }
      
      const storyIds = await this.context.redis.smembers(setKey);
      const stories: Story[] = [];
      
      for (const storyId of storyIds.slice(0, limit)) {
        const story = await this.getStory(storyId);
        if (story && story.status === status) {
          stories.push(story);
        }
      }
      
      // Sort by last activity
      return stories.sort((a, b) => b.metadata.lastActivity - a.metadata.lastActivity);
      
    } catch (error) {
      console.error('Failed to get stories by status:', error);
      return [];
    }
  }

  // Story template and categorization system

  // Get predefined story categories for a subreddit
  async getStoryCategories(subredditName: string): Promise<StoryCategory[]> {
    try {
      // Get subreddit-specific categories
      const subredditCategoriesData = await this.context.redis.get(`subreddit:${subredditName}:categories`);
      const subredditCategories: StoryCategory[] = subredditCategoriesData ? JSON.parse(subredditCategoriesData) : [];
      
      // Get global categories
      const globalCategoriesData = await this.context.redis.get('global:story:categories');
      const globalCategories: StoryCategory[] = globalCategoriesData ? JSON.parse(globalCategoriesData) : this.getDefaultCategories();
      
      // Combine and return
      return [...subredditCategories, ...globalCategories.filter(gc => !gc.subredditSpecific)];
      
    } catch (error) {
      console.error('Failed to get story categories:', error);
      return this.getDefaultCategories();
    }
  }

  // Get default story categories
  private getDefaultCategories(): StoryCategory[] {
    return [
      {
        id: 'adventure',
        name: 'Adventure',
        description: 'Epic journeys and exciting quests',
        subredditSpecific: false,
        template: {
          id: 'adventure-template',
          name: 'Adventure Story',
          prompts: [
            'Our hero begins their journey...',
            'A mysterious challenge appears...',
            'An unexpected ally joins the quest...',
            'The final confrontation awaits...'
          ],
          suggestedTags: ['adventure', 'quest', 'hero', 'journey'],
          maxSentences: 40,
          estimatedDuration: 60,
          categoryId: 'adventure'
        }
      },
      {
        id: 'mystery',
        name: 'Mystery',
        description: 'Puzzles, clues, and suspenseful investigations',
        subredditSpecific: false,
        template: {
          id: 'mystery-template',
          name: 'Mystery Story',
          prompts: [
            'Something strange has happened...',
            'The first clue is discovered...',
            'A suspect emerges...',
            'The truth is finally revealed...'
          ],
          suggestedTags: ['mystery', 'detective', 'clues', 'suspense'],
          maxSentences: 35,
          estimatedDuration: 45,
          categoryId: 'mystery'
        }
      },
      {
        id: 'comedy',
        name: 'Comedy',
        description: 'Humorous and lighthearted stories',
        subredditSpecific: false,
        template: {
          id: 'comedy-template',
          name: 'Comedy Story',
          prompts: [
            'It was a perfectly normal day until...',
            'Things started to get ridiculous when...',
            'The situation became even more absurd...',
            'In the end, everyone learned...'
          ],
          suggestedTags: ['comedy', 'humor', 'funny', 'lighthearted'],
          maxSentences: 30,
          estimatedDuration: 30,
          categoryId: 'comedy'
        }
      },
      {
        id: 'horror',
        name: 'Horror',
        description: 'Scary and suspenseful tales',
        subredditSpecific: false,
        template: {
          id: 'horror-template',
          name: 'Horror Story',
          prompts: [
            'The darkness held secrets...',
            'A chill ran down their spine...',
            'Something was terribly wrong...',
            'The nightmare was far from over...'
          ],
          suggestedTags: ['horror', 'scary', 'suspense', 'thriller'],
          maxSentences: 25,
          estimatedDuration: 40,
          categoryId: 'horror'
        }
      },
      {
        id: 'scifi',
        name: 'Science Fiction',
        description: 'Futuristic and technological adventures',
        subredditSpecific: false,
        template: {
          id: 'scifi-template',
          name: 'Sci-Fi Story',
          prompts: [
            'In the year 2157...',
            'The technology changed everything...',
            'An alien signal was detected...',
            'Humanity\'s future hung in the balance...'
          ],
          suggestedTags: ['scifi', 'future', 'technology', 'space'],
          maxSentences: 45,
          estimatedDuration: 70,
          categoryId: 'scifi'
        }
      }
    ];
  }

  // Create or update a story category
  async createStoryCategory(subredditName: string, category: Omit<StoryCategory, 'id'>): Promise<StoryCategory> {
    try {
      const categoryId = `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newCategory: StoryCategory = {
        id: categoryId,
        ...category,
        subredditSpecific: true
      };

      // Get existing categories
      const existingCategoriesData = await this.context.redis.get(`subreddit:${subredditName}:categories`);
      const existingCategories: StoryCategory[] = existingCategoriesData ? JSON.parse(existingCategoriesData) : [];

      // Add new category
      existingCategories.push(newCategory);

      // Save updated categories
      await this.context.redis.set(`subreddit:${subredditName}:categories`, JSON.stringify(existingCategories));

      return newCategory;
    } catch (error) {
      console.error('Failed to create story category:', error);
      throw new Error('Failed to create story category');
    }
  }

  // Apply template during story creation
  async createStoryWithTemplate(
    title: string, 
    creatorId: string, 
    subredditName: string, 
    categoryId: string,
    description?: string
  ): Promise<Story> {
    try {
      // Get the category and its template
      const categories = await this.getStoryCategories(subredditName);
      const category = categories.find(c => c.id === categoryId);
      
      if (!category) {
        throw new Error('Category not found');
      }

      // Create base story
      const storyId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const story: Story = {
        id: storyId,
        title: title.trim(),
        subredditName,
        createdBy: creatorId,
        createdAt: Date.now(),
        status: 'active',
        sentences: [],
        branches: [],
        metadata: {
          totalContributors: 1,
          lastActivity: Date.now(),
          tags: category.template?.suggestedTags || [],
          isPublic: true,
        },
        // Enhanced fields
        category,
        description: description || category.description,
        estimatedDuration: category.template?.estimatedDuration || 30,
        progressPercentage: 0,
        trendingScore: 0,
        analytics: {
          totalViews: 0,
          uniqueContributors: 1,
          averageSessionDuration: 0,
          completionRate: 0,
          engagementScore: 0,
          peakConcurrentUsers: 1,
          lastUpdated: Date.now()
        },
        crossPostData: []
      };

      // Apply template prompts as initial guidance (stored as metadata)
      if (category.template?.prompts) {
        story.metadata.theme = category.template.prompts[0]; // Use first prompt as theme
      }

      // Save story
      await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));
      await this.context.redis.sadd(`subreddit:${subredditName}:stories`, storyId);
      await this.context.redis.sadd(`user:${creatorId}:stories`, storyId);
      
      // Index by category for easier retrieval
      await this.context.redis.sadd(`category:${categoryId}:stories`, storyId);
      
      return story;
      
    } catch (error) {
      console.error('Failed to create story with template:', error);
      throw error;
    }
  }

  // Get template suggestions for story continuation
  async getTemplateSuggestions(storyId: string, currentSentenceCount: number): Promise<string[]> {
    try {
      const story = await this.getStory(storyId);
      if (!story || !story.category?.template) {
        return [];
      }

      const template = story.category.template;
      const suggestions: string[] = [];

      // Provide prompts based on story progress
      const progressRatio = currentSentenceCount / (template.maxSentences || 30);
      
      if (progressRatio < 0.25 && template.prompts[1]) {
        suggestions.push(template.prompts[1]);
      } else if (progressRatio < 0.5 && template.prompts[2]) {
        suggestions.push(template.prompts[2]);
      } else if (progressRatio < 0.75 && template.prompts[3]) {
        suggestions.push(template.prompts[3]);
      } else if (progressRatio >= 0.75 && template.prompts.length > 4) {
        suggestions.push(...template.prompts.slice(4));
      }

      return suggestions;
    } catch (error) {
      console.error('Failed to get template suggestions:', error);
      return [];
    }
  }

  // Apply subreddit-specific themes and styling
  async getSubredditTheme(subredditName: string): Promise<SubredditTheme | null> {
    try {
      const themeData = await this.context.redis.get(`subreddit:${subredditName}:theme`);
      return themeData ? JSON.parse(themeData) : null;
    } catch (error) {
      console.error('Failed to get subreddit theme:', error);
      return null;
    }
  }

  // Set subreddit-specific theme
  async setSubredditTheme(subredditName: string, theme: SubredditTheme): Promise<boolean> {
    try {
      await this.context.redis.set(`subreddit:${subredditName}:theme`, JSON.stringify(theme));
      return true;
    } catch (error) {
      console.error('Failed to set subreddit theme:', error);
      return false;
    }
  }

  // Get stories by template
  async getStoriesByTemplate(templateId: string, limit: number = 10): Promise<Story[]> {
    try {
      // This would require indexing stories by template ID
      const storyIds = await this.context.redis.smembers(`template:${templateId}:stories`);
      const stories: Story[] = [];
      
      for (const storyId of storyIds.slice(0, limit)) {
        const story = await this.getStory(storyId);
        if (story) {
          stories.push(story);
        }
      }
      
      return stories.sort((a, b) => b.metadata.lastActivity - a.metadata.lastActivity);
    } catch (error) {
      console.error('Failed to get stories by template:', error);
      return [];
    }
  }
}

// Subreddit theme interface
export interface SubredditTheme {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily?: string;
  customCSS?: string;
  logoUrl?: string;
  bannerUrl?: string;
  customPrompts?: string[];
  storyCategories?: string[]; // Category IDs that are featured
}