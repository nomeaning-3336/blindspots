export const APP_THEMES = [
  {
    id: "midnight",
    label: "Midnight",
    description: "The original black and purple shell.",
    preview: ["#121212", "#050505", "#c084fc"],
  },
  {
    id: "light",
    label: "Light",
    description: "Bright paper surfaces with soft purple accents.",
    preview: ["#fbf7f0", "#e6ded0", "#b38cff"],
  },
  {
    id: "solarized",
    label: "Solarized",
    description: "Warm sand panels with blue-green accents.",
    preview: ["#fdf6e3", "#eee8d5", "#2aa198"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Deep evergreen surfaces with moss highlights.",
    preview: ["#091612", "#11221c", "#8fd17f"],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Ink blue panels with cool cyan accents.",
    preview: ["#07131b", "#102532", "#7fd8ff"],
  },
  {
    id: "crimson",
    label: "Crimson",
    description: "Dark wine tones with soft coral emphasis.",
    preview: ["#14090d", "#261116", "#ff8ca8"],
  },
] as const;

export type AppTheme = (typeof APP_THEMES)[number]["id"];

export const DEFAULT_APP_THEME: AppTheme = "midnight";

export function isAppTheme(value: unknown): value is AppTheme {
  return APP_THEMES.some((theme) => theme.id === value);
}

export function normalizeAppTheme(value: unknown): AppTheme {
  return isAppTheme(value) ? value : DEFAULT_APP_THEME;
}
