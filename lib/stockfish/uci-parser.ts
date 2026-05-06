import type { ClientEngineLine } from "./types";

export function parseUciInfoLine(line: string): ClientEngineLine | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;

  const pvText = line.split(/\s+pv\s+/)[1]?.trim();
  const pv = pvText?.split(/\s+/).filter(Boolean) ?? [];
  const bestMove = pv[0];
  if (!bestMove) return null;

  const depth = numberAfterToken(line, "depth") ?? 0;
  const rank = numberAfterToken(line, "multipv") ?? 1;
  const score = parseScore(line);

  return {
    rank,
    depth,
    cp: score.cp,
    mate: score.mate,
    bestMove,
    pv,
  };
}

export function parseBestMove(line: string) {
  if (!line.startsWith("bestmove ")) return null;
  const bestMove = line.split(/\s+/)[1];
  return bestMove && bestMove !== "(none)" ? bestMove : null;
}

function numberAfterToken(line: string, token: string) {
  const match = line.match(new RegExp(`\\b${token}\\s+(-?\\d+)`));
  return match ? Number.parseInt(match[1] ?? "0", 10) : null;
}

function parseScore(line: string): { cp: number | null; mate: number | null } {
  const cp = numberAfterToken(line, "cp");
  if (typeof cp === "number") return { cp, mate: null };

  const mate = numberAfterToken(line, "mate");
  if (typeof mate === "number") return { cp: null, mate };

  return { cp: null, mate: null };
}
