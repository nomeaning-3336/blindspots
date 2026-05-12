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
      "Your chess improvement plan is probably a crime scene with a nicer font.",
    publishedAt: "2026-05-12",
    updatedAt: "2026-05-12",
    readingMinutes: 5,
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
          "You lose a game, click analysis, see three red marks, feel vaguely accused by Stockfish, promise to \"work on tactics,\" then solve 19 puzzles where every position screams THERE IS A TACTIC HERE in a little neon trench coat. Two days later, you hang the same exchange sac because your opponent's bishop was quiet and therefore, apparently, not real.",
          "This is normal.",
          "Not good. Normal.",
          "Blindspots are the bits of chess you keep failing in the same shape. The same loose back rank. The same poisoned trade. The same \"my attack is winning\" fantasy where your king is sitting in the center wearing a paper hat. They are not random. They cluster. Your brain has a small blacklist of positions it refuses to process correctly, and it has been enforcing that blacklist with religious discipline.",
          "Yes, this is a chess blog. Yes, the internet already has 47 million of these, most of them explaining opposition with diagrams last updated during the reign of dial-up. Fine. We are doing one anyway.",
          "The position here is simple: chess advice is mostly useless until it points at a specific failure you actually repeat.",
          "\"Calculate better\" is not advice. It is a fortune cookie with an engine subscription.",
          "\"Stop trading your active knight for a dead bishop when you are defending a weak dark-square complex\" is advice. Annoying advice. Good advice usually is.",
          "This blog will be about that kind of thing. Specific leaks. Ugly patterns. The small, repeatable errors that cost you games while you're busy studying something more respectable. We will not pretend improvement is mystical. We will not call every missed tactic a lesson from the universe. The universe has other admin work.",
          "You have a few positions you keep getting wrong.",
          "Find them.",
          "Look at them.",
          "Then look at them again after your ego has left the room.",
          "That is the whole trick, really. Not glamorous. No orchestral music. Just you, a board, and the unpleasant discovery that your \"style\" might be a bug with confidence.",
          "Hello world.",
        ],
      },
    ],
  },
];

export function getBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}