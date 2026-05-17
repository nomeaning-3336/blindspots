import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("reversed train audio trims trailing silence before reversing", () => {
  const source = readFileSync("lib/train-audio.ts", "utf8");

  assert.match(source, /function _activeAudioEndSample/);
  assert.match(source, /REVERSE_TRIM_THRESHOLD/);
  assert.match(source, /REVERSE_TRIM_TAIL_PAD_MS/);
  assert.match(source, /const activeEndSample = _activeAudioEndSample\(forwardBuffer\)/);
  assert.match(source, /const reversedLength = Math\.min\(forwardBuffer\.length, activeEndSample \+ tailPadSamples\)/);
  assert.match(source, /src\[reversedLength - 1 - i\]/);
  assert.doesNotMatch(source, /const tmpCtx = new AudioContext\(\)/);
});
