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
import { selectAndReserveNextTrainingPositionCore } from "@/lib/training/queue-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NextPositionResponse = {
  fen?: string;
  previousFen?: string;
  playedMove?: string;
  sequenceLength?: number;
  source?: string;
  selectedServeMode?: string;
  selectedPhase?: string;
  selectedBucket?: string;
  tags?: string[];
  isTactic?: boolean;
  tacticRating?: number;
  openingName?: string;
  eco?: string;
  error?: string;
  debug?: Record<string, unknown>;
};
const DEFAULT_SEQUENCE_LENGTH = 4;
const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;
const MAX_VALID_SELECTION_ATTEMPTS = 25;

// Columns that must exist for the route to function
const BASE_COLUMNS = "user_id,total_sequences,exploit_queue,explore_queue,revisit_queue,mastered_queue,recent_served_fens";
// Columns that may not exist before migration is applied
const OPTIONAL_COLUMNS = "recent_served_modes,bucket_stats";

export async function GET() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();

  // Fetch base columns (always exist post-20260425121000 migration)
  const { data: profile, error: baseError } = await supabase
    .from("user_blindspot_profile")
    .select(BASE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (baseError) {
    throw new Error(`Failed to load training profile: ${baseError.message}`);
  }

  // Fetch optional columns only if the table has them
  let recentServedModes: ReturnType<typeof normalizeRecentServedModes> = [];
  let bucketStats: Record<string, unknown> | null = null;

  const { data: optionalData, error: optionalError } = await supabase
    .from("user_blindspot_profile")
    .select(OPTIONAL_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

if (!optionalError && optionalData) {
    recentServedModes = normalizeRecentServedModes(optionalData?.recent_served_modes);
    bucketStats = optionalData as Record<string, unknown> | null;
  }

  const optionalRecentServedModesRawCount = Array.isArray((optionalData as Record<string, unknown>)?.recent_served_modes)
    ? ((optionalData as Record<string, unknown>).recent_served_modes as unknown[]).length
    : null;

  const { data: preferences } = await supabase
    .from("user_training_preferences")
    .select("sequence_length")
    .eq("user_id", userId)
    .maybeSingle();

  const recentServedFens = normalizeRecentServedEntries(profile?.recent_served_fens ?? null);
  const completedSequenceCount = profile?.total_sequences ?? 0;
  const queuesBeforeRefill = {
    exploitQueue: normalizeQueue(profile?.exploit_queue ?? null),
    exploreQueue: normalizeQueue(profile?.explore_queue ?? null),
    revisitQueue: normalizeQueue(profile?.revisit_queue ?? null),
    masteredQueue: normalizeQueue(profile?.mastered_queue ?? null),
  };
  const queueCountsBefore = getQueueCounts(queuesBeforeRefill);
  const sequenceLength = normalizeSequenceLength(preferences?.sequence_length);

  const queues = await ensureTrainingQueuesHavePositions({
    ...queuesBeforeRefill,
    recentServedFens,
  });

  const requestedServeMode = chooseServeMode({
    completedSequenceCount,
    dueRevisitCount: queues.revisitQueue.filter((item) => Date.parse(item.scheduledAt) <= new Date().getTime()).length,
    recentModes: recentServedModes,
  });

  const selection = await selectValidTrainingPosition({
    queues,
    completedSequenceCount,
    recentServedFens,
    sequenceLength,
    requestedServeMode,
  });
  const nextPosition = selection.item;

  if (!nextPosition) {
    await persistQueues(
      userId,
      selection.queues,
      Boolean(profile),
      recentServedFens,
      /* no position served — skip prepending to recentServedModes */
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
  const nextRecentServedModes = prependRecentServeMode(recentServedModes, selection.selectedServeMode);
  const queueCountsAfter = getQueueCounts(selection.queues);

  await persistQueues(userId, selection.queues, Boolean(profile), nextRecentServedFens, nextRecentServedModes, bucketStats);

  const enriched = enrichTrainingQueueItem(nextPosition);

  const response: NextPositionResponse = {
    fen: nextPosition.fen,
    previousFen: nextPosition.previousFen ?? undefined,
    playedMove: nextPosition.playedMove ?? undefined,
    source: nextPosition.source,
    sequenceLength,
    selectedServeMode: selection.selectedServeMode,
    selectedPhase: enriched.phase ?? selection.selectedPhase,
    selectedBucket: enriched.bucket ?? selection.selectedBucket,
    tags: nextPosition.tags,
    isTactic: nextPosition.isTactic,
    tacticRating: nextPosition.tacticRating,
    openingName: nextPosition.openingName,
    eco: nextPosition.eco,
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
      requestedServeMode,
      selectedServeMode: selection.selectedServeMode,
      selectedPhase: enriched.phase ?? selection.selectedPhase,
      selectedBucket: enriched.bucket ?? selection.selectedBucket,
      phaseFallbackUsed: selection.phaseFallbackUsed,
      // Safe recommender diagnostics for QA
      recentServedModesCount: recentServedModes.length,
      recentServedModesPreview: recentServedModes.slice(0, 10).map((e) => e.mode),
      dueRevisitCount: queues.revisitQueue.filter(
        (item) => Date.parse(item.scheduledAt) <= new Date().getTime(),
      ).length,
      // QA debug: prove recentServedModes grew per call
      profileUserId: userId,
      recentServedModesSource: optionalError ? "optional-query-error" : "optional-query",
      optionalRecentServedModesRawCount: optionalRecentServedModesRawCount,
      recentServedModesBeforeCount: recentServedModes.length,
      recentServedModesBeforePreview: recentServedModes.slice(0, 5).map((e) => e.mode),
      nextRecentServedModesCount: nextRecentServedModes.length,
      nextRecentServedModesPreview: nextRecentServedModes.slice(0, 5).map((e) => e.mode),
    };
  }

  return NextResponse.json(response);
}

type RecentEntry = { fen: string; gameId?: string; ply?: number };

function deriveServeModeFromCandidate(input: {
  requestedServeMode: ServeMode;
  phase?: string;
  bucket?: string;
  isTactic?: boolean;
  selectedQueue?: string | null;
}): ServeMode {
  if (input.selectedQueue === "revisit") return "revisit";
  if (input.isTactic === true) return "tactic";
  if (input.bucket === "tactic") return "tactic";
  if (input.phase === "tactic") return "tactic";
  if (input.bucket?.startsWith("opening")) return "opening";
  if (input.phase === "opening") return "opening";
  if (input.bucket?.startsWith("endgame")) return "endgame";
  if (input.phase === "endgame") return "endgame";
  if (input.bucket?.startsWith("middlegame")) return "middlegame";
  if (input.phase === "middlegame") return "middlegame";
  if (input.requestedServeMode === "wildcard") return "wildcard";
  if (input.requestedServeMode === "exploit") return "exploit";
  if (input.requestedServeMode === "explore") return "explore";
  return input.requestedServeMode;
}

async function selectValidTrainingPosition({
  queues,
  completedSequenceCount,
  recentServedFens,
  sequenceLength,
  requestedServeMode,
}: {
  queues: Awaited<ReturnType<typeof ensureTrainingQueuesHavePositions>>;
  completedSequenceCount: number;
  recentServedFens: RecentEntry[];
  sequenceLength: number;
  requestedServeMode: ServeMode;
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
    selectedPhase = enriched.phase;
    selectedBucket = enriched.bucket;
    selectedServeMode = deriveServeModeFromCandidate({
      requestedServeMode,
      phase: selectedPhase,
      bucket: selectedBucket,
      isTactic: dueRevisit.isTactic,
      selectedQueue: "revisit",
    });
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
      selectedServeMode,
      selectedPhase,
      selectedBucket,
      phaseFallbackUsed: requestedServeMode !== "revisit",
    };
  }

  // Step 2: For opening/tactic/endgame/middlegame/wildcard modes, try seed candidates first
  if (requestedServeMode === "opening" || requestedServeMode === "tactic" || requestedServeMode === "endgame" || requestedServeMode === "middlegame" || requestedServeMode === "wildcard") {
    const seedCandidates = await getModeSeedCandidates(requestedServeMode, recentFenSet, now, 30);

    const seedSelection = await selectAndReserveNextTrainingPositionCore(
      {
        exploitQueue: seedCandidates,
        exploreQueue: [],
        revisitQueue: [],
        masteredQueue: [],
      },
      {
        completedSequenceCount,
        recentServedFens: [...recentServedFens, ...invalidRecentEntries],
      },
    );

    // Merge diagnostics before checking success so failures still count
    rejectedRecentExactCount += seedSelection.rejectedRecentExactCount;
    rejectedNearDuplicateCount += seedSelection.rejectedNearDuplicateCount;
    if (seedSelection.nearDuplicateReason) {
      nearDuplicateReason = seedSelection.nearDuplicateReason;
    }

    if (seedSelection.item) {
      const enriched = enrichTrainingQueueItem(seedSelection.item);
      selectedFenValidity = validateTrainingQueueItem(seedSelection.item, { sequenceLength });
      if (selectedFenValidity.ok) {
        selectedPhase = enriched.phase ?? classifyPhaseFromFen(seedSelection.item.fen);
        selectedBucket = enriched.bucket;
        selectedServeMode = deriveServeModeFromCandidate({
          requestedServeMode,
          phase: selectedPhase,
          bucket: selectedBucket,
          isTactic: seedSelection.item.isTactic,
          selectedQueue: "seed",
        });
        return {
          item: seedSelection.item,
          selectedQueue: "seed" as TrainingQueueName,
          wasDueRevisit: false,
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
          phaseFallbackUsed: false,
        };
      }
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
    if (reservation.nearDuplicateReason) {
      nearDuplicateReason = reservation.nearDuplicateReason;
    }
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
      selectedServeMode = deriveServeModeFromCandidate({
        requestedServeMode,
        phase: selectedPhase,
        bucket: selectedBucket,
        isTactic: reservation.item.isTactic,
        selectedQueue,
      });
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
    selectedServeMode: requestedServeMode,
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
  recentServedModes: ReturnType<typeof prependRecentServeMode> | undefined,
  _bucketStats?: Record<string, unknown> | null,
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

    if (error && !isIgnoredPersistError(error.message)) {
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

  if (error && !isIgnoredPersistError(error.message)) {
    throw new Error(`Failed to persist training queue: ${error.message}`);
  }
}

function normalizeSequenceLength(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SEQUENCE_LENGTH;
  return Math.max(MIN_SEQUENCE_LENGTH, Math.min(MAX_SEQUENCE_LENGTH, Math.round(parsed)));
}

function isIgnoredPersistError(message: string) {
  // Ignore column-not-found errors for optional columns when persisting
  // (means migration hasn't been applied yet, so just skip those fields)
  return (
    message.includes("recent_served_modes") ||
    message.includes("bucket_stats")
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