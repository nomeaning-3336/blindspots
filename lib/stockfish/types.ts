export type ClientEngineLine = {
  rank: number;
  depth: number;
  cp: number | null;
  mate: number | null;
  bestMove: string;
  pv: string[];
};

export type AnalyzeFenInput = {
  fen: string;
  multiPv?: number;
  movetimeMs?: number;
  onUpdate?: (lines: ClientEngineLine[]) => void;
};

export type AnalyzeFenResult = {
  lines: ClientEngineLine[];
  bestMove: string | null;
};

export type ClientStockfishOptions = {
  workerUrl?: string;
  hashMb?: number;
};
