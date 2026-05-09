import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const sampling: typeof import("../lib/training/sample-collector") = require("../lib/training/sample-collector.ts");

test("collectSampledQueueItems stops after collecting enough valid items", () => {
  let visited = 0;

  const result = sampling.collectSampledQueueItems(
    [1, 2, 3, 4, 5],
    2,
    (value) => {
      visited += 1;
      if (value === 2) return [];
      return [{ fen: `fen-${value}` }];
    },
  );

  assert.deepEqual(result, [{ fen: "fen-1" }, { fen: "fen-3" }]);
  assert.equal(visited, 3);
});
