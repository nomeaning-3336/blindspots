import "server-only";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseLichessMoveText } from "./lichess-move-parser";

const ELITE_POSITIONS_PATH = resolve(process.cwd(), "public", "elite_positions.json");

interface ElitePositionRecord {
  fen: string;
  played_move: string;
  game_id: number;
  ply: number;
  lichess_url?: string;
}

interface PreviousPositionResult {
  previousFen: string;
  playedMove: string;
}

interface IndexedPreviousPositionResult extends PreviousPositionResult {
  fenAfter: string;
}

let indexPromise: Promise<{
  fenToMeta: Map<string, { gameId: number; ply: number; playedMove: string; lichessUrl: string | null }>;
  gamePlyToFen: Map<string, string>;
}> | null = null;
const lichessGamePromiseById = new Map<string, Promise<IndexedPreviousPositionResult[]>>();

function loadIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const fenToMeta = new Map<string, { gameId: number; ply: number; playedMove: string; lichessUrl: string | null }>();
      const gamePlyToFen = new Map<string, string>();

      const raw = await readFile(ELITE_POSITIONS_PATH, "utf8").catch(() => "[]");
      const positions = JSON.parse(raw) as ElitePositionRecord[];

      for (const pos of positions) {
        if (typeof pos.fen !== "string" || !pos.fen) continue;
        const gameId = typeof pos.game_id === "number" ? pos.game_id : undefined;
        const ply = typeof pos.ply === "number" ? pos.ply : undefined;
        const playedMove = typeof pos.played_move === "string" ? pos.played_move : "";
        const lichessUrl = typeof pos.lichess_url === "string" ? pos.lichess_url : null;
        if (gameId === undefined || ply === undefined) continue;

        if (!fenToMeta.has(pos.fen)) {
          fenToMeta.set(pos.fen, { gameId, ply, playedMove, lichessUrl });
        }
        gamePlyToFen.set(`${gameId}_${ply}`, pos.fen);
      }

      return { fenToMeta, gamePlyToFen };
    })();
  }
  return indexPromise;
}

export async function getPreviousPosition(fen: string): Promise<PreviousPositionResult | null> {
  const { fenToMeta, gamePlyToFen } = await loadIndex();
  const meta = fenToMeta.get(fen);
  if (!meta || meta.ply <= 0) return null;

  const prevFen = gamePlyToFen.get(`${meta.gameId}_${meta.ply - 1}`);
  if (prevFen) {
    return {
      previousFen: prevFen,
      playedMove: meta.playedMove,
    };
  }

  const lichessGameId = lichessGameIdFromUrl(meta.lichessUrl);
  if (!lichessGameId) return null;

  const positions = await loadLichessPreviousPositions(lichessGameId);
  return positions.find((position) => samePosition(position.fenAfter, fen)) ?? null;
}

function lichessGameIdFromUrl(url: string | null) {
  if (!url) return null;
  const match = url.match(/lichess\.org\/([A-Za-z0-9]{8,12})/);
  return match?.[1] ?? null;
}

function loadLichessPreviousPositions(gameId: string) {
  let promise = lichessGamePromiseById.get(gameId);
  if (!promise) {
    promise = (async () => {
      const response = await fetch(`https://lichess.org/game/export/${gameId}?evals=false&clocks=false`, {
        headers: { Accept: "application/json" },
        cache: "force-cache",
      });
      if (!response.ok) return [];
      const payload = (await response.json().catch(() => null)) as { moves?: unknown } | null;
      const moves = typeof payload?.moves === "string" ? payload.moves : "";
      if (!moves) return [];

      return parseLichessMoveText(moves).map((move) => ({
        previousFen: move.fenBefore,
        playedMove: move.uci,
        fenAfter: move.fenAfter,
      }));
    })();
    lichessGamePromiseById.set(gameId, promise);
  }
  return promise;
}

function samePosition(leftFen: string, rightFen: string) {
  return leftFen.split(/\s+/).slice(0, 4).join(" ") === rightFen.split(/\s+/).slice(0, 4).join(" ");
}
