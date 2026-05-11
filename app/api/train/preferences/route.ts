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
const VALID_POSITIONS = [5, 10, 20, 50];
const VALID_CP = [25, 50, 75, 100];

export async function PATCH(request: Request) {
  const userId = await requireAppAuth("/train");
  const body = await request.json().catch(() => ({}));

  const supabase = getSupabaseAdminClient();
  const updates: Record<string, unknown> = {};

  if (typeof body.dailyTargetLevel === "string" && VALID_DAILY_LEVELS.includes(body.dailyTargetLevel)) {
    updates.daily_target_level = body.dailyTargetLevel;
  }
  if (typeof body.dailyTargetPositions === "number" && VALID_POSITIONS.includes(body.dailyTargetPositions)) {
    updates.daily_target_positions = body.dailyTargetPositions;
  }
  if (typeof body.mistakeCaptureThresholdLevel === "string" && VALID_THRESHOLD_LEVELS.includes(body.mistakeCaptureThresholdLevel)) {
    updates.mistake_capture_threshold_level = body.mistakeCaptureThresholdLevel;
  }
  if (typeof body.mistakeCaptureThresholdCp === "number" && VALID_CP.includes(body.mistakeCaptureThresholdCp)) {
    updates.mistake_capture_threshold_cp = body.mistakeCaptureThresholdCp;
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
