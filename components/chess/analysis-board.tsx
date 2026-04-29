"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Chess } from "chess.js";
import type { Move, Square } from "chess.js";
import { shouldClearAnnotationsOnPointerDown } from "@/lib/board-annotations";
import { dragPreviewPosition } from "@/lib/board-drag-preview";
import type { AnalyzeBoardTheme, AnalyzePieceTheme } from "@/lib/analyze-preferences";
import type { LastMoveBadge } from "@/lib/training-board-ui";

type BoardOrientation = "white" | "black";
type BoardMode = "analysis" | "training";
type BoardAnnotationArrow = { from: string; to: string };

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
    if (!dragFrom || disabled || mode !== "training" || !chess) return;
    const sourceSquare = dragFrom;

    function handleWindowPointerMove(event: PointerEvent) {
      const previewOrigin = dragPreviewOriginRef.current;
      setDragPosition(
        previewOrigin
          ? dragPreviewPosition({
              pointer: { x: event.clientX, y: event.clientY },
              originPointer: previewOrigin.pointer,
              originCenter: previewOrigin.center,
            })
          : { x: event.clientX, y: event.clientY },
      );
      setHoveredSquare(squareFromPoint(event.clientX, event.clientY));
    }

    function handleWindowPointerUp(event: PointerEvent) {
      const targetSquare = squareFromPoint(event.clientX, event.clientY);
      const origin = dragOriginRef.current;
      dragOriginRef.current = null;
      dragPreviewOriginRef.current = null;
      setDragFrom(null);
      setHoveredSquare(targetSquare);
      setDragPosition(null);
      const dx = event.clientX - (origin?.x ?? event.clientX);
      const dy = event.clientY - (origin?.y ?? event.clientY);
      if (Math.hypot(dx, dy) > 8) {
        if (targetSquare) playMove(sourceSquare, targetSquare);
      } else {
        handleSquareClick(sourceSquare);
      }
    }

    function handleWindowPointerCancel() {
      dragPreviewOriginRef.current = null;
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
        setAnnotationHover(squareFromPoint(event.clientX, event.clientY));
      }
    }

    function handleWindowPointerUp(event: PointerEvent) {
      const targetSquare = squareFromPoint(event.clientX, event.clientY) ?? sourceSquare;
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
    const pointer = { x: event.clientX, y: event.clientY };
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    dragPreviewOriginRef.current = {
      pointer,
      center: pointer,
    };
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
                  ].join(" ")}
                />
              ) : null}

              {shouldShowLastMoveBadge && lastMoveBadge ? (
                <span
                  className="pointer-events-none absolute right-1 top-1 z-[24] grid h-5 w-5 place-items-center"
                  title={lastMoveBadge.label}
                  aria-label={lastMoveBadge.label}
                >
                  <img
                    src={lastMoveBadge.icon}
                    alt=""
                    className="h-5 w-5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
                    draggable={false}
                  />
                </span>
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
      {dragFrom && dragPosition ? (
        <DraggedPiece
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
  chess,
  pieceAssetSet,
  size,
  sourceSquare,
  x,
  y,
}: {
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
      className="pointer-events-none fixed z-[9999] flex items-center justify-center"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
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
  if (arrows.length === 0 && circles.length === 0 && !hasEngineArrows && !previewArrow) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-40 h-full w-full"
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
        const nodeRadius = arrow.emphasis || isHoveredTarget ? 0.18 : 0.14;
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
            strokeWidth={0.03}
            strokeLinecap="butt"
            opacity={opacity}
          />
        );
      })}
      {engineArrows?.map((arrow, index) => {
        const to = squareCenter(arrow.to, orientation);
        if (!to) return null;
        const rank = arrow.rank ?? index + 1;
        const color = arrow.color ?? engineArrowColor(rank);
        const isHoveredTarget = hoveredSquare === arrow.to || index === localHoveredEngineIndex;
        const opacity = arrow.emphasis || isHoveredTarget ? 1 : engineArrowOpacity(rank);
        const nodeRadius = arrow.emphasis || isHoveredTarget ? 0.18 : 0.14;
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
                  fontSize={label.startsWith("−") ? 0.125 : 0.145}
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

function squareFromPoint(clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY);
  const squareElement = element?.closest("[data-square]");
  return squareElement instanceof HTMLElement ? squareElement.dataset.square ?? null : null;
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
