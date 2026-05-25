import { NextResponse } from "next/server";
import { DEFAULT_APP_ROUTE, getOptionalAppUserId, normalizeNextPath } from "@/lib/app-auth";
import { normalizeAppTheme } from "@/lib/app-theme";
import { upsertUserAppThemeForUser } from "@/lib/app-theme-store";

const THEME_COOKIE_NAME = "chessview-theme";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function isJsonRequest(request: Request) {
  return request.headers.get("x-chessview-fetch") === "1";
}

function setThemeCookie(response: NextResponse, theme: string) {
  response.cookies.set(THEME_COOKIE_NAME, theme, {
    path: "/",
    sameSite: "lax",
    maxAge: THEME_COOKIE_MAX_AGE,
  });

  return response;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const requestedNext = formData.get("next");
  const nextPath =
    typeof requestedNext === "string"
      ? normalizeNextPath(requestedNext)
      : "/account";
  const userId = await getOptionalAppUserId();

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
    return setThemeCookie(NextResponse.json({ ok: true, theme }), theme);
  }

  return setThemeCookie(
    redirectWithStatus(
      request,
      nextPath,
      `status=theme-saved&theme=${encodeURIComponent(theme)}`,
    ),
    theme,
  );
}

function redirectWithStatus(request: Request, nextPath: string, query: string) {
  const response = NextResponse.redirect(new URL(DEFAULT_APP_ROUTE, request.url), 303);
  response.headers.set("Location", `${nextPath}?${query}`);
  return response;
}
