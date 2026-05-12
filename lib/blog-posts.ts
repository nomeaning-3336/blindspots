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
      "A chess blindspot is not just a missed tactic. It is a recurring pattern your brain keeps underestimating, even after more puzzles and more games.",
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
        heading: "A blindspot is a repeated failure pattern",
        body: [
          "Most players describe every bad move as a mistake, but that word is too blurry to train with. A one-off mouse slip, a tired calculation error, and a recurring strategic misunderstanding are not the same thing.",
          "A chess blindspot is the third kind: a position type you keep mishandling because your attention goes somewhere else. You may know the theme when it appears in a puzzle book, but in your own games the signal arrives wrapped in noise.",
        ],
      },
      {
        heading: "The useful question is not what did I miss?",
        body: [
          "The better question is what kind of position keeps making me miss it? That small shift turns post-game review from archaeology into training design.",
          "If you only annotate the final blunder, you may train the wrong thing. The blunder is often the smoke. The blindspot is the wiring behind the wall.",
        ],
        bullets: [
          "You miss defensive resources after your attack starts working.",
          "You trade into worse endgames because the material count looks safe.",
          "You spot tactics for yourself but not tactics for your opponent.",
          "You rush forcing moves and skip quiet improving moves.",
        ],
      },
      {
        heading: "Why ordinary puzzle grinding often fails",
        body: [
          "Puzzle sites are useful, but they usually train clean tactical themes. Real games are messier. Your mistakes arrive after time pressure, emotion, opening memory, rating anxiety, and a board full of plausible moves.",
          "That is why Blindspots.gg focuses on positions from your own games and schedules failed positions for review. The goal is not to make you feel productive. The goal is to make the recurring leak obvious enough that you cannot keep donating rating points to it.",
        ],
      },
    ],
  },
];

export function getBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}