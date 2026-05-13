import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeleteNotePayload = {
  moveKey: string;
};

export async function DELETE(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { moveKey?: string; decisionFen?: string; positionId?: string } | null;
  if (!payload?.moveKey || typeof payload.moveKey !== "string") {
    return NextResponse.json({ error: "Missing required field: moveKey" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("training_move_notes" as any)
    .delete()
    .eq("user_id", userId)
    .eq("move_key", payload.moveKey);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete note: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
