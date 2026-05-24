# Blindspots.gg Design System

> **Fix the positions you actually struggle with.** Blindspots is a board-first, daily deliberate-practice app for chess. You sign in, the board is already there, a decision position from your training queue appears, you make a move, you get feedback, the next position arrives.

## What this project is

This is the visual + tonal foundation for everything Blindspots ships: the app itself, marketing, social, emails, exports. Designs built on top of this folder should look unmistakably like the brand without needing to ask.

## Product truth

Blindspots is **not** an esports analytics dashboard, not a chess-coaching content product, not a post-game review tool. It is a **board-first daily practice app** in the deliberate-practice tradition (Anki, but for chess decision positions).

The defining user experience is:
1. Signed-in returning user opens the app.
2. The board is **immediately** visible — no splash, no nav-then-click.
3. A compact **Today** panel shows due work and current context (streak, positions due, themes).
4. A **decision position** from the user's training queue is on the board, served cold. No previous-move animation, no prelude.
5. The player makes a move on the board.
6. Feedback appears in the same workspace — no modal, no route change.
7. The next position arrives without navigating away.
8. **Add FEN** is a tiny secondary action: one FEN field, one submit button. That's the whole manual-creation flow.

## How the product should feel

| Should feel | Should not feel |
|---|---|
| Quiet | Loud |
| Precise | Brutalist |
| Focused | Decorated |
| Premium but restrained | Esports / control-center |
| Chess-native | Generic AI dashboard |
| Habit-forming | Gamified |
| Faster and calmer than a dashboard | Every component fighting for attention |

The board is the protagonist. Everything else is the support cast.

## Sources & assumptions

I had only the logo and the eight move-quality badges to work from. Everything below is extrapolation; please correct anything that's off.

- `uploads/blindspots-logo.svg` & `uploads/logo.png` — crosshair mark, accented core, designed on black
- `uploads/{brilliant,best,excellent,okay,inaccuracy,mistake,blunder,critical}.png` — verdict badges (98×98 PNG)

No codebase, Figma, marketing site, or design system was provided.

---

## Index

| File | What it is |
|---|---|
| `README.md` | this file — brand context, content & visual foundations, iconography |
| `colors_and_type.css` | all design tokens — colors (paper + dark), type, spacing, radii, motion |
| `SKILL.md` | Agent Skill manifest |
| `assets/` | logo (PNG + SVG), move quality badges |
| `assets/move-quality/` | the eight verdict icons |
| `preview/` | 20+ design system specimen cards |
| `ui_kits/web/` | Web app UI kit — training session screen |

---

## CONTENT FUNDAMENTALS

### Voice

**Calm, knowing, second-person.** Blindspots is a quiet practice partner, not a coach hyping you up. We name what happened, we move on. We do not narrate.

- **Person:** Second person ("Your turn", "You picked the second-best move"). Never third.
- **Tone:** Low-volume. The product is the practice; the copy gets out of the way.
- **Casing:** Sentence case everywhere. Eyebrow labels are UPPERCASE with wide tracking, used very sparingly.
- **Punctuation:** Periods. One short sentence is better than two. The badges already carry exclamation marks (`!!`, `?!`, `??`) — copy doesn't need any.
- **Numbers:** Mono font, always. `+1.2`, `3 due today`, `87%`. Specific beats approximate.
- **Emoji:** None. The eight verdict badges already serve that role.

### Copy examples

| ✓ Do | ✗ Don't |
|---|---|
| 3 positions due. | Welcome back, champ! Ready to crush some chess? 🔥 |
| Your turn. White to move. | Time to dominate! Show 'em what you've got! |
| Best move. Engine agrees at depth 22. | BRILLIANT MOVE!! You're on FIRE today! ⚡ |
| Inaccuracy. Knight is stronger on f5. | Oops, not quite. Try thinking about your knights! |
| Add FEN | Create new training position |
| 4-day streak | 4 days in a row! Keep the chain alive! 🔗 |
| Saved. | Position created successfully ✨ |

### Microcopy patterns

- **CTAs are short and specific:** `Submit`, `Skip`, `Show line`, `Add FEN`. Never `Get started`, never `Continue your journey`.
- **Verdicts are one word:** `Best.` `Inaccuracy.` `Blunder.` A short sentence follows.
- **Empty states are quiet:** "No positions due. New batch unlocks in 4h." Not "All caught up! Great job!"
- **Errors are matter-of-fact:** "Invalid FEN — check piece placement." No "Oops!"
- **Avoid streak language that gamifies:** show "4-day streak" as a small mono number, not a flame.

---

## VISUAL FOUNDATIONS

### Color — paper-first, dark as alternate

The brand is **paper-default**. A warm, museum-lit off-white (`#F4F1EA`) that lets the board read as the focal object. Think analog score-sheet, not LED control room.

A **dark theme** exists for late-night practice — equally first-class, also calm. Soft warm whites on `#0E0D10`, not stark white on pure black, not neon.

- **One accent: petrol teal `#1F6F87`.** Used **sparingly** — for the active CTA in a workspace, the focused board square ring, and the logo. Never as ambient atmosphere. If three accent things are visible at once, two are wrong.
- **The eight verdict colors** (cyan brilliant → red blunder) are brand-owned. They are sacred. Never remap to "primary/secondary/danger".
- **Imagery is rare.** When used: actual chess boards, position diagrams, an analog clock. Never stock photos, never illustrated characters, never gradients-as-imagery.

### Type — Space Grotesk + JetBrains Mono, used quietly

- **Display + body: Space Grotesk** (400/500/600). Sharp but not loud. No display sizes above 44px — the brand has no hero copy moments.
- **Notation: JetBrains Mono** (400/500/700). All chess notation, all numbers, all keyboard shortcuts.
- **Tracking:** display tight (`-0.015em`), body flat, eyebrows wide UPPERCASE.
- **Line height:** 1.55 on body. Don't squeeze.
- **⚠ Substitution flag:** both Google Fonts placeholders. Send real font files if these aren't right.

### Backgrounds, motifs, textures

- **No gradients on UI surfaces.** Solid paper or solid dark. The only gradient permitted is a 4–8% radial accent wash behind the active board *only*, and only at the moment of feedback.
- **No background imagery** in product surfaces. Marketing pages may use a single positioned board as wallpaper, low contrast.
- **No textures, no patterns, no grain.** Even paper texture is too loud. Solid color is the texture.
- **The crosshair logo is not a decorative motif.** Don't place it as background art. It appears as the brand mark, in one spot, modestly sized.

### Elevation — restrained shadows, not glow

The previous version of this system leaned on neon glow. **Walk it back.** Glow is reserved for:

- Focus state on the active board square
- Hover state on the primary CTA only
- That's it.

Default elevation uses soft shadows in paper mode (`0 2px 8px rgba(26,23,20,0.06)`) and slightly deeper ones in dark. Cards default to **no shadow, no border** in paper mode (let the background do the work) and a thin `1px solid divider` in dark. Borders before shadows; shadows before glow.

### Animation

- **Quiet.** 200ms default, 120ms hover, `cubic-bezier(0.2, 0, 0, 1)`.
- **No prelude.** Positions are served cold — they don't animate in piece-by-piece, no previous-move replay, no countdown. The board is just *there*.
- **Feedback animation:** the moved piece settles into its square (60ms), then a quiet color wash on the destination square (180ms). No bounces. No confetti.
- **No parallax, no scroll-jacking, no hover-bounce, no scale transforms on press.**

### Borders, corners, cards

- **Default radius: `--bs-radius-md` (10px)** for cards, inputs, buttons.
- **Card style (paper):** white surface (`#FFFFFF`) on the warm page, no border, no shadow at rest, `1px solid divider` on hover. 16–24px padding.
- **Card style (dark):** `surface-0` with a `1px solid divider` border. Same padding.
- **Pills (999px)** only for status chips. Not for buttons.

### Density

Higher than a marketing site, lower than a power-user IDE. The Today panel is compact — one position info, one streak number, one due count, one "Add FEN" affordance. Not seventeen stats.

### Hit targets

44px on touch, 32px on desktop. Board squares should hit the entire square, never a smaller hit area.

---

## ICONOGRAPHY

Three registers, in priority order:

### 1. Move-quality badges (brand-owned)

`assets/move-quality/*.png` are the only "brand icons". They render whenever a move is being classified — full-color, never recolored, never substituted. Sizes:

- **48px** — feedback card after a move
- **22px** — inline beside a SAN move in a line list
- **98px** — verdict moments (post-session summary)

### 2. Lucide line icons (CDN)

For UI affordances (search, settings, plus, check, x, arrow-left, arrow-right, more). **1.6 stroke, 18px default, round caps and joins.**

```html
<script src="https://unpkg.com/lucide@latest"></script>
<i data-lucide="plus"></i>
```

**⚠ Substitution flag:** No codebase icon set was provided. Lucide is the placeholder.

### 3. Chess pieces — SVG sprites

`assets/pieces/*.svg` holds the full set: `wK wQ wR wB wN wP / bK bQ bR bB bN bP`. The board uses these directly via `<img src>`. Sized as a percentage of the square (78%) with a subtle drop-shadow.

Unicode chess characters (`♔♕♖♗♘♙ / ♚♛♜♝♞♟`) are reserved for **inline prose** only ("the ♞ on c3 covers e4").

### Emoji

**None.** Including the streak flame.

---

*Generated by the Blindspots.gg design-system agent. Iterate via the Design System tab.*
