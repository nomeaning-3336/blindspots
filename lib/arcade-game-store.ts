import "server-only";

import { Chess } from "chess.js";
import {
  ARCADE_START_FEN,
  type ArcadeGameStatus,
  type ArcadeGameSummary,
  type ArcadeVariantKey,
  isArcadeVariantKey,
} from "@/lib/arcade";
import type { Json } from "@/lib/supabase/database";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

function arcadeStatusForFen(
  fen: string,
  fallback: ArcadeGameStatus = "active",
): ArcadeGameStatus {
  const normalizedFen = String(fen || "").trim();
  if (!normalizedFen) return fallback;
  try {
    const game = new Chess(normalizedFen);
    return game.isGameOver() ? "finished" : "active";
  } catch {
    return fallback;
  }
}

function normalizeArcadeState(
  value: Json | null,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function serializeArcadeState(
  value: Record<string, unknown> | null,
): Json | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as Json;
}

function extractCurrentFenFromArcadeState(
  state: Record<string, unknown> | null,
): string {
  if (!state) return ARCADE_START_FEN;
  const currentFen =
    typeof state.currentFen === "string" ? state.currentFen.trim() : "";
  if (currentFen) return currentFen;

  const currentId =
    typeof state.currentId === "string" ? state.currentId.trim() : "";
  const nodes = Array.isArray(state.nodes) ? state.nodes : [];
  if (!currentId || !nodes.length) return ARCADE_START_FEN;

  for (const candidate of nodes) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const entry = candidate as Record<string, unknown>;
    if (
      typeof entry.id === "string" &&
      entry.id === currentId &&
      typeof entry.fen === "string" &&
      entry.fen.trim()
    ) {
      return entry.fen.trim();
    }
  }

  return ARCADE_START_FEN;
}

function mapArcadeGameRow(
  row: {
    id: string;
    variant_key: string;
    status: string;
    current_fen: string;
    created_at: string;
    updated_at: string;
    last_played_at: string;
  },
): ArcadeGameSummary {
  const derivedStatus =
    row.status === "finished"
      ? "finished"
      : arcadeStatusForFen(row.current_fen, "active");
  return {
    id: row.id,
    variantKey: isArcadeVariantKey(row.variant_key)
      ? row.variant_key
      : "vanilla",
    status: derivedStatus,
    currentFen: row.current_fen || ARCADE_START_FEN,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastPlayedAt: row.last_played_at,
  };
}

export async function listActiveArcadeGamesForUser(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("arcade_games")
    .select(
      "id, variant_key, status, current_fen, created_at, updated_at, last_played_at",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("last_played_at", { ascending: false })
    .limit(40);

  if (error) {
    throw new Error(`Failed to load arcade games: ${error.message}`);
  }

  const rows = data || [];
  const activeRows = rows.filter(
    (row) => arcadeStatusForFen(row.current_fen, "active") === "active",
  );
  const staleFinishedIds = rows
    .filter((row) => arcadeStatusForFen(row.current_fen, "active") === "finished")
    .map((row) => row.id);

  if (staleFinishedIds.length) {
    await supabase
      .from("arcade_games")
      .update({ status: "finished" })
      .in("id", staleFinishedIds)
      .eq("user_id", userId);
  }

  return activeRows.map(mapArcadeGameRow).slice(0, 12);
}

export async function listRecentStandardArcadeGamesForUser(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("arcade_games")
    .select(
      "id, variant_key, status, current_fen, created_at, updated_at, last_played_at",
    )
    .eq("user_id", userId)
    .in("variant_key", ["vanilla", "drunkfish"])
    .order("last_played_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Failed to load recent arcade games: ${error.message}`);
  }

  return (data || []).map(mapArcadeGameRow);
}

export async function createArcadeGameForUser(
  userId: string,
  variantKey: ArcadeVariantKey,
) {
  const supabase = getSupabaseAdminClient();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("arcade_games")
    .insert({
      id,
      user_id: userId,
      variant_key: variantKey,
      status: "active",
      current_fen: ARCADE_START_FEN,
      last_played_at: now,
    })
    .select(
      "id, variant_key, status, current_fen, created_at, updated_at, last_played_at",
    )
    .single();

  if (error) {
    throw new Error(`Failed to create arcade game: ${error.message}`);
  }

  return mapArcadeGameRow(data);
}

export async function getArcadeGameForUser(userId: string, gameId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("arcade_games")
    .select(
      "id, user_id, variant_key, status, current_fen, state, created_at, updated_at, last_played_at",
    )
    .eq("id", gameId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load arcade game: ${error.message}`);
  }

  if (!data || !isArcadeVariantKey(data.variant_key)) {
    return null;
  }

  return {
    ...mapArcadeGameRow(data),
    userId: data.user_id,
    state: normalizeArcadeState(data.state),
  };
}

export async function saveArcadeGameStateForUser(options: {
  userId: string;
  gameId: string;
  state: Record<string, unknown> | null;
  status?: ArcadeGameStatus;
}) {
  const supabase = getSupabaseAdminClient();
  const nextState = serializeArcadeState(options.state);
  const now = new Date().toISOString();
  const currentFen = extractCurrentFenFromArcadeState(options.state);
  const nextStatus =
    options.status === "finished"
      ? "finished"
      : arcadeStatusForFen(currentFen, "active");

  const { data, error } = await supabase
    .from("arcade_games")
    .update({
      state: nextState,
      status: nextStatus,
      current_fen: currentFen,
      last_played_at: now,
    })
    .eq("id", options.gameId)
    .eq("user_id", options.userId)
    .select(
      "id, variant_key, status, current_fen, created_at, updated_at, last_played_at",
    )
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to save arcade game: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapArcadeGameRow(data);
}
