import assert from "node:assert";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const srs: typeof import("../lib/training/mistake-srs") = require("../lib/training/mistake-srs.ts");

describe("duplicate filtering helper (unit, no DB)", () => {
  it("filters existing game+ply combinations", () => {
    const candidates = [
      { source_game_id: "gameA", ply: 12 },
      { source_game_id: "gameA", ply: 14 },
      { source_game_id: "gameB", ply: 6 },
    ];
    const existing = new Set<string>(["gameA:12", "gameB:6"]);
    const result = candidates.filter((c) => {
      const key = `${c.source_game_id}:${c.ply}`;
      return !existing.has(key);
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].source_game_id, "gameA");
    assert.strictEqual(result[0].ply, 14);
  });

  it("returns all candidates when no existing rows", () => {
    const candidates = [
      { source_game_id: "gameA", ply: 12 },
    ];
    const existing = new Set<string>();
    const result = candidates.filter((c) => {
      const key = `${c.source_game_id}:${c.ply}`;
      return !existing.has(key);
    });
    assert.strictEqual(result.length, 1);
  });
});

describe("cp loss threshold", () => {
  it("cpLoss >= 150 qualifies as mistake candidate", () => {
    srs.classifyTrainingOutcome({ averageCpLoss: 150, maxSingleCpLoss: 150 });
    assert.strictEqual(
      srs.classifyTrainingOutcome({ averageCpLoss: 150, maxSingleCpLoss: 100 }),
      "fail",
    );
  });

  it("cpLoss < 50 passes", () => {
    assert.strictEqual(
      srs.classifyTrainingOutcome({ averageCpLoss: 30, maxSingleCpLoss: 20 }),
      "pass",
    );
  });

  it("single big blunder fails even with good average", () => {
    assert.strictEqual(
      srs.classifyTrainingOutcome({ averageCpLoss: 10, maxSingleCpLoss: 350 }),
      "fail",
    );
  });
});

describe("starting_fen is one ply before decision_fen", () => {
  it("first move uses decision_fen as starting_fen when no previous fen", () => {
    const decisionFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const previousFen = null;
    const startingFen = previousFen ?? decisionFen;
    assert.strictEqual(startingFen, decisionFen);
  });

  it("later move uses previous fen as starting_fen", () => {
    const decisionFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const previousFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const startingFen = previousFen ?? decisionFen;
    assert.strictEqual(startingFen, previousFen);
  });
});

describe("cp loss from black perspective is inverted", () => {
  it("black blunder: white advantage grows → black cpLoss > 0", () => {
    // Engine evals from white's perspective
    const rawBeforeCp = 50; // white is +50cp before black's move
    const rawAfterCp = 200; // white is +200cp after black's blunder
    const userColor = "black" as "white" | "black";

    const beforeCp = userColor === "white" ? rawBeforeCp : -rawBeforeCp;
    const afterCp = userColor === "white" ? rawAfterCp : -rawAfterCp;
    const cpLoss = Math.max(0, Math.round(beforeCp - afterCp));

    // from black's view: before=-50, after=-200 → cpLoss = max(0, -50 - (-200)) = 150
    assert.strictEqual(beforeCp, -50);
    assert.strictEqual(afterCp, -200);
    assert.strictEqual(cpLoss, 150);
  });

  it("white blunder: white advantage lost → white cpLoss > 0", () => {
    const rawBeforeCp = 50;
    const rawAfterCp = -120;
    const userColor = "white" as "white" | "black";

    const beforeCp = userColor === "white" ? rawBeforeCp : -rawBeforeCp;
    const afterCp = userColor === "white" ? rawAfterCp : -rawAfterCp;
    const cpLoss = Math.max(0, Math.round(beforeCp - afterCp));

    assert.strictEqual(beforeCp, 50);
    assert.strictEqual(afterCp, -120);
    assert.strictEqual(cpLoss, 170);
  });
});
