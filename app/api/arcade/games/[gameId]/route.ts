import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import {
  getArcadeGameForUser,
  saveArcadeGameStateForUser,
} from "@/lib/arcade-game-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in to load this Arcade game." }, { status: 401 });
  }

  const { gameId } = await context.params;

  try {
    const game = await getArcadeGameForUser(userId, gameId);
    if (!game) {
      return NextResponse.json({ error: "Arcade game not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: game.id,
      variantKey: game.variantKey,
      status: game.status,
      currentFen: game.currentFen,
      lastPlayedAt: game.lastPlayedAt,
      state: game.state,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load Arcade game.",
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
    return NextResponse.json({ error: "Sign in to save this Arcade game." }, { status: 401 });
  }

  const { gameId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        state?: unknown;
        status?: unknown;
      }
    | null;

  const state =
    body?.state && typeof body.state === "object" && !Array.isArray(body.state)
      ? (body.state as Record<string, unknown>)
      : null;
  const status = body?.status === "finished" ? "finished" : "active";

  try {
    const saved = await saveArcadeGameStateForUser({
      userId,
      gameId,
      state,
      status,
    });

    if (!saved) {
      return NextResponse.json({ error: "Arcade game not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, savedAt: saved.lastPlayedAt });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save Arcade game.",
      },
      { status: 500 },
    );
  }
}
