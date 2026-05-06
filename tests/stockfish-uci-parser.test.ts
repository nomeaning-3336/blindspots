const assert = require("node:assert/strict");
const test = require("node:test");
const parser = require("../lib/stockfish/uci-parser.ts");

test("parseUciInfoLine parses centipawn multipv output", () => {
  assert.deepEqual(
    parser.parseUciInfoLine("info depth 12 multipv 2 score cp 34 pv e2e4 e7e5 g1f3"),
    {
      rank: 2,
      depth: 12,
      cp: 34,
      mate: null,
      bestMove: "e2e4",
      pv: ["e2e4", "e7e5", "g1f3"],
    },
  );
});

test("parseUciInfoLine parses mate multipv output", () => {
  assert.deepEqual(
    parser.parseUciInfoLine("info depth 9 multipv 1 score mate -3 pv h4e1 g3h4"),
    {
      rank: 1,
      depth: 9,
      cp: null,
      mate: -3,
      bestMove: "h4e1",
      pv: ["h4e1", "g3h4"],
    },
  );
});

test("parseBestMove ignores empty bestmove", () => {
  assert.equal(parser.parseBestMove("bestmove e2e4 ponder e7e5"), "e2e4");
  assert.equal(parser.parseBestMove("bestmove (none)"), null);
});
