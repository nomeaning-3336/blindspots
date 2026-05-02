import { Chess } from "chess.js";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getPositionEval, getPositionLines } from "@/lib/engines/dispatcher";

export interface LichessSyncResult {
  profileId: string | null;
  provider: "lichess";
  username: string;
  gamesFetched: number;
  gamesAnalyzed: number;
  mistakesInserted: number;
  mistakesSkippedExisting: number;
  movesAnalyzed: number;
  errors: string[];
}

interface LichessGameJson {
  id?: string;
  lastMoveAt?: number;
  moves?: string;
  opening?: { name?: string; eco?: string; ply?: number };
  variant?: string;
  players?: {
    white?: { user?: { name?: string }; rating?: number };
    black?: { user?: { name?: string }; rating?: number };
  };
}

interface MistakeCandidate {
  user_id: string;
  linked_profile_id: string;
  source_type: "own_game";
  source_provider: "lichess";
  source_game_id: string;
  source_game_url: string;
  game_played_at: string;
  ply: number;
  user_color: "white" | "black";
  starting_fen: string;
  decision_fen: string;
  actual_move_uci: string;
  actual_move_san: string;
  best_move_uci: string | null;
  best_move_san: string | null;
  eval_before_cp: number;
  eval_after_cp: number;
  cp_loss: number;
  opening_name: string | null;
  eco: string | null;
  theme_tags: unknown[];
  status: "active";
  interval_days: number;
}

const DEFAULT_MAX_GAMES = 5;
const HARD_MAX_GAMES = 10;
const DEFAULT_MAX_USER_MOVES = 80;
const HARD_MAX_USER_MOVES = 150;
const DEFAULT_MAX_MISTAKES = 30;
const HARD_MAX_MISTAKES = 50;
const DEFAULT_SINCE_DAYS = 30;
const CP_LOSS_THRESHOLD = 150;
const REQUEST_TIMEOUT_MS = 20000;
const EVAL_DEPTH = 12;
const EVAL_TIME_MS = 800;

function clamp(value: number, max: number): number {
  return Math.min(value, max);
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncLichessMistakesForUser(input: {
  userId: string;
  maxGames?: number;
  maxUserMoves?: number;
  maxMistakes?: number;
  sinceDays?: number;
  now?: Date;
}): Promise<LichessSyncResult[]> {
  const supabase = getSupabaseAdminClient();
  const now = input.now ?? new Date();
  const maxGames = clamp(input.maxGames ?? DEFAULT_MAX_GAMES, HARD_MAX_GAMES);
  const maxUserMoves = clamp(input.maxUserMoves ?? DEFAULT_MAX_USER_MOVES, HARD_MAX_USER_MOVES);
  const maxMistakes = clamp(input.maxMistakes ?? DEFAULT_MAX_MISTAKES, HARD_MAX_MISTAKES);
  const sinceMs = now.getTime() - (input.sinceDays ?? DEFAULT_SINCE_DAYS) * 24 * 60 * 60 * 1000;

  const { data: profiles, error: profileError } = await supabase
    .from("linked_chess_profiles")
    .select("*")
    .eq("user_id", input.userId)
    .eq("provider", "lichess");

  if (profileError || !profiles?.length) {
    return [];
  }

  const results: LichessSyncResult[] = [];

  for (const profile of profiles) {
    const result: LichessSyncResult = {
      profileId: profile.id ?? null,
      provider: "lichess",
      username: profile.username,
      gamesFetched: 0,
      gamesAnalyzed: 0,
      mistakesInserted: 0,
      mistakesSkippedExisting: 0,
      movesAnalyzed: 0,
      errors: [],
    };

    await supabase
      .from("linked_chess_profiles")
      .update({ last_sync_status: "running" })
      .eq("id", profile.id);

    try {
      const games = await fetchRecentLichessGames(profile.username, sinceMs, maxGames);
      result.gamesFetched = games.length;

      let mistakesInserted = 0;
      let totalMovesAnalyzed = 0;

      for (const game of games) {
        if (mistakesInserted >= maxMistakes) break;
        if (totalMovesAnalyzed >= maxUserMoves) break;

        try {
          const { candidates, movesAnalyzed } = await buildMistakeCandidatesFromGame({
            game,
            profileId: profile.id,
            userId: input.userId,
            username: profile.username,
            moveCap: maxUserMoves - totalMovesAnalyzed,
          });
          result.gamesAnalyzed++;
          totalMovesAnalyzed += movesAnalyzed;

          if (candidates.length > 0) {
            const remaining = maxMistakes - mistakesInserted;
            const toInsert = candidates.slice(0, remaining);
            const deduplicated = await filterExistingMistakes(input.userId, toInsert);
            result.mistakesSkippedExisting += toInsert.length - deduplicated.length;

            if (deduplicated.length > 0) {
              const { error: insertError } = await supabase
                .from("user_mistakes")
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .insert(deduplicated as any);

              if (insertError) {
                result.errors.push(`Insert failed: ${insertError.message}`);
              } else {
                mistakesInserted += deduplicated.length;
              }
            }
          }
        } catch (gameError) {
          const msg = gameError instanceof Error ? gameError.message : String(gameError);
          result.errors.push(`Game ${game.id ?? "?"}: ${msg}`);
        }
      }

      result.mistakesInserted = mistakesInserted;
      result.movesAnalyzed = totalMovesAnalyzed;

      const lastGameId = games.length > 0 ? (games[0].id ?? null) : null;
      await supabase
        .from("linked_chess_profiles")
        .update({
          last_sync_at: now.toISOString(),
          last_sync_status: "success",
          last_sync_error: result.errors.length > 0 ? result.errors.slice(0, 3).join("; ") : null,
          last_game_id_seen: lastGameId,
          last_sync_game_count: result.gamesFetched,
          last_sync_mistake_count: result.mistakesInserted,
        })
        .eq("id", profile.id);
    } catch (syncError) {
      const msg = syncError instanceof Error ? syncError.message : String(syncError);
      result.errors.push(msg);
      await supabase
        .from("linked_chess_profiles")
        .update({
          last_sync_at: now.toISOString(),
          last_sync_status: "error",
          last_sync_error: msg,
        })
        .eq("id", profile.id);
    }

    results.push(result);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Fetch recent Lichess games
// ---------------------------------------------------------------------------

async function fetchRecentLichessGames(
  username: string,
  sinceMs: number,
  maxGames: number,
): Promise<LichessGameJson[]> {
  const endpoint = new URL(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}`,
  );
  endpoint.searchParams.set("since", String(sinceMs));
  endpoint.searchParams.set("max", String(maxGames));
  endpoint.searchParams.set("opening", "true");
  endpoint.searchParams.set("moves", "true");
  endpoint.searchParams.set("pgnInJson", "false");
  endpoint.searchParams.set("clocks", "false");
  endpoint.searchParams.set("evals", "false");
  endpoint.searchParams.set("accuracy", "false");
  endpoint.searchParams.set("sort", "dateDesc");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/x-ndjson",
      "User-Agent": "BlindspotsLocalDev/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Lichess request failed (${response.status})`);
  }

  return (await response.text())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LichessGameJson)
    .filter((game) => !game.variant || game.variant === "standard");
}

// ---------------------------------------------------------------------------
// Build mistake candidates from a single game
// ---------------------------------------------------------------------------

export async function buildMistakeCandidatesFromGame(input: {
  game: LichessGameJson;
  profileId: string;
  userId: string;
  username: string;
  moveCap: number;
}): Promise<{ candidates: MistakeCandidate[]; movesAnalyzed: number }> {
  const { game, profileId, userId, username, moveCap } = input;
  const moves = (game.moves ?? "").trim();
  if (!moves) return { candidates: [], movesAnalyzed: 0 };

  const uciMoves = moves.split(/\s+/).filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
  if (uciMoves.length === 0) return { candidates: [], movesAnalyzed: 0 };

  const normalizedUser = username.toLowerCase();
  const whiteName = (game.players?.white?.user?.name ?? "").trim().toLowerCase();
  const blackName = (game.players?.black?.user?.name ?? "").trim().toLowerCase();

  let userColor: "white" | "black" | null = null;
  if (normalizedUser && whiteName === normalizedUser) userColor = "white";
  else if (normalizedUser && blackName === normalizedUser) userColor = "black";

  if (!userColor) return { candidates: [], movesAnalyzed: 0 };

  const candidates: MistakeCandidate[] = [];
  let movesAnalyzed = 0;
  let previousFen: string | null = null;

  const gameId = game.id ?? `lichess-${Date.now()}`;
  const gameUrl = game.id ? `https://lichess.org/${game.id}` : "";
  const playedAt = new Date(game.lastMoveAt ?? 0).toISOString();
  const openingName = game.opening?.name ?? null;
  const eco = game.opening?.eco ?? null;

  // Replay game from start
  const chess = new Chess();
  for (let plyIndex = 0; plyIndex < uciMoves.length && movesAnalyzed < moveCap; plyIndex++) {
    const uci = uciMoves[plyIndex];
    const fenBefore = chess.fen();

    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as never });
    } catch {
      break;
    }

    const fenAfter = chess.fen();
    const isUserMove = userColor === "white"
      ? plyIndex % 2 === 0
      : plyIndex % 2 === 1;

    if (isUserMove) {
      movesAnalyzed++;

      try {
        const evalBefore = await getPositionEval(fenBefore, {
          depthLimit: EVAL_DEPTH,
          timeLimitMs: EVAL_TIME_MS,
        });
        const evalAfter = await getPositionEval(fenAfter, {
          depthLimit: EVAL_DEPTH,
          timeLimitMs: EVAL_TIME_MS,
        });

        const beforeCp = userColor === "white" ? evalBefore.cp : -evalBefore.cp;
        const afterCp = userColor === "white" ? evalAfter.cp : -evalAfter.cp;
        const cpLoss = Math.max(0, Math.round(beforeCp - afterCp));

        if (cpLoss >= CP_LOSS_THRESHOLD) {
          const lines = await getPositionLines(fenBefore, {
            depthLimit: EVAL_DEPTH,
            multiPv: 1,
            timeLimitMs: EVAL_TIME_MS,
          });
          const bestLine = lines[0] as { bestMove?: string; san?: string } | undefined;
          const bestMoveUci = bestLine?.bestMove ?? null;

          let bestMoveSan: string | null = null;
          if (bestMoveUci) {
            try {
              const clone = new Chess(fenBefore);
              clone.move({
                from: bestMoveUci.slice(0, 2),
                to: bestMoveUci.slice(2, 4),
                promotion: bestMoveUci[4] as never,
              });
              bestMoveSan = clone.history({ verbose: true }).pop()?.san ?? null;
            } catch {
              bestMoveSan = null;
            }
          }

          let actualMoveSan: string | null = null;
          try {
            const clone = new Chess(fenBefore);
            clone.move({
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci[4] as never,
            });
            actualMoveSan = clone.history({ verbose: true }).pop()?.san ?? uci;
          } catch {
            actualMoveSan = uci;
          }

          candidates.push({
            user_id: userId,
            linked_profile_id: profileId,
            source_type: "own_game",
            source_provider: "lichess",
            source_game_id: gameId,
            source_game_url: gameUrl,
            game_played_at: playedAt,
            ply: plyIndex,
            user_color: userColor,
            starting_fen: previousFen ?? fenBefore,
            decision_fen: fenBefore,
            actual_move_uci: uci,
            actual_move_san: actualMoveSan,
            best_move_uci: bestMoveUci,
            best_move_san: bestMoveSan,
            eval_before_cp: Math.round(beforeCp),
            eval_after_cp: Math.round(afterCp),
            cp_loss: cpLoss,
            opening_name: openingName,
            eco,
            theme_tags: [],
            status: "active",
            interval_days: 1,
          });
        }
      } catch {
        // Engine eval failed for this move — skip
      }
    }

    previousFen = fenBefore;
  }

  return { candidates, movesAnalyzed };
}

// ---------------------------------------------------------------------------
// Deduplicate against existing rows
// ---------------------------------------------------------------------------

async function filterExistingMistakes(
  userId: string,
  candidates: MistakeCandidate[],
): Promise<MistakeCandidate[]> {
  const supabase = getSupabaseAdminClient();

  const gameIds = [...new Set(candidates.map((c) => c.source_game_id))];
  if (gameIds.length === 0) return candidates;

  const { data: existing } = await supabase
    .from("user_mistakes")
    .select("source_game_id, ply")
    .eq("user_id", userId)
    .eq("source_type", "own_game")
    .in("source_game_id", gameIds);

  if (!existing?.length) return candidates;

  const existingSet = new Set(
    existing.map((r) => `${r.source_game_id}:${r.ply}`),
  );

  return candidates.filter((c) => {
    const key = `${c.source_game_id}:${c.ply}`;
    return !existingSet.has(key);
  });
}
