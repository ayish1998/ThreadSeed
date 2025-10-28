// src/services/demoDataService.ts - Demo story seeding service
import { Context } from '@devvit/public-api';

export interface DemoStory {
  id: string;
  title: string;
  genre: string;
  contentRating: string;
  opening: string;
  duration: string;
  createdAt: number;
  status: 'active' | 'completed';
  currentChapter: number;
  chapters: DemoChapter[];
}

export interface DemoChapter {
  chapterNumber: number;
  authorName: string;
  text: string;
  votes: number;
  addedAt: number;
  wordCount: number;
}

export class DemoDataService {
  private context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  async seedDemoStories(): Promise<void> {
    console.log('[DemoDataService] Seeding demo stories...');

    const demoStories: DemoStory[] = [
      {
        id: 'demo_story_1',
        title: 'The Last Library on Earth',
        genre: 'scifi',
        contentRating: 'general',
        opening: `In the year 2157, Maya Chen stood before the last physical library on Earth. The towering glass structure gleamed against the orange-tinted sky, its solar panels catching the dying light of the sun. Inside, millions of books waited in climate-controlled silence, their pages yellowed but preserved.

Maya pressed her palm against the biometric scanner, and the massive doors slid open with a soft hiss. As the head librarian and one of only twelve people with access, she carried the weight of humanity's written knowledge on her shoulders.

The world had gone digital decades ago, but when the Great Network Collapse of 2151 wiped out most of humanity's digital archives, these physical books became priceless. Maya walked through the silent halls, her footsteps echoing off the marble floors, knowing that somewhere in these stacks lay the key to rebuilding civilization.

But she wasn't alone. Strange sounds had been coming from the restricted section lately, and today she was determined to investigate.`,
        duration: 'ongoing',
        createdAt: Date.now() - (7 * 24 * 60 * 60 * 1000), // 7 days ago
        status: 'active',
        currentChapter: 3,
        chapters: [
          {
            chapterNumber: 1,
            authorName: 'SciFiWriter42',
            text: `Maya descended into the restricted section, her flashlight cutting through the darkness. The emergency lighting had failed weeks ago, and she hadn't had time to fix it. As she moved deeper into the stacks, she noticed something odd - books were scattered on the floor, as if someone had been searching frantically.

Then she heard it again: a soft rustling sound, like pages turning. But that was impossible. The library's security system would have alerted her to any intruders. She followed the sound, her heart pounding, until she reached the ancient history section.

There, hunched over a massive tome, was a figure she didn't recognize. The person looked up, and Maya gasped. It was a child, no more than ten years old, with wild hair and clothes that looked like they hadn't been washed in weeks.

"Please don't make me leave," the child whispered. "I'm learning about the old world. I need to know what happened before the Collapse."`,
            votes: 47,
            addedAt: Date.now() - (6 * 24 * 60 * 60 * 1000),
            wordCount: 156
          },
          {
            chapterNumber: 2,
            authorName: 'BookLover2157',
            text: `Maya knelt down to the child's level, her initial shock giving way to curiosity. "What's your name?" she asked gently.

"Zara," the child replied, clutching the ancient book to her chest. "I've been living in the old subway tunnels since the food riots started. But I found a way into the library through the maintenance shafts."

Maya's heart ached. She knew about the riots - desperate people fighting over the remaining resources as society continued to crumble. But she had been so focused on preserving the books that she hadn't thought about the children who might need them most.

"What are you trying to learn about?" Maya asked, sitting cross-legged on the floor beside Zara.

Zara opened the book to a page showing images of green forests and blue oceans. "I want to know what Earth looked like before. My grandmother told me stories, but I thought they were just fairy tales. Trees that reached the sky, animals that lived in the wild, water you could drink from rivers..."

Maya felt tears welling up in her eyes. This child had never seen the world as it once was.`,
            votes: 52,
            addedAt: Date.now() - (5 * 24 * 60 * 60 * 1000),
            wordCount: 189
          }
        ]
      },
      {
        id: 'demo_story_2',
        title: 'The Coffee Shop at the End of Time',
        genre: 'fantasy',
        contentRating: 'general',
        opening: `Ellie had always thought her grandmother's coffee shop was ordinary. Sure, it had been in the family for three generations, and yes, the regulars were a bit eccentric, but every small town had its characters.

It wasn't until the morning she found a dragon sitting at table seven, politely sipping a latte and reading the newspaper, that she realized something was different.

"Excuse me," Ellie said, approaching the table with what she hoped was professional composure. "We don't usually serve... um..."

"Dragons?" the creature replied in a cultured British accent, lowering his newspaper. "Oh, my dear, you must be new. I'm Reginald. I've been coming here every Tuesday for the past forty years. Your grandmother makes the most exquisite Ethiopian blend."

Ellie blinked. Her grandmother had never mentioned serving dragons. In fact, her grandmother had never mentioned that dragons existed at all.`,
        duration: '7days',
        createdAt: Date.now() - (3 * 24 * 60 * 60 * 1000), // 3 days ago
        status: 'active',
        currentChapter: 2,
        chapters: [
          {
            chapterNumber: 1,
            authorName: 'FantasyFan88',
            text: `"I think there's been some mistake," Ellie stammered, but Reginald simply chuckled, a sound like distant thunder.

"No mistake, dear. Your grandmother never told you about the shop's... special clientele?" He gestured around the café with one clawed hand. "Look more carefully."

Ellie followed his gaze and nearly dropped her notepad. The elderly woman in the corner booth wasn't just knitting - she was knitting with what appeared to be moonbeams, silver threads that glowed softly in her hands. The businessman at the counter was reading a newspaper that seemed to be writing itself, headlines shifting and changing as she watched.

And the barista behind the counter - wait, that wasn't her employee Jake. This person had pointed ears and eyes that sparkled like starlight.

"What is this place?" Ellie whispered.

Reginald smiled, revealing teeth that could have belonged in a museum. "Welcome to the Coffee Shop at the End of Time, my dear. We serve the best coffee in any dimension, and we're always open for those who need us most."`,
            votes: 38,
            addedAt: Date.now() - (2 * 24 * 60 * 60 * 1000),
            wordCount: 178
          }
        ]
      },
      {
        id: 'demo_story_3',
        title: 'The Memory Thief',
        genre: 'mystery',
        contentRating: 'teen',
        opening: `Detective Sarah Martinez had seen a lot of strange cases in her fifteen years on the force, but nothing quite like this. Three victims, all found in their homes, physically unharmed but with no memory of the past week. No signs of forced entry, no evidence of drugs or trauma, just... blank spaces where memories should be.

The first victim, Mrs. Henderson, had been found by her daughter, staring blankly at a photo of her late husband. She couldn't remember his funeral, which had happened just five days earlier. The second, a college student named Marcus, had forgotten an entire semester's worth of classes. The third, a local shop owner, couldn't recall opening his store for the past week, though security footage showed him doing exactly that.

Sarah sat in her car outside the latest crime scene, reviewing the files. There had to be a connection, something she was missing. The victims lived in different neighborhoods, had different ages and backgrounds, but something had brought them to the attention of whoever - or whatever - was stealing their memories.

Her phone buzzed. Another case, same pattern. This was becoming an epidemic.`,
        duration: '14days',
        createdAt: Date.now() - (1 * 24 * 60 * 60 * 1000), // 1 day ago
        status: 'active',
        currentChapter: 1,
        chapters: []
      }
    ];

    // Store each demo story
    for (const story of demoStories) {
      await this.context.redis.set(`demo_story:${story.id}`, JSON.stringify(story));
      console.log(`[DemoDataService] Seeded story: ${story.title}`);
    }

    // Create a list of demo story IDs
    const storyIds = demoStories.map(s => s.id);
    await this.context.redis.set('demo_stories_list', JSON.stringify(storyIds));

    // Mark demo data as seeded
    await this.context.redis.set('demo_data_seeded', 'true');
    
    console.log('[DemoDataService] Demo stories seeded successfully');
  }

  async getDemoStories(): Promise<DemoStory[]> {
    try {
      const storyIdsData = await this.context.redis.get('demo_stories_list');
      if (!storyIdsData) {
        console.log('[DemoDataService] No demo stories found, seeding...');
        await this.seedDemoStories();
        return this.getDemoStories();
      }

      const storyIds: string[] = JSON.parse(storyIdsData);
      const stories: DemoStory[] = [];

      for (const storyId of storyIds) {
        const storyData = await this.context.redis.get(`demo_story:${storyId}`);
        if (storyData) {
          stories.push(JSON.parse(storyData));
        }
      }

      return stories;
    } catch (error) {
      console.error('[DemoDataService] Error getting demo stories:', error);
      return [];
    }
  }

  async getDemoStory(storyId: string): Promise<DemoStory | null> {
    try {
      const storyData = await this.context.redis.get(`demo_story:${storyId}`);
      return storyData ? JSON.parse(storyData) : null;
    } catch (error) {
      console.error('[DemoDataService] Error getting demo story:', error);
      return null;
    }
  }

  async isDemoDataSeeded(): Promise<boolean> {
    try {
      const seeded = await this.context.redis.get('demo_data_seeded');
      return seeded === 'true';
    } catch (error) {
      console.error('[DemoDataService] Error checking demo data status:', error);
      return false;
    }
  }

  async addDemoChapter(storyId: string, chapter: DemoChapter): Promise<void> {
    try {
      const story = await this.getDemoStory(storyId);
      if (!story) return;

      story.chapters.push(chapter);
      story.currentChapter = Math.max(story.currentChapter, chapter.chapterNumber);
      
      await this.context.redis.set(`demo_story:${storyId}`, JSON.stringify(story));
      console.log(`[DemoDataService] Added chapter ${chapter.chapterNumber} to story ${storyId}`);
    } catch (error) {
      console.error('[DemoDataService] Error adding demo chapter:', error);
    }
  }
}