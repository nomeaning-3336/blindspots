import "server-only";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractFenConsequenceFingerprint } from "@/lib/fen-consequence-similarity";
import type { Json } from "@/lib/supabase/database";

const MAX_QUEUE_ITEMS = 20;
const EXPLORE_REFRESH_TARGET = 12;
const EXPLORE_REFRESH_THRESHOLD = 6;

export type TrainingQueueItem = {
  fen: string;
  fingerprint: Json;
  scheduledAt: string;
  source: "initialization" | "elite" | "revisit";
  cpLoss?: number;
  sessionId?: string;
};

type ElitePosition = {
  fen?: unknown;
};

export function buildInitializationExploitQueue(
  positions: Array<{ fen: string; cpLoss: number }>,
  now = new Date(),
): TrainingQueueItem[] {
  return shuffle(positions)
    .slice(0, MAX_QUEUE_ITEMS)
    .flatMap((position) => {
      const item = queueItemFromFen(position.fen, "initialization", now.toISOString(), {
        cpLoss: position.cpLoss,
      });
      return item ? [item] : [];
    });
}

export async function updateQueuesAfterSequence({
  currentQueues,
  startingFen,
  evalPreservationScore,
  sessionId,
}: {
  currentQueues: {
    exploitQueue: TrainingQueueItem[];
    exploreQueue: TrainingQueueItem[];
    revisitQueue: TrainingQueueItem[];
    masteredQueue: TrainingQueueItem[];
  };
  startingFen: string;
  evalPreservationScore: number | null;
  sessionId: string;
}) {
  const now = new Date();
  const servedFenSet = new Set([startingFen]);
  const exploitQueue = trimQueue(
    currentQueues.exploitQueue.filter((item) => !servedFenSet.has(item.fen)),
  );
  let exploreQueue = trimQueue(
    currentQueues.exploreQueue.filter((item) => !servedFenSet.has(item.fen)),
  );
  let revisitQueue = trimQueue(
    currentQueues.revisitQueue.filter((item) => !servedFenSet.has(item.fen)),
  );
  const masteredQueue = trimQueue(
    currentQueues.masteredQueue.filter((item) => !servedFenSet.has(item.fen)),
  );

  if (evalPreservationScore !== null && evalPreservationScore < 0.6) {
    const revisitItem = queueItemFromFen(startingFen, "revisit", addDays(now, 1).toISOString(), {
      sessionId,
    });
    if (revisitItem) {
      revisitQueue = trimQueue([revisitItem, ...revisitQueue.filter((item) => item.fen !== startingFen)]);
    }
  }

  return ensureTrainingQueuesHavePositions({
    exploitQueue,
    exploreQueue,
    revisitQueue,
    masteredQueue,
    excludeFens: [startingFen],
    now,
  });
}

export async function ensureTrainingQueuesHavePositions({
  exploitQueue,
  exploreQueue,
  revisitQueue,
  masteredQueue,
  excludeFens = [],
  now = new Date(),
}: {
  exploitQueue: TrainingQueueItem[];
  exploreQueue: TrainingQueueItem[];
  revisitQueue: TrainingQueueItem[];
  masteredQueue: TrainingQueueItem[];
  excludeFens?: string[];
  now?: Date;
}) {
  const normalizedExploitQueue = trimQueue(exploitQueue);
  let normalizedExploreQueue = trimQueue(exploreQueue);
  const normalizedRevisitQueue = trimQueue(revisitQueue);
  const normalizedMasteredQueue = trimQueue(masteredQueue);
  const readyCount =
    normalizedExploitQueue.length +
    normalizedExploreQueue.length +
    normalizedRevisitQueue.filter((item) => Date.parse(item.scheduledAt) <= now.getTime()).length +
    normalizedMasteredQueue.length;

  if (readyCount < EXPLORE_REFRESH_THRESHOLD || normalizedExploreQueue.length < EXPLORE_REFRESH_THRESHOLD) {
    const excluded = new Set([
      ...normalizedExploitQueue.map((item) => item.fen),
      ...normalizedExploreQueue.map((item) => item.fen),
      ...normalizedRevisitQueue.map((item) => item.fen),
      ...normalizedMasteredQueue.map((item) => item.fen),
      ...excludeFens,
    ]);
    const additions = await sampleEliteExplorePositions(
      Math.max(0, EXPLORE_REFRESH_TARGET - normalizedExploreQueue.length),
      excluded,
      now,
    );
    normalizedExploreQueue = trimQueue([...normalizedExploreQueue, ...additions]);
  }

  return {
    exploitQueue: normalizedExploitQueue,
    exploreQueue: normalizedExploreQueue,
    revisitQueue: normalizedRevisitQueue,
    masteredQueue: normalizedMasteredQueue,
  };
}

export async function selectNextTrainingPosition({
  exploitQueue,
  exploreQueue,
  revisitQueue,
  masteredQueue,
}: {
  exploitQueue: TrainingQueueItem[];
  exploreQueue: TrainingQueueItem[];
  revisitQueue: TrainingQueueItem[];
  masteredQueue: TrainingQueueItem[];
}, options: { completedSequenceCount?: unknown } = {}) {
  const now = Date.now();
  const revisitItem = revisitQueue.find((item) => Date.parse(item.scheduledAt) <= now);
  if (revisitItem) return revisitItem;

  const completedSequenceCount = normalizeSequenceCount(options.completedSequenceCount);
  const shouldExplore = exploreQueue.length > 0 && completedSequenceCount % 3 === 2;
  const queuedItem = shouldExplore
    ? exploreQueue[0] ?? exploitQueue[0] ?? masteredQueue[0]
    : exploitQueue[0] ?? exploreQueue[0] ?? masteredQueue[0];
  if (queuedItem) return queuedItem;

  const [fallback] = await sampleEliteExplorePositions(1, new Set(), new Date());
  return fallback ?? null;
}

function normalizeSequenceCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export function normalizeQueue(value: Json | null | undefined): TrainingQueueItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    const fen = typeof candidate.fen === "string" ? candidate.fen : "";
    const source = candidate.source;
    const scheduledAt = typeof candidate.scheduledAt === "string" ? candidate.scheduledAt : new Date().toISOString();
    if (!fen || (source !== "initialization" && source !== "elite" && source !== "revisit")) return [];
    return [{
      fen,
      fingerprint: (candidate.fingerprint ?? {}) as Json,
      scheduledAt,
      source,
      cpLoss: typeof candidate.cpLoss === "number" ? candidate.cpLoss : undefined,
      sessionId: typeof candidate.sessionId === "string" ? candidate.sessionId : undefined,
    }];
  });
}

function queueItemFromFen(
  fen: string,
  source: TrainingQueueItem["source"],
  scheduledAt: string,
  extra: Partial<TrainingQueueItem> = {},
) {
  try {
    return {
      fen,
      fingerprint: extractFenConsequenceFingerprint(fen) as unknown as Json,
      scheduledAt,
      source,
      ...extra,
    } satisfies TrainingQueueItem;
  } catch {
    return null;
  }
}

async function sampleEliteExplorePositions(count: number, excludeFens: Set<string>, now: Date) {
  if (count <= 0) return [];

  const raw = await readFile(resolve(process.cwd(), "public", "elite_positions.json"), "utf8").catch(() => "[]");
  const positions = JSON.parse(raw) as ElitePosition[];
  return shuffle(positions)
    .flatMap((position) => {
      const fen = typeof position.fen === "string" ? position.fen : "";
      if (!fen || excludeFens.has(fen)) return [];
      excludeFens.add(fen);
      const item = queueItemFromFen(fen, "elite", now.toISOString());
      return item ? [item] : [];
    })
    .slice(0, count);
}

function trimQueue(queue: TrainingQueueItem[]) {
  return queue.slice(0, MAX_QUEUE_ITEMS);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}
