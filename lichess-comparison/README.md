# Lichess Analysis Comparison

Date: 2026-05-06

Scope: compare Blindspots train post-mortem board against Lichess analysis/Chessground for piece rendering, animations, and performance. This is an implementation research note, not a copy plan. Chessground is GPL-3.0-or-later, so direct reuse would affect licensing; the practical path is to reuse patterns, not code.

## Local Surface

The train post-mortem board is rendered through `components/chess/analysis-board.tsx`, mounted from `app/(shell)/train/train-client.tsx`.

Current shape:

- Board: React renders 64 `<button>` squares in an 8x8 CSS grid.
- Pieces: each piece is an `<img>` inside its square, using `/analyze/pieces/{theme}/{piece}.svg`.
- Dragging: pointer events update React state (`dragFrom`, `hoveredSquare`, `dragPosition`) and render a separate absolute dragged image.
- Highlights: square backgrounds, legal target spans, last-move badge image, and SVG overlays for annotations/engine arrows.
- Post-mortem: board is paired with `BoardWithEvalBar`, `ResultsPanel`, `EvalGraph`, `AnalysisMoveTable`, and `EngineLinesSection`.
- Layout transition: `train-layout-grid` animates board column movement and fades/slides in the post-mortem panel.

This is clear and maintainable, but every move/hover/drag can flow through React. Lichess separates the hot board layer from the rest of the app.

## What Lichess Uses

Lichess analysis uses Chessground for the board. Their public source page currently reports server commit `599421c`, booted 2026-05-04, and lists Chessground as the frontend chess board. Chessground's README describes it as the board used by Lichess, with custom DOM diffing, CSS-only board/piece theming, SVG arrows/circles, drag/drop, piece animation, fluid layout, and no chess logic inside the board.

Important source files inspected:

- `lichess-org/chessground/src/render.ts`
- `lichess-org/chessground/src/anim.ts`
- `lichess-org/chessground/src/drag.ts`
- `lichess-org/chessground/src/draw.ts`
- `lichess-org/chessground/src/util.ts`
- `lichess-org/chessground/assets/chessground.base.css`
- `lichess-org/lila/ui/analyse/src/view/main.ts`

## Piece Rendering

Lichess/Chessground:

- Uses custom DOM elements (`cg-board`, `piece`, `square`) positioned absolutely over the board.
- Pieces are not nested inside squares. Each piece is its own absolutely positioned node with `width: 12.5%`, `height: 12.5%`, and `transform: translate(...)`.
- Piece appearance comes from CSS classes such as `white pawn`, `black knight`, with `background-size: cover`. Theme swaps can happen by changing CSS, not by changing every piece node's `src`.
- The renderer reuses existing piece nodes by matching piece type/color and moving nodes to new keys. It only creates/removes DOM nodes for true additions/removals.
- Z-index is optional and can be computed by rank when needed; dragging and animation use specific z-index bands.

Blindspots:

- Pieces are image tags inside the square buttons.
- React recreates the board tree logically on FEN changes, even though keyed square buttons make DOM reuse decent.
- Theme changes require each image `src` to resolve to a different asset path.
- The board has more per-square DOM than Lichess because square, piece, legal target, coordinate, badge, and emphasis elements live together.

Takeaways:

- Consider moving train board pieces to a board-level absolute piece layer instead of nesting piece images inside squares. Keep square buttons or hit targets separately.
- Keep pieces as persistent keyed nodes and update only transforms when FEN changes.
- Keep square highlights as a sparse overlay layer instead of recalculating every square background through React on every board state.
- CSS background pieces are worth testing, but SVG `<img>` can remain if caching is good. The bigger gain is node reuse and transform positioning, not the exact asset primitive.

## Animations

Lichess/Chessground:

- Computes an animation plan by diffing previous pieces against current pieces.
- New pieces are matched to the nearest missing same-type piece. That makes normal moves animate from origin to destination without needing move metadata.
- Captured/missing pieces fade.
- Animation state stores a vector `[goalX, goalY, currentX, currentY]`; each animation frame updates current offsets.
- Movement uses `requestAnimationFrame` and `transform`, not layout properties.
- During animation, Chessground redraws the board but skips SVG shape redraws as an optimization.
- Dragging cancels conflicting piece animation and moves the dragged element directly with transforms.

Blindspots:

- Board transition animations exist for post-mortem layout, but piece movement itself is mostly instant between FEN states.
- Drag preview follows pointer through React state updates.
- Eval bar height transitions run with CSS and are cheap.
- Engine arrows/nodes can change with hover and selected move state, which is fine at small counts but should be isolated from piece movement.

Takeaways:

- Add piece-move animation as a board-internal diff, independent of post-mortem layout transitions.
- Animate `transform` on piece nodes only; do not animate square backgrounds or trigger full board rerenders per frame.
- Skip annotation/engine-arrow recomputation while a piece move animation is in progress unless the arrow inputs changed.
- Use a ghost piece for drag origin, like Chessground, so the origin square remains spatially stable while the active piece moves above it.

## Drag And Input Performance

Lichess/Chessground:

- Pointer/touch movement updates mutable drag state, then a RAF loop reads the latest pointer position and writes a transform.
- Drag does not start until a distance threshold is crossed.
- Touch scroll is prevented only when interaction intent is likely.
- Hover state over destinations is applied by class changes to existing destination nodes.
- Board coordinate lookup uses board bounds math instead of `document.elementFromPoint`.

Blindspots:

- `pointermove` updates React state for `dragPosition` and `hoveredSquare`.
- Drop target lookup uses `document.elementFromPoint(...).closest("[data-square]")`.
- Drag starts immediately on own-turn piece pointer down, with click-vs-drag resolved on pointer up via distance.

Takeaways:

- For a smoother board, keep drag pointer position in a ref and update the dragged piece transform in RAF.
- Keep React informed only at meaningful boundaries: select, move submitted, drag ended, annotation committed.
- Replace `elementFromPoint` with board-bounds coordinate math for square lookup. It is deterministic, avoids DOM hit-testing, and can share code with arrow geometry.
- Keep the distance threshold before visually entering drag mode; this reduces accidental drag work on simple taps.

## Board Sizing

Lichess/Chessground:

- Maintains a measured board container.
- Snaps board width to an 8-pixel grid at the current device pixel ratio. This keeps square/piece transforms crisp.
- Exposes CSS variables for measured board dimensions.

Blindspots:

- The board uses `aspect-square w-full`; post-mortem layout uses measured column width for the board slide.
- This is responsive and simple, but does not snap dimensions for transform crispness.

Takeaways:

- Add a measured board size hook that snaps width to `floor(width * devicePixelRatio / 8) * 8 / devicePixelRatio`.
- Use that size for the piece layer and SVG overlays so transforms land on consistent square boundaries.
- Keep mobile-first behavior: the board should still fit 375px without adding controls or explanatory UI.

## Annotation And Engine Arrows

Lichess/Chessground:

- Shapes are stored as lightweight draw state.
- Drawing runs through RAF and only redraws when the hovered destination square changes.
- Arrows can snap to valid moves.
- SVG shape layers are separated above/below pieces.

Blindspots:

- User annotations and engine arrows are both rendered through React/SVG.
- Engine arrows are already split into below-piece lines and above-piece destination nodes.
- Engine destination labels are useful for post-mortem, but dense node labels can compete with pieces.

Takeaways:

- Keep the current split-layer arrow model. It matches the right idea: engine lines below pieces, clickable nodes above.
- Move shape redraw behind memoized board geometry and stable props.
- Consider hiding lower-ranked engine nodes unless a piece is selected or an engine row is hovered. Lichess analysis is sparse by default; Blindspots should preserve the train surface's focus.
- Snap user-drawn arrows to legal moves only in analysis/explore mode, not during active training.

## Post-Mortem UX Compared To Lichess

Lichess analysis is a general-purpose workbench. Blindspots train post-mortem is narrower: explain the just-finished training sequence and let the user inspect alternatives.

Things to take:

- Board remains the primary object; side panels support it.
- Keyboard navigation should feel immediate.
- Pieces should glide between positions during review navigation.
- Engine arrows should be available but visually secondary until the user asks for them by selecting a piece, row, or graph point.
- Board interactions should stay fast even while analysis data streams in.

Things not to take:

- Full Lichess tool density: opening explorer, study controls, import/export, multiple side modules.
- Multi-color annotation complexity in training. This project requires one accent color and less UI.
- Always-visible analysis affordances that distract from the next training action.

## Priority Recommendations

1. Build a board-level piece layer.

Keep the existing `AnalysisBoard` API, but internally separate square hit targets from piece nodes. Pieces should be absolutely positioned by square transform, keyed by square and piece identity.

2. Add transform-based piece animation.

Diff previous and next piece maps. Animate matching same-type pieces from previous square to new square with RAF and cubic easing. Fade captures lightly or skip fade if it adds visual noise.

3. Move drag movement out of React state.

Use refs for pointer position and RAF for transform writes. Commit React state only when the move is submitted or canceled.

4. Replace DOM hit-testing with board math.

Compute square from pointer coordinates using board bounds, orientation, and snapped board dimensions. Use this for dragging, annotations, and hover.

5. Snap board dimensions.

Measure and snap board width to an 8-square boundary at device pixel ratio. This should improve visual crispness once pieces move by transform.

6. Throttle SVG overlay updates.

Do not redraw annotation/engine SVG every animation frame. Recompute only when shapes, arrows, hover target, selected move, orientation, or board size changes.

7. Keep post-mortem sparse.

Use Lichess performance patterns, not Lichess panel density. For this product, the best result is a quieter board that moves like Lichess, not a Lichess clone.

## Risks

- Directly importing Chessground is probably incompatible with this repo unless the whole combined client can satisfy GPL terms.
- A custom renderer adds imperative DOM code inside a React app. Keep it small and isolated behind the existing board API.
- Piece animation can mislead if move metadata differs from FEN diff in promotions/castling/en passant. Use explicit move data when available, and FEN diff fallback only for review navigation.
- Performance wins should be verified with Playwright trace or browser Performance panel, especially on 375px mobile width and low-power devices.

## Suggested Implementation Slice

Start with the post-mortem explore mode only:

- Keep active training board behavior unchanged.
- Add a new internal piece layer path behind `AnalysisBoard` when `mode="training"` and `lastMove` or review navigation changes.
- Animate board replay navigation and engine-line selection.
- Measure: FPS during ArrowLeft/ArrowRight review, React render count, and drag latency.

If it is stable, use the same renderer for active training drag.

