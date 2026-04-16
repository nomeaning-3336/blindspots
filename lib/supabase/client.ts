"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

let supabaseBrowserClient:
  | ReturnType<typeof createBrowserClient<Database>>
  | null = null;

export function getSupabaseBrowserClient() {
  if (supabaseBrowserClient) {
    return supabaseBrowserClient;
  }

  supabaseBrowserClient = createBrowserClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
  );

  return supabaseBrowserClient;
}
