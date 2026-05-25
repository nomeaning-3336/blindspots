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
  } | null;

  const decisionFen =
    typeof payload?.decisionFen === "string" ? payload.decisionFen : "";

  if (!decisionFen) {
    return NextResponse.json({ error: "Missing decisionFen" }, { status: 400 });
  }

  const canonicalFen = normalizeDecisionFen(decisionFen);
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("user_training_items" as any)
    .update({ status: "deleted" })
    .eq("user_id", userId)
    .eq("starting_fen", canonicalFen);

  if (error) {
    return NextResponse.json(
      { error: `Remove failed: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
