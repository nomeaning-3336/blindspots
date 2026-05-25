import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";

const MAX_ITEMS = 30000;
const DEFAULT_INPUT_PATH = resolve(process.cwd(), "tmp", "lichess_db_puzzle.csv");
const INPUT_PATH = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : DEFAULT_INPUT_PATH;
const OUTPUT_PATH = resolve(process.cwd(), "public", "filler", "lichess-puzzle-catalog.json");

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  fields.push(current);
  return fields;
}

function applyTriggerMove(sourceFen, moves) {
  const triggerMove = moves.trim().split(/\s+/)[0] ?? "";

  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(triggerMove)) {
    return null;
  }

  try {
    const chess = new Chess(sourceFen);
    const played = chess.move({
      from: triggerMove.slice(0, 2),
      to: triggerMove.slice(2, 4),
      promotion: triggerMove.length === 5 ? triggerMove[4] : undefined,
    });

    if (!played || chess.isGameOver()) {
      return null;
    }

    return chess.fen();
  } catch {
    return null;
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

let rejectedInvalidCsvRowCount = 0;
let rejectedInvalidTriggerPositionCount = 0;
let rejectedDuplicateSourceRecordIdCount = 0;
let sawHeader = false;

const lines = createInterface({
  input: createReadStream(INPUT_PATH, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

for await (const line of lines) {
  if (!sawHeader) {
    sawHeader = true;

    if (line.trim() !== "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags") {
      throw new Error("Unexpected Lichess puzzle CSV header");
    }

    continue;
  }

  if (catalog.length >= MAX_ITEMS) {
    break;
  }

  const fields = parseCsvLine(line);

  if (fields.length < 10) {
    rejectedInvalidCsvRowCount += 1;
    continue;
  }

  const puzzleId = fields[0] ?? "";
  const sourceFen = fields[1] ?? "";
  const moves = fields[2] ?? "";

  if (!puzzleId || !sourceFen || !moves) {
    rejectedInvalidCsvRowCount += 1;
    continue;
  }

  const sourceRecordId = `lichess:${puzzleId}`;

  if (seenSourceRecordIds.has(sourceRecordId)) {
    rejectedDuplicateSourceRecordIdCount += 1;
    continue;
  }

  seenSourceRecordIds.add(sourceRecordId);

  const coldFen = applyTriggerMove(sourceFen, moves);

  if (!coldFen) {
    rejectedInvalidTriggerPositionCount += 1;
    continue;
  }

  const existingItem = existingItems.get(sourceRecordId);

  if (
    existingItem &&
    (
      existingItem.origin !== "lichess_puzzle" ||
      existingItem.phase !== "tactic" ||
      existingItem.fen !== coldFen
    )
  ) {
    throw new Error(
      `Refusing to rebind existing filler UUID for ${sourceRecordId}: catalog identity metadata changed`,
    );
  }

  catalog.push({
    id: existingItem?.id ?? randomUUID(),
    origin: "lichess_puzzle",
    fen: coldFen,
    phase: "tactic",
    sourceRecordId,
  });
}

if (!sawHeader) {
  throw new Error("Lichess puzzle CSV is empty");
}

if (catalog.length === 0) {
  throw new Error("No playable Lichess filler positions were imported");
}

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  inputPath: INPUT_PATH,
  outputPath: OUTPUT_PATH,
  writtenCount: catalog.length,
  rejectedInvalidCsvRowCount,
  rejectedInvalidTriggerPositionCount,
  rejectedDuplicateSourceRecordIdCount,
  preservedExistingIdCount: catalog.filter(
    (item) => existingItems.get(item.sourceRecordId)?.id === item.id,
  ).length,
}, null, 2));
