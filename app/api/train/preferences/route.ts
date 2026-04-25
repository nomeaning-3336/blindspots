import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SEQUENCE_LENGTH = 4;
const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;

type TrainingPreferencesPayload = {
  sequenceLength?: unknown;
};

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
