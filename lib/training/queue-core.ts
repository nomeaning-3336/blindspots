const MAX_QUEUE_ITEMS = 20;
const EXPLORE_REFRESH_TARGET = 12;
const EXPLORE_REFRESH_THRESHOLD = 6;
const MAX_RECENT_SERVED_FENS = 100;
const SAME_GAME_PLY_WINDOW = 8;
const FEN_NEAR_DUPLICATE_THRESHOLD = 0.92;

export type TrainingQueueItem = {
  fen: string;
  fingerprint: unknown;
  scheduledAt: string;
  source: "initialization" | "elite" | "revisit";
  cpLoss?: number;
  sessionId?: string;
  gameId?: string;
  ply?: number;
};

export type TrainingQueues = {
  exploitQueue: TrainingQueueItem[];
  exploreQueue: TrainingQueueItem[];
  revisitQueue: TrainingQueueItem[];
  masteredQueue: TrainingQueueItem[];
};

export type TrainingQueueName = "revisit" | "exploit" | "explore" | "mastered" | "fallback";

export type QueueCounts = {
  exploit: number;
  explore: number;
  revisit: number;
  mastered: number;
};

type ExploreSampler = (
  count: number,
  excludeFens: Set<string>,
  now: Date,
) => Promise<TrainingQueueItem[]>;

type QueueItemFactory = (
  fen: string,
  source: TrainingQueueItem["source"],
  scheduledAt: string,
  extra?: Partial<TrainingQueueItem>,
) => TrainingQueueItem | null;

export type RecentServedEntry = {
  fen: string;
  gameId?: string;
  ply?: number;
};

type NearDuplicateReason = "same_game_ply_window" | "fen_similarity";

type SelectionDiagnostics = {
  rejectedRecentExactCount: number;
  rejectedNearDuplicateCount: number;
  nearDuplicateReason: NearDuplicateReason | null;
};

export function normalizeRecentServedEntries(value: unknown): RecentServedEntry[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const recent: RecentServedEntry[] = [];
  for (const candidate of value) {
    const entry = normalizeRecentCandidate(candidate);
    if (!entry) continue;

    const dedupeKey = `${entry.fen}::${entry.gameId ?? ""}::${entry.ply ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    recent.push(entry);
    if (recent.length >= MAX_RECENT_SERVED_FENS) break;
  }
  return recent;
}

export function normalizeRecentServedFens(value: unknown) {
  const seen = new Set<string>();
  const fens: string[] = [];
  for (const entry of normalizeRecentServedEntries(value)) {
    if (seen.has(entry.fen)) continue;
    seen.add(entry.fen);
    fens.push(entry.fen);
  }
  return fens;
}

export function prependRecentServedFen(value: unknown, fen: string) {
  return prependRecentServedEntry(value, { fen }).map((entry) => entry.fen);
}

export function prependRecentServedEntry(value: unknown, entry: RecentServedEntry): RecentServedEntry[] {
  const normalizedEntry = normalizeRecentCandidate(entry);
  if (!normalizedEntry) return normalizeRecentServedEntries(value);

  const remaining = normalizeRecentServedEntries(value).filter((recent) => recent.fen !== normalizedEntry.fen);
  return [normalizedEntry, ...remaining].slice(0, MAX_RECENT_SERVED_FENS);
}

export function getQueueCounts(queues: TrainingQueues): QueueCounts {
  return {
    exploit: queues.exploitQueue.length,
    explore: queues.exploreQueue.length,
    revisit: queues.revisitQueue.length,
    mastered: queues.masteredQueue.length,
  };
}

export async function ensureTrainingQueuesHavePositionsCore({
  exploitQueue,
  exploreQueue,
  revisitQueue,
  masteredQueue,
  excludeFens = [],
  recentServedFens = [],
  now = new Date(),
  exploreSampler,
}: TrainingQueues & {
  excludeFens?: string[];
  recentServedFens?: unknown;
  now?: Date;
  exploreSampler: ExploreSampler;
}): Promise<TrainingQueues> {
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
      ...normalizeRecentServedFens(recentServedFens),
    ]);
    const additions = await exploreSampler(
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

export async function selectAndReserveNextTrainingPositionCore(
  queues: TrainingQueues,
  options: {
    completedSequenceCount?: unknown;
    now?: Date;
    recentServedFens?: unknown;
    fallbackSampler?: ExploreSampler;
  } = {},
) {
  const now = options.now ?? new Date();
  const recentEntries = normalizeRecentServedEntries(options.recentServedFens);
  const recentFenSet = new Set(recentEntries.map((entry) => entry.fen));
  const diagnostics: SelectionDiagnostics = {
    rejectedRecentExactCount: 0,
    rejectedNearDuplicateCount: 0,
    nearDuplicateReason: null,
  };
  const dueRevisit = queues.revisitQueue.find((item) => Date.parse(item.scheduledAt) <= now.getTime());
  if (dueRevisit) {
    return selectionResult(queues, dueRevisit, "revisit", true, diagnostics);
  }

  const completedSequenceCount = normalizeSequenceCount(options.completedSequenceCount);
  const shouldExplore = queues.exploreQueue.length > 0 && completedSequenceCount % 3 === 2;
  const sources: Array<[TrainingQueueName, TrainingQueueItem[]]> = shouldExplore
    ? [["explore", queues.exploreQueue], ["exploit", queues.exploitQueue], ["mastered", queues.masteredQueue]]
    : [["exploit", queues.exploitQueue], ["explore", queues.exploreQueue], ["mastered", queues.masteredQueue]];

  for (const [queueName, queue] of sources) {
    for (const item of queue) {
      if (shouldRejectCandidate(item, recentEntries, recentFenSet, diagnostics)) continue;
      return selectionResult(queues, item, queueName, false, diagnostics);
    }
  }

  const fallbackSampler = options.fallbackSampler;
  if (!fallbackSampler) {
    return selectionResult(queues, null, "fallback", false, diagnostics);
  }

  const fallbackCandidates = await fallbackSampler(24, new Set(recentFenSet), now);
  for (const fallback of fallbackCandidates) {
    if (shouldRejectCandidate(fallback, recentEntries, recentFenSet, diagnostics)) continue;
    return selectionResult(queues, fallback, "fallback", false, diagnostics);
  }

  return selectionResult(queues, null, "fallback", false, diagnostics);
}

export async function updateQueuesAfterSequenceCore({
  currentQueues,
  startingFen,
  evalPreservationScore,
  sessionId,
  now = new Date(),
  recentServedFens = [],
  itemFactory,
  exploreSampler,
}: {
  currentQueues: TrainingQueues;
  startingFen: string;
  evalPreservationScore: number | null;
  sessionId: string;
  now?: Date;
  recentServedFens?: unknown;
  itemFactory: QueueItemFactory;
  exploreSampler: ExploreSampler;
}) {
  let queues = removeFenFromAllQueues(currentQueues, startingFen);

  if (evalPreservationScore !== null && evalPreservationScore < 0.6) {
    const revisitItem = itemFactory(startingFen, "revisit", addDays(now, 1).toISOString(), { sessionId });
    if (revisitItem) {
      queues = {
        ...queues,
        revisitQueue: trimQueue([revisitItem, ...queues.revisitQueue.filter((item) => item.fen !== startingFen)]),
      };
    }
  }

  return ensureTrainingQueuesHavePositionsCore({
    ...queues,
    excludeFens: [startingFen],
    recentServedFens,
    now,
    exploreSampler,
  });
}

function selectionResult(
  queues: TrainingQueues,
  item: TrainingQueueItem | null,
  selectedQueue: TrainingQueueName,
  wasDueRevisit: boolean,
  diagnostics: SelectionDiagnostics,
) {
  return {
    item,
    selectedQueue,
    wasDueRevisit,
    queues: item ? removeFenFromAllQueues(queues, item.fen) : queues,
    ...diagnostics,
  };
}

function shouldRejectCandidate(
  candidate: TrainingQueueItem,
  recentEntries: RecentServedEntry[],
  recentFenSet: Set<string>,
  diagnostics: SelectionDiagnostics,
) {
  if (recentFenSet.has(candidate.fen)) {
    diagnostics.rejectedRecentExactCount += 1;
    return true;
  }

  const nearDuplicateReason = getNearDuplicateReason(candidate, recentEntries);
  if (!nearDuplicateReason) return false;

  diagnostics.rejectedNearDuplicateCount += 1;
  diagnostics.nearDuplicateReason ??= nearDuplicateReason;
  return true;
}

function getNearDuplicateReason(
  candidate: TrainingQueueItem,
  recentEntries: RecentServedEntry[],
): NearDuplicateReason | null {
  const candidateGameId = candidate.gameId;
  const candidatePly = candidate.ply;
  if (candidateGameId && candidatePly !== undefined) {
    for (const recent of recentEntries) {
      if (!recent.gameId || recent.ply === undefined) continue;
      if (candidateGameId !== recent.gameId) continue;
      if (Math.abs(candidatePly - recent.ply) <= SAME_GAME_PLY_WINDOW) {
        return "same_game_ply_window";
      }
    }
  }

  for (const recent of recentEntries) {
    if (fenSimilarity(candidate.fen, recent.fen) >= FEN_NEAR_DUPLICATE_THRESHOLD) {
      return "fen_similarity";
    }
  }

  return null;
}

function normalizeRecentCandidate(value: unknown): RecentServedEntry | null {
  if (typeof value === "string") {
    return value ? { fen: value } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const fen = typeof candidate.fen === "string" ? candidate.fen : "";
  if (!fen) return null;

  const gameId = typeof candidate.gameId === "string"
    ? candidate.gameId
    : typeof candidate.game_id === "string"
      ? candidate.game_id
      : undefined;
  const parsedPly = typeof candidate.ply === "number" ? candidate.ply : Number(candidate.ply);
  const ply = Number.isFinite(parsedPly) ? Math.floor(parsedPly) : undefined;
  return {
    fen,
    gameId,
    ply,
  };
}

function fenSimilarity(leftFen: string, rightFen: string) {
  const left = parseFenForSimilarity(leftFen);
  const right = parseFenForSimilarity(rightFen);
  if (!left || !right) return leftFen === rightFen ? 1 : 0;

  let matchingSquares = 0;
  for (let index = 0; index < 64; index += 1) {
    if (left.board[index] === right.board[index]) matchingSquares += 1;
  }

  const boardScore = matchingSquares / 64;
  const turnScore = left.turn === right.turn ? 1 : 0;
  const castlingScore = castlingSimilarity(left.castling, right.castling);
  const enPassantScore = left.enPassant === right.enPassant ? 1 : 0;
  return (
    boardScore * 0.85 +
    turnScore * 0.05 +
    castlingScore * 0.05 +
    enPassantScore * 0.05
  );
}

function parseFenForSimilarity(fen: string) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return null;
  const board = expandFenBoard(parts[0]);
  if (!board) return null;

  return {
    board,
    turn: parts[1],
    castling: parts[2],
    enPassant: parts[3],
  };
}

function expandFenBoard(boardPart: string) {
  const rows = boardPart.split("/");
  if (rows.length !== 8) return null;

  const squares: string[] = [];
  for (const row of rows) {
    for (const token of row) {
      if (token >= "1" && token <= "8") {
        const emptyCount = Number(token);
        for (let index = 0; index < emptyCount; index += 1) squares.push(".");
      } else {
        squares.push(token);
      }
    }
  }

  return squares.length === 64 ? squares : null;
}

function castlingSimilarity(left: string, right: string) {
  const leftSet = new Set(left === "-" ? [] : left.split(""));
  const rightSet = new Set(right === "-" ? [] : right.split(""));
  if (leftSet.size === 0 && rightSet.size === 0) return 1;

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 1 : intersection / union;
}

function removeFenFromAllQueues(queues: TrainingQueues, fen: string): TrainingQueues {
  return {
    exploitQueue: trimQueue(queues.exploitQueue.filter((item) => item.fen !== fen)),
    exploreQueue: trimQueue(queues.exploreQueue.filter((item) => item.fen !== fen)),
    revisitQueue: trimQueue(queues.revisitQueue.filter((item) => item.fen !== fen)),
    masteredQueue: trimQueue(queues.masteredQueue.filter((item) => item.fen !== fen)),
  };
}

function normalizeSequenceCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function trimQueue(queue: TrainingQueueItem[]) {
  return queue.slice(0, MAX_QUEUE_ITEMS);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
