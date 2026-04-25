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
const { defaultCompactPathFromIndex, loadCompactIndex, searchCompactIndex } = compact;

const DEFAULT_QUERY = "8/7k/3N1Kp1/5bP1/8/8/8/8 w - - 0 64";
const DEFAULT_SLOW_OUTPUT = "data/position-index/benchmark-slow-exact.json";
const DEFAULT_FAST_OUTPUT = "data/position-index/benchmark-fast.json";
const DEFAULT_REPORT_OUTPUT = "data/position-index/benchmark-quality.json";

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
  };
}

interface SlowResult {
  score: number;
  row: IndexRow;
  breakdown: ReturnType<typeof compareFenFingerprints>;
}

const args = parseArgs(process.argv.slice(2));
if (!fs.existsSync(args.compactIndex)) {
  throw new Error(`Compact index not found: ${args.compactIndex}. Run scripts/build-compact-position-index.ts first.`);
}

const slow = await runSlowExact(args);
writeJson(args.slowOutput, serializeSlowResults(slow));

const coldLoadStarted = performance.now();
const compactIndex = loadCompactIndex(args.compactIndex);
const coldLoadMs = performance.now() - coldLoadStarted;
const coldFast = searchCompactIndex(compactIndex, args.fen, args);
writeJson(args.fastOutput, serializeFastResults(coldFast, coldLoadMs));

const warmRuns = [];
for (let index = 0; index < args.warmRuns; index += 1) {
  const run = searchCompactIndex(compactIndex, args.fen, args);
  warmRuns.push(run.elapsedMs);
}

const quality = compareQuality(slow.results, coldFast.results);
const report = {
  query_fen: slow.queryFen,
  indexed_positions: slow.indexedPositions,
  candidates_after_filters: slow.candidatesAfterFilters,
  slow_exact: {
    elapsed_ms: round(slow.elapsedMs),
    exact_scored_candidates: slow.exactScoredCandidates,
    output: args.slowOutput,
  },
  fast: {
    compact_index: args.compactIndex,
    compact_index_bytes: fs.statSync(args.compactIndex).size,
    cold_load_ms: round(coldLoadMs),
    cold_search_ms: round(coldFast.elapsedMs),
    cold_total_ms: round(coldLoadMs + coldFast.elapsedMs),
    warm_runs: args.warmRuns,
    warm_mean_ms: round(mean(warmRuns)),
    warm_p50_ms: round(percentile(warmRuns, 0.5)),
    warm_p95_ms: round(percentile(warmRuns, 0.95)),
    exact_scored_candidates: coldFast.exactScoredCandidates,
    output: args.fastOutput,
  },
  quality,
  targets: {
    cold_search_lte_1000ms: coldLoadMs + coldFast.elapsedMs <= 1000,
    warm_mean_lte_100ms: mean(warmRuns) <= 100,
    top10_overlap_gte_8: quality.top10_overlap >= 8,
    ndcg10_gte_0_95: quality.ndcg_at_10 >= 0.95,
    top_result_identical_or_score_delta_lte_0_02:
      quality.top_result_identical || quality.top_result_score_delta <= 0.02,
  },
  top_results: {
    slow_exact: serializeSlowResults(slow).results.slice(0, 10),
    fast: serializeFastResults(coldFast, coldLoadMs).results.slice(0, 10),
  },
};
writeJson(args.reportOutput, report);

console.log(JSON.stringify(report, null, 2));

async function runSlowExact(args: ReturnType<typeof parseArgs>) {
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
    if (!compatiblePhaseMaterial(queryProfile, rowProfile(row), args.maxPhaseDelta)) continue;
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

function serializeSlowResults(summary: Awaited<ReturnType<typeof runSlowExact>>) {
  return {
    query_fen: summary.queryFen,
    indexed_positions: summary.indexedPositions,
    candidates_after_filters: summary.candidatesAfterFilters,
    exact_scored_candidates: summary.exactScoredCandidates,
    elapsed_ms: round(summary.elapsedMs),
    results: summary.results.map((item, index) => ({
      rank: index + 1,
      score: item.score,
      position_id: item.row.position_id,
      game_index: item.row.metadata.game_index,
      ply: item.row.metadata.ply,
      fen: item.row.fen,
      white: item.row.metadata.white ?? "",
      black: item.row.metadata.black ?? "",
      phase: item.row.inferredPhase,
      material_class: item.row.materialClass,
      detailed_material_class: item.row.detailedMaterialClass ?? item.row.materialClass,
      breakdown: item.breakdown,
    })),
  };
}

function serializeFastResults(summary: ReturnType<typeof searchCompactIndex>, loadMs: number) {
  return {
    query_fen: summary.queryFen,
    indexed_positions: summary.indexedPositions,
    candidates_after_filters: summary.candidatesAfterFilters,
    exact_scored_candidates: summary.exactScoredCandidates,
    load_ms: round(loadMs),
    search_ms: round(summary.elapsedMs),
    total_ms: round(loadMs + summary.elapsedMs),
    results: summary.results.map((item, index) => ({
      rank: index + 1,
      score: item.score,
      position_id: item.row.id,
      game_index: item.row.g,
      ply: item.row.p,
      fen: item.row.f,
      white: item.row.w,
      black: item.row.b,
      phase: item.row.ph,
      material_class: item.row.mc,
      detailed_material_class: item.row.dmc,
      breakdown: item.breakdown,
    })),
  };
}

function compareQuality(slowResults: SlowResult[], fastResults: ReturnType<typeof searchCompactIndex>["results"]) {
  const slowTop10 = slowResults.slice(0, 10);
  const fastTop10 = fastResults.slice(0, 10);
  const slowIds = new Set(slowTop10.map((item) => item.row.position_id));
  const slowScores = new Map(slowResults.map((item) => [item.row.position_id, item.score]));
  const overlap = fastTop10.filter((item) => slowIds.has(item.row.id)).length;
  const idealDcg = dcg(slowTop10.map((item) => item.score));
  const fastDcg = dcg(fastTop10.map((item) => slowScores.get(item.row.id) ?? 0));
  const slowBest = slowResults[0];
  const fastBest = fastResults[0];

  return {
    top10_overlap: overlap,
    ndcg_at_10: round(idealDcg === 0 ? 1 : fastDcg / idealDcg),
    top_result_identical: slowBest?.row.position_id === fastBest?.row.id,
    top_result_score_delta: round(Math.abs((slowBest?.score ?? 0) - (fastBest?.score ?? 0))),
    slow_top_position_id: slowBest?.row.position_id ?? null,
    fast_top_position_id: fastBest?.row.id ?? null,
  };
}

function dcg(scores: number[]) {
  return scores.reduce((acc, score, index) => acc + (2 ** score - 1) / Math.log2(index + 2), 0);
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

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function mean(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function round(value: number) {
  return Number(value.toFixed(3));
}

function parseArgs(argv: string[]) {
  const parsed = {
    fen: DEFAULT_QUERY,
    index: "data/position-index/fingerprints-10k.ndjson",
    compactIndex: "",
    keep: 50,
    minScore: 0,
    maxOnePerGame: true,
    maxPhaseDelta: 0.25,
    warmRuns: 20,
    slowOutput: DEFAULT_SLOW_OUTPUT,
    fastOutput: DEFAULT_FAST_OUTPUT,
    reportOutput: DEFAULT_REPORT_OUTPUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--fen" && next) parsed.fen = next;
    if (arg === "--index" && next) parsed.index = next;
    if (arg === "--compact-index" && next) parsed.compactIndex = next;
    if (arg === "--keep" && next) parsed.keep = Number(next);
    if (arg === "--min-score" && next) parsed.minScore = Number(next);
    if (arg === "--max-one-per-game") parsed.maxOnePerGame = true;
    if (arg === "--allow-multiple-per-game") parsed.maxOnePerGame = false;
    if (arg === "--max-phase-delta" && next) parsed.maxPhaseDelta = Number(next);
    if (arg === "--warm-runs" && next) parsed.warmRuns = Number(next);
    if (arg === "--slow-output" && next) parsed.slowOutput = next;
    if (arg === "--fast-output" && next) parsed.fastOutput = next;
    if (arg === "--report-output" && next) parsed.reportOutput = next;
  }
  if (parsed.keep < 10) throw new Error("--keep must be >= 10 for quality metrics");
  if (parsed.warmRuns < 1) throw new Error("--warm-runs must be >= 1");
  const index = path.resolve(parsed.index);
  return {
    ...parsed,
    index,
    compactIndex: path.resolve(parsed.compactIndex || defaultCompactPathFromIndex(index)),
    slowOutput: path.resolve(parsed.slowOutput),
    fastOutput: path.resolve(parsed.fastOutput),
    reportOutput: path.resolve(parsed.reportOutput),
  };
}
