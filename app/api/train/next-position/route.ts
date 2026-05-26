import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getNextColdPersonalTrainingCandidate } from "@/lib/training/cold-candidate-store";
import { getCurrentFillerCandidateForUser } from "@/lib/training/filler-progression";
import { validatePlayableTrainingFen } from "@/lib/training/position-validity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { filler, cursor: fillerCursor } =
    await getCurrentFillerCandidateForUser(userId);

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
