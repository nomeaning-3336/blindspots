import { NextResponse } from "next/server";
import { deleteMemoEntry, updateMemoEntry } from "@/lib/memos/server";
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
  context: { params: Promise<{ entryId: string }> },
) {
  const { supabase, applyCookies, userId } = await requireRouteUser();
  if (!userId) {
    return applyCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  const { entryId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return applyCookies(
      NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    );
  }

  try {
    const record = payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
    const entry = await updateMemoEntry(supabase, userId, entryId, {
      noteText: record.noteText,
      tags: record.tags,
    });
    return applyCookies(NextResponse.json({ entry }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update memo entry.";
    return applyCookies(
      NextResponse.json({ error: message }, { status: 400 }),
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ entryId: string }> },
) {
  const { supabase, applyCookies, userId } = await requireRouteUser();
  if (!userId) {
    return applyCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  const { entryId } = await context.params;

  try {
    const result = await deleteMemoEntry(supabase, userId, entryId);
    return applyCookies(NextResponse.json(result));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete memo entry.";
    return applyCookies(
      NextResponse.json({ error: message }, { status: 400 }),
    );
  }
}
