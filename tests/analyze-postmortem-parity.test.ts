import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bridgeSource = readFileSync("components/analyze-bridge.tsx", "utf8");

test("analyze bridge uses one final postmortem parity override layer", () => {
  assert.equal(
    bridgeSource.match(/ANALYZE POSTMORTEM PARITY OVERRIDE/g)?.length ?? 0,
    1,
  );
});

test("analysis engine rows are table-like instead of card-like", () => {
  assert.match(bridgeSource, /#analyze-app-host #app \.analysis-list \{[\s\S]*gap: 0 !important;/);
  assert.match(bridgeSource, /#analyze-app-host #app \.analysis-row \{[\s\S]*border-radius: 0 !important;/);
  assert.match(bridgeSource, /#analyze-app-host #app \.analysis-row \{[\s\S]*border-bottom: 1px solid var\(--app-border-soft\) !important;/);
});

test("analysis desktop layout removes the standalone history rail", () => {
  assert.match(bridgeSource, /#analyze-app-host #app \.board-history-panel \{[\s\S]*display: none !important;/);
  assert.match(bridgeSource, /#analyze-app-host #app \.board-stage \{[\s\S]*grid-template-columns:\s*minmax\(0, auto\)\s*minmax\(28rem, 0\.92fr\) !important;/);
  assert.match(bridgeSource, /#analyze-app-host #app \.board-analysis \{[\s\S]*width: 100% !important;/);
  assert.match(bridgeSource, /#analyze-app-host #app \.board-analysis \{[\s\S]*max-width: none !important;/);
  assert.match(bridgeSource, /#analyze-app-host #app \.board-analysis \{[\s\S]*height: var\(--board-shell-width\) !important;/);
});

test("classification labels follow postmortem text treatment, not pill chips", () => {
  assert.match(bridgeSource, /#analyze-app-host #app \.analysis-class \{[\s\S]*border: 0 !important;/);
  assert.match(bridgeSource, /#analyze-app-host #app \.analysis-class \{[\s\S]*border-radius: 0 !important;/);
});
