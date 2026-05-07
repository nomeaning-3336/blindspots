import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mod: typeof import("../lib/training/mistake-memory") =
  require("../lib/training/mistake-memory.ts");

const {
  normalizeDecisionFen,
  createEmptyPositionMemory,
  upsertFailedMoveMemory,
  selectFailedMove,
  updateNoteBlock,
  appendBoardSnapshot,
  buildSessionMistakeMemories,
  isFailedClassification,
} = mod;

import type { PositionMistakeMemory } from "../lib/training/mistake-memory";

function testFen(extra = ""): string {
  return `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1${extra ? " " + extra : ""}`;
}

describe("normalizeDecisionFen", () => {
  it("strips halfmove clock and fullmove number", () => {
    const full = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    assert.equal(
      normalizeDecisionFen(full),
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -",
    );
  });

  it("returns 4-part FEN when given a 4-part FEN", () => {
    const fourPart = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
    assert.equal(normalizeDecisionFen(fourPart), fourPart);
  });

  it("trims whitespace", () => {
    assert.equal(
      normalizeDecisionFen("  rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1  "),
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
    );
  });

  it("produces consistent keys for the same board state", () => {
    const a = normalizeDecisionFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    const b = normalizeDecisionFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 6 42");
    assert.equal(a, b);
  });
});

describe("createEmptyPositionMemory", () => {
  it("creates a zero-move memory for the given FEN", () => {
    const fen = testFen();
    const mem = createEmptyPositionMemory(fen);
    assert.equal(mem.decisionFen, normalizeDecisionFen(fen));
    assert.deepEqual(mem.failedMoves, []);
    assert.equal(mem.selectedFailedMoveUci, undefined);
  });
});

describe("upsertFailedMoveMemory", () => {
  it("adds a new failed move", () => {
    const mem = createEmptyPositionMemory(testFen());
    const updated = upsertFailedMoveMemory(mem, {
      uci: "g1f3",
      san: "Nf3",
      classification: "mistake",
      cpLoss: 85,
    });
    assert.equal(updated.failedMoves.length, 1);
    assert.equal(updated.failedMoves[0].uci, "g1f3");
    assert.equal(updated.failedMoves[0].san, "Nf3");
    assert.equal(updated.failedMoves[0].classification, "mistake");
    assert.equal(updated.failedMoves[0].cpLoss, 85);
    assert.equal(updated.failedMoves[0].attemptCount, 1);
  });

  it("increments attemptCount on re-upsert", () => {
    let mem = createEmptyPositionMemory(testFen());
    mem = upsertFailedMoveMemory(mem, { uci: "g1f3", san: "Nf3" });
    mem = upsertFailedMoveMemory(mem, { uci: "g1f3", classification: "blunder", cpLoss: 120 });
    assert.equal(mem.failedMoves.length, 1);
    assert.equal(mem.failedMoves[0].attemptCount, 2);
    assert.equal(mem.failedMoves[0].classification, "blunder");
    assert.equal(mem.failedMoves[0].cpLoss, 120);
  });

  it("tracks multiple distinct failed moves", () => {
    let mem = createEmptyPositionMemory(testFen());
    mem = upsertFailedMoveMemory(mem, { uci: "g1f3", san: "Nf3" });
    mem = upsertFailedMoveMemory(mem, { uci: "f1e2", san: "Be2" });
    assert.equal(mem.failedMoves.length, 2);
  });
});

describe("selectFailedMove", () => {
  it("sets selectedFailedMoveUci for an existing move", () => {
    let mem = createEmptyPositionMemory(testFen());
    mem = upsertFailedMoveMemory(mem, { uci: "g1f3", san: "Nf3" });
    mem = upsertFailedMoveMemory(mem, { uci: "f1e2", san: "Be2" });
    mem = selectFailedMove(mem, "g1f3");
    assert.equal(mem.selectedFailedMoveUci, "g1f3");
  });

  it("clears selectedFailedMoveUci for a non-existent move", () => {
    let mem = createEmptyPositionMemory(testFen());
    mem = upsertFailedMoveMemory(mem, { uci: "g1f3", san: "Nf3" });
    mem = selectFailedMove(mem, "g1f3");
    assert.equal(mem.selectedFailedMoveUci, "g1f3");
    mem = selectFailedMove(mem, "nonexistent");
    assert.equal(mem.selectedFailedMoveUci, undefined);
  });
});

describe("updateNoteBlock", () => {
  it("adds a text note to a failed move", () => {
    let mem = createEmptyPositionMemory(testFen());
    mem = upsertFailedMoveMemory(mem, { uci: "g1f3", san: "Nf3" });
    mem = updateNoteBlock(mem, "g1f3", "Should have developed the bishop first.", "2025-01-01T00:00:00Z");
    const move = mem.failedMoves[0];
    const textBlocks = move.notes.filter((n) => n.type === "text");
    assert.equal(textBlocks.length, 1);
    if (textBlocks[0]?.type === "text") {
      assert.equal(textBlocks[0].text, "Should have developed the bishop first.");
      assert.equal(textBlocks[0].updatedAt, "2025-01-01T00:00:00Z");
    }
  });

  it("overwrites existing text note", () => {
    let mem = createEmptyPositionMemory(testFen());
    mem = upsertFailedMoveMemory(mem, { uci: "g1f3", san: "Nf3" });
    mem = updateNoteBlock(mem, "g1f3", "Version 1", "2025-01-01T00:00:00Z");
    mem = updateNoteBlock(mem, "g1f3", "Version 2", "2025-06-01T00:00:00Z");
    const textBlocks = mem.failedMoves[0].notes.filter((n) => n.type === "text");
    assert.equal(textBlocks.length, 1);
    if (textBlocks[0]?.type === "text") {
      assert.equal(textBlocks[0].text, "Version 2");
    }
  });

  it("does nothing for a non-existent UCI", () => {
    const mem = createEmptyPositionMemory(testFen());
    const result = updateNoteBlock(mem, "nonexistent", "text");
    assert.deepEqual(result, mem);
  });
});

describe("appendBoardSnapshot", () => {
  it("appends a board-snapshot block", () => {
    let mem = createEmptyPositionMemory(testFen());
    mem = upsertFailedMoveMemory(mem, { uci: "g1f3", san: "Nf3" });
    mem = appendBoardSnapshot(
      mem,
      "g1f3",
      { fen: testFen(), lastMove: { from: "g1", to: "f3" }, orientation: "white" },
      "2025-01-01T00:00:00Z",
    );
    const snapshots = mem.failedMoves[0].notes.filter((n) => n.type === "board-snapshot");
    assert.equal(snapshots.length, 1);
    if (snapshots[0]?.type === "board-snapshot") {
      assert.equal(snapshots[0].fen, testFen());
      assert.deepEqual(snapshots[0].lastMove, { from: "g1", to: "f3" });
      assert.equal(snapshots[0].orientation, "white");
    }
  });

  it("does nothing for a non-existent UCI", () => {
    const mem = createEmptyPositionMemory(testFen());
    const result = appendBoardSnapshot(mem, "nonexistent", { fen: testFen() });
    assert.deepEqual(result, mem);
  });
});

describe("buildSessionMistakeMemories", () => {
  it("builds memories from failed moves only", () => {
    const result = buildSessionMistakeMemories([
      { uci: "g1f3", san: "Nf3", classification: "mistake", cpLoss: 85, decisionFen: testFen() },
      { uci: "f1e2", san: "Be2", classification: "good", cpLoss: 20, decisionFen: testFen() },
    ]);
    const normFen = normalizeDecisionFen(testFen());
    assert.ok(result[normFen]);
    assert.equal(result[normFen].failedMoves.length, 1);
    assert.equal(result[normFen].failedMoves[0].uci, "g1f3");
  });

  it("preserves existing entries when provided", () => {
    const normFen = normalizeDecisionFen(testFen());
    const existing: Record<string, PositionMistakeMemory> = {
      [normFen]: {
        decisionFen: normFen,
        failedMoves: [{
          uci: "b1c3",
          san: "Nc3",
          attemptCount: 1,
          firstAttemptedAt: "2025-01-01T00:00:00Z",
          lastAttemptedAt: "2025-01-01T00:00:00Z",
          notes: [],
        }],
      },
    };
    const result = buildSessionMistakeMemories(
      [{ uci: "g1f3", san: "Nf3", classification: "mistake", cpLoss: 85, decisionFen: testFen() }],
      existing,
    );
    assert.equal(result[normFen].failedMoves.length, 2);
  });

  it("returns empty record for no failed moves", () => {
    const result = buildSessionMistakeMemories([
      { uci: "g1f3", san: "Nf3", classification: "good", decisionFen: testFen() },
    ]);
    assert.deepEqual(result, {});
  });
});

describe("isFailedClassification", () => {
  it("returns true for inaccuracy, mistake, blunder", () => {
    assert.equal(isFailedClassification("inaccuracy"), true);
    assert.equal(isFailedClassification("mistake"), true);
    assert.equal(isFailedClassification("blunder"), true);
  });

  it("returns false for non-fail classifications", () => {
    assert.equal(isFailedClassification("best"), false);
    assert.equal(isFailedClassification("excellent"), false);
    assert.equal(isFailedClassification("good"), false);
    assert.equal(isFailedClassification("okay"), false);
    assert.equal(isFailedClassification("brilliant"), false);
    assert.equal(isFailedClassification("critical"), false);
  });

  it("returns false for undefined or empty string", () => {
    assert.equal(isFailedClassification(undefined), false);
    assert.equal(isFailedClassification(""), false);
  });
});
