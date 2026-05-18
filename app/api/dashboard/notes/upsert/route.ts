import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizeDecisionFen } from "@/lib/training/mistake-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    decisionFen?: unknown;
    noteText?: unknown;
  } | null;

  const decisionFen = typeof payload?.decisionFen === "string" ? payload.decisionFen : "";
  const noteText = typeof payload?.noteText === "string" ? payload.noteText : "";

  if (!decisionFen) {
    return NextResponse.json({ error: "Missing decisionFen" }, { status: 400 });
  }

  if (!noteText.trim()) {
    return NextResponse.json({ error: "Missing noteText" }, { status: 400 });
  }

  const canonicalFen = normalizeDecisionFen(decisionFen);
  const moveKey = `position:${canonicalFen}`;

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("training_move_notes" as any).upsert(
    {
      user_id: userId,
      move_key: moveKey,
      decision_fen: canonicalFen,
      move_uci: "",
      move_san: null,
      note_text: noteText.trim(),
      classification: null,
      eval_before_cp: null,
      eval_after_cp: null,
    },
    { onConflict: "user_id, move_key" },
  );

  if (error) {
    return NextResponse.json({ error: `Save failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    moveKey,
  });
}
