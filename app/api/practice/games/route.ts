import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import {
  createPracticeGameForUser,
  parsePracticeCreateInput,
} from "@/lib/practice-game-store";

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to create a practice game." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePracticeCreateInput(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid practice setup." },
      { status: 400 },
    );
  }

  try {
    const game = await createPracticeGameForUser({
      userId,
      engineType: parsed.engineType,
      presetKey: parsed.presetKey,
      incrementSeconds: parsed.incrementSeconds,
      opponentElo: parsed.opponentElo,
    });
    return NextResponse.json({ id: game.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create a practice game.",
      },
      { status: 500 },
    );
  }
}
