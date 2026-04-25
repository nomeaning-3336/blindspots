import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const compact = require("./compact-position-index.ts") as typeof import("./compact-position-index");
const { compactRowFromFull, newDictBuilders } = compact;

const DEFAULT_INPUT = "data/position-index/fingerprints-10k.ndjson";
const DEFAULT_OUTPUT = "data/position-index/fingerprints-10k.compact.json";

const args = parseArgs(process.argv.slice(2));
const started = performance.now();
const dicts = newDictBuilders();
const rows = [];
let count = 0;

const reader = readline.createInterface({
  input: fs.createReadStream(args.input, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

for await (const line of reader) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  rows.push(compactRowFromFull(row, dicts));
  count += 1;
}

const index = {
  version: 1,
  source: args.input,
  builtAt: new Date().toISOString(),
  tokenDict: dicts.tokenDict,
  numericDict: dicts.numericDict,
  rows,
};

fs.mkdirSync(path.dirname(args.output), { recursive: true });
fs.writeFileSync(args.output, JSON.stringify(index), "utf8");

const elapsed = (performance.now() - started) / 1000;
const metadata = {
  input: args.input,
  output: args.output,
  positions: count,
  token_count: dicts.tokenDict.length,
  numeric_count: dicts.numericDict.length,
  elapsed_seconds: Number(elapsed.toFixed(3)),
  positions_per_second: Number((count / Math.max(elapsed, 0.001)).toFixed(1)),
  bytes: fs.statSync(args.output).size,
  created_at: new Date().toISOString(),
};

console.log(JSON.stringify(metadata, null, 2));

function parseArgs(argv: string[]) {
  const parsed = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--input" && next) parsed.input = next;
    if (arg === "--output" && next) parsed.output = next;
  }
  return {
    input: path.resolve(parsed.input),
    output: path.resolve(parsed.output),
  };
}
