import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildMaiaHistoryTokens,
  buildMaiaInputShape,
} from "../lib/maia3/maia3-tokenizer.ts";

type MaiaFixture = {
  name: string;
  startingFen: string;
  moveUcis: string[];
  tokensShape: number[];
  tokens: number[];
};

const FIXTURE_NAMES = [
  "startpos_white_short_history",
  "black_to_move_arbitrary_fen",
  "castling_history_black_to_move",
  "queens_gambit_black_to_move",
  "white_promotion_position",
  "onnx_parity_fixture",
];

function readFixture(name: string): MaiaFixture {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "tests", "fixtures", "maia3", `${name}.json`), "utf8"),
  ) as MaiaFixture;
}

test("Maia tokenizer exposes the static browser input shape", () => {
  assert.deepEqual(buildMaiaInputShape(), [1, 64, 97]);
});

for (const fixtureName of FIXTURE_NAMES) {
  test(`Maia tokenizer matches official Python fixture: ${fixtureName}`, () => {
    const fixture = readFixture(fixtureName);
    const tokens = buildMaiaHistoryTokens({
      startingFen: fixture.startingFen,
      moveUcis: fixture.moveUcis,
    });

    assert.deepEqual(fixture.tokensShape, [64, 97]);
    assert.equal(tokens.length, fixture.tokens.length);
    assert.deepEqual(Array.from(tokens), fixture.tokens);
  });
}
