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
      <SignOutIcon />
      Sign Out
    </button>
  );
}

function SignOutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 19V5a2 2 0 0 0-2-2h-5" />
      <path d="M14 21h5a2 2 0 0 0 2-2" />
    </svg>
  );
}
