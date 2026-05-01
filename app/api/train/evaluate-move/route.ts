import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getPositionEval, getLegalMoveLines } from "@/lib/engines/dispatcher";
import {
  classifyMoveAgainstBest,
  type MoveClassification,
} from "@/lib/move-classification";
import { classifyTrainingBucket, classifyTrainingPhase } from "@/lib/training/position-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MATE_VISUAL_CP = 10000;
const EVAL_TIME_LIMIT_MS = 1000;

type EvaluateMovePayload = {
  decisionFen?: unknown;
  uci?: unknown;
  san?: unknown;
  selectedBucket?: unknown;
  selectedPhase?: unknown;
  selectedTags?: unknown;
};

function comparableEval(line: { cp: number }, fen: string) {
  const cp = Math.max(-100000, Math.min(100000, Number(line.cp) || 0));
  return fen.split(/\s+/)[1] === "b" ? -cp : cp;
}

function getBanditResult(classification: MoveClassification): "success" | "neutral" | "failure" {
  if (
    classification === "best" ||
    classification === "critical" ||
    classification === "excellent" ||
    classification === "good"
  ) {
    return "success";
  }
  if (classification === "inaccuracy") return "neutral";
  return "failure";
}

function deriveCoarseClusterId(phase: string, bucket: string): string {
  return `app:v0:${phase}:${bucket}`;
}

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

function isValidFen(fen: string) {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as EvaluateMovePayload | null;

  const decisionFen = typeof payload?.decisionFen === "string" ? payload.decisionFen : "";
  const uci = typeof payload?.uci === "string" ? payload.uci : "";
  const san = typeof payload?.san === "string" ? payload.san : "";

  if (!isValidFen(decisionFen) || !uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    return NextResponse.json({ error: "Invalid move data." }, { status: 400 });
  }

  const selectedPhase =
    typeof payload?.selectedPhase === "string" ? payload.selectedPhase : null;
  const selectedBucket =
    typeof payload?.selectedBucket === "string" && payload.selectedBucket.length > 0
      ? payload.selectedBucket
      : classifyTrainingBucket({
          fen: decisionFen,
          phase: selectedPhase as "opening" | "middlegame" | "endgame" | "tactic" | "unknown" | undefined,
        });
  const selectedTags = normalizeTags(payload?.selectedTags);

  const chess = new Chess(decisionFen);
  const userColor = chess.turn();

  if (chess.turn() !== userColor) {
    return NextResponse.json({ error: "Not user's turn to move." }, { status: 400 });
  }

  const played = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  });
  if (!played) {
    return NextResponse.json({ error: "Illegal move." }, { status: 400 });
  }

  const fenAfterUserMove = chess.fen();

  if (isCheckmateFen(fenAfterUserMove)) {
    const classification: MoveClassification = "excellent";
    const evalBefore = await getPositionEval(decisionFen, { timeLimitMs: EVAL_TIME_LIMIT_MS });
    const evalBeforeSigned = userColor === "w" ? evalBefore.cp : -(evalBefore.cp);
    const phase = selectedPhase ?? classifyTrainingPhase(fenAfterUserMove);

    return NextResponse.json({
      ok: true,
      moveScore: {
        userMoveIndex: 0,
        cpLoss: 0,
        evalBefore: Math.round(evalBeforeSigned),
        evalAfter: mateCpForWinningSide(userColor),
        classification,
      },
      positionEvaluation: {
        decisionFen,
        userMove: { san, uci },
        evalBefore: Math.round(evalBeforeSigned),
        evalAfter: mateCpForWinningSide(userColor),
        cpLoss: 0,
        classification,
        banditResult: getBanditResult(classification),
        fenAfterUserMove,
        fenAfterEngineMove: null,
        phase,
        bucket: selectedBucket,
        clusterId: deriveCoarseClusterId(phase, selectedBucket),
        tags: selectedTags ?? [],
      },
    });
  }

  // Evaluate all legal moves from the decision position.
  let legalLines: Awaited<ReturnType<typeof getLegalMoveLines>> = [];
  try {
    legalLines = await getLegalMoveLines(decisionFen, {
      timeLimitMs: EVAL_TIME_LIMIT_MS,
    });
  } catch {
    legalLines = [];
  }

  const phase = selectedPhase ?? classifyTrainingPhase(fenAfterUserMove);

  // If legal-lines scan succeeded, score against the best line from the same FEN.
  if (legalLines.length > 0) {
    const sortedLines = [...legalLines].sort(
      (left, right) => comparableEval(right, decisionFen) - comparableEval(left, decisionFen),
    );
    const bestLine = sortedLines[0]!;
    const candidateLine = sortedLines.find((line) => line.bestMove === uci) ?? null;

    if (bestLine && candidateLine) {
      const rawEvalBefore = comparableEval(bestLine, decisionFen);
      const rawEvalAfter = comparableEval(candidateLine, decisionFen);
      const cpLoss = Math.max(0, Math.round(rawEvalBefore - rawEvalAfter));

      const classification =
        candidateLine.bestMove === bestLine.bestMove
          ? "best"
          : (classifyMoveAgainstBest(bestLine, candidateLine, decisionFen) ?? "good");

      return NextResponse.json({
        ok: true,
        moveScore: {
          userMoveIndex: 0,
          cpLoss,
          evalBefore: Math.round(rawEvalBefore),
          evalAfter: Math.round(rawEvalAfter),
          classification,
        },
        positionEvaluation: {
          decisionFen,
          userMove: { san, uci },
          evalBefore: Math.round(rawEvalBefore),
          evalAfter: Math.round(rawEvalAfter),
          cpLoss,
          classification,
          banditResult: getBanditResult(classification),
          fenAfterUserMove,
          fenAfterEngineMove: null,
          phase,
          bucket: selectedBucket,
          clusterId: deriveCoarseClusterId(phase, selectedBucket),
          tags: selectedTags ?? [],
        },
      });
    }
  }

  // Fallback: independent before/after eval (only when legal-lines scan is unavailable).
  const [evalBefore, evalAfter] = await Promise.all([
    getPositionEval(decisionFen, { timeLimitMs: EVAL_TIME_LIMIT_MS }),
    getPositionEval(fenAfterUserMove, { timeLimitMs: EVAL_TIME_LIMIT_MS }),
  ]);

  const evalBeforeSigned = userColor === "w" ? evalBefore.cp : -(evalBefore.cp);
  const evalAfterSigned = userColor === "w" ? evalAfter.cp : -(evalAfter.cp);
  const rawCpLoss = evalBeforeSigned - evalAfterSigned;
  const cpLoss = Math.max(0, Math.min(10000, Math.round(rawCpLoss)));
  const classification = classifyCpLoss(cpLoss);

  return NextResponse.json({
    ok: true,
    moveScore: {
      userMoveIndex: 0,
      cpLoss,
      evalBefore: Math.round(evalBeforeSigned),
      evalAfter: Math.round(evalAfterSigned),
      classification,
    },
    positionEvaluation: {
      decisionFen,
      userMove: { san, uci },
      evalBefore: Math.round(evalBeforeSigned),
      evalAfter: Math.round(evalAfterSigned),
      cpLoss,
      classification,
      banditResult: getBanditResult(classification),
      fenAfterUserMove,
      fenAfterEngineMove: null,
      phase,
      bucket: selectedBucket,
      clusterId: deriveCoarseClusterId(phase, selectedBucket),
      tags: selectedTags ?? [],
    },
  });
}

function normalizeTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : null;
}

function classifyCpLoss(cpLoss: number): MoveClassification {
  if (cpLoss <= 30) return "excellent";
  if (cpLoss <= 90) return "good";
  if (cpLoss <= 180) return "inaccuracy";
  if (cpLoss <= 320) return "mistake";
  return "blunder";
}
