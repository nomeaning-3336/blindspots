import { spawnSync } from "node:child_process";

const workers = process.env.BLINDSPOTS_INDEX_WORKERS ?? "6";
const shards = process.env.BLINDSPOTS_INDEX_SHARDS ?? "12";

const steps = [
  [
    "python",
    [
      "scripts/build-position-index-sample.py",
      "--limit",
      "0",
      "--max-games",
      "50000",
      "--positions-per-game",
      "5",
      "--output",
      "data/position-index/positions-50k-games.ndjson",
    ],
  ],
  [
    "node",
    [
      "scripts/fingerprint-position-index-parallel.mjs",
      "--input",
      "data/position-index/positions-50k-games.ndjson",
      "--output",
      "data/position-index/fingerprints-50k-games.ndjson",
      "--metadata",
      "data/position-index/metadata-50k-games.json",
      "--shard-dir",
      "data/position-index/shards-50k-games",
      "--shards",
      shards,
      "--workers",
      workers,
    ],
  ],
  [
    "node",
    [
      "--experimental-strip-types",
      "scripts/build-compact-position-index-ndjson.ts",
      "--input",
      "data/position-index/fingerprints-50k-games.ndjson",
      "--rows",
      "data/position-index/fingerprints-50k-games.compact.rows.ndjson",
      "--manifest",
      "data/position-index/fingerprints-50k-games.compact.manifest.json",
    ],
  ],
];

for (const [command, args] of steps) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
