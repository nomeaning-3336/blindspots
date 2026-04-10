# Chessview

Chessview is a chess web app focused on four core product surfaces:

- Analysis
- Arcade
- Statistics / Performance
- Settings

The project previously experimented with LLM coaching, RAG, SAE tooling, and review flows. That direction has been intentionally removed for now so the app can stay focused on a smaller, clearer product.

## Product Direction

### 1. Analysis
The analysis board is the heart of the app.

Current goals:
- import FEN and PGN
- import recent games from linked Lichess or Chess.com profiles
- import recent standard-rules Arcade games
- inspect moves, engine lines, move list, opening info, and board state
- preserve a strong visual identity across themes

### 2. Arcade
Arcade is where Chessview can be playful and weird.

Current variants:
- `Vanilla`: standard chess against a human-like Maia opponent at a chosen Elo
- `Drunkfish`: standard chess where the opponent strength drifts during the game
- `Weirdhorse`: standard chess except knight movement mutates every 10 plies

Arcade runs are persisted in Supabase so a game can be resumed from the exact saved position.

### 3. Statistics / Performance
Performance is the progress page.

Current goals:
- aggregate recent games from linked profiles
- surface trends and rating context
- show a useful, readable dashboard instead of raw dumps

### 4. Settings
Settings is where users manage the practical parts of the app.

Current goals:
- analysis defaults
- board and piece visuals
- linked profile management
- app theme preferences

## Possible Later Surface
A future `Library` page may hold articles, books, notes, or a lightweight blog. That is not part of the active scope right now.

## Tech Shape

- Next.js App Router shell for the signed-in app
- Clerk for authentication
- Supabase for persistence
- `standalone.js` remains the source of truth for the embedded analysis runtime
- `public/analyze/` is the synced runtime copy served by Next.js
- Maia 2 powers the current Arcade opponent behavior

## Main Routes

- `/analysis` — main analysis experience
- `/analyze` — compatibility alias to the analysis experience
- `/arcade` — Arcade dashboard and active runs
- `/arcade/:gameId` — persisted Arcade game room
- `/performance` — statistics / performance dashboard
- `/account` — settings page

## Project Structure

- `app/`
  Next.js routes, API handlers, and auth entry points.
- `components/`
  App shell, settings forms, Arcade dashboard, performance UI, and analyze bridge components.
- `lib/`
  persistence helpers, theme helpers, profile linking, Arcade storage, and performance logic.
- `public/analyze/`
  synced browser assets used by the embedded analysis app.
- `standalone.js`, `standalone.css`, `standalone.html`
  source files for the embedded analysis runtime.
- `scripts/sync-analyze-assets.mjs`
  syncs root analyze assets into `public/analyze/`.
- `supabase/`
  database migrations for the active app features.

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

- `/analysis`
- `/arcade`
- `/performance`
- `/account`

## Analyze Asset Workflow

If you change `standalone.js`, `standalone.css`, `standalone.html`, or the supporting board assets, resync them with:

```bash
npm run sync:analyze
```

If you change the Tailwind source for the standalone stylesheet, rebuild first:

```bash
npm run build:css
npm run sync:analyze
```

## What Was Removed On Purpose

The repo no longer treats these as active product areas:

- LLM coach / chat flows
- RAG pipelines and transcript tooling
- SAE pages and related API routes
- review-specific routes and supporting backend code
- provider API-key storage flows for assistant models

That cleanup is intentional. The current goal is to build a strong chess product first, not a fragile AI coach wrapper.
