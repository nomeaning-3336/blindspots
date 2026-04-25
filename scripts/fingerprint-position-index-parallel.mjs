import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { once } from "node:events";

const args = parseArgs(process.argv.slice(2));
const started = performance.now();

fs.mkdirSync(args.shardDir, { recursive: true });
fs.mkdirSync(path.dirname(args.output), { recursive: true });
fs.mkdirSync(path.dirname(args.metadata), { recursive: true });

const splitStarted = performance.now();
const shardInputs = await splitInput(args.input, args.shardDir, args.shards);
const splitSeconds = (performance.now() - splitStarted) / 1000;

const fingerprintStarted = performance.now();
const shardOutputs = await fingerprintShards(shardInputs, args);
const fingerprintSeconds = (performance.now() - fingerprintStarted) / 1000;

const mergeStarted = performance.now();
const positions = await mergeOutputs(shardOutputs, args.output);
const mergeSeconds = (performance.now() - mergeStarted) / 1000;

const elapsed = (performance.now() - started) / 1000;
const metadata = {
  input: args.input,
  output: args.output,
  metadata: args.metadata,
  shard_dir: args.shardDir,
  shards: args.shards,
  workers: args.workers,
  positions,
  bytes: fs.statSync(args.output).size,
  split_seconds: round(splitSeconds),
  fingerprint_seconds: round(fingerprintSeconds),
  merge_seconds: round(mergeSeconds),
  elapsed_seconds: round(elapsed),
  positions_per_second: round(positions / Math.max(elapsed, 0.001)),
  created_at: new Date().toISOString(),
};
fs.writeFileSync(args.metadata, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(JSON.stringify(metadata, null, 2));

async function splitInput(input, shardDir, shardCount) {
  const shardInputs = Array.from({ length: shardCount }, (_, index) => path.join(shardDir, `positions-${pad(index)}.ndjson`));
  const writers = shardInputs.map((filePath) => fs.createWriteStream(filePath, { encoding: "utf8" }));
  const reader = readline.createInterface({
    input: fs.createReadStream(input, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let lineIndex = 0;
  for await (const line of reader) {
    if (!line.trim()) continue;
    const writer = writers[lineIndex % shardCount];
    if (!writer.write(`${line}\n`)) await once(writer, "drain");
    lineIndex += 1;
  }
  await Promise.all(writers.map((writer) => new Promise((resolve) => writer.end(resolve))));
  return shardInputs;
}

async function fingerprintShards(shardInputs, args) {
  const pending = shardInputs.map((input, index) => ({
    index,
    input,
    output: path.join(args.shardDir, `fingerprints-${pad(index)}.ndjson`),
    metadata: path.join(args.shardDir, `metadata-${pad(index)}.json`),
  }));
  const outputs = [];
  let next = 0;

  async function worker() {
    while (next < pending.length) {
      const shard = pending[next];
      next += 1;
      console.log(`fingerprint shard ${shard.index + 1}/${pending.length}`);
      await runProcess("node", [
        "--experimental-strip-types",
        "scripts/fingerprint-position-index.ts",
        "--input",
        shard.input,
        "--output",
        shard.output,
        "--metadata",
        shard.metadata,
      ]);
      outputs[shard.index] = shard.output;
    }
  }

  await Promise.all(Array.from({ length: Math.min(args.workers, pending.length) }, () => worker()));
  return outputs;
}

async function mergeOutputs(shardOutputs, output) {
  const writer = fs.createWriteStream(output, { encoding: "utf8" });
  let lines = 0;
  for (const shardOutput of shardOutputs) {
    const reader = readline.createInterface({
      input: fs.createReadStream(shardOutput, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of reader) {
      if (!line.trim()) continue;
      lines += 1;
      if (!writer.write(`${line}\n`)) await once(writer, "drain");
    }
  }
  await new Promise((resolve) => writer.end(resolve));
  return lines;
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

function parseArgs(argv) {
  const parsed = {
    input: "data/position-index/positions-50k-games.ndjson",
    output: "data/position-index/fingerprints-50k-games.ndjson",
    metadata: "data/position-index/metadata-50k-games.json",
    shardDir: "data/position-index/shards-50k-games",
    shards: 12,
    workers: Math.max(1, Math.min(6, Math.floor((Number(process.env.NUMBER_OF_PROCESSORS) || 6) / 2))),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--input" && next) parsed.input = next;
    if (arg === "--output" && next) parsed.output = next;
    if (arg === "--metadata" && next) parsed.metadata = next;
    if (arg === "--shard-dir" && next) parsed.shardDir = next;
    if (arg === "--shards" && next) parsed.shards = Number(next);
    if (arg === "--workers" && next) parsed.workers = Number(next);
  }
  if (parsed.shards < 1) throw new Error("--shards must be >= 1");
  if (parsed.workers < 1) throw new Error("--workers must be >= 1");
  return {
    ...parsed,
    input: path.resolve(parsed.input),
    output: path.resolve(parsed.output),
    metadata: path.resolve(parsed.metadata),
    shardDir: path.resolve(parsed.shardDir),
  };
}

function pad(index) {
  return String(index).padStart(3, "0");
}

function round(value) {
  return Number(value.toFixed(3));
}
