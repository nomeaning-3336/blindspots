import { spawnSync } from "node:child_process";

const steps = [
  [
    "python",
    [
      "scripts/build-position-index-sample.py",
      "--limit",
      "0",
      "--output",
      "data/position-index/positions-full.ndjson",
    ],
  ],
  [
    "node",
    [
      "--experimental-strip-types",
      "scripts/fingerprint-position-index.ts",
      "--input",
      "data/position-index/positions-full.ndjson",
      "--output",
      "data/position-index/fingerprints-full.ndjson",
      "--metadata",
      "data/position-index/metadata-full.json",
    ],
  ],
  [
    "node",
    [
      "--experimental-strip-types",
      "scripts/build-compact-position-index.ts",
      "--input",
      "data/position-index/fingerprints-full.ndjson",
      "--output",
      "data/position-index/fingerprints-full.compact.json",
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
