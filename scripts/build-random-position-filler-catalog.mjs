import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Chess } from "chess.js";

const SOURCES = [
  {
    path: resolve(process.cwd(), "public", "generated-training", "generated_training_opening_positions.json"),
    phase: "opening",
  },
  {
    path: resolve(process.cwd(), "public", "generated-training", "generated_training_middlegame_positions.json"),
    phase: "middlegame",
  },
  {
    path: resolve(process.cwd(), "public", "generated-training", "generated_training_endgame_positions.json"),
    phase: "endgame",
  },
];

const OUTPUT_PATH = resolve(process.cwd(), "public", "filler", "random-position-catalog.json");

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPlayableFen(fen) {
  try {
    const chess = new Chess(fen);
    return !chess.isGameOver();
  } catch {
    return false;
  }
}

async function readJsonFile(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function readExistingItems() {
  try {
    const existing = await readJsonFile(OUTPUT_PATH);
    if (!Array.isArray(existing)) return new Map();

    const itemsBySourceRecordId = new Map();
    for (const item of existing) {
      if (!isRecord(item)) continue;
      if (typeof item.id !== "string") continue;
      if (typeof item.sourceRecordId !== "string") continue;
      if (typeof item.origin !== "string") continue;
      if (typeof item.fen !== "string") continue;
      if (typeof item.phase !== "string") continue;

      itemsBySourceRecordId.set(item.sourceRecordId, {
        id: item.id,
        origin: item.origin,
        fen: item.fen,
        phase: item.phase,
      });
    }
    return itemsBySourceRecordId;
  } catch {
    return new Map();
  }
}

const existingItems = await readExistingItems();
const catalog = [];
const seenSourceRecordIds = new Set();
let rejectedInvalidRecordCount = 0;
let rejectedInvalidFenCount = 0;
let rejectedDuplicateSourceRecordIdCount = 0;

for (const source of SOURCES) {
  const rows = await readJsonFile(source.path);
  if (!Array.isArray(rows)) {
    throw new Error(`Expected array in ${source.path}`);
  }

  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.fen !== "string") {
      rejectedInvalidRecordCount += 1;
      continue;
    }

    const sourceRecordId = `${source.phase}:${row.id}`;

    if (seenSourceRecordIds.has(sourceRecordId)) {
      rejectedDuplicateSourceRecordIdCount += 1;
      continue;
    }
    seenSourceRecordIds.add(sourceRecordId);

    if (!isPlayableFen(row.fen)) {
      rejectedInvalidFenCount += 1;
      continue;
    }

    const existingItem = existingItems.get(sourceRecordId);

    if (
      existingItem &&
      (
        existingItem.origin !== "random_position" ||
        existingItem.phase !== source.phase ||
        existingItem.fen !== row.fen
      )
    ) {
      throw new Error(
        `Refusing to rebind existing filler UUID for ${sourceRecordId}: catalog identity metadata changed`,
      );
    }

    catalog.push({
      id: existingItem?.id ?? randomUUID(),
      origin: "random_position",
      fen: row.fen,
      phase: source.phase,
      sourceRecordId,
    });
  }
}

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  outputPath: OUTPUT_PATH,
  writtenCount: catalog.length,
  rejectedInvalidRecordCount,
  rejectedInvalidFenCount,
  rejectedDuplicateSourceRecordIdCount,
  preservedExistingIdCount: catalog.filter(
    (item) => existingItems.get(item.sourceRecordId)?.id === item.id,
  ).length,
}, null, 2));
