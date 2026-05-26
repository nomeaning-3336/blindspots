import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getDeterministicFillerCandidate } from "@/lib/training/filler-catalog";
import { getNextColdPersonalTrainingCandidate } from "@/lib/training/cold-candidate-store";
import { validatePlayableTrainingFen } from "@/lib/training/position-validity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPA_FILLER_SEED = "spa-v1";

type NextPositionResponse = {
  fen: string;
  queueSource: "review" | "active" | "filler";
  candidateType: "personal" | "filler";
  sourceType?: string;
  trainingItemId?: string;
  tags?: string[];
  openingName?: string;
  eco?: string;
  reviewCount?: number;
  fillerId?: string;
  fillerOrigin?: "random_position" | "lichess_puzzle";
  fillerCursor?: number;
  selectedPhase?: string;
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

export async function GET() {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const personalCandidate = await getNextColdPersonalTrainingCandidate(userId);

  if (personalCandidate) {
    const playable = validatePlayableTrainingFen(personalCandidate.fen);

    if (!playable.ok) {
      return NextResponse.json(
        { error: "Selected personal training position is not playable." },
        { status: 409 },
      );
    }

    const response: NextPositionResponse = {
      fen: personalCandidate.fen,
      queueSource: personalCandidate.queueSource,
      candidateType: "personal",
      sourceType: personalCandidate.sourceType,
      trainingItemId: personalCandidate.trainingItemId,
      tags: personalCandidate.tags,
      openingName: personalCandidate.openingName,
      eco: personalCandidate.eco,
      reviewCount: personalCandidate.reviewCount,
    };

    return NextResponse.json(response);
  }

  const fillerCursor = await getNextFillerCursor(userId);
  const filler = await getDeterministicFillerCandidate({
    userId,
    seed: SPA_FILLER_SEED,
    cursor: fillerCursor,
  });

  if (!filler) {
    return NextResponse.json(
      { error: "No training position is currently available." },
      { status: 404 },
    );
  }

  const playable = validatePlayableTrainingFen(filler.fen);

  if (!playable.ok) {
    return NextResponse.json(
      { error: "Selected filler training position is not playable." },
      { status: 409 },
    );
  }

  const response: NextPositionResponse = {
    fen: filler.fen,
    queueSource: "filler",
    candidateType: "filler",
    sourceType: "filler_catalog",
    fillerId: filler.id,
    fillerOrigin: filler.origin,
    fillerCursor,
    selectedPhase: filler.phase,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("[next-position]", {
      candidateType: response.candidateType,
      queueSource: response.queueSource,
      fillerOrigin: response.fillerOrigin,
      fillerCursor,
    });
  }

  return NextResponse.json(response);
}
