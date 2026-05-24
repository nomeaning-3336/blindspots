---
name: blindspots-design
description: Use this skill to generate well-branded interfaces and assets for Blindspots.gg, either for production or throwaway prototypes/mocks/etc. Blindspots is a board-first daily deliberate-practice app for chess — quiet, precise, premium, restrained, chess-native.
user-invocable: true
---

# Blindspots.gg Design Skill

Read the `README.md` file in this skill folder for the full brand context (product truth, voice, visual foundations, iconography). Then explore the other available files.

## Quick facts

- **Product:** board-first daily deliberate-practice app — decision positions, one at a time, feedback in-place
- **Defining experience:** you sign in → the board is already there → make a move → feedback → next position
- **Aesthetic:** paper-default (warm off-white) with dark as equal-class alternate. One petrol-teal accent (`#1F6F87`), used sparingly.
- **Type:** Space Grotesk (display + body), JetBrains Mono (notation)
- **Tone:** calm, second-person, low-volume. The product is the practice; copy gets out of the way.
- **Signature asset:** the eight move-quality badges in `assets/move-quality/` — brand-owned, never recolored or substituted
- **Forbidden:** emoji (including streak flames), gradients on UI surfaces, neon glow as elevation, hero-sized display copy, gamified language

## Files at a glance

| File | Use it for |
|---|---|
| `README.md` | Full brand context — read this first |
| `colors_and_type.css` | All design tokens (paper + dark themes, type, spacing, motion) |
| `assets/logo-mark.{png,svg}` | The crosshair mark |
| `assets/move-quality/*.png` | The eight verdict badges (98×98) |
| `assets/pieces/*.svg` | Chess piece sprite set (wK/wQ/wR/wB/wN/wP + black) |
| `preview/*.html` | Design system specimens — useful as visual reference |
| `ui_kits/web/` | Full React/JSX implementation of the training session screen |

## How to use this skill

If creating visual artifacts (slides, mocks, throwaway prototypes):
- Link or import `colors_and_type.css` — paper is the default theme, add `data-theme="dark"` on `<html>` for dark
- Copy any move-quality badge PNGs you need from `assets/move-quality/`
- Use the components in `ui_kits/web/components/` as reference for board, Today panel, feedback card
- The board is the protagonist. Don't add chrome that competes with it.

If working on production code:
- Read the README's PRODUCT TRUTH and VISUAL FOUNDATIONS sections
- Lift exact hex values from `colors_and_type.css` — never invent new colors
- Match the voice patterns in the README's copy examples

If the user invokes this skill without other guidance, ask what they want to build (which surface? variation count? paper or dark default?) and act as an expert designer who outputs HTML artifacts _or_ production code.

## Things to never do

- Don't write hype, cheerleading, or gamified copy
- Don't add gradient backgrounds, neon glow as elevation, or display copy above 44px
- Don't use emoji (the verdict badges already serve that role)
- Don't remap the eight move-quality colors to generic semantic colors
- Don't add a "previous move replay" before showing a training position — positions are served cold
- Don't add big tournament/esports framing — this is a quiet practice tool, not a streaming overlay
