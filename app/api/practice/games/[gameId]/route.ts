import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import {
  deletePracticeGameForUser,
  getPracticeGameForUser,
  savePracticeGameStateForUser,
} from "@/lib/practice-game-store";
import { normalizePracticeGameState } from "@/lib/practice";

export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to load this practice game." },
      { status: 401 },
    );
  }

  const { gameId } = await context.params;

  try {
    const game = await getPracticeGameForUser(userId, gameId);
    if (!game) {
      return NextResponse.json({ error: "Practice game not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: game.id,
      status: game.status,
      currentFen: game.currentFen,
      lastPlayedAt: game.lastPlayedAt,
      state: game.state,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load practice game.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to save this practice game." },
      { status: 401 },
    );
  }

  const { gameId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { state?: unknown }
    | null;
  const state = normalizePracticeGameState(body?.state);

  if (!state) {
    return NextResponse.json(
      { error: "Practice state is invalid." },
      { status: 400 },
    );
  }

  try {
    const saved = await savePracticeGameStateForUser({
      userId,
      gameId,
      state,
    });

    if (!saved) {
      return NextResponse.json({ error: "Practice game not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, savedAt: saved.lastPlayedAt });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save practice game.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to delete this practice game." },
      { status: 401 },
    );
  }

  const { gameId } = await context.params;

  try {
    const deleted = await deletePracticeGameForUser(userId, gameId);
    if (!deleted) {
      return NextResponse.json({ error: "Practice game not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete practice game.",
      },
      { status: 500 },
    );
  }
}
