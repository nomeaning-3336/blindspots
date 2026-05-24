# Blindspots.gg Web UI Kit — Training Session

The product surface: a board-first daily deliberate-practice app. You sign in, the board is already there, a decision position appears from your queue, you make a move, you get feedback, the next position arrives.

## Files

| File | What it does |
|---|---|
| `index.html` | App entry — loads React + Babel + components |
| `kit.css` | Layout (top bar, board workspace, sidebar) |
| `app.jsx` | Main `App`, queue, mock data, move-resolution logic |
| `components/Icons.jsx` | Inline Lucide-style SVG icons + the logo mark |
| `components/Board.jsx` | 8×8 board renderer with paper-friendly piece styling |
| `components/AppShell.jsx` | Minimal `TopBar` — brand, Add FEN, theme toggle, avatar |
| `components/panels.jsx` | `TodayPanel`, `FeedbackCard`, `AddFenSheet` (consolidated) |

## What's interactive

- **Click a piece, click a destination** → submit a move
- **Best/Brilliant** for the canonical solution, **Inaccuracy** for the distractor, **Blunder** for anything else
- After feedback, **Next position** advances the queue
- **Skip** advances without scoring
- **Flip** toggles board orientation
- **Add FEN** opens a one-field inline sheet at the top
- **Theme toggle** switches between paper and dark
- The destination square shows **green** (correct), **red** (incorrect), or **yellow** (last move)

## What's faked

- Move legality isn't enforced — any square-to-square click is accepted, then matched against the canned solution/distractor pair
- The "engine line" text and verdict reasons are hardcoded per position
- Add FEN doesn't actually add anything; submitting closes the sheet
- Three positions cycle on a loop (Caro-Kann middlegame, R+P endgame, knight fork tactic)

## Caveats

- The board's aspect-ratio sizing assumes a wide viewport. Below ~720px height the layout may need tuning.
