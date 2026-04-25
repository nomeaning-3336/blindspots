import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database";
import {
  ensureTrainingQueuesHavePositions,
  normalizeQueue,
  selectNextTrainingPosition,
} from "@/lib/training/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SEQUENCE_LENGTH = 4;
const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;

export async function GET() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const [{ data: profile, error: profileError }, { data: preferences }] = await Promise.all([
    supabase
      .from("user_blindspot_profile")
      .select("user_id, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_training_preferences")
      .select("sequence_length")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profileError && !isMissingQueueColumnError(profileError.message)) {
    throw new Error(`Failed to load training queues: ${profileError.message}`);
  }

  const queues = await ensureTrainingQueuesHavePositions({
    exploitQueue: normalizeQueue(profileError ? null : profile?.exploit_queue),
    exploreQueue: normalizeQueue(profileError ? null : profile?.explore_queue),
    revisitQueue: normalizeQueue(profileError ? null : profile?.revisit_queue),
    masteredQueue: normalizeQueue(profileError ? null : profile?.mastered_queue),
  });

  await persistQueues(userId, queues, Boolean(profile && !profileError));

  const nextPosition = await selectNextTrainingPosition(queues, {
    completedSequenceCount: profileError ? 0 : profile?.total_sequences,
  });

  if (!nextPosition) {
    return NextResponse.json({ error: "No training positions available." }, { status: 404 });
  }

  return NextResponse.json({
    fen: nextPosition.fen,
    source: nextPosition.source,
    sequenceLength: normalizeSequenceLength(preferences?.sequence_length),
  });
}

async function persistQueues(
  userId: string,
  queues: Awaited<ReturnType<typeof ensureTrainingQueuesHavePositions>>,
  hasProfile: boolean,
) {
  const supabase = getSupabaseAdminClient();
  const values = {
    exploit_queue: queues.exploitQueue as unknown as Json,
    explore_queue: queues.exploreQueue as unknown as Json,
    revisit_queue: queues.revisitQueue as unknown as Json,
    mastered_queue: queues.masteredQueue as unknown as Json,
  };

  if (hasProfile) {
    const { error } = await supabase
      .from("user_blindspot_profile")
      .update(values)
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Failed to persist training queue: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase.from("user_blindspot_profile").upsert(
    {
      user_id: userId,
      initialization_status: "skipped",
      profile_initialized: false,
      ...values,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`Failed to persist training queue: ${error.message}`);
  }
}

function normalizeSequenceLength(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SEQUENCE_LENGTH;
  return Math.max(MIN_SEQUENCE_LENGTH, Math.min(MAX_SEQUENCE_LENGTH, Math.round(parsed)));
}

function isMissingQueueColumnError(message: string) {
  return (
    message.includes("user_blindspot_profile.exploit_queue") ||
    message.includes("user_blindspot_profile.explore_queue") ||
    message.includes("user_blindspot_profile.revisit_queue") ||
    message.includes("user_blindspot_profile.mastered_queue")
  );
}
