import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const compact = require("./compact-position-index.ts") as typeof import("./compact-position-index");
const { compactRowFromFull, newDictBuilders } = compact;

const DEFAULT_INPUT = "data/position-index/fingerprints-50k-games.ndjson";
const DEFAULT_ROWS = "data/position-index/fingerprints-50k-games.compact.rows.ndjson";
const DEFAULT_MANIFEST = "data/position-index/fingerprints-50k-games.compact.manifest.json";

const args = parseArgs(process.argv.slice(2));
const started = performance.now();
const dicts = newDictBuilders();
let count = 0;

fs.mkdirSync(path.dirname(args.rows), { recursive: true });
fs.mkdirSync(path.dirname(args.manifest), { recursive: true });

const writer = fs.createWriteStream(args.rows, { encoding: "utf8" });
const reader = readline.createInterface({
  input: fs.createReadStream(args.input, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

for await (const line of reader) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  const compactRow = compactRowFromFull(row, dicts);
  if (!writer.write(`${JSON.stringify(compactRow)}\n`)) {
    await new Promise<void>((resolve) => writer.once("drain", resolve));
  }
  count += 1;
  if (count % 25000 === 0) {
    console.log(`compacted ${count.toLocaleString()} rows`);
  }
}

await new Promise<void>((resolve) => writer.end(resolve));

const elapsed = (performance.now() - started) / 1000;
const manifest = {
  version: 1,
  format: "compact-rows-ndjson",
  source: args.input,
  rows: args.rows,
  builtAt: new Date().toISOString(),
  positions: count,
  tokenDict: dicts.tokenDict,
  numericDict: dicts.numericDict,
  elapsed_seconds: Number(elapsed.toFixed(3)),
  positions_per_second: Number((count / Math.max(elapsed, 0.001)).toFixed(1)),
  rows_bytes: fs.statSync(args.rows).size,
};

fs.writeFileSync(args.manifest, `${JSON.stringify(manifest)}\n`, "utf8");
console.log(JSON.stringify({
  manifest: args.manifest,
  rows: args.rows,
  positions: count,
  token_count: dicts.tokenDict.length,
  numeric_count: dicts.numericDict.length,
  elapsed_seconds: manifest.elapsed_seconds,
  positions_per_second: manifest.positions_per_second,
  rows_bytes: manifest.rows_bytes,
  manifest_bytes: fs.statSync(args.manifest).size,
}, null, 2));

function parseArgs(argv: string[]) {
  const parsed = {
    input: DEFAULT_INPUT,
    rows: DEFAULT_ROWS,
    manifest: DEFAULT_MANIFEST,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--input" && next) parsed.input = next;
    if (arg === "--rows" && next) parsed.rows = next;
    if (arg === "--manifest" && next) parsed.manifest = next;
  }
  return {
    input: path.resolve(parsed.input),
    rows: path.resolve(parsed.rows),
    manifest: path.resolve(parsed.manifest),
  };
}
