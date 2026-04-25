import { NextResponse } from "next/server";
import {
  normalizeGameType,
  normalizeRangeDays,
  type PerformanceGameType,
  type PerformanceRangeDays,
} from "@/lib/chess-profile";
import { getOptionalAppUserId } from "@/lib/app-auth";

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

  return NextResponse.json({ ok: true, rangeDays, gameType });
}
