import { NextResponse } from "next/server";
import { normalizeAnalyzePreferences } from "@/lib/analyze-preferences";
import { upsertAnalyzePreferencesForUser } from "@/lib/analyze-preferences-store";
import { getOptionalAppUserId } from "@/lib/app-auth";

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const preferences = normalizeAnalyzePreferences(
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null,
  );

  try {
    await upsertAnalyzePreferencesForUser(userId, preferences);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save analyze preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
