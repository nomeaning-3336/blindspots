import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type FillerOrigin = "random_position" | "lichess_puzzle";
export type FillerPhase = "opening" | "middlegame" | "endgame" | "tactic";

export type FillerCatalogItem = {
  id: string;
  origin: FillerOrigin;
  fen: string;
  phase: FillerPhase;
  sourceRecordId: string;
};

const CATALOG_FILES: Array<{ path: string; origin: FillerOrigin }> = [
  {
    path: resolve(process.cwd(), "public", "filler", "random-position-catalog.json"),
    origin: "random_position",
  },
];

let catalogPromise: Promise<FillerCatalogItem[]> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFillerPhase(value: unknown): value is FillerPhase {
  return (
    value === "opening" ||
    value === "middlegame" ||
    value === "endgame" ||
    value === "tactic"
  );
}

function parseCatalogItems(value: unknown, expectedOrigin: FillerOrigin): FillerCatalogItem[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected filler catalog array for ${expectedOrigin}`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid filler catalog record at ${expectedOrigin}[${index}]`);
    }

    if (
      typeof item.id !== "string" ||
      item.origin !== expectedOrigin ||
      typeof item.fen !== "string" ||
      !isFillerPhase(item.phase) ||
      typeof item.sourceRecordId !== "string"
    ) {
      throw new Error(`Invalid filler catalog fields at ${expectedOrigin}[${index}]`);
    }

    return {
      id: item.id,
      origin: expectedOrigin,
      fen: item.fen,
      phase: item.phase,
      sourceRecordId: item.sourceRecordId,
    };
  });
}

export function resetFillerCatalogCacheForTests(): void {
  catalogPromise = null;
}

export async function loadFillerCatalog(): Promise<FillerCatalogItem[]> {
  if (!catalogPromise) {
    catalogPromise = Promise.all(
      CATALOG_FILES.map(async ({ path, origin }) => {
        const raw = await readFile(path, "utf8");
        return parseCatalogItems(JSON.parse(raw) as unknown, origin);
      }),
    ).then((catalogs) => catalogs.flat());
  }

  return catalogPromise;
}

function hashUInt32(value: string): number {
  return createHash("sha256").update(value).digest().readUInt32BE(0);
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;

  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

function deriveTraversalStep(key: string, count: number): number {
  if (count <= 1) return 0;

  let step = 1 + (hashUInt32(`${key}:step`) % (count - 1));

  while (greatestCommonDivisor(step, count) !== 1) {
    step += 1;
    if (step >= count) step = 1;
  }

  return step;
}

export async function getDeterministicFillerCandidate(input: {
  userId: string;
  seed: string;
  cursor: number;
}): Promise<FillerCatalogItem | null> {
  const catalog = await loadFillerCatalog();
  if (catalog.length === 0) return null;

  const key = `${input.userId}:${input.seed}`;
  const offset = hashUInt32(`${key}:offset`) % catalog.length;
  const step = deriveTraversalStep(key, catalog.length);
  const boundedCursor =
    Number.isSafeInteger(input.cursor) && input.cursor >= 0
      ? input.cursor % catalog.length
      : 0;

  const index = (offset + boundedCursor * step) % catalog.length;
  return catalog[index] ?? null;
}
