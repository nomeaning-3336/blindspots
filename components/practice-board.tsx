"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import type { AnalyzePieceTheme } from "@/lib/analyze-preferences";
import type { PracticeColor } from "@/lib/practice";
import styles from "./practice.module.css";

type PromotionPiece = "q" | "r" | "b" | "n";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const PIECE_THEME_ASSET_SET: Record<AnalyzePieceTheme, string> = {
  cburnett: "cburnett",
  "alpha-wood": "alpha",
  maestro: "maestro",
  smart: "merida",
  "staunty-wood": "staunty",
  governor: "governor",
  companion: "companion",
};

function pieceAsset(
  pieceTheme: AnalyzePieceTheme,
  color: "w" | "b",
  type: string,
) {
  const pieceMap: Record<string, string> = {
    p: "P",
    n: "N",
    b: "B",
    r: "R",
    q: "Q",
    k: "K",
  };
  const pieceCode = pieceMap[type] || "P";
  const assetSet = PIECE_THEME_ASSET_SET[pieceTheme] || PIECE_THEME_ASSET_SET.maestro;
  return `/analyze/pieces/${assetSet}/${color}${pieceCode}.svg`;
}

function boardSquares(orientation: PracticeColor) {
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w"
    ? [8, 7, 6, 5, 4, 3, 2, 1]
    : [1, 2, 3, 4, 5, 6, 7, 8];

  return ranks.flatMap((rank) =>
    files.map((file) => `${file}${rank}`),
  );
}

function squareFromClientPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  orientation: PracticeColor,
) {
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return null;
  }

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const fileIndex = Math.max(0, Math.min(7, Math.floor((localX / rect.width) * 8)));
  const rankIndex = Math.max(0, Math.min(7, Math.floor((localY / rect.height) * 8)));
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w"
    ? [8, 7, 6, 5, 4, 3, 2, 1]
    : [1, 2, 3, 4, 5, 6, 7, 8];

  return `${files[fileIndex]}${ranks[rankIndex]}`;
}

function pieceAtSquare(chess: Chess, square: string) {
  const fileIndex = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rankIndex = 8 - Number(square[1]);
  return chess.board()[rankIndex]?.[fileIndex] || null;
}

type DragState = {
  from: string;
  pieceSrc: string;
  startLocalX: number;
  startLocalY: number;
  localX: number;
  localY: number;
  size: number;
  moved: boolean;
};

interface PracticeBoardProps {
  fen: string;
  orientation: PracticeColor;
  canInteract: boolean;
  playerColor: PracticeColor;
  pieceTheme: AnalyzePieceTheme;
  lastMoveUci: string | null;
  lightSquare: string;
  darkSquare: string;
  onMove: (move: { from: string; to: string; promotion?: PromotionPiece }) => void;
}

export function PracticeBoard({
  fen,
  orientation,
  canInteract,
  playerColor,
  pieceTheme,
  lastMoveUci,
  lightSquare,
  darkSquare,
  onMove,
}: PracticeBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [promotionRequest, setPromotionRequest] = useState<Move | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const boardShellRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);

  const chess = useMemo(() => new Chess(fen), [fen]);
  const squares = useMemo(() => boardSquares(orientation), [orientation]);

  const legalMovesBySquare = useMemo(() => {
    const map = new Map<string, Move[]>();
    for (const square of squares) {
      const moves = chess.moves({ square: square as Square, verbose: true });
      if (moves.length) map.set(square, moves);
    }
    return map;
  }, [chess, squares]);

  const selectedMoves = selectedSquare
    ? legalMovesBySquare.get(selectedSquare) || []
    : [];

  const lastMoveSquares = useMemo(() => {
    if (!lastMoveUci || lastMoveUci.length < 4) return new Set<string>();
    const from = lastMoveUci.slice(0, 2);
    const to = lastMoveUci.slice(2, 4);
    return new Set([from, to]);
  }, [lastMoveUci]);

  useEffect(() => {
    setSelectedSquare(null);
    setPromotionRequest(null);
    setDragState(null);
  }, [fen]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = boardShellRef.current?.getBoundingClientRect();
      if (!rect) return;
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const travelled = Math.hypot(
        localX - dragState.startLocalX,
        localY - dragState.startLocalY,
      );

      setDragState((current) =>
        current
          ? {
              ...current,
              localX,
              localY,
              size: rect.width / 8,
              moved: current.moved || travelled > 6,
            }
          : null,
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const rect = boardShellRef.current?.getBoundingClientRect();
      const targetSquare = rect
        ? squareFromClientPoint(event.clientX, event.clientY, rect, orientation)
        : null;
      const sourceSquare = dragState.from;
      const sourceMoves = legalMovesBySquare.get(sourceSquare) || [];
      const matchingMove = targetSquare
        ? sourceMoves.find((move) => move.to === targetSquare)
        : null;

      if (dragState.moved) {
        suppressClickRef.current = true;
      }

      if (matchingMove) {
        commitMove(matchingMove);
      } else if (targetSquare) {
        const targetPiece = pieceAtSquare(chess, targetSquare);
        if (targetPiece && targetPiece.color === playerColor) {
          setSelectedSquare(targetSquare);
        } else if (!dragState.moved && targetSquare === sourceSquare) {
          setSelectedSquare(sourceSquare);
        } else {
          setSelectedSquare(null);
        }
      } else {
        setSelectedSquare(null);
      }

      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    chess,
    commitMove,
    dragState,
    legalMovesBySquare,
    orientation,
    playerColor,
  ]);

  function commitMove(move: Move) {
    if (move.promotion) {
      setPromotionRequest(move);
      return;
    }
    onMove({ from: move.from, to: move.to });
    setSelectedSquare(null);
  }

  function handleSquareClick(square: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!canInteract) return;
    const piece = pieceAtSquare(chess, square);

    if (selectedSquare) {
      const matchingMove = selectedMoves.find((move) => move.to === square);
      if (matchingMove) {
        commitMove(matchingMove);
        return;
      }
    }

    if (piece && piece.color === playerColor) {
      setSelectedSquare(square);
      return;
    }

    setSelectedSquare(null);
  }

  function handlePiecePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    square: string,
    piece: NonNullable<ReturnType<typeof pieceAtSquare>>,
  ) {
    if (!canInteract || piece.color !== playerColor) return;
    const rect = boardShellRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    setSelectedSquare(square);
    setDragState({
      from: square,
      pieceSrc: pieceAsset(pieceTheme, piece.color, piece.type),
      startLocalX: event.clientX - rect.left,
      startLocalY: event.clientY - rect.top,
      localX: event.clientX - rect.left,
      localY: event.clientY - rect.top,
      size: rect.width / 8,
      moved: false,
    });
  }

  return (
    <div
      ref={boardShellRef}
      className={styles.boardShell}
      style={
        {
          "--practice-board-light": lightSquare,
          "--practice-board-dark": darkSquare,
        } as CSSProperties
      }
    >
      <div className={styles.boardGrid}>
        {squares.map((square, index) => {
          const piece = pieceAtSquare(chess, square);
          const isLight = (index + Math.floor(index / 8)) % 2 === 0;
          const legalMove = selectedMoves.find((move) => move.to === square) || null;
          const isCapture = Boolean(legalMove?.captured);
          const isLastMove = lastMoveSquares.has(square);
          const isSelected = selectedSquare === square;

          return (
            <button
              key={square}
              type="button"
              className={`${styles.square} ${
                isLight ? styles.squareLight : styles.squareDark
              } ${isSelected ? styles.squareSelected : ""} ${
                isLastMove ? styles.squareLastMove : ""
              }`}
              onPointerDown={
                piece && piece.color === playerColor
                  ? (event) => handlePiecePointerDown(event, square, piece)
                  : undefined
              }
              onClick={() => handleSquareClick(square)}
              aria-label={square}
            >
              {legalMove ? (
                isCapture ? (
                  <span className={styles.legalCapture} />
                ) : (
                  <span className={styles.legalHint} />
                )
              ) : null}
              {piece ? (
                <img
                  className={`${styles.piece} ${
                    dragState?.from === square && dragState.moved
                      ? styles.pieceDraggingOrigin
                      : ""
                  }`}
                  src={pieceAsset(pieceTheme, piece.color, piece.type)}
                  alt={`${piece.color}${piece.type}`}
                  draggable={false}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {dragState?.moved ? (
        <img
          className={styles.dragPiece}
          src={dragState.pieceSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            left: `${dragState.localX}px`,
            top: `${dragState.localY}px`,
            width: `${dragState.size}px`,
            height: `${dragState.size}px`,
          }}
        />
      ) : null}

      {promotionRequest ? (
        <div className={styles.promotionOverlay}>
          <div className={styles.promotionCard}>
            <div className={styles.setupSectionTitle}>Choose Promotion</div>
            <div className={styles.promotionGrid}>
              {(["q", "r", "b", "n"] as PromotionPiece[]).map((piece) => (
                <button
                  key={`promotion-${piece}`}
                  type="button"
                  className={styles.promotionButton}
                  onClick={() => {
                    onMove({
                      from: promotionRequest.from,
                      to: promotionRequest.to,
                      promotion: piece,
                    });
                    setPromotionRequest(null);
                    setSelectedSquare(null);
                  }}
                >
                  <img
                    src={pieceAsset(pieceTheme, playerColor, piece)}
                    alt={`Promote to ${piece}`}
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
