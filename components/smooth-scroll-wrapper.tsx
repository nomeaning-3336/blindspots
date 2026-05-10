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
  const contentRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const targetY = useRef(0);
  const currentY = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  const updateSpacerHeight = useCallback(() => {
    if (contentRef.current && spacerRef.current) {
      spacerRef.current.style.height = `${contentRef.current.scrollHeight}px`;
    }
  }, []);

  const lerp = useCallback(() => {
    const diff = targetY.current - currentY.current;
    const speed = 0.08;
    currentY.current += diff * speed;

    if (Math.abs(diff) > 0.05) {
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(0, ${-currentY.current}px, 0)`;
      }
      rafRef.current = requestAnimationFrame(lerp);
    } else {
      currentY.current = targetY.current;
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(0, ${-currentY.current}px, 0)`;
      }
    }
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    function handleWheel(e: WheelEvent) {
      // Skip if target is inside a native-scroll container
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-native-scroll]")) return;

      e.preventDefault();
      targetY.current = Math.max(
        0,
        Math.min(
          targetY.current + e.deltaY,
          (spacerRef.current?.offsetHeight ?? 0) - window.innerHeight,
        ),
      );
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(lerp);
    }

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      cancelAnimationFrame(rafRef.current);
    };
  }, [lerp, reducedMotion]);

  useEffect(() => {
    updateSpacerHeight();
    const observer = new ResizeObserver(updateSpacerHeight);
    if (contentRef.current) observer.observe(contentRef.current);
    window.addEventListener("resize", updateSpacerHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSpacerHeight);
    };
  }, [updateSpacerHeight]);

  // Reset scroll on route change
  useEffect(() => {
    targetY.current = 0;
    currentY.current = 0;
    if (contentRef.current) {
      contentRef.current.style.transform = "translate3d(0, 0, 0)";
    }
  }, [pathname]);

  const scrollDisabled =
    reducedMotion ||
    pathname.startsWith("/train") ||
    pathname.startsWith("/analysis");

  if (scrollDisabled) {
    return <>{children}</>;
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <div
        ref={spacerRef}
        aria-hidden="true"
        style={{ width: 0, pointerEvents: "none" }}
      />
      <div
        ref={contentRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
