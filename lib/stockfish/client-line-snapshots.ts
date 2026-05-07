import type { ClientEngineLine } from "./types";

export function selectCoherentClientLines(
  linesByRank: Map<number, ClientEngineLine>,
  history: ClientEngineLine[],
  expectedMultiPv: number,
) {
  const observedMaxRank = Math.max(0, ...[...linesByRank.keys()]);
  const requiredRanks = Math.max(1, Math.min(expectedMultiPv, observedMaxRank));
  const byDepth = new Map<number, Map<number, ClientEngineLine>>();

  for (const line of history) {
    if (line.depth <= 0 || line.rank <= 0) continue;
    let depthLines = byDepth.get(line.depth);
    if (!depthLines) {
      depthLines = new Map();
      byDepth.set(line.depth, depthLines);
    }
    depthLines.set(line.rank, line);
  }

  const completeDepths = [...byDepth.entries()]
    .filter(([, depthLines]) => hasContiguousRanks(depthLines, requiredRanks))
    .sort(([leftDepth], [rightDepth]) => rightDepth - leftDepth);
  const selected = completeDepths[0]?.[1];

  if (selected) {
    return ranksFrom(selected, requiredRanks);
  }

  return [];
}

function hasContiguousRanks(lines: Map<number, ClientEngineLine>, requiredRanks: number) {
  for (let rank = 1; rank <= requiredRanks; rank += 1) {
    if (!lines.has(rank)) return false;
  }
  return true;
}

function ranksFrom(lines: Map<number, ClientEngineLine>, requiredRanks: number) {
  const selected: ClientEngineLine[] = [];
  for (let rank = 1; rank <= requiredRanks; rank += 1) {
    const line = lines.get(rank);
    if (line) selected.push(line);
  }
  return selected;
}
