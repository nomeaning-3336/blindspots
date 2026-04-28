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
  type TrainingBucket,
  type TrainingPhase,
} from "./queue-core";
import type { ServeMode } from "./serving-policy";

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
  selectedMetadata,
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
  selectedMetadata?: {
    phase?: TrainingPhase;
    bucket?: TrainingBucket;
    tags?: string[];
    isTactic?: boolean;
    tacticRating?: number;
    openingName?: string;
    eco?: string;
  };
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
    selectedMetadata,
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
  options: { completedSequenceCount?: unknown; now?: Date; recentServedFens?: unknown; serveMode?: string } = {},
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
      attempts: normalizeQueueCounter(candidate.attempts),
      successes: normalizeQueueCounter(candidate.successes),
      masteryStreak: normalizeQueueCounter(candidate.masteryStreak),
      lastEvalPreservationScore: normalizeFiniteNumber(candidate.lastEvalPreservationScore),
      lastAttemptAt: normalizeOptionalString(candidate.lastAttemptAt),
      masteredAt: normalizeOptionalString(candidate.masteredAt),
      sessionId: typeof candidate.sessionId === "string" ? candidate.sessionId : undefined,
      gameId,
      ply,
      previousFen,
      playedMove,
      mateDistancePlies,
      phase: normalizePhase(candidate.phase),
      bucket: normalizeBucket(candidate.bucket),
      tags: normalizeStringArray(candidate.tags),
      isTactic: candidate.isTactic === true,
      tacticRating: typeof candidate.tacticRating === "number" ? candidate.tacticRating : undefined,
      openingName: typeof candidate.openingName === "string" ? candidate.openingName : undefined,
      eco: typeof candidate.eco === "string" ? candidate.eco : undefined,
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

// ─── Middlegame Positions ────────────────────────────────────────────────────

/**
 * Sample middlegame seed positions from the elite pool.
 *
 * This deliberately does not use training_opening_positions.json. The opening
 * file is opening-tagged, so asking it for middlegames returns an empty or
 * misleading seed pool. Elite positions already contain real game positions;
 * we filter by FEN shape and fullmove number, then enrich with middlegame
 * metadata before passing through normal queue validation.
 */
export async function sampleMiddlegamePositions(
  count: number,
  excludeFens: Set<string>,
  now: Date,
  bucketFilter?: TrainingBucket,
): Promise<TrainingQueueItem[]> {
  if (count <= 0) return [];

  const raw = await readFile(resolve(process.cwd(), "public", "elite_positions.json"), "utf8").catch(() => "[]");
  const positions = JSON.parse(raw) as ElitePosition[];

  return shuffle(positions)
    .flatMap((position) => {
      const fen = typeof position.fen === "string" ? position.fen : "";
      if (!fen || excludeFens.has(fen)) return [];

      const metadata = classifyMiddlegameSeedFen(fen);
      if (!metadata) return [];
      if (bucketFilter && bucketFilter !== "middlegame" && metadata.bucket !== bucketFilter) return [];

      excludeFens.add(fen);
      const item = queueItemFromFen(fen, "elite", now.toISOString(), {
        previousFen: enrichPreviousFen(position),
        playedMove: enrichPlayedMove(position),
        gameId: enrichGameId(position),
        ply: enrichPly(position),
        mateDistancePlies: normalizeMateDistancePlies(
          position.mateDistancePlies ?? position.mate_distance_plies,
        ),
        phase: "middlegame",
        bucket: metadata.bucket,
        tags: metadata.tags,
        isTactic: false,
        tacticRating: undefined,
        openingName: undefined,
        eco: undefined,
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

function normalizeQueueCounter(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : undefined;
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : undefined;
}

function normalizePhase(value: unknown): "opening" | "middlegame" | "endgame" | "tactic" | "unknown" | undefined {
  const v = value;
  if (v === "opening" || v === "middlegame" || v === "endgame" || v === "tactic" || v === "unknown") return v;
  return undefined;
}

function normalizeBucket(value: unknown): TrainingBucket | undefined {
  const v = value;
  if (
    v === "opening" ||
    v === "opening_gambit" ||
    v === "opening_development" ||
    v === "middlegame" ||
    v === "middlegame_attack" ||
    v === "middlegame_positional" ||
    v === "endgame" ||
    v === "endgame_rook" ||
    v === "endgame_pawn" ||
    v === "tactic" ||
    v === "wildcard"
  ) {
    return v as TrainingBucket;
  }
  return undefined;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}

// ─── Opening Positions ────────────────────────────────────────────────────────

type OpeningPosition = {
  fen?: unknown;
  phase?: unknown;
  bucket?: unknown;
  openingName?: unknown;
  eco?: unknown;
  tags?: unknown;
  isTactic?: unknown;
  tacticRating?: unknown;
  gameId?: unknown;
  game_id?: unknown;
  ply?: unknown;
  previousFen?: unknown;
  previous_fen?: unknown;
  playedMove?: unknown;
  played_move?: unknown;
  source?: unknown;
};

async function readOpeningPositions(): Promise<OpeningPosition[]> {
  try {
    const raw = await readFile(resolve(process.cwd(), "public", "training_opening_positions.json"), "utf8");
    return JSON.parse(raw) as OpeningPosition[];
  } catch {
    return [];
  }
}

/**
 * Sample opening positions, enriched with phase/bucket metadata.
 * Excludes FENs already recently served.
 */
export async function sampleOpeningPositions(
  count: number,
  excludeFens: Set<string>,
  now: Date,
): Promise<TrainingQueueItem[]> {
  if (count <= 0) return [];

  const positions = await readOpeningPositions();
  return shuffle(positions)
    .flatMap((position) => {
      const fen = typeof position.fen === "string" ? position.fen : "";
      if (!fen || excludeFens.has(fen)) return [];

      excludeFens.add(fen);
      const item = queueItemFromFen(fen, "elite", now.toISOString(), {
        previousFen: enrichPreviousFen(position),
        playedMove: enrichPlayedMove(position),
        gameId: enrichGameId(position),
        ply: enrichPly(position),
        phase: enrichPhase(position),
        bucket: enrichBucket(position),
        tags: enrichTags(position),
        isTactic: enrichIsTactic(position),
        tacticRating: enrichTacticRating(position),
        openingName: enrichOpeningName(position),
        eco: enrichEco(position),
      });
      return item ? [item] : [];
    })
    .slice(0, count);
}

// ─── Tactical Positions ───────────────────────────────────────────────────────

type TacticPosition = OpeningPosition;

async function readTacticPositions(): Promise<TacticPosition[]> {
  try {
    const raw = await readFile(resolve(process.cwd(), "public", "training_tactic_positions.json"), "utf8");
    return JSON.parse(raw) as TacticPosition[];
  } catch {
    return [];
  }
}

/**
 * Sample tactical positions, enriched with phase/bucket metadata.
 * Excludes FENs already recently served.
 */
export async function sampleTacticalPositions(
  count: number,
  excludeFens: Set<string>,
  now: Date,
): Promise<TrainingQueueItem[]> {
  if (count <= 0) return [];

  const positions = await readTacticPositions();
  return shuffle(positions)
    .flatMap((position) => {
      const fen = typeof position.fen === "string" ? position.fen : "";
      if (!fen || excludeFens.has(fen)) return [];

      excludeFens.add(fen);
      const item = queueItemFromFen(fen, "elite", now.toISOString(), {
        previousFen: enrichPreviousFen(position),
        playedMove: enrichPlayedMove(position),
        gameId: enrichGameId(position),
        ply: enrichPly(position),
        phase: "tactic",
        bucket: "tactic",
        tags: enrichTags(position),
        isTactic: true,
        tacticRating: enrichTacticRating(position),
        openingName: enrichOpeningName(position),
        eco: enrichEco(position),
      });
      return item ? [item] : [];
    })
    .slice(0, count);
}

// ─── Endgame Positions ───────────────────────────────────────────────────────

type EndgamePosition = OpeningPosition;

async function readEndgamePositions(): Promise<EndgamePosition[]> {
  try {
    const raw = await readFile(resolve(process.cwd(), "public", "training_endgame_positions.json"), "utf8");
    return JSON.parse(raw) as EndgamePosition[];
  } catch {
    return [];
  }
}

/**
 * Sample endgame positions, enriched with phase/bucket metadata.
 * Excludes FENs already recently served.
 */
export async function sampleEndgamePositions(
  count: number,
  excludeFens: Set<string>,
  now: Date,
): Promise<TrainingQueueItem[]> {
  if (count <= 0) return [];

  const positions = await readEndgamePositions();
  return shuffle(positions)
    .flatMap((position) => {
      const fen = typeof position.fen === "string" ? position.fen : "";
      if (!fen || excludeFens.has(fen)) return [];

      excludeFens.add(fen);
      const item = queueItemFromFen(fen, "elite", now.toISOString(), {
        previousFen: enrichPreviousFen(position),
        playedMove: enrichPlayedMove(position),
        gameId: enrichGameId(position),
        ply: enrichPly(position),
        phase: "endgame",
        bucket: (enrichBucket(position) ?? "endgame") as TrainingBucket,
        tags: enrichTags(position) ?? ["endgame"],
        isTactic: false,
        tacticRating: enrichTacticRating(position),
        openingName: undefined,
        eco: undefined,
      });
      return item ? [item] : [];
    })
    .slice(0, count);
}

// ─── Phase/Bucket Samplers ────────────────────────────────────────────────────

/**
 * Sample positions matching a specific phase or bucket from the opening pool.
 * Dedicated samplers (sampleOpeningPositions, sampleTacticalPositions,
 * sampleEndgamePositions) should be preferred for each seed pool.
 */
export async function samplePhasePositions(
  phaseOrBucket: string,
  count: number,
  excludeFens: Set<string>,
  now: Date,
): Promise<TrainingQueueItem[]> {
  if (count <= 0) return [];
  if (phaseOrBucket === "tactic") return sampleTacticalPositions(count, excludeFens, now);
  if (phaseOrBucket === "opening" || phaseOrBucket === "opening_gambit" || phaseOrBucket === "opening_development") {
    return sampleOpeningPositions(count, excludeFens, now);
  }
  if (phaseOrBucket === "endgame" || phaseOrBucket === "endgame_pawn" || phaseOrBucket === "endgame_rook") {
    return sampleEndgamePositions(count, excludeFens, now);
  }
  if (phaseOrBucket === "middlegame" || phaseOrBucket === "middlegame_attack" || phaseOrBucket === "middlegame_positional") {
    return sampleMiddlegamePositions(count, excludeFens, now, phaseOrBucket as TrainingBucket);
  }

  // Legacy fallback: filter metadata-tagged rows from the opening pool.
  const positions = await readOpeningPositions();
  return shuffle(positions)
    .flatMap((position) => {
      const fen = typeof position.fen === "string" ? position.fen : "";
      if (!fen || excludeFens.has(fen)) return [];

      const bucket = enrichBucket(position);
      const phase = enrichPhase(position);
      if (bucket !== phaseOrBucket && phase !== phaseOrBucket) return [];

      excludeFens.add(fen);
      const item = queueItemFromFen(fen, "elite", now.toISOString(), {
        previousFen: enrichPreviousFen(position),
        playedMove: enrichPlayedMove(position),
        gameId: enrichGameId(position),
        ply: enrichPly(position),
        phase: enrichPhase(position),
        bucket: enrichBucket(position),
        tags: enrichTags(position),
        isTactic: enrichIsTactic(position),
        tacticRating: enrichTacticRating(position),
        openingName: enrichOpeningName(position),
        eco: enrichEco(position),
      });
      return item ? [item] : [];
    })
    .slice(0, count);
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function enrichPreviousFen(pos: OpeningPosition): string | undefined {
  return typeof pos.previousFen === "string"
    ? pos.previousFen
    : typeof pos.previous_fen === "string"
      ? pos.previous_fen
      : undefined;
}

function enrichPlayedMove(pos: OpeningPosition): string | undefined {
  return typeof pos.playedMove === "string"
    ? pos.playedMove
    : typeof pos.played_move === "string"
      ? pos.played_move
      : undefined;
}

function enrichGameId(pos: OpeningPosition): string | undefined {
  return typeof pos.gameId === "string"
    ? pos.gameId
    : typeof pos.game_id === "string"
      ? pos.game_id
      : undefined;
}

function enrichPly(pos: OpeningPosition): number | undefined {
  const v = pos.ply;
  const parsed = typeof v === "number" ? v : Number(v);
  return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
}

function enrichPhase(pos: OpeningPosition): "opening" | "middlegame" | "endgame" | "tactic" | "unknown" | undefined {
  const v = pos.phase;
  if (v === "opening" || v === "middlegame" || v === "endgame" || v === "tactic" || v === "unknown") return v;
  return undefined;
}

function enrichBucket(pos: OpeningPosition): TrainingBucket | undefined {
  const v = pos.bucket;
  if (
    v === "opening" ||
    v === "opening_gambit" ||
    v === "opening_development" ||
    v === "middlegame" ||
    v === "middlegame_attack" ||
    v === "middlegame_positional" ||
    v === "endgame" ||
    v === "endgame_rook" ||
    v === "endgame_pawn" ||
    v === "tactic" ||
    v === "wildcard"
  ) {
    return v;
  }
  return undefined;
}

function enrichTags(pos: OpeningPosition): string[] | undefined {
  if (Array.isArray(pos.tags)) {
    return pos.tags.filter((t): t is string => typeof t === "string");
  }
  return undefined;
}

function enrichIsTactic(pos: OpeningPosition): boolean | undefined {
  return typeof pos.isTactic === "boolean" ? pos.isTactic : undefined;
}

function enrichTacticRating(pos: OpeningPosition): number | undefined {
  const v = pos.tacticRating;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function enrichOpeningName(pos: OpeningPosition): string | undefined {
  return typeof pos.openingName === "string" ? pos.openingName : undefined;
}

function enrichEco(pos: OpeningPosition): string | undefined {
  return typeof pos.eco === "string" ? pos.eco : undefined;
}

function classifyMiddlegameSeedFen(fen: string): { bucket: TrainingBucket; tags: string[] } | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 6) return null;

  const board = parts[0] ?? "";
  const fullmove = Number.parseInt(parts[5] ?? "", 10);
  if (!Number.isFinite(fullmove)) return null;

  // Avoid opening seeds. Opening supply already has a dedicated file.
  if (fullmove <= 10) return null;

  const material = countFenMaterial(board);
  if (!material) return null;

  // Avoid endgame-ish material. Endgame supply has its own dedicated file.
  if (material.nonKingPieces <= 6) return null;

  const bucket: TrainingBucket =
    material.queens > 0 || material.majorPieces >= 4
      ? "middlegame_attack"
      : "middlegame_positional";

  return {
    bucket,
    tags: [
      "middlegame",
      bucket === "middlegame_attack" ? "attack" : "positional",
    ],
  };
}

function countFenMaterial(board: string): {
  nonKingPieces: number;
  queens: number;
  majorPieces: number;
} | null {
  if (!board) return null;

  let nonKingPieces = 0;
  let queens = 0;
  let majorPieces = 0;

  for (const char of board) {
    if (char === "/") continue;
    if (char >= "1" && char <= "8") continue;
    if (!/[prnbqkPRNBQK]/.test(char)) return null;

    const piece = char.toLowerCase();
    if (piece === "k") continue;
    nonKingPieces += 1;
    if (piece === "q") queens += 1;
    if (piece === "q" || piece === "r") majorPieces += 1;
  }

  return { nonKingPieces, queens, majorPieces };
}

