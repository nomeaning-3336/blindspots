/// <reference lib="webworker" />

import { Chess } from "chess.js";

type PieceType = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
type PlayerColor = "white" | "black";

interface AnalysisTaskGame {
  id: string;
  userColor: PlayerColor;
  movesUci?: string;
  pgn?: string;
  userMovePieceTypes?: PieceType[];
}

interface StartMessage {
  type: "start";
  games: AnalysisTaskGame[];
  chunkSize: number;
  movetimeMs: number;
  idleBetweenMovesMs: number;
  idleBetweenGamesMs: number;
}

interface ChunkMessage {
  type: "chunk";
  processedGames: number;
  totalGames: number;
  etaMinutes: number;
  chunk: Array<{
    id: string;
    userMoveCpLosses: Array<number | null>;
    userMovePieceTypes: PieceType[];
  }>;
}

interface DoneMessage {
  type: "done";
  processedGames: number;
  totalGames: number;
}

interface ErrorMessage {
  type: "error";
  message: string;
}

const scope = self as DedicatedWorkerGlobalScope;
let stopped = false;

scope.addEventListener("message", (event: MessageEvent<StartMessage>) => {
  if (event.data.type !== "start") return;
  void runAnalysis(event.data).catch((error) => {
    const message = error instanceof Error ? error.message : "Worker analysis failed";
    scope.postMessage({ type: "error", message } satisfies ErrorMessage);
  });
});

scope.addEventListener("close", () => {
  stopped = true;
});

async function runAnalysis(message: StartMessage) {
  const engine = createStockfishEngine();
  await engine.init();

  const totalGames = message.games.length;
  const chunkSize = Math.max(1, message.chunkSize);
  const startTime = performance.now();
  const chunk: ChunkMessage["chunk"] = [];
  let processedGames = 0;

  for (const game of message.games) {
    if (stopped) break;

    const analyzed = await analyzeSingleGame(
      game,
      engine,
      message.movetimeMs,
      message.idleBetweenMovesMs,
    );

    if (analyzed) chunk.push(analyzed);
    processedGames += 1;

    const shouldFlushChunk =
      chunk.length >= chunkSize || processedGames === totalGames;

    if (shouldFlushChunk) {
      const elapsed = performance.now() - startTime;
      const avgPerGame = processedGames > 0 ? elapsed / processedGames : 0;
      const remainingGames = Math.max(0, totalGames - processedGames);
      const etaMinutes = roundToTenths((avgPerGame * remainingGames) / 60000);

      scope.postMessage({
        type: "chunk",
        processedGames,
        totalGames,
        etaMinutes,
        chunk: [...chunk],
      } satisfies ChunkMessage);
      chunk.length = 0;
    }

    if (message.idleBetweenGamesMs > 0) {
      await sleep(message.idleBetweenGamesMs);
    }
  }

  engine.dispose();

  scope.postMessage({
    type: "done",
    processedGames,
    totalGames,
  } satisfies DoneMessage);
}

async function analyzeSingleGame(
  game: AnalysisTaskGame,
  engine: ReturnType<typeof createStockfishEngine>,
  movetimeMs: number,
  idleBetweenMovesMs: number,
) {
  const resolved = resolveGameMovesAndPieces(game);
  if (!resolved) return null;

  const userMoveCpLosses: Array<number | null> = [];
  let previousEval = 0;

  for (let moveIndex = 0; moveIndex < resolved.movesUci.length; moveIndex += 1) {
    if (stopped) return null;

    const currentLine = resolved.movesUci.slice(0, moveIndex + 1);
    const currentEval = await engine.evaluatePosition(currentLine, movetimeMs);

    if (currentEval === null) {
      if ((moveIndex % 2 === 0 && game.userColor === "white") ||
          (moveIndex % 2 === 1 && game.userColor === "black")) {
        userMoveCpLosses.push(null);
      }
      if (idleBetweenMovesMs > 0) await sleep(idleBetweenMovesMs);
      continue;
    }

    const cpLoss =
      moveIndex % 2 === 0
        ? Math.max(0, previousEval - currentEval)
        : Math.max(0, currentEval - previousEval);

    if (moveIndex % 2 === 0) {
      if (game.userColor === "white") userMoveCpLosses.push(cpLoss);
    } else if (game.userColor === "black") {
      userMoveCpLosses.push(cpLoss);
    }

    previousEval = currentEval;

    if (idleBetweenMovesMs > 0) await sleep(idleBetweenMovesMs);
  }

  return {
    id: game.id,
    userMoveCpLosses,
    userMovePieceTypes: resolved.userMovePieceTypes,
  };
}

function resolveGameMovesAndPieces(game: AnalysisTaskGame) {
  let movesUci = game.movesUci
    ?.split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean) ?? [];
  let userMovePieceTypes = game.userMovePieceTypes ?? [];

  if (movesUci.length > 0 && userMovePieceTypes.length > 0) {
    return { movesUci, userMovePieceTypes };
  }

  if (!game.pgn) return null;

  try {
    const chess = new Chess();
    chess.loadPgn(game.pgn, { strict: false });
    const history = chess.history({ verbose: true });
    movesUci = history.map((entry) => `${entry.from}${entry.to}${entry.promotion ?? ""}`);

    if (userMovePieceTypes.length === 0) {
      const whitePieces: PieceType[] = [];
      const blackPieces: PieceType[] = [];

      history.forEach((entry, index) => {
        const piece = pieceTypeFromLetter(entry.piece);
        if (!piece) return;
        if (index % 2 === 0) whitePieces.push(piece);
        else blackPieces.push(piece);
      });

      userMovePieceTypes = game.userColor === "white" ? whitePieces : blackPieces;
    }

    return { movesUci, userMovePieceTypes };
  } catch {
    return null;
  }
}

function pieceTypeFromLetter(piece: string | undefined): PieceType | null {
  if (!piece) return null;
  if (piece === "p") return "pawn";
  if (piece === "n") return "knight";
  if (piece === "b") return "bishop";
  if (piece === "r") return "rook";
  if (piece === "q") return "queen";
  if (piece === "k") return "king";
  return null;
}

function createStockfishEngine() {
  let worker: Worker | null = null;
  let pendingResolve: ((value: number | null) => void) | null = null;
  let pendingScore: number | null = null;

  return {
    async init() {
      worker = new Worker("/analyze/stockfish.js");
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const line = String(event.data ?? "");
        const parsedScore = parseStockfishScore(line);
        if (parsedScore !== null) pendingScore = parsedScore;
        if (line.startsWith("bestmove") && pendingResolve) {
          const resolve = pendingResolve;
          pendingResolve = null;
          resolve(pendingScore);
          pendingScore = null;
        }
      };

      worker.postMessage("uci");
      worker.postMessage("setoption name Threads value 1");
      worker.postMessage("setoption name Hash value 16");
      worker.postMessage("isready");
      await sleep(50);
    },
    async evaluatePosition(movesUci: string[], movetimeMs: number) {
      if (!worker) return null;
      if (pendingResolve) return null;

      const movesPart = movesUci.length > 0 ? ` moves ${movesUci.join(" ")}` : "";
      worker.postMessage("ucinewgame");
      worker.postMessage(`position startpos${movesPart}`);
      worker.postMessage(`go movetime ${Math.max(20, movetimeMs)}`);

      return await new Promise<number | null>((resolve) => {
        pendingResolve = resolve;
      });
    },
    dispose() {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      pendingResolve = null;
      pendingScore = null;
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

function roundToTenths(value: number) {
  return Math.round(value * 10) / 10;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export {};
