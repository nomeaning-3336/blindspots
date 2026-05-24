export const APP_THEMES = [
  {
    id: "paper",
    label: "Paper",
    description: "Warm score-sheet surface with petrol accents.",
    preview: ["#f4f1ea", "#ffffff", "#1f6f87"],
  },
  {
    id: "dark",
    label: "Dark",
    description: "Late-night practice surface with the same petrol accent.",
    preview: ["#0e0d10", "#16151a", "#1f6f87"],
  },
] as const;

export type AppTheme = (typeof APP_THEMES)[number]["id"];

export const DEFAULT_APP_THEME: AppTheme = "paper";

export function isAppTheme(value: unknown): value is AppTheme {
  return APP_THEMES.some((theme) => theme.id === value);
}

export function normalizeAppTheme(value: unknown): AppTheme {
  if (
    value === "midnight" ||
    value === "ocean" ||
    value === "forest" ||
    value === "crimson"
  ) {
    return "dark";
  }
  if (value === "light" || value === "solarized") {
    return "paper";
  }
  return isAppTheme(value) ? value : DEFAULT_APP_THEME;
}
