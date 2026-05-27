import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import {
  ActiveSessionError,
  abandonActiveTrainingSession,
  createActiveTrainingSession,
  getActiveTrainingSession,
  updateActiveTrainingSessionMoves,
} from "@/lib/training/active-session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handleRouteError(error: unknown) {
  if (error instanceof ActiveSessionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  throw error;
}

export async function GET() {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const session = await getActiveTrainingSession(userId);
    return NextResponse.json({ session });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  try {
    const session = await createActiveTrainingSession({
      userId,
      candidateType: payload?.candidateType,
      queueSource: payload?.queueSource,
      trainingItemId: payload?.trainingItemId,
      fillerId: payload?.fillerId,
      fillerOrigin: payload?.fillerOrigin,
      firstMoveUci: payload?.firstMoveUci,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  try {
    await abandonActiveTrainingSession({
      userId,
      sessionId: payload?.sessionId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  try {
    const session = await updateActiveTrainingSessionMoves({
      userId,
      sessionId: payload?.sessionId,
      moveUcis: payload?.moveUcis,
    });

    return NextResponse.json({ session });
  } catch (error) {
    return handleRouteError(error);
  }
}


