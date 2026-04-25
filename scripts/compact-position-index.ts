import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fenSimilarity: typeof import("../lib/fen-consequence-similarity") = require("../lib/fen-consequence-similarity.ts");
const { extractFenConsequenceFingerprint } = fenSimilarity;
const { compatiblePhaseMaterial, fenPhaseProfile } = require("./position-index-utils.ts") as {
  compatiblePhaseMaterial: (query: PositionPhaseProfile, candidate: PositionPhaseProfile, maxPhaseDelta?: number) => boolean;
  fenPhaseProfile: (fen: string) => PositionPhaseProfile;
};

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

type Fingerprint = ReturnType<typeof extractFenConsequenceFingerprint>;

export interface FullIndexRow {
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
  fingerprint: Fingerprint;
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

export interface CompactIndex {
  version: 1;
  source: string;
  builtAt: string;
  tokenDict: string[];
  numericDict: string[];
  rows: CompactRow[];
}

export interface CompactRowsManifest {
  version: 1;
  format: "compact-rows-ndjson";
  source: string;
  rows: string;
  builtAt: string;
  positions: number;
  tokenDict: string[];
  numericDict: string[];
}

export interface CompactRow {
  id: string;
  f: string;
  g: number;
  p: number;
  w: string;
  b: string;
  ps: number;
  ph: string;
  mc: string;
  dmc: string;
  mr: number;
  q: boolean;
  r: boolean;
  h: boolean;
  stm: "w" | "b";
  t: number[];
  tw: number[];
  n: number[];
  nv: number[];
  v: number[][];
}

export interface SearchResult {
  score: number;
  row: CompactRow;
  breakdown: SimilarityBreakdown;
}

export interface SearchSummary {
  queryFen: string;
  indexedPositions: number;
  candidatesAfterFilters: number;
  exactScoredCandidates: number;
  elapsedMs: number;
  results: SearchResult[];
}

export interface SearchOptions {
  keep?: number;
  minScore?: number;
  maxOnePerGame?: boolean;
  maxPhaseDelta?: number;
}

export interface SimilarityBreakdown {
  score: number;
  tokenScore: number;
  pressureScore: number;
  scalarScore: number;
  mobilityScore: number;
  materialScore: number;
}

interface CompactFingerprint {
  fen: string;
  t: number[];
  tw: number[];
  unknownTokenWeight: number;
  n: number[];
  nv: number[];
  unknownNumeric: Array<[string, number]>;
  v: number[][];
}

interface DictBuilders {
  tokenIds: Map<string, number>;
  numericIds: Map<string, number>;
  tokenDict: string[];
  numericDict: string[];
}

const DEFAULT_WEIGHTS = {
  tokens: 0.42,
  pressure: 0.26,
  scalar: 0.12,
  mobility: 0.1,
  material: 0.1,
};

export function newDictBuilders(): DictBuilders {
  return {
    tokenIds: new Map(),
    numericIds: new Map(),
    tokenDict: [],
    numericDict: [],
  };
}

export function compactRowFromFull(row: FullIndexRow, dicts: DictBuilders): CompactRow {
  const fp = compactFingerprint(row.fingerprint, dicts);
  return {
    id: row.position_id,
    f: row.fen,
    g: row.metadata.game_index,
    p: row.metadata.ply,
    w: row.metadata.white ?? "",
    b: row.metadata.black ?? "",
    ps: row.phaseScore,
    ph: row.inferredPhase,
    mc: row.materialClass,
    dmc: row.detailedMaterialClass ?? row.materialClass,
    mr: row.materialRatio,
    q: row.queensPresent,
    r: row.rooksPresent,
    h: row.heavyPiecesPresent,
    stm: row.sideToMove === "b" ? "b" : "w",
    t: fp.t,
    tw: fp.tw,
    n: fp.n,
    nv: fp.nv,
    v: fp.v,
  };
}

export function loadCompactIndex(indexPath: string): CompactIndex {
  return JSON.parse(fs.readFileSync(indexPath, "utf8")) as CompactIndex;
}

export function loadCompactRowsManifest(manifestPath: string): CompactRowsManifest {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as CompactRowsManifest;
}

export function defaultCompactPathFromIndex(indexPath: string) {
  if (indexPath.endsWith(".ndjson")) {
    return indexPath.replace(/\.ndjson$/, ".compact.json");
  }
  return path.join(path.dirname(indexPath), `${path.basename(indexPath)}.compact.json`);
}

export function searchCompactIndex(index: CompactIndex, fen: string, options: SearchOptions = {}): SearchSummary {
  const started = performance.now();
  const keep = options.keep ?? 10;
  const minScore = options.minScore ?? 0;
  const maxPhaseDelta = options.maxPhaseDelta ?? 0.25;
  const queryFingerprint = extractFenConsequenceFingerprint(fen);
  const queryProfile = fenPhaseProfile(fen);
  const query = compactQueryFingerprint(queryFingerprint, index);
  const numericKinds = index.numericDict.map(numericKind);
  const top: SearchResult[] = [];
  const seenGames = new Set<number>();
  let candidatesAfterFilters = 0;
  let exactScoredCandidates = 0;

  for (const row of index.rows) {
    if (!compatiblePhaseMaterial(queryProfile, rowProfile(row), maxPhaseDelta)) continue;
    candidatesAfterFilters += 1;

    const breakdown = compareCompactFingerprints(query, row, numericKinds);
    exactScoredCandidates += 1;
    if (breakdown.score < minScore) continue;
    if (options.maxOnePerGame && seenGames.has(row.g)) continue;
    insertTop(top, { score: breakdown.score, row, breakdown }, keep);
    if (options.maxOnePerGame) {
      seenGames.clear();
      for (const item of top) seenGames.add(item.row.g);
    }
  }

  return {
    queryFen: queryFingerprint.fen,
    indexedPositions: index.rows.length,
    candidatesAfterFilters,
    exactScoredCandidates,
    elapsedMs: performance.now() - started,
    results: top.sort((left, right) => right.score - left.score),
  };
}

export async function searchCompactRowsIndex(
  manifestPath: string,
  fen: string,
  options: SearchOptions = {},
): Promise<SearchSummary> {
  const started = performance.now();
  const manifest = loadCompactRowsManifest(manifestPath);
  const keep = options.keep ?? 10;
  const minScore = options.minScore ?? 0;
  const maxPhaseDelta = options.maxPhaseDelta ?? 0.25;
  const queryFingerprint = extractFenConsequenceFingerprint(fen);
  const queryProfile = fenPhaseProfile(fen);
  const query = compactQueryFingerprint(queryFingerprint, {
    version: 1,
    source: manifest.source,
    builtAt: manifest.builtAt,
    tokenDict: manifest.tokenDict,
    numericDict: manifest.numericDict,
    rows: [],
  });
  const numericKinds = manifest.numericDict.map(numericKind);
  const top: SearchResult[] = [];
  const seenGames = new Set<number>();
  let total = 0;
  let candidatesAfterFilters = 0;
  let exactScoredCandidates = 0;

  const reader = readline.createInterface({
    input: fs.createReadStream(manifest.rows, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    if (!line.trim()) continue;
    total += 1;
    const row = JSON.parse(line) as CompactRow;
    if (!compatiblePhaseMaterial(queryProfile, rowProfile(row), maxPhaseDelta)) continue;
    candidatesAfterFilters += 1;

    const breakdown = compareCompactFingerprints(query, row, numericKinds);
    exactScoredCandidates += 1;
    if (breakdown.score < minScore) continue;
    if (options.maxOnePerGame && seenGames.has(row.g)) continue;
    insertTop(top, { score: breakdown.score, row, breakdown }, keep);
    if (options.maxOnePerGame) {
      seenGames.clear();
      for (const item of top) seenGames.add(item.row.g);
    }
  }

  return {
    queryFen: queryFingerprint.fen,
    indexedPositions: total,
    candidatesAfterFilters,
    exactScoredCandidates,
    elapsedMs: performance.now() - started,
    results: top.sort((left, right) => right.score - left.score),
  };
}

function compactFingerprint(fp: Fingerprint, dicts: DictBuilders): CompactFingerprint {
  return {
    fen: fp.fen,
    ...compactTokenObject(fp.tokens, dicts.tokenIds, dicts.tokenDict, true),
    ...compactNumericObject(fp.numeric, dicts.numericIds, dicts.numericDict, true),
    v: [
      fp.vectors.whiteAttacks,
      fp.vectors.blackAttacks,
      fp.vectors.contested,
      fp.vectors.kingZoneAttacks,
      fp.vectors.saliencePressure,
    ],
  };
}

function compactQueryFingerprint(fp: Fingerprint, index: CompactIndex): CompactFingerprint {
  const tokenIds = new Map(index.tokenDict.map((token, id) => [token, id]));
  const numericIds = new Map(index.numericDict.map((name, id) => [name, id]));
  return {
    fen: fp.fen,
    ...compactTokenObject(fp.tokens, tokenIds, index.tokenDict, false),
    ...compactNumericObject(fp.numeric, numericIds, index.numericDict, false),
    v: [
      fp.vectors.whiteAttacks,
      fp.vectors.blackAttacks,
      fp.vectors.contested,
      fp.vectors.kingZoneAttacks,
      fp.vectors.saliencePressure,
    ],
  };
}

function compactTokenObject(
  tokens: Record<string, number>,
  ids: Map<string, number>,
  dict: string[],
  addMissing: boolean,
) {
  const pairs: Array<[number, number]> = [];
  let unknownTokenWeight = 0;
  for (const [token, weight] of Object.entries(tokens)) {
    let id = ids.get(token);
    if (id === undefined && addMissing) {
      id = dict.length;
      ids.set(token, id);
      dict.push(token);
    }
    if (id === undefined) {
      unknownTokenWeight += weight;
    } else {
      pairs.push([id, weight]);
    }
  }
  pairs.sort((left, right) => left[0] - right[0]);
  return {
    t: pairs.map((pair) => pair[0]),
    tw: pairs.map((pair) => pair[1]),
    unknownTokenWeight,
  };
}

function compactNumericObject(
  numeric: Record<string, number>,
  ids: Map<string, number>,
  dict: string[],
  addMissing: boolean,
) {
  const pairs: Array<[number, number]> = [];
  const unknownNumeric: Array<[string, number]> = [];
  for (const [name, value] of Object.entries(numeric)) {
    let id = ids.get(name);
    if (id === undefined && addMissing) {
      id = dict.length;
      ids.set(name, id);
      dict.push(name);
    }
    if (id === undefined) {
      unknownNumeric.push([name, value]);
    } else {
      pairs.push([id, value]);
    }
  }
  pairs.sort((left, right) => left[0] - right[0]);
  return {
    n: pairs.map((pair) => pair[0]),
    nv: pairs.map((pair) => pair[1]),
    unknownNumeric,
  };
}

function compareCompactFingerprints(
  left: CompactFingerprint,
  right: CompactRow,
  numericKinds: NumericKind[],
): SimilarityBreakdown {
  const tokenScore = weightedJaccardArrays(left, right);
  const pressureScore = average([
    blendedVectorSimilarity(left.v[0], right.v[0]),
    blendedVectorSimilarity(left.v[1], right.v[1]),
    blendedVectorSimilarity(left.v[2], right.v[2]),
    blendedVectorSimilarity(left.v[3], right.v[3]),
    blendedVectorSimilarity(left.v[4], right.v[4]),
  ]);
  const scalarScore = numericL1SimilarityArrays(left, right, numericKinds, "scalar");
  const mobilityScore = numericL1SimilarityArrays(left, right, numericKinds, "mobility");
  const materialScore = numericL1SimilarityArrays(left, right, numericKinds, "material");
  const score = clamp01(
    tokenScore * DEFAULT_WEIGHTS.tokens +
      pressureScore * DEFAULT_WEIGHTS.pressure +
      scalarScore * DEFAULT_WEIGHTS.scalar +
      mobilityScore * DEFAULT_WEIGHTS.mobility +
      materialScore * DEFAULT_WEIGHTS.material,
  );

  return {
    score,
    tokenScore,
    pressureScore,
    scalarScore,
    mobilityScore,
    materialScore,
  };
}

function weightedJaccardArrays(left: CompactFingerprint, right: CompactRow) {
  let leftIndex = 0;
  let rightIndex = 0;
  let intersection = 0;
  let union = left.unknownTokenWeight;

  while (leftIndex < left.t.length || rightIndex < right.t.length) {
    const leftId = left.t[leftIndex] ?? Number.POSITIVE_INFINITY;
    const rightId = right.t[rightIndex] ?? Number.POSITIVE_INFINITY;
    if (leftId === rightId) {
      const leftWeight = left.tw[leftIndex];
      const rightWeight = right.tw[rightIndex];
      intersection += Math.min(leftWeight, rightWeight);
      union += Math.max(leftWeight, rightWeight);
      leftIndex += 1;
      rightIndex += 1;
    } else if (leftId < rightId) {
      union += left.tw[leftIndex];
      leftIndex += 1;
    } else {
      union += right.tw[rightIndex];
      rightIndex += 1;
    }
  }

  return union === 0 ? 1 : clamp01(intersection / union);
}

type NumericKind = "scalar" | "mobility" | "material";

function numericKind(name: string): NumericKind {
  if (name.startsWith("mobility.")) return "mobility";
  if (name.startsWith("material.") || name.startsWith("phase.")) return "material";
  return "scalar";
}

function numericL1SimilarityArrays(
  left: CompactFingerprint,
  right: CompactRow,
  numericKinds: NumericKind[],
  include: NumericKind,
) {
  let leftIndex = 0;
  let rightIndex = 0;
  let keys = 0;
  let numerator = 0;
  let denominator = 0;

  while (leftIndex < left.n.length || rightIndex < right.n.length) {
    const leftId = left.n[leftIndex] ?? Number.POSITIVE_INFINITY;
    const rightId = right.n[rightIndex] ?? Number.POSITIVE_INFINITY;
    const id = Math.min(leftId, rightId);
    if (id === Number.POSITIVE_INFINITY) break;

    const both = leftId === rightId;
    const kind = numericKinds[id];
    if (kind === include) {
      const leftValue = both || leftId < rightId ? left.nv[leftIndex] : 0;
      const rightValue = both || rightId < leftId ? right.nv[rightIndex] : 0;
      keys += 1;
      numerator += Math.abs(leftValue - rightValue);
      denominator += Math.max(1, Math.abs(leftValue), Math.abs(rightValue));
    }

    if (both) {
      leftIndex += 1;
      rightIndex += 1;
    } else if (leftId < rightId) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }

  for (const [name, value] of left.unknownNumeric) {
    if (numericKind(name) !== include) continue;
    keys += 1;
    numerator += Math.abs(value);
    denominator += Math.max(1, Math.abs(value));
  }

  if (keys === 0) return 1;
  return denominator === 0 ? 1 : clamp01(1 - numerator / denominator);
}

function blendedVectorSimilarity(left: number[], right: number[]) {
  return clamp01(cosineSimilarity(left, right) * 0.55 + vectorL1Similarity(left, right) * 0.45);
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 && rightNorm === 0) return 1;
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return clamp01(dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)));
}

function vectorL1Similarity(left: number[], right: number[]) {
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < left.length; index += 1) {
    numerator += Math.abs(left[index] - right[index]);
    denominator += Math.max(1, Math.abs(left[index]), Math.abs(right[index]));
  }
  return denominator === 0 ? 1 : clamp01(1 - numerator / denominator);
}

function rowProfile(row: CompactRow): PositionPhaseProfile {
  return {
    phaseScore: row.ps,
    inferredPhase: row.ph,
    suggestedMinPly: 0,
    materialRatio: row.mr,
    nonKingMaterial: 0,
    materialClass: row.mc,
    detailedMaterialClass: row.dmc,
    queensPresent: row.q,
    rooksPresent: row.r,
    heavyPiecesPresent: row.h,
    sideToMove: row.stm,
  };
}

function insertTop<T extends { score: number }>(items: T[], item: T, keep: number) {
  items.push(item);
  items.sort((left, right) => right.score - left.score);
  if (items.length > keep) items.length = keep;
}

function average(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
