import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fenSimilarity: typeof import("../lib/fen-consequence-similarity") = require("../lib/fen-consequence-similarity.ts");
const { compareFenFingerprints, extractFenConsequenceFingerprint } = fenSimilarity;
const { compatiblePhaseMaterial, fenPhaseProfile } = require("./position-index-utils.ts") as {
  compatiblePhaseMaterial: (query: PositionPhaseProfile, candidate: PositionPhaseProfile, maxPhaseDelta?: number) => boolean;
  fenPhaseProfile: (fen: string) => PositionPhaseProfile;
};
const compact = require("./compact-position-index.ts") as typeof import("./compact-position-index");
const { defaultCompactPathFromIndex, loadCompactIndex, searchCompactIndex, searchCompactRowsIndex } = compact;

interface PositionPhaseProfile {
  phaseScore: number;
  inferredPhase: string;
  suggestedMinPly: number;
  materialRatio: number;
  nonKingMaterial: number;
  materialClass: string;
  detailedMaterialClass: string;
  queensPresent: boolean;
  rooksPresent: boolean;
  heavyPiecesPresent: boolean;
  sideToMove: "w" | "b";
}

interface IndexRow {
  position_id: string;
  fen: string;
  phaseScore: number;
  inferredPhase: string;
  materialClass: string;
  detailedMaterialClass?: string;
  materialRatio: number;
  queensPresent: boolean;
  rooksPresent: boolean;
  heavyPiecesPresent: boolean;
  sideToMove: string;
  fingerprint: ReturnType<typeof extractFenConsequenceFingerprint>;
  metadata: {
    game_index: number;
    ply: number;
    white?: string;
    black?: string;
    event?: string;
    site?: string;
    result?: string;
  };
}

interface SlowResult {
  score: number;
  row: IndexRow;
  breakdown: ReturnType<typeof compareFenFingerprints>;
}

const args = parseArgs(process.argv.slice(2));

if (!args.slowExact && args.compactManifest && fs.existsSync(args.compactManifest)) {
  const summary = await searchCompactRowsIndex(args.compactManifest, args.fen, args);
  printCompactSummary(summary, 0, args.compactManifest, "compact rows");
} else if (!args.slowExact && fs.existsSync(args.compactIndex)) {
  const started = performance.now();
  const index = loadCompactIndex(args.compactIndex);
  const loadMs = performance.now() - started;
  const summary = searchCompactIndex(index, args.fen, args);
  printCompactSummary(summary, loadMs, args.compactIndex, "compact");
} else {
  const summary = await searchSlowNdjson(args);
  printSlowSummary(summary, args.index);
}

async function searchSlowNdjson(args: ReturnType<typeof parseArgs>) {
  const started = performance.now();
  const queryFingerprint = extractFenConsequenceFingerprint(args.fen);
  const queryProfile = fenPhaseProfile(args.fen);
  const top: SlowResult[] = [];
  const seenGames = new Set<number>();
  let total = 0;
  let afterFilters = 0;
  let exactScored = 0;

  const reader = readline.createInterface({
    input: fs.createReadStream(args.index, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    if (!line.trim()) continue;
    total += 1;
    const row = JSON.parse(line) as IndexRow;
    const candidateProfile = rowProfile(row);
    if (!compatiblePhaseMaterial(queryProfile, candidateProfile, args.maxPhaseDelta)) continue;
    afterFilters += 1;

    const breakdown = compareFenFingerprints(queryFingerprint, row.fingerprint);
    exactScored += 1;
    if (breakdown.score < args.minScore) continue;
    if (args.maxOnePerGame && seenGames.has(row.metadata.game_index)) continue;
    insertTop(top, { score: breakdown.score, row, breakdown }, args.keep);
    if (args.maxOnePerGame) {
      seenGames.clear();
      for (const item of top) seenGames.add(item.row.metadata.game_index);
    }
  }

  return {
    queryFen: queryFingerprint.fen,
    indexedPositions: total,
    candidatesAfterFilters: afterFilters,
    exactScoredCandidates: exactScored,
    elapsedMs: performance.now() - started,
    results: top.sort((left, right) => right.score - left.score),
  };
}

function printCompactSummary(
  summary: ReturnType<typeof searchCompactIndex>,
  loadMs: number,
  indexPath: string,
  mode: string,
) {
  const totalMs = loadMs + summary.elapsedMs;
  console.log(`Query FEN: ${summary.queryFen}`);
  console.log(`Index mode: ${mode}`);
  console.log(`Index file: ${indexPath}`);
  console.log(`Indexed positions: ${summary.indexedPositions.toLocaleString()}`);
  console.log(`Candidates after filters: ${summary.candidatesAfterFilters.toLocaleString()}`);
  console.log(`Exact-scored candidates: ${summary.exactScoredCandidates.toLocaleString()}`);
  console.log(`Load time: ${(loadMs / 1000).toFixed(3)}s`);
  console.log(`Search time: ${(summary.elapsedMs / 1000).toFixed(3)}s`);
  console.log(`Total cold time: ${(totalMs / 1000).toFixed(3)}s`);
  console.log(`Positions/sec: ${(summary.indexedPositions / Math.max(totalMs / 1000, 0.001)).toFixed(1)}`);
  console.log("");

  for (const [index, item] of summary.results.entries()) {
    const b = item.breakdown;
    console.log(`${index + 1}. score=${item.score.toFixed(3)} position_id=${item.row.id} game=${item.row.g} ply=${item.row.p}`);
    console.log(`   phase=${item.row.ph} phaseScore=${item.row.ps.toFixed(3)} material=${item.row.mc}/${item.row.dmc} ratio=${item.row.mr.toFixed(3)}`);
    console.log(`   breakdown token=${b.tokenScore.toFixed(3)} pressure=${b.pressureScore.toFixed(3)} scalar=${b.scalarScore.toFixed(3)} mobility=${b.mobilityScore.toFixed(3)} material=${b.materialScore.toFixed(3)}`);
    console.log(`   players=${item.row.w} - ${item.row.b}`);
    console.log(`   fen=${item.row.f}`);
  }
}

function printSlowSummary(summary: Awaited<ReturnType<typeof searchSlowNdjson>>, indexPath: string) {
  console.log(`Query FEN: ${summary.queryFen}`);
  console.log(`Index mode: slow-exact NDJSON`);
  console.log(`Index file: ${indexPath}`);
  console.log(`Indexed positions: ${summary.indexedPositions.toLocaleString()}`);
  console.log(`Candidates after filters: ${summary.candidatesAfterFilters.toLocaleString()}`);
  console.log(`Exact-scored candidates: ${summary.exactScoredCandidates.toLocaleString()}`);
  console.log(`Search time: ${(summary.elapsedMs / 1000).toFixed(3)}s`);
  console.log(`Positions/sec: ${(summary.indexedPositions / Math.max(summary.elapsedMs / 1000, 0.001)).toFixed(1)}`);
  console.log("");

  for (const [index, item] of summary.results.entries()) {
    const meta = item.row.metadata;
    const b = item.breakdown;
    console.log(`${index + 1}. score=${item.score.toFixed(3)} position_id=${item.row.position_id} game=${meta.game_index} ply=${meta.ply}`);
    console.log(`   phase=${item.row.inferredPhase} phaseScore=${item.row.phaseScore.toFixed(3)} material=${item.row.materialClass}/${item.row.detailedMaterialClass ?? "unknown"} ratio=${item.row.materialRatio.toFixed(3)}`);
    console.log(`   breakdown token=${b.tokenScore.toFixed(3)} pressure=${b.pressureScore.toFixed(3)} scalar=${b.scalarScore.toFixed(3)} mobility=${b.mobilityScore.toFixed(3)} material=${b.materialScore.toFixed(3)}`);
    console.log(`   players=${meta.white ?? ""} - ${meta.black ?? ""}`);
    console.log(`   fen=${item.row.fen}`);
  }
}

function rowProfile(row: IndexRow): PositionPhaseProfile {
  return {
    phaseScore: row.phaseScore,
    inferredPhase: row.inferredPhase,
    suggestedMinPly: 0,
    materialRatio: row.materialRatio,
    nonKingMaterial: 0,
    materialClass: row.materialClass,
    detailedMaterialClass: row.detailedMaterialClass ?? row.materialClass,
    queensPresent: row.queensPresent,
    rooksPresent: row.rooksPresent,
    heavyPiecesPresent: row.heavyPiecesPresent,
    sideToMove: row.sideToMove as "w" | "b",
  };
}

function insertTop<T extends { score: number }>(items: T[], item: T, keep: number) {
  items.push(item);
  items.sort((left, right) => right.score - left.score);
  if (items.length > keep) items.length = keep;
}

function parseArgs(argv: string[]) {
  const parsed = {
    fen: "",
    index: "data/position-index/fingerprints-10k.ndjson",
    compactIndex: "",
    compactManifest: "",
    keep: 10,
    minScore: 0,
    maxOnePerGame: false,
    maxPhaseDelta: 0.25,
    slowExact: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--fen" && next) parsed.fen = next;
    if (arg === "--index" && next) parsed.index = next;
    if (arg === "--compact-index" && next) parsed.compactIndex = next;
    if (arg === "--compact-manifest" && next) parsed.compactManifest = next;
    if (arg === "--keep" && next) parsed.keep = Number(next);
    if (arg === "--min-score" && next) parsed.minScore = Number(next);
    if (arg === "--max-one-per-game") parsed.maxOnePerGame = true;
    if (arg === "--max-phase-delta" && next) parsed.maxPhaseDelta = Number(next);
    if (arg === "--slow-exact") parsed.slowExact = true;
  }
  if (!parsed.fen) throw new Error("--fen is required");
  if (parsed.keep < 1) throw new Error("--keep must be >= 1");
  const index = path.resolve(parsed.index);
  return {
    ...parsed,
    index,
    compactIndex: path.resolve(parsed.compactIndex || defaultCompactPathFromIndex(index)),
    compactManifest: parsed.compactManifest ? path.resolve(parsed.compactManifest) : "",
  };
}
