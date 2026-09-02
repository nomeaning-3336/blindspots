# Blindspots.gg

> This repository is part of a personal project to build a chess-improvement website.

Blindspots.gg is a position-based chess training tool that drills the mistakes you actually made in your own games.

It pulls your recent games from Lichess or Chess.com, runs Stockfish over every move you played, and finds the positions where you lost evaluation. Those positions become your training material. You play them back from one move before the mistake, against a configurable opponent, and the system grades you on how well you preserve the position over a short sequence. As you play more sequences, the mistakes you make during training are reincorporated into the mistakes queue — so the material evolves beyond your original games. If you leave the platform, play some games elsewhere, and come back, the system re-syncs your profile, analyzes the new games, and imports any fresh mistakes into the queue.

The product does not generate streaks, achievements, or motivational notifications. It does not have an AI coach. It has a database, an engine, and a willingness to be honest about your chess.

## Product Direction

The core training signal is eval preservation across a sequence — not whether you found a single "correct" move.

Blindspots.gg is not a puzzle trainer. There are no forcing lines or one-move solutions. You play the position out against an opponent, and the system measures how well you held the eval over the full sequence. A position is "passed" when you preserve eval cleanly. A position is "failed" when you blow it again — same as last time, same as the time before.

The main loop is:

1. Pull the user's recent games from their linked Lichess or Chess.com profile (incrementally on each visit).
2. Run Stockfish over the user's moves and identify mistakes.
3. Each mistake becomes a training position, queued from one move before the blunder. Mistakes made during training are also reincorporated into the queue.
4. The user plays the position out against the configured opponent.
5. Stockfish silently tracks evaluation across the sequence.
6. The session ends with an eval graph and an optional reflection note.
7. Pass/fail updates the position's review schedule.

Training material comes from the user's own games. The system does not infer abstract weakness clusters from embeddings or behavior models — it just shows the user the positions they actually got wrong, repeatedly, until they stop getting them wrong.

## The Three Queues

Every training session pulls from three queues, in priority order:

**Review queue.** Positions the user previously failed in training, scheduled by spaced repetition. If a position is due today, it goes in this session. This is the highest-priority queue — the whole product depends on users coming back and re-confronting positions they couldn't handle the first time.

**Active queue.** New mistakes from games the user has played since their last sync. Pulled fresh from their linked Lichess or Chess.com profile on each visit. Recent games (last 7 days) are prioritized over older ones, since fresh mistakes are easier to remember and more emotionally salient.

**Filler queue.** Curated positions sourced from the Lichess puzzle database (80%) and master game positions (20%), biased toward themes the user has historically struggled with based on their mistake history. Every time the system serves a position, there is a 20% chance it comes from the filler queue instead of the review or active queues — this ensures the player still works on tactical diversity rather than only positional patterns from their own games. On quiet weeks when the user hasn't played new games and has no review-due positions, the filler queue keeps the product useful.

A typical session is 5-10 positions: review-due first, then active, then filler if needed. Anything beyond the cap goes into a backlog the user sees next session.

## Spaced Repetition

Each training position has an `interval_days` field that determines when it next surfaces in the review queue. After a training attempt:

- **Pass** (avg eval delta < 50cp across the sequence, no single move > 300cp): `interval *= 2.5`, schedule for `today + interval`.
- **Acceptable** (50-150cp avg, no catastrophic single move): `interval *= 1.0`, reschedule at the same interval.
- **Fail** (150+cp avg, or any single move > 300cp): `interval = 1`, see it again tomorrow.

After a position has been reviewed without failure across a long enough interval (60+ days), it transitions to a "mastered" state — still in the database, surfaced occasionally for verification, but out of the active rotation.

The scheduling math is intentionally simple. SuperMemo-2 lite, not a research project. We don't claim it's optimal — we claim it works.

## Main Routes

- `/train` — core training session with board, configurable opponent, sequence loop, hidden eval tracking, post-sequence graph, and reflection note.
- `/profile` — session history, queue state (review-due, active, mastered counts), Blindspots Elo over time, and a list of recent mistakes with the option to retire individual positions.
- `/analysis` — standalone analysis board kept as a secondary surface for inspection and review.
- `/account` — settings, linked chess profiles, opponent preferences, opening preferences, and board/piece/theme preferences.

Compatibility aliases may exist during migration, but new product work targets the routes above.

## Tech Shape

- Next.js App Router for the web app and API routes.
- Supabase for authentication, persistence, linked chess profiles, user preferences, training sessions, mistake records, and SRS state.
- Existing standalone analysis runtime for the `/analysis` surface.
- Stockfish for both the silent evaluation tracking during training sequences and the offline mistake-detection pass over user games.
- Configurable opponent move generation during training: Maia-2 by default for human-like play near the user's Elo, Stockfish at reduced strength for principled engine opposition, or Leela as a middle-ground opponent.
- Lichess API and Chess.com API for game ingestion. Lichess puzzle database and curated master game positions for the filler queue.

There is no embedding pipeline in the product runtime. Position similarity is not used for recommendation. 

## What Gets Persisted

Per training sequence:

- starting FEN and side to move
- move sequence played by the user and opponent
- Stockfish evaluation trace
- pass/acceptable/fail label and the eval-preservation score
- opponent model and strength settings
- sequence length and timing metadata
- optional user reflection note
- queue source (review / active / filler)
- post-attempt SRS state (next interval, next review date)

Per mistake (one row per identified mistake from a user's games):

- source game ID and ply
- starting FEN (one move before the blunder, so the user gets to make the decision again)
- the user's actual move from the game and the engine's preferred move
- eval before and eval after, eval delta
- date the mistake was first ingested
- current SRS state (interval, last review, next review)
- mastered flag
- retired flag (user manually removed it from rotation)

Per linked profile:

- Lichess username and/or Chess.com username, last sync timestamp, last game ID seen
- opening preferences (e.g., "I play Caro-Kann as Black")
- opponent strength preferences
- session size preferences

## Position Sourcing Priorities

In order:

1. **User's own games from linked Lichess or Chess.com profile.** Primary source once the user has any game data. Pulled incrementally on each session.
2. **Imported PGNs.** Optional manual import for users with games elsewhere.
3. **Filler queue (Lichess puzzles 80% + master games 20%, theme-biased).** Injected with a 20% probability on each position serve. Filtered to a rating band slightly above the user's current Blindspots Elo. Themes are biased toward the user's historical mistake patterns (e.g., user has 12 back-rank failures → filler skews toward back-rank tactics). Master game positions provide tactical diversity beyond puzzle-like patterns.
4. **Lichess puzzle database, generic.** Last-resort fallback for cold-start users with no game data and no theme history.

Opening preferences (configured at the profile level, not per-session) further filter all of the above. If a user has told the system they play the Caro-Kann as Black, every Black-to-move position should pull preferentially from Caro-Kann structures across all four sourcing tiers.

## Project Structure

- `app/` — Next.js routes, API handlers, auth entry points, and app-shell pages. Product routes converge on `/train`, `/profile`, `/analysis`, and `/account`.
- `components/` — Shared UI for the app shell, training board, eval graph, queue summary, account settings, linked profiles, and analysis bridge.
- `lib/` — Domain logic for auth, linked profiles, Lichess ingestion, mistake detection, training sessions, Stockfish evaluation, opponent move generation, SRS scheduling, and persistence helpers.
- `public/analyze/` — Synced browser assets used by the embedded standalone analysis runtime.
- `standalone.js`, `standalone.css`, `standalone.html` — Source files for the embedded analysis runtime.
- `scripts/sync-analyze-assets.mjs` — Syncs root analysis assets into `public/analyze/`.
- `supabase/` — Database migrations for auth-backed product data, linked profiles, mistake records, training sessions, SRS state, and user preferences.
- `tests/` — Unit and integration tests for chess-domain scoring, mistake detection, SRS scheduling, persistence helpers, and analysis/training utilities.

## Local Development

1. Install dependencies.

```bash
npm install
```

2. Start the app.

```bash
npm run dev
```

3. Open the main routes.

- `/train`
- `/profile`
- `/analysis`
- `/account`

The app expects the usual Supabase environment variables in `.env.local`. Training also requires local or remote access to Stockfish and configured opponent move generation.

## Analyze Asset Workflow

The analysis board still uses the existing standalone runtime.

If you change `standalone.js`, `standalone.css`, `standalone.html`, or supporting board assets, resync them with:

```bash
npm run sync:analyze
```

If you change the Tailwind source for the standalone stylesheet, rebuild first:

```bash
npm run build:css
npm run sync:analyze
```

## Removed Product Areas

The repo should not reintroduce these as primary product surfaces:

- LLM coach and chat flows
- RAG pipelines
- SAE pages
- review flows and peer-review backend
- Chessmemo note-taking as the primary surface
- generic performance dashboards disconnected from the training loop
- embedding-based weakness inference and cluster-based recommendation (this approach was tested empirically and did not show signal beyond rating-matched random selection — see the experimental archive in `/research`)

Reflection notes can exist inside completed training sequences, but the product is the simulator, mistake archive, and SRS queue — not a general chess notebook.

## What This Product Is Not

- It is not a puzzle trainer. The positions are full positions with multiple reasonable moves, and you're scored on a sequence, not a single move.
- It does not infer abstract weakness clusters. It just shows you the positions you actually got wrong.
- It does not promise improvement. It exposes you to your mistakes repeatedly. Whether you learn from them is between you and your conscience.
- It is not for absolute beginners. Cold-start filler works, but the product gets meaningfully better once the user has 20+ rated games to mine for material.
