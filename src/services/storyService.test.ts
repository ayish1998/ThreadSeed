import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoryService, SearchQuery, StoryFilters, TimeFrame } from './storyService.js';
import { Story, StoryCategory } from '../types/story.js';

// Mock Context for testing
const mockContext = {
  redis: {
    set: vi.fn(),
    get: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    smembers: vi.fn(),
    keys: vi.fn(),
  },
};

describe('StoryService Enhanced Features', () => {
  let storyService: StoryService;
  let mockStory: Story;
  let mockCategory: StoryCategory;

  beforeEach(() => {
    vi.clearAllMocks();
    storyService = new StoryService(mockContext as any);
    
    mockCategory = {
      id: 'adventure',
      name: 'Adventure',
      description: 'Epic journeys and exciting quests',
      subredditSpecific: false,
      template: {
        id: 'adventure-template',
        name: 'Adventure Story',
        prompts: ['Our hero begins...', 'A challenge appears...'],
        suggestedTags: ['adventure', 'quest'],
        maxSentences: 40,
        estimatedDuration: 60,
        categoryId: 'adventure'
      }
    };

    mockStory = {
      id: 'story_123',
      title: 'Test Adventure Story',
      subredditName: 'testsubreddit',
      createdBy: 'user123',
      createdAt: Date.now() - 1000000,
      status: 'active',
      sentences: [
        {
          id: 'sentence_1',
          content: 'Once upon a time in a magical kingdom...',
          authorId: 'user123',
          authorName: 'TestUser',
          createdAt: Date.now() - 500000,
          votes: 5,
          upvoters: ['user1', 'user2', 'user3'],
          downvoters: [],
          order: 0
        }
      ],
      branches: [],
      metadata: {
        totalContributors: 3,
        lastActivity: Date.now() - 100000,
        tags: ['adventure', 'quest'],
        isPublic: true
      },
      category: mockCategory,
      description: 'A test adventure story',
      estimatedDuration: 60,
      progressPercentage: 25,
      trendingScore: 15.5,
      analytics: {
        totalViews: 100,
        uniqueContributors: 3,
        averageSessionDuration: 300,
        completionRate: 25,
        engagementScore: 8.5,
        peakConcurrentUsers: 5,
        lastUpdated: Date.now()
      },
      crossPostData: []
    };
  });

  describe('Story Search and Filtering', () => {
    it('should search stories with query matching title', async () => {
      const searchQuery: SearchQuery = {
        query: 'adventure',
        subredditName: 'testsubreddit',
        sortBy: 'relevance',
        limit: 10
      };

      mockContext.redis.smembers.mockResolvedValue(['story_123', 'story_456']);
      mockContext.redis.get.mockImplementation((key: string) => {
        if (key === 'story:story_123') {
          return Promise.resolve(JSON.stringify(mockStory));
        }
        return Promise.resolve(null);
      });

      const result = await storyService.searchStories(searchQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Test Adventure Story');
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should filter stories by category', async () => {
      const filters: StoryFilters = {
        category: 'adventure',
        status: 'active',
        limit: 10,
        subredditName: 'testsubreddit'
      };

      mockContext.redis.smembers.mockResolvedValue(['story_123']);
      mockContext.redis.get.mockResolvedValue(JSON.stringify(mockStory));

      const result = await storyService.getStoriesByCategory(mockCategory, filters);

      expect(result).toHaveLength(1);
      expect(result[0].category?.id).toBe('adventure');
    });

    it('should calculate trending scores correctly', async () => {
      const timeframe: TimeFrame = {
        start: Date.now() - 86400000, // 24 hours ago
        end: Date.now(),
        period: 'day'
      };

      mockContext.redis.smembers.mockResolvedValue(['story_123']);
      mockContext.redis.get.mockResolvedValue(JSON.stringify(mockStory));
      mockContext.redis.set.mockResolvedValue('OK');

      const result = await storyService.getTrendingStories('testsubreddit', timeframe);

      expect(result).toHaveLength(1);
      expect(result[0].trendingScore).toBeGreaterThan(0);
      expect(mockContext.redis.set).toHaveBeenCalled();
    });

    it('should handle search with multiple filters', async () => {
      const searchQuery: SearchQuery = {
        query: 'adventure',
        category: 'adventure',
        status: 'active',
        tags: ['quest'],
        sortBy: 'popular',
        subredditName: 'testsubreddit'
      };

      mockContext.redis.smembers.mockResolvedValue(['story_123']);
      mockContext.redis.get.mockResolvedValue(JSON.stringify(mockStory));

      const result = await storyService.searchStories(searchQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].metadata.tags).toContain('quest');
    });
  });

  describe('Story Lifecycle Management', () => {
    it('should archive inactive stories after 7 days', async () => {
      const inactiveStory = {
        ...mockStory,
        metadata: {
          ...mockStory.metadata,
          lastActivity: Date.now() - (8 * 24 * 60 * 60 * 1000) // 8 days ago
        }
      };

      mockContext.redis.keys.mockResolvedValue(['subreddit:testsubreddit:stories']);
      mockContext.redis.smembers.mockResolvedValue(['story_123']);
      mockContext.redis.get.mockResolvedValue(JSON.stringify(inactiveStory));
      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.srem.mockResolvedValue(1);
      mockContext.redis.sadd.mockResolvedValue(1);

      const archivedIds = await storyService.archiveInactiveStories();

      expect(archivedIds).toContain('story_123');
      expect(mockContext.redis.srem).toHaveBeenCalledWith('subreddit:testsubreddit:stories', 'story_123');
      expect(mockContext.redis.sadd).toHaveBeenCalledWith('subreddit:testsubreddit:archived', 'story_123');
    });

    it('should update story progress correctly', async () => {
      mockContext.redis.get.mockResolvedValue(JSON.stringify(mockStory));
      mockContext.redis.set.mockResolvedValue('OK');

      const result = await storyService.updateStoryProgress('story_123');

      expect(result).toBe(true);
      expect(mockContext.redis.set).toHaveBeenCalled();
    });

    it('should transition story status from active to completed', async () => {
      mockContext.redis.get.mockResolvedValue(JSON.stringify(mockStory));
      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.srem.mockResolvedValue(1);
      mockContext.redis.sadd.mockResolvedValue(1);

      const result = await storyService.transitionStoryStatus('story_123', 'completed');

      expect(result).toBe(true);
      expect(mockContext.redis.srem).toHaveBeenCalledWith('subreddit:testsubreddit:stories', 'story_123');
      expect(mockContext.redis.sadd).toHaveBeenCalledWith('subreddit:testsubreddit:completed', 'story_123');
    });

    it('should reject invalid status transitions', async () => {
      const archivedStory = { ...mockStory, status: 'archived' as const };
      mockContext.redis.get.mockResolvedValue(JSON.stringify(archivedStory));

      const result = await storyService.transitionStoryStatus('story_123', 'active');

      expect(result).toBe(false);
    });

    it('should get stories by status', async () => {
      mockContext.redis.smembers.mockResolvedValue(['story_123']);
      mockContext.redis.get.mockResolvedValue(JSON.stringify(mockStory));

      const result = await storyService.getStoriesByStatus('testsubreddit', 'active');

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('active');
    });
  });

  describe('Template and Categorization System', () => {
    it('should get default story categories', async () => {
      mockContext.redis.get.mockResolvedValue(null);

      const categories = await storyService.getStoryCategories('testsubreddit');

      expect(categories.length).toBeGreaterThan(0);
      expect(categories.some(c => c.name === 'Adventure')).toBe(true);
      expect(categories.some(c => c.name === 'Mystery')).toBe(true);
    });

    it('should create story with template', async () => {
      mockContext.redis.get.mockImplementation((key: string) => {
        if (key === 'subreddit:testsubreddit:categories') {
          return Promise.resolve(JSON.stringify([mockCategory]));
        }
        if (key === 'global:story:categories') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });
      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.sadd.mockResolvedValue(1);

      const story = await storyService.createStoryWithTemplate(
        'New Adventure',
        'user123',
        'testsubreddit',
        'adventure',
        'A thrilling new adventure'
      );

      expect(story.title).toBe('New Adventure');
      expect(story.category?.id).toBe('adventure');
      expect(story.description).toBe('A thrilling new adventure');
      expect(story.metadata.tags).toContain('adventure');
    });

    it('should create custom story category', async () => {
      mockContext.redis.get.mockResolvedValue(JSON.stringify([]));
      mockContext.redis.set.mockResolvedValue('OK');

      const newCategory = await storyService.createStoryCategory('testsubreddit', {
        name: 'Custom Category',
        description: 'A custom category for testing',
        subredditSpecific: true
      });

      expect(newCategory.name).toBe('Custom Category');
      expect(newCategory.subredditSpecific).toBe(true);
      expect(newCategory.id).toBeDefined();
    });

    it('should get template suggestions based on story progress', async () => {
      mockContext.redis.get.mockResolvedValue(JSON.stringify(mockStory));

      const suggestions = await storyService.getTemplateSuggestions('story_123', 5);

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should handle subreddit themes', async () => {
      const theme = {
        id: 'theme_1',
        name: 'Dark Theme',
        primaryColor: '#000000',
        secondaryColor: '#333333',
        backgroundColor: '#111111',
        textColor: '#ffffff',
        accentColor: '#ff6600'
      };

      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.get.mockResolvedValue(JSON.stringify(theme));

      const setResult = await storyService.setSubredditTheme('testsubreddit', theme);
      expect(setResult).toBe(true);

      const getResult = await storyService.getSubredditTheme('testsubreddit');
      expect(getResult?.name).toBe('Dark Theme');
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully in search', async () => {
      mockContext.redis.smembers.mockRejectedValue(new Error('Redis error'));

      const searchQuery: SearchQuery = {
        query: 'test',
        subredditName: 'testsubreddit'
      };

      const result = await storyService.searchStories(searchQuery);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle missing stories in lifecycle management', async () => {
      mockContext.redis.get.mockResolvedValue(null);

      const result = await storyService.updateStoryProgress('nonexistent_story');

      expect(result).toBe(false);
    });

    it('should handle template creation errors', async () => {
      mockContext.redis.get.mockRejectedValue(new Error('Redis error'));

      await expect(
        storyService.createStoryWithTemplate('Test', 'user123', 'testsubreddit', 'nonexistent')
      ).rejects.toThrow();
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large result sets with pagination', async () => {
      const manyStoryIds = Array.from({ length: 100 }, (_, i) => `story_${i}`);
      mockContext.redis.smembers.mockResolvedValue(manyStoryIds);
      mockContext.redis.get.mockImplementation((key: string) => {
        if (key.startsWith('story:')) {
          return Promise.resolve(JSON.stringify({ ...mockStory, id: key.split(':')[1] }));
        }
        return Promise.resolve(null);
      });

      const searchQuery: SearchQuery = {
        query: 'test',
        limit: 10,
        offset: 0
      };

      const result = await storyService.searchStories(searchQuery);

      expect(result.items.length).toBeLessThanOrEqual(10);
      expect(result.hasMore).toBe(true);
    });

    it('should handle empty search results', async () => {
      mockContext.redis.smembers.mockResolvedValue([]);

      const searchQuery: SearchQuery = {
        query: 'nonexistent',
        subredditName: 'testsubreddit'
      };

      const result = await storyService.searchStories(searchQuery);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle concurrent archiving operations', async () => {
      const oldStories = Array.from({ length: 5 }, (_, i) => ({
        ...mockStory,
        id: `story_${i}`,
        metadata: {
          ...mockStory.metadata,
          lastActivity: Date.now() - (8 * 24 * 60 * 60 * 1000)
        }
      }));

      mockContext.redis.keys.mockResolvedValue(['subreddit:testsubreddit:stories']);
      mockContext.redis.smembers.mockResolvedValue(oldStories.map(s => s.id));
      mockContext.redis.get.mockImplementation((key: string) => {
        const storyId = key.split(':')[1];
        const story = oldStories.find(s => s.id === storyId);
        return Promise.resolve(story ? JSON.stringify(story) : null);
      });
      mockContext.redis.set.mockResolvedValue('OK');
      mockContext.redis.srem.mockResolvedValue(1);
      mockContext.redis.sadd.mockResolvedValue(1);

      const archivedIds = await storyService.archiveInactiveStories();

      expect(archivedIds).toHaveLength(5);
    });
  });
});