//src/components/TypingIndicator.tsx
import { Devvit } from '@devvit/public-api';
import { useState, useEffect } from 'react';
import { TypingIndicator as TypingIndicatorType } from '../services/notificationService.js';

interface TypingIndicatorProps {
  storyId: string;
  currentUserId: string;
  notificationService: any; // NotificationService instance
  compact?: boolean;
  maxDisplayUsers?: number;
}

/**
 * TypingIndicator component for showing who is currently typing
 * Implements requirement 5.1 (typing indicators)
 */
export const TypingIndicator: Devvit.BlockComponent<TypingIndicatorProps> = ({
  storyId,
  currentUserId,
  notificationService,
  compact = false,
  maxDisplayUsers = 3,
}) => {
  const [typingUsers, setTypingUsers] = useState<TypingIndicatorType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load and update typing indicators
  useEffect(() => {
    const updateTypingIndicators = async () => {
      try {
        const indicators = await notificationService.getTypingIndicators(storyId);
        // Filter out the current user
        const otherUsers = indicators.filter(
          (indicator: TypingIndicatorType) => indicator.userId !== currentUserId
        );
        setTypingUsers(otherUsers);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to get typing indicators:', error);
        setIsLoading(false);
      }
    };

    // Initial load
    updateTypingIndicators();

    // Set up polling for real-time updates
    const interval = setInterval(updateTypingIndicators, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [storyId, currentUserId, notificationService]);

  if (isLoading || typingUsers.length === 0) {
    return null;
  }

  const displayUsers = typingUsers.slice(0, maxDisplayUsers);
  const remainingCount = typingUsers.length - maxDisplayUsers;

  const formatTypingMessage = (): string => {
    if (displayUsers.length === 1) {
      return `${displayUsers[0].username} is typing...`;
    } else if (displayUsers.length === 2) {
      return `${displayUsers[0].username} and ${displayUsers[1].username} are typing...`;
    } else {
      const names = displayUsers.map((user) => user.username).join(', ');
      return `${names}${remainingCount > 0 ? ` and ${remainingCount} more` : ''} are typing...`;
    }
  };

  return (
    <vstack>
      <text
        size={compact ? 'small' : 'medium'}
        color="#7C7C83"
      >
        {formatTypingMessage()}
      </text>
    </vstack>
  );
};
