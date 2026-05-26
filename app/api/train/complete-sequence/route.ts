import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getPositionEval } from "@/lib/engines/dispatcher";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database";
import {
  calculateEloUpdate,
  calculateMatchedEngineCplEloUpdate,
  calculateExpectedScore,
  getKFactor,
  getOpponentElo,
  normalizeRatingDeviation,
  type CplAnalyzedMove,
} from "@/lib/training/elo";
import { classifyTrainingBucket, classifyTrainingPhase } from "@/lib/training/position-metadata";
import {
  classifyReviewedMoveOutcome,
  classifyTrainingOutcome,
} from "@/lib/training/mistake-srs";
import {
  ActiveSessionError,
  getActiveTrainingSessionById,
} from "@/lib/training/active-session-store";
import { mineMistakesFromSequence } from "@/lib/training/mistake-mining-persistence";
import type { MineableMoveInput } from "@/lib/training/mistake-mining";
import { buildDefaultBlindspotProfile } from "@/lib/training/default-profile";
import { normalizeDecisionFen } from "@/lib/training/mistake-memory";
import { normalizeReviewGradingConfig } from "@/lib/training/training-preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SEQUENCE_LENGTH = 4;
const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;
const COMPLETE_SEQUENCE_MISSING_EVAL_TIME_LIMIT_MS = 500;
const MAX_CP_DELTA = 600;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type CompleteSequencePayload = {
  sessionId?: unknown;
  onboardingCheckpoint?: unknown;
  reflectionNote?: unknown;
};

type StoredCompletedSessionResult = {
  id: string;
  eval_preservation_score: number | null;
  position_evaluations: Json;
  elo_before: number;
  elo_after: number;
  elo_delta: number;
  k_factor: number;
  opponent_elo: number;
  expected_score: number;
  actual_score: number;
  training_outcome: "pass" | "acceptable" | "fail";
  average_cp_loss: number;
  max_single_cp_loss: number;
};

async function getStoredCompletedSessionResult(input: {
  userId: string;
  sessionId: unknown;
}): Promise<StoredCompletedSessionResult | null> {
  if (typeof input.sessionId !== "string" || input.sessionId.length === 0) {
    return null;
  }

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("training_sessions" as any)
    .select(
      "id, eval_preservation_score, position_evaluations, elo_before, elo_after, elo_delta, k_factor, opponent_elo, expected_score, actual_score, training_outcome, average_cp_loss, max_single_cp_loss",
    )
    .eq("id", input.sessionId)
    .eq("user_id", input.userId)
    .not("completed_at", "is", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load completed training session: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as Record<string, unknown>;

  if (
    typeof row.id !== "string" ||
    (row.eval_preservation_score !== null &&
      typeof row.eval_preservation_score !== "number") ||
    typeof row.elo_before !== "number" ||
    typeof row.elo_after !== "number" ||
    typeof row.elo_delta !== "number" ||
    typeof row.k_factor !== "number" ||
    typeof row.opponent_elo !== "number" ||
    typeof row.expected_score !== "number" ||
    typeof row.actual_score !== "number" ||
    (row.training_outcome !== "pass" &&
      row.training_outcome !== "acceptable" &&
      row.training_outcome !== "fail") ||
    typeof row.average_cp_loss !== "number" ||
    typeof row.max_single_cp_loss !== "number"
  ) {
    throw new Error("Stored completed training session result is invalid.");
  }

  return {
    id: row.id,
    eval_preservation_score: row.eval_preservation_score as number | null,
    position_evaluations: (row.position_evaluations ?? []) as Json,
    elo_before: row.elo_before,
    elo_after: row.elo_after,
    elo_delta: row.elo_delta,
    k_factor: row.k_factor,
    opponent_elo: row.opponent_elo,
    expected_score: row.expected_score,
    actual_score: row.actual_score,
    training_outcome: row.training_outcome,
    average_cp_loss: row.average_cp_loss,
    max_single_cp_loss: row.max_single_cp_loss,
  };
}

function buildStoredCompletionResponse(result: StoredCompletedSessionResult) {
  return NextResponse.json({
    ok: true,
    sessionId: result.id,
    evalPreservationScore: result.eval_preservation_score,
    moveScores: [],
    positionEvaluations: result.position_evaluations,
    elo: {
      eloBefore: result.elo_before,
      eloAfter: result.elo_after,
      eloDelta: result.elo_delta,
      kFactor: result.k_factor,
      opponentElo: result.opponent_elo,
      expectedScore: result.expected_score,
      actualScore: result.actual_score,
      rawDelta: 0,
      clampedDelta: result.elo_delta,
      skipped: result.eval_preservation_score === null,
      ratingDeviationBefore: null,
      ratingDeviationAfter: null,
      humanAvgCpl: null,
      engineAvgCpl: null,
      cplDiff: null,
      ratingMethod: "stored",
    },
    trainingOutcome: result.training_outcome,
    averageCpLoss: result.average_cp_loss,
    maxSingleCpLoss: result.max_single_cp_loss,
    recoveredCompletion: true,
  });
}

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
  averageCpDelta: number | null;
  worstCpDelta: number | null;
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
  let activeSession;

  try {
    activeSession = await getActiveTrainingSessionById({
      userId,
      sessionId: payload?.sessionId,
    });
  } catch (error) {
    if (error instanceof ActiveSessionError && error.status === 404) {
      const completedResult = await getStoredCompletedSessionResult({
        userId,
        sessionId: payload?.sessionId,
      });

      if (completedResult) {
        return buildStoredCompletionResponse(completedResult);
      }
    }

    if (error instanceof ActiveSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }

  const candidateMetadata = isRecord(activeSession.candidateMetadata) ? activeSession.candidateMetadata : {};

  const startingFen = activeSession.startingFen;
  const moves = activeSession.moves;
  const selectedPhase =
    typeof candidateMetadata.selectedPhase === "string"
      ? candidateMetadata.selectedPhase
      : null;
  const selectedTags = normalizeTags(candidateMetadata.tags);
  const selectedIsTactic = selectedPhase === "tactic";
  const selectedOpeningName =
    typeof candidateMetadata.openingName === "string"
      ? candidateMetadata.openingName
      : null;
  const selectedEco =
    typeof candidateMetadata.eco === "string"
      ? candidateMetadata.eco
      : null;
  const selectedBucket = classifyTrainingBucket({
    fen: startingFen,
    phase: selectedPhase as "opening" | "middlegame" | "endgame" | "tactic" | "unknown" | undefined,
  });

  if (!isValidFen(startingFen) || moves.length === 0) {
    return NextResponse.json({ error: "Invalid sequence." }, { status: 400 });
  }

  const sequenceLength = countUserMovesInSequence(startingFen, moves);
  const reflectionNote = typeof payload?.reflectionNote === "string" ? payload.reflectionNote : null;
  const precomputedInputCount = 0;

  const profileStartedAt = Date.now();
  const profile = await getOrCreateProfile(userId);
  const profileMs = Date.now() - profileStartedAt;

  const usedPrecomputedEvaluations = false;
  const usedPartialPrecomputedEvaluations = false;
  const evaluationStartedAt = Date.now();
  const sequenceEvaluation = await calculateSequenceEvaluation({
    startingFen,
    moves,
    selectedBucket,
    selectedPhase,
    selectedTags,
    selectedIsTactic,
    selectedOpeningName,
    selectedEco,
    rawPrecomputedEvaluations: undefined,
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
  const reviewedMoveScore = sequenceEvaluation.moveScores[0] ?? null;
  const reviewGradingConfig = normalizeReviewGradingConfig(
    (profile as { review_grading_config?: unknown }).review_grading_config,
  );
  const reviewOutcome = reviewedMoveScore
    ? classifyReviewedMoveOutcome({
        cpLoss: reviewedMoveScore.cpLoss,
        config: reviewGradingConfig,
      })
    : trainingOutcome;
  const reviewedMoveCpLoss = reviewedMoveScore?.cpLoss ?? null;

  const humanRatingMoves = buildHumanRatingMoves(sequenceEvaluation.positionEvaluations);
  const engineRatingMoves = humanRatingMoves.length >= 4
    ? await calculateEngineRatingMoves({
        startingFen,
        moves,
      })
    : [];
  const cplEloUpdate = calculateMatchedEngineCplEloUpdate({
    userEloAtGameStart: profile.blindspots_elo,
    ratingDeviation: profileRatingDeviation,
    totalSequences: profile.total_sequences,
    humanMoves: humanRatingMoves,
    engineMoves: engineRatingMoves,
  });

  const legacyEloUpdate = calculateEloUpdate({
    currentElo: profile.blindspots_elo,
    ratingDeviation: profileRatingDeviation,
    totalSequences: profile.total_sequences,
    evalPreservationScore,
    totalCpLoss: sequenceEvaluation.totalCpLoss,
    opponentElo: profile.blindspots_elo,
    averageCpDelta: sequenceEvaluation.averageCpDelta,
    worstCpDelta: sequenceEvaluation.worstCpDelta,
  });
  const eloUpdate = cplEloUpdate ?? legacyEloUpdate;

  const fallbackOpponentElo = eloUpdate?.opponentElo ?? getOpponentElo(profile.blindspots_elo);
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
  const finalizationStartedAt = Date.now();
  const { data: finalizedSessionId, error: finalizationError } = await supabase.rpc(
    "finalize_training_session_atomic",
    {
      p_user_id: userId,
      p_session_id: activeSession.id,
      p_evaluated_moves: moves as unknown as Json,
      p_eval_preservation_score: evalPreservationScore,
      p_sequence_length: sequenceLength,
      p_reflection_note: reflectionNote,
      p_completed_at: completedAt,
      p_elo_before: eloBefore,
      p_elo_after: eloAfter,
      p_elo_delta: eloDelta,
      p_k_factor: kFactor,
      p_opponent_elo: opponentElo,
      p_expected_score: expectedScore,
      p_actual_score: actualScore,
      p_position_evaluations: sequenceEvaluation.positionEvaluations as unknown as Json,
      p_training_outcome: trainingOutcome,
      p_review_outcome: reviewOutcome,
      p_average_cp_loss: averageCpLoss,
      p_max_single_cp_loss: maxSingleCpLoss,
      p_rating_deviation_after: eloUpdate?.ratingDeviationAfter ?? profileRatingDeviation,
    },
  );

  if (finalizationError) {
    if (finalizationError.message.includes("Training session is already completed.")) {
      const completedResult = await getStoredCompletedSessionResult({
        userId,
        sessionId: activeSession.id,
      });

      if (completedResult) {
        return buildStoredCompletionResponse(completedResult);
      }

      return NextResponse.json(
        { error: "The active sequence was already completed. Reload the current session." },
        { status: 409 },
      );
    }

    if (finalizationError.message.includes("Active training session changed before completion.")) {
      return NextResponse.json(
        { error: "The active sequence changed before completion. Reload the current session." },
        { status: 409 },
      );
    }

    throw new Error(`Failed to finalize training session: ${finalizationError.message}`);
  }

  if (typeof finalizedSessionId !== "string") {
    throw new Error("Failed to finalize training session: no session ID returned.");
  }

  const finalizationMs = Date.now() - finalizationStartedAt;

  // Fire-and-forget mining of app-native active mistakes — never blocks response.
  const initialPreviousFen: string | null = null;
  const initialPlayedMove: string | null = null;

  if (shouldPersistTrainingTourCheckpoint(payload?.onboardingCheckpoint)) {
    try {
      await persistTrainingTourCheckpoint({
        userId,
        sessionId: finalizedSessionId,
        startingFen,
        moves,
        sequenceLength,
        previousFen: initialPreviousFen,
        playedMove: initialPlayedMove,
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
          humanAvgCpl: eloUpdate?.humanAvgCpl ?? null,
          engineAvgCpl: eloUpdate?.engineAvgCpl ?? null,
          cplDiff: eloUpdate?.cplDiff ?? null,
          ratingMethod: eloUpdate?.ratingMethod ?? "legacy",
        },
        trainingOutcome,
        averageCpLoss,
        maxSingleCpLoss,
      });
    } catch (checkpointError) {
      console.error("[complete-sequence] onboarding checkpoint persistence failed", checkpointError);
    }
  }

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
  // Automatic mistake mining is disabled — users opt-in via the
  // "Add Position to Learning Queue" button in the post-mortem screen
  // to avoid cascading-mistake noise in the review queue.
  void minedMistakesInput;

  // Persist mistake attempts — best-effort, never blocks the response.
  persistMistakeAttempts(userId, sequenceEvaluation.positionEvaluations).catch((err) => {
    console.error("[complete-sequence] attempt persistence failed", err);
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[complete-sequence:done]", {
      path: "active-session",
      usedPrecomputedEvaluations,
      usedPartialPrecomputedEvaluations,
      precomputedInputCount,
      profileMs,
      evaluationMs,
      finalizationMs,
      totalMs: Date.now() - requestStartedAt,
    });
  }

  return NextResponse.json({
    ok: true,
    sessionId: finalizedSessionId,
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
      humanAvgCpl: eloUpdate?.humanAvgCpl ?? null,
      engineAvgCpl: eloUpdate?.engineAvgCpl ?? null,
      cplDiff: eloUpdate?.cplDiff ?? null,
      ratingMethod: eloUpdate?.ratingMethod ?? "legacy",
    },
    trainingOutcome,
    averageCpLoss,
    maxSingleCpLoss,
  });
}

function buildHumanRatingMoves(positionEvaluations: PositionEvaluation[]): CplAnalyzedMove[] {
  return positionEvaluations.flatMap((positionEvaluation) => {
    const sideToMove = sideToMoveFromFen(positionEvaluation.decisionFen);
    if (!sideToMove) return [];

    return [{
      sideToMove,
      bestEvalCp: positionEvaluation.evalBefore,
      playedEvalCp: positionEvaluation.evalAfter,
    }];
  });
}

async function calculateEngineRatingMoves({
  startingFen,
  moves,
}: {
  startingFen: string;
  moves: Array<{ san: string; uci: string; side: string }>;
}): Promise<CplAnalyzedMove[]> {
  const chess = new Chess(startingFen);
  const userColor = chess.turn();
  const analyzedMoves: CplAnalyzedMove[] = [];

  for (const move of moves) {
    const sideToMove = chess.turn();
    const isEngineMove = sideToMove !== userColor;
    const decisionFen = chess.fen();
    const evalBefore = isEngineMove
      ? await getPositionEval(decisionFen, {
          timeLimitMs: COMPLETE_SEQUENCE_MISSING_EVAL_TIME_LIMIT_MS,
        }).catch(() => null)
      : null;

    const played = chess.move({
      from: move.uci.slice(0, 2),
      to: move.uci.slice(2, 4),
      promotion: move.uci[4],
    });
    if (!played) break;

    if (!isEngineMove || !evalBefore) continue;

    const evalAfter = await getPositionEval(chess.fen(), {
      timeLimitMs: COMPLETE_SEQUENCE_MISSING_EVAL_TIME_LIMIT_MS,
    }).catch(() => null);
    if (!evalAfter) continue;

    analyzedMoves.push({
      sideToMove,
      bestEvalCp: Math.round(evalBefore.cp),
      playedEvalCp: Math.round(evalAfter.cp),
    });
  }

  return analyzedMoves;
}

function sideToMoveFromFen(fen: string): "w" | "b" | null {
  const side = fen.split(/\s+/)[1];
  return side === "w" || side === "b" ? side : null;
}

function cpDeltaForRatingMove({
  decisionFen,
  evalBefore,
  evalAfter,
}: {
  decisionFen: string;
  evalBefore: number;
  evalAfter: number;
}) {
  const sideToMove = sideToMoveFromFen(decisionFen);
  const sideBefore = sideToMove === "b" ? -evalBefore : evalBefore;
  const sideAfter = sideToMove === "b" ? -evalAfter : evalAfter;
  return clamp(Math.round(sideBefore - sideAfter), -MAX_CP_DELTA, MAX_CP_DELTA);
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
  const cappedCpDeltas: number[] = [];
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
        cappedCpDeltas.push(cpDeltaForRatingMove({
          decisionFen: precomputedEntry.positionEvaluation.decisionFen,
          evalBefore: precomputedEntry.moveScore.evalBefore,
          evalAfter: precomputedEntry.moveScore.evalAfter,
        }));
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
          evalBefore: Math.round(evalBefore?.cp ?? evalBeforeCp),
          evalAfter: mateCpForWinningSide(userColor),
          mateBefore: mateBeforeVal,
          mateAfter: 0,
          classification,
        });
        cappedCpDeltas.push(clamp(evalBeforeCp - mateCpForWinningSide(userColor), -MAX_CP_DELTA, MAX_CP_DELTA));
        const checkmatePhase = selectedPhase ?? classifyTrainingPhase(fenAfterMove);
        positionEvaluations.push({
          index: userMoveCount,
          decisionFen,
          userMove: { san: move.san, uci: move.uci },
          evalBefore: Math.round(evalBefore?.cp ?? evalBeforeCp),
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
      cappedCpDeltas.push(clamp(Math.round(evalBeforeCp - afterUserEval), -MAX_CP_DELTA, MAX_CP_DELTA));
      totalCpLoss += cpLoss;
      const classification = classifyCpLoss(cpLoss);
      const mateBeforeVal = evalBefore?.mate ?? null;
      const mateAfterVal = evalAfter.mate ?? null;
      moveScores.push({
        userMoveIndex: userMoveCount,
        cpLoss,
        evalBefore: Math.round(evalBefore?.cp ?? evalBeforeCp),
        evalAfter: Math.round(evalAfter.cp),
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
        evalBefore: Math.round(evalBefore?.cp ?? evalBeforeCp),
        evalAfter: Math.round(evalAfter.cp),
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

  const anyCheckmateDelivered = moveScores.some((s) => s.mateAfter === 0 && s.mateBefore != null);
  const gated = userMoveCount < 2 && !anyCheckmateDelivered;
  return {
    evalPreservationScore:
      gated
        ? null
        : Math.max(0, Math.min(1, 1 - totalCpLoss / (Math.max(1, userMoveCount) * 100))),
    moveScores,
    totalCpLoss,
    positionEvaluations,
    averageCpDelta: gated
      ? null
      : cappedCpDeltas.length > 0
        ? cappedCpDeltas.reduce((a, b) => a + b, 0) / cappedCpDeltas.length
        : 0,
    worstCpDelta: gated
      ? null
      : cappedCpDeltas.length > 0
        ? Math.max(...cappedCpDeltas)
        : 0,
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

  const cappedCpDeltasPrecomputed = moveScores.map((moveScore, index) => cpDeltaForRatingMove({
    decisionFen: positionEvaluations[index]?.decisionFen ?? startingFen,
    evalBefore: moveScore.evalBefore,
    evalAfter: moveScore.evalAfter,
  }));

  return {
    evalPreservationScore:
      expectedUserMoveCount < 2
        ? null
        : Math.max(0, Math.min(1, 1 - totalCpLoss / (expectedUserMoveCount * 100))),
    moveScores,
    totalCpLoss,
    positionEvaluations,
    averageCpDelta: expectedUserMoveCount < 2
      ? null
      : cappedCpDeltasPrecomputed.length > 0
        ? cappedCpDeltasPrecomputed.reduce((a, b) => a + b, 0) / cappedCpDeltasPrecomputed.length
        : 0,
    worstCpDelta: expectedUserMoveCount < 2
      ? null
      : cappedCpDeltasPrecomputed.length > 0
        ? Math.max(...cappedCpDeltasPrecomputed)
        : 0,
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
  const { data, error } = await (supabase
    .from("user_blindspot_profile") as any)
    .select("user_id, blindspots_elo, rating_deviation, initial_skill_level, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue, recent_served_fens, bucket_stats, recent_served_modes, cluster_stats, recent_clusters, review_grading_level, review_grading_config")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Blindspots profile: ${error.message}`);
  }

  if (data) return data;

  const { data: inserted, error: insertError } = await (supabase
    .from("user_blindspot_profile") as any)
    .insert({
      ...buildDefaultBlindspotProfile(userId),
    })
    .select("user_id, blindspots_elo, rating_deviation, initial_skill_level, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue, recent_served_fens, bucket_stats, recent_served_modes, cluster_stats, recent_clusters, review_grading_level, review_grading_config")
    .single();

  if (insertError) {
    throw new Error(`Failed to create Blindspots profile: ${insertError.message}`);
  }

  return inserted;
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

const BAD_CLASSIFICATIONS = new Set(["inaccuracy", "mistake", "blunder"]);

const CLASSIFICATION_SEVERITY: Record<string, number> = {
  inaccuracy: 1,
  mistake: 2,
  blunder: 3,
};

function worseClassification(a: string, b: string): string {
  return (CLASSIFICATION_SEVERITY[a] ?? 0) >= (CLASSIFICATION_SEVERITY[b] ?? 0) ? a : b;
}

async function persistMistakeAttempts(
  userId: string,
  positionEvaluations: PositionEvaluation[],
) {
  const supabase = getSupabaseAdminClient();

  for (const pe of positionEvaluations) {
    const decisionFen = normalizeDecisionFen(pe.decisionFen);
    if (!decisionFen) continue;
    const moveUci = pe.userMove.uci;
    const classification = pe.classification as string;

    if (BAD_CLASSIFICATIONS.has(classification)) {
      // Un-resolve all prior rows at this FEN so old mistakes re-surface
      await supabase
        .from("user_mistake_attempts" as any)
        .update({ resolved_at: null })
        .eq("user_id", userId)
        .eq("decision_fen", decisionFen)
        .not("resolved_at", "is", null);

      const { data: existingRow } = await supabase
        .from("user_mistake_attempts" as any)
        .select("id, cp_loss, classification")
        .eq("user_id", userId)
        .eq("decision_fen", decisionFen)
        .eq("move_uci", moveUci)
        .maybeSingle();

      const existing = existingRow as any;

      await supabase
        .from("user_mistake_attempts" as any)
        .upsert(
          {
            user_id: userId,
            decision_fen: decisionFen,
            move_uci: moveUci,
            move_san: pe.userMove.san,
            classification: existing
              ? worseClassification(existing.classification, classification)
              : classification,
            cp_loss: existing
              ? Math.max(existing.cp_loss ?? 0, pe.cpLoss)
              : pe.cpLoss,
            played_at: new Date().toISOString(),
            resolved_at: null,
          },
          { onConflict: "user_id, decision_fen, move_uci" },
        );
    } else {
      // Good move — resolve all open entries at this FEN
      await supabase
        .from("user_mistake_attempts" as any)
        .update({ resolved_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("decision_fen", decisionFen)
        .is("resolved_at", null);
    }
  }
}

function shouldPersistTrainingTourCheckpoint(value: unknown) {
  return value === "postmortem_elo";
}

async function persistTrainingTourCheckpoint(input: {
  userId: string;
  sessionId: string;
  startingFen: string;
  moves: Array<{ san: string; uci: string; side: string }>;
  sequenceLength: number;
  previousFen: string | null;
  playedMove: string | null;
  moveScores: SequenceEvaluationResult["moveScores"];
  positionEvaluations: PositionEvaluation[];
  elo: Record<string, unknown>;
  trainingOutcome: string;
  averageCpLoss: number;
  maxSingleCpLoss: number;
}) {
  const supabase = getSupabaseAdminClient();

  const { data: existing, error: loadError } = await supabase
    .from("user_onboarding_state")
    .select("training_onboarding_completed_at")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (loadError) {
    console.error("[training-tour-checkpoint] failed to load onboarding state", loadError);
    return;
  }

  if (existing?.training_onboarding_completed_at) {
    return;
  }

  const checkpoint = {
    type: "postmortem_elo",
    createdAt: new Date().toISOString(),
    sessionId: input.sessionId,
    startingFen: input.startingFen,
    sequenceLength: input.sequenceLength,
    previousFen: input.previousFen,
    playedMove: input.playedMove,
    moves: input.moves,
    moveScores: input.moveScores,
    positionEvaluations: input.positionEvaluations,
    elo: input.elo,
    trainingOutcome: input.trainingOutcome,
    averageCpLoss: input.averageCpLoss,
    maxSingleCpLoss: input.maxSingleCpLoss,
  };

  const { error } = await (supabase
    .from("user_onboarding_state") as any)
    .upsert(
      {
        user_id: input.userId,
        training_tour_checkpoint: checkpoint,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[training-tour-checkpoint] failed to persist checkpoint", error);
  }
}
