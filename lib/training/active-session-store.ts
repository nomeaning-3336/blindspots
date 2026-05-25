import type { Json } from "@/lib/supabase/database";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  getFillerCatalogItemById,
  type FillerOrigin,
} from "./filler-catalog";
import { validatePlayableTrainingFen } from "./position-validity";
import {
  buildLegalStoredSequence,
  countUserMovesInStoredSequence,
  storedSequenceIsPrefix,
  type StoredTrainingMove,
} from "./session-sequence";

export type ActiveSessionQueueSource = "review" | "active" | "filler";

export type ActiveTrainingSession = {
  id: string;
  startingFen: string;
  moves: StoredTrainingMove[];
  sequenceLength: number;
  selectedTrainingItemId: string | null;
  queueSource: ActiveSessionQueueSource;
  fillerId: string | null;
  fillerOrigin: FillerOrigin | null;
  candidateMetadata: Json;
  startedAt: string;
};

type ResolvedStartCandidate = {
  startingFen: string;
  selectedTrainingItemId: string | null;
  queueSource: ActiveSessionQueueSource;
  fillerId: string | null;
  fillerOrigin: FillerOrigin | null;
  candidateMetadata: Json;
};

export class ActiveSessionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ActiveSessionError";
    this.status = status;
  }
}

function normalizeFillerOrigin(value: unknown): FillerOrigin | null {
  return value === "random_position" || value === "lichess_puzzle"
    ? value
    : null;
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const tags = value.filter((item): item is string => typeof item === "string");
  return tags.length > 0 ? tags : undefined;
}

function normalizeStoredMoves(value: unknown): StoredTrainingMove[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((move) => {
    if (!move || typeof move !== "object" || Array.isArray(move)) return [];

    const row = move as Record<string, unknown>;

    if (
      typeof row.san !== "string" ||
      typeof row.uci !== "string" ||
      (row.side !== "w" && row.side !== "b")
    ) {
      return [];
    }

    return [{
      san: row.san,
      uci: row.uci,
      side: row.side,
    }];
  });
}

function normalizeActiveSessionRow(row: Record<string, unknown>): ActiveTrainingSession {
  const queueSource =
    row.queue_source === "review" ||
    row.queue_source === "active" ||
    row.queue_source === "filler"
      ? row.queue_source
      : null;

  if (
    typeof row.id !== "string" ||
    typeof row.starting_fen !== "string" ||
    typeof row.sequence_length !== "number" ||
    typeof row.started_at !== "string" ||
    !queueSource
  ) {
    throw new ActiveSessionError("Stored active training session is invalid.", 500);
  }

  return {
    id: row.id,
    startingFen: row.starting_fen,
    moves: normalizeStoredMoves(row.moves_played),
    sequenceLength: row.sequence_length,
    selectedTrainingItemId:
      typeof row.selected_training_item_id === "string" ? row.selected_training_item_id : null,
    queueSource,
    fillerId: typeof row.filler_id === "string" ? row.filler_id : null,
    fillerOrigin: normalizeFillerOrigin(row.filler_origin),
    candidateMetadata: (row.candidate_metadata ?? {}) as Json,
    startedAt: row.started_at,
  };
}

async function resolvePersonalCandidate(input: {
  userId: string;
  trainingItemId: unknown;
  queueSource: unknown;
}): Promise<ResolvedStartCandidate> {
  if (typeof input.trainingItemId !== "string" || input.trainingItemId.length === 0) {
    throw new ActiveSessionError("Missing personal candidate trainingItemId.", 400);
  }

  if (input.queueSource !== "review" && input.queueSource !== "active") {
    throw new ActiveSessionError("Invalid personal candidate queueSource.", 400);
  }

  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("user_training_items" as any)
    .select("*")
    .eq("id", input.trainingItemId)
    .eq("user_id", input.userId)
    .eq("status", input.queueSource)
    .is("retired_at", null)
    .is("mastered_at", null)
    .lte("next_review_at", nowIso)
    .maybeSingle();

  if (error) {
    throw new ActiveSessionError(`Failed to resolve personal candidate: ${error.message}`, 500);
  }

  if (!data) {
    throw new ActiveSessionError("Personal candidate is no longer available.", 409);
  }

  const row = data as unknown as Record<string, unknown>;
  const startingFen =
    typeof row.decision_fen === "string" && row.decision_fen.length > 0
      ? row.decision_fen
      : typeof row.starting_fen === "string"
        ? row.starting_fen
        : "";

  if (!validatePlayableTrainingFen(startingFen).ok) {
    throw new ActiveSessionError("Personal candidate is not playable.", 409);
  }

  return {
    startingFen,
    selectedTrainingItemId: input.trainingItemId,
    queueSource: input.queueSource,
    fillerId: null,
    fillerOrigin: null,
    candidateMetadata: {
      candidateType: "personal",
      sourceType: typeof row.source_type === "string" ? row.source_type : "unknown",
      tags: normalizeTags(row.theme_tags) ?? [],
      openingName: typeof row.opening_name === "string" ? row.opening_name : null,
      eco: typeof row.eco === "string" ? row.eco : null,
    },
  };
}

async function resolveFillerCandidate(input: {
  fillerId: unknown;
  fillerOrigin: unknown;
}): Promise<ResolvedStartCandidate> {
  if (typeof input.fillerId !== "string" || input.fillerId.length === 0) {
    throw new ActiveSessionError("Missing filler candidate ID.", 400);
  }

  const fillerOrigin = normalizeFillerOrigin(input.fillerOrigin);

  if (!fillerOrigin) {
    throw new ActiveSessionError("Invalid filler candidate origin.", 400);
  }

  const filler = await getFillerCatalogItemById({
    id: input.fillerId,
    origin: fillerOrigin,
  });

  if (!filler || !validatePlayableTrainingFen(filler.fen).ok) {
    throw new ActiveSessionError("Filler candidate is no longer available.", 409);
  }

  return {
    startingFen: filler.fen,
    selectedTrainingItemId: null,
    queueSource: "filler",
    fillerId: filler.id,
    fillerOrigin: filler.origin,
    candidateMetadata: {
      candidateType: "filler",
      selectedPhase: filler.phase,
      fillerOrigin: filler.origin,
      sourceRecordId: filler.sourceRecordId,
    },
  };
}

export async function getActiveTrainingSession(
  userId: string,
): Promise<ActiveTrainingSession | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("training_sessions" as any)
    .select("*")
    .eq("user_id", userId)
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ActiveSessionError(`Failed to load active session: ${error.message}`, 500);
  }

  return data
    ? normalizeActiveSessionRow(data as unknown as Record<string, unknown>)
    : null;
}

export async function createActiveTrainingSession(input: {
  userId: string;
  candidateType: unknown;
  queueSource: unknown;
  trainingItemId: unknown;
  fillerId: unknown;
  fillerOrigin: unknown;
  firstMoveUci: unknown;
}): Promise<ActiveTrainingSession> {
  const existing = await getActiveTrainingSession(input.userId);

  if (existing) {
    throw new ActiveSessionError("An active training session already exists.", 409);
  }

  const candidate =
    input.candidateType === "personal"
      ? await resolvePersonalCandidate({
          userId: input.userId,
          trainingItemId: input.trainingItemId,
          queueSource: input.queueSource,
        })
      : input.candidateType === "filler"
        ? await resolveFillerCandidate({
            fillerId: input.fillerId,
            fillerOrigin: input.fillerOrigin,
          })
        : null;

  if (!candidate) {
    throw new ActiveSessionError("Invalid candidate type.", 400);
  }

  const moves = buildLegalStoredSequence(candidate.startingFen, [input.firstMoveUci]);

  if (!moves) {
    throw new ActiveSessionError("The submitted first move is not legal.", 400);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("training_sessions" as any)
    .insert({
      user_id: input.userId,
      starting_fen: candidate.startingFen,
      moves_played: moves as unknown as Json,
      eval_preservation_score: null,
      opponent_mode: "standard",
      sequence_length: countUserMovesInStoredSequence(candidate.startingFen, moves),
      time_pressure_mode: "none",
      reflection_note: null,
      position_evaluations: [] as unknown as Json,
      filler_id: candidate.fillerId,
      filler_origin: candidate.fillerOrigin,
      candidate_metadata: candidate.candidateMetadata,
      elo_before: null,
      elo_after: null,
      elo_delta: null,
      k_factor: null,
      opponent_elo: null,
      expected_score: null,
      actual_score: null,
      completed_at: null,
      selected_training_item_id: candidate.selectedTrainingItemId,
      queue_source: candidate.queueSource,
      training_outcome: null,
      average_cp_loss: null,
      max_single_cp_loss: null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ActiveSessionError("An active training session already exists.", 409);
    }

    throw new ActiveSessionError(`Failed to create active session: ${error.message}`, 500);
  }

  return normalizeActiveSessionRow(data as unknown as Record<string, unknown>);
}

export async function updateActiveTrainingSessionMoves(input: {
  userId: string;
  sessionId: unknown;
  moveUcis: unknown;
}): Promise<ActiveTrainingSession> {
  if (typeof input.sessionId !== "string" || input.sessionId.length === 0) {
    throw new ActiveSessionError("Missing active session ID.", 400);
  }

  const supabase = getSupabaseAdminClient();
  const { data: stored, error: loadError } = await supabase
    .from("training_sessions" as any)
    .select("*")
    .eq("id", input.sessionId)
    .eq("user_id", input.userId)
    .is("completed_at", null)
    .maybeSingle();

  if (loadError) {
    throw new ActiveSessionError(`Failed to load active session: ${loadError.message}`, 500);
  }

  if (!stored) {
    throw new ActiveSessionError("Active training session was not found.", 404);
  }

  const current = normalizeActiveSessionRow(stored as unknown as Record<string, unknown>);
  const nextMoves = buildLegalStoredSequence(current.startingFen, input.moveUcis);

  if (!nextMoves) {
    throw new ActiveSessionError("Submitted sequence contains an illegal move.", 400);
  }

  if (!storedSequenceIsPrefix(current.moves, nextMoves)) {
    throw new ActiveSessionError("Submitted sequence cannot rewrite existing moves.", 409);
  }

  const { data: updated, error: updateError } = await supabase
    .from("training_sessions" as any)
    .update({
      moves_played: nextMoves as unknown as Json,
      sequence_length: countUserMovesInStoredSequence(current.startingFen, nextMoves),
    })
    .eq("id", current.id)
    .eq("user_id", input.userId)
    .is("completed_at", null)
    .select("*")
    .single();

  if (updateError) {
    throw new ActiveSessionError(`Failed to update active session: ${updateError.message}`, 500);
  }

  return normalizeActiveSessionRow(updated as unknown as Record<string, unknown>);
}


