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

// ── Active mistake serving prelude validation ──────────────────────
// Simulates the candidate-validation loop in getNextActiveAppMistake:
// for each candidate, normalizeSetupPrelude is called with stored fields.

const { normalizeSetupPrelude } = require("../lib/training/setup-prelude.ts");

describe("active mistake prelude validation", () => {
  it("accepts a valid stored prelude (previousFen + playedMove → decisionFen)", () => {
    const prelude = normalizeSetupPrelude({
      fen: AFTER_E4,
      previousFen: START,
      playedMove: "e2e4",
    });
    assert.notEqual(prelude, null);
    assert.equal(prelude!.previousFen, START);
    assert.equal(prelude!.playedMove, "e2e4");
  });

  it("rejects a stored prelude where playedMove is illegal", () => {
    const prelude = normalizeSetupPrelude({
      fen: AFTER_E4,
      previousFen: START,
      playedMove: "e2e5", // illegal from start
    });
    assert.equal(prelude, null);
  });

  it("rejects a stored prelude where previousFen is invalid", () => {
    const prelude = normalizeSetupPrelude({
      fen: AFTER_E4,
      previousFen: "invalid_fen",
      playedMove: "e2e4",
    });
    assert.equal(prelude, null);
  });

  it("rejects missing previousFen", () => {
    const prelude = normalizeSetupPrelude({
      fen: AFTER_E4,
      previousFen: "",
      playedMove: "e2e4",
    });
    assert.equal(prelude, null);
  });

  it("rejects missing playedMove", () => {
    const prelude = normalizeSetupPrelude({
      fen: AFTER_E4,
      previousFen: START,
      playedMove: "",
    });
    assert.equal(prelude, null);
  });

  it("rejects a stored prelude that does not reach decisionFen", () => {
    // e2e4 from start reaches AFTER_E4, not AFTER_E4_NF6
    const prelude = normalizeSetupPrelude({
      fen: AFTER_E4_NF6,
      previousFen: START,
      playedMove: "e2e4",
    });
    assert.equal(prelude, null);
  });
});

describe("active mistake candidate filtering (simulated loop)", () => {
  it("returns first valid candidate, counts rejected invalid ones", () => {
    const candidates = [
      // Invalid: wrong move
      { decisionFen: AFTER_E4, setupPreviousFen: START, setupPlayedMoveUci: "e2e5" },
      // Valid: e2e4 from start → AFTER_E4
      { decisionFen: AFTER_E4, setupPreviousFen: START, setupPlayedMoveUci: "e2e4" },
      // Would be valid but first valid already found
      { decisionFen: AFTER_E4, setupPreviousFen: START, setupPlayedMoveUci: "e2e4" },
      // Missing prelude
      { decisionFen: AFTER_E4, setupPreviousFen: "", setupPlayedMoveUci: "" },
    ];

    let rejected = 0;
    let foundValid: typeof candidates[number] | null = null;

    for (const row of candidates) {
      const prelude = normalizeSetupPrelude({
        fen: row.decisionFen,
        previousFen: row.setupPreviousFen,
        playedMove: row.setupPlayedMoveUci,
      });
      if (!prelude) {
        rejected++;
        continue;
      }
      foundValid = row;
      break;
    }

    assert.equal(rejected, 1); // only the first (invalid) was rejected
    assert.notEqual(foundValid, null);
    assert.equal(foundValid!.setupPlayedMoveUci, "e2e4");
  });

  it("returns null when no candidate has a valid prelude", () => {
    const candidates = [
      { decisionFen: AFTER_E4, setupPreviousFen: START, setupPlayedMoveUci: "e2e5" },
      { decisionFen: AFTER_E4_NF6, setupPreviousFen: START, setupPlayedMoveUci: "e2e4" },
    ];

    let rejected = 0;

    for (const row of candidates) {
      const prelude = normalizeSetupPrelude({
        fen: row.decisionFen,
        previousFen: row.setupPreviousFen,
        playedMove: row.setupPlayedMoveUci,
      });
      if (!prelude) { rejected++; continue; }
      break;
    }

    assert.equal(rejected, 2);
  });

  it("rejects missing decisionFen even if other fields exist", () => {
    const prelude = normalizeSetupPrelude({
      fen: "",
      previousFen: START,
      playedMove: "e2e4",
    });
    assert.equal(prelude, null);
  });
});

// ── Active mistake scheduling tests ────────────────────────────────

const schedMod: typeof import("../lib/training/active-mistake-schedule") =
  require("../lib/training/active-mistake-schedule.ts");
const { getNextReviewAtForActiveMistake, nextConsecutiveCorrectCount } = schedMod;

describe("getNextReviewAtForActiveMistake", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  it("failure → 10 minutes", () => {
    const d = getNextReviewAtForActiveMistake({
      wasCorrect: false,
      consecutiveCorrectCountBefore: 0,
      now,
    });
    const diff = d.getTime() - now.getTime();
    assert.ok(diff >= 9.9 * 60 * 1000 && diff <= 10.1 * 60 * 1000, `diff=${diff}ms`);
  });

  it("failure resets regardless of previous streak", () => {
    const d = getNextReviewAtForActiveMistake({
      wasCorrect: false,
      consecutiveCorrectCountBefore: 5,
      now,
    });
    const diff = d.getTime() - now.getTime();
    assert.ok(diff >= 9.9 * 60 * 1000 && diff <= 10.1 * 60 * 1000);
  });

  it("0 correct → 1 day", () => {
    const d = getNextReviewAtForActiveMistake({
      wasCorrect: true,
      consecutiveCorrectCountBefore: 0,
      now,
    });
    const diff = d.getTime() - now.getTime();
    assert.ok(diff >= 0.99 * 24 * 60 * 60 * 1000 && diff <= 1.01 * 24 * 60 * 60 * 1000);
  });

  it("1 correct → 3 days", () => {
    const d = getNextReviewAtForActiveMistake({
      wasCorrect: true,
      consecutiveCorrectCountBefore: 1,
      now,
    });
    const diff = d.getTime() - now.getTime();
    assert.ok(diff >= 2.99 * 24 * 60 * 60 * 1000 && diff <= 3.01 * 24 * 60 * 60 * 1000);
  });

  it("2 correct → 7 days", () => {
    const d = getNextReviewAtForActiveMistake({
      wasCorrect: true,
      consecutiveCorrectCountBefore: 2,
      now,
    });
    const diff = d.getTime() - now.getTime();
    assert.ok(diff >= 6.99 * 24 * 60 * 60 * 1000 && diff <= 7.01 * 24 * 60 * 60 * 1000);
  });

  it("3+ correct → 7 days (capped)", () => {
    const d = getNextReviewAtForActiveMistake({
      wasCorrect: true,
      consecutiveCorrectCountBefore: 10,
      now,
    });
    const diff = d.getTime() - now.getTime();
    assert.ok(diff >= 6.99 * 24 * 60 * 60 * 1000 && diff <= 7.01 * 24 * 60 * 60 * 1000);
  });
});

describe("nextConsecutiveCorrectCount", () => {
  it("increments on correct", () => {
    assert.equal(nextConsecutiveCorrectCount(true, 0), 1);
    assert.equal(nextConsecutiveCorrectCount(true, 1), 2);
    assert.equal(nextConsecutiveCorrectCount(true, 5), 6);
  });

  it("resets to 0 on failure", () => {
    assert.equal(nextConsecutiveCorrectCount(false, 0), 0);
    assert.equal(nextConsecutiveCorrectCount(false, 3), 0);
    assert.equal(nextConsecutiveCorrectCount(false, 10), 0);
  });
});
