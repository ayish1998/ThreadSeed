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
      {/* Header */}
      <hstack gap="medium" alignment="center middle">
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

      {/* Parent branch info */}
      {parentBranch && (
        <vstack gap="small" padding="medium" backgroundColor="#F8F9FA" cornerRadius="small">
          <text size="small" color="#7C7C83">Branching from:</text>
          <text size="medium" weight="bold">{parentBranch.name}</text>
          <text size="small" color="#7C7C83">{parentBranch.description}</text>
        </vstack>
      )}

      {/* Branch name input */}
      <vstack gap="small">
        <text size="medium" weight="bold">Branch Name</text>
        <textInput
          value={branchName}
          onTextChange={setBranchName}
          placeholder="Enter a descriptive name for this branch..."
          disabled={isCreating}
        />
        <text size="xsmall" color="#7C7C83">
          {branchName.length}/50 characters
        </text>
      </vstack>

      {/* Branch description input */}
      <vstack gap="small">
        <text size="medium" weight="bold">Description</text>
        <textInput
          value={branchDescription}
          onTextChange={setBranchDescription}
          placeholder="Describe what makes this branch unique..."
          disabled={isCreating}
        />
        <text size="xsmall" color="#7C7C83">
          {branchDescription.length}/200 characters
        </text>
      </vstack>

      {/* Branch type selection */}
      <vstack gap="small">
        <text size="medium" weight="bold">Branch Type</text>
        
        <vstack gap="small">
          {/* Decision branch */}
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
            <vstack gap="xsmall" grow>
              <text size="medium" weight="bold">Decision Point</text>
              <text size="small" color="#7C7C83">
                {getBranchTypeDescription('decision')}
              </text>
            </vstack>
            {branchType === 'decision' && (
              <text size="medium" color="#0079D3">✓</text>
            )}
          </hstack>

          {/* Alternative branch */}
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
            <vstack gap="xsmall" grow>
              <text size="medium" weight="bold">Alternative Path</text>
              <text size="small" color="#7C7C83">
                {getBranchTypeDescription('alternative')}
              </text>
            </vstack>
            {branchType === 'alternative' && (
              <text size="medium" color="#0079D3">✓</text>
            )}
          </hstack>

          {/* Experimental branch */}
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
            <vstack gap="xsmall" grow>
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
      {error && (
        <text size="small" color="#FF4500" weight="bold">
          ⚠️ {error}
        </text>
      )}

      {/* Action buttons */}
      <hstack gap="medium" alignment="center middle">
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

      {/* Tips */}
      <vstack gap="small" padding="medium" backgroundColor="#F0F8FF" cornerRadius="small">
        <text size="small" weight="bold" color="#0079D3">💡 Tips for creating branches:</text>
        <text size="xsmall" color="#7C7C83">
          • Give your branch a clear, descriptive name
        </text>
        <text size="xsmall" color="#7C7C83">
          • Explain what makes this path different or interesting
        </text>
        <text size="xsmall" color="#7C7C83">
          • Choose the appropriate type to help others understand the branch's purpose
        </text>
      </vstack>
    </vstack>
  );
};