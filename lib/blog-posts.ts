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
          "The game ended. You opened the analysis. You saw the game-ending blunder. Fine. Cool. Then you closed the tab, made a sandwich, grabbed a cup of coffee, checked your phone, wondered what you should do on Saturday morning, mentally planned a summer holiday you may or may not take, debated whether black trainers go with those trousers, and moved on with your life.",
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
          "This is not new or revolutionary.",
          "The fancy terms are retrieval practice and spaced repetition (Cool, now we are being scientific...). Roediger and Karpicke showed that testing yourself can beat rereading for long-term retention. Ebbinghaus was poking at the forgetting curve before chess players started blaming lag or mouse slips for hanging queens.",
          "The point is: do that enough times and the position starts to smell dangerous before you touch the bad move. That is the win. Less cinematic than people want. More useful than pretending your next middlegame course will finally give your queen basic survival instincts.",
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
          "That is the system we are trying to build here with blindspots.",
        ],
      },
    ],
  },
];

export function getBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}