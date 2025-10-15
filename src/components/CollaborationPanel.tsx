import { Devvit } from '@devvit/public-api';
import { useState, useEffect } from 'react';
import { ActiveUser, TypingIndicator, ActivityEvent, StoryActivity } from '../services/notificationService.js';

interface CollaborationPanelProps {
  storyId: string;
  currentUserId: string;
  notificationService: any; // NotificationService instance
  onUserInteraction?: (interaction: UserInteraction) => void;
}

interface UserInteraction {
  type: 'join' | 'leave' | 'start_typing' | 'stop_typing' | 'heartbeat';
  userId: string;
  storyId: string;
  data?: Record<string, any>;
}

/**
 * CollaborationPanel component for real-time collaboration features
 * Implements requirements 5.1 (typing indicators) and 5.5 (live participant counts)
 */
export const CollaborationPanel: Devvit.BlockComponent<CollaborationPanelProps> = ({ 
  storyId, 
  currentUserId, 
  notificationService,
  onUserInteraction 
}) => {
  const [storyActivity, setStoryActivity] = useState<StoryActivity>({
    storyId,
    activeUsers: [],
    typingUsers: [],
    totalParticipants: 0,
    recentActivity: [],
    lastUpdated: Date.now()
  });

  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);

  // Load initial story activity
  useEffect(() => {
    const loadStoryActivity = async () => {
      try {
        const activity = await notificationService.getStoryActivity(storyId);
        setStoryActivity(activity);
      } catch (error) {
        console.error('Failed to load story activity:', error);
      }
    };

    loadStoryActivity();
  }, [storyId, notificationService]);

  // Set up real-time updates
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const activity = await notificationService.getStoryActivity(storyId);
        setStoryActivity(activity);
        
        // Send heartbeat
        await notificationService.sendHeartbeat(currentUserId, storyId);
      } catch (error) {
        console.error('Failed to update story activity:', error);
      }
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [storyId, currentUserId, notificationService]);

  // Handle typing events
  const handleStartTyping = async () => {
    if (!isTyping) {
      setIsTyping(true);
      
      try {
        const currentUser = storyActivity.activeUsers.find(u => u.userId === currentUserId);
        const username = currentUser?.username || 'Anonymous';
        
        await notificationService.startTyping(currentUserId, username, storyId);
        
        onUserInteraction?.({
          type: 'start_typing',
          userId: currentUserId,
          storyId
        });
      } catch (error) {
        console.error('Failed to start typing:', error);
      }
    }

    // Reset typing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    const timeout = setTimeout(async () => {
      await handleStopTyping();
    }, 3000); // Stop typing after 3 seconds of inactivity

    setTypingTimeout(timeout);
  };

  const handleStopTyping = async () => {
    if (isTyping) {
      setIsTyping(false);
      
      try {
        const currentUser = storyActivity.activeUsers.find(u => u.userId === currentUserId);
        const username = currentUser?.username || 'Anonymous';
        
        await notificationService.stopTyping(currentUserId, username, storyId);
        
        onUserInteraction?.({
          type: 'stop_typing',
          userId: currentUserId,
          storyId
        });
      } catch (error) {
        console.error('Failed to stop typing:', error);
      }
    }

    if (typingTimeout) {
      clearTimeout(typingTimeout);
      setTypingTimeout(null);
    }
  };

  // Join story on mount
  useEffect(() => {
    const joinStory = async () => {
      try {
        const currentUser = storyActivity.activeUsers.find(u => u.userId === currentUserId);
        const username = currentUser?.username || 'Anonymous';
        
        await notificationService.joinStory(currentUserId, username, storyId);
        
        onUserInteraction?.({
          type: 'join',
          userId: currentUserId,
          storyId
        });
      } catch (error) {
        console.error('Failed to join story:', error);
      }
    };

    joinStory();

    // Leave story on unmount
    return () => {
      const leaveStory = async () => {
        try {
          const currentUser = storyActivity.activeUsers.find(u => u.userId === currentUserId);
          const username = currentUser?.username || 'Anonymous';
          
          await notificationService.leaveStory(currentUserId, username, storyId);
          
          onUserInteraction?.({
            type: 'leave',
            userId: currentUserId,
            storyId
          });
        } catch (error) {
          console.error('Failed to leave story:', error);
        }
      };

      leaveStory();
    };
  }, [currentUserId, storyId, notificationService]);

  const formatActivityStatus = (user: ActiveUser): string => {
    switch (user.activityStatus) {
      case 'active':
        return '🟢 Active';
      case 'idle':
        return '🟡 Idle';
      case 'away':
        return '🔴 Away';
      default:
        return '⚪ Unknown';
    }
  };

  const formatActivityEvent = (event: ActivityEvent): string => {
    const timeAgo = Math.floor((Date.now() - event.timestamp) / 1000);
    const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : `${Math.floor(timeAgo / 60)}m ago`;
    
    switch (event.type) {
      case 'user_joined':
        return `${event.username} joined • ${timeStr}`;
      case 'user_left':
        return `${event.username} left • ${timeStr}`;
      case 'sentence_added':
        return `${event.username} added a sentence • ${timeStr}`;
      case 'vote_cast':
        return `${event.username} voted • ${timeStr}`;
      case 'branch_created':
        return `${event.username} created a branch • ${timeStr}`;
      default:
        return `${event.username} • ${timeStr}`;
    }
  };

  return (
    <vstack gap="medium" padding="medium">
      {/* Active Users Section */}
      <vstack gap="small">
        <hstack alignment="middle" gap="small">
          <text size="large" weight="bold">👥 Active Users</text>
          <text size="small" color="secondary">
            ({storyActivity.activeUsers.length} of {storyActivity.totalParticipants} total)
          </text>
        </hstack>
        
        {storyActivity.activeUsers.length > 0 ? (
          <vstack gap="xsmall">
            {storyActivity.activeUsers.map((user) => (
              <hstack key={user.userId} alignment="middle" gap="small">
                <text size="small" weight="bold">{user.username}</text>
                <text size="xsmall" color="secondary">
                  {formatActivityStatus(user)}
                </text>
              </hstack>
            ))}
          </vstack>
        ) : (
          <text size="small" color="secondary">No active users</text>
        )}
      </vstack>

      {/* Typing Indicators Section */}
      {storyActivity.typingUsers.length > 0 && (
        <vstack gap="small">
          <text size="medium" weight="bold">✏️ Currently Typing</text>
          <vstack gap="xsmall">
            {storyActivity.typingUsers
              .filter(indicator => indicator.userId !== currentUserId)
              .map((indicator) => (
                <hstack key={indicator.userId} alignment="middle" gap="small">
                  <text size="small">{indicator.username}</text>
                  <text size="xsmall" color="secondary">is typing...</text>
                  {indicator.branchId && (
                    <text size="xsmall" color="secondary">
                      in branch {indicator.branchId.slice(0, 8)}
                    </text>
                  )}
                </hstack>
              ))}
          </vstack>
        </vstack>
      )}

      {/* Recent Activity Section */}
      <vstack gap="small">
        <text size="medium" weight="bold">📈 Recent Activity</text>
        {storyActivity.recentActivity.length > 0 ? (
          <vstack gap="xsmall">
            {storyActivity.recentActivity.slice(0, 5).map((event) => (
              <text key={event.id} size="xsmall" color="secondary">
                {formatActivityEvent(event)}
              </text>
            ))}
          </vstack>
        ) : (
          <text size="small" color="secondary">No recent activity</text>
        )}
      </vstack>

      {/* Typing Controls */}
      <vstack gap="small">
        <text size="small" color="secondary">
          Start typing to let others know you're composing...
        </text>
        <hstack gap="small">
          <button 
            appearance="secondary" 
            size="small"
            onPress={handleStartTyping}
            disabled={isTyping}
          >
            {isTyping ? 'Typing...' : 'Start Typing'}
          </button>
          <button 
            appearance="secondary" 
            size="small"
            onPress={handleStopTyping}
            disabled={!isTyping}
          >
            Stop Typing
          </button>
        </hstack>
      </vstack>

      {/* Connection Status */}
      <hstack alignment="middle" gap="small">
        <text size="xsmall" color="secondary">
          Last updated: {new Date(storyActivity.lastUpdated).toLocaleTimeString()}
        </text>
        <text size="xsmall" color="success">🟢 Connected</text>
      </hstack>
    </vstack>
  );
};