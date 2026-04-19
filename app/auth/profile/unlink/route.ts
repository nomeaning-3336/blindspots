import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  CHESS_PROFILE_COOKIE,
  isValidChessUsername,
  normalizeChessProvider,
  normalizeChessUsername,
} from "@/lib/chess-profile";
import { getOptionalAppUserId, normalizeNextPath } from "@/lib/app-auth";
import { deleteLinkedChessProfileForUser } from "@/lib/chess-profile-store";

export async function POST(request: Request) {
  const formData = await request.formData();
  const requestedNext = formData.get("next");
  const nextPath =
    typeof requestedNext === "string"
      ? normalizeNextPath(requestedNext)
      : "/account";
  const userId = await getOptionalAppUserId();

  const cookieStore = await cookies();

  if (!userId) {
    return NextResponse.redirect(
      new URL(`/sign-in?next=${encodeURIComponent(nextPath)}`, request.url),
      303,
    );
  }

  const provider = normalizeChessProvider(
    typeof formData.get("provider") === "string"
      ? String(formData.get("provider"))
      : null,
  );
  const username = provider
    ? normalizeChessUsername(
        provider,
        typeof formData.get("username") === "string"
          ? String(formData.get("username"))
          : null,
      )
    : "";

  if (!provider || !isValidChessUsername(username)) {
    const response = NextResponse.redirect(new URL("/", request.url), 303);
    response.headers.set("Location", `${nextPath}?error=invalid-username`);
    return response;
  }

  try {
    await deleteLinkedChessProfileForUser(userId, { provider, username });
  } catch (error) {
    console.error("Failed to remove linked chess profile", error);
    const response = NextResponse.redirect(new URL("/", request.url), 303);
    response.headers.set("Location", `${nextPath}?error=storage-unavailable`);
    return response;
  }

  cookieStore.set(CHESS_PROFILE_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    maxAge: 0,
  });

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.headers.set("Location", `${nextPath}?status=unlinked`);
  return response;
}
