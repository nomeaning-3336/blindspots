export const ARCADE_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const ARCADE_VARIANTS = {
  vanilla: {
    key: "vanilla",
    title: "Vanilla",
    subtitle: "Pick the Elo",
    description:
      "Play standard chess against a human-like opponent at an Elo of your choosing. No hidden twists, just clean classical play.",
  },
  drunkfish: {
    key: "drunkfish",
    title: "Drunkfish",
    subtitle: "Invisible Elo swings",
    description:
      "Play standard chess against a human-like opponent whose strength keeps drifting during the game. One turn it blunders, the next it catches fire.",
  },
  weirdhorse: {
    key: "weirdhorse",
    title: "Weirdhorse",
    subtitle: "Horse law mutates",
    description:
      "Every 10 plies the horse law changes and knight movement gets remapped to a fresh jump card. The current law is always shown to you.",
  },
} as const;

export const ARCADE_VARIANT_ORDER = [
  ARCADE_VARIANTS.vanilla,
  ARCADE_VARIANTS.drunkfish,
  ARCADE_VARIANTS.weirdhorse,
] as const;

export type ArcadeVariantKey = keyof typeof ARCADE_VARIANTS;

export type ArcadeGameStatus = "active" | "finished";

export interface ArcadeGameSummary {
  id: string;
  variantKey: ArcadeVariantKey;
  status: ArcadeGameStatus;
  currentFen: string;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string;
}

export interface ArcadeInitialGameSnapshot {
  gameId: string;
  variantKey: ArcadeVariantKey;
  state: Record<string, unknown> | null;
}

export function isArcadeVariantKey(value: unknown): value is ArcadeVariantKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ARCADE_VARIANTS, value)
  );
}
