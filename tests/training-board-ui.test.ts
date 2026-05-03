import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const trainingBoardUi: typeof import("../lib/training-board-ui") = require("../lib/training-board-ui.ts");

const {
  DEFAULT_BLINDSPOTS_ELO,
  buildLastMoveBadge,
  classificationIcon,
  formatClassifiedMoveLead,
  moveHighlightFill,
  moveHighlightsForClassifiedMove,
  getTrainingBoardHighlights,
  moveBadgeForPosition,
} = trainingBoardUi;

test("skipped onboarding starts from the default Blindspots Elo", () => {
  assert.equal(DEFAULT_BLINDSPOTS_ELO, 1200);
});

test("moveBadgeForPosition returns a badge for classified sequence moves", () => {
  assert.deepEqual(
    moveBadgeForPosition({
      index: 1,
      fen: "8/8/8/8/8/8/8/8 w - - 0 1",
      label: "1",
      move: {
        san: "Rb8?",
        uci: "b4b8",
        side: "white",
        classification: "mistake",
      },
    }),
    buildLastMoveBadge("mistake"),
  );
});

test("classification badges use the same icon assets as analysis", () => {
  assert.equal(classificationIcon("best"), "/analyze/classification-icons/best.png");
  assert.equal(classificationIcon("brilliant"), "/analyze/classification-icons/brilliant.png");
  assert.equal(classificationIcon("critical"), "/analyze/classification-icons/critical.png");
  assert.equal(classificationIcon("good"), "/analyze/classification-icons/okay.png");
  assert.equal(classificationIcon("okay"), "/analyze/classification-icons/okay.png");
  assert.equal(classificationIcon("blunder"), "/analyze/classification-icons/blunder.png");
  assert.equal(buildLastMoveBadge("inaccuracy").icon, "/analyze/classification-icons/inaccuracy.png");
  assert.deepEqual(buildLastMoveBadge("critical"), {
    label: "Critical",
    icon: "/analyze/classification-icons/critical.png",
    color: "var(--app-class-critical)",
  });
  assert.equal(buildLastMoveBadge("brilliant").color, "var(--app-class-brilliant)");
  assert.equal(buildLastMoveBadge("good").label, "Good");
  assert.equal(buildLastMoveBadge("okay").label, "Okay");
});

test("engine line move leads include the classification name", () => {
  assert.equal(formatClassifiedMoveLead("Qxd4", "critical"), "Qxd4 (Critical)");
  assert.equal(formatClassifiedMoveLead("Qxd4", "brilliant"), "Qxd4 (Brilliant)");
  assert.equal(formatClassifiedMoveLead("e4", "excellent"), "e4 (Excellent)");
  assert.equal(formatClassifiedMoveLead("e4", "good"), "e4 (Good)");
  assert.equal(formatClassifiedMoveLead("e4", "okay"), "e4 (Okay)");
  assert.equal(formatClassifiedMoveLead("e4", undefined), "e4");
});

test("move highlight fills match analysis origin and destination opacity", () => {
  assert.equal(
    moveHighlightFill("mistake", "from"),
    "color-mix(in srgb, var(--app-class-mistake) 34%, transparent)",
  );
  assert.equal(
    moveHighlightFill("mistake", "to"),
    "color-mix(in srgb, var(--app-class-mistake) 52%, transparent)",
  );
});

test("classified move highlights use the move classification on both squares", () => {
  assert.deepEqual(moveHighlightsForClassifiedMove({ from: "g5", to: "e4" }, "okay"), [
    {
      square: "g5",
      color: "color-mix(in srgb, var(--app-class-okay) 34%, transparent)",
    },
    {
      square: "e4",
      color: "color-mix(in srgb, var(--app-class-okay) 52%, transparent)",
    },
  ]);
  assert.deepEqual(moveHighlightsForClassifiedMove({ from: "b4", to: "b8" }, "blunder"), [
    {
      square: "b4",
      color: "color-mix(in srgb, var(--app-class-blunder) 34%, transparent)",
    },
    {
      square: "b8",
      color: "color-mix(in srgb, var(--app-class-blunder) 52%, transparent)",
    },
  ]);
});

test("moveBadgeForPosition omits unclassified and starting positions", () => {
  assert.equal(
    moveBadgeForPosition({
      index: 0,
      fen: "8/8/8/8/8/8/8/8 w - - 0 1",
      label: "Start",
    }),
    null,
  );
  assert.equal(
    moveBadgeForPosition({
      index: 1,
      fen: "8/8/8/8/8/8/8/8 w - - 0 1",
      label: "1",
      move: {
        san: "Rb8",
        uci: "b4b8",
        side: "white",
      },
    }),
    null,
  );
});

test("active training board has no hard-coded square highlight", () => {
  assert.equal(getTrainingBoardHighlights("active"), undefined);
});

test("drift training board keeps the drift square highlight", () => {
  assert.deepEqual(getTrainingBoardHighlights("drift"), {
    b8: "color-mix(in srgb, var(--app-class-mistake) 42%, #7f8190 58%)",
  });
});
