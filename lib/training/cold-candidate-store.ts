import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { validatePlayableTrainingFen } from "./position-validity";
import type { UserMistakeRow } from "./mistake-store";

export type PersonalQueueSource = "review" | "active";

export type ColdPersonalTrainingCandidate = {
  mistakeId: string;
  fen: string;
  queueSource: PersonalQueueSource;
  sourceType: string;
  tags?: string[];
  openingName?: string;
  eco?: string;
  reviewCount: number;
};

const MAX_CANDIDATES_TO_SCAN = 20;

function normalizeThemeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const tags = value.filter((item): item is string => typeof item === "string");
  return tags.length > 0 ? tags : undefined;
}

function buildColdCandidate(
  row: UserMistakeRow,
  queueSource: PersonalQueueSource,
): ColdPersonalTrainingCandidate | null {
  const fen =
    typeof row.decision_fen === "string" && row.decision_fen.length > 0
      ? row.decision_fen
      : row.starting_fen;

  if (!fen || !validatePlayableTrainingFen(fen).ok) {
    return null;
  }

  return {
    mistakeId: row.id,
    fen,
    queueSource,
    sourceType: row.source_type,
    tags: normalizeThemeTags(row.theme_tags),
    openingName: row.opening_name ?? undefined,
    eco: row.eco ?? undefined,
    reviewCount: row.review_count ?? 0,
  };
}

export async function getNextColdPersonalTrainingCandidate(
  userId: string,
  now: Date = new Date(),
): Promise<ColdPersonalTrainingCandidate | null> {
  const supabase = getSupabaseAdminClient();
  const nowIso = now.toISOString();

  const { data: reviewRows, error: reviewError } = await supabase
    .from("user_mistakes" as any)
    .select("*")
    .eq("user_id", userId)
    .eq("status", "review")
    .is("retired_at", null)
    .is("mastered_at", null)
    .lte("next_review_at", nowIso)
    .order("next_review_at", { ascending: true })
    .order("fail_count", { ascending: false })
    .order("cp_loss", { ascending: false, nullsFirst: false })
    .limit(MAX_CANDIDATES_TO_SCAN);

  if (reviewError) {
    throw new Error(`Failed to select due review position: ${reviewError.message}`);
  }

  for (const row of (reviewRows ?? []) as unknown as UserMistakeRow[]) {
    const candidate = buildColdCandidate(row, "review");
    if (candidate) return candidate;
  }

  const { data: activeRows, error: activeError } = await supabase
    .from("user_mistakes" as any)
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("retired_at", null)
    .is("mastered_at", null)
    .in("source_type", ["own_game", "imported_pgn", "app_training"])
    .lte("next_review_at", nowIso)
    .order("next_review_at", { ascending: true })
    .order("cp_loss", { ascending: false, nullsFirst: false })
    .order("first_ingested_at", { ascending: false })
    .limit(MAX_CANDIDATES_TO_SCAN);

  if (activeError) {
    throw new Error(`Failed to select active personal position: ${activeError.message}`);
  }

  for (const row of (activeRows ?? []) as unknown as UserMistakeRow[]) {
    const candidate = buildColdCandidate(row, "active");
    if (candidate) return candidate;
  }

  return null;
}
