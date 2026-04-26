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
import { getModeSeedCandidates } from "@/lib/training/serve-mode-sampler";
import { classifyTrainingPhase, enrichTrainingQueueItem } from "@/lib/training/position-metadata";

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

  const recentServedFens = normalizeRecentRecentEntries(profileError ? null : profile?.recent_served_fens);
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

  const enriched = enrichTrainingQueueItem(nextPosition);

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
      selectedServeMode: selection.selectedServeMode ?? serveMode,
      selectedPhase: enriched.phase ?? selection.selectedPhase,
      selectedBucket: enriched.bucket ?? selection.selectedBucket,
      phaseFallbackUsed: selection.phaseFallbackUsed,
    };
  }

  return NextResponse.json(response);
}

type RecentEntry = { fen: string; gameId?: string; ply?: number };

function normalizeRecentRecentEntries(value: unknown): RecentEntry[] {
  return normalizeRecentServedEntries(value);
}

async function selectValidTrainingPosition({
  queues,
  completedSequenceCount,
  recentServedFens,
  sequenceLength,
  serveMode,
}: {
  queues: Awaited<ReturnType<typeof ensureTrainingQueuesHavePositions>>;
  completedSequenceCount: number;
  recentServedFens: RecentEntry[];
  sequenceLength: number;
  serveMode: ServeMode;
}) {
  let currentQueues = queues;
  const invalidRecentEntries: RecentEntry[] = [];
  const rejectedInvalidReasons: string[] = [];
  let rejectedRecentExactCount = 0;
  let rejectedNearDuplicateCount = 0;
  let nearDuplicateReason: string | null = null;
  let selectedQueue = "fallback";
  let wasDueRevisit = false;
  let selectedFenValidity: ReturnType<typeof validateTrainingQueueItem> | null = null;
  let selectedPhase: string | undefined = undefined;
  let selectedBucket: string | undefined = undefined;
  let phaseFallbackUsed = false;
  let selectedServeMode: ServeMode | undefined = undefined;
  const now = new Date();
  const recentFenSet = new Set([...recentServedFens, ...invalidRecentEntries].map((e) => e.fen));

  // Step 1: If revisit is due, always prefer it
  const dueRevisit = currentQueues.revisitQueue.find((item) => Date.parse(item.scheduledAt) <= now.getTime());
  if (dueRevisit) {
    const enriched = enrichTrainingQueueItem(dueRevisit);
    return {
      item: dueRevisit,
      selectedQueue: "revisit" as const,
      wasDueRevisit: true,
      queues: removeFenFromAllQueues(currentQueues, dueRevisit.fen),
      rejectedRecentExactCount: 0,
      rejectedNearDuplicateCount: 0,
      nearDuplicateReason: null,
      rejectedInvalidCount: 0,
      rejectedInvalidReasons: [] as string[],
      selectedFenValidity: null,
      selectedServeMode: "revisit" as ServeMode,
      selectedPhase: enriched.phase,
      selectedBucket: enriched.bucket,
      phaseFallbackUsed: false,
    };
  }

  // Step 2: For opening/tactic/endgame/middlegame/wildcard modes, try seed candidates first
  if (serveMode === "opening" || serveMode === "tactic" || serveMode === "endgame" || serveMode === "middlegame" || serveMode === "wildcard") {
    const seedCandidates = await getModeSeedCandidates(serveMode, recentFenSet, now, 30);
    for (const candidate of seedCandidates) {
      const enriched = enrichTrainingQueueItem(candidate);

      // Check validity
      const validity = validateTrainingQueueItem(candidate, { sequenceLength });
      if (!validity.ok) continue;

      // Check recent exact
      if (recentFenSet.has(candidate.fen)) {
        rejectedRecentExactCount += 1;
        continue;
      }

      // Return this seed candidate
      selectedPhase = enriched.phase ?? classifyPhaseFromFen(candidate.fen);
      selectedBucket = enriched.bucket;
      selectedServeMode = serveMode;
      selectedFenValidity = validity;
      return {
        item: candidate,
        selectedQueue: "seed" as TrainingQueueName,
        wasDueRevisit: false,
        queues: currentQueues, // seed candidates not in queues, no removal needed
        rejectedRecentExactCount,
        rejectedNearDuplicateCount,
        nearDuplicateReason,
        rejectedInvalidCount: rejectedInvalidReasons.length,
        rejectedInvalidReasons,
        selectedFenValidity,
        selectedServeMode: serveMode,
        selectedPhase,
        selectedBucket,
        phaseFallbackUsed: false,
      };
    }

    // No valid seed candidate found — fall back to queue selection
    phaseFallbackUsed = true;
  }

  // Step 3: Fallback to queue-based selection
  for (let attempt = 0; attempt < MAX_VALID_SELECTION_ATTEMPTS; attempt += 1) {
    const reservation = await selectAndReserveNextTrainingPosition(currentQueues, {
      completedSequenceCount,
      recentServedFens: [...recentServedFens, ...invalidRecentEntries],
    });

    rejectedRecentExactCount += reservation.rejectedRecentExactCount;
    rejectedNearDuplicateCount += reservation.rejectedNearDuplicateCount;
    nearDuplicateReason ??= reservation.nearDuplicateReason;
    selectedQueue = reservation.selectedQueue;
    wasDueRevisit = reservation.wasDueRevisit;
    currentQueues = reservation.queues;

    if (!reservation.item) {
      // Refill and retry once
      currentQueues = await ensureTrainingQueuesHavePositions({
        ...currentQueues,
        excludeFens: invalidRecentEntries.map((entry) => entry.fen),
        recentServedFens: [...recentServedFens, ...invalidRecentEntries],
      });
      continue;
    }

    const validity = validateTrainingQueueItem(reservation.item, { sequenceLength });
    if (validity.ok) {
      const enriched = enrichTrainingQueueItem(reservation.item);
      selectedFenValidity = validity;
      selectedPhase = enriched.phase;
      selectedBucket = enriched.bucket;
      selectedServeMode ??= serveMode;
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
        selectedServeMode,
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
    recentFenSet.add(reservation.item.fen);
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
    selectedServeMode: serveMode,
    selectedPhase,
    selectedBucket,
    phaseFallbackUsed,
  };
}

type TrainingQueueName = "revisit" | "exploit" | "explore" | "mastered" | "fallback" | "seed";

async function persistQueues(
  userId: string,
  queues: Awaited<ReturnType<typeof ensureTrainingQueuesHavePositions>>,
  hasProfile: boolean,
  recentServedFens: RecentEntry[],
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

function removeFenFromAllQueues(
  queues: Awaited<ReturnType<typeof ensureTrainingQueuesHavePositions>>,
  fen: string,
) {
  const MAX = 20;
  return {
    exploitQueue: queues.exploitQueue.filter((item) => item.fen !== fen).slice(0, MAX),
    exploreQueue: queues.exploreQueue.filter((item) => item.fen !== fen).slice(0, MAX),
    revisitQueue: queues.revisitQueue.filter((item) => item.fen !== fen).slice(0, MAX),
    masteredQueue: queues.masteredQueue.filter((item) => item.fen !== fen).slice(0, MAX),
  };
}

function classifyPhaseFromFen(fen: string): string {
  try {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 6) return "unknown";
    const fullmove = parseInt(parts[5], 10);
    if (fullmove <= 10) return "opening";
    return "middlegame";
  } catch {
    return "unknown";
  }
}
