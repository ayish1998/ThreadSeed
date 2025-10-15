# StoryWeave Data Model Specification

## Overview
Define the data structures and Redis storage patterns for StoryWeave's collaborative storytelling system.

## Requirements

### Story Structure
- Each story has a unique ID and metadata
- Stories contain ordered sentences with voting data
- Support for branching narratives
- Track contributors and their contributions

### Data Models

#### Story
```typescript
interface Story {
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
```

#### StorySentence
```typescript
interface StorySentence {
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
```

#### StoryBranch
```typescript
interface StoryBranch {
  id: string;
  name: string;
  description: string;
  startingSentenceId: string;
  isActive: boolean;
}
```

### Redis Storage Pattern
- `story:{storyId}` - Main story data
- `story:{storyId}:sentences` - Ordered list of sentence IDs
- `sentence:{sentenceId}` - Individual sentence data
- `user:{userId}:stories` - User's story participation
- `subreddit:{subredditName}:stories` - Subreddit's active stories

## Implementation Tasks
1. Create TypeScript interfaces
2. Implement Redis storage helpers
3. Add data validation functions
4. Create migration utilities
5. Add caching layer for performance

## Success Criteria
- Type-safe data operations
- Efficient Redis queries
- Support for real-time updates
- Scalable to hundreds of concurrent users