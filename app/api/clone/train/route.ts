// @ts-nocheck — clone tables not yet in generated Supabase types
import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { Chess } from "chess.js";
import type { ChessProvider } from "@/lib/chess-profile";

export const dynamic = "force-dynamic";

const TRAINING_FETCH_TIMEOUT_MS = 35000;

type CloneTrainingGame = {
  id: string;
  provider: ChessProvider;
  userColor: "white" | "black";
  movesUci: string[];
  totalPlies: number;
  timeType: string;
  userRating: number | null;
};

type TrainingSourceGame = {
  id: string;
  provider: ChessProvider;
  endTimeMs: number;
  userColor: "white" | "black";
  moveText: string;
  timeType: string;
  userRating: number | null;
};

type PlayerColor = "white" | "black";

function buildCloneTrainingGames(games: TrainingSourceGame[]): CloneTrainingGame[] {
  return games
    .map((g) => {
      const movesUci = normalizeMoveTextToUci(g.moveText);
      if (movesUci.length === 0) return null;

      try {
        const replay = new Chess();
        for (const uci of movesUci) {
          const from = uci.slice(0, 2);
          const to = uci.slice(2, 4);
          const promotion = uci.length > 4 ? uci.slice(4) : undefined;
          const applied = replay.move({ from, to, promotion });
          if (!applied) return null;
        }
      } catch {
        return null;
      }

      return {
        id: g.id,
        provider: g.provider,
        userColor: g.userColor,
        movesUci,
        totalPlies: movesUci.length,
        timeType: g.timeType,
        userRating: g.userRating,
      };
    })
    .filter((g): g is CloneTrainingGame => g !== null);
}

function normalizeMoveTextToUci(moveText: string) {
  const tokens = moveText.split(/\s+/).filter(Boolean);
  if (tokens.every((token) => /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(token))) {
    return tokens.map((token) => token.toLowerCase());
  }

  try {
    const chess = new Chess();
    chess.loadPgn(moveText);
    return chess.history({ verbose: true }).map((m) => {
      const uci = m.from + m.to;
      return m.promotion ? uci + m.promotion : uci;
    });
  } catch {
    return [];
  }
}

function currentCloneRating(trainingGames: CloneTrainingGame[]) {
  return trainingGames.find((game) => game.userRating !== null)?.userRating ?? null;
}

async function fetchCloneTrainingSourceGames({
  provider,
  username,
}: {
  provider: ChessProvider;
  username: string;
}) {
  if (provider === "lichess") {
    return fetchLichessTrainingSourceGames(username);
  }

  return fetchChessComTrainingSourceGames(username);
}

async function fetchLichessTrainingSourceGames(username: string): Promise<TrainingSourceGame[]> {
  const endpoint = new URL(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}`
  );
  endpoint.searchParams.set("since", String(Date.now() - 90 * 24 * 60 * 60 * 1000));
  endpoint.searchParams.set("max", "80");
  endpoint.searchParams.set("moves", "true");
  endpoint.searchParams.set("clocks", "false");
  endpoint.searchParams.set("evals", "false");
  endpoint.searchParams.set("opening", "false");
  endpoint.searchParams.set("accuracy", "false");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/x-ndjson",
      "User-Agent": "ChessviewLocalDev/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TRAINING_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Lichess request failed with status ${response.status}`);
  }

  return (await response.text())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => normalizeLichessTrainingGame(username, line, index))
    .filter((game): game is TrainingSourceGame => Boolean(game));
}

async function fetchChessComTrainingSourceGames(username: string): Promise<TrainingSourceGame[]> {
  const archivesResponse = await fetchJson<{ archives?: string[] }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`
  );
  const sinceMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const monthUrls = (archivesResponse.archives ?? []).filter((archiveUrl) => {
    const parts = archiveUrl.split("/").slice(-2);
    const year = Number.parseInt(parts[0] ?? "", 10);
    const month = Number.parseInt(parts[1] ?? "", 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return false;
    return Date.UTC(year, month, 1) - 1 >= sinceMs;
  });

  const archives = await Promise.all(
    monthUrls.map((archiveUrl) =>
      fetchJson<{ games?: unknown[] }>(archiveUrl).catch(() => ({ games: [] }))
    )
  );

  return archives
    .flatMap((archive) => archive.games ?? [])
    .map((game, index) => normalizeChessComTrainingGame(username, game, index))
    .filter((game): game is TrainingSourceGame => Boolean(game));
}

function normalizeLichessTrainingGame(
  username: string,
  rawLine: string,
  index: number
): TrainingSourceGame | null {
  const game = JSON.parse(rawLine) as {
    id?: string;
    variant?: string;
    perf?: string;
    lastMoveAt?: number;
    moves?: string;
    players?: {
      white?: { user?: { name?: string }; rating?: number };
      black?: { user?: { name?: string }; rating?: number };
    };
    clock?: { initial?: number };
  };

  if (game.variant && game.variant !== "standard") return null;
  const userColor = resolveUserColor(
    username,
    game.players?.white?.user?.name,
    game.players?.black?.user?.name
  );
  if (!userColor || !game.moves) return null;

  return {
    id: game.id ?? `lichess-${index}`,
    provider: "lichess",
    endTimeMs: Number(game.lastMoveAt ?? 0),
    userColor,
    moveText: game.moves,
    timeType: normalizeLichessTimeType(game.perf, parseMaybeNumber(game.clock?.initial)),
    userRating:
      userColor === "white"
        ? parseMaybeNumber(game.players?.white?.rating)
        : parseMaybeNumber(game.players?.black?.rating),
  };
}

function normalizeChessComTrainingGame(
  username: string,
  rawGame: unknown,
  index: number
): TrainingSourceGame | null {
  const game = rawGame as {
    url?: string;
    pgn?: string;
    rules?: string;
    time_class?: string;
    time_control?: string;
    end_time?: number;
    white?: { username?: string; rating?: number };
    black?: { username?: string; rating?: number };
  };

  if (game.rules && game.rules !== "chess") return null;
  const userColor = resolveUserColor(username, game.white?.username, game.black?.username);
  if (!userColor || !game.pgn) return null;
  const initialSeconds = parseChessComInitialSeconds(game.time_control);

  return {
    id: game.url ?? `chesscom-${index}`,
    provider: "chesscom",
    endTimeMs: Number(game.end_time ?? 0) * 1000,
    userColor,
    moveText: game.pgn,
    timeType: normalizeChessComTimeType(game.time_class, initialSeconds),
    userRating:
      userColor === "white"
        ? parseMaybeNumber(game.white?.rating)
        : parseMaybeNumber(game.black?.rating),
  };
}

function resolveUserColor(
  username: string,
  whiteName?: string,
  blackName?: string
): PlayerColor | null {
  const normalized = username.toLowerCase();
  if (whiteName?.trim().toLowerCase() === normalized) return "white";
  if (blackName?.trim().toLowerCase() === normalized) return "black";
  return null;
}

function normalizeLichessTimeType(perf?: string, initialSeconds?: number | null) {
  switch ((perf ?? "").toLowerCase()) {
    case "ultrabullet":
    case "bullet":
      return "bullet";
    case "blitz":
      return "blitz";
    case "rapid":
      return "rapid";
    case "classical":
      return "classical";
    case "correspondence":
      return "daily";
    default:
      if ((initialSeconds ?? 0) >= 1800) return "classical";
      return "other";
  }
}

function normalizeChessComTimeType(timeClass?: string, initialSeconds?: number | null) {
  if (timeClass === "bullet" || timeClass === "blitz" || timeClass === "rapid") {
    if ((initialSeconds ?? 0) >= 1800) return "classical";
    return timeClass;
  }
  if (timeClass === "daily") return "daily";
  if ((initialSeconds ?? 0) >= 1800) return "classical";
  return "other";
}

function parseChessComInitialSeconds(timeControl?: string) {
  if (!timeControl) return null;
  const initialPart = timeControl.includes("+")
    ? timeControl.split("+")[0]
    : timeControl.includes("/")
      ? timeControl.split("/")[1]
      : timeControl;
  return parseMaybeNumber(initialPart);
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ChessviewLocalDev/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TRAINING_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function parseMaybeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function POST() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();

  // Get clone record — allow needs_training, failed, or stale training
  const { data: clone } = await supabase
    .from("user_clones")
    .select("id, provider, username, status, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!clone) {
    return NextResponse.json({ error: "No clone found" }, { status: 404 });
  }

  const isStaleTraining =
    clone.status === "training" &&
    new Date(clone.updated_at).getTime() < Date.now() - 2 * 60 * 1000;

  if (
    clone.status !== "needs_training" &&
    clone.status !== "failed" &&
    !isStaleTraining
  ) {
    return NextResponse.json(
      { error: "Clone is not in a trainable state" },
      { status: 409 }
    );
  }

  // Update status to training
  await supabase
    .from("user_clones")
    .update({ status: "training", updated_at: new Date().toISOString() })
    .eq("id", clone.id);

  try {
    const games = await fetchCloneTrainingSourceGames({
      provider: clone.provider,
      username: clone.username,
    });

    const trainingGames = buildCloneTrainingGames(
      [...games].sort((a, b) => b.endTimeMs - a.endTimeMs)
    ).slice(0, 20);

    if (trainingGames.length < 20) {
      // Revert to needs_training on insufficient games
      await supabase
        .from("user_clones")
        .update({ status: "needs_training", updated_at: new Date().toISOString() })
        .eq("id", clone.id);

      return NextResponse.json(
        { error: "insufficient_games", found: trainingGames.length },
        { status: 409 }
      );
    }

    const totalPlies = trainingGames.reduce((sum, g) => sum + g.totalPlies, 0);

    // MVP placeholder:128-length zero vector
    const placeholderEmbedding = Array.from({ length: 128 }, () => 0);

    await supabase
      .from("user_clones")
      .update({
        status: "ready",
        rating: currentCloneRating(trainingGames),
        embedding: placeholderEmbedding,
        embedding_model: "placeholder-random-v0",
        embedding_version: "placeholder-v0",
        source_game_count: trainingGames.length,
        source_position_count: totalPlies,
        trained_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", clone.id);

    return NextResponse.json({
      ok: true,
      sourceGameCount: trainingGames.length,
      sourcePositionCount: totalPlies,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    await supabase
      .from("user_clones")
      .update({
        status: "failed",
        training_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clone.id);

    return NextResponse.json(
      { error: "training_failed", message },
      { status: 500 }
    );
  }
}
