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

export type PersistentHighlightedMove = {
  from: string;
  to: string;
  color?: string | null;
};

export function PositionThumbnail({
  fen,
  orientation = "white",
  size = 88,
  lastMove,
  lastMoveBadge = null,
  pieceAnimation = false,
  pieceAnimationDurationMs = 240,
  persistentHighlightedMoves = [],
}: {
  fen: string;
  orientation?: "white" | "black";
  size?: number;
  lastMove?: { from: string; to: string } | null;
  lastMoveBadge?: LastMoveBadge | null;
  pieceAnimation?: boolean;
  pieceAnimationDurationMs?: number;
  persistentHighlightedMoves?: PersistentHighlightedMove[];
}) {
  const persistentHighlightedSquares =
    persistentHighlightedMoves.length > 0
      ? persistentHighlightedMoves.flatMap((move) => {
          const baseColor = move.color ?? "var(--app-accent)";
          return [
            {
              square: move.from,
              color: `color-mix(in srgb, ${baseColor} 34%, transparent)`,
            },
            {
              square: move.to,
              color: `color-mix(in srgb, ${baseColor} 52%, transparent)`,
            },
          ];
        })
      : undefined;
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
        pieceAnimationDurationMs={pieceAnimationDurationMs}
        highlightedSquares={persistentHighlightedSquares}
        className="!rounded-none"
      />
    </div>
  );
}

const PIECE_GLIDE_MS = 240;
const NOTE_BADGE_REVEAL_MS = 160;
const NOTE_HOVER_START_DELAY_MS = 50;
const BETWEEN_SEQUENCE_DELAY_MS = 260;
const STAGE_SETTLE_MS = 32;
const HOVER_PREVIEW_DELAY_MS = 50;
const REVERSE_HIGHLIGHT_LINGER_MS = 200;
const HOVER_HIGHLIGHT_ARM_MS = 100;

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
  const [persistentHighlightedMoves, setPersistentHighlightedMoves] = useState<PersistentHighlightedMove[]>([]);
  const [previewBadge, setPreviewBadge] = useState<LastMoveBadge | null>(null);
  const [animating, setAnimating] = useState(false);

  const isHoveringRef = useRef(false);
  const activePreviewRef = useRef<ThumbnailMovePreview | null>(null);
  const sequenceIdRef = useRef(0);
  const noteHoverStartedAtRef = useRef<number | null>(null);
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

  function isNoteHoverArmed() {
    const startedAt = noteHoverStartedAtRef.current;
    return typeof startedAt === "number" && Date.now() - startedAt >= HOVER_HIGHLIGHT_ARM_MS;
  }

  function sameMove(
    a: { from: string; to: string } | null | undefined,
    b: { from: string; to: string } | null | undefined,
  ) {
    return Boolean(a && b && a.from === b.from && a.to === b.to);
  }

  function withoutMove(
    moves: PersistentHighlightedMove[],
    move: { from: string; to: string } | null | undefined,
  ) {
    if (!move) return moves;
    return moves.filter((item) => !sameMove(item, move));
  }

  function playGlideStage({
    id,
    fromFen,
    toFen,
    move,
    badge = null,
    delay = 0,
    keepLastMoveBeforeStart = false,
    addPersistentHighlightOnStart = false,
    persistentHighlightColor = null,
    onDone,
  }: {
    id: number;
    fromFen: string;
    toFen: string;
    move: { from: string; to: string } | null;
    badge?: LastMoveBadge | null;
    delay?: number;
    keepLastMoveBeforeStart?: boolean;
    addPersistentHighlightOnStart?: boolean;
    persistentHighlightColor?: string | null;
    onDone?: () => void;
  }) {
    schedule(() => {
      if (!isCurrent(id)) return;

      // Quietly stage the starting board without animating the reset/setup jump.
      // For hover-out reverse replay, keep the last-move highlight visible until
      // the reverse animation fully completes.
      setAnimating(false);
      setShownFen(fromFen);

      setPreviewLastMove(keepLastMoveBeforeStart ? move : null);
      setPreviewBadge(null);

      schedule(() => {
        if (!isCurrent(id)) return;

        // Highlight immediately when the move starts, Lichess-style.
        setPreviewLastMove(move);
        if (addPersistentHighlightOnStart && move && isNoteHoverArmed()) {
          setPersistentHighlightedMoves((current) =>
            current.some((item) => sameMove(item, move))
              ? current.map((item) =>
                  sameMove(item, move)
                    ? { ...item, color: item.color ?? persistentHighlightColor }
                    : item,
                )
              : [...current, { ...move, color: persistentHighlightColor }],
          );
        }
        setPreviewBadge(null);

        // Castling moves king + rook. The board now supports multi-piece glides.
        setAnimating(true);

        requestAnimationFrame(() => {
          if (!isCurrent(id)) return;
          setShownFen(toFen);
        });

        schedule(() => {
          if (!isCurrent(id)) return;

          setAnimating(false);
          setShownFen(toFen);
          setPreviewLastMove(move);
          setPreviewBadge(badge);

          onDone?.();
        }, PIECE_GLIDE_MS);
      }, STAGE_SETTLE_MS);
    }, delay);
  }

  // Note hover: two-stage animation (handles hover-in, hover-out, and idle reset)
  useEffect(() => {
    if (!movePreview) {
      // Hover out
      noteHoverStartedAtRef.current = null;
      const preview = activePreviewRef.current;

      if (!preview) {
        clearTimers();
        isHoveringRef.current = false;
        setAnimating(false);
        setShownFen(idleFen);
        setPreviewLastMove(null);
        setPersistentHighlightedMoves([]);
        setPreviewBadge(null);
        return;
      }

      const id = nextSequenceId();

      const preludeBefore = previousFen ?? idleFen;
      const preludeAfter = preview.fenBefore;
      const needsPreludeReverse = Boolean(previousFen) && preludeBefore !== preludeAfter;

      // Reverse stage 1: undo the note move.
      // Keep the note-move highlight visible until the reverse animation completes.
      playGlideStage({
        id,
        fromFen: preview.fenAfter,
        toFen: preview.fenBefore,
        move: preview.move,
        badge: null,
        delay: 0,
        keepLastMoveBeforeStart: true,
        onDone: () => {
          if (!isCurrent(id)) return;

          // The note move is now back on its original square.
          // Keep its highlight visible for 100ms, then remove it.
          setAnimating(false);
          setShownFen(preview.fenBefore);
          setPreviewLastMove(null);
          setPreviewBadge(null);

          schedule(() => {
            if (!isCurrent(id)) return;

            setPersistentHighlightedMoves((current) => withoutMove(current, preview.move));

            if (!needsPreludeReverse) {
              setPersistentHighlightedMoves([]);
              activePreviewRef.current = null;
              return;
            }

            // Reverse stage 2: undo the setup/prelude move.
            // After the delay, highlight the prelude move immediately when its reverse starts.
            playGlideStage({
              id,
              fromFen: preludeAfter,
              toFen: preludeBefore,
              move: moveCoords,
              badge: null,
              delay: BETWEEN_SEQUENCE_DELAY_MS,
              keepLastMoveBeforeStart: true,
              onDone: () => {
                if (!isCurrent(id)) return;

                // The prelude move is now back on its original square.
                // Keep its highlight visible for 100ms, then remove it.
                setAnimating(false);
                setShownFen(preludeBefore);
                setPreviewLastMove(null);
                setPreviewBadge(null);

                schedule(() => {
                  if (!isCurrent(id)) return;
                  setPersistentHighlightedMoves((current) => withoutMove(current, moveCoords));
                  activePreviewRef.current = null;
                }, REVERSE_HIGHLIGHT_LINGER_MS);
              },
            });
          }, REVERSE_HIGHLIGHT_LINGER_MS);
        },
      });

      return;
    }

    // Hover in
    activePreviewRef.current = movePreview;
    noteHoverStartedAtRef.current = Date.now();
    const id = nextSequenceId();
    setPersistentHighlightedMoves([]);

    schedule(() => {
      if (!isCurrent(id) || !movePreview || !isNoteHoverArmed()) return;

      const preludeBefore = previousFen ?? movePreview.fenBefore;
      const preludeAfter = finalFen;
      const needsPreludeStage = Boolean(previousFen && moveCoords && preludeBefore !== preludeAfter);

      if (needsPreludeStage && moveCoords) {
        setPersistentHighlightedMoves((current) =>
          current.some((item) => sameMove(item, moveCoords))
            ? current
            : [...current, { ...moveCoords, color: null }],
        );
      }
    }, HOVER_HIGHLIGHT_ARM_MS);

    const preludeBefore = previousFen ?? movePreview.fenBefore;
    const preludeAfter = finalFen;
    const needsPreludeStage = Boolean(previousFen && moveCoords && preludeBefore !== preludeAfter);

    if (!needsPreludeStage) {
      // Single-stage note preview.
      // Highlight appears immediately when the note move starts.
      playGlideStage({
        id,
        fromFen: movePreview.fenBefore,
        toFen: movePreview.fenAfter,
        move: movePreview.move,
        badge: movePreview.badge ?? null,
        delay: NOTE_HOVER_START_DELAY_MS,
        addPersistentHighlightOnStart: true,
        persistentHighlightColor: movePreview.badge?.color ?? null,
      });

      return;
    }

    // Forward stage 1: setup/prelude move.
    // Highlight appears immediately when the setup move starts.
    playGlideStage({
      id,
      fromFen: preludeBefore,
      toFen: preludeAfter,
      move: moveCoords,
      badge: null,
      delay: NOTE_HOVER_START_DELAY_MS,
      addPersistentHighlightOnStart: true,
      onDone: () => {
        if (!isCurrent(id)) return;

        // Keep first highlight during the pause.
        // Stage 2 will replace it with the note-move highlight as the second animation starts.
        playGlideStage({
          id,
          fromFen: movePreview.fenBefore,
          toFen: movePreview.fenAfter,
          move: movePreview.move,
          badge: movePreview.badge ?? null,
          delay: BETWEEN_SEQUENCE_DELAY_MS,
          addPersistentHighlightOnStart: true,
          persistentHighlightColor: movePreview.badge?.color ?? null,
        });
      },
    });
  }, [movePreview, previousFen, finalFen, idleFen, moveCoords]);

  // Direct thumbnail hover
  function previewForward() {
    if (movePreview) return;

    const id = nextSequenceId();
    isHoveringRef.current = true;

    if (!canReplay || !previousFen || !moveCoords) {
      setShownFen(finalFen);
      setPreviewLastMove(null);
      setPersistentHighlightedMoves([]);
      setPreviewBadge(null);
      setAnimating(false);
      return;
    }

    playGlideStage({
      id,
      fromFen: previousFen,
      toFen: finalFen,
      move: moveCoords,
      badge: null,
      delay: HOVER_PREVIEW_DELAY_MS,
    });
  }

  function previewBackward() {
    if (movePreview) return;

    const id = nextSequenceId();
    isHoveringRef.current = false;

    if (!canReplay || !previousFen || !moveCoords) {
      setShownFen(finalFen);
      setPreviewLastMove(null);
      setPersistentHighlightedMoves([]);
      setPreviewBadge(null);
      setAnimating(false);
      return;
    }

    playGlideStage({
      id,
      fromFen: finalFen,
      toFen: previousFen,
      move: moveCoords,
      badge: null,
      delay: 0,
      keepLastMoveBeforeStart: true,
      onDone: () => {
        if (!isCurrent(id)) return;
        setAnimating(false);
        setShownFen(previousFen);
        setPreviewLastMove(null);
        setPersistentHighlightedMoves([]);
        setPreviewBadge(null);
      },
    });
  }

  return (
    <div
      tabIndex={0}
      onPointerEnter={previewForward}
      onPointerLeave={previewBackward}
      onFocus={previewForward}
      onBlur={previewBackward}
      className="relative inline-flex cursor-pointer overflow-hidden rounded-lg border border-[var(--app-border-soft)] bg-[var(--app-panel-deep)] p-1 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.002]"
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
        pieceAnimationDurationMs={PIECE_GLIDE_MS}
        persistentHighlightedMoves={persistentHighlightedMoves}
      />
    </div>
  );
}
