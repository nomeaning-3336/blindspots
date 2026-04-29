"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShellNav } from "@/components/app-shell-nav";

function LogoMark() {
  return (
    <span className="inline-flex items-center gap-3 leading-none">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="2"
          y="2"
          width="20"
          height="20"
          rx="3"
          stroke="var(--app-text)"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="12" r="3.2" fill="var(--app-accent)" />
        <path
          d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3"
          stroke="var(--app-text)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-sm font-bold uppercase leading-none text-[var(--app-text)]">
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
        "inline-flex min-h-9 items-center justify-center rounded border px-4 py-2 text-xs font-bold uppercase transition",
        primary
          ? "border-[var(--app-accent)] bg-[var(--app-accent)] !text-black"
          : "border-[var(--app-border)] bg-transparent text-[var(--app-text)]",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

export function PublicHeaderClient({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();
  const nextPath =
    pathname && pathname !== "/" ? pathname : "/train";
  const signUpHref = `/sign-up?next=${encodeURIComponent("/train")}`;
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
            <AppShellNav isSignedIn />
          ) : isAuthPage ? (
            <div className="min-h-9 w-28" />
          ) : (
            <HeaderLink href={signUpHref} primary>
              Find your blindspots
            </HeaderLink>
          )}
        </div>
      </div>
    </header>
  );
}
