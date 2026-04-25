"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

type TransitionPhase = "idle" | "leaving" | "loading" | "entering";

const LEAVE_FADE_MS = 360;
const LEAVE_TIMEOUT_MS = 2500;
const ENTER_TIMEOUT_MS = 420;
const SPINNER_DELAY_MS = 520;

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function shouldSkipTransition(pathname: string) {
  return pathname.startsWith("/auth/") || pathname.startsWith("/api/");
}

export function PageTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<TransitionPhase>("entering");
  const [showSpinner, setShowSpinner] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousPathname = useRef(pathname);
  const sawRouteLoading = useRef(false);
  const navigationTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const enterTimer = useRef<number | null>(null);
  const spinnerTimer = useRef<number | null>(null);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    setPhase("entering");
    setShowSpinner(false);
    if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    if (spinnerTimer.current) window.clearTimeout(spinnerTimer.current);
    enterTimer.current = window.setTimeout(() => setPhase("idle"), ENTER_TIMEOUT_MS);
  }, [pathname]);

  useEffect(() => {
    enterTimer.current = window.setTimeout(() => setPhase("idle"), ENTER_TIMEOUT_MS);

    return () => {
      if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
      if (spinnerTimer.current) window.clearTimeout(spinnerTimer.current);
    };
  }, []);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const root = element;

    function restartEnterTransition() {
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
      if (spinnerTimer.current) window.clearTimeout(spinnerTimer.current);
      setShowSpinner(false);
      setPhase("entering");
      enterTimer.current = window.setTimeout(() => setPhase("idle"), ENTER_TIMEOUT_MS);
    }

    function checkLoadingState() {
      const isRouteLoading = Boolean(root.querySelector("[data-route-loading='true']"));
      if (sawRouteLoading.current && !isRouteLoading) {
        restartEnterTransition();
      }
      sawRouteLoading.current = isRouteLoading;
    }

    checkLoadingState();
    const observer = new MutationObserver(checkLoadingState);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;
      if (shouldSkipTransition(nextUrl.pathname)) return;
      if (
        nextUrl.pathname === window.location.pathname &&
        nextUrl.search === window.location.search
      ) {
        return;
      }

      event.preventDefault();
      setPhase("leaving");
      window.__chessSomething?.pauseForNavigation?.();
      if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
      if (spinnerTimer.current) window.clearTimeout(spinnerTimer.current);
      setShowSpinner(false);

      navigationTimer.current = window.setTimeout(() => {
        setPhase("loading");
        spinnerTimer.current = window.setTimeout(() => {
          setShowSpinner(true);
        }, SPINNER_DELAY_MS);
        router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      }, LEAVE_FADE_MS);

      leaveTimer.current = window.setTimeout(() => {
        setPhase((currentPhase) =>
          currentPhase === "leaving" || currentPhase === "loading" ? "idle" : currentPhase,
        );
        setShowSpinner(false);
      }, LEAVE_TIMEOUT_MS);
    }

    document.addEventListener("click", handleDocumentClick, { capture: true });
    return () => document.removeEventListener("click", handleDocumentClick, { capture: true });
  }, [router]);

  return (
    <div
      className="route-transition-shell"
      data-route-phase={phase}
    >
      <div className="route-transition-content" key={pathname} ref={contentRef}>
        {children}
      </div>
      <div
        className="route-transition-spinner"
        data-visible={showSpinner ? "true" : "false"}
        aria-hidden={!showSpinner}
      >
        <div className="route-transition-spinner__ring" aria-label="Loading page" />
      </div>
    </div>
  );
}
