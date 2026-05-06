const assert = require("node:assert/strict");
const test = require("node:test");
const evalFormat = require("../lib/training/eval-format.ts");

const { formatEvalLabel } = evalFormat;

test("formatEvalLabel renders explicit mate distance", () => {
  assert.equal(formatEvalLabel(600, 0), "M0");
  assert.equal(formatEvalLabel(600, 1), "M1");
  assert.equal(formatEvalLabel(-600, -2), "M2");
});

test("formatEvalLabel infers mate labels from engine mate centipawn sentinels", () => {
  assert.equal(formatEvalLabel(99000, null), "M1");
  assert.equal(formatEvalLabel(98000, null), "M2");
  assert.equal(formatEvalLabel(-99000, null), "M1");
  assert.equal(formatEvalLabel(-98000, null), "M2");
});

test("formatEvalLabel treats terminal visual mate cp as M0", () => {
  assert.equal(formatEvalLabel(10000, null), "M0");
  assert.equal(formatEvalLabel(-10000, null), "M0");
});

