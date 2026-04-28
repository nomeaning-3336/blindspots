export interface EngineHarness {
  getMove(fen: string, options: EngineMoveOptions): Promise<EngineMove>;
  getEval(fen: string, options: EngineEvalOptions): Promise<EngineEval>;
  getLines?(fen: string, options: EngineLineOptions): Promise<EngineLine[]>;
  isAvailable(): Promise<boolean>;
}

export interface EngineMoveOptions {
  targetElo: number;
  multiPv?: number;
  depthLimit?: number;
  timeLimitMs?: number;
  userBlindspotElo?: number;
  previousEvalCp?: number;
  responseDelayMs?: number;
}

export interface EngineEvalOptions {
  depthLimit?: number;
  timeLimitMs?: number;
}

export interface EngineLineOptions extends EngineEvalOptions {
  multiPv?: number;
  searchMoves?: string[];
}

export interface EngineMove {
  san: string;
  uci: string;
  engine: "stockfish";
  targetElo: number;
  effectiveElo: number;
  mate?: number | null;
}

export interface EngineEval {
  cp: number;
  mate?: number | null;
  depth: number;
  bestMove: string;
}

export interface EngineLine {
  cp: number;
  mate?: number | null;
  depth: number;
  rank: number;
  bestMove: string;
  pv: string[];
}
