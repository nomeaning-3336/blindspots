import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { Chess } from "chess.js";

const FILES = [
  "generated-training/generated_training_opening_positions.json",
  "generated-training/generated_training_middlegame_positions.json",
  "generated-training/generated_training_endgame_positions.json",
];

const REQUIRED_FIELDS = [
  "id",
  "fen",
  "previousFen",
  "playedMove",
  "phase",
  "sourceType",
  "sourceGameId",
  "sourcePly",
  "sideToMove",
  "tags",
  "createdAt",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeFenKey(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return "";
  return parts.slice(0, 4).join(" ");
}

function countPieces(fen) {
  const board = fen.trim().split(/\s+/)[0] ?? "";
  let count = 0;
  for (const ch of board) {
    if (/[pnbrqkPNBRQK]/.test(ch)) count++;
  }
  return count;
}

function validatePrelude(previousFen, playedMove, fen) {
  if (!previousFen || !playedMove || !fen) return false;
  try {
    const chess = new Chess(previousFen);
    const move = chess.move(playedMove);
    if (!move) return false;
    return normalizeFenKey(chess.fen()) === normalizeFenKey(fen);
  } catch {
    return false;
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round((sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo)) * 100) / 100;
}

function formatPct(value) {
  return value === null ? "N/A" : String(value);
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

const allRows = {};
const summaries = {};

for (const filename of FILES) {
  const path = resolve(process.cwd(), "public", filename);
  const raw = await readFile(path, "utf8");
  const rows = JSON.parse(raw);

  if (!Array.isArray(rows)) {
    console.log(`${filename}: ERROR — not an array`);
    continue;
  }

  allRows[filename] = rows;

  // --- 1. Row count ---
  console.log(`\n${"=".repeat(70)}`);
  console.log(`FILE: ${filename}`);
  console.log(`${"=".repeat(70)}`);
  console.log(`  Row count: ${rows.length}`);

  // --- 2. Duplicate normalized FEN ---
  const fenKeys = rows.map((r) => normalizeFenKey(r.fen));
  const fenCounts = new Map();
  for (const key of fenKeys) {
    fenCounts.set(key, (fenCounts.get(key) ?? 0) + 1);
  }
  const duplicates = [...fenCounts.entries()].filter(([, c]) => c > 1);
  console.log(`  Duplicate FEN keys: ${duplicates.length} keys appear >1 time`);
  if (duplicates.length > 0) {
    const topDups = duplicates.sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [key, count] of topDups) {
      console.log(`    "${key}": ${count}x`);
    }
  }

  // --- 3. Unique sourceGameId count ---
  const gameIds = new Set(rows.map((r) => r.sourceGameId));
  console.log(`  Unique sourceGameId: ${gameIds.size}`);

  // --- 4. Top 20 sourceGameId by row count ---
  const gameIdCounts = new Map();
  for (const r of rows) {
    gameIdCounts.set(r.sourceGameId, (gameIdCounts.get(r.sourceGameId) ?? 0) + 1);
  }
  const topGames = [...gameIdCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  console.log(`  Top 20 sourceGameId by row count:`);
  for (const [gid, count] of topGames) {
    console.log(`    ${gid}: ${count}`);
  }

  // --- 5. Max rows from one game ---
  const maxRows = Math.max(...gameIdCounts.values());
  console.log(`  Max rows from one game: ${maxRows}`);

  // --- 6. Side to move balance ---
  const whiteCount = rows.filter((r) => r.sideToMove === "white").length;
  const blackCount = rows.filter((r) => r.sideToMove === "black").length;
  const otherSide = rows.length - whiteCount - blackCount;
  console.log(
    `  sideToMove: white=${whiteCount} (${((whiteCount / rows.length) * 100).toFixed(1)}%) ` +
      `black=${blackCount} (${((blackCount / rows.length) * 100).toFixed(1)}%) ` +
      (otherSide ? `other=${otherSide}` : ""),
  );

  // --- 7. sourcePly distribution ---
  const plies = rows.map((r) => r.sourcePly).sort((a, b) => a - b);
  console.log(`  sourcePly distribution:`);
  console.log(`    min: ${plies[0]}`);
  console.log(`    p25: ${formatPct(percentile(plies, 25))}`);
  console.log(`    p50: ${formatPct(percentile(plies, 50))}`);
  console.log(`    p75: ${formatPct(percentile(plies, 75))}`);
  console.log(`    max: ${plies[plies.length - 1]}`);

  // --- 8. Piece count distribution ---
  const pieceCounts = rows.map((r) => countPieces(r.fen)).sort((a, b) => a - b);
  console.log(`  Piece count distribution:`);
  console.log(`    min: ${pieceCounts[0]}`);
  console.log(`    p25: ${formatPct(percentile(pieceCounts, 25))}`);
  console.log(`    p50: ${formatPct(percentile(pieceCounts, 50))}`);
  console.log(`    p75: ${formatPct(percentile(pieceCounts, 75))}`);
  console.log(`    max: ${pieceCounts[pieceCounts.length - 1]}`);

  // --- 9. Phase field consistency ---
  const expectedPhase = filename.includes("opening")
    ? "opening"
    : filename.includes("middlegame")
      ? "middlegame"
      : "endgame";
  const mismatchedPhase = rows.filter((r) => r.phase !== expectedPhase);
  console.log(
    `  Phase field: expected="${expectedPhase}", mismatches=${mismatchedPhase.length}`,
  );
  if (mismatchedPhase.length > 0) {
    const phaseDist = new Map();
    for (const r of rows) phaseDist.set(r.phase, (phaseDist.get(r.phase) ?? 0) + 1);
    console.log(`    Actual distribution: ${JSON.stringify([...phaseDist.entries()])}`);
  }

  // --- 10. Missing required fields ---
  const missingFieldRows = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const missing = REQUIRED_FIELDS.filter((f) => r[f] === undefined || r[f] === null);
    if (missing.length > 0) {
      missingFieldRows.push({ index: i, id: r.id, missing });
    }
  }
  console.log(`  Missing required fields: ${missingFieldRows.length} rows`);
  if (missingFieldRows.length > 0 && missingFieldRows.length <= 10) {
    for (const mr of missingFieldRows) {
      console.log(`    row ${mr.index} (${mr.id}): missing ${mr.missing.join(", ")}`);
    }
  }

  // --- 11. Prelude validation failures ---
  const preludeFailures = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!validatePrelude(r.previousFen, r.playedMove, r.fen)) {
      preludeFailures.push({ index: i, id: r.id });
    }
  }
  console.log(`  Prelude validation failures: ${preludeFailures.length}`);
  if (preludeFailures.length > 0 && preludeFailures.length <= 10) {
    for (const pf of preludeFailures) {
      const r = rows[pf.index];
      console.log(`    row ${pf.index} (${pf.id}):`);
      console.log(`      previousFen: ${r.previousFen}`);
      console.log(`      playedMove:  ${r.playedMove}`);
      console.log(`      fen:         ${r.fen}`);
    }
  }

  // Save summary for cross-file analysis
  summaries[filename] = {
    rows,
    fenKeys: new Set(fenKeys),
    gameIds,
    plies,
    pieceCounts,
    whiteCount,
    blackCount,
  };
}

// ---------------------------------------------------------------------------
// Cross-file analysis
// ---------------------------------------------------------------------------

console.log(`\n${"=".repeat(70)}`);
console.log("CROSS-FILE ANALYSIS");
console.log(`${"=".repeat(70)}`);

// --- 12. Phase overlap by normalized FEN ---
const fileEntries = Object.entries(summaries);
const totalRows = fileEntries.reduce((s, [, v]) => s + v.rows.length, 0);
console.log(`\n  Total rows across all files: ${totalRows}`);

for (let i = 0; i < fileEntries.length; i++) {
  for (let j = i + 1; j < fileEntries.length; j++) {
    const [nameA, dataA] = fileEntries[i];
    const [nameB, dataB] = fileEntries[j];
    const overlap = [...dataA.fenKeys].filter((k) => dataB.fenKeys.has(k));
    console.log(
      `  Overlap ${nameA} <-> ${nameB}: ${overlap.length} FEN keys`,
    );
    if (overlap.length > 0 && overlap.length <= 5) {
      for (const key of overlap) {
        console.log(`    "${key}"`);
      }
    }
  }
}

// --- 13. Sample 10 random rows per phase ---
console.log(`\n  --- SAMPLES ---`);

for (const [filename, data] of fileEntries) {
  const phaseName = filename.includes("opening")
    ? "opening"
    : filename.includes("middlegame")
      ? "middlegame"
      : "endgame";

  console.log(`\n  ${phaseName} (${filename}):`);

  const rows = data.rows;
  const indices = [];
  const step = Math.max(1, Math.floor(rows.length / 10));
  for (let s = 0; s < 10; s++) {
    indices.push(Math.min(s * step, rows.length - 1));
  }

  for (const idx of indices) {
    const r = rows[idx];
    console.log(`    [${idx}] id=${r.id}`);
    console.log(`        previousFen: ${r.previousFen}`);
    console.log(`        playedMove:  ${r.playedMove}`);
    console.log(`        fen:         ${r.fen}`);
    console.log(`        phase=${r.phase} ply=${r.sourcePly} side=${r.sideToMove} game=${r.sourceGameId}`);
    console.log(`        pieces=${countPieces(r.fen)}`);
  }
}

// ---------------------------------------------------------------------------
// Overall summary
// ---------------------------------------------------------------------------

console.log(`\n${"=".repeat(70)}`);
console.log("OVERALL SUMMARY");
console.log(`${"=".repeat(70)}`);

let redFlags = [];

for (const [filename, data] of fileEntries) {
  const rows = data.rows;
  const dups = rows.length - new Set(rows.map((r) => normalizeFenKey(r.fen))).size;
  const phaseMismatches = rows.filter((r) => {
    const expected = filename.includes("opening")
      ? "opening"
      : filename.includes("middlegame")
        ? "middlegame"
        : "endgame";
    return r.phase !== expected;
  }).length;

  console.log(`\n  ${filename}:`);
  console.log(`    rows=${rows.length} games=${data.gameIds.size} dups=${dups} phase_mismatch=${phaseMismatches}`);
  console.log(`    side_balance: W=${data.whiteCount} B=${data.blackCount}`);

  if (dups > 0) redFlags.push(`${filename}: ${dups} duplicate FEN keys`);
  if (phaseMismatches > rows.length * 0.1) redFlags.push(`${filename}: ${phaseMismatches} phase mismatches (>10%)`);
  if (Math.abs(data.whiteCount - data.blackCount) > rows.length * 0.2) redFlags.push(`${filename}: side imbalance >20%`);
  if (data.gameIds.size < 5) redFlags.push(`${filename}: only ${data.gameIds.size} source games`);
}

if (redFlags.length === 0) {
  console.log(`\n  NO RED FLAGS FOUND`);
} else {
  console.log(`\n  RED FLAGS:`);
  for (const flag of redFlags) {
    console.log(`    - ${flag}`);
  }
}
