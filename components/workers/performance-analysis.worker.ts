/// <reference lib="webworker" />

import {
  calculateEtaMinutes,
  TimeoutError,
  withTimeout,
  type ClientAnalysisDoneMessage,
  type ClientAnalysisErrorMessage,
  type ClientAnalysisProgressMessage,
  type ClientAnalysisTaskGame,
} from "@/lib/performance-client-analysis";
import {
  resolveClientAnalysisGame,
  resolveClientAnalysisMoveCount,
} from "@/lib/performance-analysis-game";
import type { PieceType } from "@/lib/chess-performance-report";

type PlayerColor = "white" | "black";

interface StartMessage {
  type: "start";
  games: ClientAnalysisTaskGame[];
  movetimeMs: number;
  idleBetweenMovesMs: number;
  idleBetweenGamesMs: number;
  engineInitTimeoutMs: number;
  evaluationTimeoutMs: number;
}

type AnalysisResult =
  | {
      status: "complete";
      entry: {
        id: string;
        userMoveCpLosses: Array<number | null>;
        userMovePieceTypes: PieceType[];
      };
    }
  | { status: "failed" }
  | { status: "stopped" };

const scope = self as DedicatedWorkerGlobalScope;
let stopped = false;

scope.addEventListener("message", (event: MessageEvent<StartMessage>) => {
  if (event.data.type !== "start") return;
  stopped = false;
  void runAnalysis(event.data).catch((error) => {
    const message = error instanceof Error ? error.message : "Worker analysis failed";
    postError(message, 0, event.data.games.length, event.data.games.length);
  });
});

scope.addEventListener("close", () => {
  stopped = true;
});

async function runAnalysis(message: StartMessage) {
  const totalGames = message.games.length;
  let processedGames = 0;
  let failedGames = 0;
  const startTime = performance.now();
  const engine = createStockfishEngine();

  postProgress({
    type: "progress",
    phase: "starting",
    processedGames,
    totalGames,
    failedGames,
    etaMinutes: null,
    currentGameIndex: totalGames > 0 ? 1 : null,
    currentMoveIndex: null,
    currentMoveCount: null,
    chunk: [],
  });

  try {
    await engine.init(message.engineInitTimeoutMs);
  } catch {
    engine.dispose();
    postError(
      "Move-by-move piece error analysis is unavailable right now.",
      processedGames,
      totalGames,
      totalGames,
    );
    return;
  }

  for (let gameIndex = 0; gameIndex < message.games.length; gameIndex += 1) {
    if (stopped) break;

    const game = message.games[gameIndex]!;
    const resolvedMoveCount = resolveClientAnalysisMoveCount(game);

    postProgress({
      type: "progress",
      phase: "running",
      processedGames,
      totalGames,
      failedGames,
      etaMinutes: calculateEtaMinutes(performance.now() - startTime, processedGames, totalGames),
      currentGameIndex: gameIndex + 1,
      currentMoveIndex: 0,
      currentMoveCount: resolvedMoveCount,
      chunk: [],
    });

    const analyzed = await analyzeSingleGame(game, engine, {
      movetimeMs: message.movetimeMs,
      idleBetweenMovesMs: message.idleBetweenMovesMs,
      evaluationTimeoutMs: message.evaluationTimeoutMs,
      onHeartbeat(moveIndex, moveCount) {
        // Heartbeats keep the dashboard visibly alive even before a game finishes.
        postProgress({
          type: "progress",
          phase: "running",
          processedGames,
          totalGames,
          failedGames,
          etaMinutes: calculateEtaMinutes(
            performance.now() - startTime,
            processedGames,
            totalGames,
          ),
          currentGameIndex: gameIndex + 1,
          currentMoveIndex: moveIndex,
          currentMoveCount: moveCount,
          chunk: [],
        });
      },
    });

    if (analyzed.status === "stopped") {
      break;
    }

    processedGames += 1;
    const chunk =
      analyzed.status === "complete"
        ? [analyzed.entry]
        : [];

    if (analyzed.status === "failed") {
      failedGames += 1;
    }

    postProgress({
      type: "progress",
      phase: "running",
      processedGames,
      totalGames,
      failedGames,
      etaMinutes: calculateEtaMinutes(performance.now() - startTime, processedGames, totalGames),
      currentGameIndex:
        processedGames < totalGames ? Math.min(totalGames, gameIndex + 2) : null,
      currentMoveIndex: null,
      currentMoveCount: null,
      chunk,
    });

    if (message.idleBetweenGamesMs > 0) {
      await sleep(message.idleBetweenGamesMs);
    }
  }

  engine.dispose();

  scope.postMessage({
    type: "done",
    processedGames,
    totalGames,
    failedGames,
  } satisfies ClientAnalysisDoneMessage);
}

async function analyzeSingleGame(
  game: ClientAnalysisTaskGame,
  engine: ReturnType<typeof createStockfishEngine>,
  options: {
    movetimeMs: number;
    idleBetweenMovesMs: number;
    evaluationTimeoutMs: number;
    onHeartbeat: (moveIndex: number, moveCount: number) => void;
  },
): Promise<AnalysisResult> {
  const resolved = resolveClientAnalysisGame(game);
  if (!resolved) return { status: "failed" };

  if (game.userMoveCpLosses.length > 0) {
    return {
      status: "complete",
      entry: {
        id: game.id,
        userMoveCpLosses: [...game.userMoveCpLosses],
        userMovePieceTypes: resolved.userMovePieceTypes,
      },
    };
  }

  const userMoveCpLosses: Array<number | null> = [];
  let previousEval = 0;

  for (let moveIndex = 0; moveIndex < resolved.movesUci.length; moveIndex += 1) {
    if (stopped) return { status: "stopped" };

    if (moveIndex === 0 || moveIndex % 6 === 0) {
      options.onHeartbeat(moveIndex + 1, resolved.movesUci.length);
    }

    const currentLine = resolved.movesUci.slice(0, moveIndex + 1);
    const currentEval = await engine.evaluatePosition(
      currentLine,
      options.movetimeMs,
      options.evaluationTimeoutMs,
    );

    if (currentEval === null) {
      if (isUserMoveIndex(moveIndex, game.userColor)) {
        userMoveCpLosses.push(null);
      }
      if (options.idleBetweenMovesMs > 0) {
        await sleep(options.idleBetweenMovesMs);
      }
      continue;
    }

    const cpLoss =
      moveIndex % 2 === 0
        ? Math.max(0, previousEval - currentEval)
        : Math.max(0, currentEval - previousEval);

    if (isUserMoveIndex(moveIndex, game.userColor)) {
      userMoveCpLosses.push(cpLoss);
    }

    previousEval = currentEval;

    if (options.idleBetweenMovesMs > 0) {
      await sleep(options.idleBetweenMovesMs);
    }
  }

  if (!userMoveCpLosses.some((cpLoss) => typeof cpLoss === "number")) {
    return { status: "failed" };
  }

  return {
    status: "complete",
    entry: {
      id: game.id,
      userMoveCpLosses,
      userMovePieceTypes: resolved.userMovePieceTypes,
    },
  };
}

function isUserMoveIndex(moveIndex: number, userColor: PlayerColor) {
  return (moveIndex % 2 === 0 && userColor === "white") || (moveIndex % 2 === 1 && userColor === "black");
}

function createStockfishEngine() {
  let worker: Worker | null = null;
  let pendingResolve: ((value: number | null) => void) | null = null;
  let pendingReject: ((reason?: unknown) => void) | null = null;
  let pendingScore: number | null = null;
  let uciOkResolve: (() => void) | null = null;
  let uciOkReject: ((reason?: unknown) => void) | null = null;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((reason?: unknown) => void) | null = null;
  let restartPromise: Promise<void> | null = null;

  function rejectPending(error: Error) {
    if (pendingReject) {
      pendingReject(error);
      pendingReject = null;
      pendingResolve = null;
    }
    if (uciOkReject) {
      uciOkReject(error);
      uciOkReject = null;
      uciOkResolve = null;
    }
    if (readyReject) {
      readyReject(error);
      readyReject = null;
      readyResolve = null;
    }
  }

  function attachWorker(nextWorker: Worker) {
    nextWorker.onmessage = (event: MessageEvent<unknown>) => {
      const line = String(event.data ?? "");

      if (line === "uciok" && uciOkResolve) {
        const resolve = uciOkResolve;
        uciOkResolve = null;
        uciOkReject = null;
        resolve();
        return;
      }

      if (line === "readyok" && readyResolve) {
        const resolve = readyResolve;
        readyResolve = null;
        readyReject = null;
        resolve();
        return;
      }

      const parsedScore = parseStockfishScore(line);
      if (parsedScore !== null) pendingScore = parsedScore;
      if (line.startsWith("bestmove") && pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        pendingReject = null;
        resolve(pendingScore);
        pendingScore = null;
      }
    };

    nextWorker.onerror = (event) => {
      event.preventDefault();
      rejectPending(new Error("Stockfish worker failed."));
    };

    nextWorker.onmessageerror = () => {
      rejectPending(new Error("Stockfish worker sent an unreadable message."));
    };
  }

  async function spawnAndInit(timeoutMs: number) {
    const nextWorker = new Worker("/analyze/stockfish.js");
    attachWorker(nextWorker);
    worker = nextWorker;

    nextWorker.postMessage("uci");
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        uciOkResolve = resolve;
        uciOkReject = reject;
      }),
      timeoutMs,
      "Stockfish engine init",
    );

    nextWorker.postMessage("setoption name Threads value 1");
    nextWorker.postMessage("setoption name Hash value 16");
    nextWorker.postMessage("isready");
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      }),
      timeoutMs,
      "Stockfish engine ready",
    );
  }

  async function restart(timeoutMs: number) {
    if (restartPromise) {
      await restartPromise;
      return;
    }

    restartPromise = (async () => {
      disposeWorker();
      await spawnAndInit(timeoutMs);
    })();

    try {
      await restartPromise;
    } finally {
      restartPromise = null;
    }
  }

  function disposeWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    pendingResolve = null;
    pendingReject = null;
    pendingScore = null;
    uciOkResolve = null;
    uciOkReject = null;
    readyResolve = null;
    readyReject = null;
  }

  return {
    async init(timeoutMs: number) {
      await spawnAndInit(timeoutMs);
    },
    async evaluatePosition(
      movesUci: string[],
      movetimeMs: number,
      evaluationTimeoutMs: number,
    ) {
      if (!worker || pendingResolve) return null;

      const movesPart = movesUci.length > 0 ? ` moves ${movesUci.join(" ")}` : "";

      try {
        worker.postMessage("ucinewgame");
        worker.postMessage(`position startpos${movesPart}`);
        worker.postMessage(`go movetime ${Math.max(20, movetimeMs)}`);

        return await withTimeout(
          new Promise<number | null>((resolve, reject) => {
            pendingResolve = resolve;
            pendingReject = reject;
          }),
          evaluationTimeoutMs,
          "Stockfish position evaluation",
        );
      } catch (error) {
        try {
          worker.postMessage("stop");
        } catch {}

        try {
          await restart(Math.max(evaluationTimeoutMs, 1500));
        } catch {}

        if (error instanceof TimeoutError) {
          return null;
        }

        return null;
      } finally {
        pendingResolve = null;
        pendingReject = null;
        pendingScore = null;
      }
    },
    dispose() {
      disposeWorker();
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

function postProgress(message: ClientAnalysisProgressMessage) {
  scope.postMessage(message);
}

function postError(
  message: string,
  processedGames: number,
  totalGames: number,
  failedGames: number,
) {
  scope.postMessage({
    type: "error",
    message,
    processedGames,
    totalGames,
    failedGames,
  } satisfies ClientAnalysisErrorMessage);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export {};
