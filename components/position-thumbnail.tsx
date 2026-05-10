"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnalysisBoard } from "@/components/chess/analysis-board";

export function PositionThumbnail({
  fen,
  orientation = "white",
  size = 88,
  lastMove,
  pieceAnimation = false,
}: {
  fen: string;
  orientation?: "white" | "black";
  size?: number;
  lastMove?: { from: string; to: string } | null;
  pieceAnimation?: boolean;
}) {
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
        lastMove={lastMove ?? null}
        lastMoveBadge={null}
        pieceAnimation={pieceAnimation}
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
  const [previewLastMove, setPreviewLastMove] = useState<{ from: string; to: string } | null>(null);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute the from/to squares from the UCI move
  const moveCoords = useMemo(() => {
    if (!playedMove || playedMove.length < 4) return null;
    return { from: playedMove.slice(0, 2), to: playedMove.slice(2, 4) };
  }, [playedMove]);

  function clearTimer() {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function previewForward() {
    clearTimer();
    if (!canReplay || !previousFen || !moveCoords) {
      setShownFen(finalFen);
      setPreviewLastMove(null);
      return;
    }
    setAnimating(true);
    setShownFen(previousFen);
    setPreviewLastMove(null);

    timerRef.current = setTimeout(() => {
      setShownFen(finalFen);
      setPreviewLastMove(moveCoords);
    }, 800);
  }

  function previewBackward() {
    clearTimer();
    if (!canReplay || !previousFen) {
      setShownFen(finalFen);
      setPreviewLastMove(null);
      return;
    }
    setAnimating(false);
    setShownFen(previousFen);
    setPreviewLastMove(null);
  }

  useEffect(() => {
    setShownFen(previousFen ?? finalFen);
    setPreviewLastMove(null);
    return clearTimer;
  }, [previousFen, finalFen]);

  return (
    <div
      tabIndex={0}
      onPointerEnter={previewForward}
      onPointerLeave={previewBackward}
      onFocus={previewForward}
      onBlur={previewBackward}
      className="relative inline-flex cursor-pointer overflow-hidden rounded-lg border border-[var(--app-border-soft)] bg-[var(--app-panel-deep)] p-1 transition hover:scale-105"
      style={{ width: size + 8, height: size + 8 }}
      aria-label={canReplay ? "Replay setup move preview" : "Position preview"}
    >
      <PositionThumbnail
        fen={shownFen}
        orientation={orientation}
        size={size}
        lastMove={previewLastMove}
        pieceAnimation={animating && canReplay}
      />
    </div>
  );
}
