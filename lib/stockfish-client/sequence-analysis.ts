import { Chess } from "chess.js";
import type { ClientMoveEvaluation, ClientSequenceAnalysis } from "./stockfish-analysis-types";

const MATE_CP = 10000;

export type ClientFenEvaluation = {
  cp: number | null;
  mate: number | null;
  bestMoveUci: string | null;
  bestLineUcis: string[];
};

export type AnalyzeClientSequenceInput = {
  startingFen: string;
  moveUcis: string[];
  learnerSide: "w" | "b";
  evaluateFen: (fen: string) => Promise<ClientFenEvaluation>;
};

export async function analyzeClientSequence(
  input: AnalyzeClientSequenceInput,
): Promise<ClientSequenceAnalysis> {
  const chess = new Chess(input.startingFen);
  const learnerMoves: ClientMoveEvaluation[] = [];

  for (let moveIndex = 0; moveIndex < input.moveUcis.length; moveIndex += 1) {
    const uci = input.moveUcis[moveIndex]!;
    const decisionFen = chess.fen();
    const isLearnerMove = chess.turn() === input.learnerSide;
    const before = isLearnerMove ? await input.evaluateFen(decisionFen) : null;
    const played = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });

    if (!played) {
      throw new Error("Client analysis contains an illegal move sequence.");
    }

    if (!isLearnerMove) continue;

    const afterFen = chess.fen();
    const after = chess.isCheckmate()
      ? {
          cp: null,
          mate: input.learnerSide === "w" ? 1 : -1,
          bestMoveUci: null,
          bestLineUcis: [],
        }
      : await input.evaluateFen(afterFen);
    const evalBefore = evaluationToLearnerCentipawns(before!, input.learnerSide, sideToMoveFromFen(decisionFen));
    const evalAfter = evaluationToLearnerCentipawns(after, input.learnerSide, sideToMoveFromFen(afterFen));
    const cpLoss = chess.isCheckmate()
      ? 0
      : Math.max(0, Math.min(1000, Math.round(evalBefore - evalAfter)));

    learnerMoves.push({
      moveIndex,
      decisionFen,
      playedUci: `${played.from}${played.to}${played.promotion ?? ""}`,
      playedSan: played.san,
      evalBefore,
      evalAfter,
      mateBefore: before!.mate,
      mateAfter: after.mate,
      cpLoss,
      bestMoveUci: before!.bestMoveUci,
      bestLineUcis: before!.bestLineUcis,
      classification: classifyClientMove(cpLoss),
    });
  }

  const totalCpLoss = learnerMoves.reduce((sum, move) => sum + move.cpLoss, 0);
  const averageCpLoss = learnerMoves.length > 0 ? Math.round(totalCpLoss / learnerMoves.length) : 0;
  const maxSingleCpLoss = Math.max(0, ...learnerMoves.map((move) => move.cpLoss));

  return {
    learnerSide: input.learnerSide,
    learnerMoves,
    averageCpLoss,
    maxSingleCpLoss,
    trainingOutcome: classifyClientTrainingOutcome(averageCpLoss, maxSingleCpLoss),
    terminal: {
      gameOver: chess.isGameOver(),
      checkmate: chess.isCheckmate(),
      draw: chess.isDraw(),
    },
  };
}

export function classifyClientMove(cpLoss: number): ClientMoveEvaluation["classification"] {
  if (cpLoss <= 5) return "best";
  if (cpLoss <= 20) return "excellent";
  if (cpLoss <= 50) return "good";
  if (cpLoss <= 100) return "okay";
  if (cpLoss <= 200) return "inaccuracy";
  if (cpLoss <= 400) return "mistake";
  return "blunder";
}

export function classifyClientTrainingOutcome(
  averageCpLoss: number,
  maxSingleCpLoss: number,
): ClientSequenceAnalysis["trainingOutcome"] {
  if (averageCpLoss <= 60 && maxSingleCpLoss <= 160) return "pass";
  if (averageCpLoss <= 140 && maxSingleCpLoss <= 350) return "acceptable";
  return "fail";
}

function evaluationToLearnerCentipawns(
  evaluation: ClientFenEvaluation,
  learnerSide: "w" | "b",
  sideToMove: "w" | "b",
) {
  if (evaluation.mate !== null) {
    const sideToMovePerspective = evaluation.mate > 0 ? MATE_CP : -MATE_CP;
    return sideToMove === learnerSide ? sideToMovePerspective : -sideToMovePerspective;
  }

  const cp = evaluation.cp ?? 0;
  return sideToMove === learnerSide ? cp : -cp;
}

function sideToMoveFromFen(fen: string): "w" | "b" {
  const side = fen.split(/\s+/)[1];
  return side === "b" ? "b" : "w";
}
