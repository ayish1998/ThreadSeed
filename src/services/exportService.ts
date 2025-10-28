// src/services/exportService.ts - PDF Export Service
import { Context } from '@devvit/public-api';
import { Story } from '../types/story.js';

export interface ExportOptions {
    format: 'txt' | 'md' | 'pdf';
    includeMetadata: boolean;
    includeContributors: boolean;
    includeStats: boolean;
}

export interface ExportResult {
    success: boolean;
    filename?: string;
    content?: string;
    error?: string;
    downloadUrl?: string;
}

export interface ExportValidation {
    valid: boolean;
    errors: string[];
}

export class ExportService {
    private context: Context;

    constructor(context: Context) {
        this.context = context;
    }

    /**
     * Validate story for export
     */
    validateForExport(story: Story): ExportValidation {
        const errors: string[] = [];

        if (!story) {
            errors.push('Story not found');
            return { valid: false, errors };
        }

        if (story.status !== 'completed') {
            errors.push('Story must be completed to export');
        }

        if (!story.sentences || story.sentences.length === 0) {
            errors.push('Story has no content to export');
        }

        if (!story.title || story.title.trim().length === 0) {
            errors.push('Story must have a title');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Export story to specified format
     */
    async exportStory(story: Story, options: ExportOptions): Promise<ExportResult> {
        try {
            const validation = this.validateForExport(story);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.errors.join(', ')
                };
            }

            switch (options.format) {
                case 'txt':
                    return await this.exportToText(story, options);
                case 'md':
                    return await this.exportToMarkdown(story, options);
                case 'pdf':
                    return await this.exportToPDF(story, options);
                default:
                    return {
                        success: false,
                        error: 'Unsupported export format'
                    };
            }
        } catch (error) {
            console.error('[ExportService] Export failed:', error);
            return {
                success: false,
                error: 'Export process failed'
            };
        }
    }

    /**
     * Export to plain text format
     */
    private async exportToText(story: Story, options: ExportOptions): Promise<ExportResult> {
        try {
            let content = '';

            // Title and metadata
            content += `${story.title}\n`;
            content += `${'='.repeat(story.title.length)}\n\n`;

            if (options.includeMetadata) {
                const genre = (story.metadata as any).genre || 'General';
                const createdDate = new Date(story.createdAt).toLocaleDateString();
                content += `Genre: ${genre}\n`;
                content += `Created: ${createdDate}\n`;
                content += `Status: ${story.status}\n\n`;
            }

            // Story content
            content += 'STORY\n';
            content += '-----\n\n';

            // Get chapters from Redis
            const chapters = await this.getStoryChapters(story.id);

            if (chapters.length > 0) {
                chapters.forEach((chapter, index) => {
                    content += `Chapter ${index + 1}\n`;
                    content += `Author: u/${chapter.authorName}\n`;
                    if (options.includeStats) {
                        content += `Votes: ${chapter.votes || 0}\n`;
                    }
                    content += `\n${chapter.text}\n\n`;
                });
            } else {
                // Fallback to sentences
                story.sentences.forEach((sentence, index) => {
                    content += `Chapter ${index + 1}\n`;
                    content += `Author: u/${sentence.authorName}\n`;
                    if (options.includeStats) {
                        content += `Votes: ${sentence.votes}\n`;
                    }
                    content += `\n${sentence.content}\n\n`;
                });
            }

            // Contributors
            if (options.includeContributors) {
                content += '\nCONTRIBUTORS\n';
                content += '-----------\n';
                const contributors = this.getUniqueContributors(story, chapters);
                contributors.forEach((contributor, index) => {
                    content += `${index + 1}. u/${contributor.name} (${contributor.contributions} contributions)\n`;
                });
            }

            // Stats
            if (options.includeStats) {
                content += '\nSTATISTICS\n';
                content += '----------\n';
                const stats = await this.calculateStoryStats(story, chapters);
                content += `Total Chapters: ${stats.totalChapters}\n`;
                content += `Total Words: ${stats.totalWords}\n`;
                content += `Contributors: ${stats.totalContributors}\n`;
                content += `Total Votes: ${stats.totalVotes}\n`;
                content += `Completion Date: ${new Date(stats.completedAt || Date.now()).toLocaleDateString()}\n`;
            }

            content += '\n---\nPowered by ThreadSmith\n';

            const filename = `${this.sanitizeFilename(story.title)}.txt`;

            return {
                success: true,
                filename,
                content
            };

        } catch (error) {
            console.error('[ExportService] Text export failed:', error);
            return {
                success: false,
                error: 'Failed to export to text format'
            };
        }
    }

    /**
     * Export to Markdown format
     */
    private async exportToMarkdown(story: Story, options: ExportOptions): Promise<ExportResult> {
        try {
            let content = '';

            // Title and metadata
            content += `# ${story.title}\n\n`;

            if (options.includeMetadata) {
                const genre = (story.metadata as any).genre || 'General';
                const createdDate = new Date(story.createdAt).toLocaleDateString();
                content += `**Genre:** ${genre}  \n`;
                content += `**Created:** ${createdDate}  \n`;
                content += `**Status:** ${story.status}  \n\n`;
            }

            content += '---\n\n';

            // Story content
            const chapters = await this.getStoryChapters(story.id);

            if (chapters.length > 0) {
                chapters.forEach((chapter, index) => {
                    content += `## Chapter ${index + 1}\n\n`;
                    content += `*By u/${chapter.authorName}*`;
                    if (options.includeStats) {
                        content += ` • ${chapter.votes || 0} votes ⭐`;
                    }
                    content += '\n\n';
                    content += `${chapter.text}\n\n`;
                });
            } else {
                // Fallback to sentences
                story.sentences.forEach((sentence, index) => {
                    content += `## Chapter ${index + 1}\n\n`;
                    content += `*By u/${sentence.authorName}*`;
                    if (options.includeStats) {
                        content += ` • ${sentence.votes} votes`;
                    }
                    content += '\n\n';
                    content += `${sentence.content}\n\n`;
                });
            }

            // Contributors
            if (options.includeContributors) {
                content += '## Contributors\n\n';
                const contributors = this.getUniqueContributors(story, chapters);
                contributors.forEach((contributor, index) => {
                    content += `${index + 1}. **u/${contributor.name}** - ${contributor.contributions} contributions\n`;
                });
                content += '\n';
            }

            // Stats
            if (options.includeStats) {
                content += '## Statistics\n\n';
                const stats = await this.calculateStoryStats(story, chapters);
                content += `- **Total Chapters:** ${stats.totalChapters}\n`;
                content += `- **Total Words:** ${stats.totalWords}\n`;
                content += `- **Contributors:** ${stats.totalContributors}\n`;
                content += `- **Total Votes:** ${stats.totalVotes}\n`;
                content += `- **Completed:** ${new Date(stats.completedAt || Date.now()).toLocaleDateString()}\n\n`;
            }

            content += '---\n*Powered by ThreadSmith*\n';

            const filename = `${this.sanitizeFilename(story.title)}.md`;

            return {
                success: true,
                filename,
                content
            };

        } catch (error) {
            console.error('[ExportService] Markdown export failed:', error);
            return {
                success: false,
                error: 'Failed to export to markdown format'
            };
        }
    }

    /**
     * Export to PDF format (simulated - would use PDF generation library in production)
     */
    private async exportToPDF(story: Story, options: ExportOptions): Promise<ExportResult> {
        try {
            // In a real implementation, this would use a PDF generation library
            // For now, we'll simulate the PDF generation and return metadata

            const chapters = await this.getStoryChapters(story.id);
            const stats = await this.calculateStoryStats(story, chapters);

            // Simulate PDF generation process
            const pdfMetadata = {
                title: story.title,
                genre: (story.metadata as any).genre || 'General',
                chapters: chapters.length || story.sentences.length,
                contributors: stats.totalContributors,
                words: stats.totalWords,
                votes: stats.totalVotes,
                createdAt: story.createdAt,
                completedAt: stats.completedAt || Date.now()
            };

            // Store PDF metadata for later retrieval
            const pdfKey = `pdf:${story.id}`;
            await this.context.redis.set(pdfKey, JSON.stringify(pdfMetadata));

            const filename = `${this.sanitizeFilename(story.title)}.pdf`;

            return {
                success: true,
                filename,
                downloadUrl: `/download/pdf/${story.id}` // Simulated download URL
            };

        } catch (error) {
            console.error('[ExportService] PDF export failed:', error);
            return {
                success: false,
                error: 'Failed to export to PDF format'
            };
        }
    }

    /**
     * Get story chapters from Redis
     */
    private async getStoryChapters(storyId: string): Promise<any[]> {
        try {
            const chaptersKey = `story_chapters:${storyId}`;
            const chaptersData = await this.context.redis.get(chaptersKey);
            return chaptersData ? JSON.parse(chaptersData) : [];
        } catch (error) {
            console.error('[ExportService] Failed to get chapters:', error);
            return [];
        }
    }

    /**
     * Get unique contributors from story
     */
    private getUniqueContributors(story: Story, chapters: any[]): Array<{ name: string, contributions: number }> {
        const contributorMap = new Map<string, number>();

        // Count from chapters if available
        if (chapters.length > 0) {
            chapters.forEach(chapter => {
                const name = chapter.authorName;
                contributorMap.set(name, (contributorMap.get(name) || 0) + 1);
            });
        } else {
            // Fallback to sentences
            story.sentences.forEach(sentence => {
                const name = sentence.authorName;
                contributorMap.set(name, (contributorMap.get(name) || 0) + 1);
            });
        }

        return Array.from(contributorMap.entries())
            .map(([name, contributions]) => ({ name, contributions }))
            .sort((a, b) => b.contributions - a.contributions);
    }

    /**
     * Calculate story statistics
     */
    private async calculateStoryStats(story: Story, chapters: any[]): Promise<any> {
        const contributors = this.getUniqueContributors(story, chapters);

        let totalWords = 0;
        let totalVotes = 0;
        let totalChapters = 0;

        if (chapters.length > 0) {
            totalChapters = chapters.length;
            chapters.forEach(chapter => {
                totalWords += chapter.wordCount || chapter.text?.split(' ').length || 0;
                totalVotes += chapter.votes || 0;
            });
        } else {
            totalChapters = story.sentences.length;
            story.sentences.forEach(sentence => {
                totalWords += sentence.content.split(' ').length;
                totalVotes += sentence.votes;
            });
        }

        return {
            totalChapters,
            totalWords,
            totalContributors: contributors.length,
            totalVotes,
            completedAt: story.status === 'completed' ? Date.now() : null
        };
    }

    /**
     * Sanitize filename for safe file system usage
     */
    private sanitizeFilename(filename: string): string {
        return filename
            .replace(/[^a-z0-9]/gi, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .toLowerCase();
    }

    /**
     * Get PDF metadata for completed story
     */
    async getPDFMetadata(storyId: string): Promise<any | null> {
        try {
            const pdfKey = `pdf:${storyId}`;
            const metadata = await this.context.redis.get(pdfKey);
            return metadata ? JSON.parse(metadata) : null;
        } catch (error) {
            console.error('[ExportService] Failed to get PDF metadata:', error);
            return null;
        }
    }
}