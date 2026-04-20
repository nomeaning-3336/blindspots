import { NextResponse } from "next/server";
import { queryMemoAssistant } from "@/lib/memos/server";
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

  const record = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
  const question = typeof record.question === "string" ? record.question.trim() : "";

  if (!question) {
    return applyCookies(
      NextResponse.json({ error: "A question is required." }, { status: 400 }),
    );
  }

  try {
    const answer = await queryMemoAssistant(
      supabase,
      userId,
      question,
      record.filters && typeof record.filters === "object"
        ? (record.filters as Record<string, unknown>)
        : {},
    );
    return applyCookies(NextResponse.json(answer));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Memo assistant request failed.";
    return applyCookies(
      NextResponse.json({ error: message }, { status: 400 }),
    );
  }
}
