# Sources

Checked on 2026-05-06.

## Lichess

- Lichess source index: https://lichess.org/source
  - Reports current server boot/version and lists `lichess-org/chessground` as the frontend chess board.
- Lichess analysis board: https://lichess.org/analysis
  - Used to confirm the public analysis surface routes to Lichess analysis.
- Lichess main repo: https://github.com/lichess-org/lila
- Lichess analysis view source: https://github.com/lichess-org/lila/blob/master/ui/analyse/src/view/main.ts

## Chessground

- Repo/readme: https://github.com/lichess-org/chessground
  - Notes custom DOM diffing, small footprint, CSS-only theming, SVG arrows/circles, drag/drop, animation, and fluid layout.
- Renderer: https://github.com/lichess-org/chessground/blob/master/src/render.ts
- Animation planner/runner: https://github.com/lichess-org/chessground/blob/master/src/anim.ts
- Drag implementation: https://github.com/lichess-org/chessground/blob/master/src/drag.ts
- Drawing implementation: https://github.com/lichess-org/chessground/blob/master/src/draw.ts
- Utilities: https://github.com/lichess-org/chessground/blob/master/src/util.ts
- Base CSS: https://github.com/lichess-org/chessground/blob/master/assets/chessground.base.css

## Local Files

- `components/chess/analysis-board.tsx`
- `app/(shell)/train/train-client.tsx`
- `lib/training-board-ui.ts`
- `app/globals.css`
- `qa-artifacts/train-postmortem-qa-report.md`

