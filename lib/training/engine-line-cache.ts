export type CachedEngineLine = {
  cp: number;
  mate?: number | null;
  depth: number;
  rank?: number;
  bestMove: string;
  bestSan?: string;
  pv?: string[];
  pvSan?: string[];
  classification?: string;
  source?: string;
};

export function engineMoveLineKey(fen: string, bestMove: string): string {
  return `${fen}::${bestMove}`;
}

export function chooseDeeperEngineLine<T extends CachedEngineLine>(
  current: T | undefined,
  next: T,
): T {
  if (!current) return next;

  const currentDepth = typeof current.depth === "number" ? current.depth : -1;
  const nextDepth = typeof next.depth === "number" ? next.depth : -1;

  if (nextDepth > currentDepth) return next;

  if (
    nextDepth === currentDepth &&
    (!current.pv || current.pv.length === 0) &&
    next.pv &&
    next.pv.length > 0
  ) {
    return next;
  }

  return current;
}

export function buildDeepestEngineLineMap<T extends CachedEngineLine>(
  fen: string,
  lineLists: Array<T[] | null | undefined>,
): Map<string, T> {
  const map = new Map<string, T>();

  for (const lines of lineLists) {
    for (const line of lines ?? []) {
      if (!line.bestMove) continue;
      const key = engineMoveLineKey(fen, line.bestMove);
      map.set(key, chooseDeeperEngineLine(map.get(key), line));
    }
  }

  return map;
}

export function mergePieceLinesWithDeeperKnownLines<T extends CachedEngineLine>(input: {
  fen: string;
  square: string;
  pieceLines: T[];
  knownLineLists: Array<T[] | null | undefined>;
}): T[] {
  const deepestByMove = buildDeepestEngineLineMap(input.fen, [
    input.pieceLines,
    ...input.knownLineLists,
  ]);
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const line of input.pieceLines) {
    if (!line.bestMove) continue;
    const deepest = deepestByMove.get(engineMoveLineKey(input.fen, line.bestMove)) ?? line;
    merged.push(deepest);
    seen.add(line.bestMove);
  }

  for (const line of deepestByMove.values()) {
    if (!line.bestMove.startsWith(input.square)) continue;
    if (seen.has(line.bestMove)) continue;
    merged.push(line);
    seen.add(line.bestMove);
  }

  return merged;
}
