import { cookies } from "next/headers";
import { APP_THEMES, DEFAULT_APP_THEME, normalizeAppTheme, type AppTheme } from "@/lib/app-theme";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const THEME_COOKIE_NAME = "chessview-theme";

export async function getUserAppTheme() {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    // Check for theme cookie for unauthenticated users
    try {
      const cookieStore = await cookies();
      const themeCookie = cookieStore.get(THEME_COOKIE_NAME);
      if (themeCookie?.value && APP_THEMES.some(t => t.id === themeCookie.value)) {
        return themeCookie.value as AppTheme;
      }
    } catch {
      // Cookies not available, ignore
    }
    return null;
  }

  return getUserAppThemeForUser(userId);
}

export async function getUserAppThemeForUser(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_app_preferences")
    .select("theme")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load app theme from Supabase", error);
    return DEFAULT_APP_THEME;
  }

  return normalizeAppTheme(data?.theme);
}

export async function upsertUserAppThemeForUser(userId: string, theme: AppTheme) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("user_app_preferences").upsert(
    {
      user_id: userId,
      theme,
    },
    {
      onConflict: "user_id",
    },
  );

  if (error) {
    throw new Error(`Failed to save app theme: ${error.message}`);
  }
}
