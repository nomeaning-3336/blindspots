// @ts-nocheck — clone tables not yet in generated Supabase types
import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("clone_games")
    .update({
      state: "abandoned",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("state", "playing");

  if (error) {
    return NextResponse.json({ error: "Failed to abandon game" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
