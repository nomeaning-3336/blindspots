import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const trainingBoardUi: typeof import("../lib/training-board-ui") = require("../lib/training-board-ui.ts");

const {
  DEFAULT_BLINDSPOTS_ELO,
  buildLastMoveBadge,
  classificationIcon,
  classificationForPlayedMove,
  engineLineContinuationSan,
  formatClassifiedMoveLead,
  mergeEngineLineDetailsFrom,
  moveClassification,
  moveHighlightFill,
  moveHighlightsForClassifiedMove,
  getTrainingBoardHighlights,
  moveBadgeForPosition,
} = trainingBoardUi;

test("skipped onboarding starts from the default Blindspots Elo", () => {
  assert.equal(DEFAULT_BLINDSPOTS_ELO, 1200);
});

test("postmortem tour uses one masked dim layer instead of four stitched rectangles", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(source, /data-testid="train-spotlight-dim-mask"/);
  assert.doesNotMatch(source, /buildSpotlightMaskRects/);
});

test("postmortem tour card does not animate max-height during target transitions", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.doesNotMatch(source, /transition-\[[^\]]*max-height[^\]]*\]/);
});

test("postmortem tour overlay cannot create viewport scrollbars during transitions", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.match(overlaySource, /className="fixed inset-0 z-\[80\] overflow-hidden"/);
  assert.doesNotMatch(overlaySource, /left-\[-9999px\]/);
  assert.match(overlaySource, /"pointer-events-none fixed left-0 top-0 opacity-0"/);
});

test("postmortem centered saved step uses the tour overlay viewport clip", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.match(overlaySource, /className="fixed inset-0 z-\[80\] overflow-hidden"/);
  assert.match(overlaySource, /if \(currentStep\.centerCard\) \{/);
});

test("postmortem tour target geometry is not live-resized during card transitions", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.doesNotMatch(overlaySource, /new ResizeObserver\(\(\) => \{\s*if \(cancelled \|\| !target\) return;\s*setTargetRect/);
});

test("postmortem tour placement ignores stale target geometry from another step", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.match(overlaySource, /targetRect\?\.step === step/);
  assert.match(overlaySource, /setTargetRect\(\{ step, \.\.\.snapshot \}\)/);
});

test("postmortem tour keeps the dim spotlight mounted while next target resolves", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.match(overlaySource, /const displayedSpotlight = spotlight \?\? \(/);
  assert.match(overlaySource, /!currentStep\.suppressSpotlight && displayedSpotlight \? \(/);
});

test("postmortem tour geometry uses a gentle timing curve", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.match(overlaySource, /clamp\(700 \+ tourGeometryTravelDistance \* 0\.18, 760, 1180\)/);
  assert.match(overlaySource, /--tour-geometry-ease/);
  assert.match(overlaySource, /cubic-bezier\(0\.16,0\.84,0\.32,1\)/);
  assert.doesNotMatch(overlaySource, /transition-\[opacity,transform,top,left,width\][^\n]+cubic-bezier\(0\.22,1,0\.36,1\)/);
});

test("add-position action step reuses the target-anchored postmortem tour card", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlayUsageSource = source.slice(source.indexOf("<TrainPostmortemTourOverlay"));
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.doesNotMatch(overlayUsageSource, /centerCard=\{isPostmortemAddPositionActionStep/);
  assert.match(overlayUsageSource, /centerCard=\{false\}/);
  assert.match(overlaySource, /const waitsForTargetGeometry =\s*!shouldCenterCard;/);
  assert.doesNotMatch(overlaySource, /const waitsForSpotlightGeometry =\s*!shouldCenterCard && !currentStep\.suppressSpotlight;/);
});

test("add-position action step keeps the dim layer until Okay is pressed", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlayUsageSource = source.slice(source.indexOf("<TrainPostmortemTourOverlay"));
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.match(overlayUsageSource, /actionInstructionAcknowledged=\{postmortemAddPositionInstructionAcknowledged\}/);
  assert.match(overlaySource, /const shouldDimSuppressedSpotlight =/);
  assert.match(overlaySource, /currentStep\.suppressSpotlight &&\s*isActionStep &&\s*!actionInstructionAcknowledged/);
  assert.match(overlaySource, /\{shouldCenterCard \|\| shouldDimSuppressedSpotlight \? \(/);
  assert.match(source, /transition-opacity duration-\[520ms\] ease-\[var\(--tour-geometry-ease\)\]/);
});

test("add-position Okay button remains clickable before the action instruction is acknowledged", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.match(
    overlaySource,
    /disabled=\{completionInFlight \|\| isPositioningSpotlight \|\| \(isActionStep && actionInstructionAcknowledged && !actionCompleted\)\}/,
  );
  assert.doesNotMatch(
    overlaySource,
    /disabled=\{completionInFlight \|\| isPositioningSpotlight \|\| \(isActionStep && !actionCompleted && !shouldCenterCard\)\}/,
  );
});

test("add-position action transition does not show a Waiting fallback CTA", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.match(overlaySource, /const primaryButtonLabel =/);
  assert.match(overlaySource, /isActionStep && !actionCompleted\s*\?\s*currentStep\.cta \?\? "Next"/);
  assert.doesNotMatch(overlaySource, /displayedTourStep\.cta \?\? "Waiting\.\.\."/);
});

test("postmortem tour primary button keeps a stable hit target on hover and active", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overlaySource = source.slice(source.indexOf("function TrainPostmortemTourOverlay"));

  assert.match(overlaySource, /className="app-brutal-button train-tour-primary-button min-h-11 px-6 text-xs"/);
  assert.match(source, /\.train-tour-primary-button:hover,/);
  assert.match(source, /\.train-tour-primary-button:focus-visible,/);
  assert.match(source, /\.train-tour-primary-button:active/);
  assert.match(source, /transform: none;/);
});

test("add-position onboarding action uses staged saving and success phases", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const addButtonSource = source.slice(
    source.indexOf('data-tour="add-position-to-learning-queue"') - 2400,
    source.indexOf('data-tour="add-position-to-learning-queue"') + 1200,
  );

  assert.match(source, /type AddPositionOnboardingPhase =\s*\|\s*"idle"\s*\|\s*"waiting-for-click"\s*\|\s*"saving"\s*\|\s*"success-entering"\s*\|\s*"success-visible"\s*\|\s*"success-leaving"/);
  assert.match(source, /const shouldHideTourForAddPosition =/);
  assert.match(source, /addPositionOnboardingPhase !== "idle"/);
  assert.match(source, /setAddPositionOnboardingPhase\("saving"\)/);
  assert.match(source, /setAddPositionOnboardingPhase\("success-entering"\)/);
  assert.match(addButtonSource, /setAddPositionOnboardingPhase\("success-visible"\)/);
  assert.match(addButtonSource, /setAddPositionOnboardingPhase\("success-leaving"\)/);
  assert.match(addButtonSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(addButtonSource, /setPostmortemAddPositionActionDone\(true\)/);
  assert.match(addButtonSource, /"Saving\.\.\."/);
  assert.doesNotMatch(addButtonSource, /"Adding\.\.\."/);
  assert.doesNotMatch(addButtonSource, /"Position added successfully"/);
  assert.doesNotMatch(addButtonSource, /addPositionOnboardingPhase === "success"/);
});

test("add-position onboarding success uses the button before showing the saved step", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const addHandlerSource = source.slice(
    source.indexOf('data-tour="add-position-to-learning-queue"') - 3600,
    source.indexOf('data-tour="add-position-to-learning-queue"'),
  );
  const addButtonSource = source.slice(
    source.indexOf('data-tour="add-position-to-learning-queue"') - 600,
    source.indexOf('data-tour="add-position-to-learning-queue"') + 2200,
  );
  const onboardingSuccessIndex = addHandlerSource.indexOf("if (isPostmortemAddPositionActionStep)");
  const alertIndex = addHandlerSource.indexOf("showAlert({");

  assert.notEqual(onboardingSuccessIndex, -1);
  assert.notEqual(alertIndex, -1);
  assert.ok(onboardingSuccessIndex < alertIndex);
  assert.match(addButtonSource, /train-add-position-success/);
  assert.match(source, /\.train-add-position-success \{/);
  assert.match(source, /background: color-mix\(in srgb, var\(--app-class-good\) 38%, black\) !important;/);
  assert.match(source, /color: #ffffff !important;/);
  assert.match(source, /box-shadow: 3px 3px 0 var\(--app-brutal-shadow\) !important;/);
  assert.match(addButtonSource, /viewBox="0 0 20 20"/);
  assert.match(addButtonSource, /Position added/);
  assert.match(source, /headline: "Position saved\."/);
});

test("add-position success button has a checkmark and leaving phase", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const addButtonSource = source.slice(
    source.indexOf('data-tour="add-position-to-learning-queue"') - 600,
    source.indexOf('data-tour="add-position-to-learning-queue"') + 2200,
  );

  assert.match(addButtonSource, /addPositionOnboardingPhase === "success-leaving"/);
  assert.match(addButtonSource, /opacity-0 scale-\[0\.98\]/);
  assert.match(addButtonSource, /<svg viewBox="0 0 20 20"/);
  assert.match(addButtonSource, /fillRule="evenodd"/);
});

test("added learning queue positions stay disabled and checked for that FEN", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const addButtonSource = source.slice(
    source.indexOf('data-tour="add-position-to-learning-queue"') - 900,
    source.indexOf('data-tour="add-position-to-learning-queue"') + 2200,
  );

  assert.match(source, /const \[queuedLearningPositionFens, setQueuedLearningPositionFens\]/);
  assert.match(source, /const learningQueueAddTargetFen = learningQueueAddTarget\?\.decisionFen/);
  assert.match(source, /queuedLearningPositionFens\.has\(learningQueueAddTargetFen\)/);
  assert.match(source, /disabled=\{addingPositionToQueue \|\| !learningQueueAddTarget\?\.decisionFen \|\| isLearningQueueAddTargetQueued\}/);
  assert.match(source, /if \(isAddPositionSuccessState\) return;/);
  assert.match(source, /next\.add\(normalizedFenToAdd\)/);
  assert.match(addButtonSource, /!isAddPositionSuccessState \? "disabled:opacity-60" : ""/);
});

test("postmortem copy fen button uses icon plus action-sized label", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const postmortemCopySource = source.slice(
    source.indexOf('disabled={!boardFen}'),
    source.indexOf("{/* ── Postmortem action footer"),
  );

  assert.match(postmortemCopySource, /secondaryActionClassName/);
  assert.match(postmortemCopySource, /"min-h-12 w-full justify-center gap-2 px-5 disabled:opacity-60"/);
  assert.match(postmortemCopySource, /<rect x="9" y="9" width="13" height="13" rx="2" ry="2" \/>/);
  assert.match(postmortemCopySource, /\{fenCopied \? "Copied FEN" : "Copy FEN"\}/);
  assert.match(postmortemCopySource, /className=\{postmortemActionTextClassName\}/);
  assert.doesNotMatch(postmortemCopySource, /\{copyFenPreview\}/);
  assert.doesNotMatch(postmortemCopySource, /Copied FEN ✓/);
});

test("queued learning positions are marked in the postmortem move table", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const resultsPanelSource = source.slice(
    source.indexOf("function ResultsPanel"),
    source.indexOf("function EvalGraph"),
  );
  const tableSource = source.slice(
    source.indexOf("function AnalysisMoveTable"),
    source.indexOf("function MoveList"),
  );

  assert.match(resultsPanelSource, /queuedLearningPositionFens=\{queuedLearningPositionFens\}/);
  assert.match(tableSource, /queuedLearningPositionFens\?: ReadonlySet<string>/);
  assert.match(tableSource, /entry\.uci === move\.uci/);
  assert.match(tableSource, /normalizeDecisionFen\(entry\.move!\.fenBefore!\) === moveDecisionFen/);
  assert.match(tableSource, /const positionIndex = canonicalMove\?\.positionIndex \?\? rawPositionIndex/);
  assert.match(tableSource, /queuedLearningPositionFens\?\.has\(normalizeDecisionFen\(learningDecisionFen\)\)/);
  assert.match(tableSource, /train-move-row-learning-queued/);
  assert.match(tableSource, /train-move-row-learning-icon/);
  assert.match(tableSource, /inline-flex h-5 w-5/);
  assert.match(tableSource, /width="18"/);
  assert.match(tableSource, /<path d="M12 6\.5v14" \/>/);
  assert.match(tableSource, /aria-label="In Learning queue"/);
  assert.match(source, /\.train-move-row-learning-queued \{/);
  assert.match(source, /background: color-mix\(in srgb, var\(--app-text\) 6%, transparent\) !important;/);
  assert.doesNotMatch(source, /box-shadow: inset 3px 0 0 color-mix\(in srgb, var\(--app-class-good\)/);
  assert.match(source, /\.train-move-row-learning-icon \{/);
});

test("postmortem tour teaches the Notes toggle before switching to the notes panel", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const stepsSource = source.slice(
    source.indexOf("const POSTMORTEM_TOUR_STEPS"),
    source.indexOf("] as const satisfies readonly PostmortemTourStep[]"),
  );
  const toggleButtonSource = source.slice(
    source.indexOf("Compact toggle: Analysis | Notes"),
    source.indexOf("Panel content"),
  );

  assert.match(stepsSource, /target: "notes-toggle"/);
  assert.match(stepsSource, /headline: "The Notes toggle\."/);
  assert.doesNotMatch(stepsSource, /target: "postmortem-panel",\s*headline: "Notes",[\s\S]*?centerCard: true/);
  assert.match(toggleButtonSource, /data-tour=\{item === "memory" \? "notes-toggle" : undefined\}/);
});

test("postmortem tour centered steps do not auto-skip when their target is absent", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const resolverSource = source.slice(
    source.indexOf("// \u2500\u2500 Resolve step: find target"),
    source.indexOf("const selector = `[data-tour=\"${currentStep.target}\"]`;"),
  );

  assert.match(resolverSource, /if \(currentStep\.centerCard\) \{/);
  assert.match(resolverSource, /setResolvedStepIndex\(step\)/);
  assert.match(resolverSource, /setIsPositioningSpotlight\(false\)/);
  assert.doesNotMatch(resolverSource, /onMissingTarget\(\)/);
});

test("notes toggle transition switches the side panel during the soft handoff", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const nextHandlerSource = source.slice(
    source.indexOf("const handlePostmortemTourNext"),
    source.indexOf("const handlePostmortemTourSkip"),
  );

  assert.match(nextHandlerSource, /currentStep\?\.requiresAction === "notes-toggle"/);
  assert.match(source, /setPostmortemNotesToggleTransitioning\(true\)/);
  assert.match(source, /setPostmortemSidePanel\("memory"\)/);
  assert.doesNotMatch(nextHandlerSource, /currentStep\?\.centerCard && currentStep\?\.sidePanel === "analysis"/);
});

test("postmortem add-position checkpoint locks back navigation at the notes toggle", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(source, /requiresAction: "notes-toggle"/);
  assert.doesNotMatch(source, /headline === "Notes" && step\.centerCard === true/);
  assert.doesNotMatch(source, /s\.headline === "Notes" && s\.centerCard === true/);
});

test("preplay onboarding and active training share the playing grid geometry", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(source, /const playingGridClassName =/);
  assert.match(source, /: playingGridClassName/);
  assert.match(source, /lg:grid-cols-\[auto_320px\]/);
  assert.match(source, /lg:translate-x-\[5vw\]/);
});

test("begin sequence uses a gentle opacity handoff without moving the board", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.doesNotMatch(source, /train-preplay-board-handoff[^\n]+translate/);
});

test("preplay intro overlay receives pointer events while visible", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(source, /const introOverlay = trainOnboardingIntroVisible \? \(/);
  assert.doesNotMatch(source, /pointer-events-none fixed inset-0 z-40/);
  assert.match(source, /pointer-events-auto fixed inset-0 z-40/);
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

test("played move classification can be recovered from matching engine lines", () => {
  assert.equal(
    classificationForPlayedMove(
      { uci: "f4e5", classification: undefined },
      [
        { bestMove: "g8f6", classification: "best" },
        { bestMove: "f4e5", classification: "mistake" },
      ],
    ),
    "mistake",
  );
  assert.equal(
    classificationForPlayedMove(
      { uci: "d7d5", classification: "excellent" },
      [{ bestMove: "d7d5", classification: "blunder" }],
    ),
    "excellent",
  );
});

test("completed move classification wins over stale async move score classification", () => {
  assert.equal(
    moveClassification({
      move: { classification: "inaccuracy" },
      moveScore: { classification: "okay" },
    }),
    "inaccuracy",
  );
  assert.equal(
    moveClassification({
      move: {},
      moveScore: { classification: "inaccuracy" },
    }),
    "inaccuracy",
  );
});

test("deeper engine line merge can keep the current classification for the same move", () => {
  assert.deepEqual(
    mergeEngineLineDetailsFrom(
      { bestMove: "g8f6", depth: 18, classification: "okay", pvSan: ["Nf6", "Bc4"] },
      { bestMove: "g8f6", depth: 22, classification: "best", pvSan: ["Nf6", "Bc4", "Be6"] },
      "current",
    ),
    { bestMove: "g8f6", depth: 22, classification: "okay", pvSan: ["Nf6", "Bc4", "Be6"] },
  );
});

test("deeper engine line merge can prefer a fresh next classification", () => {
  assert.deepEqual(
    mergeEngineLineDetailsFrom(
      { bestMove: "g8f6", depth: 18, classification: "best", pvSan: ["Nf6"] },
      { bestMove: "g8f6", depth: 22, classification: "okay", pvSan: ["Nf6", "Bc4", "Be6"] },
      "next",
    ),
    { bestMove: "g8f6", depth: 22, classification: "okay", pvSan: ["Nf6", "Bc4", "Be6"] },
  );
});

test("engine line continuation omits the lead move without repeating it", () => {
  assert.equal(
    engineLineContinuationSan({
      bestMove: "g8e7",
      bestSan: "Nge7",
      continuationSan: ["Bc4", "Be6"],
      pv: ["g8e7"],
      pvSan: ["Nge7"],
    }),
    "Bc4 Be6",
  );
  assert.equal(
    engineLineContinuationSan({
      bestMove: "g8e7",
      bestSan: "Nge7",
      pv: ["g8e7"],
      pvSan: ["Nge7"],
    }),
    "",
  );
  assert.equal(
    engineLineContinuationSan({
      bestMove: "g8f6",
      bestSan: "Nf6",
      pv: ["g8f6", "f1c4", "c8e6"],
      pvSan: ["Nf6", "Bc4", "Be6"],
    }),
    "Bc4 Be6",
  );
  assert.equal(
    engineLineContinuationSan({
      bestMove: "g8e7",
      bestSan: "Nge7",
      pv: ["f1c4", "c8e6"],
      pvSan: ["Bc4", "Be6"],
    }),
    "Bc4 Be6",
  );
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

test("active training board keeps the restored viewport height cap", () => {
  const trainClientSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(
    trainClientSource,
    /\? "w-\[min\(82vw,calc\(100dvh-12\.5rem\),800px\)\]"/,
  );
  assert.doesNotMatch(trainClientSource, /calc\(100dvh-16\.5rem\)/);
});

test("postmortem panel uses responsive height budget variables", () => {
  const trainClientSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const postmortemSharedSource = readFileSync("components/train/postmortem-shared.tsx", "utf8");

  assert.match(trainClientSource, /var\(--pm-gap\)/);
  assert.match(trainClientSource, /var\(--pm-card-pad\)/);
  assert.match(trainClientSource, /var\(--pm-graph-h\)/);
  assert.match(trainClientSource, /var\(--pm-move-row-h\)/);
  assert.match(trainClientSource, /var\(--pm-tab-h\)/);
  assert.match(postmortemSharedSource, /var\(--pm-engine-row-h\)/);
});

test("drift training board keeps the drift square highlight", () => {
  assert.deepEqual(getTrainingBoardHighlights("drift"), {
    b8: "color-mix(in srgb, var(--app-class-mistake) 42%, #7f8190 58%)",
  });
});
