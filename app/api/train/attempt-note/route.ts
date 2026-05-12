import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizeDecisionFen, buildMoveKey } from "@/lib/training/mistake-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    decisionFen?: unknown;
    moveUci?: unknown;
    note?: unknown;
  } | null;

  const decisionFen = typeof payload?.decisionFen === "string" ? payload.decisionFen : "";
  const moveUci = typeof payload?.moveUci === "string" ? payload.moveUci : "";
  const noteText = typeof payload?.note === "string" ? payload.note : "";

  if (!decisionFen || !moveUci) {
    return NextResponse.json({ error: "Missing decisionFen or moveUci" }, { status: 400 });
  }

  const canonicalFen = normalizeDecisionFen(decisionFen);
  const moveKey = buildMoveKey(canonicalFen, moveUci);

  const supabase = getSupabaseAdminClient();

  // Verify the attempt row exists
  const { data: existing } = await supabase
    .from("user_mistake_attempts" as any)
    .select("id")
    .eq("user_id", userId)
    .eq("decision_fen", canonicalFen)
    .eq("move_uci", moveUci)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "No matching attempt entry" }, { status: 404 });
  }

  // Upsert into existing training_move_notes table
  const { error } = await supabase.from("training_move_notes" as any).upsert(
    {
      user_id: userId,
      move_key: moveKey,
      decision_fen: canonicalFen,
      move_uci: moveUci,
      note_text: noteText,
    },
    { onConflict: "user_id, move_key" },
  );

  if (error) {
    return NextResponse.json({ error: `Failed to save note: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
