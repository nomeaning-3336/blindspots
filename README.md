# Blindspots.gg

Blindspots.gg is a position-based chess training simulator.

Users play short N-move sequences from a given position against a configurable opponent model. Stockfish evaluates each move silently during the sequence. When the sequence ends, the user sees an evaluation graph and can write a short reflection note.

The product does not ask users to choose themes, openings, motifs, or mistake categories. It infers weak position patterns from repeated behavior, groups similar positions, and serves more positions from the areas where the user is losing evaluation. Those positions are the user's blindspots.

## Product Direction

The core training signal is eval preservation across a sequence.

Blindspots.gg is not a puzzle trainer. There are no right or wrong answers, forcing lines, or one-move solutions. The user plays the position out against an opponent model, and the system measures how well they preserve the position over the full sequence.

The main loop is:

1. Select a position from the user's current blindspot profile.
2. Play a short sequence against the configured opponent model.
3. Track the hidden Stockfish evaluation after every move.
4. Score the sequence by evaluation preservation, not by tactic completion.
5. Store the result, reflection, and position embedding.
6. Update the user's blindspot profile and serve the next targeted position.

The system should learn structural weakness patterns from play data, not self-reporting.

## Main Routes

- `/train` - core training session with board, configurable opponent, sequence loop, hidden eval tracking, post-sequence graph, and reflection note.
- `/profile` - blindspot profile with weakness clusters over time, session history, model confidence, and Blindspots Elo.
- `/analysis` - standalone analysis board kept as a secondary surface for inspection and review.
- `/account` - settings, linked chess profiles, analysis preferences, board/piece preferences, and theme preferences.

Compatibility aliases may exist during migration, but new product work should target the routes above.

## Tech Shape

- Next.js App Router for the web app and API routes.
- Supabase for authentication, persistence, linked chess profiles, user preferences, training sessions, blindspot clusters, and reflection notes.
- Existing standalone analysis runtime for the `/analysis` surface.
- Stockfish for silent evaluation tracking during training sequences and analysis-board evaluation.
- Configurable opponent move generation during training:
  Maia-2 by default for human-like play near the user's Elo, Stockfish at reduced strength for principled engine opposition, or Leela as a middle-ground opponent.
- Vector store for position embeddings and similarity search across prior failures, training positions, and blindspot clusters.

## Training Model

Training positions can come from linked user games, imported games, curated source pools, or generated positions that match a known weakness cluster.

Each training sequence should persist:

- starting FEN and side to move
- move sequence played by the user and opponent model
- Stockfish evaluation trace
- eval-preservation score
- opponent model and strength settings
- sequence length and timing metadata
- optional user reflection
- position vector or lookup key for similarity search
- blindspot cluster assignment, if known

Blindspot profiles should be derived from stored sequences and position similarity. The user should not need to manually label a position as an opening issue, endgame issue, tactic issue, or structure issue.

## Position Sourcing

Training positions can be sourced from:

- user's own games from linked profiles, which become the primary source once enough data is available
- imported PGNs
- curated position pools for cold-start users
- opening-constrained pools based on openings the user has configured in their profile or account settings
- positions generated to match a known blindspot cluster derived from behavior

Opening-constrained pools let users specify openings they actually play, such as `1.e4 e5 Nc3` as White, `1.e4 c5` as Black, or `1.d4 Nf6` as either side. Positions are then drawn from games that reached those openings.

Opening preferences are profile-level configuration, not per-session choices. Training should feel continuous across sessions: if the user has told the system they play the Caro-Kann, every session can factor that into position selection.

## Project Structure

- `app/`
  Next.js routes, API handlers, auth entry points, and app-shell pages. Product routes should converge on `/train`, `/profile`, `/analysis`, and `/account`.
- `components/`
  Shared UI components for the app shell, training board, eval graph, blindspot profile, account settings, linked profiles, and analysis bridge.
- `lib/`
  Domain logic for auth, linked profiles, training sessions, Stockfish evaluation, opponent move generation, position normalization, embeddings, similarity search, and persistence helpers.
- `public/analyze/`
  Synced browser assets used by the embedded standalone analysis runtime.
- `standalone.js`, `standalone.css`, `standalone.html`
  Source files for the embedded analysis runtime.
- `scripts/sync-analyze-assets.mjs`
  Syncs root analysis assets into `public/analyze/`.
- `supabase/`
  Database migrations for auth-backed product data, linked profiles, training sessions, blindspot profiles, and user preferences.
- `tests/`
  Unit and integration tests for chess-domain scoring, profile updates, persistence helpers, and analysis/training utilities.

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

The app expects the usual Supabase environment variables in `.env.local`. Training also requires local or remote access to Stockfish, configured opponent move generation, and the configured vector store once those services are wired into the route handlers.

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
- generic performance dashboards disconnected from the blindspot training loop

Reflection notes can exist inside completed training sequences, but the product is the simulator and blindspot profile, not a general chess notebook.
