import type { ReactNode } from "react";
import Link from "next/link";

export function ProtectedAppShell({
  children,
  isSignedIn: _isSignedIn,
}: Readonly<{
  children: ReactNode;
  isSignedIn: boolean;
}>) {
  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <div aria-hidden="true" className="app-ambient" />
      <Link
        href="/landing"
        prefetch={false}
        aria-label="Blindspots home"
        className="fixed left-3 top-3 z-50 inline-flex min-h-12 items-center gap-2.5 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-3.5 text-sm font-semibold text-[var(--app-text)] shadow-[var(--app-elevation-1)] transition hover:border-[var(--app-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)] md:left-5 md:top-5"
      >
        <svg
          width="22"
          height="22"
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
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="12" cy="12" r="3.2" fill="var(--app-accent)" />
          <path
            d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <span className="hidden font-serif text-[15px] sm:inline">
          Blindspots<span className="text-[var(--app-accent)]">.gg</span>
        </span>
      </Link>
      <main className="relative z-10 flex min-h-0 w-full flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
