import { normalizeAppTheme, type AppTheme } from "@/lib/app-theme";

export type AnalyzeLimitKind = "time" | "depth";
export type AnalyzeBoardTheme = "paper" | "dark";
export type AnalyzePieceTheme =
  | "blindspots"
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
    case "paper":
    case "dark":
      return value;
    case "light":
    case "solarized":
    case "grey":
      return "paper";
    case "forest":
    case "ocean":
    case "crimson":
    case "midnight":
      return "dark";
    default:
      return "paper";
  }
}

export function analyzeBoardThemeForAppTheme(
  value: AppTheme | string | null | undefined,
): AnalyzeBoardTheme {
  return normalizeAppTheme(value) === "dark" ? "dark" : "paper";
}

export function normalizeAnalyzePieceTheme(value: unknown): AnalyzePieceTheme {
  switch (value) {
    case "blindspots":
    case "cburnett":
    case "alpha-wood":
    case "maestro":
    case "smart":
    case "staunty-wood":
    case "governor":
    case "companion":
      return value;
    default:
      return "blindspots";
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

export function syncAnalyzePreferencesWithAppTheme(
  value: Partial<AnalyzePreferences> | null | undefined,
  appTheme: AppTheme | string | null | undefined,
): AnalyzePreferences {
  const normalized = normalizeAnalyzePreferences(value);

  return {
    ...normalized,
    boardTheme: analyzeBoardThemeForAppTheme(appTheme),
  };
}
