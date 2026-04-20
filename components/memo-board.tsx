"use client";

import type { CSSProperties } from "react";
import type { MemoArrow, MemoSquareHighlight } from "@/lib/memos/types";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;
const CELL_SIZE = 12.5;
const PIECE_BASE_PATH = "/analyze/pieces/cburnett";

interface MemoBoardProps {
  fen: string;
  orientation?: "white" | "black" | null;
  arrows?: MemoArrow[];
  highlightedSquares?: MemoSquareHighlight[];
  className?: string;
}

type PieceMap = Map<string, string>;

function boardOrder(orientation: "white" | "black") {
  return orientation === "black"
    ? {
        files: [...FILES].reverse(),
        ranks: [...RANKS].reverse(),
      }
    : {
        files: [...FILES],
        ranks: [...RANKS],
      };
}

function squareToPoint(square: string, orientation: "white" | "black") {
  const fileIndex = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rankIndex = RANKS.indexOf(square[1] as (typeof RANKS)[number]);
  if (fileIndex < 0 || rankIndex < 0) {
    return null;
  }

  const x = orientation === "white" ? fileIndex : 7 - fileIndex;
  const y = orientation === "white" ? rankIndex : 7 - rankIndex;

  return {
    x: x * CELL_SIZE + CELL_SIZE / 2,
    y: y * CELL_SIZE + CELL_SIZE / 2,
  };
}

function pieceCode(symbol: string) {
  const isWhite = symbol === symbol.toUpperCase();
  return `${isWhite ? "w" : "b"}${symbol.toUpperCase()}`;
}

function parseFenPieces(fen: string): PieceMap {
  const board = fen.split(" ")[0] || "";
  const rows = board.split("/");
  const pieces = new Map<string, string>();

  rows.forEach((row, rowIndex) => {
    let fileIndex = 0;
    for (const token of row) {
      const skip = Number.parseInt(token, 10);
      if (Number.isFinite(skip)) {
        fileIndex += skip;
        continue;
      }

      const file = FILES[fileIndex];
      const rank = String(8 - rowIndex) as (typeof RANKS)[number];
      if (file && /^[prnbqkPRNBQK]$/.test(token)) {
        pieces.set(`${file}${rank}`, pieceCode(token));
      }
      fileIndex += 1;
    }
  });

  return pieces;
}

function arrowPolygon(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const unitX = dx / length;
  const unitY = dy / length;
  const headLength = 3.8;
  const headWidth = 3.2;
  const baseX = to.x - unitX * headLength;
  const baseY = to.y - unitY * headLength;
  const perpX = -unitY;
  const perpY = unitX;

  return [
    `${to.x},${to.y}`,
    `${baseX + perpX * headWidth},${baseY + perpY * headWidth}`,
    `${baseX - perpX * headWidth},${baseY - perpY * headWidth}`,
  ].join(" ");
}

function highlightStyle(color: string | null | undefined): CSSProperties {
  return {
    background:
      color || "color-mix(in srgb, var(--app-accent) 28%, transparent)",
  };
}

export function MemoBoard({
  fen,
  orientation = "white",
  arrows = [],
  highlightedSquares = [],
  className = "",
}: MemoBoardProps) {
  const resolvedOrientation = orientation === "black" ? "black" : "white";
  const { files, ranks } = boardOrder(resolvedOrientation);
  const pieces = parseFenPieces(fen);

  return (
    <div
      className={[
        "relative aspect-square w-full overflow-hidden border border-[var(--app-border)] bg-[var(--app-panel-solid)] shadow-[4px_4px_0_var(--app-shell-shadow)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {ranks.flatMap((rank, rowIndex) =>
          files.map((file, colIndex) => {
            const square = `${file}${rank}`;
            const isLight = (rowIndex + colIndex) % 2 === 0;
            const piece = pieces.get(square);
            const highlight = highlightedSquares.find(
              (entry) => entry.square === square,
            );

            return (
              <div
                key={square}
                className={[
                  "relative flex items-center justify-center",
                  isLight ? "bg-[#ddd7c7]" : "bg-[#7b6a58]",
                ].join(" ")}
              >
                {highlight ? (
                  <div className="absolute inset-0 opacity-80" style={highlightStyle(highlight.color)} />
                ) : null}
                {piece ? (
                  <img
                    src={`${PIECE_BASE_PATH}/${piece}.svg`}
                    alt={piece}
                    className="relative z-10 h-[88%] w-[88%] select-none"
                    draggable={false}
                  />
                ) : null}
              </div>
            );
          }),
        )}
      </div>

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        {arrows.map((arrow, index) => {
          const from = squareToPoint(arrow.from, resolvedOrientation);
          const to = squareToPoint(arrow.to, resolvedOrientation);
          if (!from || !to) return null;
          const stroke =
            arrow.color ||
            "color-mix(in srgb, var(--app-accent) 84%, rgba(255,255,255,0.18))";

          return (
            <g key={`${arrow.from}-${arrow.to}-${index}`}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={stroke}
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity="0.85"
              />
              <polygon
                points={arrowPolygon(from, to)}
                fill={stroke}
                opacity="0.9"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
