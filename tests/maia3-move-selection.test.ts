import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { Chess } from "chess.js";
import {
  MAIA3_MOVE_TO_INDEX,
  MAIA3_MOVE_VOCABULARY,
  decodeMaiaMoveIndex,
  getLegalMaiaMoveIndices,
  mirrorMaiaMoveUci,
} from "../lib/maia3/maia3-moves.ts";

type MaiaFixture = {
  name: string;
  startingFen: string;
  moveUcis: string[];
  legalMoveIndices: number[];
  expectedDecodedIndex: number;
  expectedDecodedUci: string;
  topPolicyIndex: number;
  topSelectedLegalUci: string;
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

function buildBoard(fixture: MaiaFixture): Chess {
  const chess = new Chess(fixture.startingFen);

  for (const uci of fixture.moveUcis) {
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });

    assert.ok(move, `fixture move ${uci} must be legal`);
  }

  return chess;
}

test("Maia move vocabulary matches official size and ordering anchors", () => {
  assert.equal(MAIA3_MOVE_VOCABULARY.length, 4352);
  assert.equal(MAIA3_MOVE_VOCABULARY[0], "a1a1");
  assert.equal(MAIA3_MOVE_VOCABULARY[1], "a1b1");
  assert.equal(MAIA3_MOVE_VOCABULARY[4096], "a7a8q");
  assert.equal(MAIA3_MOVE_TO_INDEX.get("a7a8q"), 4096);
});

test("Maia vertical move mirroring matches official utility semantics", () => {
  assert.equal(mirrorMaiaMoveUci("e7e5"), "e2e4");
  assert.equal(mirrorMaiaMoveUci("a7a8q"), "a2a1q");
});

for (const fixtureName of FIXTURE_NAMES) {
  test(`Maia legal mask and decoding match official Python fixture: ${fixtureName}`, () => {
    const fixture = readFixture(fixtureName);
    const chess = buildBoard(fixture);

    assert.deepEqual(getLegalMaiaMoveIndices(chess), fixture.legalMoveIndices);
    assert.equal(
      decodeMaiaMoveIndex(fixture.expectedDecodedIndex, chess),
      fixture.expectedDecodedUci,
    );
    assert.equal(
      decodeMaiaMoveIndex(fixture.topPolicyIndex, chess),
      fixture.topSelectedLegalUci,
    );
  });
}
