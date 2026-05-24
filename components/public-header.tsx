"use client";

import Link from "next/link";

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

export function PublicHeaderClient({
  hideAuthAction = false,
}: {
  hideAuthAction?: boolean;
}) {
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
          {hideAuthAction ? null : (
            <Link
              href="/sign-in?next=%2F"
              className="app-brutal-button inline-flex min-h-9 items-center justify-center px-4 py-2 text-xs"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}