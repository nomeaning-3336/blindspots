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

const PIECE_GLIDE_MS = 240;
const NOTE_HOVER_START_DELAY_MS = 200;
const BETWEEN_SEQUENCE_DELAY_MS = 180;
const HOVER_PREVIEW_DELAY_MS = 200;

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
  const idleFen = previousFen ?? finalFen;

  const [shownFen, setShownFen] = useState(idleFen);
  const [previewLastMove, setPreviewLastMove] = useState<{ from: string; to: string } | null>(null);
  const [previewBadge, setPreviewBadge] = useState<LastMoveBadge | null>(null);
  const [animating, setAnimating] = useState(false);

  const isHoveringRef = useRef(false);
  const activePreviewRef = useRef<ThumbnailMovePreview | null>(null);
  const sequenceIdRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const moveCoords = useMemo(() => {
    if (!playedMove || playedMove.length < 4) return null;
    return { from: playedMove.slice(0, 2), to: playedMove.slice(2, 4) };
  }, [playedMove]);

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function schedule(fn: () => void, delay: number) {
    const timer = setTimeout(fn, delay);
    timersRef.current.push(timer);
    return timer;
  }

  function nextSequenceId() {
    sequenceIdRef.current += 1;
    clearTimers();
    return sequenceIdRef.current;
  }

  function isCurrent(id: number) {
    return sequenceIdRef.current === id;
  }

  // Note hover: two-stage animation (handles hover-in, hover-out, and idle reset)
  useEffect(() => {
    if (!movePreview) {
      // Hover out
      const preview = activePreviewRef.current;

      if (!preview) {
        // No active preview — safe to reset to idle
        clearTimers();
        isHoveringRef.current = false;
        setAnimating(false);
        setShownFen(idleFen);
        setPreviewLastMove(null);
        setPreviewBadge(null);
        return;
      }

      const id = nextSequenceId();

      setAnimating(true);
      setPreviewLastMove(null);
      setPreviewBadge(null);

      // Reverse stage 1: user note move backwards
      setShownFen(preview.fenAfter);

      requestAnimationFrame(() => {
        if (!isCurrent(id)) return;
        setShownFen(preview.fenBefore);
      });

      schedule(() => {
        if (!isCurrent(id)) return;

        setPreviewLastMove(null);
        setPreviewBadge(null);

        // Reverse stage 2: prelude engine move backwards (if different from note before)
        if (finalFen !== preview.fenBefore) {
          setShownFen(finalFen);

          requestAnimationFrame(() => {
            if (!isCurrent(id)) return;
            setShownFen(previousFen ?? idleFen);
          });
        }

        schedule(() => {
          if (!isCurrent(id)) return;
          setAnimating(false);
          setPreviewLastMove(null);
          setPreviewBadge(null);
          setShownFen(previousFen ?? idleFen);
          activePreviewRef.current = null;
        }, PIECE_GLIDE_MS);
      }, PIECE_GLIDE_MS + BETWEEN_SEQUENCE_DELAY_MS);

      return;
    }

    // Hover in: two-stage animation
    activePreviewRef.current = movePreview;
    const id = nextSequenceId();

    setAnimating(true);
    setPreviewLastMove(null);
    setPreviewBadge(null);

    const preludeBefore = previousFen ?? movePreview.fenBefore;
    const preludeAfter = finalFen;
    const needsPreludeStage = preludeBefore !== preludeAfter && preludeAfter !== movePreview.fenBefore;

    if (!needsPreludeStage) {
      // Single-stage: just animate the note move
      setShownFen(movePreview.fenBefore);

      schedule(() => {
        if (!isCurrent(id)) return;

        requestAnimationFrame(() => {
          if (!isCurrent(id)) return;
          setShownFen(movePreview.fenAfter);
        });

        schedule(() => {
          if (!isCurrent(id)) return;
          setPreviewLastMove(movePreview.move);
          setPreviewBadge(movePreview.badge ?? null);
        }, PIECE_GLIDE_MS);
      }, NOTE_HOVER_START_DELAY_MS);

      return;
    }

    // Two-stage: prelude engine move then note move
    setShownFen(preludeBefore);

    schedule(() => {
      if (!isCurrent(id)) return;

      // Stage 1: prelude engine move
      requestAnimationFrame(() => {
        if (!isCurrent(id)) return;
        setShownFen(preludeAfter);
      });

      schedule(() => {
        if (!isCurrent(id)) return;

        setPreviewLastMove(null);
        setPreviewBadge(null);

        // Stage 2: user note move
        setShownFen(movePreview.fenBefore);

        requestAnimationFrame(() => {
          if (!isCurrent(id)) return;
          setShownFen(movePreview.fenAfter);
        });

        schedule(() => {
          if (!isCurrent(id)) return;
          setPreviewLastMove(movePreview.move);
          setPreviewBadge(movePreview.badge ?? null);
        }, PIECE_GLIDE_MS);
      }, PIECE_GLIDE_MS + BETWEEN_SEQUENCE_DELAY_MS);
    }, NOTE_HOVER_START_DELAY_MS);
  }, [movePreview, previousFen, finalFen, idleFen]);

  // Direct thumbnail hover
  function previewForward() {
    if (movePreview) return;
    clearTimers();
    isHoveringRef.current = true;

    if (!canReplay || !previousFen || !moveCoords) {
      setShownFen(finalFen);
      setPreviewLastMove(null);
      setPreviewBadge(null);
      setAnimating(false);
      return;
    }

    setAnimating(true);
    setShownFen(previousFen);
    setPreviewLastMove(null);
    setPreviewBadge(null);

    schedule(() => {
      requestAnimationFrame(() => {
        setShownFen(finalFen);
      });
    }, HOVER_PREVIEW_DELAY_MS);
  }

  function previewBackward() {
    if (movePreview) return;
    clearTimers();
    isHoveringRef.current = false;

    if (!canReplay || !previousFen) {
      setShownFen(finalFen);
      setPreviewLastMove(null);
      setPreviewBadge(null);
      setAnimating(false);
      return;
    }

    setAnimating(true);
    setShownFen(finalFen);
    setPreviewLastMove(null);
    setPreviewBadge(null);

    requestAnimationFrame(() => {
      setShownFen(previousFen);

      schedule(() => {
        setAnimating(false);
        setShownFen(previousFen);
      }, PIECE_GLIDE_MS);
    });
  }

  return (
    <div
      tabIndex={0}
      onPointerEnter={previewForward}
      onPointerLeave={previewBackward}
      onFocus={previewForward}
      onBlur={previewBackward}
      className="relative inline-flex cursor-pointer overflow-hidden rounded-lg border border-[var(--app-border-soft)] bg-[var(--app-panel-deep)] p-1 transition-transform duration-200 ease-out hover:scale-[1.015]"
      style={{ width: size + 8, height: size + 8 }}
      aria-label={canReplay || movePreview ? "Replay setup move preview" : "Position preview"}
    >
      <PositionThumbnail
        fen={shownFen}
        orientation={orientation}
        size={size}
        lastMove={previewLastMove}
        lastMoveBadge={previewBadge}
        pieceAnimation={animating}
      />
    </div>
  );
}
