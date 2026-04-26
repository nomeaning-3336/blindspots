import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Chess } from "chess.js";
import type {
  EngineEval,
  EngineEvalOptions,
  EngineHarness,
  EngineLine,
  EngineLineOptions,
  EngineMove,
  EngineMoveOptions,
} from "./types";

const STOCKFISH_SCRIPT = resolve(process.cwd(), "public", "analyze", "stockfish.js");
const STOCKFISH_CWD = resolve(process.cwd(), "public", "analyze");
const DEFAULT_MOVE_DEPTH = 12;
const DEFAULT_EVAL_DEPTH = 16;
const ENGINE_INIT_TIMEOUT_MS = 6000;
const ENGINE_SEARCH_TIMEOUT_MS = 10000;

export class EngineError extends Error {
  code: "engine_timeout" | "engine_unavailable" | "engine_error";
  constructor(message: string, code: "engine_timeout" | "engine_unavailable" | "engine_error") {
    super(message);
    this.code = code;
    this.name = "EngineError";
  }
}

interface CandidateMove {
  uci: string;
  cp: number | null;
  depth: number;
  rank: number;
  pv: string[];
}

interface SearchResult {
  bestMove: string;
  depth: number;
  candidates: CandidateMove[];
}

interface SearchOptions {
  depthLimit?: number;
  timeLimitMs?: number;
  searchMoves?: string[];
}

export const stockfishHarness: EngineHarness = {
  async isAvailable() {
    return existsSync(STOCKFISH_SCRIPT);
  },

  async getMove(fen: string, options: EngineMoveOptions): Promise<EngineMove> {
    const targetElo = clamp(options.targetElo, 500, 3200);
    const multiPv = options.multiPv ?? multiPvForElo(targetElo);
    const fullDepth = options.depthLimit ?? DEFAULT_MOVE_DEPTH;
    const shallowDepth = maxHumanDepthForElo(targetElo);
    const result = await withStockfish(async (engine) => {
      await engine.setMultiPv(multiPv);
      const fullResult = await engine.search(fen, {
        depthLimit: fullDepth,
        timeLimitMs: options.timeLimitMs,
      });
      const candidates = fullResult.candidates.length > 0
        ? fullResult.candidates
        : [{ uci: fullResult.bestMove, cp: null, depth: fullResult.depth, rank: 0, pv: [fullResult.bestMove] }];
      let selected = sampleCandidate(candidates, targetElo);

      if (targetElo < 2000) {
        await engine.setMultiPv(1);
        const selectedFen = fenAfterMove(fen, selected.uci);
        const selectedFull = await engine.search(selectedFen, { depthLimit: fullDepth });
        const selectedShallow = await engine.search(selectedFen, { depthLimit: shallowDepth });
        const fullCp = selectedFull.candidates[0]?.cp;
        const shallowCp = selectedShallow.candidates[0]?.cp;
        if (fullCp !== undefined && fullCp !== null && shallowCp !== undefined && shallowCp !== null) {
          const hiddenCombinationDelta = Math.abs(fullCp - shallowCp);
          if (hiddenCombinationDelta > 80) {
            const shallowBest = await engine.search(fen, { depthLimit: shallowDepth });
            selected = shallowBest.candidates[0] ?? {
              uci: shallowBest.bestMove,
              cp: null,
              depth: shallowBest.depth,
              rank: 0,
              pv: [shallowBest.bestMove],
            };
          }
        }
      }

      const currentEval = whitePositiveCp(fen, candidates[0]?.cp ?? 0);
      const responseDelayMs = options.responseDelayMs ?? humanizedDelayMs(fen, targetElo, currentEval, options.previousEvalCp);
      await delay(responseDelayMs);
      return selected;
    });

    const san = uciToSan(fen, result.uci);

    return {
      san,
      uci: result.uci,
      engine: "stockfish",
      targetElo,
      effectiveElo: targetElo,
    };
  },

  async getEval(fen: string, options: EngineEvalOptions = {}): Promise<EngineEval> {
    const result = await withStockfish(async (engine) => {
      await engine.setMultiPv(1);
      return engine.search(fen, {
        depthLimit: options.depthLimit ?? DEFAULT_EVAL_DEPTH,
        timeLimitMs: options.timeLimitMs,
      });
    });
    const best = result.candidates[0];

    return {
      cp: whitePositiveCp(fen, best?.cp ?? 0),
      depth: best?.depth ?? result.depth,
      bestMove: result.bestMove,
    };
  },

  async getLines(fen: string, options: EngineLineOptions = {}): Promise<EngineLine[]> {
    const multiPv = options.multiPv ?? 5;
    const result = await withStockfish(async (engine) => {
      await engine.setMultiPv(multiPv);
      return engine.search(fen, {
        depthLimit: options.depthLimit ?? DEFAULT_EVAL_DEPTH,
        timeLimitMs: options.timeLimitMs,
        searchMoves: options.searchMoves,
      });
    });

    return result.candidates.slice(0, multiPv).map((candidate) => ({
      cp: whitePositiveCp(fen, candidate.cp ?? 0),
      depth: candidate.depth || result.depth,
      rank: candidate.rank,
      bestMove: candidate.uci,
      pv: candidate.pv,
    }));
  },
};

function withStockfish<T>(callback: (engine: ReturnType<typeof createStockfishProcess>) => Promise<T>) {
  const engine = createStockfishProcess();
  return (async () => {
    try {
      await engine.init();
      return await callback(engine);
    } finally {
      engine.dispose();
    }
  })();
}

function createStockfishProcess() {
  let processRef: ChildProcessWithoutNullStreams | null = null;
  let buffer = "";
  let uciResolve: (() => void) | null = null;
  let readyResolve: (() => void) | null = null;
  let dead = false;
  let pendingSearch:
    | {
        resolve: (result: SearchResult) => void;
        reject: (error: Error) => void;
        candidates: Map<number, CandidateMove>;
        bestMove: string | null;
        depth: number;
      }
    | null = null;

  function kill() {
    dead = true;
    if (processRef) {
      try { processRef.stdin.destroy(); } catch { /* pipe already gone */ }
      try { processRef.stdout.destroy(); } catch { /* pipe already gone */ }
      processRef.kill();
      processRef = null;
    }
  }

  function write(command: string) {
    if (dead || !processRef) return;
    try {
      processRef.stdin.write(`${command}\n`);
    } catch {
      kill();
    }
  }

  function handleLine(line: string) {
    if (line === "uciok") {
      const resolveReady = uciResolve;
      uciResolve = null;
      resolveReady?.();
      return;
    }

    if (line === "readyok") {
      const resolveReady = readyResolve;
      readyResolve = null;
      resolveReady?.();
      return;
    }

    if (pendingSearch) {
      const candidate = parseCandidateLine(line);
      if (candidate) {
        pendingSearch.candidates.set(candidate.rank, candidate);
        pendingSearch.depth = Math.max(pendingSearch.depth, candidate.depth);
      }

      if (line.startsWith("bestmove ")) {
        const bestMove = line.split(/\s+/)[1] ?? pendingSearch.bestMove ?? "";
        const current = pendingSearch;
        pendingSearch = null;
        current.resolve({
          bestMove,
          depth: current.depth,
          candidates: [...current.candidates.values()].sort((left, right) => left.rank - right.rank),
        });
      }
    }
  }

  function rejectPending(error: Error) {
    if (pendingSearch) {
      const current = pendingSearch;
      pendingSearch = null;
      current.reject(error);
    }
  }

  return {
    async init() {
      if (!existsSync(STOCKFISH_SCRIPT)) {
        throw new EngineError("Stockfish script is not available.", "engine_unavailable");
      }

      processRef = spawn(process.execPath, [STOCKFISH_SCRIPT], {
        cwd: STOCKFISH_CWD,
        stdio: "pipe",
      });
      processRef.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        lines.map((line) => line.trim()).filter(Boolean).forEach(handleLine);
      });
      processRef.stderr.on("data", () => {});
      processRef.on("error", () => {
        kill();
        rejectPending(new EngineError("Stockfish process error.", "engine_error"));
      });
      processRef.on("exit", () => {
        dead = true;
        rejectPending(new EngineError("Stockfish exited.", "engine_error"));
      });

      write("uci");
      await withTimeout(new Promise<void>((resolveReady) => {
        uciResolve = resolveReady;
      }), ENGINE_INIT_TIMEOUT_MS);
      write("isready");
      await withTimeout(new Promise<void>((resolveReady) => {
        readyResolve = resolveReady;
      }), ENGINE_INIT_TIMEOUT_MS);
    },

    async setMultiPv(multiPv: number) {
      write(`setoption name MultiPV value ${clamp(Math.round(multiPv), 1, 32)}`);
      await this.ready();
    },

    async ready() {
      write("isready");
      await withTimeout(new Promise<void>((resolveReady) => {
        readyResolve = resolveReady;
      }), ENGINE_INIT_TIMEOUT_MS);
    },

    async search(fen: string, options: SearchOptions) {
      if (!processRef || pendingSearch) {
        throw new EngineError("Stockfish is not ready for search.", "engine_error");
      }

      const depthLimit = options.depthLimit ?? DEFAULT_MOVE_DEPTH;
      const baseGoCommand = options.timeLimitMs
        ? `go movetime ${Math.max(20, Math.round(options.timeLimitMs))}`
        : `go depth ${Math.max(1, Math.round(depthLimit))}`;
      const searchMovesClause = options.searchMoves?.length
        ? ` searchmoves ${options.searchMoves.join(" ")}`
        : "";
      const goCommand = `${baseGoCommand}${searchMovesClause}`;

      return withTimeout(new Promise<SearchResult>((resolveSearch, rejectSearch) => {
        pendingSearch = {
          resolve: resolveSearch,
          reject: rejectSearch,
          candidates: new Map(),
          bestMove: null,
          depth: 0,
        };
        write("ucinewgame");
        write(`position fen ${fen}`);
        write(goCommand);
      }), ENGINE_SEARCH_TIMEOUT_MS).catch((error) => {
        kill();
        pendingSearch = null;
        throw error;
      });
    },

    dispose() {
      rejectPending(new EngineError("Stockfish disposed.", "engine_error"));
      kill();
    },
  };
}

function parseCandidateLine(line: string): CandidateMove | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;
  const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  const pv = line.split(/\s+pv\s+/)[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
  const pvMove = pv[0];
  if (!pvMove) return null;

  let cp: number | null = null;
  if (cpMatch) {
    cp = Number.parseInt(cpMatch[1] ?? "0", 10);
  } else if (mateMatch) {
    const mate = Number.parseInt(mateMatch[1] ?? "0", 10);
    cp = Math.sign(mate) * (100000 - Math.min(99, Math.abs(mate)) * 1000);
  }

  return {
    uci: pvMove,
    cp,
    depth: Number.parseInt(depthMatch?.[1] ?? "0", 10) || 0,
    rank: Math.max(0, (Number.parseInt(multipvMatch?.[1] ?? "1", 10) || 1) - 1),
    pv,
  };
}

function multiPvForElo(elo: number) {
  if (elo <= 800) return 8;
  if (elo < 1100) return 6;
  if (elo < 1400) return 4;
  if (elo < 1700) return 3;
  if (elo < 2000) return 2;
  return 1;
}

function maxHumanDepthForElo(elo: number) {
  return Math.max(1, Math.floor(elo / 350));
}

function sampleCandidate(candidates: CandidateMove[], targetElo: number) {
  const sorted = [...candidates].sort((left, right) => left.rank - right.rank);
  if (sorted.length === 1) return sorted[0]!;

  const bestMoveCp = sorted[0]?.cp ?? 0;
  const temperature = Math.max(0.1, (2000 - targetElo) / 600);
  if (targetElo >= 2000) return sorted[0]!;

  const weights = sorted.map((candidate) => {
    const candidateCp = candidate.cp ?? bestMoveCp - candidate.rank * 35;
    const cpDrop = Math.max(0, bestMoveCp - candidateCp);
    return Math.exp((-cpDrop * temperature) / 100);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;

  for (let index = 0; index < sorted.length; index += 1) {
    roll -= weights[index]!;
    if (roll <= 0) return sorted[index]!;
  }

  return sorted[0]!;
}

function humanizedDelayMs(
  fen: string,
  targetElo: number,
  currentEval: number,
  previousEval: number | undefined,
) {
  const chess = new Chess(fen);
  const legalMoveCount = chess.moves().length;
  const evalVolatility = Math.abs(currentEval - (previousEval ?? currentEval));
  const complexityFactor = Math.min(1, legalMoveCount / 30 + evalVolatility / 200);
  const baseDelay = 300;
  const maxDelay = Math.max(300, 1800 - targetElo * 0.5);
  return baseDelay + complexityFactor * (maxDelay - baseDelay) * Math.random();
}

function whitePositiveCp(fen: string, cp: number) {
  return fen.split(/\s+/)[1] === "b" ? -cp : cp;
}

function delay(ms: number) {
  return new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, Math.max(0, Math.round(ms)));
  });
}

function uciToSan(fen: string, uci: string) {
  const chess = new Chess(fen);
  const move = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  });
  if (!move) {
    throw new Error(`Stockfish returned illegal move ${uci} for FEN ${fen}`);
  }
  return move.san;
}

function fenAfterMove(fen: string, uci: string) {
  const chess = new Chess(fen);
  const move = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  });
  if (!move) {
    throw new Error(`Stockfish returned illegal move ${uci} for FEN ${fen}`);
  }
  return chess.fen();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new EngineError("Stockfish command timed out.", "engine_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
