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
    <div className="relative grid h-[100dvh] grid-rows-[56px_1fr] overflow-hidden bg-transparent">
      <div aria-hidden="true" className="app-ambient" />
      <Link
        href="/"
        prefetch={false}
        aria-label="Blindspots home"
        className="relative z-50 flex min-h-14 items-center gap-2.5 border-b border-[var(--app-border)] bg-[var(--app-bg)] px-5 text-sm font-semibold text-[var(--app-text)] transition hover:text-[var(--app-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--app-accent)] md:px-6"
      >
        <img src="/blindspots-logo.svg" width="24" height="24" alt="" className="shrink-0" />
        <span className="text-[15px] font-semibold">
          blindspots<span className="text-[var(--app-accent)]">.gg</span>
        </span>
      </Link>
      <main className="relative z-10 flex min-h-0 w-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}
