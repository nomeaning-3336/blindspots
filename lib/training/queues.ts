import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractFenConsequenceFingerprint } from "../fen-consequence-similarity";
import { validatePlayableTrainingFen } from "./position-validity";
import type { Json } from "../supabase/database";
import {
  ensureTrainingQueuesHavePositionsCore,
  selectAndReserveNextTrainingPositionCore,
  updateQueuesAfterSequenceCore,
  type TrainingQueueItem,
} from "./queue-core";

const MAX_QUEUE_ITEMS = 20;

type ElitePosition = {
  fen?: unknown;
  previousFen?: unknown;
  previous_fen?: unknown;
  playedMove?: unknown;
  played_move?: unknown;
  gameId?: unknown;
  game_id?: unknown;
  ply?: unknown;
  mateDistancePlies?: unknown;
  mate_distance_plies?: unknown;
};

export type { TrainingQueueItem } from "./queue-core";
export {
  getQueueCounts,
  normalizeRecentServedFens,
  normalizeRecentServedEntries,
  prependRecentServedEntry,
  prependRecentServedFen,
} from "./queue-core";

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
  now = new Date(),
  recentServedFens = [],
  exploreSampler = sampleEliteExplorePositions,
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
  now?: Date;
  recentServedFens?: unknown;
  exploreSampler?: typeof sampleEliteExplorePositions;
}) {
  return updateQueuesAfterSequenceCore({
    currentQueues,
    startingFen,
    evalPreservationScore,
    sessionId,
    now,
    recentServedFens,
    itemFactory: queueItemFromFen,
    exploreSampler,
  });
}

export async function ensureTrainingQueuesHavePositions({
  exploitQueue,
  exploreQueue,
  revisitQueue,
  masteredQueue,
  excludeFens = [],
  recentServedFens = [],
  now = new Date(),
  exploreSampler = sampleEliteExplorePositions,
}: {
  exploitQueue: TrainingQueueItem[];
  exploreQueue: TrainingQueueItem[];
  revisitQueue: TrainingQueueItem[];
  masteredQueue: TrainingQueueItem[];
  excludeFens?: string[];
  recentServedFens?: unknown;
  now?: Date;
  exploreSampler?: typeof sampleEliteExplorePositions;
}) {
  return ensureTrainingQueuesHavePositionsCore({
    exploitQueue,
    exploreQueue,
    revisitQueue,
    masteredQueue,
    excludeFens,
    recentServedFens,
    now,
    exploreSampler,
  });
}

export async function selectAndReserveNextTrainingPosition(
  queues: {
    exploitQueue: TrainingQueueItem[];
    exploreQueue: TrainingQueueItem[];
    revisitQueue: TrainingQueueItem[];
    masteredQueue: TrainingQueueItem[];
  },
  options: { completedSequenceCount?: unknown; now?: Date; recentServedFens?: unknown } = {},
) {
  return selectAndReserveNextTrainingPositionCore(queues, {
    ...options,
    fallbackSampler: sampleEliteExplorePositions,
  });
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
  const result = await selectAndReserveNextTrainingPosition({
    exploitQueue,
    exploreQueue,
    revisitQueue,
    masteredQueue,
  }, options);
  return result.item;
}

export function normalizeQueue(value: Json | null | undefined): TrainingQueueItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    const fen = typeof candidate.fen === "string" ? candidate.fen : "";
    const source = candidate.source;
    const scheduledAt = typeof candidate.scheduledAt === "string" ? candidate.scheduledAt : new Date().toISOString();
    const gameId = typeof candidate.gameId === "string"
      ? candidate.gameId
      : typeof candidate.game_id === "string"
        ? candidate.game_id
        : undefined;
    const parsedPly = typeof candidate.ply === "number" ? candidate.ply : Number(candidate.ply);
    const ply = Number.isFinite(parsedPly) ? Math.floor(parsedPly) : undefined;
    if (!fen || (source !== "initialization" && source !== "elite" && source !== "revisit")) return [];
    if (!validatePlayableTrainingFen(fen).ok) return [];
    const previousFen = typeof candidate.previousFen === "string"
      ? candidate.previousFen
      : typeof candidate.previous_fen === "string"
        ? candidate.previous_fen
        : undefined;
    const playedMove = typeof candidate.playedMove === "string"
      ? candidate.playedMove
      : typeof candidate.played_move === "string"
        ? candidate.played_move
        : undefined;
    const mateDistancePlies = normalizeMateDistancePlies(
      candidate.mateDistancePlies ?? candidate.mate_distance_plies,
    );
    return [{
      fen,
      fingerprint: (candidate.fingerprint ?? {}) as Json,
      scheduledAt,
      source,
      cpLoss: typeof candidate.cpLoss === "number" ? candidate.cpLoss : undefined,
      sessionId: typeof candidate.sessionId === "string" ? candidate.sessionId : undefined,
      gameId,
      ply,
      previousFen,
      playedMove,
      mateDistancePlies,
    }];
  });
}

function queueItemFromFen(
  fen: string,
  source: TrainingQueueItem["source"],
  scheduledAt: string,
  extra: Partial<TrainingQueueItem> = {},
) {
  if (!validatePlayableTrainingFen(fen, { mateDistancePlies: extra.mateDistancePlies }).ok) return null;

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

      const previousFen = typeof position.previousFen === "string"
        ? position.previousFen
        : typeof position.previous_fen === "string"
          ? position.previous_fen
          : undefined;
      const playedMove = typeof position.playedMove === "string"
        ? position.playedMove
        : typeof position.played_move === "string"
          ? position.played_move
          : undefined;
      const gameId = typeof position.gameId === "string"
        ? position.gameId
        : typeof position.game_id === "string"
          ? position.game_id
          : undefined;
      const parsedPly = typeof position.ply === "number" ? position.ply : Number(position.ply);
      const ply = Number.isFinite(parsedPly) ? Math.floor(parsedPly) : undefined;
      const mateDistancePlies = normalizeMateDistancePlies(
        position.mateDistancePlies ?? position.mate_distance_plies,
      );

      excludeFens.add(fen);
      const item = queueItemFromFen(fen, "elite", now.toISOString(), {
        previousFen,
        playedMove,
        gameId,
        ply,
        mateDistancePlies,
      });
      return item ? [item] : [];
    })
    .slice(0, count);
}

function trimQueue(queue: TrainingQueueItem[]) {
  return queue.slice(0, MAX_QUEUE_ITEMS);
}

function normalizeMateDistancePlies(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : undefined;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}
