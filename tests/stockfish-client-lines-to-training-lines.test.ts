const assert = require("node:assert/strict");
const test = require("node:test");
const converter = require("../lib/stockfish/client-lines-to-training-lines.ts");

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("clientLinesToTrainingEngineLines converts UCI PV to SAN", () => {
  const lines = converter.clientLinesToTrainingEngineLines({
    fen: STARTING_FEN,
    lines: [
      {
        rank: 1,
        depth: 12,
        cp: 34,
        mate: null,
        bestMove: "e2e4",
        pv: ["e2e4", "e7e5", "g1f3"],
      },
    ],
  });

  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].pvSan, ["e4", "e5", "Nf3"]);
  assert.equal(lines[0].bestMove, "e2e4");
  assert.equal(lines[0].bestSan, "e4");
  assert.deepEqual(lines[0].continuationSan, ["e5", "Nf3"]);
  assert.equal(lines[0].cp, 34, "white-to-move cp should pass through unchanged");
});

test("clientLinesToTrainingEngineLines preserves mate and creates cp fallback", () => {
  const lines = converter.clientLinesToTrainingEngineLines({
    fen: STARTING_FEN,
    lines: [
      {
        rank: 1,
        depth: 9,
        cp: null,
        mate: 3,
        bestMove: "e2e4",
        pv: ["e2e4"],
      },
    ],
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0].mate, 3, "white-to-move mate should pass through unchanged");
  assert.equal(lines[0].cp, 100000);
});

test("clientLinesToTrainingEngineLines skips illegal PVs", () => {
  const lines = converter.clientLinesToTrainingEngineLines({
    fen: STARTING_FEN,
    lines: [
      {
        rank: 1,
        depth: 12,
        cp: 34,
        mate: null,
        bestMove: "e2e5",
        pv: ["e2e5"],
      },
    ],
  });

  assert.deepEqual(lines, []);
});

test("clientLinesToTrainingEngineLines normalizes cp to white perspective for black to move", () => {
  // Black to move after 1.e4 — Stockfish reports cp from side-to-move (black) perspective.
  // If Stockfish says cp 600 (good for black), the UI expects cp -600 (white perspective).
  const BLACK_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

  const lines = converter.clientLinesToTrainingEngineLines({
    fen: BLACK_FEN,
    lines: [
      {
        rank: 1,
        depth: 15,
        cp: 35,
        mate: null,
        bestMove: "e7e5",
        pv: ["e7e5", "g1f3"],
      },
    ],
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0].cp, -35, "black-to-move cp should be negated for white perspective");
  assert.equal(lines[0].bestSan, "e5");
});

test("clientLinesToTrainingEngineLines normalizes mate to white perspective for black to move", () => {
  // Black to move with mate in 3 from black's perspective.
  // Stockfish reports mate +3 (black mates in 3). UI expects mate -3 (black is winning).
  const BLACK_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

  const lines = converter.clientLinesToTrainingEngineLines({
    fen: BLACK_FEN,
    lines: [
      {
        rank: 1,
        depth: 12,
        cp: null,
        mate: 3,
        bestMove: "d7d5",
        pv: ["d7d5"],
      },
    ],
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0].mate, -3, "black-to-move mate should be negated for white perspective");
  assert.equal(lines[0].cp, -100000, "mate fallback cp should also be white perspective");
});

test("clientLinesToTrainingEngineLines keeps white-to-move cp positive", () => {
  const lines = converter.clientLinesToTrainingEngineLines({
    fen: STARTING_FEN,
    lines: [
      {
        rank: 1,
        depth: 20,
        cp: 600,
        mate: null,
        bestMove: "e2e4",
        pv: ["e2e4"],
      },
    ],
  });

  assert.equal(lines[0].cp, 600, "white-to-move cp should stay positive");
});

test("clientLinesToTrainingEngineLines keeps white-to-move mate positive", () => {
  const lines = converter.clientLinesToTrainingEngineLines({
    fen: STARTING_FEN,
    lines: [
      {
        rank: 1,
        depth: 15,
        cp: null,
        mate: 5,
        bestMove: "e2e4",
        pv: ["e2e4"],
      },
    ],
  });

  assert.equal(lines[0].mate, 5, "white-to-move mate should stay positive");
  assert.equal(lines[0].cp, 100000);
});
