import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const dragPreview: typeof import("../lib/board-drag-preview") = require("../lib/board-drag-preview.ts");

const { dragPreviewPosition } = dragPreview;

test("drag preview is centered on the pointer at pointer down", () => {
  assert.deepEqual(
    dragPreviewPosition({
      pointer: { x: 130, y: 150 },
      originPointer: { x: 130, y: 150 },
      originCenter: { x: 100, y: 100 },
    }),
    { x: 130, y: 150 },
  );
});

test("drag preview remains centered on the pointer while moving", () => {
  assert.deepEqual(
    dragPreviewPosition({
      pointer: { x: 145, y: 160 },
      originPointer: { x: 130, y: 150 },
      originCenter: { x: 100, y: 100 },
    }),
    { x: 145, y: 160 },
  );
});

test("drag preview ignores small click offsets too", () => {
  assert.deepEqual(
    dragPreviewPosition({
      pointer: { x: 103, y: 106 },
      originPointer: { x: 103, y: 106 },
      originCenter: { x: 100, y: 100 },
    }),
    { x: 103, y: 106 },
  );
});
