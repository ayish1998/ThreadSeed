// src/components/NotificationPanel.tsx - ThreadSmith Notifications
import { Context, Devvit, useState, useAsync } from '@devvit/public-api';
import { VotingService } from '../services/votingService.js';

interface VotingNotification {
    id: string;
    type: 'new_contributions' | 'voting_ends_soon' | 'winner_announced' | 'story_followed' | 'voting_reminder' | 'chapter_added';
    storyId: string;
    storyTitle: string;
    message: string;
    timestamp: number;
    read: boolean;
}

interface NotificationPanelProps {
    context: Context;
    userData: any;
    onClose: () => void;
}

export const NotificationPanel: Devvit.BlockComponent<NotificationPanelProps> = ({
    context,
    userData,
    onClose
}) => {


    const votingService = new VotingService(context);

    // Load user notifications
    const { data: notificationsString, loading } = useAsync(async () => {
        try {
            if (!userData.user?.id) return JSON.stringify([]);

            // Mock notifications for demo - in production would fetch from Redis
            const notifications: VotingNotification[] = [
                {
                    id: '1',
                    type: 'winner_announced',
                    storyId: 'story1',
                    storyTitle: 'The Last Dreamweaver',
                    message: 'Your chapter won with 45 votes!',
                    timestamp: Date.now() - 3600000,
                    read: false
                },
                {
                    id: '2',
                    type: 'voting_ends_soon',
                    storyId: 'story2',
                    storyTitle: 'Station Alpha Zero',
                    message: 'Voting ends in 2 hours',
                    timestamp: Date.now() - 7200000,
                    read: true
                }
            ];
            return JSON.stringify(notifications);
        } catch (error) {
            console.error('[NotificationPanel] Failed to load notifications:', error);
            return JSON.stringify([]);
        }
    });

    const notifications = notificationsString ? JSON.parse(notificationsString) as VotingNotification[] : [];

    const handleNotificationClick = async (notification: VotingNotification) => {
        try {
            // Mark as read (mock implementation)
            console.log(`Marking notification ${notification.id} as read`);

            // Navigate to story (in real implementation)
            context.ui.showToast({
                text: `📖 Opening "${notification.storyTitle}"...`
            });
        } catch (error) {
            console.error('[NotificationPanel] Failed to handle notification click:', error);
        }
    };

    const formatTimeAgo = (timestamp: number): string => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    };

    const getNotificationIcon = (type: VotingNotification['type']): string => {
        const icons = {
            'new_contributions': '🗳️',
            'voting_ends_soon': '⏰',
            'winner_announced': '🏆',
            'story_followed': '🔖',
            'voting_reminder': '📢',
            'chapter_added': '📝'
        };
        return icons[type] || '📢';
    };

    const getNotificationColor = (type: VotingNotification['type']): string => {
        const colors = {
            'new_contributions': '#ff4500',
            'voting_ends_soon': '#f59e0b',
            'winner_announced': '#46d160',
            'story_followed': '#58a6ff',
            'voting_reminder': '#7c3aed',
            'chapter_added': '#39d353'
        };
        return colors[type] || '#818384';
    };

    if (loading) {
        return (
            <vstack height="100%" width="100%" alignment="middle center" padding="large">
                <text>Loading notifications...</text>
            </vstack>
        );
    }

    return (
        <vstack height="100%" width="100%" backgroundColor="#0d1117" padding="small" gap="small">
            {/* Header */}
            <hstack alignment="middle" padding="small" gap="medium">
                <button onPress={onClose} appearance="secondary" size="small">
                    ← Back
                </button>
                <vstack alignment="center" grow>
                    <text size="large" weight="bold" color="#f0f6fc">🔔 Notifications</text>
                    <text size="small" color="#7d8590">Story voting updates</text>
                </vstack>
                <vstack alignment="center">
                    <text size="small" color="#ff4500" weight="bold">{notifications.filter(n => !n.read).length}</text>
                    <text size="small" color="#7d8590">Unread</text>
                </vstack>
            </hstack>

            {/* Notifications List */}
            <vstack gap="small" grow>
                {notifications.length > 0 ? (
                    notifications.map((notification) => (
                        <hstack
                            key={notification.id}
                            backgroundColor={notification.read ? "#161b22" : "#21262d"}
                            padding="small"
                            cornerRadius="small"
                            onPress={() => handleNotificationClick(notification)}
                            gap="small"
                            alignment="middle"
                        >
                            {/* Icon */}
                            <text size="medium">{getNotificationIcon(notification.type)}</text>

                            {/* Content */}
                            <vstack grow gap="small">
                                <hstack alignment="middle" gap="small">
                                    <text size="small" weight="bold" color={getNotificationColor(notification.type)} grow>
                                        {notification.storyTitle}
                                    </text>
                                    <text size="small" color="#7d8590">
                                        {formatTimeAgo(notification.timestamp)}
                                    </text>
                                </hstack>
                                <text size="small" color="#e6edf3">
                                    {notification.message}
                                </text>
                            </vstack>

                            {/* Unread indicator */}
                            {!notification.read && (
                                <vstack
                                    backgroundColor="#ff4500"
                                    padding="small"
                                    cornerRadius="full"
                                    minWidth="8px"
                                    minHeight="8px"
                                />
                            )}
                        </hstack>
                    ))
                ) : (
                    <vstack alignment="center" padding="large" gap="medium">
                        <text size="large">🔔</text>
                        <text color="#818384">No notifications yet</text>
                        <text size="small" color="#818384" alignment="center">
                            Follow stories to get notified about voting updates!
                        </text>
                    </vstack>
                )}
            </vstack>

            {/* Clear All Button */}
            {notifications.length > 0 && (
                <button
                    appearance="plain"
                    size="small"
                    onPress={() => {
                        context.ui.showToast({
                            text: '🗑️ All notifications cleared'
                        });
                        // In real implementation, would clear notifications
                    }}
                >
                    Clear All Notifications
                </button>
            )}
        </vstack>
    );
};