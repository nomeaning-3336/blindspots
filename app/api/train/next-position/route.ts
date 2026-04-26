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
import {
  chooseServeMode,
  normalizeRecentServedModes,
  prependRecentServeMode,
  type ServeMode,
} from "@/lib/training/serving-policy";
import { validateTrainingQueueItem } from "@/lib/training/position-validity";

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
const MAX_VALID_SELECTION_ATTEMPTS = 25;

export async function GET() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const [{ data: profile, error: profileError }, { data: preferences }] = await Promise.all([
    supabase
      .from("user_blindspot_profile")
      .select("user_id, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue, recent_served_fens, recent_served_modes")
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
  const recentServedModes = normalizeRecentServedModes(profileError ? null : profile?.recent_served_modes);
  const completedSequenceCount = profileError ? 0 : profile?.total_sequences;
  const queuesBeforeRefill = {
    exploitQueue: normalizeQueue(profileError ? null : profile?.exploit_queue),
    exploreQueue: normalizeQueue(profileError ? null : profile?.explore_queue),
    revisitQueue: normalizeQueue(profileError ? null : profile?.revisit_queue),
    masteredQueue: normalizeQueue(profileError ? null : profile?.mastered_queue),
  };
  const queueCountsBefore = getQueueCounts(queuesBeforeRefill);
  const sequenceLength = normalizeSequenceLength(preferences?.sequence_length);

  const queues = await ensureTrainingQueuesHavePositions({
    ...queuesBeforeRefill,
    recentServedFens,
  });

  const completedSeq = typeof completedSequenceCount === "number" ? completedSequenceCount
    : typeof completedSequenceCount === "string" ? Number(completedSequenceCount) : 0;

  const serveMode = chooseServeMode({
    completedSequenceCount: completedSeq,
    dueRevisitCount: queues.revisitQueue.filter((item) => Date.parse(item.scheduledAt) <= new Date().getTime()).length,
    recentModes: recentServedModes,
  });

  const selection = await selectValidTrainingPosition({
    queues,
    completedSequenceCount: completedSeq,
    recentServedFens,
    sequenceLength,
    serveMode,
  });
  const nextPosition = selection.item;

  if (!nextPosition) {
    await persistQueues(
      userId,
      selection.queues,
      Boolean(profile && !profileError),
      recentServedFens,
      recentServedModes,
    );

    const response: NextPositionResponse = {
      error: "No playable training positions available.",
    };
    if (process.env.NODE_ENV !== "production") {
      response.debug = {
        queueCountsBefore,
        queueCountsAfter: getQueueCounts(selection.queues),
        rejectedInvalidCount: selection.rejectedInvalidCount,
        rejectedInvalidReasons: selection.rejectedInvalidReasons,
      };
    }
    return NextResponse.json(response, { status: 404 });
  }

  const nextRecentServedFens = prependRecentServedEntry(recentServedFens, {
    fen: nextPosition.fen,
    gameId: nextPosition.gameId,
    ply: nextPosition.ply,
  });
  const nextRecentServedModes = prependRecentServeMode(recentServedModes, serveMode);
  const queueCountsAfter = getQueueCounts(selection.queues);

  await persistQueues(userId, selection.queues, Boolean(profile && !profileError), nextRecentServedFens, nextRecentServedModes);

  const response: NextPositionResponse = {
    fen: nextPosition.fen,
    previousFen: nextPosition.previousFen ?? undefined,
    playedMove: nextPosition.playedMove ?? undefined,
    source: nextPosition.source,
    sequenceLength,
  };

  if (process.env.NODE_ENV !== "production") {
    response.debug = {
      selectedQueue: selection.selectedQueue,
      queueCountsBefore,
      queueCountsAfter,
      selectedFen: nextPosition.fen,
      wasDueRevisit: selection.wasDueRevisit,
      completedSequenceCount,
      rejectedRecentExactCount: selection.rejectedRecentExactCount,
      rejectedNearDuplicateCount: selection.rejectedNearDuplicateCount,
      nearDuplicateReason: selection.nearDuplicateReason,
      rejectedInvalidCount: selection.rejectedInvalidCount,
      rejectedInvalidReasons: selection.rejectedInvalidReasons,
      selectedFenValidity: selection.selectedFenValidity,
      requestedServeMode: serveMode,
      selectedServeMode: serveMode,
      selectedPhase: nextPosition.phase ?? selection.selectedPhase,
      selectedBucket: nextPosition.bucket ?? selection.selectedBucket,
      phaseFallbackUsed: selection.phaseFallbackUsed,
    };
  }

  return NextResponse.json(response);
}

async function selectValidTrainingPosition({
  queues,
  completedSequenceCount,
  recentServedFens,
  sequenceLength,
  serveMode,
}: {
  queues: Awaited<ReturnType<typeof ensureTrainingQueuesHavePositions>>;
  completedSequenceCount: unknown;
  recentServedFens: Array<{ fen: string; gameId?: string; ply?: number }>;
  sequenceLength: number;
  serveMode: ServeMode;
}) {
  let currentQueues = queues;
  const invalidRecentEntries: Array<{ fen: string; gameId?: string; ply?: number }> = [];
  const rejectedInvalidReasons: string[] = [];
  let rejectedRecentExactCount = 0;
  let rejectedNearDuplicateCount = 0;
  let nearDuplicateReason: string | null = null;
  let selectedQueue = "fallback";
  let wasDueRevisit = false;
  let selectedFenValidity: ReturnType<typeof validateTrainingQueueItem> | null = null;
  let refilledAfterEmpty = false;
  let selectedPhase: string | undefined = undefined;
  let selectedBucket: string | undefined = undefined;
  let phaseFallbackUsed = false;

  for (let attempt = 0; attempt < MAX_VALID_SELECTION_ATTEMPTS; attempt += 1) {
    const reservation = await selectAndReserveNextTrainingPosition(currentQueues, {
      completedSequenceCount,
      recentServedFens: [...recentServedFens, ...invalidRecentEntries],
      serveMode,
    });

    rejectedRecentExactCount += reservation.rejectedRecentExactCount;
    rejectedNearDuplicateCount += reservation.rejectedNearDuplicateCount;
    nearDuplicateReason ??= reservation.nearDuplicateReason;
    selectedQueue = reservation.selectedQueue;
    wasDueRevisit = reservation.wasDueRevisit;
    currentQueues = reservation.queues;

    if (!reservation.item) {
      if (refilledAfterEmpty) break;
      refilledAfterEmpty = true;
      currentQueues = await ensureTrainingQueuesHavePositions({
        ...currentQueues,
        excludeFens: invalidRecentEntries.map((entry) => entry.fen),
        recentServedFens: [...recentServedFens, ...invalidRecentEntries],
      });
      continue;
    }

    const validity = validateTrainingQueueItem(reservation.item, { sequenceLength });
    if (validity.ok) {
      selectedFenValidity = validity;
      return {
        item: reservation.item,
        selectedQueue,
        wasDueRevisit,
        queues: currentQueues,
        rejectedRecentExactCount,
        rejectedNearDuplicateCount,
        nearDuplicateReason,
        rejectedInvalidCount: rejectedInvalidReasons.length,
        rejectedInvalidReasons,
        selectedFenValidity,
        selectedPhase,
        selectedBucket,
        phaseFallbackUsed,
      };
    }

    rejectedInvalidReasons.push(validity.reason ?? "invalid_position");
    invalidRecentEntries.push({
      fen: reservation.item.fen,
      gameId: reservation.item.gameId,
      ply: reservation.item.ply,
    });
  }

  return {
    item: null as Awaited<ReturnType<typeof ensureTrainingQueuesHavePositions>>["exploitQueue"][number] | null,
    selectedQueue,
    wasDueRevisit,
    queues: currentQueues,
    rejectedRecentExactCount,
    rejectedNearDuplicateCount,
    nearDuplicateReason,
    rejectedInvalidCount: rejectedInvalidReasons.length,
    rejectedInvalidReasons,
    selectedFenValidity,
    selectedPhase,
    selectedBucket,
    phaseFallbackUsed,
  };
}

async function persistQueues(
  userId: string,
  queues: Awaited<ReturnType<typeof ensureTrainingQueuesHavePositions>>,
  hasProfile: boolean,
  recentServedFens: Array<{ fen: string; gameId?: string; ply?: number }>,
  recentServedModes?: ReturnType<typeof prependRecentServeMode>,
) {
  const supabase = getSupabaseAdminClient();
  const baseValues = {
    exploit_queue: queues.exploitQueue as unknown as Json,
    explore_queue: queues.exploreQueue as unknown as Json,
    revisit_queue: queues.revisitQueue as unknown as Json,
    mastered_queue: queues.masteredQueue as unknown as Json,
    recent_served_fens: recentServedFens as unknown as Json,
  };

  const values = recentServedModes
    ? { ...baseValues, recent_served_modes: recentServedModes as unknown as Json }
    : baseValues;

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