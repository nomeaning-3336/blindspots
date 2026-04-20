import { createHash } from "node:crypto";
import type {
  AnalysisMemoContext,
  AnalysisMemoSnapshot,
  MemoArrow,
  MemoColor,
  MemoEntry,
  MemoListFilters,
  MemoResult,
  MemoSortKey,
  MemoSquareHighlight,
} from "@/lib/memos/types";
import type { Json } from "@/lib/supabase/database";

const DEFAULT_MEMO_FILTERS: MemoListFilters = {
  search: "",
  dateFrom: null,
  dateTo: null,
  opening: "",
  result: "all",
  color: "all",
  tags: [],
  sort: "recently-updated",
  selectedGroupId: null,
  gameRef: null,
  limit: null,
};

function takeFirstValue(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeMemoText(value: unknown, maxLength = 4000) {
  const raw = typeof value === "string" ? value.replace(/\r\n?/g, "\n") : "";
  return raw.trim().slice(0, maxLength);
}

export function sanitizeMemoTag(value: unknown) {
  const normalized = collapseWhitespace(String(value || "").toLowerCase());
  if (!normalized) return "";
  return normalized.slice(0, 40);
}

export function normalizeMemoTags(value: unknown) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const candidate of rawValues) {
    const tag = sanitizeMemoTag(candidate);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }

  return tags.slice(0, 12);
}

export function normalizeMemoColor(value: unknown): MemoColor {
  return value === "white" || value === "black" ? value : null;
}

export function normalizeMemoResult(value: unknown): MemoResult {
  return value === "win" || value === "draw" || value === "loss" ? value : null;
}

export function normalizeMemoSort(value: unknown): MemoSortKey {
  return value === "newest" || value === "oldest" || value === "recently-updated"
    ? value
    : "recently-updated";
}

export function normalizeMemoDate(value: unknown) {
  const raw = takeFirstValue(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function asObjectArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [];
}

export function normalizeMemoArrows(value: unknown): MemoArrow[] {
  const arrows: MemoArrow[] = [];

  for (const entry of asObjectArray(value)) {
    const from = collapseWhitespace(String((entry as { from?: unknown }).from || ""));
    const to = collapseWhitespace(String((entry as { to?: unknown }).to || ""));
    const color = collapseWhitespace(String((entry as { color?: unknown }).color || ""));
    if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) continue;
    arrows.push({
      from,
      to,
      color: color || null,
    });
  }

  return arrows.slice(0, 24);
}

export function normalizeMemoHighlightedSquares(value: unknown): MemoSquareHighlight[] {
  const highlights: MemoSquareHighlight[] = [];

  for (const entry of asObjectArray(value)) {
    const square = collapseWhitespace(
      String((entry as { square?: unknown }).square || ""),
    );
    const color = collapseWhitespace(String((entry as { color?: unknown }).color || ""));
    if (!/^[a-h][1-8]$/.test(square)) continue;
    highlights.push({
      square,
      color: color || null,
    });
  }

  return highlights.slice(0, 24);
}

export function buildMemoGameId(sourceRef: string | null | undefined) {
  const normalized = collapseWhitespace(String(sourceRef || ""));
  if (!normalized) return null;

  const hash = createHash("sha1").update(normalized).digest("hex");
  const third = `5${hash.slice(13, 16)}`;
  const variantByte = (parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80;
  const fourth = `${variantByte.toString(16).padStart(2, "0")}${hash.slice(18, 20)}`;

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    third,
    fourth,
    hash.slice(20, 32),
  ].join("-");
}

export function buildMemoPrimaryDate(value: { playedAt: string | null; createdAt: string }) {
  return value.playedAt || value.createdAt;
}

export function buildDefaultMemoGroupTitle(context: AnalysisMemoContext | null) {
  if (!context) return "Position memo";
  if (context.titleHint) return context.titleHint;

  const opening = collapseWhitespace(context.openingName || "");
  const opponent = collapseWhitespace(context.opponent || "");
  const dateLabel = context.playedAt ? context.playedAt.slice(0, 10) : "";

  if (opening && opponent) return `${opening} vs ${opponent}`;
  if (opening) return opening;
  if (opponent && dateLabel) return `vs ${opponent} ${dateLabel}`;
  if (opponent) return `vs ${opponent}`;
  if (dateLabel) return `Memo ${dateLabel}`;

  return "Position memo";
}

export function normalizeMemoFilters(
  source: URLSearchParams | Record<string, unknown> | MemoListFilters | null | undefined,
): MemoListFilters {
  const read = (key: string) => {
    if (!source) return "";
    if (source instanceof URLSearchParams) return source.get(key) || "";
    return takeFirstValue((source as Record<string, unknown>)[key]);
  };

  const limitValue = Number.parseInt(read("limit"), 10);

  return {
    ...DEFAULT_MEMO_FILTERS,
    search: read("search").trim().slice(0, 120),
    dateFrom: normalizeMemoDate(read("dateFrom")),
    dateTo: normalizeMemoDate(read("dateTo")),
    opening: read("opening").trim().slice(0, 120),
    result: normalizeMemoResult(read("result")) ?? "all",
    color: normalizeMemoColor(read("color")) ?? "all",
    tags: normalizeMemoTags(read("tags")),
    sort: normalizeMemoSort(read("sort")),
    selectedGroupId: read("selectedGroupId").trim() || null,
    gameRef: read("gameRef").trim() || null,
    limit: Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : null,
  };
}

export function memoTagsToInputValue(tags: string[]) {
  return tags.join(", ");
}

export function normalizeAnalysisMemoContext(value: unknown): AnalysisMemoContext | null {
  if (!value || typeof value !== "object") return null;
  const context = value as Record<string, unknown>;

  return {
    sourceRef: takeFirstValue(context.sourceRef).trim() || null,
    sourceLabel: takeFirstValue(context.sourceLabel).trim() || null,
    openingName: takeFirstValue(context.openingName).trim() || null,
    eco: takeFirstValue(context.eco).trim() || null,
    color: normalizeMemoColor(context.color),
    result: normalizeMemoResult(context.result),
    opponent: takeFirstValue(context.opponent).trim() || null,
    playedAt: takeFirstValue(context.playedAt).trim() || null,
    titleHint: takeFirstValue(context.titleHint).trim() || null,
  };
}

export function normalizeAnalysisMemoSnapshot(value: unknown): AnalysisMemoSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  const fen = normalizeMemoText(snapshot.fen, 200);
  if (!fen) return null;

  const ply = Number.isFinite(snapshot.ply) ? Number(snapshot.ply) : null;
  const moveNumber = Number.isFinite(snapshot.moveNumber)
    ? Number(snapshot.moveNumber)
    : null;
  const orientation =
    snapshot.orientation === "white" || snapshot.orientation === "black"
      ? snapshot.orientation
      : null;

  return {
    fen,
    ply,
    moveNumber,
    turnColor: normalizeMemoColor(snapshot.turnColor),
    lastMoveSan: normalizeMemoText(snapshot.lastMoveSan, 32) || null,
    lastMoveUci: normalizeMemoText(snapshot.lastMoveUci, 12) || null,
    arrows: normalizeMemoArrows(snapshot.arrows),
    highlightedSquares: normalizeMemoHighlightedSquares(snapshot.highlightedSquares),
    orientation,
    context: normalizeAnalysisMemoContext(snapshot.context),
  };
}

export function jsonMemoTags(tags: string[]): Json {
  return tags;
}

export function jsonMemoArrows(arrows: MemoArrow[]): Json {
  return arrows.map((arrow) => ({
    from: arrow.from,
    to: arrow.to,
    color: arrow.color ?? undefined,
  }));
}

export function jsonMemoHighlightedSquares(squares: MemoSquareHighlight[]): Json {
  return squares.map((square) => ({
    square: square.square,
    color: square.color ?? undefined,
  }));
}

export function memoEntryMatchesTags(entry: Pick<MemoEntry, "tags"> | { tags: unknown }, tags: string[]) {
  if (!tags.length) return true;
  const normalizedTags = normalizeMemoTags(entry.tags);
  return tags.every((tag) => normalizedTags.includes(tag));
}
