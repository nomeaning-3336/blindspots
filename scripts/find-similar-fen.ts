import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Chess } from "chess.js";

const require = createRequire(import.meta.url);
const fenSimilarity: typeof import("../lib/fen-consequence-similarity") = require("../lib/fen-consequence-similarity.ts");

const {
  compareFenFingerprints,
  extractFenConsequenceFingerprint,
} = fenSimilarity;

interface PositionRecord {
  id: string;
  fen: string;
  group: string;
  role: string;
  metadata: Record<string, unknown>;
}

interface Args {
  fen: string;
  input: string;
  top: number;
  group?: string;
  role?: string;
}

const DEFAULT_INPUT = "maia2-skill-adaptation/maia2-skill-adaptation/blindspots_sae_outputs/selected_puzzles.csv";

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.fen) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const input = fs.existsSync(path.resolve(process.cwd(), args.input))
    ? args.input
    : "public/elite_positions.json";

  const query = extractFenConsequenceFingerprint(args.fen);
  const records = loadRecords(input)
    .filter((record) => !args.group || record.group === args.group)
    .filter((record) => !args.role || record.role === args.role);

  if (!records.length) {
    throw new Error(`No searchable positions found in ${input}.`);
  }

  const results = records
    .map((record) => {
      const comparison = compareFenFingerprints(query, extractFenConsequenceFingerprint(record.fen));
      return { record, comparison };
    })
    .sort((left, right) => right.comparison.score - left.comparison.score)
    .slice(0, args.top);

  console.log(`# Similar FEN search`);
  console.log(`Input: ${input}`);
  console.log(`Query: ${query.fen}`);
  if (args.group) console.log(`Group filter: ${args.group}`);
  if (args.role) console.log(`Role filter: ${args.role}`);
  console.log("");

  results.forEach((result, index) => {
    const { record, comparison } = result;
    console.log(
      `${index + 1}. score=${format(comparison.score)} token=${format(comparison.tokenScore)} pressure=${format(comparison.pressureScore)} scalar=${format(comparison.scalarScore)} mobility=${format(comparison.mobilityScore)} material=${format(comparison.materialScore)}`,
    );
    console.log(`   id=${record.id} group=${record.group || "unknown"} role=${record.role || "unknown"}`);
    const tactic = stringField(record.metadata, ["tactic_san", "played_move", "move", "best_move"]);
    const themes = stringField(record.metadata, ["themes", "opening", "opening_tags"]);
    const url = stringField(record.metadata, ["game_url", "lichess_url", "url"]);
    if (tactic) console.log(`   tactic=${tactic}`);
    if (themes) console.log(`   themes=${themes}`);
    if (url) console.log(`   url=${url}`);
    console.log(`   fen=${record.fen}`);
  });
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    fen: "",
    input: DEFAULT_INPUT,
    top: 10,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--fen" && next) {
      args.fen = next;
      index += 1;
    } else if (arg === "--input" && next) {
      args.input = next;
      index += 1;
    } else if (arg === "--top" && next) {
      args.top = Math.max(1, Number(next) || 10);
      index += 1;
    } else if (arg === "--group" && next) {
      args.group = next;
      index += 1;
    } else if (arg === "--role" && next) {
      args.role = next;
      index += 1;
    }
  }

  if (args.fen) {
    new Chess(args.fen);
  }

  return args;
}

function loadRecords(input: string): PositionRecord[] {
  const absolutePath = path.resolve(process.cwd(), input);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const extension = path.extname(input).toLowerCase();
  const rows =
    extension === ".csv"
      ? parseCsv(raw)
      : extractRows(JSON.parse(raw));

  return rows
    .map((row, index) => normalizeRecord(row, index))
    .filter((record): record is PositionRecord => Boolean(record));
}

function normalizeRecord(row: Record<string, unknown>, index: number): PositionRecord | null {
  const fen = stringField(row, [
    "position_fen",
    "positionFen",
    "fen",
    "FEN",
    "source_fen",
    "sourceFen",
    "position",
    "epd",
  ]);
  if (!fen) return null;

  try {
    new Chess(fen);
  } catch {
    return null;
  }

  return {
    id: stringField(row, ["key", "id", "puzzle_id", "puzzleId", "position_id", "positionId"]) || `pos_${index + 1}`,
    fen,
    group: stringField(row, ["group", "group_id", "groupId", "theme", "opening", "label"]),
    role: stringField(row, ["role", "split", "partition", "set"]),
    metadata: row,
  };
}

function extractRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isObjectRecord);
  if (!isObjectRecord(value)) return [];

  for (const key of ["positions", "puzzles", "items", "records", "data", "selected", "heldout", "held_out"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate.filter(isObjectRecord);
  }

  return [];
}

function parseCsv(raw: string): Record<string, unknown>[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function stringField(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function format(value: number) {
  return value.toFixed(3);
}

function printUsage() {
  console.log(`Usage:
node --experimental-strip-types scripts/find-similar-fen.ts --fen "<FEN>" [--top 10] [--group queen_mate1] [--role candidate]

Defaults:
--input ${DEFAULT_INPUT}`);
}
