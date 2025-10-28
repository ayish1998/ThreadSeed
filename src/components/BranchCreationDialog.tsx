// src/components/BranchCreationDialog.tsx
import { Devvit, useState } from '@devvit/public-api';
import { StoryBranch } from '../types/story.js';

interface BranchCreationDialogProps {
  isVisible: boolean;
  parentBranch?: StoryBranch;
  startingSentenceId: string;
  onCreateBranch: (params: {
    name: string;
    description: string;
    branchType: 'decision' | 'alternative' | 'experimental';
  }) => Promise<void>;
  onCancel: () => void;
}

export const BranchCreationDialog: Devvit.BlockComponent<BranchCreationDialogProps> = ({
  isVisible,
  parentBranch,
  startingSentenceId,
  onCreateBranch,
  onCancel
}) => {
  const [branchName, setBranchName] = useState('');
  const [branchDescription, setBranchDescription] = useState('');
  const [branchType, setBranchType] = useState<'decision' | 'alternative' | 'experimental'>('decision');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  if (!isVisible) {
    return null;
  }

  const handleCreate = async () => {
    // Validate inputs
    if (!branchName.trim()) {
      setError('Branch name is required');
      return;
    }

    if (branchName.trim().length > 50) {
      setError('Branch name must be 50 characters or less');
      return;
    }

    if (!branchDescription.trim()) {
      setError('Branch description is required');
      return;
    }

    if (branchDescription.trim().length > 200) {
      setError('Branch description must be 200 characters or less');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      await onCreateBranch({
        name: branchName.trim(),
        description: branchDescription.trim(),
        branchType
      });

      // Reset form
      setBranchName('');
      setBranchDescription('');
      setBranchType('decision');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create branch');
    } finally {
      setIsCreating(false);
    }
  };

  const getBranchTypeDescription = (type: string) => {
    switch (type) {
      case 'decision':
        return 'A major story decision point with different outcomes';
      case 'alternative':
        return 'An alternative version of the current story path';
      case 'experimental':
        return 'An experimental or creative deviation from the main story';
      default:
        return '';
    }
  };

  return (
    <vstack
      gap="medium"
      padding="large"
      backgroundColor="#FFFFFF"
      cornerRadius="medium"
      border="thick"
      borderColor="#E0E0E0"
    >
      <hstack gap="medium" alignment="center">
        <text size="large" weight="bold">🌿 Create New Branch</text>
        <spacer grow />
        <button
          appearance="secondary"
          size="small"
          onPress={onCancel}
          disabled={isCreating}
        >
          ✕
        </button>
      </hstack>

      {parentBranch ? (
        <vstack gap="small" padding="medium" backgroundColor="#F8F9FA" cornerRadius="small">
          <text size="small" color="#7C7C83">Branching from:</text>
          <text size="medium" weight="bold">{parentBranch.name}</text>
          <text size="small" color="#7C7C83">{parentBranch.description}</text>
        </vstack>
      ) : null}

      <vstack gap="small">
        <text size="medium" weight="bold">Branch Name</text>
        <vstack backgroundColor="#f6f8fa" padding="small" cornerRadius="small" onPress={() => {
          if (!isCreating) {
            // In a real implementation, this would open a text input dialog
            setBranchName("New Branch " + Date.now());
          }
        }}>
          <text size="small" color={branchName ? "#24292f" : "#656d76"}>
            {branchName || "Enter a descriptive name for this branch..."}
          </text>
        </vstack>
        <text size="small" color="#7C7C83">
          {branchName.length}/50 characters
        </text>
      </vstack>

      <vstack gap="small">
        <text size="medium" weight="bold">Description</text>
        <vstack backgroundColor="#f6f8fa" padding="small" cornerRadius="small" onPress={() => {
          if (!isCreating) {
            // In a real implementation, this would open a text input dialog
            setBranchDescription("Branch description " + Date.now());
          }
        }}>
          <text size="small" color={branchDescription ? "#24292f" : "#656d76"}>
            {branchDescription || "Describe what makes this branch unique..."}
          </text>
        </vstack>
        <text size="small" color="#7C7C83">
          {branchDescription.length}/200 characters
        </text>
      </vstack>

      <vstack gap="small">
        <text size="medium" weight="bold">Branch Type</text>

        <vstack gap="small">
          <hstack
            gap="medium"
            alignment="center middle"
            padding="medium"
            backgroundColor={branchType === 'decision' ? '#E3F2FD' : '#FAFAFA'}
            cornerRadius="small"
            border={branchType === 'decision' ? 'thick' : 'thin'}
            borderColor={branchType === 'decision' ? '#0079D3' : '#E0E0E0'}
            onPress={() => setBranchType('decision')}
          >
            <text size="medium">🔀</text>
            <vstack gap="small" grow>
              <text size="medium" weight="bold">Decision Point</text>
              <text size="small" color="#7C7C83">
                {getBranchTypeDescription('decision')}
              </text>
            </vstack>
            {branchType === 'decision' && (
              <text size="medium" color="#0079D3">✓</text>
            )}
          </hstack>

          <hstack
            gap="medium"
            alignment="center middle"
            padding="medium"
            backgroundColor={branchType === 'alternative' ? '#E3F2FD' : '#FAFAFA'}
            cornerRadius="small"
            border={branchType === 'alternative' ? 'thick' : 'thin'}
            borderColor={branchType === 'alternative' ? '#0079D3' : '#E0E0E0'}
            onPress={() => setBranchType('alternative')}
          >
            <text size="medium">🔄</text>
            <vstack gap="small" grow>
              <text size="medium" weight="bold">Alternative Path</text>
              <text size="small" color="#7C7C83">
                {getBranchTypeDescription('alternative')}
              </text>
            </vstack>
            {branchType === 'alternative' && (
              <text size="medium" color="#0079D3">✓</text>
            )}
          </hstack>

          <hstack
            gap="medium"
            alignment="center middle"
            padding="medium"
            backgroundColor={branchType === 'experimental' ? '#E3F2FD' : '#FAFAFA'}
            cornerRadius="small"
            border={branchType === 'experimental' ? 'thick' : 'thin'}
            borderColor={branchType === 'experimental' ? '#0079D3' : '#E0E0E0'}
            onPress={() => setBranchType('experimental')}
          >
            <text size="medium">🧪</text>
            <vstack gap="small" grow>
              <text size="medium" weight="bold">Experimental</text>
              <text size="small" color="#7C7C83">
                {getBranchTypeDescription('experimental')}
              </text>
            </vstack>
            {branchType === 'experimental' && (
              <text size="medium" color="#0079D3">✓</text>
            )}
          </hstack>
        </vstack>
      </vstack>

      {/* Error message */}
      {error ? (
        <text size="small" color="#FF4500" weight="bold">
          ⚠️ {error}
        </text>
      ) : null}

      <hstack gap="medium" alignment="center">
        <button
          appearance="secondary"
          onPress={onCancel}
          disabled={isCreating}
          grow
        >
          Cancel
        </button>
        <button
          appearance="primary"
          onPress={handleCreate}
          disabled={isCreating || !branchName.trim() || !branchDescription.trim()}
          grow
        >
          {isCreating ? 'Creating...' : 'Create Branch'}
        </button>
      </hstack>

      <vstack gap="small" padding="medium" backgroundColor="#F0F8FF" cornerRadius="small">
        <text size="small" weight="bold" color="#0079D3">💡 Tips for creating branches:</text>
        <text size="small" color="#7C7C83">
          • Give your branch a clear, descriptive name
        </text>
        <text size="small" color="#7C7C83">
          • Explain what makes this path different or interesting
        </text>
        <text size="small" color="#7C7C83">
          • Choose the appropriate type to help others understand the branch's purpose
        </text>
      </vstack>
    </vstack>
  );
};