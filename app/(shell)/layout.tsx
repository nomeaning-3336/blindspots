import type { ReactNode } from "react";
import Link from "next/link";
import { AppShellNav } from "@/components/app-shell-nav";
import { PageTransition } from "@/components/navigation/page-transition";
import { getOptionalAppUserId } from "@/lib/app-auth";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const userId = await getOptionalAppUserId();
  const isSignedIn = Boolean(userId);

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <div aria-hidden="true" className="app-ambient" />
      <header
        className="relative z-40 shrink-0 border-b border-[var(--app-border)] px-4 py-3 backdrop-blur-md md:px-7"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--app-panel-solid) 88%, transparent), color-mix(in srgb, var(--app-panel-solid) 62%, transparent))",
          boxShadow:
            "0 1px 0 color-mix(in srgb, var(--app-border-strong) 4%, transparent), 0 18px 40px -30px color-mix(in srgb, var(--app-bg) 90%, transparent)",
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <h1 className="flex items-center leading-none">
            <Link
              href="/"
              prefetch
              className="inline-flex items-center gap-3 leading-none transition hover:text-[var(--app-accent)]"
            >
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
            </Link>
          </h1>
          <AppShellNav isSignedIn={isSignedIn} />
        </div>
      </header>
      <main className="relative z-10 flex min-h-0 w-full flex-1 overflow-hidden px-4 pb-4 md:px-6">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
