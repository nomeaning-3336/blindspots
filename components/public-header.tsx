"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthSignOutButton } from "@/components/auth-sign-out-button";

const appLinks = [
  { href: "/analysis", label: "Analysis" },
  { href: "/arcade", label: "Arcade" },
  { href: "/performance", label: "Statistics" },
  { href: "/account", label: "Settings" },
];

function linkClassName(isActive: boolean) {
  return [
    "border-2 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] transition",
    isActive
      ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-contrast)]"
      : "border-[color:var(--app-border)] text-[var(--app-text)]",
  ].join(" ");
}

const forcedHoverStyle = {
  borderColor: "var(--app-nav-hover-bg)",
  background: "var(--app-nav-hover-bg)",
  color: "var(--app-nav-hover-text)",
} as const;

function AppShellLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  const [isForcedHover, setIsForcedHover] = useState(false);

  return (
    <a
      href={href}
      className={linkClassName(isActive)}
      style={isForcedHover ? forcedHoverStyle : undefined}
      onMouseEnter={() => setIsForcedHover(true)}
      onMouseLeave={() => setIsForcedHover(false)}
      onFocus={() => setIsForcedHover(true)}
      onBlur={() => setIsForcedHover(false)}
    >
      {label}
    </a>
  );
}

function AppShellSignOutButton() {
  return (
    <AuthSignOutButton
      className="border-2 border-[color:var(--app-border)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--app-text)] transition"
    />
  );
}

function AppShellSignInLink({ nextPath }: { nextPath: string }) {
  const [isForcedHover, setIsForcedHover] = useState(false);

  return (
    <a
      href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
      className="rounded-none border-2 border-[var(--app-accent)] bg-[var(--app-accent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-black transition hover:border-white hover:bg-white hover:text-black"
      style={isForcedHover ? forcedHoverStyle : undefined}
      onMouseEnter={() => setIsForcedHover(true)}
      onMouseLeave={() => setIsForcedHover(false)}
      onFocus={() => setIsForcedHover(true)}
      onBlur={() => setIsForcedHover(false)}
    >
      Sign In
    </a>
  );
}

export function PublicHeaderClient({
  isSignedIn,
}: {
  isSignedIn: boolean;
}) {
  const pathname = usePathname();
  const nextPath =
    pathname &&
    (pathname.startsWith("/analysis") ||
      pathname.startsWith("/arcade") ||
      pathname.startsWith("/performance") ||
      pathname.startsWith("/account"))
      ? pathname
      : "/analysis";

  return (
    <header className="relative z-40 shrink-0 bg-transparent px-4 pt-4 md:px-6">
      <div
        className="w-full px-5 py-4"
        style={{
          border: "2px solid var(--app-shell-border)",
          background: "var(--app-panel-solid)",
          boxShadow: "4px 4px 0 var(--app-shell-shadow)",
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <h1>
            <Link
              href="/"
              className="font-bold uppercase tracking-[0.24em] text-[var(--app-text)] transition hover:text-[var(--app-accent)]"
              style={{ fontSize: "20px", lineHeight: 1 }}
            >
              chessview.ai
            </Link>
          </h1>
          <nav className="app-shell-nav flex flex-wrap items-center justify-end gap-2 md:gap-3">
            {appLinks.map((link) => {
              const isActive =
                pathname === link.href || pathname.startsWith(`${link.href}/`);

              return (
                <AppShellLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  isActive={isActive}
                />
              );
            })}
            {isSignedIn && <AppShellSignOutButton />}
            {!isSignedIn && <AppShellSignInLink nextPath={nextPath} />}
          </nav>
        </div>
      </div>
    </header>
  );
}
