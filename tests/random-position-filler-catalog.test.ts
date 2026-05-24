import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

test("random-position filler catalog refuses to rebind an existing UUID to a changed FEN", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "blindspots-filler-catalog-"));
  const generatedDir = resolve(tempRoot, "public", "generated-training");
  const fillerDir = resolve(tempRoot, "public", "filler");

  mkdirSync(generatedDir, { recursive: true });
  mkdirSync(fillerDir, { recursive: true });

  const playableFenA = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
  const playableFenB = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";

  writeFileSync(
    resolve(generatedDir, "generated_training_opening_positions.json"),
    JSON.stringify([{ id: "same-source-record", fen: playableFenB }]),
    "utf8",
  );
  writeFileSync(
    resolve(generatedDir, "generated_training_middlegame_positions.json"),
    "[]",
    "utf8",
  );
  writeFileSync(
    resolve(generatedDir, "generated_training_endgame_positions.json"),
    "[]",
    "utf8",
  );
  writeFileSync(
    resolve(fillerDir, "random-position-catalog.json"),
    JSON.stringify([
      {
        id: "11111111-1111-4111-8111-111111111111",
        origin: "random_position",
        fen: playableFenA,
        phase: "opening",
        sourceRecordId: "opening:same-source-record",
      },
    ]),
    "utf8",
  );

  const originalScript = readFileSync(
    resolve(process.cwd(), "scripts", "build-random-position-filler-catalog.mjs"),
    "utf8",
  );
  const chessModuleUrl = new URL(
    `file:///${resolve(process.cwd(), "node_modules", "chess.js", "dist", "esm", "chess.js").replace(/\\/g, "/")}`,
  ).href;
  const tempScript = originalScript.replace(
    'import { Chess } from "chess.js";',
    `import { Chess } from ${JSON.stringify(chessModuleUrl)};`,
  );
  writeFileSync(
    resolve(tempRoot, "build-random-position-filler-catalog.mjs"),
    tempScript,
    "utf8",
  );

  assert.throws(
    () => {
      execFileSync(
        process.execPath,
        [resolve(tempRoot, "build-random-position-filler-catalog.mjs")],
        {
          cwd: tempRoot,
          encoding: "utf8",
          stdio: "pipe",
        },
      );
    },
    /Refusing to rebind existing filler UUID for opening:same-source-record/,
  );
});
