import { NextResponse } from "next/server";
import {
  deleteMemoGroup,
  updateMemoGroupTitle,
} from "@/lib/memos/server";
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

export async function PATCH(
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
    const group = await updateMemoGroupTitle(
      supabase,
      userId,
      groupId,
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).title
        : "",
    );
    return applyCookies(NextResponse.json({ group }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update memo group.";
    return applyCookies(
      NextResponse.json({ error: message }, { status: 400 }),
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  const { supabase, applyCookies, userId } = await requireRouteUser();
  if (!userId) {
    return applyCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  const { groupId } = await context.params;

  try {
    await deleteMemoGroup(supabase, userId, groupId);
    return applyCookies(NextResponse.json({ ok: true }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete memo group.";
    return applyCookies(
      NextResponse.json({ error: message }, { status: 400 }),
    );
  }
}
