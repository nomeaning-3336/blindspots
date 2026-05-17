import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("client Stockfish engine supports UCI searchmoves", () => {
  const typesSource = readFileSync("lib/stockfish/types.ts", "utf8");
  const engineSource = readFileSync("lib/stockfish/client-engine.ts", "utf8");

  assert.match(typesSource, /searchMoves\?: string\[\]/);
  assert.match(engineSource, /searchMovesClause/);
  assert.match(engineSource, /searchmoves \$\{input\.searchMoves\.join\(" "\)\}/);
  assert.match(engineSource, /`go movetime \$\{movetimeMs\}\$\{searchMovesClause\}`/);
});
