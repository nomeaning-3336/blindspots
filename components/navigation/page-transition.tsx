"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type TransitionPhase = "idle" | "leaving" | "entering";

const LEAVE_TIMEOUT_MS = 420;
const ENTER_TIMEOUT_MS = 620;

function routeFlavor(pathname: string | null) {
  if (!pathname) return "dashboard";
  if (pathname.startsWith("/analysis") || pathname.startsWith("/analyze")) return "analysis";
  if (pathname.startsWith("/train")) return "train";
  if (pathname.startsWith("/blindspots")) return "blindspots";
  if (pathname.startsWith("/history") || pathname.startsWith("/performance")) return "history";
  if (pathname.startsWith("/account")) return "account";
  return "dashboard";
}

function isModifiedClick(event: MouseEvent<HTMLElement>) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const previousPathname = useRef(pathname);
  const leaveTimer = useRef<number | null>(null);
  const enterTimer = useRef<number | null>(null);

  const flavor = useMemo(() => routeFlavor(pathname), [pathname]);
  const isActive = phase !== "idle";

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    setPhase("entering");
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    enterTimer.current = window.setTimeout(() => setPhase("idle"), ENTER_TIMEOUT_MS);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
    };
  }, []);

  function handleClickCapture(event: MouseEvent<HTMLElement>) {
    if (isModifiedClick(event)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.target && anchor.target !== "_self") return;

    const nextUrl = new URL(anchor.href, window.location.href);
    if (nextUrl.origin !== window.location.origin) return;
    if (nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search) return;

    setPhase("leaving");
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setPhase("idle"), LEAVE_TIMEOUT_MS);
  }

  return (
    <div
      className="route-transition-shell"
      data-route-phase={phase}
      data-route-flavor={flavor}
      onClickCapture={handleClickCapture}
    >
      <div className="route-transition-content" key={pathname}>
        {children}
      </div>
      <div className="blindspot-wipe" data-active={isActive ? "true" : "false"} aria-hidden="true">
        <div className="blindspot-wipe__grid" />
        <div className="blindspot-wipe__square blindspot-wipe__square--a" />
        <div className="blindspot-wipe__square blindspot-wipe__square--b" />
        <div className="blindspot-wipe__square blindspot-wipe__square--c" />
        <div className="blindspot-wipe__scan" />
      </div>
    </div>
  );
}
