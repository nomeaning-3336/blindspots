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
  assert.equal(lines[0].mate, 3);
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
