import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

function isPrefetchRequest(request: NextRequest) {
  const h = request.headers;
  return (
    h.get("next-router-prefetch") === "1" ||
    h.get("purpose") === "prefetch" ||
    h.get("sec-purpose") === "prefetch" ||
    h.get("x-purpose") === "prefetch"
  );
}

function hasSupabaseAuthCookie(request: NextRequest) {
  for (const cookie of request.cookies.getAll()) {
    // Supabase SSR cookies start with `sb-` and end with `-auth-token`.
    if (cookie.name.startsWith("sb-") && cookie.name.includes("auth-token")) {
      return true;
    }
  }
  return false;
}

export async function updateSupabaseSession(request: NextRequest) {
  // Fast path: prefetch + anonymous requests never need a session refresh.
  // Skips the ~1.5s Supabase auth network roundtrip that was running on
  // every prefetch-driven navigation.
  if (isPrefetchRequest(request) || !hasSupabaseAuthCookie(request)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({
    request,
  });

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

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}
