export type BlogPostSection = {
  heading: string;
  body: string[];
  bullets?: string[];
};

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  category: string;
  keywords: string[];
  sections: BlogPostSection[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: "what-is-a-chess-blindspot",
    title: "What Is a Chess Blindspot?",
    excerpt:
      "The issue is not that you missed it. The issue is that you forgot it by tomorrow.",
    publishedAt: "2026-05-12",
    updatedAt: "2026-05-12",
    readingMinutes: 6,
    category: "Chess training",
    keywords: [
      "chess blindspots",
      "chess training",
      "chess mistakes",
      "review chess games",
      "improve chess",
    ],
    sections: [
      {
        heading: "Hello world",
        body: [
          "You lose a game, click analysis, see a bunch of red question marks, feel vaguely accused by Stockfish, promise to \"work on tactics,\" then solve 67 puzzles (haha, funny number) where every position screams THERE IS A TACTIC HERE while a monkey is banging a tiny cymbal. Two days later, you hang the same exchange sac because your opponent's bishop was quiet and therefore, apparently, not real.",
          "This is normal.",
          "Not acceptable. Normal.",
          "Blindspots are those small bumps in your chess knowledge (or unfathomably large pits) where you keep failing over and over again in the same fashion.",
        ],
      },
      {
        heading: "The bad news",
        body: [
          "The bad news is that your brain is not going to fix this because you noticed one of them once and then went on with your day.",
          "The game ended. You opened the analysis. You saw the game-ending blunder. Fine. Cool. Then you closed the tab, made a sandwich or a coffee and went back to doing something else.",
          "Or, you flushed the toilet and returned back to your work desk, rewriting your short term memory with those nasty little tasks that would terrorize you up until 6pm.",
          "Mission failed.",
        ],
      },
      {
        heading: "The good news",
        body: [
          "The good news is that this is 100% fixable.",
          "How, you may ask? Because apparently we are doing dialogue now.",
          "Simple.",
          "You need to see that same position again.",
          "And again.",
          "And again.",
          "If you make a blunder and let it vanish into the void, it's as if it never happened. Poof. Back to square one.",
          "But if you see the exact same position tomorrow, your memory cog starts spinning vigorously.",
          "You look at the board and get a tiny little slap of realism.",
          "\"Oh wait. Here is where I did the stupid thing.\"",
          "Good.",
          "That sting matters. Annoyance helps. Shame helps. Even the despair of \"How am I still falling for this as a [insert Lichess/Chess.com rating here] player\" helps. Your brain is much better at remembering a small emotional car crash than a boring Tuesday evening where nothing even happened.",
        ],
      },
      {
        heading: "The science bit",
        body: [
          "The fancy term is retrieval practice. Roediger and Karpicke ran the classic experiment in 2006: two groups studied the same passage; one reread it, one tested themselves on it without feedback. Five minutes later, rereading won — fresh material is fresh material. A week later, the tested group remembered substantially more. That gap is the entire premise behind every flashcard app you have ever ignored.",
          "Pair that with Ebbinghaus's forgetting curve — yes, the man was charting how fast humans dump information back in the 1880s, while chess players were probably still arguing about whether the touch-move rule was for cowards — and you get the other half of the recipe: re-expose yourself right before you'd forget. Too soon and you're bored. Too late and the memory is gone. Just-in-time review is where things actually file themselves away.",
        ],
      },
      {
        heading: "The smoke alarm",
        body: [
          "You want to train your internal chess smoke alarm.",
          "You can still fall for the same mistake again, obviously.",
          "That is allowed.",
          "Embarrassing, but allowed.",
          "The useful part is what happens next. If you review the same position again, your exposure count goes up. First miss: one scar. Second miss: two scars. Fourth miss: congratulations, you have built a small personal museum of bad decisions, and now the exhibit is getting hard to ignore.",
          "That is not failure. That is data with a mean little face.",
          "Every repeat makes the pattern louder. The board stops looking like a random mess and starts looking like, \"Wait, I know this idiot trap. I have died here before.\"",
          "Do that enough times and the position starts to smell dangerous before you touch the bad move. That is the win. Less cinematic than people want. More useful than pretending your next middlegame course will finally give your queen basic survival instincts.",
        ],
      },
    ],
  },
];

export function getBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}