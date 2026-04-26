import test from "node:test";
import assert from "node:assert/strict";

// Inlined helpers to test without importing compiled output
const MOVE_SCALE_RATIOS = [
  1.0, 1.12246, 1.25992, 1.33484, 1.49831, 1.68179, 1.88775, 2.0,
] as const;

const MOVE_SCALE_LABELS = ["do", "re", "mi", "fa", "sol", "la", "si", "do"] as const;

function pingPongScaleIndex(plyIndex: number): number {
  const maxIndex = MOVE_SCALE_RATIOS.length - 1;
  if (maxIndex <= 0) return 0;
  const period = maxIndex * 2;
  const normalized = ((plyIndex % period) + period) % period;
  return normalized <= maxIndex ? normalized : period - normalized;
}

function pitchRatioForPly(plyIndex: number): number {
  return MOVE_SCALE_RATIOS[pingPongScaleIndex(plyIndex)];
}

function scaleLabelForPly(plyIndex: number): string {
  return MOVE_SCALE_LABELS[pingPongScaleIndex(plyIndex)];
}

// ── pingPongScaleIndex tests ─────────────────────────────────────────────────

test("ascending from 0 to 7", () => {
  assert.deepStrictEqual(pingPongScaleIndex(0), 0);
  assert.deepStrictEqual(pingPongScaleIndex(1), 1);
  assert.deepStrictEqual(pingPongScaleIndex(2), 2);
  assert.deepStrictEqual(pingPongScaleIndex(3), 3);
  assert.deepStrictEqual(pingPongScaleIndex(4), 4);
  assert.deepStrictEqual(pingPongScaleIndex(5), 5);
  assert.deepStrictEqual(pingPongScaleIndex(6), 6);
  assert.deepStrictEqual(pingPongScaleIndex(7), 7);
});

test("descending from 8 to 14", () => {
  assert.deepStrictEqual(pingPongScaleIndex(8), 6);
  assert.deepStrictEqual(pingPongScaleIndex(9), 5);
  assert.deepStrictEqual(pingPongScaleIndex(10), 4);
  assert.deepStrictEqual(pingPongScaleIndex(11), 3);
  assert.deepStrictEqual(pingPongScaleIndex(12), 2);
  assert.deepStrictEqual(pingPongScaleIndex(13), 1);
  assert.deepStrictEqual(pingPongScaleIndex(14), 0);
});

test("ascending again from 15", () => {
  assert.deepStrictEqual(pingPongScaleIndex(15), 1);
  assert.deepStrictEqual(pingPongScaleIndex(16), 2);
  assert.deepStrictEqual(pingPongScaleIndex(17), 3);
  assert.deepStrictEqual(pingPongScaleIndex(18), 4);
  assert.deepStrictEqual(pingPongScaleIndex(19), 5);
  assert.deepStrictEqual(pingPongScaleIndex(20), 6);
  assert.deepStrictEqual(pingPongScaleIndex(21), 7);
});

test("no direct wrap from high do to low do — ply 8 is si", () => {
  // Common mistake: ply 8 would go to index 0 (do) with simple modulo
  // With ping-pong, ply 8 goes to index 6 (si)
  assert.deepStrictEqual(pingPongScaleIndex(7), 7);  // high do
  assert.deepStrictEqual(pingPongScaleIndex(8), 6);  // si — NOT do
  assert.deepStrictEqual(pingPongScaleIndex(14), 0); // do
  assert.deepStrictEqual(pingPongScaleIndex(15), 1); // re — NOT do again
});

test("edge case: negative indices", () => {
  // Negative indices go backward in the ping-pong, but the formula wraps them
  // to their mirror position. -1 becomes 1 (mirror of -1 across 0 boundary).
  // The live pitch ref never goes negative in practice so this is fine.
  assert.deepStrictEqual(pingPongScaleIndex(-1), 1);
  assert.deepStrictEqual(pingPongScaleIndex(-2), 2);
});

// ── pitchRatioForPly tests ────────────────────────────────────────────────────

test("ascending ratios match MOVE_SCALE_RATIOS", () => {
  for (let i = 0; i < 8; i++) {
    const rate = pitchRatioForPly(i);
    assert.ok(Number.isFinite(rate), `ply ${i} rate must be finite, got ${rate}`);
    assert.ok(rate > 0, `ply ${i} rate must be positive, got ${rate}`);
    assert.ok(Math.abs(rate - MOVE_SCALE_RATIOS[i]) < 0.0001, `ply ${i} rate mismatch: expected ${MOVE_SCALE_RATIOS[i]}, got ${rate}`);
  }
});

test("descending ratios after high do", () => {
  assert.ok(Math.abs(pitchRatioForPly(8) - MOVE_SCALE_RATIOS[6]) < 0.0001, "ply 8 should be si ratio (index 6)");
  assert.ok(Math.abs(pitchRatioForPly(9) - MOVE_SCALE_RATIOS[5]) < 0.0001, "ply 9 should be la ratio (index 5)");
  assert.ok(Math.abs(pitchRatioForPly(10) - MOVE_SCALE_RATIOS[4]) < 0.0001, "ply 10 should be sol ratio (index 4)");
  assert.ok(Math.abs(pitchRatioForPly(11) - MOVE_SCALE_RATIOS[3]) < 0.0001, "ply 11 should be fa ratio (index 3)");
});

test("all ratios finite and positive for plies 0-30", () => {
  for (let i = 0; i <= 30; i++) {
    const rate = pitchRatioForPly(i);
    assert.ok(Number.isFinite(rate), `ply ${i}: rate finite, got ${rate}`);
    assert.ok(rate > 0, `ply ${i}: rate positive, got ${rate}`);
  }
});

// ── scaleLabelForPly tests ───────────────────────────────────────────────────

test("ascending labels from 0 to 7", () => {
  const ascending = ["do", "re", "mi", "fa", "sol", "la", "si", "do"];
  for (let i = 0; i < ascending.length; i++) {
    assert.deepStrictEqual(scaleLabelForPly(i), ascending[i], `ply ${i}`);
  }
});

test("descending labels from 8 to 14", () => {
  const descending = ["si", "la", "sol", "fa", "mi", "re", "do"];
  for (let i = 0; i < descending.length; i++) {
    assert.deepStrictEqual(scaleLabelForPly(8 + i), descending[i], `ply ${8 + i}`);
  }
});

test("full 22-ply sequence matches expected", () => {
  const expected = [
    "do", "re", "mi", "fa", "sol", "la", "si", "do",   // 0-7  ascending
    "si", "la", "sol", "fa", "mi", "re", "do",          // 8-14 descending
    "re", "mi", "fa", "sol", "la", "si", "do",          // 15-21 ascending
  ];
  for (let i = 0; i < expected.length; i++) {
    assert.deepStrictEqual(scaleLabelForPly(i), expected[i], `ply ${i}`);
  }
});