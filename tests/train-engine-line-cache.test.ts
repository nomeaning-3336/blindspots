const assert = require("node:assert/strict");
const test = require("node:test");
const cache: typeof import("../lib/training/engine-line-cache") =
  require("../lib/training/engine-line-cache.ts");

const {
  buildDeepestEngineLineMap,
  chooseDeeperEngineLine,
  engineMoveLineKey,
  mergePieceLinesWithDeeperKnownLines,
} = cache;

const fenA = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const fenB = "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

function line(overrides: Partial<cache.CachedEngineLine> = {}): cache.CachedEngineLine {
  return {
    cp: 20,
    depth: 18,
    rank: 1,
    bestMove: "g8f6",
    bestSan: "Nf6",
    pv: ["g8f6"],
    pvSan: ["Nf6"],
    ...overrides,
  };
}

test("deeper cached top engine line beats shallower clicked-piece result", () => {
  const clicked = line({ depth: 12, cp: -80, classification: "mistake", pv: ["g8f6"] });
  const cached = line({ depth: 24, cp: 30, classification: "best", pv: ["g8f6", "b1c3"] });

  assert.deepEqual(
    mergePieceLinesWithDeeperKnownLines({
      fen: fenA,
      square: "g8",
      pieceLines: [clicked],
      knownLineLists: [[cached]],
    }),
    [cached],
  );
});

test("clicked-piece result may replace top line when deeper", () => {
  const cached = line({ depth: 18, cp: 30, classification: "best" });
  const clicked = line({ depth: 26, cp: 12, classification: "excellent", pv: ["g8f6", "b1c3"] });

  assert.deepEqual(
    mergePieceLinesWithDeeperKnownLines({
      fen: fenA,
      square: "g8",
      pieceLines: [clicked],
      knownLineLists: [[cached]],
    }),
    [clicked],
  );
});

test("equal depth prefers non-empty PV", () => {
  const emptyPv = line({ depth: 20, pv: [], pvSan: [], classification: "okay" });
  const withPv = line({ depth: 20, pv: ["g8f6", "b1c3"], pvSan: ["Nf6", "Nc3"], classification: "good" });

  assert.deepEqual(chooseDeeperEngineLine(emptyPv, withPv), withPv);
  assert.deepEqual(
    buildDeepestEngineLineMap(fenA, [[emptyPv], [withPv]]).get(engineMoveLineKey(fenA, "g8f6")),
    withPv,
  );
});

test("piece merge keeps all legal moves from clicked square and excludes other square", () => {
  const clicked = [
    line({ bestMove: "g8f6", depth: 18 }),
    line({ bestMove: "g8e7", bestSan: "Nge7", depth: 18, rank: 2 }),
  ];
  const known = [
    line({ bestMove: "g8h6", bestSan: "Nh6", depth: 22, rank: 3 }),
    line({ bestMove: "b8c6", bestSan: "Nc6", depth: 30, rank: 1 }),
  ];

  const merged = mergePieceLinesWithDeeperKnownLines({
    fen: fenA,
    square: "g8",
    pieceLines: clicked,
    knownLineLists: [known],
  });

  assert.deepEqual(merged.map((entry) => entry.bestMove), ["g8f6", "g8e7", "g8h6"]);
});

test("cache key includes full FEN and move", () => {
  assert.notEqual(engineMoveLineKey(fenA, "g8f6"), engineMoveLineKey(fenB, "g8f6"));
  assert.notEqual(engineMoveLineKey(fenA, "g8f6"), engineMoveLineKey(fenA, "g8h6"));
  assert.equal(engineMoveLineKey(fenA, "g8f6"), `${fenA}::g8f6`);
});
