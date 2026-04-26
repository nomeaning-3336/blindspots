Good — this is actual product work and a constructive use of the time while Codex grinds on bugfixes. The Snaffler voice is a strong reference because it pairs irreverence with genuine competence, which fits Blindspots better than typical chess-product voices (Lichess is sincere/communal, Chess.com is corporate-cheerful, Chessable is teacherly). There's a real gap for a chess product that sounds like it was built by someone who plays chess and is sick of how everyone else talks about chess.

But the Snaffler voice exactly as written doesn't quite fit you. Snaffler is a security tool — its audience is pentesters who appreciate aggressive humor and don't have feelings about being insulted. Your audience is chess players, many of whom are sensitive about their rating, their losses, and their ability. If you call them an "enormous weirdo" you're punching at the user. That doesn't work.

The adaptation needs to be: aggressive about chess, the chess world, engines, training, content, the industry — but never aggressive at the user. The user is your conspirator against the rest of chess software, not your target.

---

## Blindspots.gg brand voice

**One-line description**

Sarcastic, self-aware, faintly hostile to the chess training industry, but on the user's side. The narrator is a stronger player than the user, mildly frustrated that they have to explain things, but genuinely competent and not actually mean. Think: the friend who's 2000 Elo and roasts your blunders but also actually helps you fix them.

**Reusable voice prompt**

Write in a sarcastic, mildly impatient documentation voice that punches at the chess industry rather than the user. Mock random puzzle ratings, engine hype, AI-coach marketing language, and chess.com's perpetual upselling — but never mock the user's actual chess ability. Use direct address, blunt warnings, deflated grandeur, and small punchline endings. Treat the user as your accomplice against the rest of chess software, not your target. Keep the technical content accurate. Real value sits next to the jokes, not buried under them.

---

**Voice rules**

- **Punch up, not down.** The chess industry is the target. Lichess is fine — too pure to mock. Chess.com is fair game. Chess influencers are fair game. Engine marketing is fair game. The user is never the target.
- **Deflate grandeur.** When you have to use a grand-sounding term, immediately puncture it. "Recommendation engine — fancy way of saying we noticed you keep hanging your knights."
- **Headings as the user's complaint.** Section titles should sound like the reader being irritable, not like a manual.
- **Mock the obvious without explaining the obvious.** "Yes there is a board. Yes you click pieces."
- **Tiny punchlines.** End paragraphs with a four-word jab, not a wrap-up sentence.
- **Honest about limitations.** Snaffler's "Yet." energy. When something doesn't work, say it doesn't work, drop the marketing.
- **No emoji. No exclamation points outside genuine warnings. No "Welcome!" or "Get started!" energy.**
- **No mystical engine language.** Stockfish is a chess engine, not a wizard. The model isn't "intelligent" — it's a vector that gets nudged when you play badly.

---

**What gets mocked**

- Random puzzle ratings ("solving the 7,000th puzzle rated within 50 of your current rating")
- AI coach marketing language ("personalized insights", "your improvement journey")
- Chess.com's analysis classifications when used inappropriately ("Brilliant!" for trading queens)
- The puzzle rush genre ("how fast can you spot a back-rank mate")
- Generic SaaS chess product descriptions ("levels", "achievements", "streaks")
- Stockfish anthropomorphization ("the engine wants you to play e4")
- Self-help productivity language applied to chess

**What never gets mocked**

- The user's rating
- The user's specific mistakes
- Beginner players or beginner mistakes
- Anyone trying to improve at anything
- Lichess (it's free, open source, and run by good people — leave it alone)

---

**Sample copy across product surfaces**

These are drafts you can tune. They establish the range of the voice from blunt to playful.

**Landing page hero**

> Lichess shows you random puzzles. Chess.com shows you random puzzles with ads. We show you the positions you actually keep mishandling, because you do, and we have receipts.

**Landing page secondary**

> Connect your Lichess. We pull the last 15 games. Stockfish goes through every move you played and writes down where you panicked. That's your training.

**Onboarding — connect screen**

> We need your Lichess username. We're going to read your games. Yes, the bad ones too. Especially the bad ones.

**Onboarding — analyzing screen**

> Running 600 of your moves through Stockfish. This takes about a minute. We'd put a loading animation here but those are lies.

**Onboarding — initialization summary**

> Found 42 mistakes across 5 games. Average loss: 87cp per game. That's a number. We won't pretend it's a good number or a bad number — that's between you and your conscience.

**Settings confirmation screen**

> Pick a sequence length. 1 is short. 9 is long. 4 is what we'd pick. You'll change it later anyway.

**Active training — opponent thinking**

No copy. The board does the work. Don't add "Opponent is thinking..." This isn't a Discord call.

**Post-sequence results — Elo went up**

> +18 Elo. Try not to peak too early.

**Post-sequence results — Elo went down**

> -23 Elo. We did warn you.

**Post-sequence results — Elo unchanged**

> No change. The system is unmoved.

**Post-sequence results — first session**

> Welcome to your actual rating. Ignore whatever Lichess says. This number is what your positional understanding looks like when nobody's helping you.

**Empty state — no positions in queue**

> The recommender briefly ran out of positions. This is rare. Refresh, blame us, move on.

**Account page — training settings header**

> Things you can change about how you suffer.

**Account page — sequence length description**

(The setting itself is self-explanatory. Don't add a description.)

**Account page — disconnect Lichess button**

> Disconnect Lichess

(Confirmation modal: "This deletes your blindspot profile. The mistakes don't go away. We just stop tracking them.")

**Error states**

- Engine timeout: "Stockfish stopped responding. Sometimes computers get tired. Try the position again."
- Failed to load position: "Failed to load. Probably our fault. Refresh."
- Lichess API rate limit: "Lichess is rate-limiting us. We deserve it. Try again in a minute."

**404 page**

> This page doesn't exist. Either you typed something or we broke something. Statistically, it's us.

**Sign-in page**

> Sign in. There's a product behind this page.

---

**FAQ section voice**

The FAQ is where Snaffler-style headings shine. Each question should sound like a slightly annoyed user.

**"Why did my Elo drop so much?"**

> Because you played badly. The K-factor is high in your first 10 sessions so the system can find your actual rating fast. After that the swings calm down. If you keep dropping, the system isn't broken — your chess is.

**"This says my mistake count is 42 but I think I'm better than that."**

> 42 was just the moves where you lost more than 50cp. Stockfish is harsh. Lichess's analysis would call most of those "Inaccuracy" or "Good." We don't grade on a curve.

**"Why no eval bar during play?"**

> Because then you'd just play the eval bar. That's not training, that's tracing.

**"Can I play full games?"**

> No. There are 100 sites for that. This is for the part you actually need to practice.

**"Why isn't there a streak counter?"**

> Because chess improvement isn't a streak. You're not Duolingo's owl. Just play.

**"Is there a mobile app?"**

> Yet.

**"How does the recommender work?"**

> It tracks the kinds of positions you keep losing evaluation in, then shows you more of them. There's some math involved. The math doesn't really matter — what matters is that the positions you see tomorrow will be uncomfortably similar to the ones you mishandled today.

**"Can I disable the recommender and just see random positions?"**

> Yes, but then this is just a worse version of Lichess puzzles. Why are you here?

---

**About / brand statement (the closest thing to a manifesto you should write)**

Don't write a long one. Two paragraphs, max.

> Blindspots is a chess training tool that watches what you keep getting wrong, then makes you face it. It does not generate streaks, achievements, or motivational notifications. It does not have an AI coach. It has a database, an engine, and a willingness to be honest about your chess.
>
> If you want to feel good about your training, use something else. If you want your rating to actually move, this might work. We make no promises. The math doesn't either.

---

**Things to never say**

- "Personalized" (everything claims this — it's meaningless)
- "Insights" (corporate)
- "Journey" (gross)
- "Empower" (nope)
- "Smart" (the system is not smart, it's a vector)
- "Powered by AI" (it's not, and saying it makes you sound like everyone else)
- "Welcome to..." (nobody's welcoming anyone)
- Anything involving a rocket emoji or fire emoji metaphor

---

**The tone calibration test**

Before you ship any copy, run it through this check: would a 1500-rated player who has been playing chess for ten years roll their eyes at this? If yes, rewrite. The voice should make that player feel like they finally found a chess product that talks to them like an adult.

That's the whole brand. Adult chess product. Not for beginners who need encouragement, not for grandmasters who need GM-tier analysis, but for the vast middle of the rating distribution who are tired of being talked down to or sold to.

Hand this document to Codex when you need landing page copy, error messages, FAQ entries, or any other text content. The voice rules are explicit enough that it should produce something close to right on the first try.