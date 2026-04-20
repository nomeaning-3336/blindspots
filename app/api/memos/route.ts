import { NextResponse } from "next/server";
import { normalizeMemoFilters } from "@/lib/memos/normalization";
import {
  createMemoGroupWithEntry,
  getMemoWorkspaceData,
} from "@/lib/memos/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

async function requireRouteUser() {
  const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase,
      applyCookies,
      userId: null,
    };
  }

  return {
    supabase,
    applyCookies,
    userId: user.id,
  };
}

export async function GET(request: Request) {
  const { supabase, applyCookies, userId } = await requireRouteUser();

  if (!userId) {
    return applyCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  try {
    const url = new URL(request.url);
    const data = await getMemoWorkspaceData(
      supabase,
      userId,
      normalizeMemoFilters(url.searchParams),
    );
    return applyCookies(NextResponse.json(data));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load memos.";
    return applyCookies(
      NextResponse.json({ error: message }, { status: 500 }),
    );
  }
}

export async function POST(request: Request) {
  const { supabase, applyCookies, userId } = await requireRouteUser();

  if (!userId) {
    return applyCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return applyCookies(
      NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    );
  }

  try {
    const group = await createMemoGroupWithEntry(
      supabase,
      userId,
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {},
    );
    return applyCookies(NextResponse.json({ group }, { status: 201 }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create memo group.";
    return applyCookies(
      NextResponse.json({ error: message }, { status: 400 }),
    );
  }
}
