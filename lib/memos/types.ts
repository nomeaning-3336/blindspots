import type { Database } from "@/lib/supabase/database";

export type MemoGroupRow = Database["public"]["Tables"]["memo_groups"]["Row"];
export type MemoEntryRow = Database["public"]["Tables"]["memo_entries"]["Row"];

export type MemoColor = "white" | "black" | null;
export type MemoResult = "win" | "draw" | "loss" | null;
export type MemoSortKey = "newest" | "oldest" | "recently-updated";

export interface MemoArrow {
  from: string;
  to: string;
  color?: string | null;
}

export interface MemoSquareHighlight {
  square: string;
  color?: string | null;
}

export interface AnalysisMemoContext {
  sourceRef: string | null;
  sourceLabel: string | null;
  openingName: string | null;
  eco: string | null;
  color: MemoColor;
  result: MemoResult;
  opponent: string | null;
  playedAt: string | null;
  titleHint: string | null;
}

export interface AnalysisMemoSnapshot {
  fen: string;
  ply: number | null;
  moveNumber: number | null;
  turnColor: MemoColor;
  lastMoveSan: string | null;
  lastMoveUci: string | null;
  arrows: MemoArrow[];
  highlightedSquares: MemoSquareHighlight[];
  orientation: "white" | "black" | null;
  context: AnalysisMemoContext | null;
}

export interface MemoEntry {
  id: string;
  memoGroupId: string;
  userId: string;
  fen: string;
  ply: number | null;
  turnColor: MemoColor;
  lastMoveSan: string | null;
  lastMoveUci: string | null;
  noteText: string;
  tags: string[];
  arrows: MemoArrow[];
  highlightedSquares: MemoSquareHighlight[];
  orientation: "white" | "black" | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoGroupSummary {
  id: string;
  userId: string;
  gameId: string | null;
  title: string | null;
  openingName: string | null;
  eco: string | null;
  color: MemoColor;
  result: MemoResult;
  opponent: string | null;
  playedAt: string | null;
  createdAt: string;
  updatedAt: string;
  entryCount: number;
  latestEntryId: string | null;
  latestEntryExcerpt: string | null;
  latestEntryCreatedAt: string | null;
  tags: string[];
}

export interface MemoGroupDetail extends MemoGroupSummary {
  entries: MemoEntry[];
}

export interface MemoListFilters {
  search: string;
  dateFrom: string | null;
  dateTo: string | null;
  opening: string;
  result: "all" | NonNullable<MemoResult>;
  color: "all" | NonNullable<MemoColor>;
  tags: string[];
  sort: MemoSortKey;
  selectedGroupId: string | null;
  gameRef: string | null;
  limit: number | null;
}

export interface MemoWorkspaceData {
  filters: MemoListFilters;
  groups: MemoGroupSummary[];
  selectedGroup: MemoGroupDetail | null;
  suggestions: string[];
  totalGroups: number;
  availableOpenings: string[];
  availableTags: string[];
}

export interface MemoAssistantEntry {
  id: string;
  groupId: string;
  groupTitle: string | null;
  noteText: string;
  tags: string[];
  openingName: string | null;
  eco: string | null;
  color: MemoColor;
  result: MemoResult;
  opponent: string | null;
  playedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoAssistantEvidence {
  entryId: string;
  groupId: string;
  groupTitle: string | null;
  excerpt: string;
  playedAt: string | null;
  openingName: string | null;
  tags: string[];
}

export interface MemoAssistantAnswer {
  answer: string;
  sparse: boolean;
  usedEntryCount: number;
  usedGroupCount: number;
  appliedFilters: string[];
  evidence: MemoAssistantEvidence[];
}
