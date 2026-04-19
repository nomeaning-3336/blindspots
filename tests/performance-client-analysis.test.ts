import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const clientAnalysis: typeof import("../lib/performance-client-analysis") = require("../lib/performance-client-analysis.ts");

const {
  CLIENT_ANALYSIS_MAX_GAMES,
  CLIENT_ANALYSIS_CACHE_VERSION,
  TimeoutError,
  applyClientAnalysisDone,
  applyClientAnalysisError,
  applyClientAnalysisProgress,
  buildAnalysisCacheKey,
  createIdleClientProcessingStatus,
  createStartingClientProcessingStatus,
  mergeClientAnalysisEntries,
  parseClientAnalysisCache,
  selectPendingClientAnalysisGames,
  withTimeout,
} = clientAnalysis;

type ClientAnalyzedGame = import("../lib/performance-client-analysis").ClientAnalyzedGame;
type ClientAnalysisProgressMessage = import("../lib/performance-client-analysis").ClientAnalysisProgressMessage;
type NormalizedGame = import("../lib/chess-performance-report").NormalizedGame;

function createGame(id: string, endTimeMs: number, overrides: Partial<NormalizedGame> = {}): NormalizedGame {
  return {
    id,
    url: `https://example.com/${id}`,
    provider: "lichess",
    profileKey: "lichess:test",
    profileUsername: "test",
    profileLabel: "Lichess · test",
    profileUrl: "https://lichess.org/@/test",
    endTimeMs,
    timeType: "blitz",
    userColor: "white",
    opponentName: "Opponent",
    result: "win",
    openingName: null,
    openingCode: null,
    userAccuracy: null,
    opponentAccuracy: null,
    userRating: 1500,
    initialSeconds: 300,
    incrementSeconds: 0,
    totalPlies: 10,
    openingPly: null,
    userMoveDurations: [],
    opponentMoveDurations: [],
    userMoveCpLosses: [],
    opponentMoveCpLosses: [],
    movesUci: "e2e4 e7e5 g1f3",
    pgn: "[Event \"Test\"] 1. e4 e5 2. Nf3 *",
    ...overrides,
  };
}

test("buildAnalysisCacheKey is versioned and deterministic", () => {
  assert.equal(
    buildAnalysisCacheKey(["b:2", "a:1"]),
    `perf-client-analysis:${CLIENT_ANALYSIS_CACHE_VERSION}:a:1:b:2`,
  );
});

test("selectPendingClientAnalysisGames caps to the newest recent games", () => {
  const games = Array.from({ length: CLIENT_ANALYSIS_MAX_GAMES + 5 }, (_, index) =>
    createGame(`g-${index}`, 1000 + index),
  );
  const selected = selectPendingClientAnalysisGames(games, {});

  assert.equal(selected.length, CLIENT_ANALYSIS_MAX_GAMES);
  assert.equal(selected[0]?.id, `g-${CLIENT_ANALYSIS_MAX_GAMES + 4}`);
  assert.equal(selected.at(-1)?.id, "g-5");
});

test("selectPendingClientAnalysisGames skips games that already have analysis or do not need enrichment", () => {
  const selected = selectPendingClientAnalysisGames(
    [
      createGame("fresh", 30),
      createGame("needs-piece-types", 25, {
        userMoveCpLosses: [30, 40],
        userMovePieceTypes: [],
      }),
      createGame("cached", 20),
      createGame("server-ready", 10, {
        userMoveCpLosses: [30, 40],
        userMovePieceTypes: ["pawn", "knight"],
      }),
      createGame("no-source", 5, {
        movesUci: undefined,
        pgn: undefined,
      }),
    ],
    {
      cached: {
        id: "cached",
        userMoveCpLosses: [10],
        userMovePieceTypes: ["pawn"],
        analyzedAt: 1,
      },
    },
  );

  assert.deepEqual(selected.map((game) => game.id), ["fresh", "needs-piece-types"]);
});

test("parseClientAnalysisCache returns an empty object for corrupt cache blobs", () => {
  assert.deepEqual(parseClientAnalysisCache("{ nope"), {});
  assert.deepEqual(parseClientAnalysisCache(JSON.stringify({ entries: null })), {});
});

test("mergeClientAnalysisEntries adds partial results without discarding existing cache entries", () => {
  const merged = mergeClientAnalysisEntries(
    {
      existing: {
        id: "existing",
        userMoveCpLosses: [20],
        userMovePieceTypes: ["pawn"],
        analyzedAt: 1,
      },
    },
    [
      {
        id: "new",
        userMoveCpLosses: [30, null],
        userMovePieceTypes: ["knight", "bishop"],
      },
    ],
    99,
  );

  assert.deepEqual(Object.keys(merged).sort(), ["existing", "new"]);
  assert.equal(merged.new?.analyzedAt, 99);
});

test("withTimeout rejects hanging work with a TimeoutError", async () => {
  await assert.rejects(
    withTimeout(new Promise<void>(() => {}), 20, "Never resolves"),
    (error: unknown) => error instanceof TimeoutError,
  );
});

test("progress state transitions move from starting to running to done", () => {
  const starting = createStartingClientProcessingStatus(12);
  const progressMessage: ClientAnalysisProgressMessage = {
    type: "progress",
    phase: "running",
    processedGames: 1,
    totalGames: 12,
    failedGames: 0,
    etaMinutes: 1.4,
    currentGameIndex: 2,
    currentMoveIndex: 3,
    currentMoveCount: 40,
    chunk: [],
  };

  const running = applyClientAnalysisProgress(starting, progressMessage);
  const done = applyClientAnalysisDone(running, {
    type: "done",
    processedGames: 12,
    totalGames: 12,
    failedGames: 2,
  });

  assert.equal(running.phase, "running");
  assert.equal(running.processedGames, 1);
  assert.equal(running.currentGameIndex, 2);
  assert.equal(done.phase, "done");
  assert.equal(done.running, false);
  assert.equal(done.failedGames, 2);
  assert.equal(done.reason, "partial-results");
});

test("error transitions preserve partial-result context when some games already finished", () => {
  const current = applyClientAnalysisProgress(
    createStartingClientProcessingStatus(8),
    {
      type: "progress",
      phase: "running",
      processedGames: 3,
      totalGames: 8,
      failedGames: 1,
      etaMinutes: 1.1,
      currentGameIndex: 4,
      currentMoveIndex: 12,
      currentMoveCount: 50,
      chunk: [],
    },
  );

  const errored = applyClientAnalysisError(
    current,
    {
      type: "error",
      message: "engine failed",
      processedGames: 3,
      totalGames: 8,
      failedGames: 2,
    },
    true,
  );

  assert.equal(errored.phase, "error");
  assert.equal(errored.running, false);
  assert.equal(errored.reason, "partial-results");
  assert.equal(errored.errorMessage, "engine failed");
});

test("idle processing status starts clean", () => {
  const idle = createIdleClientProcessingStatus();

  assert.equal(idle.phase, "idle");
  assert.equal(idle.running, false);
  assert.equal(idle.processedGames, 0);
  assert.equal(idle.totalGames, 0);
});

export {};
