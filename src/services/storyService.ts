import { Context } from '@devvit/public-api';
import { Story, StorySentence, StoryBranch, validateSentence, validateStoryTitle } from '../types/story.js';

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
}