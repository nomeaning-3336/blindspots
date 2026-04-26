import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

const PROTECTED_ROUTES = ["/train", "/performance", "/account"];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname === "/analyze" ||
    pathname === "/analyze/" ||
    pathname === "/app/analyze" ||
    pathname === "/app/analyze/"
  ) {
    const targetUrl = new URL(`/analysis${search}`, request.url);
    return NextResponse.redirect(targetUrl, 302);
  }
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const targetPath =
      pathname === "/app" ? "/analysis" : pathname.slice(4) || "/analysis";
    const targetUrl = new URL(`${targetPath}${search}`, request.url);
    return NextResponse.redirect(targetUrl, 308);
  }

  // Protected route check: redirect unauthenticated users before shell renders
  if (isProtectedRoute(pathname)) {
    const authCookies = request.cookies.getAll().filter(
      (cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"),
    );

    if (authCookies.length > 0) {
      // Verify the session is still valid
      let sessionValid = false;
      let response = NextResponse.next({ request });

      const supabase = createServerClient<Database>(
        getSupabaseUrl(),
        getSupabaseAnonKey(),
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => {
                request.cookies.set(name, value);
              });
              response = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) => {
                response.cookies.set(name, value, options);
              });
            },
          },
        },
      );

      const { data, error } = await supabase.auth.getUser();
      const msg = error?.message?.toLowerCase() ?? "";
      const isInvalidSession =
        !data?.user ||
        msg.includes("user not found") ||
        msg.includes("user from sub claim in jwt does not exist") ||
        msg.includes("user does not exist") ||
        msg.includes("auth session missing");

      if (isInvalidSession) {
        // Clear stale auth cookies
        const staleCookies = request.cookies.getAll().filter(
          (cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"),
        );
        staleCookies.forEach((cookie) => {
          response.cookies.delete(cookie.name);
        });

        const redirectUrl = new URL(`/sign-in?next=${encodeURIComponent(pathname + search)}`, request.url);
        return NextResponse.redirect(redirectUrl, 302);
      }

      return response;
    }

    // No auth cookies — redirect immediately
    const redirectUrl = new URL(`/sign-in?next=${encodeURIComponent(pathname + search)}`, request.url);
    return NextResponse.redirect(redirectUrl, 302);
  }

  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
