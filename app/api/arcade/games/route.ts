import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { createArcadeGameForUser } from "@/lib/arcade-game-store";
import { isArcadeVariantKey } from "@/lib/arcade";

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in to create an Arcade game." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { variantKey?: unknown }
    | null;
  const variantKey = body?.variantKey;

  if (!isArcadeVariantKey(variantKey)) {
    return NextResponse.json({ error: "Invalid Arcade variant." }, { status: 400 });
  }

  try {
    const game = await createArcadeGameForUser(userId, variantKey);
    return NextResponse.json({ id: game.id, variantKey: game.variantKey });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create an Arcade game.",
      },
      { status: 500 },
    );
  }
}
