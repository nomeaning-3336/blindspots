export type ClientMoveEvaluation = {
  moveIndex: number;
  decisionFen: string;
  playedUci: string;
  playedSan: string;
  evalBefore: number;
  evalAfter: number;
  mateBefore: number | null;
  mateAfter: number | null;
  cpLoss: number;
  bestMoveUci: string | null;
  bestLineUcis: string[];
  classification: "best" | "excellent" | "good" | "okay" | "inaccuracy" | "mistake" | "blunder";
};

export type ClientSequenceAnalysis = {
  learnerSide: "w" | "b";
  learnerMoves: ClientMoveEvaluation[];
  averageCpLoss: number;
  maxSingleCpLoss: number;
  trainingOutcome: "pass" | "acceptable" | "fail";
  terminal: {
    gameOver: boolean;
    checkmate: boolean;
    draw: boolean;
  };
};
