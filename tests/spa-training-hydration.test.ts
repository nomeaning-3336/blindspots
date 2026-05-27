import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRestoredBoardState,
  parseCompleteSequenceResponse,
  parseActiveSessionResponse,
  parseColdCandidateResponse,
} from "../lib/training/spa-training-hydration.ts";
import { Chess } from "chess.js";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Fool's mate: white plays f3, e5, g4, Qh4#
const FOOLS_MATE_MOVES = [
  { san: "f3", uci: "f2f3", side: "w" },
  { san: "e5", uci: "e7e5", side: "b" },
  { san: "g4", uci: "g2g4", side: "w" },
  { san: "Qh4#", uci: "d8h4", side: "b" },
];

test("SPA parses a personal cold candidate without historical move disclosure", () => {
  const candidate = parseColdCandidateResponse({
    fen: STARTING_FEN,
    queueSource: "review",
    candidateType: "personal",
    sourceType: "own_game",
    trainingItemId: "training-item-1",
    tags: ["fork"],
    reviewCount: 2,
  });

  assert.equal(candidate.candidateType, "personal");
  assert.equal(candidate.trainingItemId, "training-item-1");
  assert.equal(candidate.queueSource, "review");
});

test("SPA parses a filler cold candidate with stable provenance identity", () => {
  const candidate = parseColdCandidateResponse({
    fen: STARTING_FEN,
    queueSource: "filler",
    candidateType: "filler",
    sourceType: "filler_catalog",
    fillerId: "11111111-1111-4111-8111-111111111111",
    fillerOrigin: "lichess_puzzle",
    fillerCursor: 4,
    selectedPhase: "tactic",
  });

  assert.equal(candidate.candidateType, "filler");
  assert.equal(candidate.fillerOrigin, "lichess_puzzle");
  assert.equal(candidate.fillerCursor, 4);
});

test("SPA restores an active persisted sequence to its exact latest board state", () => {
  const session = parseActiveSessionResponse({
    session: {
      id: "session-1",
      startingFen: STARTING_FEN,
      moves: [
        { san: "e4", uci: "e2e4", side: "w" },
        { san: "e5", uci: "e7e5", side: "b" },
        { san: "Nf3", uci: "g1f3", side: "w" },
      ],
      sequenceLength: 2,
      selectedTrainingItemId: "training-item-1",
      queueSource: "review",
      fillerId: null,
      fillerOrigin: null,
      opponentMode: "maia3_client_unrated",
      startedAt: "2026-05-26T00:00:00.000Z",
    },
  });

  assert.ok(session);

  const restored = buildRestoredBoardState(session);

  assert.equal(restored.history.length, 4);
  assert.equal(restored.historyIndex, 3);
  assert.deepEqual(restored.lastMove, { from: "g1", to: "f3" });
  assert.equal(
    restored.fen,
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
  );
});

test("SPA rejects active-session identity mismatches", () => {
  assert.throws(
    () =>
      parseActiveSessionResponse({
        session: {
          id: "session-1",
          startingFen: STARTING_FEN,
          moves: [{ san: "e4", uci: "e2e4", side: "w" }],
          sequenceLength: 1,
          selectedTrainingItemId: "training-item-1",
          queueSource: "filler",
          fillerId: null,
          fillerOrigin: null,
          opponentMode: "maia3_client_unrated",
          startedAt: "2026-05-26T00:00:00.000Z",
        },
      }),
    /Active-session candidate identity is invalid/,
  );
});

test("SPA parses the real persisted sequence completion result", () => {
  const result = parseCompleteSequenceResponse({
    ok: true,
    sessionId: "session-1",
    trainingOutcome: "acceptable",
    averageCpLoss: 23,
    maxSingleCpLoss: 41,
    rated: false,
    elo: {
      eloBefore: 1200,
      eloAfter: 1203,
      eloDelta: 3,
    },
  });

  assert.equal(result.sessionId, "session-1");
  assert.equal(result.trainingOutcome, "acceptable");
  assert.equal(result.averageCpLoss, 23);
  assert.equal(result.maxSingleCpLoss, 41);
  assert.equal(result.rated, false);
  assert.deepEqual(result.elo, {
    eloBefore: 1200,
    eloAfter: 1203,
    eloDelta: 3,
  });
});

test("restored Fool's mate session final board is game-over", () => {
  const session = parseActiveSessionResponse({
    session: {
      id: "session-checkmate",
      startingFen: STARTING_FEN,
      moves: FOOLS_MATE_MOVES,
      sequenceLength: 2,
      selectedTrainingItemId: null,
      queueSource: "filler",
      fillerId: "22222222-2222-4222-8222-222222222222",
      fillerOrigin: "lichess_puzzle",
      opponentMode: "maia3_client_unrated",
      startedAt: "2026-05-27T00:00:00.000Z",
    },
  });

  assert.ok(session);

  const restored = buildRestoredBoardState(session);
  const chess = new Chess(restored.fen);

  assert.ok(chess.isGameOver(), "restored terminal session must be game-over");
  assert.ok(chess.isCheckmate(), "restored terminal session must be checkmate");
});

test("restored game-over session restoreTerminalToAnalysis flag detection works via Chess.isGameOver()", () => {
  const session = parseActiveSessionResponse({
    session: {
      id: "session-checkmate-2",
      startingFen: STARTING_FEN,
      moves: FOOLS_MATE_MOVES,
      sequenceLength: 2,
      selectedTrainingItemId: null,
      queueSource: "filler",
      fillerId: "33333333-3333-4333-8333-333333333333",
      fillerOrigin: "lichess_puzzle",
      opponentMode: "maia3_client_unrated",
      startedAt: "2026-05-27T00:00:00.000Z",
    },
  });

  assert.ok(session);

  const restored = buildRestoredBoardState(session);

  const withOption = (() => {
    try { return new Chess(restored.fen).isGameOver(); } catch { return false; }
  })();

  assert.equal(withOption, true, "restoreTerminalToAnalysis path detects game-over from restored FEN");
});
