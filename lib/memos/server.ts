import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  answerMemoQuestion,
  buildMemoSuggestions,
  extractMemoQueryIntent,
} from "@/lib/memos/assistant";
import {
  buildDefaultMemoGroupTitle,
  buildMemoGameId,
  buildMemoPrimaryDate,
  jsonMemoArrows,
  jsonMemoHighlightedSquares,
  jsonMemoTags,
  memoEntryMatchesTags,
  normalizeAnalysisMemoSnapshot,
  normalizeMemoArrows,
  normalizeMemoColor,
  normalizeMemoFilters,
  normalizeMemoHighlightedSquares,
  normalizeMemoResult,
  normalizeMemoTags,
  normalizeMemoText,
} from "@/lib/memos/normalization";
import type {
  AnalysisMemoContext,
  AnalysisMemoSnapshot,
  MemoAssistantAnswer,
  MemoAssistantEntry,
  MemoEntry,
  MemoEntryRow,
  MemoGroupDetail,
  MemoGroupRow,
  MemoGroupSummary,
  MemoListFilters,
  MemoWorkspaceData,
} from "@/lib/memos/types";
import type { Database } from "@/lib/supabase/database";

type MemoClient = SupabaseClient<Database>;

interface MemoCreatePayload {
  title?: unknown;
  noteText?: unknown;
  tags?: unknown;
  snapshot?: unknown;
}

function groupTitleForRow(group: MemoGroupRow, context: AnalysisMemoContext | null) {
  return normalizeMemoText(group.title, 120) || buildDefaultMemoGroupTitle(context);
}

function mapMemoEntryRow(row: MemoEntryRow): MemoEntry {
  return {
    id: row.id,
    memoGroupId: row.memo_group_id,
    userId: row.user_id,
    fen: row.fen,
    ply: row.ply,
    turnColor: normalizeMemoColor(row.turn_color),
    lastMoveSan: row.last_move_san,
    lastMoveUci: row.last_move_uci,
    noteText: row.note_text,
    tags: normalizeMemoTags(row.tags),
    arrows: normalizeMemoArrows(row.arrows),
    highlightedSquares: normalizeMemoHighlightedSquares(row.highlighted_squares),
    orientation: row.orientation === "white" || row.orientation === "black" ? row.orientation : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMemoAssistantEntry(row: MemoEntryRow, group: MemoGroupRow): MemoAssistantEntry {
  return {
    id: row.id,
    groupId: row.memo_group_id,
    groupTitle: group.title,
    noteText: row.note_text,
    tags: normalizeMemoTags(row.tags),
    openingName: group.opening_name,
    eco: group.eco,
    color: normalizeMemoColor(group.color),
    result: normalizeMemoResult(group.result),
    opponent: group.opponent,
    playedAt: group.played_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildEntryExcerpt(noteText: string) {
  const compact = noteText.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length <= 120 ? compact : `${compact.slice(0, 117)}...`;
}

function sortGroups(groups: MemoGroupSummary[], sort: MemoListFilters["sort"]) {
  return [...groups].sort((left, right) => {
    if (sort === "recently-updated") {
      return right.updatedAt.localeCompare(left.updatedAt);
    }

    const leftDate = buildMemoPrimaryDate(left);
    const rightDate = buildMemoPrimaryDate(right);
    return sort === "oldest"
      ? leftDate.localeCompare(rightDate)
      : rightDate.localeCompare(leftDate);
  });
}

function applyDateFilter(groups: MemoGroupRow[], filters: MemoListFilters) {
  return groups.filter((group) => {
    const primaryDate = buildMemoPrimaryDate({
      playedAt: group.played_at,
      createdAt: group.created_at,
    });
    const primaryDay = primaryDate.slice(0, 10);

    if (filters.dateFrom && primaryDay < filters.dateFrom) return false;
    if (filters.dateTo && primaryDay > filters.dateTo) return false;
    return true;
  });
}

async function loadFacetData(supabase: MemoClient, userId: string) {
  const [groupsResult, entriesResult] = await Promise.all([
    supabase
      .from("memo_groups")
      .select("opening_name")
      .eq("user_id", userId)
      .not("opening_name", "is", null),
    supabase.from("memo_entries").select("tags").eq("user_id", userId),
  ]);

  if (groupsResult.error) {
    throw new Error(`Failed to load memo openings: ${groupsResult.error.message}`);
  }

  if (entriesResult.error) {
    throw new Error(`Failed to load memo tags: ${entriesResult.error.message}`);
  }

  const availableOpenings = Array.from(
    new Set(
      (groupsResult.data || [])
        .map((group) => normalizeMemoText(group.opening_name, 120))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const availableTags = Array.from(
    new Set((entriesResult.data || []).flatMap((entry) => normalizeMemoTags(entry.tags))),
  ).sort((left, right) => left.localeCompare(right));

  return {
    availableOpenings,
    availableTags,
  };
}

async function loadFilteredGroups(
  supabase: MemoClient,
  userId: string,
  filters: MemoListFilters,
) {
  let query = supabase.from("memo_groups").select("*").eq("user_id", userId);

  if (filters.opening) {
    query = query.ilike("opening_name", `%${filters.opening}%`);
  }

  if (filters.result !== "all") {
    query = query.eq("result", filters.result);
  }

  if (filters.color !== "all") {
    query = query.eq("color", filters.color);
  }

  if (filters.gameRef) {
    const gameId = buildMemoGameId(filters.gameRef);
    if (!gameId) return [];
    query = query.eq("game_id", gameId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load memo groups: ${error.message}`);
  }

  return applyDateFilter(data || [], filters);
}

async function loadEntryMatches(
  supabase: MemoClient,
  userId: string,
  filters: MemoListFilters,
) {
  if (!filters.search && !filters.tags.length) {
    return null;
  }

  let query = supabase
    .from("memo_entries")
    .select("memo_group_id, tags, note_text")
    .eq("user_id", userId);

  if (filters.search) {
    query = query.textSearch("note_text", filters.search, {
      config: "english",
      type: "websearch",
    });
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load memo search matches: ${error.message}`);
  }

  return new Set(
    (data || [])
      .filter((entry) => {
        if (!filters.tags.length) return true;
        return memoEntryMatchesTags({ tags: entry.tags }, filters.tags);
      })
      .map((entry) => entry.memo_group_id),
  );
}

async function loadEntriesForGroupIds(
  supabase: MemoClient,
  userId: string,
  groupIds: string[],
) {
  if (!groupIds.length) return [];

  const { data, error } = await supabase
    .from("memo_entries")
    .select("*")
    .eq("user_id", userId)
    .in("memo_group_id", groupIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load memo entries: ${error.message}`);
  }

  return data || [];
}

function summarizeGroups(groups: MemoGroupRow[], entries: MemoEntryRow[]) {
  const entriesByGroupId = new Map<string, MemoEntryRow[]>();
  for (const entry of entries) {
    const bucket = entriesByGroupId.get(entry.memo_group_id) || [];
    bucket.push(entry);
    entriesByGroupId.set(entry.memo_group_id, bucket);
  }

  return groups.map((group) => {
    const groupEntries = entriesByGroupId.get(group.id) || [];
    const latestEntry = groupEntries[groupEntries.length - 1] || null;
    const tags = Array.from(
      new Set(groupEntries.flatMap((entry) => normalizeMemoTags(entry.tags))),
    );

    return {
      id: group.id,
      userId: group.user_id,
      gameId: group.game_id,
      title: group.title,
      openingName: group.opening_name,
      eco: group.eco,
      color: normalizeMemoColor(group.color),
      result: normalizeMemoResult(group.result),
      opponent: group.opponent,
      playedAt: group.played_at,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
      entryCount: groupEntries.length,
      latestEntryId: latestEntry?.id || null,
      latestEntryExcerpt: latestEntry ? buildEntryExcerpt(latestEntry.note_text) : null,
      latestEntryCreatedAt: latestEntry?.created_at || null,
      tags,
    } satisfies MemoGroupSummary;
  });
}

function buildGroupDetail(
  group: MemoGroupRow,
  entries: MemoEntryRow[],
): MemoGroupDetail {
  const mappedEntries = entries.map(mapMemoEntryRow);
  const summary = summarizeGroups([group], entries)[0];

  return {
    ...summary,
    entries: mappedEntries,
  };
}

function sortEntriesForAssistant(entries: MemoAssistantEntry[], searchTerms: string[]) {
  if (!searchTerms.length) {
    return [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  return [...entries].sort((left, right) => {
    const leftCorpus = [
      left.groupTitle || "",
      left.noteText,
      left.tags.join(" "),
      left.openingName || "",
      left.opponent || "",
    ]
      .join(" ")
      .toLowerCase();
    const rightCorpus = [
      right.groupTitle || "",
      right.noteText,
      right.tags.join(" "),
      right.openingName || "",
      right.opponent || "",
    ]
      .join(" ")
      .toLowerCase();
    const leftScore = searchTerms.reduce(
      (score, term) => score + (leftCorpus.includes(term) ? 1 : 0),
      0,
    );
    const rightScore = searchTerms.reduce(
      (score, term) => score + (rightCorpus.includes(term) ? 1 : 0),
      0,
    );
    if (leftScore !== rightScore) return rightScore - leftScore;
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export async function getMemoWorkspaceData(
  supabase: MemoClient,
  userId: string,
  rawFilters: URLSearchParams | Record<string, unknown> | MemoListFilters | null | undefined,
): Promise<MemoWorkspaceData> {
  const filters = normalizeMemoFilters(
    rawFilters instanceof URLSearchParams || !rawFilters || "search" in rawFilters
      ? rawFilters
      : null,
  );
  const normalizedFilters =
    rawFilters && !(rawFilters instanceof URLSearchParams) && "sort" in rawFilters
      ? { ...filters, ...rawFilters }
      : filters;
  const [baseGroups, entryMatches, facets] = await Promise.all([
    loadFilteredGroups(supabase, userId, normalizedFilters),
    loadEntryMatches(supabase, userId, normalizedFilters),
    loadFacetData(supabase, userId),
  ]);

  const matchedGroups = entryMatches
    ? baseGroups.filter((group) => entryMatches.has(group.id))
    : baseGroups;
  const sortedRows = matchedGroups.sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at),
  );
  const limitedRows =
    normalizedFilters.limit && normalizedFilters.limit > 0
      ? sortedRows.slice(0, normalizedFilters.limit)
      : sortedRows;
  const groupIds = limitedRows.map((group) => group.id);
  const entries = await loadEntriesForGroupIds(supabase, userId, groupIds);
  const groupSummaries = sortGroups(summarizeGroups(limitedRows, entries), normalizedFilters.sort);

  const selectedGroupId =
    normalizedFilters.selectedGroupId &&
    groupSummaries.some((group) => group.id === normalizedFilters.selectedGroupId)
      ? normalizedFilters.selectedGroupId
      : groupSummaries[0]?.id || null;
  const selectedGroupRow = limitedRows.find((group) => group.id === selectedGroupId) || null;
  const selectedGroupEntries = entries.filter((entry) => entry.memo_group_id === selectedGroupId);
  const selectedGroup =
    selectedGroupRow && selectedGroupId
      ? buildGroupDetail(selectedGroupRow, selectedGroupEntries)
      : null;

  const assistantEntries = entries
    .map((entry) => {
      const group = limitedRows.find((candidate) => candidate.id === entry.memo_group_id);
      return group ? mapMemoAssistantEntry(entry, group) : null;
    })
    .filter((entry): entry is MemoAssistantEntry => Boolean(entry));

  return {
    filters: {
      ...normalizedFilters,
      selectedGroupId,
    },
    groups: groupSummaries,
    selectedGroup,
    suggestions: buildMemoSuggestions(
      sortEntriesForAssistant(assistantEntries, []).slice(0, 60),
    ),
    totalGroups: matchedGroups.length,
    availableOpenings: facets.availableOpenings,
    availableTags: facets.availableTags,
  };
}

export async function createMemoGroupWithEntry(
  supabase: MemoClient,
  userId: string,
  payload: MemoCreatePayload,
) {
  const snapshot = normalizeAnalysisMemoSnapshot(payload.snapshot);
  if (!snapshot) {
    throw new Error("A valid memo snapshot is required.");
  }

  const noteText = normalizeMemoText(payload.noteText);
  const tags = normalizeMemoTags(payload.tags);
  const context = snapshot.context;

  const groupInsert = {
    user_id: userId,
    game_id: buildMemoGameId(context?.sourceRef),
    title: normalizeMemoText(payload.title, 120) || buildDefaultMemoGroupTitle(context),
    opening_name: context?.openingName || null,
    eco: context?.eco || null,
    color: context?.color || null,
    result: context?.result || null,
    opponent: context?.opponent || null,
    played_at: context?.playedAt || null,
  };

  const { data: group, error: groupError } = await supabase
    .from("memo_groups")
    .insert(groupInsert)
    .select("*")
    .single();

  if (groupError) {
    throw new Error(`Failed to create memo group: ${groupError.message}`);
  }

  const { error: entryError } = await supabase.from("memo_entries").insert({
    memo_group_id: group.id,
    user_id: userId,
    fen: snapshot.fen,
    ply: snapshot.ply,
    turn_color: snapshot.turnColor,
    last_move_san: snapshot.lastMoveSan,
    last_move_uci: snapshot.lastMoveUci,
    note_text: noteText,
    tags: jsonMemoTags(tags),
    arrows: jsonMemoArrows(snapshot.arrows),
    highlighted_squares: jsonMemoHighlightedSquares(snapshot.highlightedSquares),
    orientation: snapshot.orientation,
  });

  if (entryError) {
    throw new Error(`Failed to create memo entry: ${entryError.message}`);
  }

  const entries = await loadEntriesForGroupIds(supabase, userId, [group.id]);
  return buildGroupDetail(group, entries);
}

export async function appendMemoEntryToGroup(
  supabase: MemoClient,
  userId: string,
  groupId: string,
  payload: MemoCreatePayload,
) {
  const snapshot = normalizeAnalysisMemoSnapshot(payload.snapshot);
  if (!snapshot) {
    throw new Error("A valid memo snapshot is required.");
  }

  const { data: group, error: groupError } = await supabase
    .from("memo_groups")
    .select("*")
    .eq("id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (groupError) {
    throw new Error(`Failed to load memo group: ${groupError.message}`);
  }

  if (!group) {
    throw new Error("Memo group not found.");
  }

  const { data: entry, error: entryError } = await supabase
    .from("memo_entries")
    .insert({
      memo_group_id: groupId,
      user_id: userId,
      fen: snapshot.fen,
      ply: snapshot.ply,
      turn_color: snapshot.turnColor,
      last_move_san: snapshot.lastMoveSan,
      last_move_uci: snapshot.lastMoveUci,
      note_text: normalizeMemoText(payload.noteText),
      tags: jsonMemoTags(normalizeMemoTags(payload.tags)),
      arrows: jsonMemoArrows(snapshot.arrows),
      highlighted_squares: jsonMemoHighlightedSquares(snapshot.highlightedSquares),
      orientation: snapshot.orientation,
    })
    .select("*")
    .single();

  if (entryError) {
    throw new Error(`Failed to append memo entry: ${entryError.message}`);
  }

  return mapMemoEntryRow(entry);
}

export async function updateMemoGroupTitle(
  supabase: MemoClient,
  userId: string,
  groupId: string,
  title: unknown,
) {
  const normalizedTitle = normalizeMemoText(title, 120);
  const { data, error } = await supabase
    .from("memo_groups")
    .update({
      title: normalizedTitle || null,
    })
    .eq("id", groupId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update memo group: ${error.message}`);
  }

  const entries = await loadEntriesForGroupIds(supabase, userId, [groupId]);
  return buildGroupDetail(data, entries);
}

export async function deleteMemoGroup(
  supabase: MemoClient,
  userId: string,
  groupId: string,
) {
  const { error } = await supabase
    .from("memo_groups")
    .delete()
    .eq("id", groupId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to delete memo group: ${error.message}`);
  }
}

export async function updateMemoEntry(
  supabase: MemoClient,
  userId: string,
  entryId: string,
  payload: { noteText?: unknown; tags?: unknown },
) {
  const { data, error } = await supabase
    .from("memo_entries")
    .update({
      note_text: normalizeMemoText(payload.noteText),
      tags: jsonMemoTags(normalizeMemoTags(payload.tags)),
    })
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update memo entry: ${error.message}`);
  }

  return mapMemoEntryRow(data);
}

export async function deleteMemoEntry(
  supabase: MemoClient,
  userId: string,
  entryId: string,
) {
  const { data: entry, error: loadError } = await supabase
    .from("memo_entries")
    .select("id, memo_group_id")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load memo entry: ${loadError.message}`);
  }

  if (!entry) {
    throw new Error("Memo entry not found.");
  }

  const { error } = await supabase
    .from("memo_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to delete memo entry: ${error.message}`);
  }

  const remainingEntries = await loadEntriesForGroupIds(supabase, userId, [entry.memo_group_id]);
  if (!remainingEntries.length) {
    await deleteMemoGroup(supabase, userId, entry.memo_group_id);
    return {
      deletedGroupId: entry.memo_group_id,
    };
  }

  return {
    deletedGroupId: null,
  };
}

export async function queryMemoAssistant(
  supabase: MemoClient,
  userId: string,
  question: string,
  rawFilters: URLSearchParams | Record<string, unknown> | MemoListFilters | null | undefined,
): Promise<MemoAssistantAnswer> {
  const baseFilters = normalizeMemoFilters(
    rawFilters instanceof URLSearchParams || !rawFilters || "search" in rawFilters
      ? rawFilters
      : null,
  );
  const filters =
    rawFilters && !(rawFilters instanceof URLSearchParams) && "sort" in rawFilters
      ? { ...baseFilters, ...rawFilters }
      : baseFilters;
  const intent = extractMemoQueryIntent(question);
  const mergedFilters: MemoListFilters = {
    ...filters,
    result: filters.result === "all" && intent.result ? intent.result : filters.result,
    color: filters.color === "all" && intent.color ? intent.color : filters.color,
    dateFrom:
      !filters.dateFrom && intent.lookbackDays
        ? new Date(Date.now() - intent.lookbackDays * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
        : filters.dateFrom,
  };

  const groups = await loadFilteredGroups(supabase, userId, mergedFilters);
  const groupIds = groups.map((group) => group.id);
  const entryRows = await loadEntriesForGroupIds(supabase, userId, groupIds);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const assistantEntries = sortEntriesForAssistant(
    entryRows
      .map((entry) => {
        const group = groupById.get(entry.memo_group_id);
        if (!group) return null;
        return mapMemoAssistantEntry(entry, group);
      })
      .filter((entry): entry is MemoAssistantEntry => Boolean(entry)),
    intent.searchTerms,
  ).slice(0, 80);

  return answerMemoQuestion(question, assistantEntries);
}
