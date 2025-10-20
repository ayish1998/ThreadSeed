// src/services/storyService.ts
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
  subredditName?: string;
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

  // Create a new story with all required fields
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
      sentences: [], // Initialize empty array
      branches: [], // Initialize empty array
      metadata: {
        totalContributors: 1,
        lastActivity: Date.now(),
        tags: [],
        isPublic: true,
      },
      // Initialize all required fields with defaults
      category: {
        id: 'general',
        name: 'General',
        description: 'General story',
        subredditSpecific: false,
      },
      description: '',
      estimatedDuration: 30,
      progressPercentage: 0,
      trendingScore: 0,
      analytics: {
        totalViews: 0,
        uniqueContributors: 1,
        averageSessionDuration: 0,
        completionRate: 0,
        engagementScore: 0,
        peakConcurrentUsers: 1,
        lastUpdated: Date.now(),
      },
      crossPostData: [], // Initialize empty array
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

  // Get story by ID with safety checks
  async getStory(storyId: string): Promise<Story | null> {
    try {
      const storyData = await this.context.redis.get(`story:${storyId}`);
      if (!storyData) return null;
      
      const story = JSON.parse(storyData) as Story;
      
      // Ensure all array fields exist
      story.sentences = story.sentences || [];
      story.branches = story.branches || [];
      story.metadata.tags = story.metadata.tags || [];
      story.crossPostData = story.crossPostData || [];
      
      // Ensure analytics exists
      if (!story.analytics) {
        story.analytics = {
          totalViews: 0,
          uniqueContributors: story.metadata.totalContributors || 1,
          averageSessionDuration: 0,
          completionRate: 0,
          engagementScore: 0,
          peakConcurrentUsers: 1,
          lastUpdated: Date.now(),
        };
      }
      
      return story;
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
        upvoters: [], // Initialize empty array
        downvoters: [], // Initialize empty array
        parentSentenceId,
        order: story.sentences.length,
      };

      story.sentences.push(sentence);
      story.metadata.lastActivity = Date.now();
      
      // Update contributor count if new contributor
      const isNewContributor = !story.sentences.some(s => s.authorId === authorId);
      if (isNewContributor) {
        story.metadata.totalContributors++;
        if (story.analytics) {
          story.analytics.uniqueContributors++;
        }
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
      
      // Ensure arrays exist
      sentence.upvoters = sentence.upvoters || [];
      sentence.downvoters = sentence.downvoters || [];
      
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
      
      // Handle case where storyIds might be undefined or not an array
      if (!storyIds || !Array.isArray(storyIds)) {
        return [];
      }
      
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

  // Get default story categories
  private getDefaultCategories(): StoryCategory[] {
    return [
      {
        id: 'general',
        name: 'General',
        description: 'General stories without specific themes',
        subredditSpecific: false,
      },
      {
        id: 'adventure',
        name: 'Adventure',
        description: 'Epic journeys and exciting quests',
        subredditSpecific: false,
      },
      {
        id: 'mystery',
        name: 'Mystery',
        description: 'Puzzles, clues, and suspenseful investigations',
        subredditSpecific: false,
      },
      {
        id: 'comedy',
        name: 'Comedy',
        description: 'Humorous and lighthearted stories',
        subredditSpecific: false,
      },
    ];
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
  storyCategories?: string[];
}