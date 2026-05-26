import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  getDeterministicFillerCandidate,
  type FillerCatalogItem,
} from "./filler-catalog";

const SPA_FILLER_SEED = "spa-v1";

export type CurrentFillerCandidate = {
  filler: FillerCatalogItem | null;
  cursor: number;
};

async function getNextFillerCursor(userId: string): Promise<number> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("user_blindspot_profile" as any)
    .select("next_filler_cursor")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load filler progression: ${error.message}`);
  }

  if (!data) {
    return 0;
  }

  const cursor = (data as { next_filler_cursor?: unknown }).next_filler_cursor;

  return typeof cursor === "number" &&
    Number.isSafeInteger(cursor) &&
    cursor >= 0
    ? cursor
    : 0;
}

export async function getCurrentFillerCandidateForUser(
  userId: string,
): Promise<CurrentFillerCandidate> {
  const cursor = await getNextFillerCursor(userId);
  const filler = await getDeterministicFillerCandidate({
    userId,
    seed: SPA_FILLER_SEED,
    cursor,
  });

  return {
    filler,
    cursor,
  };
}
