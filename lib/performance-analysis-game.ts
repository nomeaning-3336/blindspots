import { Chess } from "chess.js";
import type { ClientAnalysisTaskGame } from "./performance-client-analysis";
import type { PieceType } from "./chess-performance-report";

export interface ResolvedClientAnalysisGame {
  movesUci: string[];
  userMovePieceTypes: PieceType[];
}

export function resolveClientAnalysisGame(
  game: ClientAnalysisTaskGame,
): ResolvedClientAnalysisGame | null {
  const existingPieceTypes = sanitizePieceTypes(game.userMovePieceTypes);
  const moveTokens = parseMoveTokens(game.movesUci);
  const fromMoveList = resolveMoveTokens(moveTokens, game.userColor, existingPieceTypes);

  if (fromMoveList) {
    return fromMoveList;
  }

  if (!game.pgn) return null;

  try {
    const chess = new Chess();
    chess.loadPgn(game.pgn, { strict: false });
    const history = chess.history({ verbose: true });
    if (history.length === 0) return null;

    const movesUci = history.map((entry) => `${entry.from}${entry.to}${entry.promotion ?? ""}`);
    const derivedPieceTypes = history
      .filter((_, index) => isUserMoveIndex(index, game.userColor))
      .map((entry) => pieceTypeFromLetter(entry.piece))
      .filter(isPieceType);

    return {
      movesUci,
      userMovePieceTypes: selectPieceTypes(
        existingPieceTypes,
        derivedPieceTypes,
        getExpectedUserMoveCount(movesUci.length, game.userColor),
      ),
    };
  } catch {
    return null;
  }
}

export function resolveClientAnalysisMoveCount(game: ClientAnalysisTaskGame) {
  const moveTokens = parseMoveTokens(game.movesUci);
  if (moveTokens.length > 0) {
    return getExpectedUserMoveCount(moveTokens.length, game.userColor);
  }

  return null;
}

function resolveMoveTokens(
  moveTokens: string[],
  userColor: ClientAnalysisTaskGame["userColor"],
  existingPieceTypes: PieceType[],
): ResolvedClientAnalysisGame | null {
  if (moveTokens.length === 0) return null;

  try {
    const chess = new Chess();
    const movesUci: string[] = [];
    const whitePieces: PieceType[] = [];
    const blackPieces: PieceType[] = [];

    // Some providers already cache UCI tokens while others cache SAN tokens.
    // chess.js can normalize both formats into legal move objects for us.
    moveTokens.forEach((token, index) => {
      const played = chess.move(token, { strict: false });
      if (!played) {
        throw new Error("Invalid move token");
      }

      movesUci.push(`${played.from}${played.to}${played.promotion ?? ""}`);
      const pieceType = pieceTypeFromLetter(played.piece);
      if (!pieceType) return;

      if (index % 2 === 0) {
        whitePieces.push(pieceType);
      } else {
        blackPieces.push(pieceType);
      }
    });

    const derivedPieceTypes = userColor === "white" ? whitePieces : blackPieces;
    return {
      movesUci,
      userMovePieceTypes: selectPieceTypes(
        existingPieceTypes,
        derivedPieceTypes,
        getExpectedUserMoveCount(movesUci.length, userColor),
      ),
    };
  } catch {
    return null;
  }
}

function sanitizePieceTypes(pieceTypes: PieceType[] | undefined) {
  return (pieceTypes ?? []).filter(isPieceType);
}

function parseMoveTokens(moves?: string) {
  return moves
    ?.split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean) ?? [];
}

function selectPieceTypes(
  existingPieceTypes: PieceType[],
  derivedPieceTypes: PieceType[],
  expectedMoveCount: number,
) {
  if (existingPieceTypes.length === expectedMoveCount) {
    return [...existingPieceTypes];
  }

  if (derivedPieceTypes.length === expectedMoveCount) {
    return derivedPieceTypes;
  }

  if (existingPieceTypes.length > 0) {
    return [...existingPieceTypes];
  }

  return derivedPieceTypes;
}

function getExpectedUserMoveCount(
  totalPlies: number,
  userColor: ClientAnalysisTaskGame["userColor"],
) {
  return userColor === "white"
    ? Math.ceil(totalPlies / 2)
    : Math.floor(totalPlies / 2);
}

function isUserMoveIndex(
  moveIndex: number,
  userColor: ClientAnalysisTaskGame["userColor"],
) {
  return (moveIndex % 2 === 0 && userColor === "white") || (moveIndex % 2 === 1 && userColor === "black");
}

function pieceTypeFromLetter(piece: string | undefined): PieceType | null {
  if (!piece) return null;
  if (piece === "p") return "pawn";
  if (piece === "n") return "knight";
  if (piece === "b") return "bishop";
  if (piece === "r") return "rook";
  if (piece === "q") return "queen";
  if (piece === "k") return "king";
  return null;
}

function isPieceType(value: string | null): value is PieceType {
  return value !== null;
}
