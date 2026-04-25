"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import type { Move, Square } from "chess.js";
import type { AnalyzeBoardTheme, AnalyzePieceTheme } from "@/lib/analyze-preferences";

type BoardOrientation = "white" | "black";
type BoardMode = "analysis" | "training";

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

export type AnalysisBoardProps = {
  fen: string;
  orientation?: BoardOrientation;
  selectedSquare?: string | null;
  legalTargets?: string[];
  highlightedSquares?: Record<string, string> | BoardHighlight[];
  arrows?: unknown;
  lastMove?: { from: string; to: string } | null;
  disabled?: boolean;
  coordinates?: boolean;
  mode?: BoardMode;
  boardTheme?: AnalyzeBoardTheme;
  pieceTheme?: AnalyzePieceTheme;
  onMove?: (move: BoardMove) => void;
  onSquareClick?: (square: string) => void;
  className?: string;
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
  disabled = false,
  coordinates = true,
  mode = "analysis",
  boardTheme = "midnight",
  pieceTheme = "maestro",
  onMove,
  onSquareClick,
  className = "",
}: AnalysisBoardProps) {
  const chess = useMemo(() => safeChess(fen), [fen]);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const activeSelected = selectedSquare !== undefined ? selectedSquare : internalSelected;
  const highlightMap = useMemo(() => normalizeHighlights(highlightedSquares), [highlightedSquares]);
  const boardSquares = useMemo(() => squaresForOrientation(orientation), [orientation]);
  const colors = BOARD_THEMES[boardTheme] ?? BOARD_THEMES.midnight;
  const pieceAssetSet = PIECE_ASSET_SETS[pieceTheme] ?? PIECE_ASSET_SETS.maestro;
  const computedTargets = useMemo(
    () => activeSelected && chess ? legalMovesFrom(chess, activeSelected) : [],
    [activeSelected, chess],
  );
  const activeTargets = legalTargets ?? computedTargets;

  useEffect(() => {
    setInternalSelected(null);
  }, [fen]);

  function handleSquareClick(square: string) {
    onSquareClick?.(square);
    if (disabled || mode !== "training" || !chess) return;

    const piece = chess.get(square as Square);
    const turn = chess.turn();
    if (!activeSelected) {
      if (piece?.color === turn) setInternalSelected(square);
      return;
    }

    const move = findLegalMove(chess, activeSelected, square);
    if (move) {
      onMove?.({
        from: move.from,
        to: move.to,
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      });
      setInternalSelected(null);
      return;
    }

    if (piece?.color === turn) {
      setInternalSelected(square);
    } else {
      setInternalSelected(null);
    }
  }

  return (
    <div
      className={[
        "relative aspect-square w-full overflow-hidden rounded-[10px] border border-[var(--app-border)] bg-[var(--app-panel-deep)] shadow-[var(--app-shadow)]",
        disabled ? "pointer-events-none opacity-80" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
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
          const isLastMove = lastMove?.from === square || lastMove?.to === square;
          const customHighlight = highlightMap.get(square);

          return (
            <button
              key={square}
              type="button"
              aria-label={square}
              className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden"
              style={{
                background: squareBackground(colors, isLight, isSelected, isLastMove, customHighlight?.color),
              }}
              onClick={() => handleSquareClick(square)}
            >
              {isLegal ? (
                <span
                  aria-hidden="true"
                  className="absolute h-[22%] w-[22%] rounded-full"
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
                  className="relative z-10 h-[86%] w-[86%] object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.42)]"
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
    </div>
  );
}

function safeChess(fen: string) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
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
  isLastMove: boolean,
  customColor?: string,
) {
  const base = isLight ? colors.light : colors.dark;
  if (customColor) return customColor;
  if (isSelected) return "color-mix(in srgb, var(--app-accent) 58%, #6aa68d 42%)";
  if (isLastMove) return "color-mix(in srgb, var(--app-accent) 38%, #5aa37f 62%)";
  return base;
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
