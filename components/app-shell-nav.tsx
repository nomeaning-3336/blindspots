"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthSignOutButton } from "@/components/auth-sign-out-button";

const ANALYZE_ASSET_VERSION = "2026-04-25-nav-pause-v1";
const analyzePrefetchLinks = [
  {
    rel: "preconnect",
    href: "https://cdnjs.cloudflare.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "prefetch",
    as: "style",
    href: `/analyze/standalone.css?v=${encodeURIComponent(ANALYZE_ASSET_VERSION)}`,
  },
  {
    rel: "prefetch",
    as: "script",
    href: `/analyze/standalone.js?v=${encodeURIComponent(ANALYZE_ASSET_VERSION)}`,
  },
  {
    rel: "prefetch",
    as: "script",
    href: "https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js",
    crossOrigin: "anonymous",
  },
] as const;

const authenticatedAppLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/analysis", label: "Analysis" },
  { href: "/train", label: "Train" },
  { href: "/performance", label: "Performance" },
  { href: "/account", label: "Account" },
];

const publicAppLinks = [
  { href: "/analysis", label: "Analysis" },
];

function linkClassName(isActive: boolean) {
  return [
    "inline-flex min-h-9 items-center justify-center rounded border px-4 py-2 text-xs font-bold uppercase transition",
    isActive
      ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-text)]"
      : "border-[var(--app-border)] bg-transparent text-[var(--app-text)]",
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
    <Link
      href={href}
      prefetch
      className={linkClassName(isActive)}
      style={isForcedHover ? forcedHoverStyle : undefined}
      onMouseEnter={() => setIsForcedHover(true)}
      onMouseLeave={() => setIsForcedHover(false)}
      onFocus={() => setIsForcedHover(true)}
      onBlur={() => setIsForcedHover(false)}
    >
      {label}
    </Link>
  );
}

function AppShellSignOutButton() {
  return (
    <AuthSignOutButton
      className="inline-flex min-h-9 items-center justify-center rounded border border-[var(--app-border)] bg-transparent px-4 py-2 text-[10px] font-bold uppercase text-[var(--app-text)] transition"
    />
  );
}

function AppShellSignInLink({ nextPath }: { nextPath: string }) {
  const [isForcedHover, setIsForcedHover] = useState(false);

  return (
    <Link
      href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
      prefetch
      className="inline-flex min-h-9 items-center justify-center rounded border border-[var(--app-accent)] bg-[var(--app-accent)] px-4 py-2 text-xs font-bold uppercase !text-black transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
      style={isForcedHover ? forcedHoverStyle : undefined}
      onMouseEnter={() => setIsForcedHover(true)}
      onMouseLeave={() => setIsForcedHover(false)}
      onFocus={() => setIsForcedHover(true)}
      onBlur={() => setIsForcedHover(false)}
    >
      Sign In
    </Link>
  );
}

function prefetchAnalyzeAssets() {
  for (const link of analyzePrefetchLinks) {
    const existing = document.querySelector<HTMLLinkElement>(
      `link[rel="${link.rel}"][href="${link.href}"]`,
    );
    if (existing) continue;

    const element = document.createElement("link");
    element.rel = link.rel;
    element.href = link.href;
    if ("as" in link) element.as = link.as;
    if ("crossOrigin" in link) element.crossOrigin = link.crossOrigin;
    document.head.appendChild(element);
  }
}

export function AppShellNav({
  className = "",
  isSignedIn = false,
}: {
  className?: string;
  isSignedIn?: boolean;
}) {
  const pathname = usePathname();
  const nextPath =
    pathname &&
    (pathname === "/" ||
      pathname.startsWith("/train") ||
      pathname.startsWith("/analysis") ||
      pathname.startsWith("/performance") ||
      pathname.startsWith("/account"))
      ? pathname
      : "/train";
  const visibleLinks = isSignedIn ? authenticatedAppLinks : publicAppLinks;

  useEffect(() => {
    const scheduleIdle = window.requestIdleCallback ?? window.setTimeout;
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const idleId = scheduleIdle(prefetchAnalyzeAssets, { timeout: 1500 });

    return () => cancelIdle(idleId);
  }, []);

  return (
    <div
      data-testid="app-shell-nav"
      className={[
        "app-shell-nav flex flex-wrap items-center justify-end gap-2 md:gap-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <nav className="flex flex-wrap items-center gap-2">
        {visibleLinks.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <AppShellLink
              key={link.href}
              href={link.href}
              label={link.label}
              isActive={isActive}
            />
          );
        })}
      </nav>
      {isSignedIn && (
        <div data-testid="nav-authenticated">
          <AppShellSignOutButton />
        </div>
      )}
      {!isSignedIn && (
        <div data-testid="nav-unauthenticated">
          <AppShellSignInLink nextPath={nextPath} />
        </div>
      )}
    </div>
  );
}
