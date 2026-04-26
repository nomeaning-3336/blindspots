# Train Post-Mortem QA Report

Date: 2026-04-25
Base URL: http://localhost:3000
Account used: joejen47u@gmail.com

## Commands

- `npm run build` - passed
- `npx tsc --noEmit` - passed
- `npx playwright test` - failed because no Playwright setup exists. Playwright attempted to load the existing Node test files and reported ESM/CommonJS errors plus `No tests found`.
- Direct Playwright QA script - completed. Raw JSON: `qa-artifacts/train-postmortem-playwright-report.json`

## Artifacts

- `qa-artifacts/01-active-start.png`
- `qa-artifacts/02-postmortem-final.png`
- `qa-artifacts/row-select-0.png`
- `qa-artifacts/row-select-2.png`
- `qa-artifacts/row-select-4.png`
- `qa-artifacts/graph-0-center.png`
- `qa-artifacts/graph-1-center.png`
- `qa-artifacts/graph-2-center.png`
- `qa-artifacts/graph-3-center.png`
- `qa-artifacts/selected-piece-probe.png`
- `qa-artifacts/narrow-1280x800.png`

## Summary

Post-mortem can be reached by signing in and completing a four-move training sequence. The compact layout is mostly intact: no legacy analyze runtime, no PGN/FEN import, no coach/tool panel, and no extra review card appeared. The right panel shows five engine rows at desktop and 1280x800.

## Findings

1. Board overlay only draws three unselected engine arrows/nodes.
   Repro: complete a train sequence and wait for post-mortem. The engine panel says `5 lines`, but the board only renders three engine arrows/nodes. Static cause: `buildEngineArrows(..., selectedSquare)` uses `lines.slice(0, 3)` when no piece is selected.

2. Engine arrow/node colors are inconsistent between unselected and selected-piece states.
   Repro: in post-mortem, observe board engine nodes with no piece selected; then select a piece such as the knight. Unselected overlay uses `var(--app-class-best)` for all arrows/nodes, while selected-piece overlay uses `classificationColor(...)`. This matches the reported knight color bug.

3. Best engine move label is missing.
   Expected: top engine move should show compact text like `(Engine move)`. Observed: the engine rows show classification glyphs and eval/depth, but no visible `Engine move` label. Move-table rows only show `Engine move` when the played move equals the current best engine UCI.

4. `Your move` label is conditional and was not observed in the tested sequence.
   In the tested line, the selected played moves did not appear among the top engine rows, so `Your move` did not appear. This may be correct for that position, but still needs a deterministic fixture where the user move is in the top five.

5. Eval graph click behavior can leave multiple rows highlighted.
   Repro: click graph points near their centers and offsets. Several captures in the raw report show more than one move row with highlight background after graph clicks. This makes selected state ambiguous.

6. Automated post-mortem wait condition was too strict, but screenshots confirm post-mortem loaded.
   The script waited for `Engine lines`, `Before`, and `Next position`; it timed out because the visible table header is uppercase and the condition was brittle. The screenshots confirm post-mortem was present.

## Requirements Check

1. Completed post-mortem loads: pass, screenshot `02-postmortem-final.png`.
2. Move table selection: partial. Rows are clickable and show pointer cursor for real move rows. Row highlight appears. Board visually changes in screenshots, but a robust selector is needed to assert FEN directly.
3. Engine line labels: fail. `Engine move` label missing on top engine row. `Your move` not observed with this non-deterministic sequence.
4. Eval graph hit area: partial/fail. Hit areas are clickable, but multiple highlighted rows were observed.
5. Compact UI constraints: pass. No review card, no changed side labels observed, no full legacy controls/import/coach panel.
6. Visual regression: partial pass. Desktop fits. At 1280x800, layout remains usable, but bottom table rows sit near the viewport edge.
7. Console/network: pass for errors. No React/hydration/page errors captured. No failed API responses. `/api/train/engine-lines` returned 200s. The full QA run saw many engine-line requests during prefetch/clicking, but no 500s.
8. Playwright tests: no repo Playwright setup exists. Direct Playwright QA script used instead.

## Blockers / Notes

- There are no stable test IDs on the train post-mortem surface, so the QA script used text/layout selectors. Adding minimal `data-testid` hooks would make this reliable.
- The training position and engine lines are non-deterministic, so label cases like `Your move` need a fixed fixture or seeded mock route to verify consistently.
