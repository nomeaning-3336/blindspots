import { spawnSync } from "node:child_process";

const steps = [
  ["python", ["scripts/build-position-index-sample.py", "--limit", "10000"]],
  ["node", ["--experimental-strip-types", "scripts/fingerprint-position-index.ts"]],
];

for (const [command, args] of steps) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
