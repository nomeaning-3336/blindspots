import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const boardAnnotations: typeof import("../lib/board-annotations") = require("../lib/board-annotations.ts");

const { shouldClearAnnotationsOnPointerDown } = boardAnnotations;

test("left click clears annotations while board is disabled but annotations are enabled", () => {
  assert.equal(
    shouldClearAnnotationsOnPointerDown({
      button: 0,
      disabled: true,
      annotationsDisabled: false,
    }),
    true,
  );
});

test("right click and annotation-disabled boards do not use disabled-board clearing", () => {
  assert.equal(
    shouldClearAnnotationsOnPointerDown({
      button: 2,
      disabled: true,
      annotationsDisabled: false,
    }),
    false,
  );
  assert.equal(
    shouldClearAnnotationsOnPointerDown({
      button: 0,
      disabled: true,
      annotationsDisabled: true,
    }),
    false,
  );
});
