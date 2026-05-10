export const DAILY_TARGET_OPTIONS = [
  { level: "easy", label: "Easy", positions: 5 },
  { level: "balanced", label: "Balanced", positions: 10, recommended: true },
  { level: "hard", label: "Hard", positions: 20 },
  { level: "extreme", label: "Extreme", positions: 50 },
] as const;

export type DailyTargetLevel = (typeof DAILY_TARGET_OPTIONS)[number]["level"];

export const MISTAKE_CAPTURE_THRESHOLD_OPTIONS = [
  { level: "lenient", label: "Lenient", cp: 100 },
  { level: "balanced", label: "Balanced", cp: 75, recommended: true },
  { level: "sensitive", label: "Sensitive", cp: 50 },
  { level: "strict", label: "Strict", cp: 25 },
] as const;

export type MistakeCaptureThresholdLevel = (typeof MISTAKE_CAPTURE_THRESHOLD_OPTIONS)[number]["level"];

export interface TrainingPreferences {
  dailyTargetLevel: DailyTargetLevel;
  dailyTargetPositions: number;
  mistakeCaptureThresholdLevel: MistakeCaptureThresholdLevel;
  mistakeCaptureThresholdCp: number;
}

export const DEFAULT_TRAINING_PREFERENCES: TrainingPreferences = {
  dailyTargetLevel: "balanced",
  dailyTargetPositions: 10,
  mistakeCaptureThresholdLevel: "balanced",
  mistakeCaptureThresholdCp: 75,
};

export function getDailyTargetByLevel(level: DailyTargetLevel) {
  return DAILY_TARGET_OPTIONS.find((o) => o.level === level) ?? DAILY_TARGET_OPTIONS[1];
}

export function getMistakeThresholdByLevel(level: MistakeCaptureThresholdLevel) {
  return MISTAKE_CAPTURE_THRESHOLD_OPTIONS.find((o) => o.level === level) ?? MISTAKE_CAPTURE_THRESHOLD_OPTIONS[1];
}

export const DAILY_GOAL_CHECKPOINTS = [0.25, 0.5, 0.75, 1.0];
