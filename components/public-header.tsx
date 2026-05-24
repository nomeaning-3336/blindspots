"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function LogoMark() {
  return (
    <span className="inline-flex items-center gap-3 leading-none">
      <img src="/blindspots-logo.svg" width="24" height="24" alt="" className="shrink-0" />
      <span className="text-sm font-semibold leading-none text-[var(--app-text)]">
        Blindspots<span className="text-[var(--app-accent)]">.gg</span>
      </span>
    </span>
  );
}

function HeaderLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex min-h-9 items-center justify-center px-4 py-2 text-xs",
        primary
          ? "app-brutal-button"
          : "app-brutal-button",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

export function PublicHeaderClient({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();
  const signUpHref = `/sign-up?next=${encodeURIComponent("/")}`;
  const isAuthPage = pathname === "/sign-in" || pathname === "/auth/email";

  return (
    <header
      className="relative z-40 shrink-0 border-b border-[var(--app-border)] px-4 py-3 backdrop-blur md:px-7"
      style={{ background: "color-mix(in srgb, var(--app-panel-solid) 78%, transparent)" }}
    >
      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-center leading-none">
          <Link
            href="/"
            className="inline-flex items-center leading-none transition hover:text-[var(--app-accent)]"
          >
            <LogoMark />
          </Link>
        </h1>
        <div className="app-shell-nav flex min-h-9 flex-wrap items-center justify-end gap-2">
          {isSignedIn ? (
            <HeaderLink href="/" primary>
              Open app
            </HeaderLink>
          ) : isAuthPage ? (
            <div className="min-h-9 w-28" />
          ) : (
            <>
              <Link
                href="/blog"
                className="app-brutal-button-secondary inline-flex min-h-9 items-center justify-center px-3 py-2 text-xs font-semibold text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
              >
                Blog
              </Link>
              <HeaderLink href={signUpHref} primary>
                Find your blindspots
              </HeaderLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
