//src/components/BranchTree.tsx
import { Devvit } from '@devvit/public-api';
import { BranchTree, BranchTreeNode, StoryBranch } from '../types/story.js';

interface BranchTreeProps {
  branchTree: BranchTree;
  currentBranchId?: string;
  onBranchSelect: (branchId: string) => void;
  onCreateBranch?: (parentBranchId: string) => void;
  showCreateButton?: boolean;
}

interface BranchNodeProps {
  node: BranchTreeNode;
  currentBranchId?: string;
  onBranchSelect: (branchId: string) => void;
  onCreateBranch?: (parentBranchId: string) => void;
  showCreateButton?: boolean;
  level: number;
}

// Individual branch node component
const BranchNode: Devvit.BlockComponent<BranchNodeProps> = ({
  node,
  currentBranchId,
  onBranchSelect,
  onCreateBranch,
  showCreateButton = false,
  level
}) => {
  const { branch } = node;
  const isSelected = currentBranchId === branch.id;
  const isActive = branch.isActive;

  // Calculate indentation based on tree level
  const indentWidth = level * 20;

  // Branch status indicator
  const getStatusColor = () => {
    if (!isActive) return '#666666';
    if (isSelected) return '#0079D3';
    if (branch.mergeCandidate) return '#FF8717';
    return '#46D160';
  };

  const getStatusText = () => {
    if (!isActive) return 'Inactive';
    if (branch.mergeCandidate) return 'Merge Candidate';
    return 'Active';
  };

  const getBranchTypeIcon = () => {
    switch (branch.branchType) {
      case 'decision': return '🔀';
      case 'alternative': return '🔄';
      case 'experimental': return '🧪';
      default: return '📝';
    }
  };

  return (
    <vstack gap="small" padding="small">
      {/* Branch node */}
      <hstack
        gap="medium"
        alignment="center middle"
        padding="medium"
        backgroundColor={isSelected ? '#E3F2FD' : 'transparent'}
        cornerRadius="small"
        border={isSelected ? 'thick' : 'thin'}
        borderColor={isSelected ? '#0079D3' : '#E0E0E0'}
        onPress={() => onBranchSelect(branch.id)}
      >
        {/* Indentation spacer */}
        {level > 0 && <spacer width={indentWidth} />}

        {/* Branch type icon */}
        <text size="medium">{getBranchTypeIcon()}</text>

        {/* Branch info */}
        <vstack gap="small" grow>
          <hstack gap="small" alignment="center middle">
            <text
              size="medium"
              weight="bold"
              color={isSelected ? '#0079D3' : '#1A1A1B'}
            >
              {branch.name}
            </text>
            <text
              size="small"
              color={getStatusColor()}
              weight="bold"
            >
              {getStatusText()}
            </text>
          </hstack>

          <text size="small" color="#7C7C83">
            {branch.description}
          </text>

          {/* Branch metrics */}
          <hstack gap="medium" alignment="center middle">
            <text size="small" color="#7C7C83">
              👥 {branch.childBranches.length} branches
            </text>
            <text size="small" color="#7C7C83">
              ⭐ {branch.popularity} popularity
            </text>
            <text size="small" color="#7C7C83">
              📅 {new Date(branch.createdAt).toLocaleDateString()}
            </text>
          </hstack>
        </vstack>

        {/* Create branch button */}
        {showCreateButton && isActive && onCreateBranch ? (
          <button
            appearance="secondary"
            size="small"
            onPress={() => onCreateBranch(branch.id)}
          >
            + Branch
          </button>
        ) : null}
      </hstack>

      {/* Child branches */}
      {node.children.length > 0 && (
        <vstack gap="small" padding="small">
          {/* Connection line */}
          {level > 0 && (
            <hstack>
              <spacer width={indentWidth + 10} />
              <vstack height="20px" width="2px" backgroundColor="#E0E0E0" />
            </hstack>
          )}

          {/* Render child nodes */}
          {node.children.map((childNode) => (
            <BranchNode
              node={childNode}
              currentBranchId={currentBranchId}
              onBranchSelect={onBranchSelect}
              onCreateBranch={onCreateBranch}
              showCreateButton={showCreateButton}
              level={level + 1}
            />
          ))}
        </vstack>
      )}
    </vstack>
  );
};

// Main branch tree component
export const BranchTreeComponent: Devvit.BlockComponent<BranchTreeProps> = ({
  branchTree,
  currentBranchId,
  onBranchSelect,
  onCreateBranch,
  showCreateButton = false
}) => {
  if (!branchTree || branchTree.branches.length === 0) {
    return (
      <vstack alignment="center middle" padding="large" gap="medium">
        <text size="large" color="#7C7C83">🌳</text>
        <text size="medium" color="#7C7C83">No branches yet</text>
        <text size="small" color="#7C7C83">
          Create the first branch to start exploring different story paths
        </text>
      </vstack>
    );
  }

  return (
    <vstack gap="medium" padding="medium">
      {/* Tree header */}
      <hstack gap="medium" alignment="center middle" padding="medium">
        <text size="large" weight="bold">🌳 Story Branches</text>
        <spacer grow />
        <vstack gap="small" alignment="end">
          <text size="small" color="#7C7C83">
            {branchTree.activeBranches} active / {branchTree.totalBranches} total
          </text>
          <text size="small" color="#7C7C83">
            Max depth: {branchTree.maxDepth}
          </text>
        </vstack>
      </hstack>

      {/* Branch tree visualization */}
      <vstack gap="small" backgroundColor="#FAFAFA" cornerRadius="medium" padding="medium">
        {branchTree.branches.map((rootNode) => (
          <BranchNode
            node={rootNode}
            currentBranchId={currentBranchId}
            onBranchSelect={onBranchSelect}
            onCreateBranch={onCreateBranch}
            showCreateButton={showCreateButton}
            level={0}
          />
        ))}
      </vstack>

      {/* Tree legend */}
      <hstack gap="large" alignment="center middle" padding="small">
        <hstack gap="small" alignment="center middle">
          <text size="small">🔀</text>
          <text size="small" color="#7C7C83">Decision</text>
        </hstack>
        <hstack gap="small" alignment="center middle">
          <text size="small">🔄</text>
          <text size="small" color="#7C7C83">Alternative</text>
        </hstack>
        <hstack gap="small" alignment="center middle">
          <text size="small">🧪</text>
          <text size="small" color="#7C7C83">Experimental</text>
        </hstack>
      </hstack>
    </vstack>
  );
};