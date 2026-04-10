import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  CHESS_PROFILE_COOKIE,
  getChessProviderLabel,
  isValidChessUsername,
  normalizeChessProvider,
  normalizeChessUsername,
} from "@/lib/chess-profile";
import { DEFAULT_APP_ROUTE, normalizeNextPath } from "@/lib/app-auth";
import { upsertLinkedChessProfileForUser } from "@/lib/chess-profile-store";

function isJsonRequest(request: Request) {
  return request.headers.get("x-chessview-fetch") === "1";
}

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
    if (isJsonRequest(request)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
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

  if (!provider) {
    if (isJsonRequest(request)) {
      return NextResponse.json({ ok: false, error: "invalid-provider" }, { status: 400 });
    }
    return redirectWithStatus(request, nextPath, "error=invalid-provider");
  }

  const username = normalizeChessUsername(
    provider,
    typeof formData.get("username") === "string"
      ? String(formData.get("username"))
      : null,
  );

  if (!isValidChessUsername(username)) {
    if (isJsonRequest(request)) {
      return NextResponse.json({ ok: false, error: "invalid-username" }, { status: 400 });
    }
    return redirectWithStatus(request, nextPath, "error=invalid-username");
  }

  const resolvedUsername = await resolvePublicUsername(provider, username);

  if (!resolvedUsername) {
    if (isJsonRequest(request)) {
      return NextResponse.json({ ok: false, error: "profile-not-found" }, { status: 404 });
    }
    return redirectWithStatus(request, nextPath, "error=profile-not-found");
  }

  try {
    await upsertLinkedChessProfileForUser(userId, {
      provider,
      username: resolvedUsername,
      linkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to persist linked chess profile", error);
    if (isJsonRequest(request)) {
      return NextResponse.json({ ok: false, error: "storage-unavailable" }, { status: 500 });
    }
    return redirectWithStatus(request, nextPath, "error=storage-unavailable");
  }

  cookieStore.set(CHESS_PROFILE_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    maxAge: 0,
  });

  if (isJsonRequest(request)) {
    return NextResponse.json({
      ok: true,
      provider,
      username: resolvedUsername,
    });
  }

  return redirectWithStatus(
    request,
    nextPath,
    `status=linked&provider=${encodeURIComponent(getChessProviderLabel(provider))}`,
  );
}

async function resolvePublicUsername(provider: "chesscom" | "lichess", username: string) {
  if (provider === "chesscom") {
    const response = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(username)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "ChessviewLocalDev/1.0",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as { username?: string };
    return payload.username ?? username;
  }

  const response = await fetch(
    `https://lichess.org/api/user/${encodeURIComponent(username)}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "ChessviewLocalDev/1.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as { username?: string };
  return payload.username ?? username;
}

function redirectWithStatus(request: Request, nextPath: string, query: string) {
  const response = NextResponse.redirect(new URL(DEFAULT_APP_ROUTE, request.url), 303);
  response.headers.set("Location", `${nextPath}?${query}`);
  return response;
}
