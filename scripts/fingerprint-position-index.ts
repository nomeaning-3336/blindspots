import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fenSimilarity: typeof import("../lib/fen-consequence-similarity") = require("../lib/fen-consequence-similarity.ts");
const { extractFenConsequenceFingerprint } = fenSimilarity;
const { fenPhaseProfile } = require("./position-index-utils.ts") as {
  fenPhaseProfile: (fen: string) => {
    phaseScore: number;
    inferredPhase: string;
    materialClass: string;
    detailedMaterialClass: string;
    materialRatio: number;
    queensPresent: boolean;
    rooksPresent: boolean;
    heavyPiecesPresent: boolean;
    sideToMove: string;
  };
};

const DEFAULT_INPUT = "data/position-index/positions-10k.ndjson";
const DEFAULT_OUTPUT = "data/position-index/fingerprints-10k.ndjson";
const DEFAULT_METADATA = "data/position-index/metadata-10k.json";

interface PositionRow {
  position_id: string;
  fen: string;
  game_index: number;
  ply: number;
  [key: string]: unknown;
}

const started = performance.now();
const args = parseArgs(process.argv.slice(2));
fs.mkdirSync(path.dirname(args.output), { recursive: true });

let count = 0;
let failed = 0;
const out = fs.createWriteStream(args.output, { encoding: "utf8" });
const reader = readline.createInterface({
  input: fs.createReadStream(args.input, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

for await (const line of reader) {
  if (!line.trim()) continue;
  const row = JSON.parse(line) as PositionRow;
  try {
    const fingerprint = extractFenConsequenceFingerprint(row.fen);
    const phase = fenPhaseProfile(row.fen);
    out.write(JSON.stringify({
      position_id: row.position_id,
      fen: fingerprint.fen,
      phaseScore: phase.phaseScore,
      inferredPhase: phase.inferredPhase,
      materialClass: phase.materialClass,
      detailedMaterialClass: phase.detailedMaterialClass,
      materialRatio: phase.materialRatio,
      queensPresent: phase.queensPresent,
      rooksPresent: phase.rooksPresent,
      heavyPiecesPresent: phase.heavyPiecesPresent,
      sideToMove: phase.sideToMove,
      fingerprint,
      metadata: {
        game_index: row.game_index,
        ply: row.ply,
        white: row.white ?? "",
        black: row.black ?? "",
        event: row.event ?? "",
        site: row.site ?? "",
        result: row.result ?? "",
        source_pgn: row.source_pgn ?? "",
      },
    }) + "\n");
    count += 1;
  } catch (error) {
    failed += 1;
    console.error(`failed ${row.position_id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await new Promise<void>((resolve) => out.end(resolve));

const elapsed = (performance.now() - started) / 1000;
const metadata = {
  input: args.input,
  output: args.output,
  positions: count,
  failed,
  elapsed_seconds: Number(elapsed.toFixed(3)),
  positions_per_second: Number((count / Math.max(elapsed, 0.001)).toFixed(1)),
  bytes: fs.statSync(args.output).size,
  created_at: new Date().toISOString(),
};
fs.writeFileSync(args.metadata, JSON.stringify(metadata, null, 2), "utf8");
console.log(JSON.stringify(metadata, null, 2));

function parseArgs(argv: string[]) {
  const parsed = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    metadata: DEFAULT_METADATA,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--input" && next) parsed.input = next;
    if (arg === "--output" && next) parsed.output = next;
    if (arg === "--metadata" && next) parsed.metadata = next;
  }
  return {
    input: path.resolve(parsed.input),
    output: path.resolve(parsed.output),
    metadata: path.resolve(parsed.metadata),
  };
}
