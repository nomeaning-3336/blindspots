import type { ClientSequenceAnalysis } from "./stockfish-analysis-types";

export type StockfishAnalysisRequest =
  | { type: "initialize" }
  | {
      type: "analyze-sequence";
      requestId: string;
      startingFen: string;
      moveUcis: string[];
      learnerSide: "w" | "b";
    };

export type StockfishAnalysisResponse =
  | { type: "ready" }
  | {
      type: "analysis-result";
      requestId: string;
      analysis: ClientSequenceAnalysis;
    }
  | { type: "error"; requestId?: string; message: string };
