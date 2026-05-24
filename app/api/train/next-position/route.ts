import { NextResponse } from "next/server";
import { Chess } from "chess.js";
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
  randomExplorationProbability,
  type ServeMode,
} from "@/lib/training/serving-policy";
import { validatePlayableTrainingFen } from "@/lib/training/position-validity";
import { getModeSeedCandidates } from "@/lib/training/serve-mode-sampler";
import { enrichTrainingQueueItem } from "@/lib/training/position-metadata";
import { selectAndReserveNextTrainingPositionCore, type TrainingBucket } from "@/lib/training/queue-core";
import { normalizeBucketStats, thompsonSample, type BucketStats } from "@/lib/training/bandit-stats";
import { getOpponentElo } from "@/lib/training/elo";
import { getNextActiveOrFillerMistakeForTraining, getNextReviewMistakeForTraining, getNextActiveAppMistake, normalizeUserMistakeForTraining, type NextMistakeResult } from "@/lib/training/mistake-store";
import {
  DEFAULT_BLINDSPOTS_ELO,
  buildDefaultBlindspotProfile,
} from "@/lib/training/default-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NextPositionResponse = {
  fen?: string;
  decisionFen?: string;
  source?: string;
  selectedServeMode?: string;
  selectedPhase?: string;
  selectedBucket?: string;
  tags?: string[];
  isTactic?: boolean;
  tacticRating?: number;
  openingName?: string;
  eco?: string;
  challengeElo?: number;
  mistakeId?: string;
  queueSource?: string;
  reviewCount?: number;
  randomExplorationProbability?: number;
  randomExplorationRoll?: number;
  selectedByRandomExploration?: boolean;
  error?: string;
  debug?: Record<string, unknown>;
};
const MAX_VALID_SELECTION_ATTEMPTS = 25;

const BASE_COLUMNS = "user_id,total_sequences,blindspots_elo,exploit_queue,explore_queue,revisit_queue,mastered_queue,recent_served_fens";
const OPTIONAL_COLUMNS = "recent_served_modes,bucket_stats";

export async function GET(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();

  // Retry path — return the position without prelude/history fields
  const requestUrl = new URL(request.url);
  const retryMistakeId = requestUrl.searchParams.get("positionId") ?? requestUrl.searchParams.get("mistakeId");
  if (retryMistakeId) {
    const { data: retryRow } = await supabase
      .from("user_mistakes")
      .select("*")
      .eq("id", retryMistakeId)
      .eq("user_id", userId)
      .maybeSingle();

    if (retryRow) {
      const normalized = normalizeUserMistakeForTraining(retryRow as any);
      const fenValid = isValidFen(normalized.fen);
      if (fenValid) {
        const tags = normalizeThemeTags(retryRow.theme_tags);
        const challengeElo = getOpponentElo(DEFAULT_BLINDSPOTS_ELO);
        const retryResponse: NextPositionResponse = {
          mistakeId: normalized.id,
          fen: normalized.fen,
          decisionFen: normalized.decisionFen ?? undefined,
          source: normalized.source,
          queueSource: "retry",
          selectedServeMode: "retry",
          tags,
          openingName: (retryRow.opening_name as string) ?? undefined,
          eco: (retryRow.eco as string) ?? undefined,
          challengeElo,
        };
        return NextResponse.json(retryResponse);
      }
    }
  }

  // Load profile
  const { data: profile, error: baseError } = await supabase
    .from("user_blindspot_profile")
    .select(BASE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (baseError) {
    throw new Error(`Failed to load training profile: ${baseError.message}`);
  }

  let recentServedModes: ReturnType<typeof normalizeRecentServedModes> = [];
  let bucketStats: BucketStats = normalizeBucketStats(null);

  const { data: optionalData, error: optionalError } = await supabase
    .from("user_blindspot_profile")
    .select(OPTIONAL_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (!optionalError && optionalData) {
    recentServedModes = normalizeRecentServedModes(optionalData?.recent_served_modes);
    bucketStats = normalizeBucketStats((optionalData as Record<string, unknown>)?.bucket_stats);
  }

  const recentServedFens = normalizeRecentServedEntries(profile?.recent_served_fens ?? null);
  const completedSequenceCount = profile?.total_sequences ?? 0;
  const queuesBeforeRefill = {
    exploitQueue: normalizeQueue(profile?.exploit_queue ?? null),
    exploreQueue: normalizeQueue(profile?.explore_queue ?? null),
    revisitQueue: normalizeQueue(profile?.revisit_queue ?? null),
    masteredQueue: normalizeQueue(profile?.mastered_queue ?? null),
  };
  const queueCountsBefore = getQueueCounts(queuesBeforeRefill);
  const userElo = typeof profile?.blindspots_elo === "number"
    ? profile.blindspots_elo
    : Number(profile?.blindspots_elo ?? DEFAULT_BLINDSPOTS_ELO);
  const challengeElo = getOpponentElo(userElo);
  const randomExplorationRoll = Math.random();
  const randomProbability = randomExplorationProbability(completedSequenceCount);
  const selectedByRandomExploration = randomExplorationRoll < randomProbability;

  // Row-based review mistakes — read-only, no reserve
  const mistakeResult = await getNextReviewMistakeForTraining(userId, new Date(), { reserve: false });
  if (mistakeResult.mistake) {
    const normalized = normalizeUserMistakeForTraining(mistakeResult.mistake);
    const mistake = mistakeResult.mistake;

    const fenValid = isValidFen(normalized.fen);
    if (fenValid) {
      const tags = normalizeThemeTags(mistake.theme_tags);
      const response: NextPositionResponse = {
        mistakeId: normalized.id,
        fen: normalized.fen,
        decisionFen: normalized.decisionFen ?? undefined,
        source: normalized.source,
        queueSource: mistakeResult.queueSource ?? undefined,
        reviewCount: mistake.review_count ?? 0,
        selectedServeMode: mistakeResult.queueSource ?? undefined,
        randomExplorationProbability: randomProbability,
        randomExplorationRoll,
        selectedByRandomExploration: false,
        tags,
        openingName: mistake.opening_name ?? undefined,
        eco: mistake.eco ?? undefined,
        challengeElo,
      };

      if (process.env.NODE_ENV !== "production") {
        response.debug = {
          queueSource: mistakeResult.queueSource,
          mistakeId: normalized.id,
          sourceType: mistake.source_type,
          reviewCount: mistake.review_count,
          intervalDays: mistake.interval_days,
          nextReviewAt: mistake.next_review_at ?? undefined,
          servedCount: mistake.served_count,
          rowBased: true,
          randomExplorationProbability: randomProbability,
          randomExplorationRoll,
          selectedByRandomExploration: false,
          coldStartReviewOverride: true,
        };
      }

      return NextResponse.json(response);
    }
  }

  // P(random) path — read-only, no reserve
  if (selectedByRandomExploration) {
    const personalMistakeResult = await getNextActiveOrFillerMistakeForTraining(userId, new Date(), { reserve: false });
    const personalResponse = buildRowMistakeResponse({
      mistakeResult: personalMistakeResult,
      challengeElo,
      randomProbability,
      randomExplorationRoll,
      selectedByRandomExploration,
      attemptedQueueOrder: ["filler", "active"],
    });

    if (personalResponse) {
      return NextResponse.json(personalResponse);
    }

    // Random succeeded but filler pool empty — app_training fallback
    const appFallback = await getNextActiveAppMistake(userId, new Date(), { reserve: false });
    const appFallbackResponse = buildAppMistakeResponse({
      activeAppResult: appFallback,
      challengeElo,
      randomProbability,
      randomExplorationRoll,
      selectedByRandomExploration,
    });
    if (appFallbackResponse) return NextResponse.json(appFallbackResponse);
  } else {
    // No random — app_training first, then personal
    const appResult = await getNextActiveAppMistake(userId, new Date(), { reserve: false });
    const appFirstResponse = buildAppMistakeResponse({
      activeAppResult: appResult,
      challengeElo,
      randomProbability,
      randomExplorationRoll,
      selectedByRandomExploration,
    });
    if (appFirstResponse) return NextResponse.json(appFirstResponse);

    const personalMistakeResult = await getNextActiveOrFillerMistakeForTraining(userId, new Date(), { reserve: false });
    const personalFallbackResponse = buildRowMistakeResponse({
      mistakeResult: personalMistakeResult,
      challengeElo,
      randomProbability,
      randomExplorationRoll,
      selectedByRandomExploration,
      attemptedQueueOrder: ["active", "filler"],
    });
    if (personalFallbackResponse) return NextResponse.json(personalFallbackResponse);
  }

  // Queue-based fallback selection — read-only (no persistQueues call)
  const queues = await ensureTrainingQueuesHavePositions({
    ...queuesBeforeRefill,
    recentServedFens,
  });

  const requestedServeMode = chooseServeMode({
    completedSequenceCount,
    dueRevisitCount: queues.revisitQueue.filter((item) => Date.parse(item.scheduledAt) <= new Date().getTime()).length,
    recentModes: recentServedModes,
  });

  const selection = await selectValidTrainingPositionReadOnly({
    queues,
    completedSequenceCount,
    recentServedFens,
    requestedServeMode,
    bucketStats,
  });
  const nextPosition = selection.item;

  if (!nextPosition) {
    if (selectedByRandomExploration) {
      const personalMistakeResult = await getNextActiveOrFillerMistakeForTraining(userId, new Date(), { reserve: false });
      const personalBucketResponse = buildRowMistakeResponse({
        mistakeResult: personalMistakeResult,
        challengeElo,
        randomProbability,
        randomExplorationRoll,
        selectedByRandomExploration,
        attemptedQueueOrder: ["random", "personal"],
      });

      if (personalBucketResponse) {
        personalBucketResponse.debug = {
          ...(personalBucketResponse.debug ?? {}),
          randomBucketFallbackUsed: true,
        };
        return NextResponse.json(personalBucketResponse);
      }
    }

    const response: NextPositionResponse = {
      error: "No playable training positions available.",
      randomExplorationProbability: randomProbability,
      randomExplorationRoll,
      selectedByRandomExploration,
    };
    if (process.env.NODE_ENV !== "production") {
      response.debug = {
        queueCountsBefore,
        queueCountsAfter: getQueueCounts(selection.queues),
        rejectedInvalidCount: selection.rejectedInvalidCount,
        rejectedInvalidReasons: selection.rejectedInvalidReasons,
        randomExplorationProbability: randomProbability,
        randomExplorationRoll,
        selectedByRandomExploration,
      };
    }
    return NextResponse.json(response, { status: 404 });
  }

  // No persistQueues call — read-only; same candidate may be returned after refresh
  const enriched = enrichTrainingQueueItem(nextPosition);

  const response: NextPositionResponse = {
    fen: nextPosition.fen,
    source: nextPosition.source,
    selectedServeMode: selection.selectedServeMode,
    selectedPhase: enriched.phase ?? selection.selectedPhase,
    selectedBucket: enriched.bucket ?? selection.selectedBucket,
    randomExplorationProbability: randomProbability,
    randomExplorationRoll,
    selectedByRandomExploration,
    tags: nextPosition.tags,
    isTactic: nextPosition.isTactic,
    tacticRating: nextPosition.tacticRating,
    openingName: nextPosition.openingName,
    eco: nextPosition.eco,
    challengeElo,
  };

  if (process.env.NODE_ENV !== "production") {
    response.debug = {
      selectedQueue: selection.selectedQueue,
      queueCountsBefore,
      queueCountsAfter: getQueueCounts(selection.queues),
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
      randomExplorationProbability: randomProbability,
      randomExplorationRoll,
      selectedByRandomExploration,
      randomBucketFallbackUsed: selectedByRandomExploration && selection.selectedQueue !== "seed",
      phaseFallbackUsed: selection.phaseFallbackUsed,
      banditPreferredBucket: selection.banditPreferredBucket,
      banditCandidateBuckets: selection.banditCandidateBuckets,
      banditUsed: selection.banditUsed,
      banditFallbackUsed: selection.banditFallbackUsed,
      challengeElo,
      recentServedModesCount: recentServedModes.length,
      recentServedModesPreview: recentServedModes.slice(0, 10).map((e) => e.mode),
      dueRevisitCount: queues.revisitQueue.filter(
        (item) => Date.parse(item.scheduledAt) <= new Date().getTime(),
      ).length,
      profileUserId: userId,
    };
  }

  return NextResponse.json(response);
}

type RecentEntry = { fen: string; gameId?: string; ply?: number };

function buildAppMistakeResponse({
  activeAppResult,
  challengeElo,
  randomProbability,
  randomExplorationRoll,
  selectedByRandomExploration,
}: {
  activeAppResult: Awaited<ReturnType<typeof getNextActiveAppMistake>>;
  challengeElo: number;
  randomProbability: number;
  randomExplorationRoll: number;
  selectedByRandomExploration: boolean;
}): NextPositionResponse | null {
  const row = activeAppResult.mistake;
  if (!row) return null;

  if (!isValidFen(row.servedFen)) {
    console.error(
      `[next-position] Invalid FEN in app-training mistake ${row.id}: ${row.servedFen.slice(0, 60)}`,
    );
    return null;
  }

  const response: NextPositionResponse = {
    mistakeId: row.id,
    fen: row.servedFen,
    decisionFen: row.decisionFen,
    source: "app_training",
    queueSource: "active_mistake",
    selectedServeMode: "active_mistake",
    randomExplorationProbability: randomProbability,
    randomExplorationRoll,
    selectedByRandomExploration,
    challengeElo,
  };

  if (process.env.NODE_ENV !== "production") {
    response.debug = {
      queueSource: "active_mistake",
      mistakeId: row.id,
      sourceType: row.sourceType,
      selectedQueueKind: "active_mistake",
      randomExplorationProbability: randomProbability,
      randomExplorationRoll,
      selectedByRandomExploration,
    };
  }

  return response;
}

function buildRowMistakeResponse({
  mistakeResult,
  challengeElo,
  randomProbability,
  randomExplorationRoll,
  selectedByRandomExploration,
  attemptedQueueOrder,
}: {
  mistakeResult: NextMistakeResult;
  challengeElo: number;
  randomProbability: number;
  randomExplorationRoll: number;
  selectedByRandomExploration: boolean;
  attemptedQueueOrder?: string[];
}): NextPositionResponse | null {
  if (!mistakeResult.mistake) return null;

  const normalized = normalizeUserMistakeForTraining(mistakeResult.mistake);
  const mistake = mistakeResult.mistake;

  if (!isValidFen(normalized.fen)) {
    console.error(
      `[next-position] Invalid FEN in row-based mistake ${mistake.id}: ${normalized.fen.slice(0, 60)}`,
    );
    return null;
  }

  const response: NextPositionResponse = {
    mistakeId: normalized.id,
    fen: normalized.fen,
    decisionFen: normalized.decisionFen ?? undefined,
    source: normalized.source,
    queueSource: mistakeResult.queueSource ?? undefined,
    reviewCount: mistake.review_count ?? 0,
    selectedServeMode: mistakeResult.queueSource ?? undefined,
    randomExplorationProbability: randomProbability,
    randomExplorationRoll,
    selectedByRandomExploration,
    tags: normalizeThemeTags(mistake.theme_tags),
    openingName: mistake.opening_name ?? undefined,
    eco: mistake.eco ?? undefined,
    challengeElo,
  };

  if (process.env.NODE_ENV !== "production") {
    response.debug = {
      queueSource: mistakeResult.queueSource,
      mistakeId: normalized.id,
      sourceType: mistake.source_type,
      reviewCount: mistake.review_count,
      intervalDays: mistake.interval_days,
      nextReviewAt: mistake.next_review_at ?? undefined,
      servedCount: mistake.served_count,
      rowBased: true,
      randomExplorationProbability: randomProbability,
      randomExplorationRoll,
      selectedByRandomExploration,
      coldStartReviewOverride: mistakeResult.queueSource === "review",
      attemptedQueueOrder: attemptedQueueOrder ?? [],
    };
  }

  return response;
}

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

async function selectValidTrainingPositionReadOnly({
  queues,
  completedSequenceCount,
  recentServedFens,
  requestedServeMode,
  bucketStats,
}: {
  queues: Awaited<ReturnType<typeof ensureTrainingQueuesHavePositions>>;
  completedSequenceCount: number;
  recentServedFens: RecentEntry[];
  requestedServeMode: ServeMode;
  bucketStats: BucketStats;
}) {
  let currentQueues = queues;
  const invalidRecentEntries: RecentEntry[] = [];
  const rejectedInvalidReasons: string[] = [];
  let rejectedRecentExactCount = 0;
  let rejectedNearDuplicateCount = 0;
  let nearDuplicateReason: string | null = null;
  let selectedQueue = "fallback";
  let wasDueRevisit = false;
  let selectedFenValidity: ReturnType<typeof validatePlayableTrainingFen> | null = null;
  let selectedPhase: string | undefined = undefined;
  let selectedBucket: string | undefined = undefined;
  let phaseFallbackUsed = false;
  let selectedServeMode: ServeMode | undefined = undefined;
  const banditCandidateBuckets = getBanditCandidateBuckets(requestedServeMode);
  const banditPreferredBucket = chooseWeaknessBucketWithThompson({
    candidateBuckets: banditCandidateBuckets,
    bucketStats,
  });
  let banditUsed = false;
  const now = new Date();
  const recentFenSet = new Set([...recentServedFens, ...invalidRecentEntries].map((e) => e.fen));

  // Step 1: Revisit due — select without persisting
  const dueRevisit = currentQueues.revisitQueue.find((item) => Date.parse(item.scheduledAt) <= now.getTime());
  if (dueRevisit) {
    const enriched = enrichTrainingQueueItem(dueRevisit);
    selectedFenValidity = validatePlayableTrainingFen(dueRevisit.fen);

    if (selectedFenValidity.ok) {
      // No engine validation in cold read-only path
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
        queues: currentQueues,
        rejectedRecentExactCount: 0,
        rejectedNearDuplicateCount: 0,
        nearDuplicateReason: null,
        rejectedInvalidCount: rejectedInvalidReasons.length,
        rejectedInvalidReasons,
        selectedFenValidity,
        selectedServeMode,
        selectedPhase,
        selectedBucket,
        banditPreferredBucket,
        banditCandidateBuckets,
        banditUsed: false,
        banditFallbackUsed: false,
        phaseFallbackUsed: requestedServeMode !== "revisit",
      };
    }
    rejectedInvalidReasons.push(selectedFenValidity.reason ?? "invalid_position");

    invalidRecentEntries.push({
      fen: dueRevisit.fen,
      gameId: dueRevisit.gameId,
      ply: dueRevisit.ply,
    });
    recentFenSet.add(dueRevisit.fen);
    currentQueues = removeFenFromAllQueues(currentQueues, dueRevisit.fen);
  }

  // Step 2: Seed candidates for opening/tactic/endgame/middlegame/wildcard modes
  if (requestedServeMode === "opening" || requestedServeMode === "tactic" || requestedServeMode === "endgame" || requestedServeMode === "middlegame" || requestedServeMode === "wildcard") {
    const seedModes = buildSeedModePreferenceList(requestedServeMode, banditPreferredBucket);

    for (const seedMode of seedModes) {
      const seedCandidates = await getModeSeedCandidates(seedMode, recentFenSet, now, 30);

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

      rejectedRecentExactCount += seedSelection.rejectedRecentExactCount;
      rejectedNearDuplicateCount += seedSelection.rejectedNearDuplicateCount;
      if (seedSelection.nearDuplicateReason) {
        nearDuplicateReason = seedSelection.nearDuplicateReason;
      }

      if (seedSelection.item) {
        const enriched = enrichTrainingQueueItem(seedSelection.item);
        selectedFenValidity = validatePlayableTrainingFen(seedSelection.item.fen);
        if (selectedFenValidity.ok) {
          // No engine validation in cold read-only path
          selectedPhase = enriched.phase ?? classifyPhaseFromFen(seedSelection.item.fen);
          selectedBucket = enriched.bucket;
          selectedServeMode = deriveServeModeFromCandidate({
            requestedServeMode,
            phase: selectedPhase,
            bucket: selectedBucket,
            isTactic: seedSelection.item.isTactic,
            selectedQueue: "seed",
          });
          banditUsed = Boolean(banditPreferredBucket && seedMode === banditPreferredBucket);
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
            banditPreferredBucket,
            banditCandidateBuckets,
            banditUsed,
            banditFallbackUsed: Boolean(banditPreferredBucket && !banditUsed),
            phaseFallbackUsed: selectedServeMode !== requestedServeMode,
          };
        }
        rejectedInvalidReasons.push(selectedFenValidity.reason ?? "invalid_position");
      }
    }

    phaseFallbackUsed = true;
  }

  // Step 3: Queue-based selection — read-only
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
      currentQueues = await ensureTrainingQueuesHavePositions({
        ...currentQueues,
        excludeFens: invalidRecentEntries.map((entry) => entry.fen),
        recentServedFens: [...recentServedFens, ...invalidRecentEntries],
      });
      continue;
    }

    const validity = validatePlayableTrainingFen(reservation.item.fen);
    if (validity.ok) {
      // No engine validation in cold read-only path
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
        banditPreferredBucket,
        banditCandidateBuckets,
        banditUsed: false,
        banditFallbackUsed: Boolean(banditPreferredBucket),
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
    banditPreferredBucket,
    banditCandidateBuckets,
    banditUsed: false,
    banditFallbackUsed: Boolean(banditPreferredBucket),
    phaseFallbackUsed,
  };
}

type TrainingQueueName = "revisit" | "exploit" | "explore" | "mastered" | "fallback" | "seed";

function getBanditCandidateBuckets(requestedServeMode: ServeMode): TrainingBucket[] {
  switch (requestedServeMode) {
    case "opening":
      return ["opening_gambit", "opening_development", "opening"];
    case "middlegame":
      return ["middlegame_attack", "middlegame_positional", "middlegame"];
    case "endgame":
      return ["endgame_rook", "endgame_pawn", "endgame"];
    case "tactic":
      return ["tactic"];
    case "wildcard":
      return ["wildcard"];
    default:
      return [];
  }
}

function chooseWeaknessBucketWithThompson({
  candidateBuckets,
  bucketStats,
}: {
  candidateBuckets: TrainingBucket[];
  bucketStats: BucketStats;
}): TrainingBucket | null {
  const weaknessStats: BucketStats = {};

  for (const bucket of candidateBuckets) {
    const stats = bucketStats[bucket];
    if (!stats || stats.attempts <= 0) continue;

    weaknessStats[bucket] = {
      alpha: stats.beta,
      beta: stats.alpha,
      attempts: stats.attempts,
    };
  }

  return thompsonSample(weaknessStats, Math.random);
}

function buildSeedModePreferenceList(
  requestedServeMode: ServeMode,
  banditPreferredBucket: TrainingBucket | null,
): string[] {
  const modes: string[] = [];
  if (banditPreferredBucket) modes.push(banditPreferredBucket);
  modes.push(requestedServeMode);

  return modes.filter((mode, index) => modes.indexOf(mode) === index);
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

function normalizeThemeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value.filter((x): x is string => typeof x === "string");
  return tags.length > 0 ? tags : undefined;
}

function isValidFen(fen: string) {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}
