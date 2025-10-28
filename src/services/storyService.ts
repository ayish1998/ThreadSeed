// src/services/storyService.ts 
import { Context } from '@devvit/public-api';
import {
  Story,
  StorySentence,
  StoryCategory,
  validateSentence,
  validateStoryTitle
} from '../types/story.js';

// Genre, Duration, and Word Limit types for Journey 1
export type Genre = 'fantasy' | 'scifi' | 'mystery' | 'romance' | 'horror' | 'slice_of_life' | 'other';
export type Duration = '3days' | '7days' | '14days' | '30days' | 'ongoing';
export type WordLimit = '100-300' | '300-500' | '500-1000';

export interface StoryCreationMetadata {
  genre?: Genre;
  openingParagraph?: string;
  constraint?: string;
  duration?: Duration;
  wordLimit?: WordLimit;
  creatorUsername?: string;
}

export class StoryService {
  private context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  /**
   * Create a new story with enhanced metadata support
   * NOW SUPPORTS: Journey 1 flow with genre, opening paragraph, constraints, duration
   */
  async createStory(
    title: string,
    creatorId: string,
    subredditName: string,
    metadata?: StoryCreationMetadata
  ): Promise<Story> {
    if (!validateStoryTitle(title)) {
      throw new Error('Invalid story title');
    }

    const storyId = `story_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Map genre to category
    const category = this.getStoryCategory(metadata?.genre);

    // Calculate estimated duration in minutes
    const estimatedDuration = this.getEstimatedDuration(metadata?.duration);

    // Create opening sentence from opening paragraph (if provided)
    const openingSentence: StorySentence | null = metadata?.openingParagraph ? {
      id: `sentence_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      content: metadata.openingParagraph,
      authorId: creatorId,
      authorName: metadata.creatorUsername || 'Anonymous',
      createdAt: Date.now(),
      votes: 0,
      upvoters: [],
      downvoters: [],
      order: 0
    } : null;

    const story: Story = {
      id: storyId,
      title: title.trim(),
      subredditName,
      createdBy: creatorId,
      createdAt: Date.now(),
      status: 'active',
      sentences: openingSentence ? [openingSentence] : [],
      branches: [],
      metadata: {
        totalContributors: 1,
        lastActivity: Date.now(),
        tags: metadata?.genre ? [metadata.genre] : [],
        isPublic: true,
        // Store Journey 1 metadata in custom fields
        genre: metadata?.genre,
        constraint: metadata?.constraint,
        duration: metadata?.duration,
        wordLimit: metadata?.wordLimit,
        expiresAt: this.calculateExpiryDate(metadata?.duration)
      },
      category,
      description: metadata?.constraint || '',
      estimatedDuration,
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
      crossPostData: [],
    };

    try {
      // Store opening sentence if exists
      if (openingSentence) {
        await this.context.redis.set(`sentence:${openingSentence.id}`, JSON.stringify(openingSentence));
      }

      await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));

      // Store story IDs in subreddit and user lists using simple key-value storage
      const subredditStoriesKey = `subreddit:${subredditName}:stories`;
      const userStoriesKey = `user:${creatorId}:stories`;

      // Get existing story lists
      const existingSubredditStories = await this.context.redis.get(subredditStoriesKey);
      const existingUserStories = await this.context.redis.get(userStoriesKey);

      // Parse existing lists or create new ones
      const subredditStories = existingSubredditStories ? JSON.parse(existingSubredditStories) : [];
      const userStories = existingUserStories ? JSON.parse(existingUserStories) : [];

      // Add new story ID if not already present
      if (!subredditStories.includes(storyId)) {
        subredditStories.push(storyId);
      }
      if (!userStories.includes(storyId)) {
        userStories.push(storyId);
      }

      // Store updated lists
      await this.context.redis.set(subredditStoriesKey, JSON.stringify(subredditStories));
      await this.context.redis.set(userStoriesKey, JSON.stringify(userStories));

      console.log(`Created story ${storyId} with genre: ${metadata?.genre}, duration: ${metadata?.duration}`);
      return story;
    } catch (error) {
      console.error('Failed to create story:', error);
      throw new Error('Failed to create story');
    }
  }

  /**
   * Get story category based on genre
   */
  private getStoryCategory(genre?: Genre): StoryCategory {
    const categoryMap: Record<Genre, StoryCategory> = {
      fantasy: {
        id: 'fantasy',
        name: 'Fantasy',
        description: 'Magic, mythical creatures, and epic quests',
        subredditSpecific: false,
      },
      scifi: {
        id: 'scifi',
        name: 'Science Fiction',
        description: 'Space exploration, technology, and future worlds',
        subredditSpecific: false,
      },
      mystery: {
        id: 'mystery',
        name: 'Mystery',
        description: 'Suspense, investigation, and plot twists',
        subredditSpecific: false,
      },
      romance: {
        id: 'romance',
        name: 'Romance',
        description: 'Love stories and relationships',
        subredditSpecific: false,
      },
      horror: {
        id: 'horror',
        name: 'Horror',
        description: 'Scary tales and supernatural events',
        subredditSpecific: false,
      },
      slice_of_life: {
        id: 'slice_of_life',
        name: 'Slice of Life',
        description: 'Everyday stories and experiences',
        subredditSpecific: false,
      },
      other: {
        id: 'general',
        name: 'General',
        description: 'General stories without specific themes',
        subredditSpecific: false,
      }
    };

    return genre ? categoryMap[genre] : categoryMap.other;
  }

  /**
   * Calculate estimated duration in minutes
   */
  private getEstimatedDuration(duration?: Duration): number {
    const durationMap: Record<Duration, number> = {
      '3days': 4320,    // 3 days in minutes
      '7days': 10080,   // 7 days
      '14days': 20160,  // 14 days
      '30days': 43200,  // 30 days
      'ongoing': 43200  // 30 days default for ongoing
    };

    return duration ? durationMap[duration] : durationMap['7days'];
  }

  /**
   * Calculate story expiry date based on duration
   */
  private calculateExpiryDate(duration?: Duration): number | undefined {
    if (!duration || duration === 'ongoing') {
      return undefined; // No expiry for ongoing stories
    }

    const durationMilliseconds = this.getEstimatedDuration(duration) * 60 * 1000;
    return Date.now() + durationMilliseconds;
  }

  // ===== EXISTING METHODS (unchanged) =====

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

      const sentenceId = `sentence_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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

  async voteSentence(storyId: string, sentenceId: string, userId: string, isUpvote: boolean): Promise<boolean> {
    try {
      const story = await this.getStory(storyId);
      if (!story) return false;

      const sentenceIndex = story.sentences.findIndex(s => s.id === sentenceId);
      if (sentenceIndex === -1) return false;

      const sentence = story.sentences[sentenceIndex];

      sentence.upvoters = sentence.upvoters || [];
      sentence.downvoters = sentence.downvoters || [];

      sentence.upvoters = sentence.upvoters.filter(id => id !== userId);
      sentence.downvoters = sentence.downvoters.filter(id => id !== userId);

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

  async getSubredditStories(subredditName: string, limit: number = 10): Promise<Story[]> {
    try {
      const subredditStoriesKey = `subreddit:${subredditName}:stories`;
      const storyIdsData = await this.context.redis.get(subredditStoriesKey);

      if (!storyIdsData) {
        return [];
      }

      const storyIds = JSON.parse(storyIdsData);

      if (!Array.isArray(storyIds)) {
        return [];
      }

      const stories: Story[] = [];

      for (const storyId of storyIds.slice(0, limit)) {
        const story = await this.getStory(storyId);
        if (story && story.status === 'active') {
          stories.push(story);
        }
      }

      return stories.sort((a, b) => b.metadata.lastActivity - a.metadata.lastActivity);
    } catch (error) {
      console.error('Failed to get subreddit stories:', error);
      return [];
    }
  }

  /**
   * Check if story has expired based on duration
   */
  async checkAndExpireStory(storyId: string): Promise<boolean> {
    try {
      const story = await this.getStory(storyId);
      if (!story) return false;

      const expiresAt = (story.metadata as any).expiresAt;
      if (expiresAt && Date.now() > expiresAt) {
        story.status = 'completed';
        await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));
        console.log(`Story ${storyId} expired and marked as completed`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to check story expiry:', error);
      return false;
    }
  }

  /**
   * Get stories by genre
   */
  async getStoriesByGenre(subredditName: string, genre: Genre): Promise<Story[]> {
    try {
      const allStories = await this.getSubredditStories(subredditName, 100);
      return allStories.filter(story =>
        (story.metadata as any).genre === genre
      );
    } catch (error) {
      console.error('Failed to get stories by genre:', error);
      return [];
    }
  }
}