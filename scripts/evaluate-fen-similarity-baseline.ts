import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Chess } from "chess.js";
import type { Move } from "chess.js";

const require = createRequire(import.meta.url);
const fenSimilarity: typeof import("../lib/fen-consequence-similarity") = require("../lib/fen-consequence-similarity.ts");

const {
  compareFenFingerprints,
  extractFenConsequenceFingerprint,
} = fenSimilarity;

interface PositionRecord {
  id: string;
  fen: string;
  groupId: string;
  groupLabel: string;
  split: string;
  metadata: Record<string, unknown>;
}

interface Args {
  selected?: string;
  heldout?: string;
  input?: string;
  threshold: number;
  pawnScanLimit: number;
  examples: number;
}

interface RetrievalRow {
  queryGroup: string;
  queryLabel: string;
  top: Array<{
    record: PositionRecord;
    score: number;
  }>;
}

interface PawnMoveCase {
  record: PositionRecord;
  move: Move;
  score: number;
  delta: number;
  reasons: string[];
}

const DEFAULT_THRESHOLD = 0.08;
const COMMON_SELECTED_PATHS = [
  "maia2-skill-adaptation/maia2-skill-adaptation/blindspots_sae_outputs/selected_puzzles.csv",
  "tmp/sae-selected-puzzles.json",
  "tmp/sae-validation-selected.json",
  "tmp/selected-puzzles.json",
  "data/sae-selected-puzzles.json",
  "data/selected-puzzles.json",
  "public/selected_puzzles.json",
];
const COMMON_HELDOUT_PATHS = [
  "tmp/sae-heldout-puzzles.json",
  "tmp/sae-held-out-puzzles.json",
  "tmp/sae-validation-heldout.json",
  "tmp/heldout-puzzles.json",
  "data/sae-heldout-puzzles.json",
  "data/heldout-puzzles.json",
  "public/heldout_puzzles.json",
];

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = loadDataset(args);
  const selected = prepareRecords(dataset.selected, "selected");
  const heldout = prepareRecords(dataset.heldout, "heldout");

  if (selected.length === 0 || heldout.length === 0) {
    throw new Error("Need at least one selected and one held-out FEN to evaluate retrieval.");
  }

  const seedFingerprints = selected.map((record) => ({
    record,
    fingerprint: extractFenConsequenceFingerprint(record.fen),
  }));
  const candidateFingerprints = heldout.map((record) => ({
    record,
    fingerprint: extractFenConsequenceFingerprint(record.fen),
  }));
  const { retrievalRows, allScores } = evaluateGroupPrototypeRetrieval(
    seedFingerprints,
    candidateFingerprints,
  );

  const sameGroupMetrics = summarizeSameGroupRetrieval(retrievalRows);
  const distribution = summarizeDistribution(allScores);
  const pawnCases = findPawnMoveCases(
    [...heldout, ...selected].slice(0, args.pawnScanLimit),
    args.threshold,
  );

  printReport({
    sourceNote: dataset.sourceNote,
    selected,
    heldout,
    sameGroupMetrics,
    distribution,
    retrievalRows,
    pawnCases,
    threshold: args.threshold,
    examples: args.examples,
    pawnScanLimit: args.pawnScanLimit,
  });
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    threshold: DEFAULT_THRESHOLD,
    pawnScanLimit: 200,
    examples: 6,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--selected" && next) {
      args.selected = next;
      index += 1;
    } else if (arg === "--heldout" && next) {
      args.heldout = next;
      index += 1;
    } else if (arg === "--input" && next) {
      args.input = next;
      index += 1;
    } else if (arg === "--threshold" && next) {
      args.threshold = Number(next);
      index += 1;
    } else if (arg === "--pawn-scan-limit" && next) {
      args.pawnScanLimit = Number(next);
      index += 1;
    } else if (arg === "--examples" && next) {
      args.examples = Number(next);
      index += 1;
    }
  }

  if (!Number.isFinite(args.threshold) || args.threshold < 0 || args.threshold > 1) {
    args.threshold = DEFAULT_THRESHOLD;
  }
  if (!Number.isFinite(args.pawnScanLimit) || args.pawnScanLimit < 1) {
    args.pawnScanLimit = 200;
  }
  if (!Number.isFinite(args.examples) || args.examples < 1) {
    args.examples = 6;
  }

  return args;
}

function loadDataset(args: Args): {
  selected: PositionRecord[];
  heldout: PositionRecord[];
  sourceNote: string;
} {
  if (args.selected && args.heldout) {
    return {
      selected: loadRecords(args.selected, "selected"),
      heldout: loadRecords(args.heldout, "heldout"),
      sourceNote: `Using explicit split files: selected=${args.selected}, heldout=${args.heldout}`,
    };
  }

  if (args.input) {
    const records = loadRecords(args.input, "input");
    const split = splitFromRecordField(records);
    return {
      ...split,
      sourceNote: `Using explicit input file: ${args.input}`,
    };
  }

  const selectedPath = firstExisting(COMMON_SELECTED_PATHS);
  const heldoutPath = firstExisting(COMMON_HELDOUT_PATHS);
  if (selectedPath && heldoutPath) {
    return {
      selected: loadRecords(selectedPath, "selected"),
      heldout: loadRecords(heldoutPath, "heldout"),
      sourceNote: `Using discovered SAE-like split files: selected=${selectedPath}, heldout=${heldoutPath}`,
    };
  }
  if (selectedPath) {
    const records = loadRecords(selectedPath, "input");
    const split = splitFromRecordField(records);
    return {
      ...split,
      sourceNote: `Using discovered SAE selected_puzzles file with role split: ${selectedPath}`,
    };
  }

  const fallbackPath = "public/elite_positions.json";
  const fallbackRecords = loadRecords(fallbackPath, "elite");
  const split = deterministicStratifiedSplit(fallbackRecords);
  return {
    ...split,
    sourceNote:
      `SAE selected/held-out split files were not found; using deterministic fallback split from ${fallbackPath}.`,
  };
}

function loadRecords(filePath: string, split: string): PositionRecord[] {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const extension = path.extname(filePath).toLowerCase();
  let rows: Record<string, unknown>[];

  if (extension === ".jsonl" || extension === ".ndjson") {
    rows = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  } else if (extension === ".csv") {
    rows = parseCsv(raw);
  } else {
    rows = extractRows(JSON.parse(raw));
  }

  return rows
    .map((row, index) => normalizeRecord(row, index, split))
    .filter((record): record is PositionRecord => Boolean(record));
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

function normalizeRecord(
  row: Record<string, unknown>,
  index: number,
  split: string,
): PositionRecord | null {
  const fen = stringField(row, ["fen", "FEN", "position_fen", "positionFen", "position", "source_fen", "sourceFen", "epd"]);
  if (!fen) return null;

  try {
    new Chess(fen);
  } catch {
    return null;
  }

  const id = stringField(row, ["id", "puzzle_id", "puzzleId", "position_id", "positionId"]) || `${split}_${index + 1}`;
  const groupLabel =
    stringField(row, [
      "group",
      "group_id",
      "groupId",
      "same_group",
      "sameGroup",
      "cluster",
      "theme",
      "opening",
      "label",
      "tag",
    ]) || "ungrouped";

  return {
    id,
    fen,
    groupId: slug(groupLabel),
    groupLabel,
    split: stringField(row, ["split", "partition", "set", "role"]) || split,
    metadata: row,
  };
}

function splitFromRecordField(records: PositionRecord[]) {
  const selected = records.filter((record) => /selected|train|validation|seed/i.test(record.split));
  const heldout = records.filter((record) => /held|test|candidate/i.test(record.split));
  if (selected.length && heldout.length) {
    return { selected, heldout };
  }
  return deterministicStratifiedSplit(records);
}

function deterministicStratifiedSplit(records: PositionRecord[]) {
  const byGroup = new Map<string, PositionRecord[]>();
  for (const record of records) {
    const group = byGroup.get(record.groupId) ?? [];
    group.push(record);
    byGroup.set(record.groupId, group);
  }

  const selected: PositionRecord[] = [];
  const heldout: PositionRecord[] = [];
  for (const group of [...byGroup.values()]) {
    group.forEach((record, index) => {
      const next = {
        ...record,
        split: group.length > 1 && index % 4 === 3 ? "heldout" : "selected",
      };
      if (next.split === "heldout") heldout.push(next);
      else selected.push(next);
    });
  }

  if (heldout.length === 0) {
    records.forEach((record, index) => {
      const next = { ...record, split: index % 5 === 4 ? "heldout" : "selected" };
      if (next.split === "heldout") heldout.push(next);
      else selected.push(next);
    });
  }

  return { selected, heldout };
}

function prepareRecords(records: PositionRecord[], split: string) {
  return records.map((record, index) => ({
    ...record,
    id: record.id || `${split}_${index + 1}`,
    split,
  }));
}

function evaluateGroupPrototypeRetrieval(
  seeds: Array<{
    record: PositionRecord;
    fingerprint: ReturnType<typeof extractFenConsequenceFingerprint>;
  }>,
  candidates: Array<{
    record: PositionRecord;
    fingerprint: ReturnType<typeof extractFenConsequenceFingerprint>;
  }>,
) {
  const seedGroups = new Map<string, typeof seeds>();
  for (const seed of seeds) {
    const group = seedGroups.get(seed.record.groupId) ?? [];
    group.push(seed);
    seedGroups.set(seed.record.groupId, group);
  }

  const retrievalRows: RetrievalRow[] = [];
  const allScores: number[] = [];

  for (const [queryGroup, groupSeeds] of seedGroups) {
    const queryLabel = groupSeeds[0]?.record.groupLabel ?? queryGroup;
    const top = candidates
      .map((candidate) => {
        const score =
          groupSeeds.reduce(
            (acc, seed) => acc + compareFenFingerprints(seed.fingerprint, candidate.fingerprint).score,
            0,
          ) / Math.max(1, groupSeeds.length);
        allScores.push(score);
        return {
          record: candidate.record,
          score,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 10);

    retrievalRows.push({
      queryGroup,
      queryLabel,
      top,
    });
  }

  return { retrievalRows, allScores };
}

function summarizeSameGroupRetrieval(rows: RetrievalRow[]) {
  const histogram = new Map<number, number>();
  let totalSameInTop10 = 0;
  let hitAt1 = 0;
  let hitAt3 = 0;
  let hitAt10 = 0;
  const countsByGroup: Record<string, number> = {};

  for (const row of rows) {
    const sameFlags = row.top.map((entry) => entry.record.groupId === row.queryGroup);
    const sameCount = sameFlags.filter(Boolean).length;
    countsByGroup[row.queryLabel] = sameCount;
    histogram.set(sameCount, (histogram.get(sameCount) ?? 0) + 1);
    totalSameInTop10 += sameCount;
    if (sameFlags[0]) hitAt1 += 1;
    if (sameFlags.slice(0, 3).some(Boolean)) hitAt3 += 1;
    if (sameFlags.some(Boolean)) hitAt10 += 1;
  }

  return {
    queryCount: rows.length,
    totalSameInTop10,
    avgSameInTop10: totalSameInTop10 / Math.max(1, rows.length),
    hitAt1,
    hitAt3,
    hitAt10,
    countsByGroup,
    histogram,
  };
}

function summarizeDistribution(scores: number[]) {
  const sorted = [...scores].sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: percentile(sorted, 0),
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: percentile(sorted, 1),
    mean: sorted.reduce((acc, score) => acc + score, 0) / Math.max(1, sorted.length),
  };
}

function findPawnMoveCases(records: PositionRecord[], threshold: number) {
  const irrelevant: PawnMoveCase[] = [];
  const meaningful: PawnMoveCase[] = [];

  for (const record of records) {
    const chess = new Chess(record.fen);
    const before = extractFenConsequenceFingerprint(record.fen);
    const legalPawnMoves = (chess.moves({ verbose: true }) as Move[]).filter((move) => move.piece === "p");

    for (const move of legalPawnMoves) {
      const after = extractFenConsequenceFingerprint(move.after);
      const score = compareFenFingerprints(before, after).score;
      const delta = 1 - score;
      const reasons = pawnMoveReasons(move, before.tokens, after.tokens);
      const meaningfulMove = reasons.some((reason) => reason !== "quiet flank pawn push");
      const entry = { record, move, score, delta, reasons };

      if (!meaningfulMove && delta < Math.max(threshold, 0.16)) {
        irrelevant.push(entry);
      }
      if (meaningfulMove) {
        meaningful.push(entry);
      }
    }
  }

  return {
    irrelevant: irrelevant.sort((left, right) => left.delta - right.delta),
    meaningful: meaningful.sort((left, right) => right.delta - left.delta),
  };
}

function pawnMoveReasons(move: Move, beforeTokens: Record<string, number>, afterTokens: Record<string, number>) {
  const reasons: string[] = [];
  if (move.isCapture()) reasons.push("capture");
  if (move.isPromotion()) reasons.push("promotion");
  if (move.san.includes("+")) reasons.push("check");
  if (/[cdef][45]/.test(move.from) || /[cdef][45]/.test(move.to)) reasons.push("center pawn structure");
  if (tokenFamilyChanged(beforeTokens, afterTokens, "advanced-passed-pawn")) reasons.push("advanced passed pawn");
  if (tokenFamilyChanged(beforeTokens, afterTokens, "promotion-path-clear")) reasons.push("promotion path");
  if (tokenFamilyChanged(beforeTokens, afterTokens, "center:")) reasons.push("center lock/opening");
  if (tokenFamilyChanged(beforeTokens, afterTokens, "king-shield")) reasons.push("king shield");
  if (tokenFamilyChanged(beforeTokens, afterTokens, "king-near-open-file")) reasons.push("king file exposure");
  if (!reasons.length) reasons.push("quiet flank pawn push");
  return reasons;
}

function tokenFamilyChanged(
  beforeTokens: Record<string, number>,
  afterTokens: Record<string, number>,
  prefix: string,
) {
  const before = Object.keys(beforeTokens).filter((token) => token.startsWith(prefix)).sort().join("|");
  const after = Object.keys(afterTokens).filter((token) => token.startsWith(prefix)).sort().join("|");
  return before !== after;
}

function printReport(input: {
  sourceNote: string;
  selected: PositionRecord[];
  heldout: PositionRecord[];
  sameGroupMetrics: ReturnType<typeof summarizeSameGroupRetrieval>;
  distribution: ReturnType<typeof summarizeDistribution>;
  retrievalRows: RetrievalRow[];
  pawnCases: ReturnType<typeof findPawnMoveCases>;
  threshold: number;
  examples: number;
  pawnScanLimit: number;
}) {
  const {
    sourceNote,
    selected,
    heldout,
    sameGroupMetrics,
    distribution,
    retrievalRows,
    pawnCases,
    threshold,
    examples,
    pawnScanLimit,
  } = input;

  console.log("# FEN consequence similarity baseline report");
  console.log("");
  console.log(sourceNote);
  console.log(`Selected positions: ${selected.length}`);
  console.log(`Held-out positions: ${heldout.length}`);
  console.log(`Anti-duplicate delta threshold: ${format(threshold)}`);
  console.log("");

  console.log("## Top-10 same-group retrieval counts");
  console.log(`Queries: ${sameGroupMetrics.queryCount}`);
  console.log(`Total same-group hits in top 10: ${sameGroupMetrics.totalSameInTop10}`);
  console.log(`Average same-group hits per query top 10: ${format(sameGroupMetrics.avgSameInTop10)}`);
  console.log(`Hit@1: ${sameGroupMetrics.hitAt1}/${sameGroupMetrics.queryCount}`);
  console.log(`Hit@3: ${sameGroupMetrics.hitAt3}/${sameGroupMetrics.queryCount}`);
  console.log(`Hit@10: ${sameGroupMetrics.hitAt10}/${sameGroupMetrics.queryCount}`);
  console.log(
    `Per-group top-10 same-group counts: ${Object.entries(sameGroupMetrics.countsByGroup)
      .map(([group, count]) => `${group}:${count}`)
      .join(", ")}`,
  );
  console.log(
    `Histogram same-group hits in top 10: ${[...sameGroupMetrics.histogram.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([count, queries]) => `${count}:${queries}`)
      .join(", ")}`,
  );
  console.log("");

  console.log("## Similarity distribution");
  console.log(`Pair count: ${distribution.count}`);
  console.log(
    [
      `min=${format(distribution.min)}`,
      `p10=${format(distribution.p10)}`,
      `p25=${format(distribution.p25)}`,
      `median=${format(distribution.median)}`,
      `p75=${format(distribution.p75)}`,
      `p90=${format(distribution.p90)}`,
      `p95=${format(distribution.p95)}`,
      `p99=${format(distribution.p99)}`,
      `max=${format(distribution.max)}`,
      `mean=${format(distribution.mean)}`,
    ].join(" "),
  );
  console.log("");

  console.log("## Qualitative retrieved examples");
  for (const row of representativeRows(retrievalRows).slice(0, examples)) {
    console.log(`Query group="${row.queryLabel}"`);
    row.top.slice(0, 3).forEach((entry, index) => {
      const marker = entry.record.groupId === row.queryGroup ? "same" : "diff";
      console.log(`  ${index + 1}. ${format(entry.score)} ${marker} ${describeRecord(entry.record)}`);
    });
  }
  console.log("");

  console.log("## Irrelevant pawn push near-duplicates");
  console.log(`Scanned first ${Math.min(pawnScanLimit, selected.length + heldout.length)} records for legal pawn pushes.`);
  const irrelevant = pawnCases.irrelevant.filter((entry) => entry.delta < threshold);
  const irrelevantRows = irrelevant.length ? irrelevant : pawnCases.irrelevant;
  if (!irrelevantRows.length) {
    console.log("No quiet pawn pushes landed in the near-duplicate band for this dataset.");
  } else {
    for (const entry of irrelevantRows.slice(0, examples)) {
      console.log(
        `${format(entry.score)} delta=${format(entry.delta)} ${entry.move.san} ${describeRecord(entry.record)} reasons=${entry.reasons.join(", ")}`,
      );
    }
  }
  console.log("");

  console.log("## Meaningful pawn pushes that change the score");
  if (!pawnCases.meaningful.length) {
    console.log("No meaningful pawn-push cases were found in the scanned records.");
  } else {
    for (const entry of pawnCases.meaningful.slice(0, examples)) {
      console.log(
        `${format(entry.score)} delta=${format(entry.delta)} ${entry.move.san} ${describeRecord(entry.record)} reasons=${entry.reasons.join(", ")}`,
      );
    }
  }
}

function representativeRows(rows: RetrievalRow[]) {
  const hitRows = rows.filter((row) => row.top.some((entry) => entry.record.groupId === row.queryGroup));
  const missRows = rows.filter((row) => !row.top.some((entry) => entry.record.groupId === row.queryGroup));
  const seen = new Set<string>();
  const representatives: RetrievalRow[] = [];
  for (const row of [...hitRows, ...missRows, ...rows]) {
    if (seen.has(row.queryGroup)) continue;
    seen.add(row.queryGroup);
    representatives.push(row);
  }
  return representatives;
}

function describeRecord(record: PositionRecord) {
  const move = stringField(record.metadata, ["played_move", "move", "bestMove", "best_move"]);
  const moveSuffix = move ? ` move=${move}` : "";
  return `${record.id} group="${record.groupLabel}"${moveSuffix} fen="${record.fen}"`;
}

function percentile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const index = Math.round((sorted.length - 1) * q);
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function firstExisting(paths: string[]) {
  return paths.find((candidate) => fs.existsSync(path.resolve(process.cwd(), candidate)));
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

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ungrouped";
}

function format(value: number) {
  return value.toFixed(3);
}
