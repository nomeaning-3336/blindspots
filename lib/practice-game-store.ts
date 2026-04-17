import "server-only";

import {
  PRACTICE_START_FEN,
  clampPracticeElo,
  createInitialPracticeGameState,
  isPracticeEngineType,
  isPracticePresetKey,
  normalizePracticeGameState,
  practiceSummaryFromState,
  type PracticeEngineType,
  type PracticeGameState,
  type PracticeGameStatus,
  type PracticeGameSummary,
  type PracticePresetKey,
  type PracticeStoredGame,
} from "@/lib/practice";
import type { Json } from "@/lib/supabase/database";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

function serializePracticeState(state: PracticeGameState): Json {
  return JSON.parse(JSON.stringify(state)) as Json;
}

function statusFromState(state: PracticeGameState): PracticeGameStatus {
  return state.status === "active" && state.currentFen === PRACTICE_START_FEN && state.moves.length === 0
    ? "active"
    : state.status;
}

export async function listActivePracticeGamesForUser(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("arcade_games")
    .select("id, user_id, state, status, created_at, updated_at, last_played_at")
    .eq("user_id", userId)
    .order("last_played_at", { ascending: false })
    .limit(40);

  if (error) {
    throw new Error(`Failed to load practice games: ${error.message}`);
  }

  return (data || [])
    .map((row) => {
      const state = normalizePracticeGameState(row.state);
      if (!state || statusFromState(state) !== "active") return null;
      return practiceSummaryFromState({
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastPlayedAt: row.last_played_at,
        state,
      });
    })
    .filter((entry): entry is PracticeGameSummary => Boolean(entry))
    .slice(0, 12);
}

export async function findLatestActivePracticeGameForUser(userId: string) {
  const activeGames = await listActivePracticeGamesForUser(userId);
  return activeGames[0] || null;
}

export async function createPracticeGameForUser(options: {
  userId: string;
  engineType: PracticeEngineType;
  presetKey: PracticePresetKey;
  incrementSeconds: number;
  opponentElo: number;
}) {
  const existing = await findLatestActivePracticeGameForUser(options.userId);
  if (existing) {
    return existing;
  }

  const supabase = getSupabaseAdminClient();
  const state = createInitialPracticeGameState({
    engineType: options.engineType,
    presetKey: options.presetKey,
    incrementSeconds: options.incrementSeconds,
    opponentElo: options.opponentElo,
  });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("arcade_games")
    .insert({
      id,
      user_id: options.userId,
      variant_key: "vanilla",
      status: "active",
      current_fen: state.currentFen,
      state: serializePracticeState(state),
      last_played_at: now,
    })
    .select("id, user_id, state, status, created_at, updated_at, last_played_at")
    .single();

  if (error) {
    throw new Error(`Failed to create practice game: ${error.message}`);
  }

  const normalized = normalizePracticeGameState(data.state);
  if (!normalized) {
    throw new Error("Practice game was created with an invalid state.");
  }

  return practiceSummaryFromState({
    id: data.id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    lastPlayedAt: data.last_played_at,
    state: normalized,
  });
}

export async function getPracticeGameForUser(userId: string, gameId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("arcade_games")
    .select("id, user_id, state, status, created_at, updated_at, last_played_at")
    .eq("id", gameId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load practice game: ${error.message}`);
  }
  if (!data) return null;

  const state = normalizePracticeGameState(data.state);
  if (!state) return null;

  return {
    ...practiceSummaryFromState({
      id: data.id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastPlayedAt: data.last_played_at,
      state,
    }),
    userId: data.user_id,
    state,
  } satisfies PracticeStoredGame;
}

export async function deletePracticeGameForUser(userId: string, gameId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("arcade_games")
    .delete()
    .eq("id", gameId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete practice game: ${error.message}`);
  }

  return Boolean(data?.id);
}

export async function savePracticeGameStateForUser(options: {
  userId: string;
  gameId: string;
  state: PracticeGameState;
}) {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const normalized = normalizePracticeGameState({
    ...options.state,
    updatedAt: now,
  });
  if (!normalized) {
    throw new Error("Practice game state is invalid.");
  }

  const { data, error } = await supabase
    .from("arcade_games")
    .update({
      status: statusFromState(normalized) === "active" ? "active" : "finished",
      current_fen: normalized.currentFen,
      state: serializePracticeState(normalized),
      last_played_at: now,
    })
    .eq("id", options.gameId)
    .eq("user_id", options.userId)
    .select("id, user_id, state, status, created_at, updated_at, last_played_at")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to save practice game: ${error.message}`);
  }
  if (!data) return null;

  const state = normalizePracticeGameState(data.state);
  if (!state) return null;

  return {
    ...practiceSummaryFromState({
      id: data.id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      lastPlayedAt: data.last_played_at,
      state,
    }),
    userId: data.user_id,
    state,
  } satisfies PracticeStoredGame;
}

export function parsePracticeCreateInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (!isPracticeEngineType(record.engineType) || !isPracticePresetKey(record.presetKey)) {
    return null;
  }
  return {
    engineType: record.engineType,
    presetKey: record.presetKey,
    incrementSeconds: Number.isFinite(Number(record.incrementSeconds))
      ? Math.max(0, Math.round(Number(record.incrementSeconds)))
      : 0,
    opponentElo: clampPracticeElo(record.opponentElo, 1500),
  };
}
