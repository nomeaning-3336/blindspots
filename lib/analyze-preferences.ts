export type AnalyzeLimitKind = "time" | "depth";
export type AnalyzeBoardTheme =
  | "grey"
  | "light"
  | "solarized"
  | "forest"
  | "ocean"
  | "crimson"
  | "midnight";
export type AnalyzePieceTheme =
  | "cburnett"
  | "alpha-wood"
  | "maestro"
  | "smart"
  | "staunty-wood"
  | "governor"
  | "companion";

export interface AnalyzePreferences {
  limitKind: AnalyzeLimitKind;
  timeLimitValue: number;
  depthLimitValue: number;
  linesShown: number;
  threads: number;
  boardTheme: AnalyzeBoardTheme;
  pieceTheme: AnalyzePieceTheme;
}

export function normalizeAnalyzeLimitKind(value: unknown): AnalyzeLimitKind {
  return value === "depth" ? "depth" : "time";
}

export function clampAnalyzeTimeLimit(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed)) {
    return Math.min(1000000, Math.max(1, parsed));
  }
  return 250;
}

export function clampAnalyzeDepthLimit(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed)) {
    return Math.min(245, Math.max(1, parsed));
  }
  return 18;
}

export function clampAnalyzeLinesShown(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed)) {
    return Math.min(10, Math.max(1, parsed));
  }
  return 3;
}

export function clampAnalyzeThreads(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed)) {
    return Math.min(32, Math.max(1, parsed));
  }
  return 1;
}

export function normalizeAnalyzeBoardTheme(value: unknown): AnalyzeBoardTheme {
  switch (value) {
    case "grey":
    case "light":
    case "solarized":
    case "forest":
    case "ocean":
    case "crimson":
    case "midnight":
      return value;
    default:
      return "midnight";
  }
}

export function normalizeAnalyzePieceTheme(value: unknown): AnalyzePieceTheme {
  switch (value) {
    case "cburnett":
    case "alpha-wood":
    case "maestro":
    case "smart":
    case "staunty-wood":
    case "governor":
    case "companion":
      return value;
    default:
      return "maestro";
  }
}

export function normalizeAnalyzePreferences(
  value?: Partial<AnalyzePreferences> | null,
): AnalyzePreferences {
  return {
    limitKind: normalizeAnalyzeLimitKind(value?.limitKind),
    timeLimitValue: clampAnalyzeTimeLimit(value?.timeLimitValue),
    depthLimitValue: clampAnalyzeDepthLimit(value?.depthLimitValue),
    linesShown: clampAnalyzeLinesShown(value?.linesShown),
    threads: clampAnalyzeThreads(value?.threads),
    boardTheme: normalizeAnalyzeBoardTheme(value?.boardTheme),
    pieceTheme: normalizeAnalyzePieceTheme(value?.pieceTheme),
  };
}
