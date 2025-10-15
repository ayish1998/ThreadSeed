import { Context } from '@devvit/public-api';
import { 
  StoryBranch, 
  BranchTree, 
  BranchTreeNode, 
  BranchingRule,
  validateBranchingRule,
  validateBranchHierarchy,
  buildBranchTree
} from '../types/story.js';

// Branch creation parameters
export interface CreateBranchParams {
  storyId: string;
  name: string;
  description: string;
  startingSentenceId: string;
  parentBranchId?: string;
  branchType: 'decision' | 'alternative' | 'experimental';
  createdBy: string;
}

// Branch merging parameters
export interface MergeResult {
  success: boolean;
  mergedBranchId: string;
  targetBranchId: string;
  mergedSentences: number;
  message: string;
}

// Branch voting session for community-driven merging
export interface BranchVotingSession {
  id: string;
  branchId: string;
  storyId: string;
  votingType: 'merge' | 'keep_separate' | 'delete';
  votesFor: string[]; // User IDs who voted for the action
  votesAgainst: string[]; // User IDs who voted against the action
  startedAt: number;
  deadline: number;
  threshold: number; // Minimum votes needed for action
  status: 'active' | 'passed' | 'failed' | 'expired';
}

export class BranchService {
  private context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  // Create a new story branch
  async createBranch(params: CreateBranchParams): Promise<StoryBranch> {
    const {
      storyId,
      name,
      description,
      startingSentenceId,
      parentBranchId,
      branchType,
      createdBy
    } = params;

    try {
      // Validate story exists
      const storyData = await this.context.redis.get(`story:${storyId}`);
      if (!storyData) {
        throw new Error('Story not found');
      }

      const story = JSON.parse(storyData);
      
      // Check if story is active
      if (story.status !== 'active') {
        throw new Error('Cannot create branches for inactive stories');
      }

      // Validate parent branch exists if specified
      if (parentBranchId) {
        const parentBranch = await this.getBranch(parentBranchId);
        if (!parentBranch) {
          throw new Error('Parent branch not found');
        }
        
        // Check if parent branch belongs to the same story
        const parentStoryBranches = story.branches || [];
        if (!parentStoryBranches.some((b: StoryBranch) => b.id === parentBranchId)) {
          throw new Error('Parent branch does not belong to this story');
        }
      }

      // Get branching rules for the story
      const branchingRules = await this.getBranchingRules(storyId);
      const activeRule = branchingRules.find(rule => rule.storyId === storyId);
      
      // Check branch limits
      if (activeRule) {
        const currentBranches = await this.getActiveBranches(storyId);
        if (currentBranches.length >= activeRule.maxBranches) {
          throw new Error(`Maximum number of branches (${activeRule.maxBranches}) reached for this story`);
        }
      }

      // Create new branch
      const branchId = `branch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newBranch: StoryBranch = {
        id: branchId,
        name: name.trim(),
        description: description.trim(),
        startingSentenceId,
        isActive: true,
        parentBranchId,
        childBranches: [],
        popularity: 0,
        mergeCandidate: false,
        branchType,
        createdAt: Date.now(),
        createdBy
      };

      // Update parent branch's children if applicable
      if (parentBranchId) {
        const parentBranch = await this.getBranch(parentBranchId);
        if (parentBranch) {
          parentBranch.childBranches.push(branchId);
          await this.context.redis.set(`branch:${parentBranchId}`, JSON.stringify(parentBranch));
        }
      }

      // Save branch
      await this.context.redis.set(`branch:${branchId}`, JSON.stringify(newBranch));
      
      // Add branch to story
      story.branches = story.branches || [];
      story.branches.push(newBranch);
      await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));
      
      // Add to story's branch index
      await this.context.redis.sadd(`story:${storyId}:branches`, branchId);
      
      // Add to active branches index
      await this.context.redis.sadd(`story:${storyId}:branches:active`, branchId);

      console.log(`Created branch ${branchId} for story ${storyId}`);
      return newBranch;

    } catch (error) {
      console.error('Failed to create branch:', error);
      throw error;
    }
  }

  // Get a specific branch by ID
  async getBranch(branchId: string): Promise<StoryBranch | null> {
    try {
      const branchData = await this.context.redis.get(`branch:${branchId}`);
      return branchData ? JSON.parse(branchData) : null;
    } catch (error) {
      console.error('Failed to get branch:', error);
      return null;
    }
  }

  // Get all branches for a story
  async getStoryBranches(storyId: string): Promise<StoryBranch[]> {
    try {
      const branchIds = await this.context.redis.smembers(`story:${storyId}:branches`);
      const branches: StoryBranch[] = [];

      for (const branchId of branchIds) {
        const branch = await this.getBranch(branchId);
        if (branch) {
          branches.push(branch);
        }
      }

      return branches;
    } catch (error) {
      console.error('Failed to get story branches:', error);
      return [];
    }
  }

  // Get active branches for a story
  async getActiveBranches(storyId: string): Promise<StoryBranch[]> {
    try {
      const activeBranchIds = await this.context.redis.smembers(`story:${storyId}:branches:active`);
      const branches: StoryBranch[] = [];

      for (const branchId of activeBranchIds) {
        const branch = await this.getBranch(branchId);
        if (branch && branch.isActive) {
          branches.push(branch);
        }
      }

      return branches;
    } catch (error) {
      console.error('Failed to get active branches:', error);
      return [];
    }
  }

  // Build hierarchical branch tree for visualization
  async getBranchTree(storyId: string): Promise<BranchTree | null> {
    try {
      const branches = await this.getStoryBranches(storyId);
      
      if (branches.length === 0) {
        return null;
      }

      // Validate branch hierarchy
      if (!validateBranchHierarchy(branches)) {
        console.error('Invalid branch hierarchy detected for story:', storyId);
        return null;
      }

      // Find root branch (branch without parent)
      const rootBranch = branches.find(b => !b.parentBranchId);
      if (!rootBranch) {
        console.error('No root branch found for story:', storyId);
        return null;
      }

      // Build tree using the utility function from types
      return buildBranchTree(branches, rootBranch.id);

    } catch (error) {
      console.error('Failed to build branch tree:', error);
      return null;
    }
  }

  // Update branch popularity based on user engagement and votes
  async updateBranchPopularity(branchId: string): Promise<boolean> {
    try {
      const branch = await this.getBranch(branchId);
      if (!branch) {
        return false;
      }

      // Get branch engagement metrics
      const engagementData = await this.context.redis.get(`branch:${branchId}:engagement`);
      const engagement = engagementData ? JSON.parse(engagementData) : {
        views: 0,
        contributions: 0,
        votes: 0,
        lastActivity: Date.now()
      };

      // Calculate popularity score based on multiple factors
      let popularityScore = 0;

      // Recent activity weight (more recent = higher score)
      const now = Date.now();
      const daysSinceActivity = (now - engagement.lastActivity) / (1000 * 60 * 60 * 24);
      const activityRecency = Math.max(0, 1 - (daysSinceActivity / 7)); // Decay over 7 days
      popularityScore += activityRecency * 30;

      // Contribution count
      popularityScore += engagement.contributions * 10;

      // Vote score
      popularityScore += Math.max(0, engagement.votes) * 5;

      // View count (with diminishing returns)
      popularityScore += Math.log(engagement.views + 1) * 2;

      // Child branch bonus (branches that spawn more branches are more popular)
      popularityScore += branch.childBranches.length * 15;

      // Update branch popularity
      branch.popularity = Math.round(popularityScore);
      await this.context.redis.set(`branch:${branchId}`, JSON.stringify(branch));

      return true;

    } catch (error) {
      console.error('Failed to update branch popularity:', error);
      return false;
    }
  }

  // Track branch engagement (views, contributions, votes)
  async trackBranchEngagement(
    branchId: string, 
    engagementType: 'view' | 'contribution' | 'vote',
    value: number = 1
  ): Promise<boolean> {
    try {
      const engagementKey = `branch:${branchId}:engagement`;
      const engagementData = await this.context.redis.get(engagementKey);
      const engagement = engagementData ? JSON.parse(engagementData) : {
        views: 0,
        contributions: 0,
        votes: 0,
        lastActivity: Date.now()
      };

      // Update engagement metrics
      switch (engagementType) {
        case 'view':
          engagement.views += value;
          break;
        case 'contribution':
          engagement.contributions += value;
          engagement.lastActivity = Date.now();
          break;
        case 'vote':
          engagement.votes += value;
          engagement.lastActivity = Date.now();
          break;
      }

      // Save updated engagement data
      await this.context.redis.set(engagementKey, JSON.stringify(engagement));

      // Update branch popularity
      await this.updateBranchPopularity(branchId);

      return true;

    } catch (error) {
      console.error('Failed to track branch engagement:', error);
      return false;
    }
  }

  // Get branching rules for a story
  async getBranchingRules(storyId: string): Promise<BranchingRule[]> {
    try {
      const rulesData = await this.context.redis.get(`story:${storyId}:branching:rules`);
      return rulesData ? JSON.parse(rulesData) : [];
    } catch (error) {
      console.error('Failed to get branching rules:', error);
      return [];
    }
  }

  // Create or update branching rules for a story
  async setBranchingRules(storyId: string, rules: BranchingRule[]): Promise<boolean> {
    try {
      // Validate all rules
      for (const rule of rules) {
        if (!validateBranchingRule(rule)) {
          throw new Error(`Invalid branching rule: ${JSON.stringify(rule)}`);
        }
      }

      await this.context.redis.set(`story:${storyId}:branching:rules`, JSON.stringify(rules));
      return true;

    } catch (error) {
      console.error('Failed to set branching rules:', error);
      return false;
    }
  }

  // Get default branching rules
  getDefaultBranchingRules(storyId: string): BranchingRule[] {
    return [
      {
        id: `rule_${storyId}_default`,
        storyId,
        triggerCondition: 'any_sentence', // Allow branching from any sentence
        maxBranches: 5, // Maximum 5 concurrent branches
        votingPeriod: 4320, // 3 days in minutes
        mergeThreshold: 3, // Need 3 votes to merge
        subredditSpecific: false
      }
    ];
  }

  // Deactivate a branch (soft delete)
  async deactivateBranch(branchId: string, reason?: string): Promise<boolean> {
    try {
      const branch = await this.getBranch(branchId);
      if (!branch) {
        return false;
      }

      // Mark branch as inactive
      branch.isActive = false;
      await this.context.redis.set(`branch:${branchId}`, JSON.stringify(branch));

      // Remove from active branches index
      const storyId = await this.getStoryIdForBranch(branchId);
      if (storyId) {
        await this.context.redis.srem(`story:${storyId}:branches:active`, branchId);
      }

      // Log deactivation
      console.log(`Deactivated branch ${branchId}${reason ? ` (${reason})` : ''}`);

      return true;

    } catch (error) {
      console.error('Failed to deactivate branch:', error);
      return false;
    }
  }

  // Helper method to get story ID for a branch
  private async getStoryIdForBranch(branchId: string): Promise<string | null> {
    try {
      // Search through story branch indices to find which story contains this branch
      const storyKeys = await this.context.redis.keys('story:*:branches');
      
      for (const key of storyKeys) {
        const isMember = await this.context.redis.sismember(key, branchId);
        if (isMember) {
          // Extract story ID from key pattern: story:{storyId}:branches
          const storyId = key.split(':')[1];
          return storyId;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get story ID for branch:', error);
      return null;
    }
  }

  // Community-driven branch merging system

  // Vote for branch merge
  async voteBranchMerge(branchId: string, userId: string, approve: boolean): Promise<boolean> {
    try {
      const branch = await this.getBranch(branchId);
      if (!branch) {
        throw new Error('Branch not found');
      }

      if (!branch.isActive) {
        throw new Error('Cannot vote on inactive branch');
      }

      // Get or create voting session
      let votingSession = await this.getBranchVotingSession(branchId);
      if (!votingSession) {
        // Create new voting session
        const storyId = await this.getStoryIdForBranch(branchId) || '';
        const branchingRules = await this.getBranchingRules(storyId);
        const activeRule = branchingRules.find(rule => rule.storyId === storyId);
        const votingPeriod = activeRule?.votingPeriod || 4320; // Default 3 days
        const threshold = activeRule?.mergeThreshold || 3; // Default 3 votes

        votingSession = await this.createBranchVotingSession(branchId, 'merge', votingPeriod, threshold);
      }

      // Check if voting session is still active
      if (votingSession.status !== 'active' || Date.now() > votingSession.deadline) {
        throw new Error('Voting session has expired');
      }

      // Remove user's previous vote if exists
      votingSession.votesFor = votingSession.votesFor.filter(id => id !== userId);
      votingSession.votesAgainst = votingSession.votesAgainst.filter(id => id !== userId);

      // Add new vote
      if (approve) {
        votingSession.votesFor.push(userId);
      } else {
        votingSession.votesAgainst.push(userId);
      }

      // Check if threshold is met
      const totalVotes = votingSession.votesFor.length + votingSession.votesAgainst.length;
      const approvalVotes = votingSession.votesFor.length;
      
      if (totalVotes >= votingSession.threshold) {
        const approvalRatio = approvalVotes / totalVotes;
        
        if (approvalRatio >= 0.6) { // 60% approval needed
          votingSession.status = 'passed';
          branch.mergeCandidate = true;
          await this.context.redis.set(`branch:${branchId}`, JSON.stringify(branch));
        } else {
          votingSession.status = 'failed';
        }
      }

      // Save voting session
      await this.context.redis.set(`branch:${branchId}:voting`, JSON.stringify(votingSession));

      console.log(`User ${userId} voted ${approve ? 'for' : 'against'} merging branch ${branchId}`);
      return true;

    } catch (error) {
      console.error('Failed to vote on branch merge:', error);
      throw error;
    }
  }

  // Create a voting session for branch actions
  async createBranchVotingSession(
    branchId: string, 
    votingType: 'merge' | 'keep_separate' | 'delete',
    votingPeriodMinutes: number,
    threshold: number
  ): Promise<BranchVotingSession> {
    const sessionId = `voting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const storyId = await this.getStoryIdForBranch(branchId);
    
    const votingSession: BranchVotingSession = {
      id: sessionId,
      branchId,
      storyId: storyId || '',
      votingType,
      votesFor: [],
      votesAgainst: [],
      startedAt: Date.now(),
      deadline: Date.now() + (votingPeriodMinutes * 60 * 1000),
      threshold,
      status: 'active'
    };

    await this.context.redis.set(`branch:${branchId}:voting`, JSON.stringify(votingSession));
    return votingSession;
  }

  // Get voting session for a branch
  async getBranchVotingSession(branchId: string): Promise<BranchVotingSession | null> {
    try {
      const sessionData = await this.context.redis.get(`branch:${branchId}:voting`);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      console.error('Failed to get voting session:', error);
      return null;
    }
  }

  // Merge branch into target branch
  async mergeBranch(branchId: string, targetBranchId: string): Promise<MergeResult> {
    try {
      const sourceBranch = await this.getBranch(branchId);
      const targetBranch = await this.getBranch(targetBranchId);

      if (!sourceBranch || !targetBranch) {
        return {
          success: false,
          mergedBranchId: branchId,
          targetBranchId,
          mergedSentences: 0,
          message: 'Source or target branch not found'
        };
      }

      // Validate merge conditions
      if (!sourceBranch.mergeCandidate) {
        return {
          success: false,
          mergedBranchId: branchId,
          targetBranchId,
          mergedSentences: 0,
          message: 'Source branch is not approved for merging'
        };
      }

      const storyId = await this.getStoryIdForBranch(branchId);
      if (!storyId) {
        return {
          success: false,
          mergedBranchId: branchId,
          targetBranchId,
          mergedSentences: 0,
          message: 'Could not determine story for branch'
        };
      }

      // Get story data
      const storyData = await this.context.redis.get(`story:${storyId}`);
      if (!storyData) {
        return {
          success: false,
          mergedBranchId: branchId,
          targetBranchId,
          mergedSentences: 0,
          message: 'Story not found'
        };
      }

      const story = JSON.parse(storyData);

      // Get sentences from source branch
      const sourceSentences = story.sentences.filter((sentence: any) => 
        sentence.branchId === branchId
      );

      // Merge sentences into target branch
      let mergedCount = 0;
      for (const sentence of sourceSentences) {
        // Update sentence to belong to target branch
        sentence.branchId = targetBranchId;
        sentence.mergedFrom = branchId;
        sentence.mergedAt = Date.now();
        mergedCount++;
      }

      // Update target branch popularity
      targetBranch.popularity += Math.floor(sourceBranch.popularity * 0.5);
      await this.context.redis.set(`branch:${targetBranchId}`, JSON.stringify(targetBranch));

      // Deactivate source branch
      sourceBranch.isActive = false;
      sourceBranch.mergedInto = targetBranchId;
      sourceBranch.mergedAt = Date.now();
      await this.context.redis.set(`branch:${branchId}`, JSON.stringify(sourceBranch));

      // Update story
      await this.context.redis.set(`story:${storyId}`, JSON.stringify(story));

      // Remove from active branches
      await this.context.redis.srem(`story:${storyId}:branches:active`, branchId);

      // Clean up voting session
      await this.context.redis.del(`branch:${branchId}:voting`);

      console.log(`Merged branch ${branchId} into ${targetBranchId} (${mergedCount} sentences)`);

      return {
        success: true,
        mergedBranchId: branchId,
        targetBranchId,
        mergedSentences: mergedCount,
        message: `Successfully merged ${sourceBranch.name} into ${targetBranch.name}`
      };

    } catch (error) {
      console.error('Failed to merge branch:', error);
      return {
        success: false,
        mergedBranchId: branchId,
        targetBranchId,
        mergedSentences: 0,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // Automatic branch cleanup for inactive branches
  async cleanupInactiveBranches(storyId: string): Promise<string[]> {
    try {
      const branches = await this.getStoryBranches(storyId);
      const cleanedBranches: string[] = [];
      const now = Date.now();
      const inactivityThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days

      for (const branch of branches) {
        if (!branch.isActive) continue;

        // Check if branch has voting session
        const votingSession = await this.getBranchVotingSession(branch.id);
        
        // Clean up expired voting sessions
        if (votingSession && votingSession.status === 'active' && now > votingSession.deadline) {
          votingSession.status = 'expired';
          await this.context.redis.set(`branch:${branch.id}:voting`, JSON.stringify(votingSession));
          
          // Reset merge candidate status if voting expired without approval
          if (branch.mergeCandidate) {
            branch.mergeCandidate = false;
            await this.context.redis.set(`branch:${branch.id}`, JSON.stringify(branch));
          }
        }

        // Check for inactive branches (no engagement for threshold period)
        const engagementData = await this.context.redis.get(`branch:${branch.id}:engagement`);
        const engagement = engagementData ? JSON.parse(engagementData) : { lastActivity: branch.createdAt };
        
        const timeSinceActivity = now - engagement.lastActivity;
        
        if (timeSinceActivity > inactivityThreshold) {
          // Check if branch has any child branches
          if (branch.childBranches.length === 0) {
            // No child branches - safe to deactivate
            await this.deactivateBranch(branch.id, 'Automatic cleanup - inactive for 7 days');
            cleanedBranches.push(branch.id);
          } else {
            // Has child branches - mark for potential merging
            if (!branch.mergeCandidate && !votingSession) {
              // Start community voting for cleanup
              const branchingRules = await this.getBranchingRules(storyId);
              const activeRule = branchingRules.find(rule => rule.storyId === storyId);
              const votingPeriod = activeRule?.votingPeriod || 4320; // Default 3 days
              const threshold = Math.max(2, Math.floor((activeRule?.mergeThreshold || 3) * 0.7)); // Lower threshold for cleanup
              
              await this.createBranchVotingSession(branch.id, 'delete', votingPeriod, threshold);
              console.log(`Started cleanup voting for inactive branch: ${branch.id}`);
            }
          }
        }
      }

      return cleanedBranches;

    } catch (error) {
      console.error('Failed to cleanup inactive branches:', error);
      return [];
    }
  }

  // Auto-merge approved branches
  async processApprovedMerges(storyId: string): Promise<MergeResult[]> {
    try {
      const branches = await this.getStoryBranches(storyId);
      const mergeResults: MergeResult[] = [];

      for (const branch of branches) {
        if (!branch.isActive || !branch.mergeCandidate) continue;

        const votingSession = await this.getBranchVotingSession(branch.id);
        if (!votingSession || votingSession.status !== 'passed') continue;

        // Find best target branch for merging
        let targetBranchId = branch.parentBranchId;
        
        // If no parent, try to find the most popular sibling or root branch
        if (!targetBranchId) {
          const rootBranches = branches.filter(b => !b.parentBranchId && b.id !== branch.id && b.isActive);
          if (rootBranches.length > 0) {
            targetBranchId = rootBranches.sort((a, b) => b.popularity - a.popularity)[0].id;
          }
        }

        if (targetBranchId) {
          const result = await this.mergeBranch(branch.id, targetBranchId);
          mergeResults.push(result);
          
          if (result.success) {
            console.log(`Auto-merged branch ${branch.id} into ${targetBranchId}`);
          }
        }
      }

      return mergeResults;

    } catch (error) {
      console.error('Failed to process approved merges:', error);
      return [];
    }
  }

  // Run comprehensive branch maintenance
  async runBranchMaintenance(storyId: string): Promise<{
    cleanedBranches: string[];
    mergeResults: MergeResult[];
    message: string;
  }> {
    try {
      console.log(`Running branch maintenance for story: ${storyId}`);

      // Clean up inactive branches
      const cleanedBranches = await this.cleanupInactiveBranches(storyId);

      // Process approved merges
      const mergeResults = await this.processApprovedMerges(storyId);

      // Update all branch popularity scores
      const branches = await this.getActiveBranches(storyId);
      for (const branch of branches) {
        await this.updateBranchPopularity(branch.id);
      }

      const message = `Maintenance completed: ${cleanedBranches.length} branches cleaned, ${mergeResults.length} merges processed`;
      console.log(message);

      return {
        cleanedBranches,
        mergeResults,
        message
      };

    } catch (error) {
      console.error('Failed to run branch maintenance:', error);
      return {
        cleanedBranches: [],
        mergeResults: [],
        message: 'Maintenance failed: ' + (error instanceof Error ? error.message : 'Unknown error')
      };
    }
  }
}