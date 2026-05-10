import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const navigation: typeof import("../lib/training-postmortem-navigation") =
  require("../lib/training-postmortem-navigation.ts");

const { postMortemNavigationAction } = navigation;

test("post-mortem branch navigation can step back into the original sequence", () => {
  assert.deepEqual(
    postMortemNavigationAction({
      key: "ArrowLeft",
      resultMode: "explore",
      activeExploreIndex: 2,
      visibleSequenceLength: 5,
      exploratoryHistoryLength: 2,
      exploratoryHistoryIndex: 0,
    }),
    { type: "branch", index: -1 },
  );

  assert.deepEqual(
    postMortemNavigationAction({
      key: "ArrowLeft",
      resultMode: "explore",
      activeExploreIndex: 2,
      visibleSequenceLength: 5,
      exploratoryHistoryLength: 2,
      exploratoryHistoryIndex: -1,
    }),
    { type: "sequence", index: 1, boundary: "start" },
  );
});

test("Home and End leave exploratory branches and address the original sequence", () => {
  assert.deepEqual(
    postMortemNavigationAction({
      key: "Home",
      resultMode: "explore",
      activeExploreIndex: 2,
      visibleSequenceLength: 5,
      exploratoryHistoryLength: 2,
      exploratoryHistoryIndex: 1,
    }),
    { type: "sequence", index: 0, boundary: "start" },
  );

  assert.deepEqual(
    postMortemNavigationAction({
      key: "End",
      resultMode: "explore",
      activeExploreIndex: 2,
      visibleSequenceLength: 5,
      exploratoryHistoryLength: 2,
      exploratoryHistoryIndex: -1,
    }),
    { type: "sequence", index: 4, boundary: "end" },
  );
});

test("post-mortem branch navigation does not advance the original sequence at branch end", () => {
  assert.deepEqual(
    postMortemNavigationAction({
      key: "ArrowRight",
      resultMode: "explore",
      activeExploreIndex: 2,
      visibleSequenceLength: 5,
      exploratoryHistoryLength: 1,
      exploratoryHistoryIndex: 0,
    }),
    { type: "none" },
  );
});
