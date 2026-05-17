"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Chess } from "chess.js";
import type { Move, Square } from "chess.js";
import { shouldClearAnnotationsOnPointerDown } from "@/lib/board-annotations";
import { dragPreviewPosition } from "@/lib/board-drag-preview";
import type { AnalyzeBoardTheme, AnalyzePieceTheme } from "@/lib/analyze-preferences";
import type { LastMoveBadge } from "@/lib/training-board-ui";

type BoardOrientation = "white" | "black";
type BoardMode = "analysis" | "training";
type BoardAnnotationArrow = { from: string; to: string };

type BoardGridOffset = {
  col: number;
  row: number;
};

type PieceGlideAnimation = {
  id: string;
  from: string;
  to: string;
  pieceCode: string;
  started: boolean;
  initialOffset?: BoardGridOffset;
};

type DragCompletionAnimationHint = {
  from: string;
  to: string;
  initialOffset: BoardGridOffset;
};

type BoardPieceSnapshot = {
  square: string;
  color: "w" | "b";
  type: string;
};

export type BoardHighlight = {
  square: string;
  color?: string;
  className?: string;
};

export type BoardMove = {
  from: string;
  to: string;
  san?: string;
  uci?: string;
};

export type EngineArrow = {
  from: string;
  to: string;
  label?: string;
  rank?: number;
  emphasis?: boolean;
  color?: string;
};

export type AnalysisBoardProps = {
  fen: string;
  orientation?: BoardOrientation;
  selectedSquare?: string | null;
  legalTargets?: string[];
  highlightedSquares?: Record<string, string> | BoardHighlight[];
  engineArrows?: EngineArrow[];
  lastMove?: { from: string; to: string } | null;
  lastMoveBadge?: LastMoveBadge | null;
  pieceAnimation?: boolean;
  pieceAnimationDurationMs?: number;
  disabled?: boolean;
  annotationsDisabled?: boolean;
  coordinates?: boolean;
  showLegalTargets?: boolean;
  mode?: BoardMode;
  boardTheme?: AnalyzeBoardTheme;
  pieceTheme?: AnalyzePieceTheme;
  onMove?: (move: BoardMove) => void;
  onSquareClick?: (square: string) => void;
  onCircleHover?: (square: string | null) => void;
  onEngineArrowClick?: (move: BoardMove) => void;
  className?: string;
  dataTestId?: string;
};

const BOARD_THEMES: Record<AnalyzeBoardTheme, { light: string; dark: string; coord: string }> = {
  grey: { light: "#e8e8e8", dark: "#a1a1ae", coord: "#666686" },
  light: { light: "#f7f0e0", dark: "#d9ccb5", coord: "#847560" },
  solarized: { light: "#f3ebcf", dark: "#c8ba98", coord: "#6e7c78" },
  forest: { light: "#dce7d8", dark: "#7d9770", coord: "#4d6a53" },
  ocean: { light: "#dce6f2", dark: "#5c769a", coord: "#3b5678" },
  crimson: { light: "#f0dde2", dark: "#73515f", coord: "#a96c82" },
  midnight: { light: "#efe6fb", dark: "#6d5a8f", coord: "#b39ae0" },
};

const PIECE_ASSET_SETS: Record<AnalyzePieceTheme, string> = {
  cburnett: "cburnett",
  "alpha-wood": "alpha",
  maestro: "maestro",
  smart: "merida",
  "staunty-wood": "staunty",
  governor: "governor",
  companion: "companion",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

export function AnalysisBoard({
  fen,
  orientation = "white",
  selectedSquare,
  legalTargets,
  highlightedSquares,
  lastMove,
  lastMoveBadge,
  pieceAnimation = false,
  pieceAnimationDurationMs = 240,
  disabled = false,
  annotationsDisabled = disabled,
  coordinates = true,
  showLegalTargets = true,
  mode = "analysis",
  boardTheme = "midnight",
  pieceTheme = "maestro",
  engineArrows,
  onMove,
  onSquareClick,
  onCircleHover,
  onEngineArrowClick,
  className = "",
  dataTestId,
}: AnalysisBoardProps) {
  const chess = useMemo(() => safeChess(fen), [fen]);

  function pointerToBoardPoint(clientX: number, clientY: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function squareFromClientPoint(clientX: number, clientY: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const size = Math.min(rect.width, rect.height);
    if (size <= 0) return null;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (x < 0 || y < 0 || x > size || y > size) return null;

    const fileFromLeft = Math.min(7, Math.max(0, Math.floor((x / size) * 8)));
    const rankFromTop = Math.min(7, Math.max(0, Math.floor((y / size) * 8)));

    const fileIndex = orientation === "white" ? fileFromLeft : 7 - fileFromLeft;
    const rankIndex = orientation === "white" ? 7 - rankFromTop : rankFromTop;

    const file = FILES[fileIndex];
    const rank = RANKS[rankIndex];
    if (!file || !rank) return null;

    return `${file}${rank}`;
  }

  function gridOffsetFromClientPoint(clientX: number, clientY: number): BoardGridOffset | null {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const size = Math.min(rect.width, rect.height);
    if (size <= 0) return null;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const centerCol = Math.min(7.5, Math.max(0.5, (x / size) * 8));
    const centerRow = Math.min(7.5, Math.max(0.5, (y / size) * 8));

    return {
      col: centerCol - 0.5,
      row: centerRow - 0.5,
    };
  }

  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [hoveredSquare, setHoveredSquare] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragPieceSize, setDragPieceSize] = useState(64);
  const [annotationStart, setAnnotationStart] = useState<string | null>(null);
  const [annotationHover, setAnnotationHover] = useState<string | null>(null);
  const [annotationKind, setAnnotationKind] = useState<"arrow" | "circle" | null>(null);
  const [annotationMode, setAnnotationMode] = useState<BoardMode>("analysis");
  const [annotationCircles, setAnnotationCircles] = useState<string[]>([]);
  const [annotationArrows, setAnnotationArrows] = useState<BoardAnnotationArrow[]>([]);
  const pieceAnimationDurationMsRef = useRef(pieceAnimationDurationMs);
  pieceAnimationDurationMsRef.current = pieceAnimationDurationMs;
  const [pieceGlides, setPieceGlides] = useState<PieceGlideAnimation[]>([]);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const draggedPieceRef = useRef<HTMLDivElement | null>(null);
  const dragPositionRef = useRef<{ x: number; y: number } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const hoveredSquareRef = useRef<string | null>(null);
  const previousFenRef = useRef<string | null>(null);
  const dragCompletionAnimationHintRef = useRef<DragCompletionAnimationHint | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dragPreviewOriginRef = useRef<{
    pointer: { x: number; y: number };
    center: { x: number; y: number };
  } | null>(null);
  const annotationOriginRef = useRef<{ x: number; y: number } | null>(null);
  const activeSelected = selectedSquare !== undefined ? selectedSquare : internalSelected;
  const highlightMap = useMemo(() => normalizeHighlights(highlightedSquares), [highlightedSquares]);
  const boardSquares = useMemo(() => squaresForOrientation(orientation), [orientation]);
  const colors = BOARD_THEMES[boardTheme] ?? BOARD_THEMES.midnight;
  const pieceAssetSet = PIECE_ASSET_SETS[pieceTheme] ?? PIECE_ASSET_SETS.maestro;
  const checkedKingSquare = useMemo(() => findCheckedKingSquare(chess), [chess]);
  const computedTargets = useMemo(() => {
    const sourceSquare = activeSelected ?? dragFrom;
    return sourceSquare && chess ? legalMovesFrom(chess, sourceSquare) : [];
  }, [activeSelected, chess, dragFrom]);
  const activeTargets = legalTargets ?? computedTargets;
  const bestEngineArrowByTarget = useMemo(() => {
    const bestBySquare = new Map<string, { arrow: EngineArrow; rank: number }>();

    engineArrows?.forEach((arrow, index) => {
      const rank = arrow.rank ?? index + 1;
      const current = bestBySquare.get(arrow.to);
      if (!current || rank < current.rank) {
        bestBySquare.set(arrow.to, { arrow, rank });
      }
    });

    return bestBySquare;
  }, [engineArrows]);

  function clearDragFrame() {
    if (dragFrameRef.current === null) return;
    window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
  }

  function scheduleDraggedPieceTransform(position: { x: number; y: number }) {
    dragPositionRef.current = position;
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const latest = dragPositionRef.current;
      const node = draggedPieceRef.current;
      if (!latest || !node) return;

      node.style.transform = `translate(${latest.x}px, ${latest.y}px) translate(-50%, -50%)`;
    });
  }

  useEffect(() => {
    hoveredSquareRef.current = hoveredSquare;
  }, [hoveredSquare]);

  useEffect(() => {
    return () => {
      clearDragFrame();
    };
  }, []);

  useLayoutEffect(() => {
    const previousFen = previousFenRef.current;
    previousFenRef.current = fen;

    if (!pieceAnimation || !chess || !previousFen || previousFen === fen) {
      dragCompletionAnimationHintRef.current = null;
      setPieceGlides([]);
      return;
    }

    const previousChess = safeChess(previousFen);
    if (!previousChess) {
      dragCompletionAnimationHintRef.current = null;
      setPieceGlides([]);
      return;
    }

    const inferredMoves = inferPieceGlideMoves(previousChess, chess);
    if (inferredMoves.length === 0) {
      dragCompletionAnimationHintRef.current = null;
      setPieceGlides([]);
      return;
    }

    const dragCompletionAnimationHint = dragCompletionAnimationHintRef.current;
    dragCompletionAnimationHintRef.current = null;

    const glides = inferredMoves.map((inferredMove) => {
      const animationId = `${fen}|${inferredMove.from}-${inferredMove.to}|${inferredMove.pieceCode}`;
      const initialOffset =
        dragCompletionAnimationHint?.from === inferredMove.from &&
        dragCompletionAnimationHint.to === inferredMove.to
          ? dragCompletionAnimationHint.initialOffset
          : undefined;

      return {
        id: animationId,
        from: inferredMove.from,
        to: inferredMove.to,
        pieceCode: inferredMove.pieceCode,
        started: false,
        initialOffset,
      };
    });

    setPieceGlides(glides);

    const glideIds = new Set(glides.map((glide) => glide.id));

    const frame = window.requestAnimationFrame(() => {
      setPieceGlides((current) =>
        current.map((glide) =>
          glideIds.has(glide.id) ? { ...glide, started: true } : glide,
        ),
      );
    });

    const timeout = window.setTimeout(() => {
      setPieceGlides((current) => current.filter((glide) => !glideIds.has(glide.id)));
    }, pieceAnimationDurationMsRef.current);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [chess, fen, pieceAnimation]);

  useEffect(() => {
    setInternalSelected(null);
    setDragFrom(null);
    setHoveredSquare(null);
    setDragPosition(null);
    setAnnotationStart(null);
    setAnnotationHover(null);
    setAnnotationKind(null);
    setAnnotationMode("analysis");
    setAnnotationCircles([]);
    setAnnotationArrows([]);
  }, [fen]);

  useEffect(() => {
    const activeChess = chess;
    if (!dragFrom || disabled || mode !== "training" || !activeChess) return;
    const dragChess: Chess = activeChess;
    const sourceSquare = dragFrom;

    function handleWindowPointerMove(event: PointerEvent) {
      const previewOrigin = dragPreviewOriginRef.current;
      const boardPointer = pointerToBoardPoint(event.clientX, event.clientY);
      const nextDragPosition =
        previewOrigin
          ? dragPreviewPosition({
              pointer: boardPointer,
              originPointer: previewOrigin.pointer,
              originCenter: previewOrigin.center,
            })
          : boardPointer;
      scheduleDraggedPieceTransform(nextDragPosition);

      const nextHoveredSquare = squareFromClientPoint(event.clientX, event.clientY);
      if (hoveredSquareRef.current !== nextHoveredSquare) {
        hoveredSquareRef.current = nextHoveredSquare;
        setHoveredSquare(nextHoveredSquare);
        setDragPosition(nextDragPosition);
      }
    }

    function handleWindowPointerUp(event: PointerEvent) {
      const targetSquare = squareFromClientPoint(event.clientX, event.clientY);
      const origin = dragOriginRef.current;
      const moved = Math.hypot(
        event.clientX - (origin?.x ?? event.clientX),
        event.clientY - (origin?.y ?? event.clientY),
      ) > 8;
      const legalMove = targetSquare ? findLegalMove(dragChess, sourceSquare, targetSquare) : null;
      const releaseOffset = gridOffsetFromClientPoint(event.clientX, event.clientY);
      const fromOffset = squareGridOffset(sourceSquare, orientation);
      const toOffset = targetSquare ? squareGridOffset(targetSquare, orientation) : null;
      dragCompletionAnimationHintRef.current =
        moved && targetSquare && legalMove && releaseOffset && fromOffset && toOffset
          ? {
              from: sourceSquare,
              to: targetSquare,
              initialOffset: closestGridOffsetOnSegment(releaseOffset, fromOffset, toOffset),
            }
          : null;
      dragOriginRef.current = null;
      dragPreviewOriginRef.current = null;
      dragPositionRef.current = null;
      clearDragFrame();
      setDragFrom(null);
      setHoveredSquare(targetSquare);
      setDragPosition(null);
      if (moved) {
        if (targetSquare) playMove(sourceSquare, targetSquare);
      } else {
        handleSquareClick(sourceSquare);
      }
    }

    function handleWindowPointerCancel() {
      dragPreviewOriginRef.current = null;
      dragPositionRef.current = null;
      dragCompletionAnimationHintRef.current = null;
      clearDragFrame();
      setDragFrom(null);
      setHoveredSquare(null);
      setDragPosition(null);
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
  }, [activeSelected, chess, disabled, dragFrom, mode, onSquareClick, selectedSquare]);

  useEffect(() => {
    if (!annotationStart || annotationsDisabled) return;
    const sourceSquare = annotationStart;

    function handleWindowPointerMove(event: PointerEvent) {
      if (annotationKind) {
        setAnnotationHover(squareFromClientPoint(event.clientX, event.clientY));
      }
    }

    function handleWindowPointerUp(event: PointerEvent) {
      const targetSquare = squareFromClientPoint(event.clientX, event.clientY) ?? sourceSquare;
      const origin = annotationOriginRef.current;
      annotationOriginRef.current = null;
      setAnnotationStart(null);
      setAnnotationHover(null);
      setAnnotationKind(null);
      const dx = event.clientX - (origin?.x ?? event.clientX);
      const dy = event.clientY - (origin?.y ?? event.clientY);
      const moved = Math.hypot(dx, dy) > 8 && targetSquare !== sourceSquare;
      if (annotationKind === "circle") {
        if (moved) {
          toggleArrow({ from: sourceSquare, to: targetSquare });
        } else {
          toggleCircle(sourceSquare);
        }
      } else if (moved) {
        toggleArrow({ from: sourceSquare, to: targetSquare });
      } else if (annotationMode === "training") {
        handleSquareClick(sourceSquare);
      } else {
        clearAnnotations();
      }
    }

    function handleWindowPointerCancel() {
      setAnnotationStart(null);
      setAnnotationHover(null);
      setAnnotationKind(null);
      setAnnotationMode("analysis");
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
  }, [annotationKind, annotationMode, annotationStart, annotationsDisabled]);

  useEffect(() => {
    const isHoveredAnnotationCircle = hoveredSquare ? annotationCircles.includes(hoveredSquare) : false;
    const isHoveredEngineTarget = hoveredSquare
      ? engineArrows?.some((arrow) => arrow.to === hoveredSquare) ?? false
      : false;
    onCircleHover?.(isHoveredAnnotationCircle || isHoveredEngineTarget ? hoveredSquare : null);
  }, [engineArrows, hoveredSquare, annotationCircles, onCircleHover]);

  function handleSquareClick(square: string) {
    const engineTarget = bestEngineArrowByTarget.get(square);
    if (engineTarget && onEngineArrowClick) {
      onEngineArrowClick({ from: engineTarget.arrow.from, to: engineTarget.arrow.to });
      return;
    }

    onSquareClick?.(square);

    if (!annotationsDisabled && mode === "analysis") {
      toggleCircle(square);
      return;
    }

    if (disabled || mode !== "training" || !chess) return;

    const piece = chess.get(square as Square);
    const turn = chess.turn();
    if (!activeSelected) {
      if (!piece) {
        clearAnnotations();
        return;
      }
      if (piece?.color === turn) setInternalSelected(square);
      return;
    }

    const move = findLegalMove(chess, activeSelected, square);
    if (move) {
      emitMove(move);
      return;
    }

    if (piece?.color === turn) {
      setInternalSelected(square);
    } else {
      if (!piece) clearAnnotations();
      setInternalSelected(null);
    }
  }

  function handlePointerDown(square: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      if (annotationsDisabled) return;
      annotationOriginRef.current = { x: event.clientX, y: event.clientY };
      setAnnotationStart(square);
      setAnnotationHover(square);
      setAnnotationKind("circle");
      setAnnotationMode(mode);
      return;
    }

    if (event.button !== 0) return;
    if (shouldClearAnnotationsOnPointerDown({ button: event.button, disabled, annotationsDisabled })) {
      event.preventDefault();
      event.stopPropagation();
      clearAnnotations();
      return;
    }
    if (!annotationsDisabled && mode === "analysis") {
      event.preventDefault();
      event.stopPropagation();
      annotationOriginRef.current = { x: event.clientX, y: event.clientY };
      setAnnotationStart(square);
      setAnnotationHover(square);
      setAnnotationKind("arrow");
      setAnnotationMode("analysis");
      return;
    }
    if (mode !== "training" || !chess) return;
    const piece = chess.get(square as Square);
    const isOwnTurnPiece = piece?.color === chess.turn();
    if (!isOwnTurnPiece && !annotationsDisabled) {
      event.preventDefault();
      event.stopPropagation();
      annotationOriginRef.current = { x: event.clientX, y: event.clientY };
      setAnnotationStart(square);
      setAnnotationHover(square);
      setAnnotationKind("arrow");
      setAnnotationMode("training");
      return;
    }

    if (disabled) return;

    event.preventDefault();
    event.stopPropagation();
    const pointer = pointerToBoardPoint(event.clientX, event.clientY);
    dragCompletionAnimationHintRef.current = null;
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    dragPreviewOriginRef.current = {
      pointer,
      center: pointer,
    };
    dragPositionRef.current = isOwnTurnPiece ? pointer : null;
    hoveredSquareRef.current = square;
    setDragFrom(square);
    setHoveredSquare(square);
    setDragPosition(isOwnTurnPiece ? pointer : null);
    if (isOwnTurnPiece) {
      setDragPieceSize(event.currentTarget.getBoundingClientRect().width);
      if (selectedSquare === undefined) setInternalSelected(square);
    }
  }

  function playMove(from: string, to: string) {
    if (!from || disabled || mode !== "training" || !chess) return;
    const move = findLegalMove(chess, from, to);
    if (!move) return;
    emitMove(move);
  }

  function emitMove(move: Move) {
    onMove?.({
      from: move.from,
      to: move.to,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    });
    setInternalSelected(null);
  }

  function toggleCircle(square: string) {
    setAnnotationCircles((current) =>
      current.includes(square)
        ? current.filter((item) => item !== square)
        : [...current, square],
    );
  }

  function toggleArrow(arrow: BoardAnnotationArrow) {
    setAnnotationArrows((current) => {
      const exists = current.some((item) => item.from === arrow.from && item.to === arrow.to);
      return exists
        ? current.filter((item) => !(item.from === arrow.from && item.to === arrow.to))
        : [...current, arrow];
    });
  }

  function clearAnnotations() {
    setAnnotationCircles([]);
    setAnnotationArrows([]);
    setAnnotationStart(null);
    setAnnotationHover(null);
    setAnnotationKind(null);
    setAnnotationMode("analysis");
  }

  const previewArrow =
    annotationKind && annotationStart && annotationHover && annotationStart !== annotationHover
      ? { from: annotationStart, to: annotationHover }
      : null;

  return (
    <div
      ref={boardRef}
      data-snapshot-board
      data-testid={dataTestId}
      className={[
        "relative aspect-square w-full overflow-hidden rounded-[10px] border border-[var(--app-border)] bg-[var(--app-panel-deep)] shadow-[var(--app-shadow)]",
        disabled && annotationsDisabled ? "pointer-events-none" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {boardSquares.map((square, index) => {
          const row = Math.floor(index / 8);
          const col = index % 8;
          const piece = chess?.get(square as Square) ?? null;
          const pieceCode = piece ? pieceCodeForAsset(piece.color, piece.type) : null;
          const isLight = (squareFile(square) + squareRank(square)) % 2 === 1;
          const isSelected = activeSelected === square;
          const isLegal = activeTargets.includes(square);
          const isDragTarget = Boolean(dragFrom && hoveredSquare === square && activeTargets.includes(square));
          const isTurnPieceHover = Boolean(piece && chess && piece.color === chess.turn() && hoveredSquare === square);
          const isOriginEmphasized = isSelected || dragFrom === square || isTurnPieceHover;
          const isLastMoveFrom = lastMove?.from === square;
          const isLastMoveTo = lastMove?.to === square;
          const shouldShowLastMoveBadge = Boolean(lastMoveBadge && lastMove?.to === square);
          const isCheckedKing = checkedKingSquare === square;
          const customHighlight = highlightMap.get(square);
          const squareBaseColor = isLight ? colors.light : colors.dark;

          return (
            <button
              key={square}
              type="button"
              aria-label={square}
              data-square={square}
              className="relative flex min-h-0 min-w-0 touch-none items-center justify-center overflow-hidden"
              style={{
                background: squareBackground(
                  colors,
                  isLight,
                  isSelected || isDragTarget,
                  isLastMoveFrom,
                  isLastMoveTo,
                  isCheckedKing,
                  customHighlight?.color,
                  lastMoveBadge?.color,
                ),
              }}
              onPointerDown={(event) => handlePointerDown(square, event)}
              onPointerEnter={() => { if (!dragFrom) setHoveredSquare(square); }}
              onPointerLeave={() => { if (!dragFrom) setHoveredSquare(null); }}
            >
              {isOriginEmphasized ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[3px] z-[6] border-[3px] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--origin-border)_72%,white)]"
                  style={{
                    "--origin-border": `color-mix(in srgb, ${squareBaseColor} 82%, black)`,
                    borderColor: "var(--origin-border)",
                  } as React.CSSProperties}
                />
              ) : null}

              {showLegalTargets && isLegal ? (
                <span
                  aria-hidden="true"
                  data-legal-target={square}
                  className="pointer-events-none absolute z-[12] h-[22%] w-[22%] rounded-full"
                  style={{
                    background: piece
                      ? "transparent"
                      : "color-mix(in srgb, var(--app-accent) 55%, transparent)",
                    boxShadow: piece
                      ? "inset 0 0 0 4px color-mix(in srgb, var(--app-accent) 70%, transparent)"
                      : "0 0 18px color-mix(in srgb, var(--app-accent) 36%, transparent)",
                    width: piece ? "78%" : undefined,
                    height: piece ? "78%" : undefined,
                  }}
                />
              ) : null}

              {pieceCode ? (
                <img
                  src={pieceAsset(pieceAssetSet, pieceCode)}
                  alt=""
                  draggable={false}
                  className={[
                    "relative z-10 h-[86%] w-[86%] object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.42)]",
                    mode === "training" && piece?.color === chess?.turn() ? "cursor-grab active:cursor-grabbing" : "",
                    dragFrom === square ? "opacity-20" : "",
                    pieceGlides.some((glide) => glide.to === square && glide.pieceCode === pieceCode) ? "opacity-0" : "",
                  ].join(" ")}
                />
              ) : null}


              {coordinates ? (
                <>
                  {col === 0 ? (
                    <span className="pointer-events-none absolute left-1.5 top-1 text-[10px] font-bold leading-none md:text-xs" style={{ color: colors.coord }}>
                      {square[1]}
                    </span>
                  ) : null}
                  {row === 7 ? (
                    <span className="pointer-events-none absolute bottom-1 right-1.5 text-[10px] font-bold leading-none md:text-xs" style={{ color: colors.coord }}>
                      {square[0]}
                    </span>
                  ) : null}
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      <BoardAnnotations
        arrows={previewArrow ? [...annotationArrows, previewArrow] : annotationArrows}
        circles={annotationCircles}
        engineArrows={engineArrows}
        hoveredSquare={hoveredSquare}
        orientation={orientation}
        previewArrow={previewArrow}
        onEngineArrowClick={onEngineArrowClick}
      />
      {lastMoveBadge && lastMove?.to ? (
        <LastMoveBadgeOverlay
          square={lastMove.to}
          badge={lastMoveBadge}
          orientation={orientation}
        />
      ) : null}
      {pieceGlides.map((glide) => (
        <PieceGlideOverlay
          key={glide.id}
          animation={glide}
          orientation={orientation}
          pieceAssetSet={pieceAssetSet}
          glideDurationMs={pieceAnimationDurationMsRef.current}
        />
      ))}
      {dragFrom && dragPosition ? (
        <DraggedPiece
          nodeRef={draggedPieceRef}
          chess={chess}
          pieceAssetSet={pieceAssetSet}
          size={dragPieceSize}
          sourceSquare={dragFrom}
          x={dragPosition.x}
          y={dragPosition.y}
        />
      ) : null}
    </div>
  );
}

function DraggedPiece({
  nodeRef,
  chess,
  pieceAssetSet,
  size,
  sourceSquare,
  x,
  y,
}: {
  nodeRef: RefObject<HTMLDivElement | null>;
  chess: Chess | null;
  pieceAssetSet: string;
  size: number;
  sourceSquare: string;
  x: number;
  y: number;
}) {
  const piece = chess?.get(sourceSquare as Square) ?? null;
  if (!piece) return null;

  return (
    <div
      ref={nodeRef}
      className="pointer-events-none absolute z-[9999] flex items-center justify-center"
      style={{
        left: 0,
        top: 0,
        width: size,
        height: size,
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
        willChange: "transform",
      }}
    >
      <img
        src={pieceAsset(pieceAssetSet, pieceCodeForAsset(piece.color, piece.type))}
        alt=""
        draggable={false}
        className="h-[86%] w-[86%] object-contain drop-shadow-[0_16px_22px_rgba(0,0,0,0.5)]"
      />
    </div>
  );
}

function LastMoveBadgeOverlay({
  square,
  badge,
  orientation,
}: {
  square: string;
  badge: { label: string; icon: string; color: string };
  orientation: BoardOrientation;
}) {
  const offset = squareGridOffset(square, orientation);
  if (!offset) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[80]">
      <div
        className="absolute"
        style={{
          left: `${offset.col * 12.5}%`,
          top: `${offset.row * 12.5}%`,
          width: "12.5%",
          height: "12.5%",
        }}
      >
        <img
          src={badge.icon}
          alt=""
          title={badge.label}
          aria-label={badge.label}
          draggable={false}
          className="absolute right-[4%] top-[4%] h-[28%] w-[28%] min-h-[10px] min-w-[10px] max-h-[18px] max-w-[18px] drop-shadow-[0_2px_5px_rgba(0,0,0,0.45)]"
        />
      </div>
    </div>
  );
}

function PieceGlideOverlay({
  animation,
  orientation,
  pieceAssetSet,
  glideDurationMs,
}: {
  animation: PieceGlideAnimation;
  orientation: BoardOrientation;
  pieceAssetSet: string;
  glideDurationMs: number;
}) {
  const from = animation.initialOffset ?? squareGridOffset(animation.from, orientation);
  const to = squareGridOffset(animation.to, orientation);
  if (!from || !to) return null;

  const target = animation.started ? to : from;

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-[20] flex h-[12.5%] w-[12.5%] items-center justify-center"
      style={{
        transform: `translate(${target.col * 100}%, ${target.row * 100}%)`,
        transition: animation.started
          ? `transform ${glideDurationMs}ms ease-out`
          : "none",
        willChange: "transform",
      }}
    >
      <img
        src={pieceAsset(pieceAssetSet, animation.pieceCode)}
        alt=""
        draggable={false}
        className="h-[86%] w-[86%] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.46)]"
      />
    </div>
  );
}

function engineArrowColor(_rank: number): string {
  return "var(--app-class-best)";
}

function engineArrowOpacity(rank: number): number {
  return 1;
}

function BoardAnnotations({
  arrows,
  circles,
  engineArrows,
  hoveredSquare,
  orientation,
  previewArrow,
  onEngineArrowClick,
}: {
  arrows: BoardAnnotationArrow[];
  circles: string[];
  engineArrows?: EngineArrow[];
  hoveredSquare: string | null;
  orientation: BoardOrientation;
  previewArrow: BoardAnnotationArrow | null;
  onEngineArrowClick?: (move: BoardMove) => void;
}) {
  const [localHoveredEngineIndex, setLocalHoveredEngineIndex] = useState<number | null>(null);
  const hasEngineArrows = (engineArrows?.length ?? 0) > 0;
  const engineTargetNodes = useMemo(() => {
    const bestBySquare = new Map<
      string,
      { arrow: EngineArrow; index: number; rank: number }
    >();

    engineArrows?.forEach((arrow, index) => {
      const rank = arrow.rank ?? index + 1;
      const current = bestBySquare.get(arrow.to);
      if (!current || rank < current.rank) {
        bestBySquare.set(arrow.to, { arrow, index, rank });
      }
    });

    return Array.from(bestBySquare.values()).sort((a, b) => a.index - b.index);
  }, [engineArrows]);

  if (arrows.length === 0 && circles.length === 0 && !hasEngineArrows && !previewArrow) return null;

  return (
    <>
      {/* Engine lines — above pieces so arrows are visible over destination pieces */}
      <svg
        className="pointer-events-none absolute inset-0 z-[30] h-full w-full"
        viewBox="0 0 8 8"
        aria-hidden="true"
      >
        {engineArrows?.map((arrow, index) => {
          const from = squareCenter(arrow.from, orientation);
          const to = squareCenter(arrow.to, orientation);
          if (!from || !to) return null;
          const rank = arrow.rank ?? index + 1;
          const color = arrow.color ?? engineArrowColor(rank);
          const isHoveredTarget = hoveredSquare === arrow.to || index === localHoveredEngineIndex;
          const opacity = arrow.emphasis || isHoveredTarget ? 1 : engineArrowOpacity(rank);
          const nodeRadius = arrow.emphasis || isHoveredTarget ? 0.16 : 0.125;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const lineEndX = to.x - ux * nodeRadius;
          const lineEndY = to.y - uy * nodeRadius;
          return (
            <line
              key={`engine-line-${arrow.from}-${arrow.to}-${index}`}
              x1={from.x}
              y1={from.y}
              x2={lineEndX}
              y2={lineEndY}
              stroke={color}
              strokeWidth={0.024}
              strokeLinecap="butt"
              opacity={opacity}
            />
          );
        })}
      </svg>

      {/* Destination nodes + annotations — above pieces (z-40) */}
      <svg
        className="pointer-events-none absolute inset-0 z-40 h-full w-full"
        viewBox="0 0 8 8"
        aria-hidden="true"
      >
        {engineTargetNodes.map(({ arrow, index, rank }) => {
          const to = squareCenter(arrow.to, orientation);
          if (!to) return null;
          const color = arrow.color ?? engineArrowColor(rank);
          const isHoveredTarget = hoveredSquare === arrow.to || index === localHoveredEngineIndex;
          const opacity = arrow.emphasis || isHoveredTarget ? 1 : engineArrowOpacity(rank);
          const nodeRadius = arrow.emphasis || isHoveredTarget ? 0.16 : 0.125;
          const label = arrow.label ? displayEvalText(arrow.label) : "";
          return (
            <g key={`engine-node-${arrow.from}-${arrow.to}-${index}`} opacity={opacity}>
              {label ? (
                <>
                  <circle
                    cx={to.x}
                    cy={to.y}
                    r={nodeRadius}
                    fill={color}
                    className="pointer-events-auto cursor-pointer"
                    onPointerEnter={() => setLocalHoveredEngineIndex(index)}
                    onPointerLeave={() => setLocalHoveredEngineIndex(null)}
                    onClick={() => onEngineArrowClick?.({ from: arrow.from, to: arrow.to })}
                  />
                  <text
                    x={to.x}
                    y={to.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={label.startsWith("−") ? 0.11 : 0.13}
                    fontWeight={800}
                    className="pointer-events-none"
                    letterSpacing={label.startsWith("−") ? 0 : "0.02em"}
                    fill="#050505"
                    fontFamily="JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                    fontVariant="tabular-nums lining-nums"
                  >
                    {label}
                  </text>
                </>
              ) : null}
            </g>
          );
        })}
        {circles.map((square) => {
          const center = squareCenter(square, orientation);
          return center ? (
            <circle
              key={square}
              cx={center.x}
              cy={center.y}
              r="0.42"
              fill="none"
              stroke="var(--app-accent)"
              strokeWidth="0.08"
              opacity="0.82"
            />
          ) : null;
        })}
        {arrows.map((arrow, index) => {
          const from = squareCenter(arrow.from, orientation);
          const to = squareCenter(arrow.to, orientation);
          if (!from || !to) return null;
          const isPreview = previewArrow?.from === arrow.from && previewArrow?.to === arrow.to && index === arrows.length - 1;
          const geometry = arrowGeometry(from, to);
          return (
            <g
              key={`${arrow.from}-${arrow.to}-${index}`}
              opacity={isPreview ? "0.58" : "0.82"}
            >
              <line
                x1={from.x}
                y1={from.y}
                x2={geometry.lineEnd.x}
                y2={geometry.lineEnd.y}
                stroke="var(--app-accent)"
                strokeWidth="0.17"
                strokeLinecap="round"
              />
              <polygon
                points={geometry.headPoints}
                fill="var(--app-accent)"
              />
            </g>
          );
        })}
      </svg>
    </>
  );
}

function arrowGeometry(from: { x: number; y: number }, to: { x: number; y: number }, headScale = 1.0) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const headLength = 0.38 * headScale;
  const headWidth = 0.44 * headScale;
  const lineEnd = {
    x: to.x - ux * headLength * 0.72,
    y: to.y - uy * headLength * 0.72,
  };
  const base = {
    x: to.x - ux * headLength,
    y: to.y - uy * headLength,
  };
  const px = -uy;
  const py = ux;
  const left = {
    x: base.x + px * headWidth * 0.5,
    y: base.y + py * headWidth * 0.5,
  };
  const right = {
    x: base.x - px * headWidth * 0.5,
    y: base.y - py * headWidth * 0.5,
  };

  return {
    lineEnd,
    headPoints: `${to.x},${to.y} ${left.x},${left.y} ${right.x},${right.y}`,
  };
}

function displayEvalText(text: string) {
  const normalized = String(text || "0.0").replace(/^\+/, "");
  if (/^-\d+(?:\.\d+)?$/.test(normalized)) return `−${normalized.slice(1)}`;
  return normalized;
}

function safeChess(fen: string) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function squareCenter(square: string, orientation: BoardOrientation) {
  const file = FILES.indexOf(square[0] ?? "");
  const rank = RANKS.indexOf(square[1] ?? "");
  if (file < 0 || rank < 0) return null;
  const col = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  return { x: col + 0.5, y: row + 0.5 };
}

function squareGridOffset(square: string, orientation: BoardOrientation) {
  const center = squareCenter(square, orientation);
  if (!center) return null;
  return {
    col: center.x - 0.5,
    row: center.y - 0.5,
  };
}

function closestGridOffsetOnSegment(
  point: BoardGridOffset,
  from: BoardGridOffset,
  to: BoardGridOffset,
): BoardGridOffset {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return from;

  const rawT = ((point.col - from.col) * dx + (point.row - from.row) * dy) / lengthSquared;
  const t = Math.min(1, Math.max(0, rawT));
  return {
    col: from.col + dx * t,
    row: from.row + dy * t,
  };
}

function boardPieceSnapshots(chess: Chess): BoardPieceSnapshot[] {
  const pieces: BoardPieceSnapshot[] = [];
  for (const square of allBoardSquares()) {
    const piece = chess.get(square as Square);
    if (piece) {
      pieces.push({ square, color: piece.color, type: piece.type });
    }
  }
  return pieces;
}

function inferCastlingGlideMoves(previousChess: Chess, nextChess: Chess) {
  const previousPieces = boardPieceSnapshots(previousChess);
  const nextPieces = boardPieceSnapshots(nextChess);

  function hasPiece(pieces: BoardPieceSnapshot[], square: string, color: "w" | "b", type: string) {
    return pieces.some((piece) => piece.square === square && piece.color === color && piece.type === type);
  }

  function castleGlide(input: {
    color: "w" | "b";
    kingFrom: string;
    kingTo: string;
    rookFrom: string;
    rookTo: string;
  }) {
    const { color, kingFrom, kingTo, rookFrom, rookTo } = input;

    if (
      hasPiece(previousPieces, kingFrom, color, "k") &&
      hasPiece(previousPieces, rookFrom, color, "r") &&
      hasPiece(nextPieces, kingTo, color, "k") &&
      hasPiece(nextPieces, rookTo, color, "r")
    ) {
      return [
        {
          from: kingFrom,
          to: kingTo,
          pieceCode: pieceCodeForAsset(color, "k"),
        },
        {
          from: rookFrom,
          to: rookTo,
          pieceCode: pieceCodeForAsset(color, "r"),
        },
      ];
    }

    return [];
  }

  const candidates = [
    // White king-side castle: forward and reverse
    castleGlide({ color: "w", kingFrom: "e1", kingTo: "g1", rookFrom: "h1", rookTo: "f1" }),
    castleGlide({ color: "w", kingFrom: "g1", kingTo: "e1", rookFrom: "f1", rookTo: "h1" }),

    // White queen-side castle: forward and reverse
    castleGlide({ color: "w", kingFrom: "e1", kingTo: "c1", rookFrom: "a1", rookTo: "d1" }),
    castleGlide({ color: "w", kingFrom: "c1", kingTo: "e1", rookFrom: "d1", rookTo: "a1" }),

    // Black king-side castle: forward and reverse
    castleGlide({ color: "b", kingFrom: "e8", kingTo: "g8", rookFrom: "h8", rookTo: "f8" }),
    castleGlide({ color: "b", kingFrom: "g8", kingTo: "e8", rookFrom: "f8", rookTo: "h8" }),

    // Black queen-side castle: forward and reverse
    castleGlide({ color: "b", kingFrom: "e8", kingTo: "c8", rookFrom: "a8", rookTo: "d8" }),
    castleGlide({ color: "b", kingFrom: "c8", kingTo: "e8", rookFrom: "d8", rookTo: "a8" }),
  ];

  return candidates.find((candidate) => candidate.length > 0) ?? [];
}

function inferPieceGlideMoves(previousChess: Chess, nextChess: Chess) {
  const castlingGlides = inferCastlingGlideMoves(previousChess, nextChess);
  if (castlingGlides.length > 0) return castlingGlides;

  const singleMove = inferPieceGlideMove(previousChess, nextChess);
  return singleMove ? [singleMove] : [];
}

function inferPieceGlideMove(previousChess: Chess, currentChess: Chess): {
  from: string;
  to: string;
  pieceCode: string;
} | null {
  const disappeared: BoardPieceSnapshot[] = [];
  const appeared: BoardPieceSnapshot[] = [];

  for (const square of allBoardSquares()) {
    const previousPiece = previousChess.get(square as Square);
    const currentPiece = currentChess.get(square as Square);

    const isSamePiece =
      previousPiece &&
      currentPiece &&
      previousPiece.color === currentPiece.color &&
      previousPiece.type === currentPiece.type;

    if (previousPiece && !isSamePiece) {
      disappeared.push({
        square,
        color: previousPiece.color,
        type: previousPiece.type,
      });
    }

    if (currentPiece && !isSamePiece) {
      appeared.push({
        square,
        color: currentPiece.color,
        type: currentPiece.type,
      });
    }
  }

  const isCleanMoveTransition =
    (disappeared.length === 1 && appeared.length === 1) ||
    (disappeared.length === 2 && appeared.length === 1) ||
    (disappeared.length === 1 && appeared.length === 2);

  if (!isCleanMoveTransition) {
    return null;
  }

  const candidates = disappeared.flatMap((fromPiece) =>
    appeared
      .filter((toPiece) => toPiece.color === fromPiece.color && toPiece.type === fromPiece.type)
      .map((toPiece) => ({
        from: fromPiece.square,
        to: toPiece.square,
        pieceCode: pieceCodeForAsset(toPiece.color, toPiece.type),
        distance: squareDistance(fromPiece.square, toPiece.square),
      })),
  );

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => left.distance - right.distance);
  const best = candidates[0];

  const sameColorTypeMatches = candidates.filter((candidate) => candidate.distance === best.distance);
  if (sameColorTypeMatches.length > 1) return null;

  return {
    from: best.from,
    to: best.to,
    pieceCode: best.pieceCode,
  };
}

function allBoardSquares() {
  const squares: string[] = [];
  for (const file of FILES) {
    for (const rank of RANKS) {
      squares.push(`${file}${rank}`);
    }
  }
  return squares;
}

function squareDistance(from: string, to: string) {
  const fromFile = FILES.indexOf(from[0]);
  const fromRank = RANKS.indexOf(from[1]);
  const toFile = FILES.indexOf(to[0]);
  const toRank = RANKS.indexOf(to[1]);
  if (fromFile === -1 || fromRank === -1 || toFile === -1 || toRank === -1) return Number.POSITIVE_INFINITY;
  return Math.hypot(toFile - fromFile, toRank - fromRank);
}

function squaresForOrientation(orientation: BoardOrientation) {
  const ranks = orientation === "white" ? [...RANKS].reverse() : RANKS;
  const files = orientation === "white" ? FILES : [...FILES].reverse();
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));
}

function legalMovesFrom(chess: Chess, square: string) {
  return (chess.moves({ square: square as Square, verbose: true }) as Move[]).map((move) => move.to);
}

function findLegalMove(chess: Chess, from: string, to: string) {
  const moves = chess.moves({ square: from as Square, verbose: true }) as Move[];
  return moves.find((move) => move.to === to) ?? null;
}

function normalizeHighlights(highlights: AnalysisBoardProps["highlightedSquares"]) {
  const map = new Map<string, BoardHighlight>();
  if (!highlights) return map;

  if (Array.isArray(highlights)) {
    for (const highlight of highlights) map.set(highlight.square, highlight);
    return map;
  }

  for (const [square, color] of Object.entries(highlights)) {
    map.set(square, { square, color });
  }
  return map;
}

function squareBackground(
  colors: { light: string; dark: string },
  isLight: boolean,
  isSelected: boolean,
  isLastMoveFrom: boolean,
  isLastMoveTo: boolean,
  isCheckedKing: boolean,
  customColor?: string,
  lastMoveColor?: string,
) {
  const base = isLight ? colors.light : colors.dark;
  if (customColor) return customColor;
  if (isCheckedKing) return "color-mix(in srgb, var(--app-class-blunder) 72%, #2a0808 28%)";
  if (isSelected) return "color-mix(in srgb, var(--app-accent) 58%, #6aa68d 42%)";
  if (isLastMoveFrom) return `color-mix(in srgb, ${lastMoveColor ?? "var(--app-accent)"} 34%, transparent)`;
  if (isLastMoveTo) return `color-mix(in srgb, ${lastMoveColor ?? "var(--app-accent)"} 52%, transparent)`;
  return base;
}

function findCheckedKingSquare(chess: Chess | null) {
  if (!chess?.isCheck()) return null;
  const turn = chess.turn();
  for (const square of FILES.flatMap((file) => RANKS.map((rank) => `${file}${rank}`))) {
    const piece = chess.get(square as Square);
    if (piece?.type === "k" && piece.color === turn) return square;
  }
  return null;
}

function pieceCodeForAsset(color: string, type: string) {
  const letter = type.toUpperCase();
  return `${color}${letter}`;
}

function pieceAsset(assetSet: string, code: string) {
  return `/analyze/pieces/${assetSet}/${code}.svg`;
}

function squareFile(square: string) {
  return square.charCodeAt(0) - 97;
}

function squareRank(square: string) {
  return Number(square[1]);
}
