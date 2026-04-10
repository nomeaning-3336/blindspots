"use client";

import { useEffect } from "react";
import { useChessApp } from "./chess-app-context";

export function useChessKeyboard() {
  const { navigateBack, navigateForward, navigateStart, navigateEnd, navigateSibling, startAnalysis, haltEngine, isReady } = useChessApp();

  useEffect(() => {
    if (!isReady) return;

    const handler = (e: KeyboardEvent) => {
      // Skip if focus is on an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateBack();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateForward();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateSibling(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateSibling(1);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        navigateStart();
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        navigateEnd();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        // Toggle engine: if running halt, else start
        startAnalysis("analysis");
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        // Deleting nodes not yet bridged — skip for now
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isReady, navigateBack, navigateForward, navigateStart, navigateEnd, navigateSibling, startAnalysis, haltEngine]);
}
