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
  {
    slug: "why-more-puzzles-stop-helping",
    title: "Why More Chess Puzzles Stop Helping",
    excerpt:
      "More puzzles can make you sharper, but they can also train a habit that barely survives contact with real games.",
    publishedAt: "2026-05-12",
    updatedAt: "2026-05-12",
    readingMinutes: 6,
    category: "Chess improvement",
    keywords: [
      "chess puzzles",
      "tactics training",
      "chess improvement",
      "chess training app",
      "pattern recognition chess",
    ],
    sections: [
      {
        heading: "Puzzles tell you a tactic exists",
        body: [
          "The hidden problem with many chess puzzles is not the tactic. It is the promise. When you click start, you already know there is a solution, usually a forcing one, usually tactical, usually clean.",
          "Real games do not whisper that promise. Sometimes the best move is a tactic. Sometimes it is improving a piece. Sometimes it is admitting your attack is fake and defending like an adult.",
        ],
      },
      {
        heading: "Puzzle skill and game skill overlap, but they are not identical",
        body: [
          "A puzzle rating can climb while your games stay chaotic because the task is different. In puzzles, selection is solved for you: look for a tactic. In games, selection is the hard part: decide whether the position is tactical, strategic, defensive, or just equal and annoying.",
          "That difference matters. Training should help you recognize when a pattern is present, not only execute the pattern after someone tells you it exists.",
        ],
      },
      {
        heading: "The plateau usually comes from bad sampling",
        body: [
          "If your training feed is random, your improvement is also random. You may spend forty minutes solving knight forks while your actual rating leak is defending against passed pawns or choosing trades in queenless middlegames.",
          "The answer is not to stop doing puzzles. The answer is to connect training to evidence from your own games. Your games are the bug report. Puzzles are the patching material.",
        ],
        bullets: [
          "Review positions you failed before new positions.",
          "Train mistakes from your own games before generic themes.",
          "Use filler puzzles only when your personal review queue is empty.",
          "Judge success by whether you preserve the evaluation across a short line, not whether you guessed one flashy move.",
        ],
      },
    ],
  },
  {
    slug: "review-chess-games-without-drowning",
    title: "How to Review Your Chess Games Without Drowning in Analysis",
    excerpt:
      "Game review should produce training material, not a museum of engine arrows. Here is a simpler way to find what matters.",
    publishedAt: "2026-05-12",
    updatedAt: "2026-05-12",
    readingMinutes: 5,
    category: "Game review",
    keywords: [
      "review chess games",
      "chess analysis",
      "lichess analysis",
      "chess mistakes",
      "train chess positions",
    ],
    sections: [
      {
        heading: "Do not review every move",
        body: [
          "A full game can contain dozens of engine comments, but most of them are not worth training. Some are tiny inaccuracies. Some are moves you would never face again. Some are engine-only improvements that require a tactical microscope and a quiet afternoon.",
          "Good review is selective. You are looking for positions where your decision process broke in a way that could repeat.",
        ],
      },
      {
        heading: "Start from evaluation swings",
        body: [
          "The first pass is mechanical: find where the evaluation changed significantly. Then step back one move earlier and ask what you believed about the position before choosing your move.",
          "This avoids the common trap of only staring at the engine's best move. The best move is useful, but the trainable moment is the wrong assumption that made your move attractive.",
        ],
      },
      {
        heading: "Turn the mistake into a reusable position",
        body: [
          "A reviewed mistake becomes useful when you can retry it without the answer in front of you. Save the position, hide the engine, and test whether you can preserve the evaluation across the next few moves.",
          "One-move correctness is too fragile. A player can guess the tactic and still misunderstand the position. Evaluation preservation over a short continuation is a better signal that the idea actually landed.",
        ],
        bullets: [
          "Was there a forcing line you failed to calculate?",
          "Was the real issue king safety, piece activity, pawn structure, or time pressure?",
          "Would this mistake be useful to see again in three days?",
          "Can you explain the correct idea without naming the engine move first?",
        ],
      },
    ],
  },
];

export function getBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}