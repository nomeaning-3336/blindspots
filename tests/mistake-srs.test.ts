import assert from "node:assert";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const srs: typeof import("../lib/training/mistake-srs") = require("../lib/training/mistake-srs.ts");
const { classifyTrainingOutcome, nextIntervalDays, shouldMasterMistake, addDays } = srs;

describe("classifyTrainingOutcome", () => {
  it("pass: averageCpLoss under 50 and maxSingleCpLoss <= 300", () => {
    assert.strictEqual(
      classifyTrainingOutcome({ averageCpLoss: 20, maxSingleCpLoss: 100 }),
      "pass",
    );
    assert.strictEqual(
      classifyTrainingOutcome({ averageCpLoss: 49, maxSingleCpLoss: 300 }),
      "pass",
    );
    assert.strictEqual(
      classifyTrainingOutcome({ averageCpLoss: 0, maxSingleCpLoss: 0 }),
      "pass",
    );
  });

  it("acceptable: averageCpLoss 50-149 and maxSingleCpLoss <= 300", () => {
    assert.strictEqual(
      classifyTrainingOutcome({ averageCpLoss: 50, maxSingleCpLoss: 100 }),
      "acceptable",
    );
    assert.strictEqual(
      classifyTrainingOutcome({ averageCpLoss: 100, maxSingleCpLoss: 300 }),
      "acceptable",
    );
    assert.strictEqual(
      classifyTrainingOutcome({ averageCpLoss: 149, maxSingleCpLoss: 200 }),
      "acceptable",
    );
  });

  it("fail: averageCpLoss >= 150", () => {
    assert.strictEqual(
      classifyTrainingOutcome({ averageCpLoss: 150, maxSingleCpLoss: 100 }),
      "fail",
    );
    assert.strictEqual(
      classifyTrainingOutcome({ averageCpLoss: 300, maxSingleCpLoss: 50 }),
      "fail",
    );
  });

  it("fail: maxSingleCpLoss > 300 regardless of average", () => {
    assert.strictEqual(
      classifyTrainingOutcome({ averageCpLoss: 10, maxSingleCpLoss: 301 }),
      "fail",
    );
    assert.strictEqual(
      classifyTrainingOutcome({ averageCpLoss: 0, maxSingleCpLoss: 600 }),
      "fail",
    );
  });
});

describe("nextIntervalDays", () => {
  it("pass: multiplies current interval by 2.5, rounded, minimum 1", () => {
    assert.strictEqual(
      nextIntervalDays({ currentIntervalDays: 2, outcome: "pass" }),
      5,
    );
    assert.strictEqual(
      nextIntervalDays({ currentIntervalDays: 4, outcome: "pass" }),
      10,
    );
    assert.strictEqual(
      nextIntervalDays({ currentIntervalDays: 1, outcome: "pass" }),
      3,
    );
    assert.strictEqual(
      nextIntervalDays({ currentIntervalDays: 0, outcome: "pass" }),
      3,
    );
  });

  it("acceptable: interval unchanged, minimum 1", () => {
    assert.strictEqual(
      nextIntervalDays({ currentIntervalDays: 3, outcome: "acceptable" }),
      3,
    );
    assert.strictEqual(
      nextIntervalDays({ currentIntervalDays: 0, outcome: "acceptable" }),
      1,
    );
  });

  it("fail: interval resets to 1", () => {
    assert.strictEqual(
      nextIntervalDays({ currentIntervalDays: 10, outcome: "fail" }),
      1,
    );
    assert.strictEqual(
      nextIntervalDays({ currentIntervalDays: 3, outcome: "fail" }),
      1,
    );
  });
});

describe("shouldMasterMistake", () => {
  it("masters only on pass with interval >= 60", () => {
    assert.strictEqual(shouldMasterMistake({ intervalDays: 60, outcome: "pass" }), true);
    assert.strictEqual(shouldMasterMistake({ intervalDays: 75, outcome: "pass" }), true);
  });

  it("does not master on pass with interval < 60", () => {
    assert.strictEqual(shouldMasterMistake({ intervalDays: 59, outcome: "pass" }), false);
    assert.strictEqual(shouldMasterMistake({ intervalDays: 2, outcome: "pass" }), false);
  });

  it("does not master on acceptable or fail even with large interval", () => {
    assert.strictEqual(shouldMasterMistake({ intervalDays: 100, outcome: "acceptable" }), false);
    assert.strictEqual(shouldMasterMistake({ intervalDays: 100, outcome: "fail" }), false);
  });
});

describe("addDays", () => {
  it("adds days correctly", () => {
    const result = addDays(new Date("2026-05-01"), 3);
    assert.strictEqual(result.toISOString().slice(0, 10), "2026-05-04");
  });

  it("handles month boundaries", () => {
    const result = addDays(new Date("2026-01-30"), 5);
    assert.strictEqual(result.toISOString().slice(0, 10), "2026-02-04");
  });
});
