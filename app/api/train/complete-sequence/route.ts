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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SEQUENCE_LENGTH = 4;
const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;

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
};

type MoveClassification = "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

type PositionEvaluation = {
  index: number;
  decisionFen: string;
  userMove: {
    san: string;
    uci: string;
  };
  evalBefore: number;
  evalAfter: number;
  cpLoss: number;
  classification: MoveClassification;
  banditResult: "success" | "neutral" | "failure";
  fenAfterUserMove: string;
  fenAfterEngineMove: string | null;
  phase: string;
  bucket: string;
  tags: string[];
};

type SequenceEvaluationResult = {
  evalPreservationScore: number | null;
  moveScores: Array<{
    userMoveIndex: number;
    cpLoss: number;
    evalBefore: number;
    evalAfter: number;
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
  return "excellent";
}

export async function POST(request: Request) {
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

  const sequenceLength = normalizeSequenceLength(payload?.sequenceLength);
  const reflectionNote = typeof payload?.reflectionNote === "string" ? payload.reflectionNote : null;
  const challengeElo = normalizeOptionalNumber(payload?.challengeElo);
  const profile = await getOrCreateProfile(userId);
  const sequenceEvaluation = await calculateSequenceEvaluation(startingFen, moves, selectedBucket, selectedPhase, selectedTags);
  const evalPreservationScore = sequenceEvaluation.evalPreservationScore;
  const profileRatingDeviation = normalizeRatingDeviation(profile.rating_deviation);

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
    })
    .select("id")
    .single();

  if (sessionError) {
    throw new Error(`Failed to save training session: ${sessionError.message}`);
  }

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
  });
}

async function calculateSequenceEvaluation(
  startingFen: string,
  moves: Array<{ san: string; uci: string; side: string }>,
  selectedBucket: string,
  selectedPhase: string | null,
  selectedTags: string[] | null,
) {
  const chess = new Chess(startingFen);
  const userColor = chess.turn();
  let userMoveCount = 0;
  let totalCpLoss = 0;
  const moveScores: Array<{
    userMoveIndex: number;
    cpLoss: number;
    evalBefore: number;
    evalAfter: number;
    classification: MoveClassification;
  }> = [];
  const positionEvaluations: PositionEvaluation[] = [];

  for (const move of moves) {
    const isUserMove = chess.turn() === userColor;
    const decisionFen = chess.fen();
    const evalBefore = isUserMove ? await getPositionEval(decisionFen) : null;
    const played = chess.move({
      from: move.uci.slice(0, 2),
      to: move.uci.slice(2, 4),
      promotion: move.uci[4],
    });
    if (!played) break;

    if (isUserMove) {
      const fenAfterMove = chess.fen();
      const evalBeforeCp = userColor === "w" ? evalBefore!.cp : -evalBefore!.cp;
      const userDeliveredCheckmate = isCheckmateFen(fenAfterMove);

      if (userDeliveredCheckmate) {
        const classification = classifyUserDeliveredCheckmate();
        moveScores.push({
          userMoveIndex: userMoveCount,
          cpLoss: 0,
          evalBefore: Math.round(evalBeforeCp),
          evalAfter: mateCpForWinningSide(userColor),
          classification,
        });
        positionEvaluations.push({
          index: userMoveCount,
          decisionFen,
          userMove: { san: move.san, uci: move.uci },
          evalBefore: Math.round(evalBeforeCp),
          evalAfter: mateCpForWinningSide(userColor),
          cpLoss: 0,
          classification,
          banditResult: "success",
          fenAfterUserMove: fenAfterMove,
          fenAfterEngineMove: null,
          phase: selectedPhase ?? classifyTrainingPhase(fenAfterMove),
          bucket: selectedBucket,
          tags: selectedTags ?? [],
        });
        userMoveCount += 1;
        continue;
      }

      const evalAfter = await getPositionEval(fenAfterMove);
      const afterUserEval = userColor === "w" ? evalAfter.cp : -evalAfter.cp;
      const cpLoss = Math.max(0, Math.round(evalBeforeCp - afterUserEval));
      totalCpLoss += cpLoss;
      const classification = classifyCpLoss(cpLoss);
      moveScores.push({
        userMoveIndex: userMoveCount,
        cpLoss,
        evalBefore: Math.round(evalBeforeCp),
        evalAfter: Math.round(afterUserEval),
        classification,
      });

      // Get engine reply if available (requires engine call; leave null for now)
      let fenAfterEngineMove: string | null = null;

      positionEvaluations.push({
        index: userMoveCount,
        decisionFen,
        userMove: { san: move.san, uci: move.uci },
        evalBefore: Math.round(evalBeforeCp),
        evalAfter: Math.round(afterUserEval),
        cpLoss,
        classification,
        banditResult: getBanditResult(classification),
        fenAfterUserMove: fenAfterMove,
        fenAfterEngineMove,
        phase: selectedPhase ?? classifyTrainingPhase(fenAfterMove),
        bucket: selectedBucket,
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

function classifyCpLoss(cpLoss: number): MoveClassification {
  if (cpLoss <= 30) return "excellent";
  if (cpLoss <= 90) return "good";
  if (cpLoss <= 180) return "inaccuracy";
  if (cpLoss <= 320) return "mistake";
  return "blunder";
}

function getBanditResult(classification: MoveClassification): "success" | "neutral" | "failure" {
  if (classification === "excellent" || classification === "good") return "success";
  if (classification === "inaccuracy") return "neutral";
  return "failure";
}

async function getOrCreateProfile(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_blindspot_profile")
    .select("user_id, blindspots_elo, rating_deviation, initial_skill_level, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue, recent_served_fens, bucket_stats, recent_served_modes")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Blindspots profile: ${error.message}`);
  }

  if (data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from("user_blindspot_profile")
    .insert({
      user_id: userId,
      blindspots_elo: 250,
      rating_deviation: 650,
      initial_skill_level: "beginner",
      total_sequences: 0,
      initialization_status: "skipped",
      profile_initialized: false,
      exploit_queue: [],
      explore_queue: [],
      revisit_queue: [],
      mastered_queue: [],
      recent_served_fens: [],
      recent_served_modes: [],
      bucket_stats: { opening: { alpha: 1, beta: 1, attempts: 0 }, middlegame: { alpha: 1, beta: 1, attempts: 0 }, endgame: { alpha: 1, beta: 1, attempts: 0 }, tactic: { alpha: 1, beta: 1, attempts: 0 }, opening_gambit: { alpha: 1, beta: 1, attempts: 0 }, opening_development: { alpha: 1, beta: 1, attempts: 0 }, middlegame_attack: { alpha: 1, beta: 1, attempts: 0 }, middlegame_positional: { alpha: 1, beta: 1, attempts: 0 }, endgame_rook: { alpha: 1, beta: 1, attempts: 0 }, endgame_pawn: { alpha: 1, beta: 1, attempts: 0 }, wildcard: { alpha: 1, beta: 1, attempts: 0 } },
    })
    .select("user_id, blindspots_elo, rating_deviation, initial_skill_level, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue, recent_served_fens, bucket_stats, recent_served_modes")
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
