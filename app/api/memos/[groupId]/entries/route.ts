import { NextResponse } from "next/server";
import { appendMemoEntryToGroup } from "@/lib/memos/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

async function requireRouteUser() {
  const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    supabase,
    applyCookies,
    userId: user?.id || null,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  const { supabase, applyCookies, userId } = await requireRouteUser();
  if (!userId) {
    return applyCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  const { groupId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return applyCookies(
      NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    );
  }

  try {
    const entry = await appendMemoEntryToGroup(
      supabase,
      userId,
      groupId,
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
    );
    return applyCookies(NextResponse.json({ entry }, { status: 201 }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to append memo entry.";
    return applyCookies(
      NextResponse.json({ error: message }, { status: 400 }),
    );
  }
}
