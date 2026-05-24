import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { Chess } from "chess.js";

type CatalogItem = {
  id: string;
  origin: string;
  fen: string;
  phase: string;
  sourceRecordId: string;
};

const catalogPath = resolve(process.cwd(), "public", "filler", "random-position-catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogItem[];

test("random-position filler catalog contains minimal UUID-backed cold positions", () => {
  assert.ok(catalog.length > 0, "catalog must contain at least one position");

  const ids = new Set<string>();
  const sourceRecordIds = new Set<string>();

  for (const item of catalog) {
    assert.deepEqual(
      Object.keys(item).sort(),
      ["fen", "id", "origin", "phase", "sourceRecordId"],
      "catalog entries must not contain prelude, tag, answer, or evaluation fields",
    );

    assert.match(
      item.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      "catalog item id must be a UUID v4",
    );

    assert.equal(item.origin, "random_position");
    assert.ok(
      item.phase === "opening" || item.phase === "middlegame" || item.phase === "endgame",
      "catalog item phase must be supported",
    );

    assert.ok(!ids.has(item.id), `duplicate catalog UUID: ${item.id}`);
    assert.ok(
      !sourceRecordIds.has(item.sourceRecordId),
      `duplicate sourceRecordId: ${item.sourceRecordId}`,
    );
    ids.add(item.id);
    sourceRecordIds.add(item.sourceRecordId);

    const chess = new Chess(item.fen);
    assert.equal(chess.isGameOver(), false, `terminal catalog position: ${item.sourceRecordId}`);
  }
});
