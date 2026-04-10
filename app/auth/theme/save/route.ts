import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { DEFAULT_APP_ROUTE, normalizeNextPath } from "@/lib/app-auth";
import { normalizeAppTheme } from "@/lib/app-theme";
import { upsertUserAppThemeForUser } from "@/lib/app-theme-store";

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

  if (!userId) {
    if (isJsonRequest(request)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(
      new URL(`/sign-in?next=${encodeURIComponent(nextPath)}`, request.url),
      303,
    );
  }

  const theme = normalizeAppTheme(
    typeof formData.get("theme") === "string" ? formData.get("theme") : null,
  );

  try {
    await upsertUserAppThemeForUser(userId, theme);
  } catch (error) {
    console.error("Failed to save app theme", error);
    if (isJsonRequest(request)) {
      return NextResponse.json(
        { ok: false, error: "theme-storage-unavailable" },
        { status: 500 },
      );
    }
    return redirectWithStatus(request, nextPath, "error=theme-storage-unavailable");
  }

  if (isJsonRequest(request)) {
    return NextResponse.json({ ok: true, theme });
  }

  return redirectWithStatus(
    request,
    nextPath,
    `status=theme-saved&theme=${encodeURIComponent(theme)}`,
  );
}

function redirectWithStatus(request: Request, nextPath: string, query: string) {
  const response = NextResponse.redirect(new URL(DEFAULT_APP_ROUTE, request.url), 303);
  response.headers.set("Location", `${nextPath}?${query}`);
  return response;
}
