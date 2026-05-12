import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESTORABLE_STATUSES = new Set(["active", "review", "learning", "mastered", "retired"]);

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

  let body: {
    status?: string;
    nextReviewAt?: string | null;
    retiredAt?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const status = body.status;
  if (!status || !RESTORABLE_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid restore status." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: row, error } = await supabase
    .from("user_mistakes")
    .update({
      status: status as any,
      next_review_at: body.nextReviewAt ?? null,
      retired_at: status === "retired" ? body.retiredAt ?? now : null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "deleted")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[dashboard] undo delete position failed", {
      id,
      userId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: `Undo failed: ${error.message}` }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "Deleted mistake not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id });
}
