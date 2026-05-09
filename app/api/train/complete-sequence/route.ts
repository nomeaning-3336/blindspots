import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getPositionEval } from "@/lib/engines/dispatcher";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database";
import { normalizeQueue, normalizeRecentServedFens, updateQueuesAfterSequence } from "@/lib/training/queues";
import {
  calculateEloUpdate,
  calculateExpectedScore,
  getKFactor,
  getOpponentElo,
  normalizeRatingDeviation,
} from "@/lib/training/elo";
import { normalizeBucketStats, recordBucketResult } from "@/lib/training/bandit-stats";
import { classifyTrainingBucket, classifyTrainingPhase } from "@/lib/training/position-metadata";
import type { TrainingBucket, TrainingPhase } from "@/lib/training/queue-core";
import { classifyTrainingOutcome } from "@/lib/training/mistake-srs";
import { updateMistakeAfterTraining, updateActiveMistakeAfterTraining } from "@/lib/training/mistake-store";
import { mineMistakesFromSequence } from "@/lib/training/mistake-mining-persistence";
import type { MineableMoveInput } from "@/lib/training/mistake-mining";
import { buildDefaultBlindspotProfile } from "@/lib/training/default-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SEQUENCE_LENGTH = 4;
const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;
const COMPLETE_SEQUENCE_MISSING_EVAL_TIME_LIMIT_MS = 500;

type SequenceMove = {
  san?: unknown;
  uci?: unknown;
  side?: unknown;
};

type CompleteSequencePayload = {
  startingFen?: unknown;
  moves?: unknown;
  sequenceLength?: unknown;
  reflectionNote?: unknown;
  selectedBucket?: unknown;
  selectedServeMode?: unknown;
  selectedPhase?: unknown;
  selectedTags?: unknown;
  selectedIsTactic?: unknown;
  selectedTacticRating?: unknown;
  selectedOpeningName?: unknown;
  selectedEco?: unknown;
  challengeElo?: unknown;
  selectedMistakeId?: unknown;
  queueSource?: unknown;
  precomputedEvaluations?: unknown;
  /** Setup prelude into the first decisionFen (i.e. startingFen). */
  previousFen?: unknown;
  playedMove?: unknown;
};

type MoveClassification = "brilliant" | "critical" | "best" | "excellent" | "good" | "okay" | "inaccuracy" | "mistake" | "blunder";

type PositionEvaluation = {
  index: number;
  decisionFen: string;
  userMove: {
    san: string;
    uci: string;
  };
  evalBefore: number;
  evalAfter: number;
  mateBefore?: number | null;
  mateAfter?: number | null;
  cpLoss: number;
  classification: MoveClassification;
  banditResult: "success" | "neutral" | "failure";
  fenAfterUserMove: string;
  fenAfterEngineMove: string | null;
  phase: string;
  bucket: string;
  clusterId: string;
  tags: string[];
};

type SequenceEvaluationResult = {
  evalPreservationScore: number | null;
  moveScores: Array<{
    userMoveIndex: number;
    cpLoss: number;
    evalBefore: number;
    evalAfter: number;
    mateBefore?: number | null;
    mateAfter?: number | null;
    classification: MoveClassification;
  }>;
  totalCpLoss: number;
  positionEvaluations: PositionEvaluation[];
};

const MATE_VISUAL_CP = 10000;

function isCheckmateFen(fen: string) {
  try {
    const chess = new Chess(fen);
    return chess.isCheckmate();
  } catch {
    return false;
  }
}

function mateCpForWinningSide(winner: "w" | "b") {
  return winner === "w" ? MATE_VISUAL_CP : -MATE_VISUAL_CP;
}

function classifyUserDeliveredCheckmate(): MoveClassification {
  return "good";
}

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as CompleteSequencePayload | null;
  const startingFen = typeof payload?.startingFen === "string" ? payload.startingFen : "";
  const moves = normalizeMoves(payload?.moves);
  const selectedPhase = typeof payload?.selectedPhase === "string" ? payload.selectedPhase : null;
  const selectedBucket =
    typeof payload?.selectedBucket === "string" && payload.selectedBucket.length > 0
      ? payload.selectedBucket
      : classifyTrainingBucket({
          fen: startingFen,
          phase: selectedPhase as "opening" | "middlegame" | "endgame" | "tactic" | "unknown" | undefined,
        });
  const selectedServeMode = typeof payload?.selectedServeMode === "string" ? payload.selectedServeMode : null;

  const selectedTags = normalizeTags(payload?.selectedTags);
  const selectedIsTactic = typeof payload?.selectedIsTactic === "boolean" ? payload.selectedIsTactic : null;
  const selectedTacticRating = typeof payload?.selectedTacticRating === "number" ? payload.selectedTacticRating : null;
  const selectedOpeningName = typeof payload?.selectedOpeningName === "string" ? payload.selectedOpeningName : null;
  const selectedEco = typeof payload?.selectedEco === "string" ? payload.selectedEco : null;

  if (!isValidFen(startingFen) || moves.length === 0) {
    return NextResponse.json({ error: "Invalid sequence." }, { status: 400 });
  }

  const sequenceLength = 4;
  const reflectionNote = typeof payload?.reflectionNote === "string" ? payload.reflectionNote : null;
  const challengeElo = normalizeOptionalNumber(payload?.challengeElo);

  const precomputedInputCount = Array.isArray(payload?.precomputedEvaluations)
    ? payload.precomputedEvaluations.length
    : 0;

  const profileStartedAt = Date.now();
  const profile = await getOrCreateProfile(userId);
  const profileMs = Date.now() - profileStartedAt;

  const evaluationStartedAt = Date.now();
  const precomputedSequenceEvaluation = buildPrecomputedSequenceEvaluation({
    rawEvaluations: payload?.precomputedEvaluations,
    startingFen,
    moves,
  });
  const usedPrecomputedEvaluations = Boolean(precomputedSequenceEvaluation);
  const usedPartialPrecomputedEvaluations =
    !usedPrecomputedEvaluations && precomputedInputCount > 0;
  const sequenceEvaluation =
    precomputedSequenceEvaluation ??
    await calculateSequenceEvaluation({
      startingFen,
      moves,
      selectedBucket,
      selectedPhase,
      selectedTags,
      selectedIsTactic,
      selectedOpeningName,
      selectedEco,
      rawPrecomputedEvaluations: payload?.precomputedEvaluations,
    });
  const evaluationMs = Date.now() - evaluationStartedAt;

  if (process.env.NODE_ENV !== "production") {
    console.log("[complete-sequence:timing]", {
      precomputedInputCount,
      usedPrecomputedEvaluations,
      usedPartialPrecomputedEvaluations,
      moveCount: moves.length,
      moveScoreCount: sequenceEvaluation.moveScores.length,
      profileMs,
      evaluationMs,
    });
  }
  const evalPreservationScore = sequenceEvaluation.evalPreservationScore;
  const profileRatingDeviation = normalizeRatingDeviation(profile.rating_deviation);

  const averageCpLoss = Math.max(0, Math.round(
    sequenceEvaluation.moveScores.length > 0
      ? sequenceEvaluation.totalCpLoss / sequenceEvaluation.moveScores.length
      : 0,
  ));
  const maxSingleCpLoss = Math.max(0, ...sequenceEvaluation.moveScores.map((s) => s.cpLoss), 0);
  const trainingOutcome = classifyTrainingOutcome({ averageCpLoss, maxSingleCpLoss });

  const selectedMistakeId = typeof payload?.selectedMistakeId === "string" ? payload.selectedMistakeId : null;
  const queueSource = typeof payload?.queueSource === "string" ? payload.queueSource : null;

  const eloUpdate = calculateEloUpdate({
    currentElo: profile.blindspots_elo,
    ratingDeviation: profileRatingDeviation,
    totalSequences: profile.total_sequences,
    evalPreservationScore,
    totalCpLoss: sequenceEvaluation.totalCpLoss,
    opponentElo: challengeElo ?? undefined,
  });

  const fallbackOpponentElo = challengeElo ?? eloUpdate?.opponentElo ?? getOpponentElo(profile.blindspots_elo);
  const fallbackExpectedScore = calculateExpectedScore(profile.blindspots_elo, fallbackOpponentElo);
  const kFactor = eloUpdate?.kFactor ?? getKFactor(profile.total_sequences, profileRatingDeviation);
  const completedAt = new Date().toISOString();
  const eloBefore = eloUpdate?.eloBefore ?? profile.blindspots_elo;
  const eloAfter = eloUpdate?.eloAfter ?? profile.blindspots_elo;
  const eloDelta = eloUpdate?.eloDelta ?? 0;
  const opponentElo = eloUpdate?.opponentElo ?? fallbackOpponentElo;
  const expectedScore = eloUpdate?.expectedScore ?? fallbackExpectedScore;
  const actualScore = eloUpdate?.actualScore ?? 0;

  const supabase = getSupabaseAdminClient();
  const sessionInsertStartedAt = Date.now();
  const { data: session, error: sessionError } = await supabase
    .from("training_sessions")
    .insert({
      user_id: userId,
      starting_fen: startingFen,
      moves_played: moves as Json,
      eval_preservation_score: evalPreservationScore,
      opponent_mode: "standard",
      sequence_length: sequenceLength,
      time_pressure_mode: "none",
      reflection_note: reflectionNote,
      completed_at: completedAt,
      elo_before: eloBefore,
      elo_after: eloAfter,
      elo_delta: eloDelta,
      k_factor: kFactor,
      opponent_elo: opponentElo,
      expected_score: expectedScore,
      actual_score: actualScore,
      position_evaluations: sequenceEvaluation.positionEvaluations as unknown as Json,
      selected_mistake_id: selectedMistakeId,
      queue_source: queueSource,
      training_outcome: trainingOutcome,
      average_cp_loss: averageCpLoss,
      max_single_cp_loss: maxSingleCpLoss,
    })
    .select("id")
    .single();

  if (sessionError) {
    throw new Error(`Failed to save training session: ${sessionError.message}`);
  }
  const sessionInsertMs = Date.now() - sessionInsertStartedAt;

  // Fire-and-forget mining of app-native active mistakes — never blocks response.
  const initialPreviousFen = typeof payload?.previousFen === "string" ? payload.previousFen : null;
  const initialPlayedMove = typeof payload?.playedMove === "string" ? payload.playedMove : null;
  const minedMistakesInput: MineableMoveInput[] = sequenceEvaluation.positionEvaluations.map((pe, index) => ({
    decisionFen: pe.decisionFen,
    uci: pe.userMove.uci,
    san: pe.userMove.san,
    classification: pe.classification,
    cpLoss: pe.cpLoss,
    evalBefore: pe.evalBefore,
    evalAfter: pe.evalAfter,
    mateBefore: pe.mateBefore ?? null,
    mateAfter: pe.mateAfter ?? null,
    fenAfterUserMove: pe.fenAfterUserMove,
    // Pass the served-position prelude as the explicit setup for the first evaluated move.
    previousDecisionFen: index === 0 ? initialPreviousFen : undefined,
    previousMoveUci: index === 0 ? initialPlayedMove : undefined,
  }));
  mineMistakesFromSequence({
    userId,
    sessionId: session.id,
    positionEvaluations: minedMistakesInput,
  }).catch(() => {
    // Mining is best-effort; never fail the sequence completion.
  });

  if (selectedMistakeId) {
    try {
      const srsUpdateStartedAt = Date.now();

      if (queueSource === "active_mistake") {
        // Active app-training mistake: simple reschedule, no status change.
        await updateActiveMistakeAfterTraining({
          userId,
          mistakeId: selectedMistakeId,
          wasCorrect: trainingOutcome === "pass",
        });
      } else {
        // Legacy row-based / imported / puzzle-filler mistake: full SRS path.
        await updateMistakeAfterTraining({
          userId,
          mistakeId: selectedMistakeId,
          outcome: trainingOutcome,
          averageCpLoss,
          maxSingleCpLoss,
        });
      }

      if (process.env.NODE_ENV !== "production") {
        console.log("[complete-sequence:srs]", {
          srsUpdateMs: Date.now() - srsUpdateStartedAt,
          activeMistake: queueSource === "active_mistake",
        });
      }
    } catch (mistakeUpdateError) {
      console.error("[complete-sequence] SRS update failed", mistakeUpdateError);
      return NextResponse.json(
        { error: "Failed to update mistake SRS state." },
        { status: 500 },
      );
    }

    // Update Elo only, skip legacy queue/bucket/cluster stats
    const profileUpdateStartedAt = Date.now();
    const { error: profileError } = await supabase
      .from("user_blindspot_profile")
      .update({
        blindspots_elo: eloAfter,
        rating_deviation: eloUpdate?.ratingDeviationAfter ?? profileRatingDeviation,
        total_sequences: profile.total_sequences + 1,
        last_session_at: completedAt,
      })
      .eq("user_id", userId);

    if (profileError) {
      throw new Error(`Failed to update Blindspots Elo: ${profileError.message}`);
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      evalPreservationScore,
      moveScores: sequenceEvaluation.moveScores,
      positionEvaluations: sequenceEvaluation.positionEvaluations,
      elo: {
        eloBefore,
        eloAfter,
        eloDelta,
        kFactor,
        opponentElo,
        expectedScore,
        actualScore,
        rawDelta: eloUpdate?.rawDelta ?? 0,
        clampedDelta: eloUpdate?.clampedDelta ?? 0,
        skipped: evalPreservationScore === null,
        ratingDeviationBefore: eloUpdate?.ratingDeviationBefore ?? profileRatingDeviation,
        ratingDeviationAfter: eloUpdate?.ratingDeviationAfter ?? profileRatingDeviation,
      },
      trainingOutcome,
      averageCpLoss,
      maxSingleCpLoss,
      selectedMistakeId: selectedMistakeId,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[complete-sequence:done]", {
        path: "row-based",
        usedPrecomputedEvaluations,
        usedPartialPrecomputedEvaluations,
        precomputedInputCount,
        profileMs,
        evaluationMs,
        sessionInsertMs,
        profileUpdateMs: Date.now() - profileUpdateStartedAt,
        totalMs: Date.now() - requestStartedAt,
      });
    }
  }

  // Legacy JSON-queue path
  const legacyQueueStartedAt = Date.now();
  const queues = await updateQueuesAfterSequence({
    currentQueues: {
      exploitQueue: normalizeQueue(profile.exploit_queue),
      exploreQueue: normalizeQueue(profile.explore_queue),
      revisitQueue: normalizeQueue(profile.revisit_queue),
      masteredQueue: normalizeQueue(profile.mastered_queue),
    },
    startingFen,
    evalPreservationScore,
    sessionId: session.id,
    recentServedFens: normalizeRecentServedFens(profile.recent_served_fens),
    selectedMetadata: {
      phase: (selectedPhase as TrainingPhase) ?? undefined,
      bucket: selectedBucket as TrainingBucket | undefined,
      tags: selectedTags ?? undefined,
      isTactic: selectedIsTactic ?? undefined,
      tacticRating: selectedTacticRating ?? undefined,
      openingName: selectedOpeningName ?? undefined,
      eco: selectedEco ?? undefined,
    },
  });

  const currentStats = normalizeBucketStats(profile.bucket_stats);
  let updatedStats = currentStats;
  for (const posEval of sequenceEvaluation.positionEvaluations) {
    updatedStats = recordBucketResult(updatedStats, posEval.bucket, posEval.banditResult === "success");
  }

  const currentClusterStats = normalizeClusterStats(profile.cluster_stats);
  const updatedClusterStats = recordClusterResults(currentClusterStats, sequenceEvaluation.positionEvaluations, completedAt);
  const updatedRecentClusters = updateRecentClusters(profile.recent_clusters, sequenceEvaluation.positionEvaluations);

  const profileUpdateStartedAt = Date.now();
  const { error: profileError } = await supabase
    .from("user_blindspot_profile")
    .update({
      blindspots_elo: eloAfter,
      rating_deviation: eloUpdate?.ratingDeviationAfter ?? profileRatingDeviation,
      total_sequences: profile.total_sequences + 1,
      last_session_at: completedAt,
      exploit_queue: queues.exploitQueue as unknown as Json,
      explore_queue: queues.exploreQueue as unknown as Json,
      revisit_queue: queues.revisitQueue as unknown as Json,
      mastered_queue: queues.masteredQueue as unknown as Json,
      bucket_stats: updatedStats as unknown as Json,
      cluster_stats: updatedClusterStats as unknown as Json,
      recent_clusters: updatedRecentClusters as unknown as Json,
    })
    .eq("user_id", userId);

  if (profileError) {
    throw new Error(`Failed to update Blindspots Elo: ${profileError.message}`);
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[complete-sequence:done]", {
      path: "legacy-json-queue",
      usedPrecomputedEvaluations,
      usedPartialPrecomputedEvaluations,
      precomputedInputCount,
      profileMs,
      evaluationMs,
      sessionInsertMs,
      legacyQueueMs: Date.now() - legacyQueueStartedAt,
      profileUpdateMs: Date.now() - profileUpdateStartedAt,
      totalMs: Date.now() - requestStartedAt,
    });
  }

  return NextResponse.json({
    ok: true,
    sessionId: session.id,
    evalPreservationScore,
    moveScores: sequenceEvaluation.moveScores,
    positionEvaluations: sequenceEvaluation.positionEvaluations,
    queues: {
      exploitCount: queues.exploitQueue.length,
      exploreCount: queues.exploreQueue.length,
      revisitCount: queues.revisitQueue.length,
      masteredCount: queues.masteredQueue.length,
    },
    elo: {
      eloBefore,
      eloAfter,
      eloDelta,
      kFactor,
      opponentElo,
      expectedScore,
      actualScore,
      rawDelta: eloUpdate?.rawDelta ?? 0,
      clampedDelta: eloUpdate?.clampedDelta ?? 0,
      skipped: evalPreservationScore === null,
      ratingDeviationBefore: eloUpdate?.ratingDeviationBefore ?? profileRatingDeviation,
      ratingDeviationAfter: eloUpdate?.ratingDeviationAfter ?? profileRatingDeviation,
    },
    trainingOutcome,
    averageCpLoss,
    maxSingleCpLoss,
    selectedMistakeId: selectedMistakeId ?? undefined,
  });
}

async function calculateSequenceEvaluation({
  startingFen,
  moves,
  selectedBucket,
  selectedPhase,
  selectedTags,
  selectedIsTactic,
  selectedOpeningName,
  selectedEco,
  rawPrecomputedEvaluations,
}: {
  startingFen: string;
  moves: Array<{ san: string; uci: string; side: string }>;
  selectedBucket: string;
  selectedPhase: string | null;
  selectedTags: string[] | null;
  selectedIsTactic: boolean | null;
  selectedOpeningName: string | null;
  selectedEco: string | null;
  rawPrecomputedEvaluations?: unknown;
}) {
  const chess = new Chess(startingFen);
  const userColor = chess.turn();
  let userMoveCount = 0;
  let totalCpLoss = 0;
  const moveScores: Array<{
    userMoveIndex: number;
    cpLoss: number;
    evalBefore: number;
    evalAfter: number;
    mateBefore?: number | null;
    mateAfter?: number | null;
    classification: MoveClassification;
  }> = [];
  const positionEvaluations: PositionEvaluation[] = [];
  const precomputedByIndex = buildValidPrecomputedEvaluationMap({
    rawEvaluations: rawPrecomputedEvaluations,
    maxUserMoveCount: countUserMovesInSequence(startingFen, moves),
  });

  for (const move of moves) {
    const isUserMove = chess.turn() === userColor;
    const decisionFen = chess.fen();
    const precomputedEntry = isUserMove ? precomputedByIndex.get(userMoveCount) : null;
    const evalBefore = isUserMove && !precomputedEntry
      ? await getPositionEval(decisionFen, {
          timeLimitMs: COMPLETE_SEQUENCE_MISSING_EVAL_TIME_LIMIT_MS,
        })
      : null;
    const played = chess.move({
      from: move.uci.slice(0, 2),
      to: move.uci.slice(2, 4),
      promotion: move.uci[4],
    });
    if (!played) break;

    if (isUserMove) {
      const fenAfterMove = chess.fen();
      if (precomputedEntry) {
        totalCpLoss += precomputedEntry.moveScore.cpLoss;
        moveScores.push(precomputedEntry.moveScore);
        positionEvaluations.push(precomputedEntry.positionEvaluation);
        userMoveCount += 1;
        continue;
      }

      const evalBeforeCp = userColor === "w" ? evalBefore!.cp : -evalBefore!.cp;
      const userDeliveredCheckmate = isCheckmateFen(fenAfterMove);

      if (userDeliveredCheckmate) {
        const classification = classifyUserDeliveredCheckmate();
        const mateBeforeVal = evalBefore?.mate ?? null;
        moveScores.push({
          userMoveIndex: userMoveCount,
          cpLoss: 0,
          evalBefore: Math.round(evalBeforeCp),
          evalAfter: mateCpForWinningSide(userColor),
          mateBefore: mateBeforeVal,
          mateAfter: 0,
          classification,
        });
        const checkmatePhase = selectedPhase ?? classifyTrainingPhase(fenAfterMove);
        positionEvaluations.push({
          index: userMoveCount,
          decisionFen,
          userMove: { san: move.san, uci: move.uci },
          evalBefore: Math.round(evalBeforeCp),
          evalAfter: mateCpForWinningSide(userColor),
          mateBefore: mateBeforeVal,
          mateAfter: 0,
          cpLoss: 0,
          classification,
          banditResult: "success",
          fenAfterUserMove: fenAfterMove,
          fenAfterEngineMove: null,
          phase: checkmatePhase,
          bucket: selectedBucket,
          clusterId: deriveAppClusterId({
            phase: checkmatePhase,
            bucket: selectedBucket,
            tags: selectedTags,
            isTactic: selectedIsTactic,
            openingName: selectedOpeningName,
            eco: selectedEco,
          }),
          tags: selectedTags ?? [],
        });
        userMoveCount += 1;
        continue;
      }

      const evalAfter = await getPositionEval(fenAfterMove, {
        timeLimitMs: COMPLETE_SEQUENCE_MISSING_EVAL_TIME_LIMIT_MS,
      });
      const afterUserEval = userColor === "w" ? evalAfter.cp : -evalAfter.cp;
      const cpLoss = Math.max(0, Math.round(evalBeforeCp - afterUserEval));
      totalCpLoss += cpLoss;
      const classification = classifyCpLoss(cpLoss);
      const mateBeforeVal = evalBefore?.mate ?? null;
      const mateAfterVal = evalAfter.mate ?? null;
      moveScores.push({
        userMoveIndex: userMoveCount,
        cpLoss,
        evalBefore: Math.round(evalBeforeCp),
        evalAfter: Math.round(afterUserEval),
        mateBefore: mateBeforeVal,
        mateAfter: mateAfterVal,
        classification,
      });

      // Get engine reply if available (requires engine call; leave null for now)
      let fenAfterEngineMove: string | null = null;

      const regularPhase = selectedPhase ?? classifyTrainingPhase(fenAfterMove);
      positionEvaluations.push({
        index: userMoveCount,
        decisionFen,
        userMove: { san: move.san, uci: move.uci },
        evalBefore: Math.round(evalBeforeCp),
        evalAfter: Math.round(afterUserEval),
        mateBefore: mateBeforeVal,
        mateAfter: mateAfterVal,
        cpLoss,
        classification,
        banditResult: getBanditResult(classification),
        fenAfterUserMove: fenAfterMove,
        fenAfterEngineMove,
        phase: regularPhase,
        bucket: selectedBucket,
        clusterId: deriveAppClusterId({
          phase: regularPhase,
          bucket: selectedBucket,
          tags: selectedTags,
          isTactic: selectedIsTactic,
          openingName: selectedOpeningName,
          eco: selectedEco,
        }),
        tags: selectedTags ?? [],
      });
      userMoveCount += 1;
    }
  }

  return {
    evalPreservationScore:
      userMoveCount < 2
        ? null
        : Math.max(0, Math.min(1, 1 - totalCpLoss / (userMoveCount * 100))),
    moveScores,
    totalCpLoss,
    positionEvaluations,
  };
}

type PrecomputedEvaluationPayload = {
  userMoveIndex?: unknown;
  moveScore?: unknown;
  positionEvaluation?: unknown;
};

function buildPrecomputedSequenceEvaluation({
  rawEvaluations,
  startingFen,
  moves,
}: {
  rawEvaluations: unknown;
  startingFen: string;
  moves: Array<{ san: string; uci: string; side: string }>;
}): SequenceEvaluationResult | null {
  if (!Array.isArray(rawEvaluations)) return null;

  const expectedUserMoveCount = countUserMovesInSequence(startingFen, moves);
  if (expectedUserMoveCount <= 0) return null;

  const byIndex = new Map<number, {
    moveScore: SequenceEvaluationResult["moveScores"][number];
    positionEvaluation: PositionEvaluation;
  }>();

  for (const raw of rawEvaluations as PrecomputedEvaluationPayload[]) {
    if (!isRecord(raw)) continue;

    const rawIndex = raw.userMoveIndex;
    const userMoveIndex =
      typeof rawIndex === "number" && Number.isInteger(rawIndex)
        ? rawIndex
        : null;
    if (userMoveIndex === null) continue;
    if (userMoveIndex < 0 || userMoveIndex >= expectedUserMoveCount) continue;

    const moveScore = normalizePrecomputedMoveScore(raw.moveScore, userMoveIndex);
    const positionEvaluation = normalizePrecomputedPositionEvaluation(
      raw.positionEvaluation,
      userMoveIndex,
    );

    if (!moveScore || !positionEvaluation) continue;

    byIndex.set(userMoveIndex, { moveScore, positionEvaluation });
  }

  const moveScores: SequenceEvaluationResult["moveScores"] = [];
  const positionEvaluations: PositionEvaluation[] = [];

  for (let index = 0; index < expectedUserMoveCount; index += 1) {
    const entry = byIndex.get(index);
    if (!entry) return null;
    moveScores.push(entry.moveScore);
    positionEvaluations.push(entry.positionEvaluation);
  }

  const totalCpLoss = moveScores.reduce((sum, score) => sum + score.cpLoss, 0);

  return {
    evalPreservationScore:
      expectedUserMoveCount < 2
        ? null
        : Math.max(0, Math.min(1, 1 - totalCpLoss / (expectedUserMoveCount * 100))),
    moveScores,
    totalCpLoss,
    positionEvaluations,
  };
}

function countUserMovesInSequence(
  startingFen: string,
  moves: Array<{ san: string; uci: string; side: string }>,
) {
  try {
    const chess = new Chess(startingFen);
    const userColor = chess.turn();
    let userMoveCount = 0;

    for (const move of moves) {
      const isUserMove = chess.turn() === userColor;
      const played = chess.move({
        from: move.uci.slice(0, 2),
        to: move.uci.slice(2, 4),
        promotion: move.uci[4],
      });
      if (!played) break;
      if (isUserMove) userMoveCount += 1;
    }

    return userMoveCount;
  } catch {
    return 0;
  }
}

function normalizePrecomputedMoveScore(
  raw: unknown,
  expectedIndex: number,
): SequenceEvaluationResult["moveScores"][number] | null {
  if (!isRecord(raw)) return null;

  const cpLoss = normalizeNonNegativeNumber(raw.cpLoss);
  const evalBefore = normalizeFiniteNumber(raw.evalBefore);
  const evalAfter = normalizeFiniteNumber(raw.evalAfter);
  const classification = normalizeMoveClassification(raw.classification);

  if (cpLoss === null) return null;
  if (evalBefore === null) return null;
  if (evalAfter === null) return null;
  if (!classification) return null;

  return {
    userMoveIndex: expectedIndex,
    cpLoss: Math.round(cpLoss),
    evalBefore: Math.round(evalBefore),
    evalAfter: Math.round(evalAfter),
    mateBefore: normalizeOptionalMate(raw.mateBefore),
    mateAfter: normalizeOptionalMate(raw.mateAfter),
    classification,
  };
}

function normalizePrecomputedPositionEvaluation(
  raw: unknown,
  expectedIndex: number,
): PositionEvaluation | null {
  if (!isRecord(raw)) return null;

  const decisionFen = typeof raw.decisionFen === "string" ? raw.decisionFen : "";
  const userMove = isRecord(raw.userMove) ? raw.userMove : null;
  const userMoveSan = typeof userMove?.san === "string" ? userMove.san : "";
  const userMoveUci = typeof userMove?.uci === "string" ? userMove.uci : "";
  const evalBefore = normalizeFiniteNumber(raw.evalBefore);
  const evalAfter = normalizeFiniteNumber(raw.evalAfter);
  const cpLoss = normalizeNonNegativeNumber(raw.cpLoss);
  const classification = normalizeMoveClassification(raw.classification);
  const fenAfterUserMove =
    typeof raw.fenAfterUserMove === "string" ? raw.fenAfterUserMove : "";
  const fenAfterEngineMove =
    typeof raw.fenAfterEngineMove === "string" ? raw.fenAfterEngineMove : null;
  const phase = typeof raw.phase === "string" && raw.phase.length > 0 ? raw.phase : "unknown";
  const bucket = typeof raw.bucket === "string" && raw.bucket.length > 0 ? raw.bucket : "wildcard";
  const clusterId =
    typeof raw.clusterId === "string" && raw.clusterId.length > 0
      ? raw.clusterId
      : `app:v1:${normalizeClusterPart(phase)}:${normalizeClusterPart(bucket)}`;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  if (!decisionFen) return null;
  if (!userMoveSan || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(userMoveUci)) return null;
  if (evalBefore === null) return null;
  if (evalAfter === null) return null;
  if (cpLoss === null) return null;
  if (!classification) return null;
  if (!fenAfterUserMove) return null;

  return {
    index: expectedIndex,
    decisionFen,
    userMove: {
      san: userMoveSan,
      uci: userMoveUci,
    },
    evalBefore: Math.round(evalBefore),
    evalAfter: Math.round(evalAfter),
    mateBefore: normalizeOptionalMate(raw.mateBefore),
    mateAfter: normalizeOptionalMate(raw.mateAfter),
    cpLoss: Math.round(cpLoss),
    classification,
    banditResult: normalizeBanditResult(raw.banditResult) ?? getBanditResult(classification),
    fenAfterUserMove,
    fenAfterEngineMove,
    phase,
    bucket,
    clusterId,
    tags,
  };
}

function normalizeMoveClassification(value: unknown): MoveClassification | null {
  if (
    value === "brilliant" ||
    value === "critical" ||
    value === "best" ||
    value === "excellent" ||
    value === "good" ||
    value === "okay" ||
    value === "inaccuracy" ||
    value === "mistake" ||
    value === "blunder"
  ) {
    return value;
  }
  return null;
}

function normalizeBanditResult(value: unknown): "success" | "neutral" | "failure" | null {
  if (value === "success" || value === "neutral" || value === "failure") return value;
  return null;
}

function normalizeOptionalMate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function buildValidPrecomputedEvaluationMap({
  rawEvaluations,
  maxUserMoveCount,
}: {
  rawEvaluations: unknown;
  maxUserMoveCount: number;
}) {
  const byIndex = new Map<number, {
    moveScore: SequenceEvaluationResult["moveScores"][number];
    positionEvaluation: PositionEvaluation;
  }>();

  if (!Array.isArray(rawEvaluations)) return byIndex;

  for (const raw of rawEvaluations as PrecomputedEvaluationPayload[]) {
    if (!isRecord(raw)) continue;

    const rawIndex = raw.userMoveIndex;
    const userMoveIndex =
      typeof rawIndex === "number" && Number.isInteger(rawIndex)
        ? rawIndex
        : null;

    if (userMoveIndex === null) continue;
    if (userMoveIndex < 0 || userMoveIndex >= maxUserMoveCount) continue;

    const moveScore = normalizePrecomputedMoveScore(raw.moveScore, userMoveIndex);
    const positionEvaluation = normalizePrecomputedPositionEvaluation(
      raw.positionEvaluation,
      userMoveIndex,
    );

    if (!moveScore || !positionEvaluation) continue;

    byIndex.set(userMoveIndex, { moveScore, positionEvaluation });
  }

  return byIndex;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function classifyCpLoss(cpLoss: number): MoveClassification {
  if (cpLoss <= 30) return "good";
  if (cpLoss <= 90) return "good";
  if (cpLoss <= 180) return "inaccuracy";
  if (cpLoss <= 320) return "mistake";
  return "blunder";
}

function getBanditResult(classification: MoveClassification): "success" | "neutral" | "failure" {
  if (classification === "brilliant" || classification === "critical" || classification === "best" || classification === "excellent" || classification === "good" || classification === "okay") return "success";
  if (classification === "inaccuracy") return "neutral";
  return "failure";
}

// ---------------------------------------------------------------------------
// Cluster stats helpers (Stage 1: build user signal for future corpus recommender)
// ---------------------------------------------------------------------------

type ClusterStatEntry = {
  attempts: number;
  successes: number;
  failures: number;
  neutralCount: number;
  posteriorAlpha: number;
  posteriorBeta: number;
  lastServedAt: string;
};

type ClusterStats = Record<string, ClusterStatEntry>;

function deriveAppClusterId({
  phase,
  bucket,
  tags,
  isTactic,
  openingName,
  eco,
}: {
  phase: string;
  bucket: string;
  tags?: string[] | null;
  isTactic?: boolean | null;
  openingName?: string | null;
  eco?: string | null;
}): string {
  const normalizedPhase = normalizeClusterPart(phase || "unknown");
  const normalizedBucket = normalizeClusterPart(bucket || "wildcard");
  const primaryKey = pickPrimaryClusterKey({
    phase: normalizedPhase,
    bucket: normalizedBucket,
    tags,
    isTactic,
    openingName,
    eco,
  });

  return primaryKey
    ? `app:v1:${normalizedPhase}:${normalizedBucket}:${primaryKey}`
    : `app:v1:${normalizedPhase}:${normalizedBucket}`;
}

function pickPrimaryClusterKey({
  phase,
  bucket,
  tags,
  isTactic,
  openingName,
  eco,
}: {
  phase: string;
  bucket: string;
  tags?: string[] | null;
  isTactic?: boolean | null;
  openingName?: string | null;
  eco?: string | null;
}): string | null {
  const normalizedEco = typeof eco === "string" ? normalizeEco(eco) : "";
  if (phase === "opening" && normalizedEco) return normalizedEco;

  const normalizedTags = (tags ?? []).map(normalizeClusterPart).filter(Boolean);

  const genericTags = new Set([
    "opening",
    "middlegame",
    "endgame",
    "unknown",
    "general",
  ]);

  const redundantTags = new Set([
    phase,
    bucket,
    bucket.replace(`${phase}_`, ""),
  ]);

  const usefulTag = normalizedTags.find((tag) => {
    if (!tag) return false;
    if (genericTags.has(tag)) return false;
    if (redundantTags.has(tag)) return false;
    return true;
  });

  if (usefulTag) return usefulTag;

  if (isTactic || bucket === "tactic") return "tactic";

  if (bucket === "opening_gambit") return "gambit";
  if (bucket === "opening_development") return "development";
  if (bucket === "middlegame_attack") return "attack";
  if (bucket === "middlegame_positional") return "positional";
  if (bucket === "endgame_rook") return "rook_endgame";
  if (bucket === "endgame_pawn") return "pawn_endgame";

  const normalizedOpening = typeof openingName === "string" ? normalizeClusterPart(openingName) : "";
  if (phase === "opening" && normalizedOpening && normalizedOpening.length <= 20) {
    return normalizedOpening;
  }

  return null;
}

function normalizeEco(value: string): string {
  const match = value.trim().toUpperCase().match(/^[A-E][0-9]{2}/);
  return match ? match[0].toLowerCase() : "";
}

function normalizeClusterPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function normalizeClusterStats(raw: unknown): ClusterStats {
  if (!raw || typeof raw !== "object") return {};
  const candidate = raw as Record<string, unknown>;
  const result: ClusterStats = {};
  for (const [key, entry] of Object.entries(candidate)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const attempts = typeof e.attempts === "number" && e.attempts >= 0 ? e.attempts : 0;
    const successes = typeof e.successes === "number" && e.successes >= 0 ? e.successes : 0;
    const failures = typeof e.failures === "number" && e.failures >= 0 ? e.failures : 0;
    const neutralCount = typeof e.neutralCount === "number" && e.neutralCount >= 0 ? e.neutralCount : 0;
    const posteriorAlpha = typeof e.posteriorAlpha === "number" && e.posteriorAlpha > 0 ? e.posteriorAlpha : 1;
    const posteriorBeta = typeof e.posteriorBeta === "number" && e.posteriorBeta > 0 ? e.posteriorBeta : 1;
    const lastServedAt = typeof e.lastServedAt === "string" ? e.lastServedAt : "";
    result[key] = { attempts, successes, failures, neutralCount, posteriorAlpha, posteriorBeta, lastServedAt };
  }
  return result;
}

/**
 * Update cluster_stats from a single session's position evaluations.
 * posteriorAlpha = failures + 1, posteriorBeta = successes + 1
 * (Beta distribution parameterized so higher alpha relative to beta = more weakness).
 */
function recordClusterResults(
  stats: ClusterStats,
  evaluations: PositionEvaluation[],
  nowIso: string,
): ClusterStats {
  const updated = { ...stats };
  const counts: Record<string, { successes: number; failures: number; neutralCount: number }> = {};
  for (const ev of evaluations) {
    const cid = ev.clusterId;
    if (!cid) continue;
    if (!counts[cid]) counts[cid] = { successes: 0, failures: 0, neutralCount: 0 };
    if (ev.banditResult === "success") counts[cid].successes++;
    else if (ev.banditResult === "failure") counts[cid].failures++;
    else counts[cid].neutralCount++;
  }
  for (const [cid, delta] of Object.entries(counts)) {
    const existing = updated[cid] ?? {
      attempts: 0,
      successes: 0,
      failures: 0,
      neutralCount: 0,
      posteriorAlpha: 1,
      posteriorBeta: 1,
      lastServedAt: "",
    };
    const attempts = existing.attempts + delta.successes + delta.failures + delta.neutralCount;
    const successes = existing.successes + delta.successes;
    const failures = existing.failures + delta.failures;
    const neutralCount = existing.neutralCount + delta.neutralCount;
    updated[cid] = {
      attempts,
      successes,
      failures,
      neutralCount,
      posteriorAlpha: failures + 1,
      posteriorBeta: successes + 1,
      lastServedAt: nowIso,
    };
  }
  return updated;
}

/**
 * Build the updated recent_clusters array from a session's evaluations.
 * New cluster IDs from this session are prepended, duplicates removed,
 * and the list is trimmed to `limit` entries.
 */
function updateRecentClusters(raw: unknown, evaluations: PositionEvaluation[], limit = 20): string[] {
  const existing: string[] = Array.isArray(raw) ? (raw as string[]) : [];
  const newIds = evaluations
    .map((ev) => ev.clusterId)
    .filter((cid): cid is string => !!cid);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of newIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  for (const id of existing) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Profile access
// ---------------------------------------------------------------------------

async function getOrCreateProfile(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_blindspot_profile")
    .select("user_id, blindspots_elo, rating_deviation, initial_skill_level, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue, recent_served_fens, bucket_stats, recent_served_modes, cluster_stats, recent_clusters")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Blindspots profile: ${error.message}`);
  }

  if (data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from("user_blindspot_profile")
    .insert({
      ...buildDefaultBlindspotProfile(userId),
    })
    .select("user_id, blindspots_elo, rating_deviation, initial_skill_level, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue, recent_served_fens, bucket_stats, recent_served_modes, cluster_stats, recent_clusters")
    .single();

  if (insertError) {
    throw new Error(`Failed to create Blindspots profile: ${insertError.message}`);
  }

  return inserted;
}

function normalizeMoves(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((move: SequenceMove) => {
    const san = typeof move?.san === "string" ? move.san : "";
    const uci = typeof move?.uci === "string" ? move.uci : "";
    const side = typeof move?.side === "string" ? move.side : "";
    return san && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)
      ? [{ san, uci, side }]
      : [];
  });
}

function normalizeSequenceLength(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SEQUENCE_LENGTH;
  return Math.max(MIN_SEQUENCE_LENGTH, Math.min(MAX_SEQUENCE_LENGTH, Math.round(parsed)));
}

function normalizeTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : null;
}

function normalizeOptionalNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isValidFen(fen: string) {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}
