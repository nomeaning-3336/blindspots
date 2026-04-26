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
} from "@/lib/training/elo";

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
};

type MoveClassification = "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as CompleteSequencePayload | null;
  const startingFen = typeof payload?.startingFen === "string" ? payload.startingFen : "";
  const moves = normalizeMoves(payload?.moves);

  if (!isValidFen(startingFen) || moves.length === 0) {
    return NextResponse.json({ error: "Invalid sequence." }, { status: 400 });
  }

  const sequenceLength = normalizeSequenceLength(payload?.sequenceLength);
  const reflectionNote = typeof payload?.reflectionNote === "string" ? payload.reflectionNote : null;
  const profile = await getOrCreateProfile(userId);
  const sequenceEvaluation = await calculateSequenceEvaluation(startingFen, moves);
  const evalPreservationScore = sequenceEvaluation.evalPreservationScore;
  const eloUpdate = calculateEloUpdate({
    currentElo: profile.blindspots_elo,
    totalSequences: profile.total_sequences,
    evalPreservationScore,
    totalCpLoss: sequenceEvaluation.totalCpLoss,
  });

  const fallbackOpponentElo = getOpponentElo(profile.blindspots_elo);
  const fallbackExpectedScore = calculateExpectedScore(profile.blindspots_elo, fallbackOpponentElo);
  const kFactor = eloUpdate?.kFactor ?? getKFactor(profile.total_sequences);
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
  });

  const { error: profileError } = await supabase
    .from("user_blindspot_profile")
    .update({
      blindspots_elo: eloAfter,
      total_sequences: profile.total_sequences + 1,
      last_session_at: completedAt,
      exploit_queue: queues.exploitQueue as unknown as Json,
      explore_queue: queues.exploreQueue as unknown as Json,
      revisit_queue: queues.revisitQueue as unknown as Json,
      mastered_queue: queues.masteredQueue as unknown as Json,
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
    },
  });
}

async function calculateSequenceEvaluation(startingFen: string, moves: Array<{ san: string; uci: string; side: string }>) {
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

  for (const move of moves) {
    const isUserMove = chess.turn() === userColor;
    const evalBefore = isUserMove ? await getPositionEval(chess.fen()) : null;
    const played = chess.move({
      from: move.uci.slice(0, 2),
      to: move.uci.slice(2, 4),
      promotion: move.uci[4],
    });
    if (!played) break;

    if (isUserMove) {
      const evalAfter = await getPositionEval(chess.fen());
      const beforeUserEval = userColor === "w" ? evalBefore!.cp : -evalBefore!.cp;
      const afterUserEval = userColor === "w" ? evalAfter.cp : -evalAfter.cp;
      const cpLoss = Math.max(0, Math.round(beforeUserEval - afterUserEval));
      totalCpLoss += cpLoss;
      moveScores.push({
        userMoveIndex: userMoveCount,
        cpLoss,
        evalBefore: Math.round(beforeUserEval),
        evalAfter: Math.round(afterUserEval),
        classification: classifyCpLoss(cpLoss),
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
  };
}

function classifyCpLoss(cpLoss: number): MoveClassification {
  if (cpLoss <= 30) return "excellent";
  if (cpLoss <= 90) return "good";
  if (cpLoss <= 180) return "inaccuracy";
  if (cpLoss <= 320) return "mistake";
  return "blunder";
}

async function getOrCreateProfile(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_blindspot_profile")
    .select("user_id, blindspots_elo, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue, recent_served_fens")
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
      blindspots_elo: 1200,
      total_sequences: 0,
      initialization_status: "skipped",
      profile_initialized: false,
      exploit_queue: [],
      explore_queue: [],
      revisit_queue: [],
      mastered_queue: [],
      recent_served_fens: [],
    })
    .select("user_id, blindspots_elo, total_sequences, exploit_queue, explore_queue, revisit_queue, mastered_queue, recent_served_fens")
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

function isValidFen(fen: string) {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}
