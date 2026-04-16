"use client";

import { useState } from "react";

const ANALYZE_SETTINGS_STORAGE_KEY = "chess-something:settings";

const forcedHoverStyle = {
  borderColor: "var(--app-nav-hover-bg)",
  background: "var(--app-nav-hover-bg)",
  color: "var(--app-nav-hover-text)",
} as const;

export function AuthSignOutButton({ className = "" }: { className?: string }) {
  const [isForcedHover, setIsForcedHover] = useState(false);

  function handleSignOut() {
    try {
      window.localStorage.removeItem(ANALYZE_SETTINGS_STORAGE_KEY);
    } catch {}

    window.location.assign("/auth/sign-out");
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
        handleSignOut();
      }}
    >
      Sign Out
    </button>
  );
}
