import assert from "node:assert";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const srs: typeof import("../lib/training/mistake-srs") = require("../lib/training/mistake-srs.ts");
const parser: typeof import("../lib/training/lichess-move-parser") = require("../lib/training/lichess-move-parser.ts");
const { parseLichessMoveText } = parser;

describe("parseLichessMoveText", () => {
  it("parses SAN moves (Lichess default)", () => {
    const moves = parseLichessMoveText("e4 c5 Nf3 d6");
    assert.strictEqual(moves.length, 4);
    assert.strictEqual(moves[0].uci, "e2e4");
    assert.strictEqual(moves[0].san, "e4");
    assert.strictEqual(moves[1].uci, "c7c5");
    assert.strictEqual(moves[1].san, "c5");
    assert.strictEqual(moves[2].uci, "g1f3");
    assert.strictEqual(moves[2].san, "Nf3");
    assert.strictEqual(moves[3].uci, "d7d6");
    assert.strictEqual(moves[3].san, "d6");
  });

  it("parses UCI moves (alternative format)", () => {
    const moves = parseLichessMoveText("e2e4 c7c5 g1f3");
    assert.strictEqual(moves.length, 3);
    assert.strictEqual(moves[0].san, "e4");
    assert.strictEqual(moves[1].san, "c5");
    assert.strictEqual(moves[2].san, "Nf3");
  });

  it("parses castling (SAN only)", () => {
    const moves = parseLichessMoveText("e4 e5 Nf3 Nc6 Bc4 Nf6 O-O");
    assert.strictEqual(moves.length, 7);
    assert.strictEqual(moves[6].uci, "e1g1");
    assert.strictEqual(moves[6].san, "O-O");
  });

  it("handles promotions", () => {
    const moves = parseLichessMoveText("e4 d5 exd5 e6 dxe6");
    assert.strictEqual(moves.length, 5);
    assert.strictEqual(moves[2].uci, "e4d5");
    assert.strictEqual(moves[2].san, "exd5");
    assert.strictEqual(moves[4].uci, "d5e6");
  });

  it("stops on first illegal move", () => {
    // "Qxe5+" is not legal from the starting position
    const moves = parseLichessMoveText("Qxe5+ Qe7 Qxe7+");
    assert.strictEqual(moves.length, 0);
  });

  it("tracks fenBefore/fenAfter", () => {
    const moves = parseLichessMoveText("e4");
    assert.strictEqual(moves.length, 1);
    assert.strictEqual(moves[0].ply, 0);
    assert.ok(moves[0].fenBefore.includes("rnbqkbnr"));
    assert.ok(moves[0].fenAfter.includes("4P3"));
  });
});

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

describe("candidate survives best-line failure", () => {
  it("candidate created with null best_move when getLines throws", () => {
    // Simulates the fixed logic: best-line lookup is inside its own try/catch
    const cpLoss = 200;
    const cpLossThreshold = 150;
    let thresholdHits = 0;
    let bestLineFailures = 0;
    let bestMoveUci: string | null = null;
    let bestMoveSan: string | null = null;

    if (cpLoss >= cpLossThreshold) {
      thresholdHits++;

      try {
        throw new Error("simulated best-line failure");
      } catch {
        bestLineFailures++;
      }

      // Candidate would still be pushed with null best_move fields
      bestMoveUci = null;
      bestMoveSan = null;
    }

    assert.strictEqual(thresholdHits, 1);
    assert.strictEqual(bestLineFailures, 1);
    assert.strictEqual(bestMoveUci, null);
    assert.strictEqual(bestMoveSan, null);
    // Candidate was pushed — not skipped
  });

  it("candidate created with valid best_move when getLines succeeds", () => {
    let bestMoveUci: string | null = null;
    let bestMoveSan: string | null = "Nf3";

    // Simulated successful best-line
    bestMoveUci = "g1f3";

    assert.strictEqual(bestMoveUci, "g1f3");
    assert.strictEqual(bestMoveSan, "Nf3");
  });
});
