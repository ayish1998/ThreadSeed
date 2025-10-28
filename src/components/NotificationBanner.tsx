// src/components/NotificationBanner.tsx - Notification System
import { Devvit } from '@devvit/public-api';

interface NotificationBannerProps {
    type: 'voting_open' | 'contribution_winning' | 'story_completed' | 'new_contribution';
    message: string;
    actionText?: string;
    onAction?: () => void;
    onDismiss?: () => void;
}

export const NotificationBanner: Devvit.BlockComponent<NotificationBannerProps> = ({
    type,
    message,
    actionText,
    onAction,
    onDismiss
}) => {
    const getNotificationStyle = (type: string) => {
        switch (type) {
            case 'voting_open':
                return { backgroundColor: '#ff4500', icon: '🗳️' };
            case 'contribution_winning':
                return { backgroundColor: '#46d160', icon: '🎉' };
            case 'story_completed':
                return { backgroundColor: '#7c3aed', icon: '✅' };
            case 'new_contribution':
                return { backgroundColor: '#0079d3', icon: '📝' };
            default:
                return { backgroundColor: '#1a1a1b', icon: '📢' };
        }
    };

    const style = getNotificationStyle(type);

    return (
        <vstack
            backgroundColor={style.backgroundColor}
            padding="medium"
            cornerRadius="medium"
            gap="small"
        >
            <hstack width="100%" alignment="start">
                <hstack gap="small" alignment="middle" grow>
                    <text size="medium">{style.icon}</text>
                    <text size="small" color="white" grow>
                        {message}
                    </text>
                </hstack>

                {onDismiss ? (
                    <button
                        onPress={onDismiss}
                        appearance="plain"
                        size="small"
                    >
                        ✕
                    </button>
                ) : null}
            </hstack>

            {actionText && onAction ? (
                <button
                    onPress={onAction}
                    appearance="secondary"
                    size="small"
                >
                    {actionText}
                </button>
            ) : null}
        </vstack>
    );
};