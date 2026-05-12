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

  const { data: row, error } = await supabase
    .from("user_mistakes")
    .update({
      status: "retired",
      retired_at: now,
      next_review_at: null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Archive failed: ${error.message}` }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "Mistake not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id });
}
