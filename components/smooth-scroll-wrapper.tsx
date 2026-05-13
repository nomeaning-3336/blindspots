"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function SmoothScrollWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const targetY = useRef(0);
  const currentY = useRef(0);
  const rafRef = useRef(0);
  const isScrollingRef = useRef(false);

  const getScrollElement = useCallback((): HTMLElement | null => {
    const container = containerRef.current;
    if (!container) return null;
    return container.querySelector<HTMLElement>("[data-smooth-scroll], .app-scroll") ?? container;
  }, []);

  useEffect(() => {
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  const lerp = useCallback(() => {
    const diff = targetY.current - currentY.current;
    const speed = 0.1;
    currentY.current += diff * speed;

    if (Math.abs(diff) < 0.1) {
      currentY.current = targetY.current;
      isScrollingRef.current = false;
    } else {
      isScrollingRef.current = true;
    }

    const scrollElement = getScrollElement();
    if (scrollElement) {
      scrollElement.scrollTop = currentY.current;
    }

    if (isScrollingRef.current) {
      rafRef.current = requestAnimationFrame(lerp);
    }
  }, [getScrollElement]);

  useEffect(() => {
    if (reducedMotion) return;
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-native-scroll]")) return;
      const scrollElement = getScrollElement();
      if (!scrollElement) return;

      e.preventDefault();
      const maxScroll = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
      currentY.current = scrollElement.scrollTop;
      targetY.current = Math.max(
        0,
        Math.min(targetY.current + e.deltaY, maxScroll),
      );
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(lerp);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(rafRef.current);
    };
  }, [getScrollElement, lerp, reducedMotion]);

  // Reset scroll on route change
  useEffect(() => {
    targetY.current = 0;
    currentY.current = 0;
    const scrollElement = getScrollElement();
    if (scrollElement) {
      scrollElement.scrollTop = 0;
    }
  }, [getScrollElement, pathname]);

  const scrollDisabled =
    reducedMotion ||
    pathname === "/" ||
    pathname.startsWith("/train") ||
    pathname.startsWith("/analysis");

  if (scrollDisabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: "100%",
        overflow: "hidden",
        overscrollBehavior: "none",
      }}
    >
      {children}
    </div>
  );
}
