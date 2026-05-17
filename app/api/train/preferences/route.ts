import { NextResponse } from "next/server";
import { getOptionalAppUserId, requireAppAuth } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SEQUENCE_LENGTH = 4;
const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;

type TrainingPreferencesPayload = {
  sequenceLength?: unknown;
};

const VALID_DAILY_LEVELS = ["easy", "balanced", "hard", "extreme"];
const VALID_THRESHOLD_LEVELS = ["lenient", "balanced", "sensitive", "strict"];
const VALID_CP = [25, 50, 75, 100];
const VALID_SRS_LEVELS = ["easy", "balanced", "hard", "extreme", "custom"];
const VALID_REVIEW_GRADING_LEVELS = ["forgiving", "balanced", "strict", "custom"];

function isValidSrsConfig(cfg: unknown): cfg is {
  firstReviewDelayDays: number;
  passIntervalsDays: number[];
  failDelayDays: number;
  assumedPassRate: number;
} {
  if (typeof cfg !== "object" || cfg === null) return false;
  const c = cfg as Record<string, unknown>;
  if (typeof c.firstReviewDelayDays !== "number" || c.firstReviewDelayDays < 0 || c.firstReviewDelayDays > 365) return false;
  if (typeof c.failDelayDays !== "number" || c.failDelayDays < 0 || c.failDelayDays > 365) return false;
  if (typeof c.assumedPassRate !== "number" || c.assumedPassRate < 0.05 || c.assumedPassRate > 0.98) return false;
  if (!Array.isArray(c.passIntervalsDays)) return false;
  if (c.passIntervalsDays.length < 1 || c.passIntervalsDays.length > 12) return false;
  for (const v of c.passIntervalsDays) {
    if (typeof v !== "number" || v < 0 || v > 3650 || !Number.isFinite(v)) return false;
  }
  return true;
}

function isValidReviewGradingConfig(cfg: unknown): cfg is {
  passCpLossMax: number;
  failCpLossMin: number;
} {
  if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) return false;
  const c = cfg as Record<string, unknown>;
  if (typeof c.passCpLossMax !== "number" || !Number.isFinite(c.passCpLossMax)) return false;
  if (typeof c.failCpLossMin !== "number" || !Number.isFinite(c.failCpLossMin)) return false;

  const pass = Math.round(c.passCpLossMax);
  const fail = Math.round(c.failCpLossMin);

  if (pass < 0 || pass > 1000) return false;
  if (fail < 1 || fail > 2000) return false;
  if (pass >= fail) return false;

  return true;
}

export async function PATCH(request: Request) {
  const userId = await requireAppAuth("/train");
  const body = await request.json().catch(() => ({}));

  const supabase = getSupabaseAdminClient();
  const updates: Record<string, unknown> = {};

  if (typeof body.dailyTargetLevel === "string" && VALID_DAILY_LEVELS.includes(body.dailyTargetLevel)) {
    updates.daily_target_level = body.dailyTargetLevel;
  }
  if (typeof body.dailyTargetPositions === "number" && Number.isFinite(body.dailyTargetPositions)) {
    const positions = Math.round(body.dailyTargetPositions);
    if (positions >= 1 && positions <= 300) {
      updates.daily_target_positions = positions;
    }
  }
  if (typeof body.dailyReviewTargetPositions === "number" && Number.isFinite(body.dailyReviewTargetPositions)) {
    const reviews = Math.round(body.dailyReviewTargetPositions);
    if (reviews >= 1 && reviews <= 500) {
      updates.daily_review_target_positions = reviews;
    }
  }
  if (typeof body.mistakeCaptureThresholdLevel === "string" && VALID_THRESHOLD_LEVELS.includes(body.mistakeCaptureThresholdLevel)) {
    updates.mistake_capture_threshold_level = body.mistakeCaptureThresholdLevel;
  }
  if (typeof body.mistakeCaptureThresholdCp === "number" && VALID_CP.includes(body.mistakeCaptureThresholdCp)) {
    updates.mistake_capture_threshold_cp = body.mistakeCaptureThresholdCp;
  }
  if (typeof body.srsProfileLevel === "string" && VALID_SRS_LEVELS.includes(body.srsProfileLevel)) {
    updates.srs_profile_level = body.srsProfileLevel;
  }
  if (isValidSrsConfig(body.srsConfig)) {
    updates.srs_config = body.srsConfig;
  }
  if (
    typeof body.reviewGradingLevel === "string" &&
    VALID_REVIEW_GRADING_LEVELS.includes(body.reviewGradingLevel)
  ) {
    updates.review_grading_level = body.reviewGradingLevel;
  }
  if (isValidReviewGradingConfig(body.reviewGradingConfig)) {
    updates.review_grading_config = {
      passCpLossMax: Math.round(body.reviewGradingConfig.passCpLossMax),
      failCpLossMin: Math.round(body.reviewGradingConfig.failCpLossMin),
    };
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid preference fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_blindspot_profile")
    .update(updates as any)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as TrainingPreferencesPayload | null;
  const sequenceLength = normalizeSequenceLength(payload?.sequenceLength);
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("user_training_preferences").upsert(
    {
      user_id: userId,
      sequence_length: sequenceLength,
      opponent_mode: "standard",
      time_pressure_mode: "none",
      opening_filter: [],
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json(
      { error: `Failed to save training preferences: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, preferences: { sequenceLength } });
}

function normalizeSequenceLength(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SEQUENCE_LENGTH;
  return Math.max(MIN_SEQUENCE_LENGTH, Math.min(MAX_SEQUENCE_LENGTH, Math.round(parsed)));
}
