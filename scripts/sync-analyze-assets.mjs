import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDir = resolve(projectRoot, "public", "analyze");

// Source of truth for the embedded standalone analyzer lives at the repo root.
// `public/analyze` is a synced runtime copy used by the Next.js app.
const entriesToCopy = [
  "standalone.css",
  "standalone.html",
  "standalone.js",
  "stockfish.js",
  "stockfish.wasm",
  "opening-book.json",
  "classification-icons",
  "pieces",
  "sounds",
];

function ensureParentDir(path) {
  mkdirSync(dirname(path), { recursive: true });
}

mkdirSync(outputDir, { recursive: true });

for (const entry of entriesToCopy) {
  const source = resolve(projectRoot, entry);
  const target = resolve(outputDir, entry);

  if (!existsSync(source)) {
    console.warn(`[sync:analyze] Skipping missing asset: ${entry}`);
    continue;
  }

  ensureParentDir(target);
  cpSync(source, target, { force: true, recursive: true });
}

console.log(`[sync:analyze] Synced assets to ${outputDir}`);
