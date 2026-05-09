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

// ── Real extraction tests ──────────────────────────────────────────
// Load the real extraction module (uses .ts extensions so Node resolves the chain).

const extMod: typeof import("../lib/training/mistake-extraction") =
  require("../lib/training/mistake-extraction.ts");
const { extractMineableMistakesFromSequence } = extMod;

// ── Legal chess positions for prelude tests ────────────────────────
// All FENs generated by chess.js 1.4.0 to match normalizeSetupPrelude output.

/** Start position: white to move. */
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/** After 1.e4: black to move (chess.js omits phantom en passant). */
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
/** After 1.e4 Nf6 (Alekhine): white to move. */
const AFTER_E4_NF6 = "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2";
/** After 1.e4 d5 (Scandinavian): white to move. */
const AFTER_E4_D5 = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
/** After 1.e4 Nf6 2.d4: black to move. */
const AFTER_E4_NF6_D4 = "rnbqkb1r/pppppppp/5n2/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2";
/** After 1.e4 Nf6 2.d4 d6: white to move. */
const AFTER_E4_NF6_D4_D6 = "rnbqkb1r/ppp1pppp/3p1n2/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3";
/** After 1.e4 Nf6 2.d4 d6 3.Bc4: black to move. */
const AFTER_E4_NF6_D4_D6_BC4 = "rnbqkb1r/ppp1pppp/3p1n2/8/2BPP3/8/PPP2PPP/RNBQK1NR b KQkq - 1 3";

describe("extractMineableMistakesFromSequence", () => {
  it("captures explicit prelude for first move when valid", () => {
    // Served position prelude: 1.e4 from start → AFTER_E4.
    // User blunders with ...d5 from AFTER_E4.
    const result = extractMineableMistakesFromSequence([{
      decisionFen: AFTER_E4,
      uci: "d7d5",
      san: "d5",
      classification: "blunder",
      cpLoss: 350,
      evalBefore: 40,
      evalAfter: -310,
      fenAfterUserMove: AFTER_E4_D5,
      previousDecisionFen: START,
      previousMoveUci: "e2e4",
    }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].setupPreviousFen, START);
    assert.equal(result[0].setupPlayedMoveUci, "e2e4");
  });

  it("ignores invalid explicit prelude (move does not reach decisionFen)", () => {
    // e2e4 from START reaches AFTER_E4, not AFTER_E4_NF6 (which needs ...Nf6 after e4).
    const result = extractMineableMistakesFromSequence([{
      decisionFen: AFTER_E4_NF6,
      uci: "d2d4",
      san: "d4",
      classification: "blunder",
      cpLoss: 350,
      evalBefore: 40,
      evalAfter: -310,
      fenAfterUserMove: AFTER_E4_NF6_D4,
      previousDecisionFen: START,
      previousMoveUci: "e2e4",
    }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].setupPreviousFen, null);
    assert.equal(result[0].setupPlayedMoveUci, null);
  });

  it("still mines when explicit prelude is invalid (does not skip the mistake)", () => {
    const result = extractMineableMistakesFromSequence([{
      decisionFen: AFTER_E4_NF6,
      uci: "d2d4",
      san: "d4",
      classification: "blunder",
      cpLoss: 350,
      evalBefore: 40,
      evalAfter: -310,
      fenAfterUserMove: AFTER_E4_NF6_D4,
      previousDecisionFen: START,
      previousMoveUci: "e2e4", // wrong move — does not reach AFTER_E4_NF6
    }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].uci, "d2d4");
    assert.equal(result[0].classification, "blunder");
  });

  it("infers opponent move prelude for i > 0", () => {
    // input[0]: user played e4 from start (non-failed).
    // opponent replies ...Nf6 → decisionFen[1] = AFTER_E4_NF6.
    // input[1]: user blunders with d4.
    const result = extractMineableMistakesFromSequence([
      {
        decisionFen: START,
        uci: "e2e4",
        san: "e4",
        classification: "good",
        cpLoss: 5,
        evalBefore: 40,
        evalAfter: 35,
        fenAfterUserMove: AFTER_E4,
      },
      {
        decisionFen: AFTER_E4_NF6,
        uci: "d2d4",
        san: "d4",
        classification: "blunder",
        cpLoss: 350,
        evalBefore: 40,
        evalAfter: -310,
        fenAfterUserMove: AFTER_E4_NF6_D4,
      },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].setupPreviousFen, AFTER_E4);
    assert.equal(result[0].setupPlayedMoveUci, "g8f6");
    assert.equal(result[0].setupPlayedMoveSan, null);
  });

  it("skips non-failed moves during extraction", () => {
    const result = extractMineableMistakesFromSequence([
      {
        decisionFen: START,
        uci: "e2e4",
        san: "e4",
        classification: "good",
        cpLoss: 5,
        fenAfterUserMove: AFTER_E4,
      },
      {
        decisionFen: AFTER_E4_NF6,
        uci: "e4e5",
        san: "e5",
        classification: "okay",
        cpLoss: 25,
        fenAfterUserMove: "rnbqkb1r/pppppppp/5n2/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2",
      },
    ]);
    assert.equal(result.length, 0);
  });

  it("returns empty for empty input", () => {
    assert.equal(extractMineableMistakesFromSequence([]).length, 0);
  });

  it("mines multiple failed moves in one sequence", () => {
    // 1.e4 (good), 2.d4?! (blunder), 3.Bc4?! (mistake)
    const result = extractMineableMistakesFromSequence([
      {
        decisionFen: START,
        uci: "e2e4",
        san: "e4",
        classification: "good",
        cpLoss: 5,
        fenAfterUserMove: AFTER_E4,
      },
      {
        decisionFen: AFTER_E4_NF6,
        uci: "d2d4",
        san: "d4",
        classification: "blunder",
        cpLoss: 350,
        evalBefore: 40,
        evalAfter: -310,
        fenAfterUserMove: AFTER_E4_NF6_D4,
      },
      {
        decisionFen: AFTER_E4_NF6_D4_D6,
        uci: "f1c4",
        san: "Bc4",
        classification: "mistake",
        cpLoss: 180,
        evalBefore: 40,
        evalAfter: -140,
        fenAfterUserMove: AFTER_E4_NF6_D4_D6_BC4,
      },
    ]);
    assert.equal(result.length, 2);
    assert.equal(result[0].classification, "blunder");
    assert.equal(result[1].classification, "mistake");
  });
});

// ── Extraction input contract (type shape verification) ────────────

describe("extraction input contract", () => {
  it("mineable inputs with explicit prelude pass through previousDecisionFen/previousMoveUci", () => {
    const input: MineableMoveInput = {
      decisionFen: AFTER_E4,
      uci: "d7d5",
      san: "d5",
      classification: "blunder",
      cpLoss: 350,
      evalBefore: 40,
      evalAfter: -310,
      fenAfterUserMove: AFTER_E4_D5,
      previousDecisionFen: START,
      previousMoveUci: "e2e4",
      previousMoveSan: "e4",
    };
    assert.equal(input.previousDecisionFen, START);
    assert.equal(input.previousMoveUci, "e2e4");
    assert.equal(isMineableUserMistake(input.classification), true);
  });

  it("mineable inputs without explicit prelude have null previousDecisionFen", () => {
    const input = mineableInput({ classification: "blunder", cpLoss: 350 });
    assert.equal(input.previousDecisionFen ?? null, null);
    assert.equal(input.previousMoveUci ?? null, null);
    assert.equal(isMineableUserMistake(input.classification), true);
  });
});
