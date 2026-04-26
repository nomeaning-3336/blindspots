import "server-only";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ELITE_POSITIONS_PATH = resolve(process.cwd(), "public", "elite_positions.json");

interface ElitePositionRecord {
  fen: string;
  played_move: string;
  game_id: number;
  ply: number;
}

interface PreviousPositionResult {
  previousFen: string;
  playedMove: string;
}

let indexPromise: Promise<{
  fenToMeta: Map<string, { gameId: number; ply: number; playedMove: string }>;
  gamePlyToFen: Map<string, string>;
}> | null = null;

function loadIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const fenToMeta = new Map<string, { gameId: number; ply: number; playedMove: string }>();
      const gamePlyToFen = new Map<string, string>();

      const raw = await readFile(ELITE_POSITIONS_PATH, "utf8").catch(() => "[]");
      const positions = JSON.parse(raw) as ElitePositionRecord[];

      for (const pos of positions) {
        if (typeof pos.fen !== "string" || !pos.fen) continue;
        const gameId = typeof pos.game_id === "number" ? pos.game_id : undefined;
        const ply = typeof pos.ply === "number" ? pos.ply : undefined;
        const playedMove = typeof pos.played_move === "string" ? pos.played_move : "";
        if (gameId === undefined || ply === undefined) continue;

        if (!fenToMeta.has(pos.fen)) {
          fenToMeta.set(pos.fen, { gameId, ply, playedMove });
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
  if (!prevFen) return null;

  return {
    previousFen: prevFen,
    playedMove: meta.playedMove,
  };
}
