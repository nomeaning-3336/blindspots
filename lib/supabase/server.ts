import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase/env";
import { isSupabaseSessionCookie } from "@/lib/supabase/auth-cookies";

let supabaseAdminClient: ReturnType<typeof createClient<Database>> | null = null;

interface PendingCookie {
  name: string;
  value: string;
  options?: CookieOptions;
}

export function getSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  supabaseAdminClient = createClient(
    getSupabaseUrl(),
    getSupabaseServiceRoleKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return supabaseAdminClient;
}

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {}
      },
    },
  });
}

export async function createSupabaseRouteHandlerClient() {
  const cookieStore = await cookies();
  const pendingCookies: PendingCookie[] = [];

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          pendingCookies.push(...cookiesToSet);

          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    },
  );

  return {
    supabase,
    applyCookies(response: Response & { cookies: { set: typeof cookieStore.set } }) {
      pendingCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });

      return response;
    },
  };
}

export async function getSupabaseServerUser(): Promise<User | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    const message = error.message.toLowerCase();
    const isMissing = message.includes("auth session missing");
    const isDeleted =
      message.includes("user not found") ||
      message.includes("user from sub claim in jwt does not exist") ||
      message.includes("user does not exist");

    if (process.env.NODE_ENV !== "production") {
      console.log("[auth] getUser error — missing:", isMissing, "deleted:", isDeleted, "message:", error.message);
    }

    if (isMissing) {
      return null;
    }

    if (isDeleted) {
      try {
        const cookieStore = await cookies();
        for (const cookie of cookieStore.getAll()) {
          if (isSupabaseSessionCookie(cookie.name)) {
            cookieStore.delete(cookie.name);
          }
        }
      } catch { /* cookie cleanup best-effort */ }

      return null;
    }

    console.error("Failed to load Supabase auth user", error);
    return null;
  }

  return data.user;
}

export async function getSupabaseServerUserId() {
  const user = await getSupabaseServerUser();
  return user?.id ?? null;
}
