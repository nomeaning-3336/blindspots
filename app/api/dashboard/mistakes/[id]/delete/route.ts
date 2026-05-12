import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!id) {
    return NextResponse.json({ error: "Missing mistake id." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  // Before deleting, capture the existing status and scheduling fields so the
  // client can undo by restoring them.
  const { data: existing, error: existingError } = await supabase
    .from("user_mistakes")
    .select("id,status,next_review_at,retired_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    console.error("[dashboard] load position before delete failed", {
      id,
      userId,
      message: existingError.message,
      code: existingError.code,
      details: existingError.details,
      hint: existingError.hint,
    });
    return NextResponse.json({ error: `Delete failed: ${existingError.message}` }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Mistake not found." }, { status: 404 });
  }

  // Soft delete — status='deleted' hides the row while preserving FK targets in training_sessions.
  const { error } = await supabase
    .from("user_mistakes")
    .update({
      status: "deleted",
      retired_at: now,
      next_review_at: null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dashboard] delete position failed", {
      id,
      userId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: `Delete failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id,
    undo: {
      status: existing.status,
      nextReviewAt: existing.next_review_at,
      retiredAt: existing.retired_at,
    },
  });
}
