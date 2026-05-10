"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function SmoothScrollWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
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

  // Lerp loop
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

  // Start lerp on scroll
  useEffect(() => {
    if (reducedMotion) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetY.current = Math.max(
        0,
        Math.min(
          targetY.current + e.deltaY,
          (spacerRef.current?.offsetHeight ?? 0) -
            (window.innerHeight),
        ),
      );
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(lerp);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(rafRef.current);
    };
  }, [lerp, reducedMotion]);

  // Update spacer on resize/content change
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

  if (reducedMotion) {
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
