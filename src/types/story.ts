// src/types/story.ts
export interface Story {
  id: string;
  title: string;
  subredditName: string;
  createdBy: string;
  createdAt: number;
  status: 'active' | 'completed' | 'archived';
  sentences: StorySentence[];
  branches: StoryBranch[];
  metadata: StoryMetadata;
  // Enhanced fields for requirements 1.3, 7.1, 7.4
  category: StoryCategory;
  description: string;
  estimatedDuration: number; // in minutes
  progressPercentage: number; // 0-100
  trendingScore: number;
  analytics: StoryAnalytics;
  crossPostData: CrossPostData[];
}

export interface StoryCategory {
  id: string;
  name: string;
  description: string;
  template?: StoryTemplate;
  subredditSpecific: boolean;
}

export interface StoryTemplate {
  id: string;
  name: string;
  prompts: string[];
  suggestedTags: string[];
  maxSentences?: number;
  estimatedDuration: number;
  categoryId: string;
}

export interface StoryAnalytics {
  totalViews: number;
  uniqueContributors: number;
  averageSessionDuration: number;
  completionRate: number;
  engagementScore: number;
  peakConcurrentUsers: number;
  lastUpdated: number;
}

export interface CrossPostData {
  subredditName: string;
  postId: string;
  crossPostedAt: number;
  engagementMetrics: {
    upvotes: number;
    comments: number;
    shares: number;
  };
  sourceAttribution: boolean;
}

export interface StorySentence {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  votes: number;
  upvoters: string[];
  downvoters: string[];
  parentSentenceId?: string;
  order: number;
}

export interface StoryBranch {
  id: string;
  name: string;
  description: string;
  startingSentenceId: string;
  isActive: boolean;
  // Enhanced fields for requirements 3.1, 3.2, 3.4
  parentBranchId?: string;
  childBranches: string[];
  popularity: number; // Based on user engagement and votes
  mergeCandidate: boolean;
  branchType: 'decision' | 'alternative' | 'experimental';
  votingDeadline?: number;
  createdAt: number;
  createdBy: string;
}

export interface StoryMetadata {
  totalContributors: number;
  lastActivity: number;
  theme?: string;
  tags: string[];
  isPublic: boolean;

  // ✅ Journey 1 fields - Updated for new flow
  genre?: 'fantasy' | 'scifi' | 'mystery' | 'romance' | 'horror' | 'slice_of_life' | 'other';
  constraint?: string;
  duration?: '3days' | '7days' | '14days' | '30days' | 'ongoing';
  wordLimit?: '100-300' | '300-500' | '500-1000';
  expiresAt?: number; // Timestamp when story auto-completes
}

export interface UserStoryData {
  userId: string;
  username: string;
  contributionCount: number;
  lastContribution: number;
  favoriteStories: string[];
}

// Validation helpers
export const validateSentence = (content: string): boolean => {
  return content.length > 0 && content.length <= 280 && content.trim().length > 0;
};

export const validateStoryTitle = (title: string): boolean => {
  return title.length > 0 && title.length <= 100 && title.trim().length > 0;
};

// Advanced voting system interfaces for requirements 2.1, 2.2, 2.5
export interface WeightedVote {
  id: string;
  userId: string;
  weight: number; // Based on user reputation and subreddit activity
  timestamp: number;
  voteType: 'upvote' | 'downvote' | 'quality' | 'creative';
  sentenceId: string;
  subredditName: string;
}

export interface VotingMetrics {
  sentenceId: string;
  totalVotes: number;
  weightedScore: number;
  qualityRating: number; // 0-10 scale
  controversyScore: number; // Measure of vote distribution
  moderatorOverride?: boolean;
  hiddenBelowThreshold: boolean;
  lastUpdated: number;
}

// Validation functions for weighted voting system
export const validateWeightedVote = (vote: Partial<WeightedVote>): boolean => {
  if (!vote.userId || !vote.sentenceId || !vote.subredditName) {
    return false;
  }

  if (typeof vote.weight !== 'number' || vote.weight < 0.1 || vote.weight > 10) {
    return false;
  }

  const validVoteTypes = ['upvote', 'downvote', 'quality', 'creative'];
  if (!vote.voteType || !validVoteTypes.includes(vote.voteType)) {
    return false;
  }

  return true;
};

export const calculateWeightedScore = (votes: WeightedVote[]): number => {
  if (votes.length === 0) return 0;

  const upvotes = votes.filter(v => v.voteType === 'upvote' || v.voteType === 'quality' || v.voteType === 'creative');
  const downvotes = votes.filter(v => v.voteType === 'downvote');

  const upvoteScore = upvotes.reduce((sum, vote) => sum + vote.weight, 0);
  const downvoteScore = downvotes.reduce((sum, vote) => sum + vote.weight, 0);

  return upvoteScore - downvoteScore;
};

export const calculateControversyScore = (votes: WeightedVote[]): number => {
  if (votes.length < 2) return 0;

  const upvotes = votes.filter(v => v.voteType === 'upvote' || v.voteType === 'quality' || v.voteType === 'creative');
  const downvotes = votes.filter(v => v.voteType === 'downvote');

  if (upvotes.length === 0 || downvotes.length === 0) return 0;

  const upvoteWeight = upvotes.reduce((sum, vote) => sum + vote.weight, 0);
  const downvoteWeight = downvotes.reduce((sum, vote) => sum + vote.weight, 0);

  const totalWeight = upvoteWeight + downvoteWeight;
  const balance = Math.min(upvoteWeight, downvoteWeight) / totalWeight;

  return balance * 2; // Scale to 0-2 range, higher = more controversial
};

// Branching narrative system interfaces for requirements 3.1, 3.2, 3.4
export interface BranchingRule {
  id: string;
  storyId: string;
  triggerCondition: string; // Condition that allows branching
  maxBranches: number; // Maximum concurrent branches
  votingPeriod: number; // Time in minutes for branch voting
  mergeThreshold: number; // Vote threshold for automatic merging
  subredditSpecific: boolean;
}

export interface BranchTree {
  storyId: string;
  rootBranchId: string;
  branches: BranchTreeNode[];
  maxDepth: number;
  totalBranches: number;
  activeBranches: number;
}

export interface BranchTreeNode {
  branch: StoryBranch;
  children: BranchTreeNode[];
  depth: number;
  path: string[]; // Array of branch IDs from root to this node
  isLeaf: boolean;
}

// Validation functions for branching system
export const validateBranchingRule = (rule: Partial<BranchingRule>): boolean => {
  if (!rule.storyId || !rule.triggerCondition) {
    return false;
  }

  if (typeof rule.maxBranches !== 'number' || rule.maxBranches < 1 || rule.maxBranches > 10) {
    return false;
  }

  if (typeof rule.votingPeriod !== 'number' || rule.votingPeriod < 60 || rule.votingPeriod > 10080) { // 1 hour to 1 week
    return false;
  }

  if (typeof rule.mergeThreshold !== 'number' || rule.mergeThreshold < 1) {
    return false;
  }

  return true;
};

export const validateBranchHierarchy = (branches: StoryBranch[]): boolean => {
  const branchIds = new Set(branches.map(b => b.id));

  // Check for circular references and orphaned branches
  for (const branch of branches) {
    if (branch.parentBranchId && !branchIds.has(branch.parentBranchId)) {
      return false; // Parent doesn't exist
    }

    // Check for circular references
    const visited = new Set<string>();
    let currentId: string | undefined = branch.parentBranchId;

    while (currentId) {
      if (visited.has(currentId)) {
        return false; // Circular reference detected
      }
      visited.add(currentId);
      const parent = branches.find(b => b.id === currentId);
      currentId = parent?.parentBranchId;
    }
  }

  return true;
};

export const buildBranchTree = (branches: StoryBranch[], rootBranchId: string): BranchTree => {
  const branchMap = new Map(branches.map(b => [b.id, b]));
  const rootBranch = branchMap.get(rootBranchId);

  if (!rootBranch) {
    throw new Error(`Root branch ${rootBranchId} not found`);
  }

  const buildNode = (branchId: string, depth: number, path: string[]): BranchTreeNode => {
    const branch = branchMap.get(branchId);
    if (!branch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    const children = branch.childBranches
      .map(childId => buildNode(childId, depth + 1, [...path, branchId]))
      .filter(Boolean);

    return {
      branch,
      children,
      depth,
      path: [...path, branchId],
      isLeaf: children.length === 0
    };
  };

  const rootNode = buildNode(rootBranchId, 0, []);
  const allNodes = [rootNode];

  const collectNodes = (node: BranchTreeNode) => {
    allNodes.push(...node.children);
    node.children.forEach(collectNodes);
  };

  collectNodes(rootNode);

  return {
    storyId: rootBranch.startingSentenceId, // Assuming story ID can be derived
    rootBranchId,
    branches: [rootNode],
    maxDepth: Math.max(...allNodes.map(n => n.depth)),
    totalBranches: allNodes.length,
    activeBranches: allNodes.filter(n => n.branch.isActive).length
  };
};

// Gamification system interfaces for requirements 4.1, 4.2, 4.3, 4.5
export interface UserProfile {
  userId: string;
  username: string;
  reputation: number;
  level: number;
  badges: Badge[];
  achievements: Achievement[];
  statistics: UserStatistics;
  preferences: UserPreferences;
  joinedAt: number;
  lastActive: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  earnedAt: number;
  category: 'storytelling' | 'community' | 'quality' | 'participation' | 'special';
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  progress: number;
  maxProgress: number;
  reward: AchievementReward;
  category: string;
  isCompleted: boolean;
  completedAt?: number;
  requirements: AchievementRequirement[];
}

export interface AchievementReward {
  type: 'badge' | 'reputation' | 'title' | 'feature_unlock';
  value: string | number;
  description: string;
}

export interface AchievementRequirement {
  type: 'sentence_count' | 'vote_score' | 'story_completion' | 'consecutive_days' | 'community_engagement';
  target: number;
  current: number;
}

export interface UserStatistics {
  totalSentences: number;
  totalVotes: number;
  averageVoteScore: number;
  storiesStarted: number;
  storiesCompleted: number;
  branchesCreated: number;
  daysActive: number;
  longestStreak: number;
  currentStreak: number;
  favoriteCategories: string[];
  totalReputation: number;
}

export interface UserPreferences {
  notifications: {
    storyUpdates: boolean;
    achievements: boolean;
    mentions: boolean;
    weeklyDigest: boolean;
  };
  privacy: {
    showProfile: boolean;
    showStatistics: boolean;
    showBadges: boolean;
  };
  interface: {
    theme: 'light' | 'dark' | 'auto';
    compactMode: boolean;
    showTypingIndicators: boolean;
  };
}

// Validation functions for gamification system
export const validateUserProfile = (profile: Partial<UserProfile>): boolean => {
  if (!profile.userId || !profile.username) {
    return false;
  }

  if (typeof profile.reputation !== 'number' || profile.reputation < 0) {
    return false;
  }

  if (typeof profile.level !== 'number' || profile.level < 1 || profile.level > 100) {
    return false;
  }

  return true;
};

export const validateBadge = (badge: Partial<Badge>): boolean => {
  if (!badge.id || !badge.name || !badge.description) {
    return false;
  }

  const validRarities = ['common', 'rare', 'epic', 'legendary'];
  if (!badge.rarity || !validRarities.includes(badge.rarity)) {
    return false;
  }

  const validCategories = ['storytelling', 'community', 'quality', 'participation', 'special'];
  if (!badge.category || !validCategories.includes(badge.category)) {
    return false;
  }

  return true;
};

export const calculateUserLevel = (reputation: number): number => {
  // Level calculation: Level = floor(sqrt(reputation / 100)) + 1
  // This creates a curve where higher levels require exponentially more reputation
  return Math.floor(Math.sqrt(reputation / 100)) + 1;
};

export const calculateReputationForLevel = (level: number): number => {
  // Inverse of level calculation
  return Math.pow(level - 1, 2) * 100;
};

export const updateAchievementProgress = (
  achievement: Achievement,
  userStats: UserStatistics
): Achievement => {
  const updatedRequirements = achievement.requirements.map(req => {
    let current = 0;

    switch (req.type) {
      case 'sentence_count':
        current = userStats.totalSentences;
        break;
      case 'vote_score':
        current = userStats.totalVotes;
        break;
      case 'story_completion':
        current = userStats.storiesCompleted;
        break;
      case 'consecutive_days':
        current = userStats.currentStreak;
        break;
      case 'community_engagement':
        current = userStats.totalReputation;
        break;
    }

    return { ...req, current: Math.min(current, req.target) };
  });

  const totalProgress = updatedRequirements.reduce((sum, req) => sum + req.current, 0);
  const maxProgress = updatedRequirements.reduce((sum, req) => sum + req.target, 0);
  const isCompleted = updatedRequirements.every(req => req.current >= req.target);

  return {
    ...achievement,
    requirements: updatedRequirements,
    progress: totalProgress,
    maxProgress,
    isCompleted,
    completedAt: isCompleted && !achievement.isCompleted ? Date.now() : achievement.completedAt
  };
};

// Simultaneous submission handling interfaces for requirement 5.3
export interface SentenceSubmission {
  id: string;
  storyId: string;
  branchId?: string;
  content: string;
  authorId: string;
  authorName: string;
  submittedAt: number;
  position: number; // Position in story where sentence should be inserted
  metadata?: Record<string, any>;
}

export interface VotingSession {
  id: string;
  storyId: string;
  branchId?: string;
  position: number;
  submissions: SentenceSubmission[];
  votes: SubmissionVote[];
  status: 'active' | 'completed' | 'expired';
  createdAt: number;
  expiresAt: number;
  winningSubmissionId?: string;
  participantCount: number;
  requiredVotes: number;
}

export interface SubmissionVote {
  id: string;
  votingSessionId: string;
  submissionId: string;
  userId: string;
  weight: number; // Based on user reputation
  timestamp: number;
  voteType: 'approve' | 'reject' | 'neutral';
}

export interface SubmissionQueue {
  storyId: string;
  branchId?: string;
  position: number;
  submissions: SentenceSubmission[];
  queuedAt: number;
  processingStatus: 'queued' | 'voting' | 'resolved' | 'expired';
  votingSessionId?: string;
}

export interface ConflictResolution {
  id: string;
  storyId: string;
  conflictType: 'simultaneous_submission' | 'edit_conflict' | 'branch_merge';
  submissions: SentenceSubmission[];
  resolutionMethod: 'community_vote' | 'first_submission' | 'moderator_decision' | 'merge_content';
  resolvedAt?: number;
  resolvedBy?: string;
  result?: {
    selectedSubmissionId?: string;
    mergedContent?: string;
    reason: string;
  };
}

// Validation functions for simultaneous submission system
export const validateSentenceSubmission = (submission: Partial<SentenceSubmission>): boolean => {
  if (!submission.storyId || !submission.content || !submission.authorId || !submission.authorName) {
    return false;
  }

  if (!validateSentence(submission.content)) {
    return false;
  }

  if (typeof submission.position !== 'number' || submission.position < 0) {
    return false;
  }

  return true;
};

export const validateVotingSession = (session: Partial<VotingSession>): boolean => {
  if (!session.storyId || !session.submissions || session.submissions.length === 0) {
    return false;
  }

  if (typeof session.position !== 'number' || session.position < 0) {
    return false;
  }

  if (typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()) {
    return false;
  }

  const validStatuses = ['active', 'completed', 'expired'];
  if (!session.status || !validStatuses.includes(session.status)) {
    return false;
  }

  return true;
};

export const calculateSubmissionScore = (
  submissionId: string,
  votes: SubmissionVote[]
): { score: number; approvals: number; rejections: number; neutrals: number } => {
  const submissionVotes = votes.filter(v => v.submissionId === submissionId);

  let score = 0;
  let approvals = 0;
  let rejections = 0;
  let neutrals = 0;

  for (const vote of submissionVotes) {
    switch (vote.voteType) {
      case 'approve':
        score += vote.weight;
        approvals++;
        break;
      case 'reject':
        score -= vote.weight;
        rejections++;
        break;
      case 'neutral':
        neutrals++;
        break;
    }
  }

  return { score, approvals, rejections, neutrals };
};

export const determineWinningSubmission = (
  submissions: SentenceSubmission[],
  votes: SubmissionVote[]
): string | null => {
  if (submissions.length === 0) return null;
  if (submissions.length === 1) return submissions[0].id;

  let bestSubmissionId = submissions[0].id;
  let bestScore = -Infinity;

  for (const submission of submissions) {
    const { score } = calculateSubmissionScore(submission.id, votes);

    if (score > bestScore) {
      bestScore = score;
      bestSubmissionId = submission.id;
    }
  }

  // Require positive score to win
  return bestScore > 0 ? bestSubmissionId : null;
};