import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mod: typeof import("../lib/training/mistake-memory") =
  require("../lib/training/mistake-memory.ts");

const {
  normalizeDecisionFen,
  buildMoveKey,
  buildSessionAnnotations,
  upsertAnnotatedMove,
  updateNoteText,
  getAnnotationsForDecisionFen,
  isFailedClassification,
} = mod;

import type { AnnotatedMove } from "../lib/training/mistake-memory";

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

describe("buildMoveKey", () => {
  it("uses normalized decision FEN and UCI", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const key = buildMoveKey(fen, "g8f6");
    assert.equal(key, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -::g8f6");
  });

  it("produces the same key regardless of halfmove clock", () => {
    const fenA = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const fenB = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 6 42";
    assert.equal(buildMoveKey(fenA, "g8f6"), buildMoveKey(fenB, "g8f6"));
  });
});

describe("buildSessionAnnotations", () => {
  it("includes all user moves, not just failed ones", () => {
    const result = buildSessionAnnotations([
      { uci: "g1f3", san: "Nf3", classification: "mistake", cpLoss: 85, decisionFen: testFen() },
      { uci: "f1e2", san: "Be2", classification: "good", cpLoss: 20, decisionFen: testFen() },
    ]);
    assert.equal(Object.keys(result).length, 2);
  });

  it("uses moveKey as keys in the flat map", () => {
    const result = buildSessionAnnotations([
      { uci: "g1f3", san: "Nf3", decisionFen: testFen() },
    ]);
    const key = buildMoveKey(testFen(), "g1f3");
    assert.ok(result[key]);
    assert.equal(result[key].uci, "g1f3");
  });

  it("increments attemptCount and preserves noteText on re-upsert", () => {
    let result = buildSessionAnnotations([
      { uci: "g1f3", san: "Nf3", classification: "mistake", cpLoss: 85, decisionFen: testFen() },
    ]);
    const key = buildMoveKey(testFen(), "g1f3");
    // Manually set a note
    result = updateNoteText(result, key, "My note");
    assert.equal(result[key].noteText, "My note");
    assert.equal(result[key].attemptCount, 1);
    // Rebuild
    result = buildSessionAnnotations([
      { uci: "g1f3", san: "Nf3", classification: "blunder", cpLoss: 120, decisionFen: testFen() },
    ], result);
    assert.equal(result[key].attemptCount, 2);
    assert.equal(result[key].classification, "blunder");
    // noteText should be preserved
    assert.equal(result[key].noteText, "My note");
  });

  it("preserves existing entries when provided", () => {
    const key = buildMoveKey(testFen(), "b1c3");
    const existing: Record<string, AnnotatedMove> = {
      [key]: {
        moveKey: key,
        decisionFen: normalizeDecisionFen(testFen()),
        uci: "b1c3",
        san: "Nc3",
        attemptCount: 1,
        firstAttemptedAt: "2025-01-01T00:00:00Z",
        lastAttemptedAt: "2025-01-01T00:00:00Z",
        noteText: "Existing note",
      },
    };
    const result = buildSessionAnnotations([
      { uci: "g1f3", san: "Nf3", classification: "mistake", cpLoss: 85, decisionFen: testFen() },
    ], existing);
    // Existing entry preserved
    assert.equal(result[key].noteText, "Existing note");
    // New entry added
    const newKey = buildMoveKey(testFen(), "g1f3");
    assert.equal(result[newKey].uci, "g1f3");
    assert.equal(Object.keys(result).length, 2);
  });

  it("returns empty record for no inputs", () => {
    const result = buildSessionAnnotations([]);
    assert.deepEqual(result, {});
  });
});

describe("upsertAnnotatedMove", () => {
  it("adds a new annotated move", () => {
    const key = buildMoveKey(testFen(), "g1f3");
    const result = upsertAnnotatedMove({}, {
      moveKey: key,
      decisionFen: testFen(),
      uci: "g1f3",
      san: "Nf3",
      classification: "mistake",
      cpLoss: 85,
    });
    assert.ok(result[key]);
    assert.equal(result[key].attemptCount, 1);
    assert.equal(result[key].uci, "g1f3");
  });

  it("increments attemptCount and preserves noteText", () => {
    const key = buildMoveKey(testFen(), "g1f3");
    let result = upsertAnnotatedMove({}, {
      moveKey: key,
      decisionFen: testFen(),
      uci: "g1f3",
      san: "Nf3",
    });
    result = updateNoteText(result, key, "My note");
    result = upsertAnnotatedMove(result, {
      moveKey: key,
      decisionFen: testFen(),
      uci: "g1f3",
      classification: "blunder",
      cpLoss: 120,
    });
    assert.equal(result[key].attemptCount, 2);
    assert.equal(result[key].classification, "blunder");
    assert.equal(result[key].noteText, "My note");
  });
});

describe("updateNoteText", () => {
  it("updates note text for an existing move", () => {
    const key = buildMoveKey(testFen(), "g1f3");
    let result = buildSessionAnnotations([
      { uci: "g1f3", san: "Nf3", decisionFen: testFen() },
    ]);
    result = updateNoteText(result, key, "Should have developed the bishop.");
    assert.equal(result[key].noteText, "Should have developed the bishop.");
  });

  it("does nothing for a non-existent key", () => {
    const result = buildSessionAnnotations([]);
    const updated = updateNoteText(result, "nonexistent::key", "text");
    // Creates a minimal entry
    assert.ok(updated["nonexistent::key"]);
    assert.equal(updated["nonexistent::key"].noteText, "text");
  });

  it("is per-moveKey", () => {
    const keyA = buildMoveKey(testFen(), "g1f3");
    const keyB = buildMoveKey(testFen(), "f1e2");
    let result = buildSessionAnnotations([
      { uci: "g1f3", san: "Nf3", decisionFen: testFen() },
      { uci: "f1e2", san: "Be2", decisionFen: testFen() },
    ]);
    result = updateNoteText(result, keyA, "Note A");
    result = updateNoteText(result, keyB, "Note B");
    assert.equal(result[keyA].noteText, "Note A");
    assert.equal(result[keyB].noteText, "Note B");
  });
});

describe("getAnnotationsForDecisionFen", () => {
  it("returns all annotations for a normalized FEN", () => {
    const fenA = testFen();
    const fenB = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = buildSessionAnnotations([
      { uci: "g1f3", san: "Nf3", decisionFen: fenA },
      { uci: "f1e2", san: "Be2", decisionFen: fenA },
      { uci: "e2e4", san: "e4", decisionFen: fenB },
    ]);
    const fenANotes = getAnnotationsForDecisionFen(result, fenA);
    assert.equal(fenANotes.length, 2);
    const fenBNotes = getAnnotationsForDecisionFen(result, fenB);
    assert.equal(fenBNotes.length, 1);
  });

  it("returns empty array for FEN with no annotations", () => {
    const result = getAnnotationsForDecisionFen({}, testFen());
    assert.deepEqual(result, []);
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
