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
    description: "~3× intervals",
    config: { firstReviewDelayDays: 3, passIntervalsDays: [3, 9, 21, 42, 90, 180], failDelayDays: 1, assumedPassRate: 0.82 },
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
    description: "~0.7× intervals",
    config: { firstReviewDelayDays: 1, passIntervalsDays: [1, 2, 4, 8, 16, 32, 64], failDelayDays: 1, assumedPassRate: 0.74 },
  },
  {
    level: "extreme",
    label: "Extreme",
    description: "~0.4× intervals",
    config: { firstReviewDelayDays: 0, passIntervalsDays: [0, 1, 2, 4, 7, 14, 30, 60], failDelayDays: 1, assumedPassRate: 0.7 },
  },
  {
    level: "custom",
    label: "Custom",
    description: "Configure your own intervals",
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

export type ReviewGradingLevel = "forgiving" | "balanced" | "strict" | "custom";

export interface ReviewGradingConfig {
  passCpLossMax: number;
  failCpLossMin: number;
}

export interface ReviewGradingOption {
  level: ReviewGradingLevel;
  label: string;
  description: string;
  recommended?: boolean;
  config: ReviewGradingConfig;
}

export const REVIEW_GRADING_OPTIONS: ReviewGradingOption[] = [
  {
    level: "forgiving",
    label: "Forgiving",
    description: "Small mistakes still pass.",
    config: { passCpLossMax: 75, failCpLossMin: 200 },
  },
  {
    level: "balanced",
    label: "Balanced",
    description: "Pass clean solves, repeat shaky ones.",
    recommended: true,
    config: { passCpLossMax: 50, failCpLossMin: 150 },
  },
  {
    level: "strict",
    label: "Strict",
    description: "Only near-best moves advance.",
    config: { passCpLossMax: 25, failCpLossMin: 100 },
  },
  {
    level: "custom",
    label: "Custom",
    description: "Set your own centipawn thresholds.",
    config: { passCpLossMax: 50, failCpLossMin: 150 },
  },
];

export const REVIEW_GRADING_PROFILES: Record<ReviewGradingLevel, ReviewGradingConfig> =
  Object.fromEntries(
    REVIEW_GRADING_OPTIONS.map((option) => [option.level, option.config]),
  ) as Record<ReviewGradingLevel, ReviewGradingConfig>;

export function normalizeReviewGradingConfig(value: unknown): ReviewGradingConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return REVIEW_GRADING_PROFILES.balanced;
  }

  const candidate = value as Record<string, unknown>;
  const passCpLossMax =
    typeof candidate.passCpLossMax === "number" && Number.isFinite(candidate.passCpLossMax)
      ? Math.round(candidate.passCpLossMax)
      : REVIEW_GRADING_PROFILES.balanced.passCpLossMax;

  const failCpLossMin =
    typeof candidate.failCpLossMin === "number" && Number.isFinite(candidate.failCpLossMin)
      ? Math.round(candidate.failCpLossMin)
      : REVIEW_GRADING_PROFILES.balanced.failCpLossMin;

  const safePass = Math.max(0, Math.min(1000, passCpLossMax));
  const safeFail = Math.max(safePass + 1, Math.min(2000, failCpLossMin));

  return {
    passCpLossMax: safePass,
    failCpLossMin: safeFail,
  };
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
  reviewGradingLevel: ReviewGradingLevel;
  reviewGradingConfig: ReviewGradingConfig;
}

export const DEFAULT_TRAINING_PREFERENCES: TrainingPreferences = {
  dailyTargetLevel: "balanced",
  dailyTargetPositions: 10,
  mistakeCaptureThresholdLevel: "balanced",
  mistakeCaptureThresholdCp: 75,
  srsProfileLevel: "balanced",
  srsConfig: SRS_PROFILES.balanced,
  reviewGradingLevel: "balanced",
  reviewGradingConfig: REVIEW_GRADING_PROFILES.balanced,
};

export function getDailyTargetByLevel(level: DailyTargetLevel) {
  return DAILY_TARGET_OPTIONS.find((o) => o.level === level) ?? DAILY_TARGET_OPTIONS[1];
}

export function getMistakeThresholdByLevel(level: MistakeCaptureThresholdLevel) {
  return MISTAKE_CAPTURE_THRESHOLD_OPTIONS.find((o) => o.level === level) ?? MISTAKE_CAPTURE_THRESHOLD_OPTIONS[1];
}

export const DAILY_GOAL_CHECKPOINTS = [0.25, 0.5, 0.75, 1.0];
