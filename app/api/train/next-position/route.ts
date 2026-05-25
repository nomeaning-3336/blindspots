import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getNextColdPersonalTrainingCandidate } from "@/lib/training/cold-candidate-store";
import {
  getDeterministicFillerCandidate,
  type FillerOrigin,
} from "@/lib/training/filler-catalog";
import { validatePlayableTrainingFen } from "@/lib/training/position-validity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NextPositionResponse = {
  fen?: string;
  queueSource?: "review" | "active" | "filler";
  candidateType?: "personal" | "filler";
  sourceType?: string;
  trainingItemId?: string;
  fillerId?: string;
  fillerOrigin?: FillerOrigin;
  fillerCursor?: number;
  selectedPhase?: string;
  tags?: string[];
  openingName?: string;
  eco?: string;
  reviewCount?: number;
  error?: string;
  debug?: Record<string, unknown>;
};

export async function GET(request: Request) {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const personalCandidate = await getNextColdPersonalTrainingCandidate(userId, new Date());

  if (personalCandidate) {
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

    if (process.env.NODE_ENV !== "production") {
      response.debug = {
        selector: "personal",
        queueSource: personalCandidate.queueSource,
        sourceType: personalCandidate.sourceType,
        trainingItemId: personalCandidate.trainingItemId,
      };
    }

    return NextResponse.json(response);
  }

  const requestUrl = new URL(request.url);
  const fillerSeed = normalizeFillerSeed(requestUrl.searchParams.get("fillerSeed"));
  const fillerCursor = normalizeFillerCursor(requestUrl.searchParams.get("fillerCursor"));
  const filler = await getDeterministicFillerCandidate({
    userId,
    seed: fillerSeed,
    cursor: fillerCursor,
  });

  if (!filler || !validatePlayableTrainingFen(filler.fen).ok) {
    return NextResponse.json(
      { error: "No playable training positions available." },
      { status: 404 },
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
    response.debug = {
      selector: "filler_catalog",
      fillerId: filler.id,
      fillerOrigin: filler.origin,
      fillerCursor,
      selectedPhase: filler.phase,
    };
  }

  return NextResponse.json(response);
}

function normalizeFillerSeed(value: string | null): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : "default";
}

function normalizeFillerCursor(value: string | null): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return 0;
  }

  return Math.min(parsed, 1_000_000_000);
}


