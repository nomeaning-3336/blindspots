import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CHESS_PROFILE_COOKIE } from "@/lib/chess-profile";
import { normalizeNextPath } from "@/lib/app-auth";
import { deleteLinkedChessProfileForUser } from "@/lib/chess-profile-store";

export async function POST(request: Request) {
  const formData = await request.formData();
  const requestedNext = formData.get("next");
  const nextPath =
    typeof requestedNext === "string"
      ? normalizeNextPath(requestedNext)
      : "/account";
  const { userId } = await auth();

  const cookieStore = await cookies();

  if (!userId) {
    return NextResponse.redirect(
      new URL(`/sign-in?next=${encodeURIComponent(nextPath)}`, request.url),
      303,
    );
  }

  try {
    await deleteLinkedChessProfileForUser(userId);
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
