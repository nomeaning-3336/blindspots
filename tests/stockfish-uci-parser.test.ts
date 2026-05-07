const assert = require("node:assert/strict");
const test = require("node:test");
const parser = require("../lib/stockfish/uci-parser.ts");
const clientSnapshots = require("../lib/stockfish/client-line-snapshots.ts");

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

test("selectCoherentClientLines keeps deepest complete MultiPV snapshot", () => {
  const linesByRank = new Map([
    [1, { rank: 1, depth: 22, cp: 36, mate: null, bestMove: "e2e4", pv: ["e2e4", "c7c5"] }],
    [2, { rank: 2, depth: 13, cp: 28, mate: null, bestMove: "d2d4", pv: ["d2d4", "d7d5"] }],
    [3, { rank: 3, depth: 13, cp: 24, mate: null, bestMove: "g1f3", pv: ["g1f3", "d7d5"] }],
    [4, { rank: 4, depth: 13, cp: 22, mate: null, bestMove: "c2c4", pv: ["c2c4", "e7e5"] }],
    [5, { rank: 5, depth: 13, cp: 19, mate: null, bestMove: "b1c3", pv: ["b1c3", "g8f6"] }],
  ]);
  const history = [
    { rank: 1, depth: 13, cp: 32, mate: null, bestMove: "e2e4", pv: ["e2e4", "e7e5"] },
    ...linesByRank.values(),
  ];

  const selected = clientSnapshots.selectCoherentClientLines(linesByRank, history, 5);

  assert.deepEqual(selected.map((line) => line.depth), [13, 13, 13, 13, 13]);
  assert.deepEqual(selected.map((line) => line.bestMove), ["e2e4", "d2d4", "g1f3", "c2c4", "b1c3"]);
});

test("selectCoherentClientLines returns no mixed snapshot when no depth is complete", () => {
  const linesByRank = new Map([
    [1, { rank: 1, depth: 22, cp: 36, mate: null, bestMove: "e2e4", pv: ["e2e4", "c7c5"] }],
    [2, { rank: 2, depth: 13, cp: 28, mate: null, bestMove: "d2d4", pv: ["d2d4", "d7d5"] }],
    [3, { rank: 3, depth: 13, cp: 24, mate: null, bestMove: "g1f3", pv: ["g1f3", "d7d5"] }],
    [4, { rank: 4, depth: 13, cp: 22, mate: null, bestMove: "c2c4", pv: ["c2c4", "e7e5"] }],
    [5, { rank: 5, depth: 3, cp: 19, mate: null, bestMove: "b1c3", pv: ["b1c3", "g8f6"] }],
  ]);

  const selected = clientSnapshots.selectCoherentClientLines(linesByRank, [...linesByRank.values()], 5);

  assert.deepEqual(selected, []);
});
