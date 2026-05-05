const assert = require("node:assert/strict");
const test = require("node:test");
const postmortem: typeof import("../lib/training/postmortem-view-model") = require("../lib/training/postmortem-view-model.ts");
const trainingBoardUi: typeof import("../lib/training-board-ui") = require("../lib/training-board-ui.ts");

const {
  buildCanonicalPostmortemMoves,
  getAuthoritativeMoveClassification,
  getCanonicalMoveForPosition,
  uciFromMove,
} = postmortem;
const { classificationLabel } = trainingBoardUi;

const fen = "rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2";

test("postmortem model uses moveScore classification as source of truth", () => {
  const [canonical] = buildCanonicalPostmortemMoves({
    positions: [{
      index: 1,
      fen,
      label: "2... Nc6",
      kind: "user",
      move: { san: "Nc6", uci: "b8c6", side: "black", classification: "okay" },
    }],
    moveScores: [{
      userMoveIndex: 0,
      cpLoss: 56,
      evalBefore: -50,
      evalAfter: 6,
      classification: "inaccuracy",
    }],
    userMoveIndexByPositionIndex: new Map([[1, 0]]),
  });

  assert.equal(canonical.classification, "inaccuracy");
  assert.equal(canonical.tableRow?.classification, "inaccuracy");
  assert.equal(canonical.chartPoint?.classification, "inaccuracy");
  assert.equal(canonical.boardHighlight?.classification, "inaccuracy");
  assert.equal(canonical.boardBadge?.label, "Inaccuracy");
  assert.match(canonical.boardBadge?.icon ?? "", /inaccuracy/);
  assert.equal(canonical.cpLoss, 56);
  assert.equal(canonical.evalBefore, -50);
  assert.equal(canonical.evalAfter, 6);
});

test("postmortem model does not flip display evals for black", () => {
  const [canonical] = buildCanonicalPostmortemMoves({
    positions: [{
      index: 1,
      fen,
      label: "2... Nc6",
      kind: "user",
      move: { san: "Nc6", uci: "b8c6", side: "black" },
    }],
    moveScores: [{
      userMoveIndex: 0,
      cpLoss: 60,
      evalBefore: -50,
      evalAfter: 10,
      classification: "inaccuracy",
    }],
    userMoveIndexByPositionIndex: new Map([[1, 0]]),
  });

  assert.equal(canonical.tableRow?.evalBefore, -50);
  assert.equal(canonical.tableRow?.evalAfter, 10);
  assert.equal(canonical.tableRow?.cpLoss, 60);
  assert.equal(canonical.tableRow?.classification, "inaccuracy");
});

test("user move with moveScore always gets board badge and classified highlight", () => {
  const [canonical] = buildCanonicalPostmortemMoves({
    positions: [{
      index: 1,
      fen,
      label: "1. e4",
      kind: "user",
      move: { san: "e4", uci: "e2e4", side: "white" },
    }],
    moveScores: [{ userMoveIndex: 0, cpLoss: 0, classification: "best" }],
    userMoveIndexByPositionIndex: new Map([[1, 0]]),
  });

  assert.notEqual(canonical.boardBadge, null);
  assert.equal(canonical.boardBadge?.label, "Best");
  assert.notEqual(canonical.boardHighlight, null);
  assert.equal(canonical.boardHighlight?.from, "e2");
  assert.equal(canonical.boardHighlight?.to, "e4");
  assert.equal(canonical.boardHighlight?.classification, "best");
});

test("move classification is consistent across board, chart, and table for every classification", () => {
  const classifications = [
    "brilliant",
    "critical",
    "best",
    "excellent",
    "good",
    "okay",
    "inaccuracy",
    "mistake",
    "blunder",
  ] as const;

  for (const classification of classifications) {
    const [canonical] = buildCanonicalPostmortemMoves({
      positions: [{
        index: 1,
        fen,
        label: "1. e4",
        kind: "user",
        move: { san: "e4", uci: "e2e4", side: "white", classification },
      }],
      moveScores: [],
      userMoveIndexByPositionIndex: new Map([[1, 0]]),
    });

    assert.equal(canonical.boardBadge?.label, classificationLabel(classification));
    assert.equal(canonical.boardHighlight?.classification, classification);
    assert.equal(canonical.chartPoint?.classification, classification);
    assert.equal(canonical.tableRow?.classification, classification);
  }
});

test("engine move with explicit classification gets badge and highlight", () => {
  const [canonical] = buildCanonicalPostmortemMoves({
    positions: [{
      index: 1,
      fen,
      label: "2... Nge7",
      kind: "engine",
      move: { san: "Nge7", uci: "g8e7", side: "black", classification: "best" },
    }],
    moveScores: [],
  });

  assert.equal(canonical.classification, "best");
  assert.equal(canonical.boardBadge?.label, "Best");
  assert.equal(canonical.boardHighlight?.classification, "best");
});

test("engine move without classification does not invent badge", () => {
  const [canonical] = buildCanonicalPostmortemMoves({
    positions: [{
      index: 1,
      fen,
      label: "2... Nf6",
      kind: "engine",
      move: { san: "Nf6", uci: "g8f6", side: "black" },
    }],
    moveScores: [],
  });

  assert.equal(canonical.classification, undefined);
  assert.equal(canonical.boardBadge, null);
  assert.equal(canonical.boardHighlight?.classification, undefined);
  assert.equal(canonical.tableRow?.classification, undefined);
});

test("invalid UCI does not crash and does not create board highlight", () => {
  assert.deepEqual(uciFromMove({ uci: "bad" }), { from: null, to: null });

  assert.doesNotThrow(() => buildCanonicalPostmortemMoves({
    positions: [{
      index: 1,
      fen,
      label: "bad",
      kind: "user",
      move: { san: "bad", uci: "bad", side: "white", classification: "mistake" },
    }],
    moveScores: [],
  }));

  const [canonical] = buildCanonicalPostmortemMoves({
    positions: [{
      index: 1,
      fen,
      label: "bad",
      kind: "user",
      move: { san: "bad", uci: "bad", side: "white", classification: "mistake" },
    }],
    moveScores: [],
  });
  assert.notEqual(canonical.boardBadge, null);
  assert.equal(canonical.boardHighlight, null);
});

test("position without move produces null table row and null badge", () => {
  const [canonical] = buildCanonicalPostmortemMoves({
    positions: [{ index: 0, fen, label: "Start", kind: "setup" }],
    moveScores: [],
  });

  assert.equal(canonical.move, null);
  assert.equal(canonical.tableRow, null);
  assert.equal(canonical.boardBadge, null);
  assert.equal(canonical.boardHighlight, null);
});

test("pitchIndex/userMoveIndex mapping links correct moveScore to correct position", () => {
  const canonical = buildCanonicalPostmortemMoves({
    positions: [
      { index: 1, fen, label: "2. f4", kind: "user", move: { san: "f4", uci: "f2f4", side: "white" } },
      { index: 2, fen, label: "2... d5", kind: "engine", move: { san: "d5", uci: "d7d5", side: "black" } },
      { index: 3, fen, label: "3. Nf3", kind: "user", move: { san: "Nf3", uci: "g1f3", side: "white" } },
    ],
    moveScores: [
      { userMoveIndex: 0, cpLoss: 0, classification: "best" },
      { userMoveIndex: 1, cpLoss: 56, classification: "inaccuracy" },
    ],
    userMoveIndexByPositionIndex: new Map([[1, 0], [3, 1]]),
  });

  assert.equal(canonical[0].classification, "best");
  assert.equal(canonical[1].hasScore, false);
  assert.equal(canonical[1].classification, undefined);
  assert.equal(canonical[2].classification, "inaccuracy");
  assert.equal(getCanonicalMoveForPosition({
    positions: canonical.map((move) => ({
      index: move.positionIndex,
      fen: move.fen,
      label: move.san ?? "",
      move: move.move ?? undefined,
      kind: move.kind,
    })),
    moveScores: [
      { userMoveIndex: 0, cpLoss: 0, classification: "best" },
      { userMoveIndex: 1, cpLoss: 56, classification: "inaccuracy" },
    ],
    activePositionIndex: 3,
    userMoveIndexByPositionIndex: new Map([[1, 0], [3, 1]]),
  })?.classification, "inaccuracy");
});

test("fallback move classification is used only when moveScore is absent", () => {
  assert.equal(
    getAuthoritativeMoveClassification({
      move: { classification: "good" },
      moveScore: null,
    }),
    "good",
  );
  assert.equal(
    getAuthoritativeMoveClassification({
      move: { classification: "good" },
      moveScore: { classification: "mistake" },
    }),
    "mistake",
  );
});
