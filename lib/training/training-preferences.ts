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

// ── SRS Types ─────────────────────────────────────────────────────────────────────

export type SrsProfileLevel = "easy" | "balanced" | "hard" | "extreme" | "custom";

export interface SrsConfig {
  firstReviewDelayDays: number;
  passIntervalsDays: number[];
  failDelayDays: number;
  assumedPassRate: number;
}

export interface SrsProfileOption {
  level: SrsProfileLevel;
  label: string;
  description: string;
  recommended?: boolean;
  config: SrsConfig;
}

export const SRS_PROFILE_OPTIONS: SrsProfileOption[] = [
  {
    level: "easy",
    label: "Easy",
    description: "Relaxed schedule",
    config: { firstReviewDelayDays: 2, passIntervalsDays: [2, 5, 12, 25, 60, 120], failDelayDays: 1, assumedPassRate: 0.82 },
  },
  {
    level: "balanced",
    label: "Balanced",
    description: "Recommended",
    recommended: true,
    config: { firstReviewDelayDays: 1, passIntervalsDays: [1, 3, 7, 14, 30, 60], failDelayDays: 1, assumedPassRate: 0.78 },
  },
  {
    level: "hard",
    label: "Hard",
    description: "Frequent reviews",
    config: { firstReviewDelayDays: 1, passIntervalsDays: [1, 2, 4, 8, 16, 32, 64], failDelayDays: 1, assumedPassRate: 0.74 },
  },
  {
    level: "extreme",
    label: "Extreme",
    description: "Maximum intensity",
    config: { firstReviewDelayDays: 0, passIntervalsDays: [0, 1, 2, 4, 7, 14, 30, 60], failDelayDays: 1, assumedPassRate: 0.7 },
  },
  {
    level: "custom",
    label: "Custom",
    description: "Configure your own schedule",
    config: { firstReviewDelayDays: 1, passIntervalsDays: [1, 3, 7, 14, 30, 60], failDelayDays: 1, assumedPassRate: 0.78 },
  },
];

export const SRS_PROFILES: Record<SrsProfileLevel, SrsConfig> =
  Object.fromEntries(
    SRS_PROFILE_OPTIONS.map((profile) => [profile.level, profile.config]),
  ) as Record<SrsProfileLevel, SrsConfig>;

export function getSrsProfileConfig(level: SrsProfileLevel): SrsConfig {
  return (
    SRS_PROFILE_OPTIONS.find((profile) => profile.level === level)?.config ??
    SRS_PROFILE_OPTIONS.find((profile) => profile.level === "balanced")!.config
  );
}

export type SrsForecastPoint = { day: number; reviewsDue: number };

export function simulateSrsForecast(
  dailyNewPositions: number,
  srsConfig: SrsConfig,
  days = 240,
): SrsForecastPoint[] {
  const safeDailyNew = Math.max(1, Math.min(300, Math.round(dailyNewPositions)));
  const dueByDay: Map<number, number>[] = Array.from(
    { length: days + 3650 },
    () => new Map<number, number>(),
  );
  const points: SrsForecastPoint[] = [];

  function schedule(day: number, stage: number, count: number) {
    if (!Number.isFinite(day) || !Number.isFinite(count)) return;
    if (day < 0 || day >= dueByDay.length || count <= 0) return;
    const prev = dueByDay[day].get(stage) ?? 0;
    dueByDay[day].set(stage, prev + count);
  }

  for (let day = 0; day < days; day += 1) {
    schedule(day + srsConfig.firstReviewDelayDays, 0, safeDailyNew);

    const today = dueByDay[day];
    let reviewsDue = 0;

    for (const [stage, count] of today.entries()) {
      reviewsDue += count;

      const passed = count * srsConfig.assumedPassRate;
      const failed = count - passed;

      const nextStage = Math.min(
        stage + 1,
        srsConfig.passIntervalsDays.length - 1,
      );

      const passDelay =
        srsConfig.passIntervalsDays[nextStage] ??
        srsConfig.passIntervalsDays[srsConfig.passIntervalsDays.length - 1] ??
        30;

      // Avoid same-day recursive scheduling: follow-ups are at least next day
      const safePassDelay = Math.max(1, passDelay);
      const safeFailDelay = Math.max(1, srsConfig.failDelayDays);

      schedule(day + safePassDelay, nextStage, passed);
      schedule(day + safeFailDelay, stage, failed);
    }

    points.push({
      day,
      reviewsDue: Math.round(reviewsDue),
    });
  }

  return points;
}

// ── Training Preferences ────────────────────────────────────────────────────────

export interface TrainingPreferences {
  dailyTargetLevel: DailyTargetLevel;
  dailyTargetPositions: number;
  mistakeCaptureThresholdLevel: MistakeCaptureThresholdLevel;
  mistakeCaptureThresholdCp: number;
  srsProfileLevel: SrsProfileLevel;
  srsConfig: SrsConfig;
}

export const DEFAULT_TRAINING_PREFERENCES: TrainingPreferences = {
  dailyTargetLevel: "balanced",
  dailyTargetPositions: 10,
  mistakeCaptureThresholdLevel: "balanced",
  mistakeCaptureThresholdCp: 75,
  srsProfileLevel: "balanced",
  srsConfig: SRS_PROFILES.balanced,
};

export function getDailyTargetByLevel(level: DailyTargetLevel) {
  return DAILY_TARGET_OPTIONS.find((o) => o.level === level) ?? DAILY_TARGET_OPTIONS[1];
}

export function getMistakeThresholdByLevel(level: MistakeCaptureThresholdLevel) {
  return MISTAKE_CAPTURE_THRESHOLD_OPTIONS.find((o) => o.level === level) ?? MISTAKE_CAPTURE_THRESHOLD_OPTIONS[1];
}

export const DAILY_GOAL_CHECKPOINTS = [0.25, 0.5, 0.75, 1.0];
