import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { Chess } from "chess.js";
import { extractFenConsequenceFingerprint } from "@/lib/fen-consequence-similarity";
import { fetchGamesForProfile } from "@/lib/chess-performance-server";
import { resolveClientAnalysisGame } from "@/lib/performance-analysis-game";
import type { LinkedChessProfile } from "@/lib/chess-profile";
import type { NormalizedGame } from "@/lib/chess-performance-report";
import type { ClientAnalysisTaskGame } from "@/lib/performance-client-analysis";
import type { Json } from "@/lib/supabase/database";

const INITIALIZATION_LOOKBACK_DAYS = 60;
const INITIALIZATION_GAME_LIMIT = 15;
const INITIALIZATION_TIMEOUT_MS = 60000;
const STOCKFISH_DEPTH = 15;

export interface TrainInitializationSummary {
  mistakesFound: number;
  gamesAnalyzed: number;
  averageCpLossPerGame: number;
  weaknessVector: Json;
}

type UserColor = NormalizedGame["userColor"];

export async function buildTrainInitializationSummary(
  profiles: LinkedChessProfile[],
): Promise<TrainInitializationSummary | "no_games"> {
  const sinceMs = Date.now() - INITIALIZATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const games = (
    await Promise.all(profiles.map((profile) => fetchGamesForProfile(profile, sinceMs)))
  )
    .flat()
    .filter((game) => game.timeType === "rapid" || game.timeType === "blitz")
    .sort((left, right) => right.endTimeMs - left.endTimeMs)
    .slice(0, INITIALIZATION_GAME_LIMIT);

  if (games.length === 0) {
    return "no_games";
  }

  return withTimeout(analyzeGames(games), INITIALIZATION_TIMEOUT_MS);
}

async function analyzeGames(games: NormalizedGame[]): Promise<TrainInitializationSummary> {
  const engine = createNodeStockfishEngine();
  const highLossPositions: Array<{ fen: string; cpLoss: number }> = [];
  let gamesAnalyzed = 0;
  let totalCpLoss = 0;
  let mistakesFound = 0;

  try {
    await engine.init();

    for (const game of games) {
      const resolved = resolveClientAnalysisGame(toClientAnalysisTaskGame(game));
      if (!resolved) continue;

      const analyzed = await analyzeGameMoves(engine, resolved.movesUci, game.userColor);
      if (!analyzed.cpLosses.some((cpLoss) => cpLoss !== null)) continue;

      gamesAnalyzed += 1;
      totalCpLoss += analyzed.cpLosses.reduce<number>(
        (sum, cpLoss) => sum + (typeof cpLoss === "number" ? cpLoss : 0),
        0,
      );

      analyzed.highLossPositions.forEach((position) => {
        if (position.cpLoss > 50) mistakesFound += 1;
        highLossPositions.push(position);
      });
    }
  } finally {
    engine.dispose();
  }

  if (gamesAnalyzed === 0) {
    throw new Error("No games could be analyzed.");
  }

  return {
    mistakesFound,
    gamesAnalyzed,
    averageCpLossPerGame: Math.round(totalCpLoss / gamesAnalyzed),
    weaknessVector: buildWeaknessVector(highLossPositions),
  };
}

function toClientAnalysisTaskGame(game: NormalizedGame): ClientAnalysisTaskGame {
  return {
    id: game.id,
    endTimeMs: game.endTimeMs,
    userColor: game.userColor,
    movesUci: game.movesUci,
    pgn: game.pgn,
    userMoveCpLosses: game.userMoveCpLosses,
    userMovePieceTypes: game.userMovePieceTypes,
  };
}

async function analyzeGameMoves(
  engine: ReturnType<typeof createNodeStockfishEngine>,
  movesUci: string[],
  userColor: UserColor,
) {
  const chess = new Chess();
  const cpLosses: Array<number | null> = [];
  const highLossPositions: Array<{ fen: string; cpLoss: number }> = [];
  let previousEval = 0;

  for (let moveIndex = 0; moveIndex < movesUci.length; moveIndex += 1) {
    const beforeFen = chess.fen();
    const played = chess.move(movesUci[moveIndex]!, { strict: false });
    if (!played) break;

    const currentEval = await engine.evaluateFen(chess.fen());
    if (currentEval === null) {
      if (isUserMoveIndex(moveIndex, userColor)) cpLosses.push(null);
      continue;
    }

    const cpLoss =
      moveIndex % 2 === 0
        ? Math.max(0, previousEval - currentEval)
        : Math.max(0, currentEval - previousEval);

    if (isUserMoveIndex(moveIndex, userColor)) {
      cpLosses.push(cpLoss);
      if (cpLoss > 50) {
        highLossPositions.push({ fen: beforeFen, cpLoss });
      }
    }

    previousEval = currentEval;
  }

  return { cpLosses, highLossPositions };
}

function buildWeaknessVector(positions: Array<{ fen: string; cpLoss: number }>): Json {
  const weightedTokens: Record<string, number> = {};
  let totalWeight = 0;

  for (const position of positions) {
    const weight = Math.max(1, Math.round(position.cpLoss));
    totalWeight += weight;

    try {
      const fingerprint = extractFenConsequenceFingerprint(position.fen);
      for (const [token, tokenWeight] of Object.entries(fingerprint.tokens)) {
        weightedTokens[token] = (weightedTokens[token] ?? 0) + tokenWeight * weight;
      }
    } catch {}
  }

  const topTokens = Object.entries(weightedTokens)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 48)
    .map(([token, weight]) => ({
      token,
      weight: totalWeight > 0 ? Math.round((weight / totalWeight) * 1000) / 1000 : 0,
    }));

  return {
    source: "initialization",
    highLossPositions: positions.length,
    totalWeight,
    tokens: topTokens,
  };
}

function isUserMoveIndex(moveIndex: number, userColor: UserColor) {
  return (
    (moveIndex % 2 === 0 && userColor === "white") ||
    (moveIndex % 2 === 1 && userColor === "black")
  );
}

function createNodeStockfishEngine() {
  let processRef: ChildProcessWithoutNullStreams | null = null;
  let pending:
    | {
        resolve: (value: number | null) => void;
        reject: (error: Error) => void;
        score: number | null;
      }
    | null = null;
  let initResolve: (() => void) | null = null;
  let readyResolve: (() => void) | null = null;
  let bufferedOutput = "";

  function write(command: string) {
    processRef?.stdin.write(`${command}\n`);
  }

  function handleLine(line: string) {
    if (line === "uciok") {
      initResolve?.();
      initResolve = null;
      return;
    }

    if (line === "readyok") {
      readyResolve?.();
      readyResolve = null;
      return;
    }

    const parsedScore = parseStockfishScore(line);
    if (pending && parsedScore !== null) {
      pending.score = parsedScore;
    }

    if (line.startsWith("bestmove") && pending) {
      const current = pending;
      pending = null;
      current.resolve(current.score);
    }
  }

  function rejectPending(error: Error) {
    if (pending) {
      const current = pending;
      pending = null;
      current.reject(error);
    }
  }

  return {
    async init() {
      const scriptPath = resolve(process.cwd(), "public", "analyze", "stockfish.js");
      processRef = spawn(process.execPath, [scriptPath], {
        cwd: resolve(process.cwd(), "public", "analyze"),
        stdio: "pipe",
      });

      processRef.stdout.on("data", (chunk: Buffer) => {
        bufferedOutput += chunk.toString("utf8");
        const lines = bufferedOutput.split(/\r?\n/);
        bufferedOutput = lines.pop() ?? "";
        lines.map((line) => line.trim()).filter(Boolean).forEach(handleLine);
      });

      processRef.stderr.on("data", () => {});
      processRef.on("error", (error) => rejectPending(error));
      processRef.on("exit", () => rejectPending(new Error("Stockfish exited.")));

      write("uci");
      await withTimeout(
        new Promise<void>((resolveInit) => {
          initResolve = resolveInit;
        }),
        6000,
      );

      write("setoption name Threads value 1");
      write("setoption name Hash value 16");
      write("isready");
      await withTimeout(
        new Promise<void>((resolveReady) => {
          readyResolve = resolveReady;
        }),
        6000,
      );
    },
    async evaluateFen(fen: string) {
      if (!processRef || pending) return null;

      const evaluation = withTimeout(
        new Promise<number | null>((resolveEval, rejectEval) => {
          pending = { resolve: resolveEval, reject: rejectEval, score: null };
          write("ucinewgame");
          write(`position fen ${fen}`);
          write(`go depth ${STOCKFISH_DEPTH}`);
        }),
        8000,
      );

      return evaluation.catch(() => {
        write("stop");
        pending = null;
        return null;
      });
    },
    dispose() {
      rejectPending(new Error("Stockfish disposed."));
      if (processRef) {
        write("quit");
        processRef.kill();
        processRef = null;
      }
    },
  };
}

function parseStockfishScore(line: string) {
  const cpMatch = line.match(/\bscore cp (-?\d+)\b/);
  if (cpMatch) {
    const cp = Number.parseInt(cpMatch[1] ?? "0", 10);
    return Number.isFinite(cp) ? cp : null;
  }

  const mateMatch = line.match(/\bscore mate (-?\d+)\b/);
  if (mateMatch) {
    const mate = Number.parseInt(mateMatch[1] ?? "0", 10);
    if (!Number.isFinite(mate)) return null;
    return Math.sign(mate) * (100000 - Math.min(99, Math.abs(mate)) * 1000);
  }

  return null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
