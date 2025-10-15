import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BranchService, CreateBranchParams, MergeResult } from './branchService.js';
import { StoryBranch, BranchingRule } from '../types/story.js';

// Mock Redis context
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  smembers: vi.fn(),
  sismember: vi.fn(),
  keys: vi.fn()
};

const mockContext = {
  redis: mockRedis
};

describe('BranchService', () => {
  let branchService: BranchService;
  let mockStory: any;
  let mockBranch: StoryBranch;

  beforeEach(() => {
    vi.clearAllMocks();
    branchService = new BranchService(mockContext as any);

    mockStory = {
      id: 'story_123',
      title: 'Test Story',
      status: 'active',
      branches: [],
      sentences: []
    };

    mockBranch = {
      id: 'branch_123',
      name: 'Test Branch',
      description: 'A test branch',
      startingSentenceId: 'sentence_1',
      isActive: true,
      parentBranchId: undefined,
      childBranches: [],
      popularity: 0,
      mergeCandidate: false,
      branchType: 'decision',
      createdAt: Date.now(),
      createdBy: 'user_123'
    };
  });

  describe('createBranch', () => {
    it('should create a new branch successfully', async () => {
      const params: CreateBranchParams = {
        storyId: 'story_123',
        name: 'New Branch',
        description: 'A new branch for testing',
        startingSentenceId: 'sentence_1',
        branchType: 'decision',
        createdBy: 'user_123'
      };

      // Mock story exists and is active
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockStory));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify([])); // No branching rules
      mockRedis.smembers.mockResolvedValueOnce([]); // No active branches

      const result = await branchService.createBranch(params);

      expect(result).toBeDefined();
      expect(result.name).toBe('New Branch');
      expect(result.description).toBe('A new branch for testing');
      expect(result.branchType).toBe('decision');
      expect(result.isActive).toBe(true);
      expect(result.createdBy).toBe('user_123');

      // Verify Redis calls
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^branch_/),
        expect.stringContaining('New Branch')
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith('story:story_123:branches', expect.any(String));
      expect(mockRedis.sadd).toHaveBeenCalledWith('story:story_123:branches:active', expect.any(String));
    });

    it('should throw error when story is not found', async () => {
      const params: CreateBranchParams = {
        storyId: 'nonexistent_story',
        name: 'New Branch',
        description: 'A new branch for testing',
        startingSentenceId: 'sentence_1',
        branchType: 'decision',
        createdBy: 'user_123'
      };

      mockRedis.get.mockResolvedValueOnce(null);

      await expect(branchService.createBranch(params)).rejects.toThrow('Story not found');
    });

    it('should throw error when story is not active', async () => {
      const inactiveStory = { ...mockStory, status: 'completed' };
      const params: CreateBranchParams = {
        storyId: 'story_123',
        name: 'New Branch',
        description: 'A new branch for testing',
        startingSentenceId: 'sentence_1',
        branchType: 'decision',
        createdBy: 'user_123'
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(inactiveStory));

      await expect(branchService.createBranch(params)).rejects.toThrow('Cannot create branches for inactive stories');
    });

    it('should respect branch limits from branching rules', async () => {
      const branchingRules: BranchingRule[] = [{
        id: 'rule_1',
        storyId: 'story_123',
        triggerCondition: 'any_sentence',
        maxBranches: 2,
        votingPeriod: 4320,
        mergeThreshold: 3,
        subredditSpecific: false
      }];

      const params: CreateBranchParams = {
        storyId: 'story_123',
        name: 'New Branch',
        description: 'A new branch for testing',
        startingSentenceId: 'sentence_1',
        branchType: 'decision',
        createdBy: 'user_123'
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockStory));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(branchingRules));
      mockRedis.smembers.mockResolvedValueOnce(['branch_1', 'branch_2']); // Already at limit
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockBranch));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockBranch));

      await expect(branchService.createBranch(params)).rejects.toThrow('Maximum number of branches (2) reached');
    });

    it('should create child branch with parent relationship', async () => {
      const parentBranch = { ...mockBranch, id: 'parent_branch' };
      const storyWithBranch = { ...mockStory, branches: [parentBranch] };

      const params: CreateBranchParams = {
        storyId: 'story_123',
        name: 'Child Branch',
        description: 'A child branch',
        startingSentenceId: 'sentence_2',
        parentBranchId: 'parent_branch',
        branchType: 'alternative',
        createdBy: 'user_456'
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(storyWithBranch));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(parentBranch)); // Parent branch exists
      mockRedis.get.mockResolvedValueOnce(JSON.stringify([])); // No branching rules
      mockRedis.smembers.mockResolvedValueOnce([]); // No active branches

      const result = await branchService.createBranch(params);

      expect(result.parentBranchId).toBe('parent_branch');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:parent_branch',
        expect.stringContaining(result.id)
      );
    });
  });

  describe('getBranchTree', () => {
    it('should build hierarchical branch tree', async () => {
      const rootBranch: StoryBranch = {
        id: 'root_branch',
        name: 'Root Branch',
        description: 'Root branch',
        startingSentenceId: 'sentence_1',
        isActive: true,
        parentBranchId: undefined,
        childBranches: ['child_branch_1', 'child_branch_2'],
        popularity: 100,
        mergeCandidate: false,
        branchType: 'decision',
        createdAt: Date.now(),
        createdBy: 'user_123'
      };

      const childBranch1: StoryBranch = {
        id: 'child_branch_1',
        name: 'Child Branch 1',
        description: 'First child branch',
        startingSentenceId: 'sentence_2',
        isActive: true,
        parentBranchId: 'root_branch',
        childBranches: [],
        popularity: 50,
        mergeCandidate: false,
        branchType: 'alternative',
        createdAt: Date.now(),
        createdBy: 'user_456'
      };

      const childBranch2: StoryBranch = {
        id: 'child_branch_2',
        name: 'Child Branch 2',
        description: 'Second child branch',
        startingSentenceId: 'sentence_3',
        isActive: true,
        parentBranchId: 'root_branch',
        childBranches: [],
        popularity: 30,
        mergeCandidate: false,
        branchType: 'experimental',
        createdAt: Date.now(),
        createdBy: 'user_789'
      };

      const branches = [rootBranch, childBranch1, childBranch2];

      mockRedis.smembers.mockResolvedValueOnce(['root_branch', 'child_branch_1', 'child_branch_2']);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(rootBranch));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(childBranch1));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(childBranch2));

      const result = await branchService.getBranchTree('story_123');

      expect(result).toBeDefined();
      expect(result!.rootBranchId).toBe('root_branch');
      expect(result!.totalBranches).toBe(3);
      expect(result!.activeBranches).toBe(3);
      expect(result!.maxDepth).toBe(1);
      expect(result!.branches).toHaveLength(1);
      expect(result!.branches[0].children).toHaveLength(2);
    });

    it('should return null for empty branch list', async () => {
      mockRedis.smembers.mockResolvedValueOnce([]);

      const result = await branchService.getBranchTree('story_123');

      expect(result).toBeNull();
    });

    it('should return null for invalid hierarchy', async () => {
      // Create circular reference
      const branch1: StoryBranch = {
        ...mockBranch,
        id: 'branch_1',
        parentBranchId: 'branch_2',
        childBranches: []
      };

      const branch2: StoryBranch = {
        ...mockBranch,
        id: 'branch_2',
        parentBranchId: 'branch_1',
        childBranches: []
      };

      mockRedis.smembers.mockResolvedValueOnce(['branch_1', 'branch_2']);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(branch1));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(branch2));

      const result = await branchService.getBranchTree('story_123');

      expect(result).toBeNull();
    });
  });

  describe('updateBranchPopularity', () => {
    it('should calculate and update branch popularity', async () => {
      const engagement = {
        views: 100,
        contributions: 10,
        votes: 25,
        lastActivity: Date.now() - (2 * 24 * 60 * 60 * 1000) // 2 days ago
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockBranch));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(engagement));

      const result = await branchService.updateBranchPopularity('branch_123');

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:branch_123',
        expect.stringContaining('"popularity":')
      );
    });

    it('should return false for non-existent branch', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await branchService.updateBranchPopularity('nonexistent_branch');

      expect(result).toBe(false);
    });
  });

  describe('voteBranchMerge', () => {
    it('should create voting session and record vote', async () => {
      const branchingRules: BranchingRule[] = [{
        id: 'rule_1',
        storyId: 'story_123',
        triggerCondition: 'any_sentence',
        maxBranches: 5,
        votingPeriod: 4320,
        mergeThreshold: 3,
        subredditSpecific: false
      }];

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockBranch)); // getBranch
      mockRedis.get.mockResolvedValueOnce(null); // No existing voting session
      mockRedis.keys.mockResolvedValueOnce(['story:story_123:branches']);
      mockRedis.sismember.mockResolvedValueOnce(true);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(branchingRules));

      const result = await branchService.voteBranchMerge('branch_123', 'user_456', true);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:branch_123:voting',
        expect.stringContaining('"votesFor":["user_456"]')
      );
    });

    it('should update existing voting session', async () => {
      const existingSession = {
        id: 'voting_123',
        branchId: 'branch_123',
        storyId: 'story_123',
        votingType: 'merge' as const,
        votesFor: ['user_123'],
        votesAgainst: [],
        startedAt: Date.now() - 1000,
        deadline: Date.now() + 1000000,
        threshold: 3,
        status: 'active' as const
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockBranch));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(existingSession));

      const result = await branchService.voteBranchMerge('branch_123', 'user_456', false);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:branch_123:voting',
        expect.stringContaining('"votesAgainst":["user_456"]')
      );
    });

    it('should mark branch as merge candidate when threshold is met', async () => {
      const existingSession = {
        id: 'voting_123',
        branchId: 'branch_123',
        storyId: 'story_123',
        votingType: 'merge' as const,
        votesFor: ['user_123', 'user_789'],
        votesAgainst: [],
        startedAt: Date.now() - 1000,
        deadline: Date.now() + 1000000,
        threshold: 3,
        status: 'active' as const
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockBranch));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(existingSession));

      const result = await branchService.voteBranchMerge('branch_123', 'user_456', true);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:branch_123:voting',
        expect.stringContaining('"status":"passed"')
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:branch_123',
        expect.stringContaining('"mergeCandidate":true')
      );
    });

    it('should throw error for expired voting session', async () => {
      const expiredSession = {
        id: 'voting_123',
        branchId: 'branch_123',
        storyId: 'story_123',
        votingType: 'merge' as const,
        votesFor: [],
        votesAgainst: [],
        startedAt: Date.now() - 1000000,
        deadline: Date.now() - 1000,
        threshold: 3,
        status: 'active' as const
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockBranch));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(expiredSession));

      await expect(branchService.voteBranchMerge('branch_123', 'user_456', true))
        .rejects.toThrow('Voting session has expired');
    });
  });

  describe('mergeBranch', () => {
    it('should merge branches successfully', async () => {
      const sourceBranch: StoryBranch = {
        ...mockBranch,
        id: 'source_branch',
        name: 'Source Branch',
        mergeCandidate: true,
        popularity: 50
      };

      const targetBranch: StoryBranch = {
        ...mockBranch,
        id: 'target_branch',
        name: 'Target Branch',
        popularity: 100
      };

      const storyWithSentences = {
        ...mockStory,
        sentences: [
          { id: 'sentence_1', branchId: 'source_branch', content: 'Test sentence 1' },
          { id: 'sentence_2', branchId: 'source_branch', content: 'Test sentence 2' },
          { id: 'sentence_3', branchId: 'target_branch', content: 'Test sentence 3' }
        ]
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(sourceBranch));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(targetBranch));
      mockRedis.keys.mockResolvedValueOnce(['story:story_123:branches']);
      mockRedis.sismember.mockResolvedValueOnce(true);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(storyWithSentences));

      const result: MergeResult = await branchService.mergeBranch('source_branch', 'target_branch');

      expect(result.success).toBe(true);
      expect(result.mergedSentences).toBe(2);
      expect(result.message).toContain('Successfully merged Source Branch into Target Branch');

      // Verify source branch is deactivated
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:source_branch',
        expect.stringContaining('"isActive":false')
      );

      // Verify target branch popularity is updated
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:target_branch',
        expect.stringContaining('"popularity":125')
      );
    });

    it('should fail merge when source branch is not merge candidate', async () => {
      const sourceBranch: StoryBranch = {
        ...mockBranch,
        id: 'source_branch',
        mergeCandidate: false
      };

      const targetBranch: StoryBranch = {
        ...mockBranch,
        id: 'target_branch'
      };

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(sourceBranch));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(targetBranch));

      const result: MergeResult = await branchService.mergeBranch('source_branch', 'target_branch');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Source branch is not approved for merging');
    });

    it('should fail merge when branches not found', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.get.mockResolvedValueOnce(null);

      const result: MergeResult = await branchService.mergeBranch('nonexistent_1', 'nonexistent_2');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Source or target branch not found');
    });
  });

  describe('cleanupInactiveBranches', () => {
    it('should deactivate branches with no activity', async () => {
      const oldBranch: StoryBranch = {
        ...mockBranch,
        id: 'old_branch',
        childBranches: []
      };

      const oldEngagement = {
        views: 10,
        contributions: 2,
        votes: 1,
        lastActivity: Date.now() - (8 * 24 * 60 * 60 * 1000) // 8 days ago
      };

      mockRedis.smembers.mockResolvedValueOnce(['old_branch']);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(oldBranch));
      mockRedis.get.mockResolvedValueOnce(null); // No voting session
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(oldEngagement));

      const result = await branchService.cleanupInactiveBranches('story_123');

      expect(result).toContain('old_branch');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:old_branch',
        expect.stringContaining('"isActive":false')
      );
    });

    it('should start voting for branches with children', async () => {
      const branchWithChildren: StoryBranch = {
        ...mockBranch,
        id: 'parent_branch',
        childBranches: ['child_1', 'child_2']
      };

      const oldEngagement = {
        views: 50,
        contributions: 5,
        votes: 10,
        lastActivity: Date.now() - (8 * 24 * 60 * 60 * 1000) // 8 days ago
      };

      mockRedis.smembers.mockResolvedValueOnce(['parent_branch']);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(branchWithChildren));
      mockRedis.get.mockResolvedValueOnce(null); // No voting session
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(oldEngagement));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify([])); // No branching rules

      const result = await branchService.cleanupInactiveBranches('story_123');

      expect(result).toHaveLength(0); // No immediate cleanup
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:parent_branch:voting',
        expect.stringContaining('"votingType":"delete"')
      );
    });

    it('should handle expired voting sessions', async () => {
      const branchWithExpiredVoting: StoryBranch = {
        ...mockBranch,
        id: 'branch_with_voting',
        mergeCandidate: true
      };

      const expiredSession = {
        id: 'voting_123',
        branchId: 'branch_with_voting',
        storyId: 'story_123',
        votingType: 'merge' as const,
        votesFor: ['user_1'],
        votesAgainst: [],
        startedAt: Date.now() - 1000000,
        deadline: Date.now() - 1000,
        threshold: 3,
        status: 'active' as const
      };

      mockRedis.smembers.mockResolvedValueOnce(['branch_with_voting']);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(branchWithExpiredVoting));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(expiredSession));

      await branchService.cleanupInactiveBranches('story_123');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:branch_with_voting:voting',
        expect.stringContaining('"status":"expired"')
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'branch:branch_with_voting',
        expect.stringContaining('"mergeCandidate":false')
      );
    });
  });

  describe('runBranchMaintenance', () => {
    it('should run comprehensive maintenance', async () => {
      // Mock cleanup returning cleaned branches
      const cleanupSpy = vi.spyOn(branchService, 'cleanupInactiveBranches')
        .mockResolvedValueOnce(['cleaned_branch_1']);

      // Mock merge processing returning merge results
      const mergeResults: MergeResult[] = [{
        success: true,
        mergedBranchId: 'merged_branch',
        targetBranchId: 'target_branch',
        mergedSentences: 3,
        message: 'Merge successful'
      }];
      const mergeSpy = vi.spyOn(branchService, 'processApprovedMerges')
        .mockResolvedValueOnce(mergeResults);

      // Mock active branches for popularity update
      mockRedis.smembers.mockResolvedValueOnce(['active_branch_1']);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockBranch));
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({ views: 10, contributions: 2, votes: 5, lastActivity: Date.now() }));

      const result = await branchService.runBranchMaintenance('story_123');

      expect(result.cleanedBranches).toEqual(['cleaned_branch_1']);
      expect(result.mergeResults).toEqual(mergeResults);
      expect(result.message).toContain('1 branches cleaned, 1 merges processed');

      expect(cleanupSpy).toHaveBeenCalledWith('story_123');
      expect(mergeSpy).toHaveBeenCalledWith('story_123');
    });
  });
});