import { NextResponse } from "next/server";

interface ElitePosition {
  id: string;
  fen: string;
  played_move: string;
  game_id: number;
  ply: number;
  move_number: number;
  white_elo: string;
  black_elo: string;
  result: string;
  opening: string;
  lichess_url: string;
}

interface ParsedFen {
  pieces: Map<string, { type: string; color: string }>;
  turn: string;
  castling: string;
  enPassant: string;
  halfmove: number;
  fullmove: number;
}

let cachedPositions: ElitePosition[] | null = null;

async function getPositions(): Promise<ElitePosition[]> {
  if (cachedPositions) return cachedPositions;

  const res = await fetch(
    new URL("/elite_positions.json", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to load positions");
  cachedPositions = await res.json();
  return cachedPositions!;
}

function parseFen(fen: string): ParsedFen | null {
  try {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) return null;

    const [board, turn, castling, enPassant, halfmove, fullmove] = parts;
    const pieces = new Map<string, { type: string; color: string }>();

    const rows = board.split("/");
    if (rows.length !== 8) return null;

    for (let row = 0; row < 8; row++) {
      let col = 0;
      for (const char of rows[row]) {
        if (char >= "1" && char <= "8") {
          col += parseInt(char, 10);
        } else {
          const color = char === char.toUpperCase() ? "w" : "b";
          const type = char.toLowerCase();
          const file = String.fromCharCode(97 + col);
          const rank = 8 - row;
          pieces.set(`${file}${rank}`, { type, color });
          col++;
        }
      }
    }

    return {
      pieces,
      turn,
      castling: castling || "-",
      enPassant: enPassant || "-",
      halfmove: parseInt(halfmove, 10) || 0,
      fullmove: parseInt(fullmove, 10) || 1,
    };
  } catch {
    return null;
  }
}

function classifyPhase(fen: string): "opening" | "middlegame" | "endgame" {
  const parsed = parseFen(fen);
  if (!parsed) return "middlegame";

  const { pieces, turn, castling, fullmove } = parsed;

  // Calculate ply
  const ply = 2 * (fullmove - 1) + (turn === "w" ? 0 : 1);

  // Calculate non-king, non-pawn material
  const pieceValues: Record<string, number> = {
    q: 9, r: 5, b: 3, n: 3, Q: 9, R: 5, B: 3, N: 3,
  };
  let nonpawnMaterial = 0;
  let queensOnBoard = 0;
  let majorMinorPieceCount = 0;

  for (const [, piece] of pieces) {
    if (piece.type === "k" || piece.type === "p") continue;
    nonpawnMaterial += pieceValues[piece.type] || 0;
    if (piece.type === "q" || piece.type === "Q") queensOnBoard++;
    if (piece.type !== "p") majorMinorPieceCount++;
  }

  // Count centralized kings (on files c-f and ranks 3-6)
  let centralizedKings = 0;
  const whiteKingSquare = [...pieces.entries()].find(([, p]) => p.type === "k" && p.color === "w")?.[0];
  const blackKingSquare = [...pieces.entries()].find(([, p]) => p.type === "k" && p.color === "b")?.[0];

  for (const ks of [whiteKingSquare, blackKingSquare]) {
    if (!ks) continue;
    const file = ks[0];
    const rank = parseInt(ks[1], 10);
    if (file >= "c" && file <= "f" && rank >= 3 && rank <= 6) {
      centralizedKings++;
    }
  }

  // Count undeveloped minor pieces (knights on b1/g1, bishops on c1/f1 for white; same for black)
  const startingMinors = ["b1", "g1", "c1", "f1", "b8", "g8", "c8", "f8"];
  let undevelopedMinors = 0;
  for (const sq of startingMinors) {
    const piece = pieces.get(sq);
    if (piece && (piece.type === "n" || piece.type === "b")) {
      undevelopedMinors++;
    }
  }

  // Check if kings are on castled squares
  const whiteCastledLike = whiteKingSquare === "c1" || whiteKingSquare === "g1";
  const blackCastledLike = blackKingSquare === "c8" || blackKingSquare === "g8";
  const castledLikeCount = (whiteCastledLike ? 1 : 0) + (blackCastledLike ? 1 : 0);

  // Count connected rooks on back rank
  let connectedRooksCount = 0;
  const backRanks = { w: "1", b: "8" };
  for (const [color, rank] of [["w", backRanks.w], ["b", backRanks.b]]) {
    const rooksOnRank: string[] = [];
    for (const [sq, piece] of pieces) {
      if (piece.type === "r" && piece.color === color && sq[1] === rank) {
        rooksOnRank.push(sq);
      }
    }
    if (rooksOnRank.length >= 2) {
      rooksOnRank.sort();
      const files = rooksOnRank.map(sq => sq[0]).sort();
      let connected = true;
      for (let i = parseInt(files[0], 10) + 1; i < parseInt(files[files.length - 1], 10); i++) {
        const file = String.fromCharCode(i);
        const sq = file + rank;
        if (pieces.has(sq)) {
          connected = false;
          break;
        }
      }
      if (connected) connectedRooksCount++;
    }
  }

  // 1) Endgame checks
  if (nonpawnMaterial <= 12) return "endgame";
  if (nonpawnMaterial <= 20 && queensOnBoard <= 1) return "endgame";
  if (nonpawnMaterial <= 26 && majorMinorPieceCount <= 6 && centralizedKings >= 1) return "endgame";

  // 2) Opening checks
  if (ply <= 12) return "opening";
  if (ply <= 20 && undevelopedMinors >= 4) return "opening";
  if (ply <= 20 && castledLikeCount <= 1 && undevelopedMinors >= 2) return "opening";
  if (ply <= 24 && connectedRooksCount === 0 && undevelopedMinors >= 2) return "opening";

  // 3) Middlegame
  return "middlegame";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phaseParam = searchParams.get("phase") as "opening" | "middlegame" | "endgame" | null;

    const positions = await getPositions();

    // Filter positions by phase classification
    const filteredPositions = phaseParam
      ? positions.filter(pos => classifyPhase(pos.fen) === phaseParam)
      : positions;

    if (filteredPositions.length === 0) {
      return NextResponse.json(
        { error: `No positions found for phase: ${phaseParam}` },
        { status: 404 }
      );
    }

    const randomIndex = Math.floor(Math.random() * filteredPositions.length);
    const position = filteredPositions[randomIndex];
    const classifiedPhase = classifyPhase(position.fen);

    return NextResponse.json({
      position,
      total: filteredPositions.length,
      phase: classifiedPhase,
    });
  } catch (error) {
    console.error("Random position error:", error);
    return NextResponse.json(
      { error: "Failed to load random position" },
      { status: 500 }
    );
  }
}