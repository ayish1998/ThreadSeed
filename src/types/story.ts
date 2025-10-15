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
}

export interface StoryMetadata {
  totalContributors: number;
  lastActivity: number;
  theme?: string;
  tags: string[];
  isPublic: boolean;
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