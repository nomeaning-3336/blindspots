import { NextResponse } from "next/server";
import {
  normalizeGameType,
  normalizeRangeDays,
  type PerformanceGameType,
  type PerformanceRangeDays,
} from "@/lib/chess-profile";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { updatePerformancePreferencesForUser } from "@/lib/chess-profile-store";

interface PerformancePreferencesPayload {
  rangeDays?: PerformanceRangeDays | string;
  gameType?: PerformanceGameType | string;
}

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PerformancePreferencesPayload;

  try {
    payload = (await request.json()) as PerformancePreferencesPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rangeDays = normalizeRangeDays(
    typeof payload.rangeDays === "number"
      ? String(payload.rangeDays)
      : payload.rangeDays,
  );
  const gameType = normalizeGameType(payload.gameType);

  try {
    await updatePerformancePreferencesForUser(userId, { rangeDays, gameType });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
