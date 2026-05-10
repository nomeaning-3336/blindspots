"use client";

import { useEffect, useRef, useState } from "react";
import { AnalysisBoard } from "@/components/chess/analysis-board";

export function PositionThumbnail({ fen, orientation = "white", size = 88 }: { fen: string; orientation?: "white" | "black"; size?: number }) {
  return (
    <div
      className="app-brutal-board-frame shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      <AnalysisBoard
        fen={fen}
        mode="training"
        orientation={orientation}
        coordinates={false}
        disabled
        showLegalTargets={false}
        annotationsDisabled
        selectedSquare={null}
        legalTargets={[]}
        engineArrows={[]}
        lastMove={null}
        lastMoveBadge={null}
        className="!rounded-none"
      />
    </div>
  );
}

export function ReplayThumbnail({
  previousFen,
  finalFen,
  playedMove,
  orientation = "white",
  size = 112,
}: {
  previousFen?: string | null;
  finalFen: string;
  playedMove?: string | null;
  orientation?: "white" | "black";
  size?: number;
}) {
  const canReplay = Boolean(previousFen && playedMove);
  const [shownFen, setShownFen] = useState(previousFen ?? finalFen);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function previewForward() {
    clearTimer();
    if (!canReplay || !previousFen) {
      setShownFen(finalFen);
      return;
    }
    setShownFen(previousFen);
    timerRef.current = setTimeout(() => {
      setShownFen(finalFen);
    }, 180);
  }

  function previewBackward() {
    clearTimer();
    if (!canReplay || !previousFen) {
      setShownFen(finalFen);
      return;
    }
    setShownFen(finalFen);
    timerRef.current = setTimeout(() => {
      setShownFen(previousFen);
    }, 180);
  }

  useEffect(() => {
    setShownFen(previousFen ?? finalFen);
    return clearTimer;
  }, [previousFen, finalFen]);

  return (
    <div
      tabIndex={0}
      onPointerEnter={previewForward}
      onPointerLeave={previewBackward}
      onFocus={previewForward}
      onBlur={previewBackward}
      className="relative inline-flex cursor-pointer rounded-lg border border-[var(--app-border-soft)] bg-[var(--app-panel-deep)] p-1 transition hover:border-[var(--app-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]"
      aria-label={canReplay ? "Replay setup move preview" : "Position preview"}
    >
      <PositionThumbnail fen={shownFen} orientation={orientation} size={size} />
    </div>
  );
}
