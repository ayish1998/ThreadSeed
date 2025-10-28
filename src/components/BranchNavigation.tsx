//src/components/BranchNavigation.tsx
import { Devvit } from '@devvit/public-api';
import { StoryBranch, BranchTree } from '../types/story.js';

interface BranchNavigationProps {
  currentBranch: StoryBranch;
  branchTree: BranchTree;
  onBranchSelect: (branchId: string) => void;
  onCreateBranch?: () => void;
  showCreateButton?: boolean;
}

interface BreadcrumbProps {
  branchPath: StoryBranch[];
  currentBranchId: string;
  onBranchSelect: (branchId: string) => void;
}

// Breadcrumb navigation component
const BranchBreadcrumb: Devvit.BlockComponent<BreadcrumbProps> = ({
  branchPath,
  currentBranchId,
  onBranchSelect
}) => {
  if (branchPath.length <= 1) {
    return null;
  }

  return (
    <hstack gap="small" alignment="center middle" padding="small">
      <text size="small" color="#7C7C83">Path:</text>
      {branchPath.map((branch, index) => (
        <hstack key={branch.id} gap="small" alignment="center">
          {index > 0 && (
            <text size="small" color="#7C7C83">→</text>
          )}
          <button
            appearance={branch.id === currentBranchId ? 'primary' : 'secondary'}
            size="small"
            onPress={() => onBranchSelect(branch.id)}
          >
            {branch.name}
          </button>
        </hstack>
      ))}
    </hstack>
  );
};

// Main branch navigation component
export const BranchNavigation: Devvit.BlockComponent<BranchNavigationProps> = ({
  currentBranch,
  branchTree,
  onBranchSelect,
  onCreateBranch,
  showCreateButton = false
}) => {
  // Find the current branch path from root to current branch
  const findBranchPath = (tree: BranchTree, targetBranchId: string): StoryBranch[] => {
    const path: StoryBranch[] = [];

    const searchNode = (node: any): boolean => {
      path.push(node.branch);

      if (node.branch.id === targetBranchId) {
        return true;
      }

      for (const child of node.children) {
        if (searchNode(child)) {
          return true;
        }
      }

      path.pop();
      return false;
    };

    for (const rootNode of tree.branches) {
      if (searchNode(rootNode)) {
        break;
      }
    }

    return path;
  };

  // Get sibling branches (branches with the same parent)
  const getSiblingBranches = (): StoryBranch[] => {
    if (!currentBranch.parentBranchId) {
      // Root branch - return all root branches
      return branchTree.branches.map(node => node.branch);
    }

    // Find parent and return its children
    const findParentChildren = (node: any): StoryBranch[] | null => {
      if (node.branch.id === currentBranch.parentBranchId) {
        return node.children.map((child: any) => child.branch);
      }

      for (const child of node.children) {
        const result = findParentChildren(child);
        if (result) return result;
      }

      return null;
    };

    for (const rootNode of branchTree.branches) {
      const siblings = findParentChildren(rootNode);
      if (siblings) return siblings;
    }

    return [];
  };

  // Get child branches
  const getChildBranches = (): StoryBranch[] => {
    const findCurrentNode = (node: any): any => {
      if (node.branch.id === currentBranch.id) {
        return node;
      }

      for (const child of node.children) {
        const result = findCurrentNode(child);
        if (result) return result;
      }

      return null;
    };

    for (const rootNode of branchTree.branches) {
      const currentNode = findCurrentNode(rootNode);
      if (currentNode) {
        return currentNode.children.map((child: any) => child.branch);
      }
    }

    return [];
  };

  const branchPath = findBranchPath(branchTree, currentBranch.id);
  const siblingBranches = getSiblingBranches();
  const childBranches = getChildBranches();

  const getBranchTypeIcon = (branchType: string) => {
    switch (branchType) {
      case 'decision': return '🔀';
      case 'alternative': return '🔄';
      case 'experimental': return '🧪';
      default: return '📝';
    }
  };

  return (
    <vstack gap="medium" padding="medium" backgroundColor="#F8F9FA" cornerRadius="medium">
      {/* Current branch info */}
      <vstack gap="small">
        <hstack gap="medium" alignment="center middle">
          <text size="large" weight="bold">
            {getBranchTypeIcon(currentBranch.branchType)} {currentBranch.name}
          </text>
          <spacer grow />
          {showCreateButton && onCreateBranch ? (
            <button
              appearance="primary"
              size="small"
              onPress={onCreateBranch}
            >
              + New Branch
            </button>
          ) : null}
        </hstack>

        <text size="small" color="#7C7C83">
          {currentBranch.description}
        </text>

        <hstack gap="large" alignment="center middle">
          <text size="small" color="#7C7C83">
            ⭐ {currentBranch.popularity} popularity
          </text>
          <text size="small" color="#7C7C83">
            👥 {currentBranch.childBranches.length} child branches
          </text>
          <text size="small" color="#7C7C83">
            📅 {new Date(currentBranch.createdAt).toLocaleDateString()}
          </text>
        </hstack>
      </vstack>

      {/* Breadcrumb navigation */}
      <BranchBreadcrumb
        branchPath={branchPath}
        currentBranchId={currentBranch.id}
        onBranchSelect={onBranchSelect}
      />

      {/* Sibling branches */}
      {siblingBranches.length > 1 && (
        <vstack gap="small">
          <text size="medium" weight="bold">Alternative Paths</text>
          <hstack gap="small">
            {siblingBranches
              .filter(branch => branch.id !== currentBranch.id)
              .map(branch => (
                <button
                  key={branch.id}
                  appearance="secondary"
                  size="small"
                  onPress={() => onBranchSelect(branch.id)}
                >
                  {getBranchTypeIcon(branch.branchType)} {branch.name}
                </button>
              ))}
          </hstack>
        </vstack>
      )}

      {/* Child branches */}
      {childBranches.length > 0 && (
        <vstack gap="small">
          <text size="medium" weight="bold">Continue Story</text>
          <hstack gap="small">
            {childBranches.map(branch => (
              <button
                key={branch.id}
                appearance="secondary"
                size="small"
                onPress={() => onBranchSelect(branch.id)}
              >
                {getBranchTypeIcon(branch.branchType)} {branch.name}
              </button>
            ))}
          </hstack>
        </vstack>
      )}

      {/* Branch statistics */}
      <hstack gap="medium" alignment="center middle" padding="small" backgroundColor="#FFFFFF" cornerRadius="small">
        <vstack alignment="center" gap="small">
          <text size="small" weight="bold">{branchTree.totalBranches}</text>
          <text size="small" color="#7C7C83">Total Branches</text>
        </vstack>
        <vstack alignment="center" gap="small">
          <text size="small" weight="bold">{branchTree.activeBranches}</text>
          <text size="small" color="#7C7C83">Active</text>
        </vstack>
        <vstack alignment="center" gap="small">
          <text size="small" weight="bold">{branchTree.maxDepth}</text>
          <text size="small" color="#7C7C83">Max Depth</text>
        </vstack>
      </hstack>
    </vstack>
  );
};