"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const ANALYZE_SETTINGS_STORAGE_KEY = "chess-something:settings";

const forcedHoverStyle = {
  borderColor: "var(--app-nav-hover-bg)",
  background: "var(--app-nav-hover-bg)",
  color: "var(--app-nav-hover-text)",
} as const;

export function AuthSignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [isForcedHover, setIsForcedHover] = useState(false);

  async function handleSignOut() {
    try {
      window.localStorage.removeItem(ANALYZE_SETTINGS_STORAGE_KEY);
    } catch {}

    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      className={className}
      style={isForcedHover ? forcedHoverStyle : undefined}
      onMouseEnter={() => setIsForcedHover(true)}
      onMouseLeave={() => setIsForcedHover(false)}
      onFocus={() => setIsForcedHover(true)}
      onBlur={() => setIsForcedHover(false)}
      onClick={() => {
        void handleSignOut();
      }}
    >
      Sign Out
    </button>
  );
}
