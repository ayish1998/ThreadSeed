// src/components/VotingInterface.tsx - Journey 3: Voting Interface for Elena
import { Context, Devvit, useState, useAsync } from '@devvit/public-api';

interface VotingInterfaceProps {
    context: Context;
    userData: any;
    storyId: string;
    onBack: () => void;
}

interface Contribution {
    id: string;
    authorName: string;
    text: string;
    votes: number;
    wordCount: number;
    submittedAt: number;
    isWinner?: boolean;
}

export const VotingInterface: Devvit.BlockComponent<VotingInterfaceProps> = ({
    context,
    userData,
    storyId,
    onBack
}) => {
    const [selectedContribution, setSelectedContribution] = useState<string | null>(null);

    // Load contributions for voting
    const { data: contributionsString, loading } = useAsync(async () => {
        try {
            // Mock data for Journey 3 demonstration
            const mockContributions: Contribution[] = [
                {
                    id: 'contrib_1',
                    authorName: 'DreamWriter99',
                    text: 'Lyra stood at the edge of the Nightmare Market, her fingers trembling. The dreamweavers told her this place was forbidden, but curiosity had always been her weakness. The shadows whispered promises of power, and she found herself stepping forward into the swirling mists of possibility.',
                    votes: 23,
                    wordCount: 420,
                    submittedAt: Date.now() - (2 * 60 * 60 * 1000) // 2 hours ago
                },
                {
                    id: 'contrib_2',
                    authorName: 'FantasyFan42',
                    text: 'The apprentice\'s master had warned her about the shadows that crept between dreams. But Lyra had always been curious about the forbidden arts. As she approached the ancient mirror, she could feel the nightmare energy pulsing through the glass, calling to her deepest fears and desires.',
                    votes: 45,
                    wordCount: 387,
                    submittedAt: Date.now() - (4 * 60 * 60 * 1000), // 4 hours ago
                    isWinner: true
                },
                {
                    id: 'contrib_3',
                    authorName: 'StorySmith88',
                    text: 'In the city\'s heart, nightmares took form. Lyra discovered she could shape them, bend them to her will. The power was intoxicating, but with each nightmare she controlled, she felt a piece of her humanity slip away. The question was: how much was she willing to sacrifice for power?',
                    votes: 18,
                    wordCount: 445,
                    submittedAt: Date.now() - (5 * 60 * 60 * 1000) // 5 hours ago
                }
            ];

            return JSON.stringify(mockContributions);
        } catch (error) {
            console.error('[VotingInterface] Failed to load contributions:', error);
            return JSON.stringify([]);
        }
    });

    const contributions = contributionsString ? JSON.parse(contributionsString) as Contribution[] : [];

    const handleVote = (contributionId: string) => {
        context.ui.showToast({
            text: '🗳️ Vote cast! Thank you for participating.'
        });
        // In real implementation, would update vote counts
    };

    const formatTimeAgo = (timestamp: number): string => {
        const now = Date.now();
        const diff = now - timestamp;
        const hours = Math.floor(diff / (1000 * 60 * 60));

        if (hours > 0) return `${hours}h ago`;
        return 'Recently';
    };

    if (loading) {
        return (
            <vstack height="100%" width="100%" alignment="middle center" padding="large">
                <text>Loading voting interface...</text>
            </vstack>
        );
    }

    return (
        <vstack height="100%" width="100%" backgroundColor="#0d1117" padding="small" gap="small">
            {/* Header */}
            <hstack alignment="middle" padding="small" gap="medium">
                <button onPress={onBack} appearance="secondary" size="small">
                    ← Back
                </button>
                <vstack alignment="center" grow>
                    <text size="large" weight="bold" color="#f0f6fc">🗳️ Chapter Voting</text>
                    <text size="small" color="#7d8590">Choose the best continuation</text>
                </vstack>
                <vstack alignment="center">
                    <text size="small" color="#ff4500" weight="bold">18h</text>
                    <text size="small" color="#7d8590">remaining</text>
                </vstack>
            </hstack>

            {/* Voting Instructions */}
            <vstack backgroundColor="#161b22" padding="small" cornerRadius="small" gap="small">
                <text size="small" weight="bold" color="#58a6ff">📋 Voting Instructions</text>
                <text size="small" color="#e6edf3">• Read each contribution carefully</text>
                <text size="small" color="#e6edf3">• Vote for the best story continuation</text>
                <text size="small" color="#e6edf3">• You can change your vote until voting ends</text>
                <text size="small" color="#e6edf3">• Most upvoted contribution wins!</text>
            </vstack>

            {/* Contributions List */}
            <vstack gap="small" grow>
                <text size="medium" weight="bold" color="#f0f6fc">
                    📝 Submissions ({contributions.length})
                </text>

                {contributions.map((contribution, index) => (
                    <vstack
                        key={contribution.id}
                        backgroundColor="#161b22"
                        padding="small"
                        cornerRadius="small"
                        gap="small"
                    >
                        {/* Contribution Header */}
                        <hstack alignment="middle" gap="small">
                            <text size="medium" weight="bold" color="#39d353">#{index + 1}</text>
                            <vstack grow>
                                <hstack alignment="middle" gap="small">
                                    <text size="small" weight="bold" color="#58a6ff">
                                        u/{contribution.authorName}
                                    </text>
                                    <text size="small" color="#7d8590">•</text>
                                    <text size="small" color="#7d8590">
                                        {formatTimeAgo(contribution.submittedAt)}
                                    </text>
                                    {contribution.isWinner ? (
                                        <text size="small" color="#39d353" weight="bold">⭐ TOP</text>
                                    ) : (
                                        <text size="small" color="transparent"> </text>
                                    )}
                                </hstack>
                                <hstack alignment="middle" gap="small">
                                    <text size="small" color="#ff4500" weight="bold">
                                        ⬆️ {contribution.votes}
                                    </text>
                                    <text size="small" color="#7d8590">•</text>
                                    <text size="small" color="#7d8590">
                                        📝 {contribution.wordCount} words
                                    </text>
                                </hstack>
                            </vstack>
                        </hstack>

                        {/* Contribution Text */}
                        <vstack backgroundColor="#0d1117" padding="small" cornerRadius="small">
                            <text size="small" weight="bold" color="#7c3aed">CONTRIBUTION:</text>
                            <text size="small" color="#e6edf3">
                                {contribution.text}
                            </text>
                        </vstack>

                        {/* Voting Actions */}
                        <hstack gap="small" alignment="middle">
                            <button
                                onPress={() => handleVote(contribution.id)}
                                appearance="primary"
                                size="small"
                                grow
                            >
                                ⬆️ Upvote This Chapter
                            </button>
                            <button
                                onPress={() => {
                                    setSelectedContribution(contribution.id);
                                    context.ui.showToast({ text: '📖 Reading full contribution...' });
                                }}
                                appearance="secondary"
                                size="small"
                            >
                                📖 Read Full
                            </button>
                        </hstack>

                        {contribution.isWinner ? (
                            <vstack backgroundColor="#0d1117" padding="small" cornerRadius="small" alignment="center">
                                <text size="small" color="#39d353" weight="bold">
                                    ✅ SELECTED CHAPTER - WINNER
                                </text>
                                <text size="small" color="#7d8590">
                                    This contribution was chosen by the community!
                                </text>
                            </vstack>
                        ) : null}
                    </vstack>
                ))}
            </vstack>

            {/* Voting Summary */}
            <vstack backgroundColor="#161b22" padding="small" cornerRadius="small" gap="small">
                <text size="small" weight="bold" color="#58a6ff">📊 Voting Summary</text>
                <hstack gap="medium" alignment="middle">
                    <vstack alignment="center">
                        <text size="small" weight="bold" color="#ff4500">{contributions.reduce((sum, c) => sum + c.votes, 0)}</text>
                        <text size="small" color="#7d8590">Total Votes</text>
                    </vstack>
                    <vstack alignment="center">
                        <text size="small" weight="bold" color="#39d353">{contributions.length}</text>
                        <text size="small" color="#7d8590">Submissions</text>
                    </vstack>
                    <vstack alignment="center">
                        <text size="small" weight="bold" color="#7c3aed">18h</text>
                        <text size="small" color="#7d8590">Time Left</text>
                    </vstack>
                </hstack>
            </vstack>
        </vstack>
    );
};