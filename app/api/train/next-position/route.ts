import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database";
import {
  ensureTrainingQueuesHavePositions,
  getQueueCounts,
  normalizeQueue,
  normalizeRecentServedEntries,
  prependRecentServedEntry,
  selectAndReserveNextTrainingPosition,
} from "@/lib/training/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NextPositionResponse = {
  fen?: string;
  previousFen?: string;
  playedMove?: string;
  sequenceLength?: number;
  source?: string;
  error?: string;
  debug?: Record<string, unknown>;
};
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
      .select("user_id, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue, recent_served_fens")
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

  const recentServedFens = normalizeRecentServedEntries(profileError ? null : profile?.recent_served_fens);
  const completedSequenceCount = profileError ? 0 : profile?.total_sequences;
  const queuesBeforeRefill = {
    exploitQueue: normalizeQueue(profileError ? null : profile?.exploit_queue),
    exploreQueue: normalizeQueue(profileError ? null : profile?.explore_queue),
    revisitQueue: normalizeQueue(profileError ? null : profile?.revisit_queue),
    masteredQueue: normalizeQueue(profileError ? null : profile?.mastered_queue),
  };
  const queueCountsBefore = getQueueCounts(queuesBeforeRefill);

  const queues = await ensureTrainingQueuesHavePositions({
    ...queuesBeforeRefill,
    recentServedFens,
  });

  const reservation = await selectAndReserveNextTrainingPosition(queues, {
    completedSequenceCount,
    recentServedFens,
  });
  const nextPosition = reservation.item;

  if (!nextPosition) {
    return NextResponse.json({ error: "No training positions available." }, { status: 404 });
  }

  const nextRecentServedFens = prependRecentServedEntry(recentServedFens, {
    fen: nextPosition.fen,
    gameId: nextPosition.gameId,
    ply: nextPosition.ply,
  });
  const queueCountsAfter = getQueueCounts(reservation.queues);

  await persistQueues(userId, reservation.queues, Boolean(profile && !profileError), nextRecentServedFens);

  const response: NextPositionResponse = {
    fen: nextPosition.fen,
    previousFen: nextPosition.previousFen ?? undefined,
    playedMove: nextPosition.playedMove ?? undefined,
    source: nextPosition.source,
    sequenceLength: normalizeSequenceLength(preferences?.sequence_length),
  };

  if (process.env.NODE_ENV !== "production") {
    response.debug = {
      selectedQueue: reservation.selectedQueue,
      queueCountsBefore,
      queueCountsAfter,
      selectedFen: nextPosition.fen,
      wasDueRevisit: reservation.wasDueRevisit,
      completedSequenceCount,
      rejectedRecentExactCount: reservation.rejectedRecentExactCount,
      rejectedNearDuplicateCount: reservation.rejectedNearDuplicateCount,
      nearDuplicateReason: reservation.nearDuplicateReason,
    };
  }

  return NextResponse.json(response);
}

async function persistQueues(
  userId: string,
  queues: Awaited<ReturnType<typeof ensureTrainingQueuesHavePositions>>,
  hasProfile: boolean,
  recentServedFens: Array<{ fen: string; gameId?: string; ply?: number }>,
) {
  const supabase = getSupabaseAdminClient();
  const values = {
    exploit_queue: queues.exploitQueue as unknown as Json,
    explore_queue: queues.exploreQueue as unknown as Json,
    revisit_queue: queues.revisitQueue as unknown as Json,
    mastered_queue: queues.masteredQueue as unknown as Json,
    recent_served_fens: recentServedFens as unknown as Json,
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
