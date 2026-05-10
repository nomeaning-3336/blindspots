"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnalysisBoard } from "@/components/chess/analysis-board";
import type { LastMoveBadge } from "@/lib/training-board-ui";

export type ThumbnailMovePreview = {
  fenBefore: string;
  fenAfter: string;
  move: { from: string; to: string };
  badge?: LastMoveBadge | null;
};

export function PositionThumbnail({
  fen,
  orientation = "white",
  size = 88,
  lastMove,
  lastMoveBadge = null,
  pieceAnimation = false,
}: {
  fen: string;
  orientation?: "white" | "black";
  size?: number;
  lastMove?: { from: string; to: string } | null;
  lastMoveBadge?: LastMoveBadge | null;
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
        lastMoveBadge={lastMoveBadge}
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
  movePreview,
  orientation = "white",
  size = 112,
}: {
  previousFen?: string | null;
  finalFen: string;
  playedMove?: string | null;
  movePreview?: ThumbnailMovePreview | null;
  orientation?: "white" | "black";
  size?: number;
}) {
  const canReplay = Boolean(previousFen && playedMove);
  const [shownFen, setShownFen] = useState(previousFen ?? finalFen);
  const [previewLastMove, setPreviewLastMove] = useState<{ from: string; to: string } | null>(null);
  const [previewBadge, setPreviewBadge] = useState<LastMoveBadge | null>(null);
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
      setPreviewBadge(null);
      return;
    }
    setAnimating(true);
    setShownFen(previousFen);
    setPreviewLastMove(null);
    setPreviewBadge(null);

    timerRef.current = setTimeout(() => {
      setShownFen(finalFen);
      setPreviewLastMove(moveCoords);
      setPreviewBadge(null);
    }, 400);
  }

  function previewBackward() {
    clearTimer();
    if (!canReplay || !previousFen) {
      setShownFen(finalFen);
      setPreviewLastMove(null);
      setPreviewBadge(null);
      return;
    }
    // Show final position with move highlighted, then animate back
    setAnimating(true);
    setShownFen(finalFen);
    setPreviewLastMove(moveCoords);
    setPreviewBadge(null);

    const reverseLastMove = moveCoords ? { from: moveCoords.to, to: moveCoords.from } : null;
    timerRef.current = setTimeout(() => {
      setShownFen(previousFen);
      setPreviewLastMove(reverseLastMove);
      setPreviewBadge(null);
      setAnimating(false);
    }, 400);
  }

  useEffect(() => {
    if (movePreview) return;
    setShownFen(previousFen ?? finalFen);
    setPreviewLastMove(null);
    setPreviewBadge(null);
    return clearTimer;
  }, [previousFen, finalFen, movePreview]);

  useEffect(() => {
    clearTimer();
    if (!movePreview) {
      setAnimating(false);
      setShownFen(previousFen ?? finalFen);
      setPreviewLastMove(null);
      setPreviewBadge(null);
      return;
    }

    setAnimating(true);
    setShownFen(movePreview.fenBefore);
    setPreviewLastMove(null);
    setPreviewBadge(null);

    timerRef.current = setTimeout(() => {
      setShownFen(movePreview.fenAfter);
      setPreviewLastMove(movePreview.move);
      setPreviewBadge(movePreview.badge ?? null);
    }, 180);

    return clearTimer;
  }, [finalFen, movePreview, previousFen]);

  return (
    <div
      tabIndex={0}
      onPointerEnter={previewForward}
      onPointerLeave={previewBackward}
      onFocus={previewForward}
      onBlur={previewBackward}
      className="relative inline-flex cursor-pointer overflow-hidden rounded-lg border border-[var(--app-border-soft)] bg-[var(--app-panel-deep)] p-1 transition-transform duration-200 ease-out hover:scale-[1.025]"
      style={{ width: size + 8, height: size + 8 }}
      aria-label={canReplay ? "Replay setup move preview" : "Position preview"}
    >
      <PositionThumbnail
        fen={shownFen}
        orientation={orientation}
        size={size}
        lastMove={previewLastMove}
        lastMoveBadge={previewBadge}
        pieceAnimation={animating && (canReplay || Boolean(movePreview))}
      />
    </div>
  );
}
