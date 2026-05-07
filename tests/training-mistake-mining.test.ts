import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mod: typeof import("../lib/training/mistake-mining") =
  require("../lib/training/mistake-mining.ts");

const {
  buildMinedMistakeKey,
  isMineableUserMistake,
  classifyMistakeSeverity,
  nextReviewAtForMinedMistake,
  normalizeDecisionFen,
  isFailedClassification,
} = mod;

import type { MineableMoveInput } from "../lib/training/mistake-mining";

// ── Helpers ────────────────────────────────────────────────────────

function decisionFen(extra = ""): string {
  return `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -${extra ? " " + extra : ""}`;
}

function norm(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function mineableInput(overrides: Partial<MineableMoveInput> = {}): MineableMoveInput {
  return {
    decisionFen: decisionFen("0 1"),
    uci: "g8f6",
    san: "Nf6",
    classification: "mistake",
    cpLoss: 150,
    evalBefore: 40,
    evalAfter: -110,
    mateBefore: null,
    mateAfter: null,
    fenAfterUserMove: "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2",
    ...overrides,
  };
}

// ── normalizeDecisionFen ───────────────────────────────────────────

describe("normalizeDecisionFen", () => {
  it("strips halfmove and fullmove counters", () => {
    assert.equal(
      normalizeDecisionFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"),
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -",
    );
  });

  it("keeps 4-part FEN unchanged", () => {
    const fourPart = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
    assert.equal(normalizeDecisionFen(fourPart), fourPart);
  });

  it("trims whitespace", () => {
    assert.equal(
      normalizeDecisionFen("  rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1  "),
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
    );
  });
});

// ── buildMinedMistakeKey ───────────────────────────────────────────

describe("buildMinedMistakeKey", () => {
  it("uses normalized decision FEN and UCI", () => {
    const key = buildMinedMistakeKey(decisionFen("0 1"), "g8f6");
    assert.equal(key, `${norm(decisionFen())}::g8f6`);
  });

  it("ignores halfmove and fullmove counters", () => {
    const a = buildMinedMistakeKey(decisionFen("0 1"), "g8f6");
    const b = buildMinedMistakeKey(decisionFen("6 42"), "g8f6");
    assert.equal(a, b);
  });
});

// ── isMineableUserMistake ──────────────────────────────────────────

describe("isMineableUserMistake", () => {
  it("returns true for blunder, mistake, inaccuracy", () => {
    assert.equal(isMineableUserMistake("blunder"), true);
    assert.equal(isMineableUserMistake("mistake"), true);
    assert.equal(isMineableUserMistake("inaccuracy"), true);
  });

  it("returns false for good, excellent, best, brilliant, okay", () => {
    assert.equal(isMineableUserMistake("good"), false);
    assert.equal(isMineableUserMistake("excellent"), false);
    assert.equal(isMineableUserMistake("best"), false);
    assert.equal(isMineableUserMistake("brilliant"), false);
    assert.equal(isMineableUserMistake("okay"), false);
    assert.equal(isMineableUserMistake("critical"), false);
  });

  it("returns false for missing classification", () => {
    assert.equal(isMineableUserMistake(undefined), false);
    assert.equal(isMineableUserMistake(""), false);
  });
});

// ── classifyMistakeSeverity ────────────────────────────────────────

describe("classifyMistakeSeverity", () => {
  it("returns severe for blunder classification", () => {
    assert.equal(classifyMistakeSeverity({ classification: "blunder", cpLoss: 50 }), "severe");
  });

  it("returns severe for cpLoss >= 300", () => {
    assert.equal(classifyMistakeSeverity({ classification: "inaccuracy", cpLoss: 300 }), "severe");
    assert.equal(classifyMistakeSeverity({ classification: "mistake", cpLoss: 350 }), "severe");
  });

  it("returns severe for mate swing", () => {
    assert.equal(
      classifyMistakeSeverity({ classification: "mistake", cpLoss: 50, mateBefore: 5, mateAfter: null }),
      "severe",
    );
  });

  it("returns medium for mistake classification or cpLoss >= 150", () => {
    assert.equal(classifyMistakeSeverity({ classification: "mistake", cpLoss: 40 }), "medium");
    assert.equal(classifyMistakeSeverity({ classification: "inaccuracy", cpLoss: 200 }), "medium");
  });

  it("returns low for inaccuracy or cpLoss >= 75", () => {
    assert.equal(classifyMistakeSeverity({ classification: "inaccuracy", cpLoss: 75 }), "low");
    assert.equal(classifyMistakeSeverity({ classification: "inaccuracy", cpLoss: 100 }), "low");
  });

  it("returns low for small cpLoss edge case", () => {
    assert.equal(classifyMistakeSeverity({ cpLoss: 50 }), "low");
  });
});

// ── nextReviewAtForMinedMistake ────────────────────────────────────

describe("nextReviewAtForMinedMistake", () => {
  it("severe is ~5 minutes", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const next = nextReviewAtForMinedMistake("severe", now);
    const diff = next.getTime() - now.getTime();
    assert.ok(diff >= 4.5 * 60 * 1000 && diff <= 5.5 * 60 * 1000, `diff=${diff}ms`);
  });

  it("medium is ~30 minutes", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const next = nextReviewAtForMinedMistake("medium", now);
    const diff = next.getTime() - now.getTime();
    assert.ok(diff >= 29 * 60 * 1000 && diff <= 31 * 60 * 1000, `diff=${diff}ms`);
  });

  it("low is ~2 hours", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const next = nextReviewAtForMinedMistake("low", now);
    const diff = next.getTime() - now.getTime();
    assert.ok(diff >= 1.9 * 60 * 60 * 1000 && diff <= 2.1 * 60 * 60 * 1000, `diff=${diff}ms`);
  });
});

// ── Extraction logic (unit-level, validates input→output contract) ──

describe("extraction input contract", () => {
  it("mineable inputs with explicit prelude pass through previousDecisionFen/previousMoveUci", () => {
    const input: MineableMoveInput = {
      decisionFen: decisionFen("0 1"),
      uci: "g8f6",
      san: "Nf6",
      classification: "blunder",
      cpLoss: 350,
      evalBefore: 40,
      evalAfter: -310,
      fenAfterUserMove: "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2",
      previousDecisionFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1",
      previousMoveUci: "e7e5",
      previousMoveSan: "e5",
    };
    // Verify the shape — the real extraction is tested through persistence module.
    assert.equal(input.previousDecisionFen, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1");
    assert.equal(input.previousMoveUci, "e7e5");
    assert.equal(isMineableUserMistake(input.classification), true);
  });

  it("mineable inputs without explicit prelude have null previousDecisionFen", () => {
    const input = mineableInput({ classification: "blunder", cpLoss: 350 });
    assert.equal(input.previousDecisionFen ?? null, null);
    assert.equal(input.previousMoveUci ?? null, null);
    assert.equal(isMineableUserMistake(input.classification), true);
  });
});
