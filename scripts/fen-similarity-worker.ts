import readline from "node:readline";
import { createRequire } from "node:module";
import {
  BISHOP,
  BLACK,
  Chess,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
} from "chess.js";
import type { Color, PieceSymbol, Square } from "chess.js";

const require = createRequire(import.meta.url);
const fenSimilarity: typeof import("../lib/fen-consequence-similarity") = require("../lib/fen-consequence-similarity.ts");

const {
  compareFenFingerprints,
  extractFenConsequenceFingerprint,
} = fenSimilarity;

interface Request {
  fen?: string;
  queryProfile?: boolean;
}

const queryFen = parseQueryFen(process.argv.slice(2));
if (!queryFen) {
  console.error("Usage: node --experimental-strip-types scripts/fen-similarity-worker.ts --query-fen \"<FEN>\"");
  process.exit(1);
}

const queryFingerprint = extractFenConsequenceFingerprint(queryFen);

const reader = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

reader.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request = JSON.parse(trimmed) as Request;
    if (request.queryProfile) {
      process.stdout.write(`${JSON.stringify({ ok: true, phaseProfile: fenPhaseProfile(queryFen) })}\n`);
      return;
    }

    if (!request.fen) {
      throw new Error("Missing fen");
    }

    const fingerprint = extractFenConsequenceFingerprint(request.fen);
    const comparison = compareFenFingerprints(queryFingerprint, fingerprint);
    process.stdout.write(
      `${JSON.stringify({ ok: true, ...comparison, phaseProfile: fenPhaseProfile(request.fen) })}\n`,
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
  }
});

function parseQueryFen(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--query-fen" && argv[index + 1]) {
      return argv[index + 1];
    }
  }
  return "";
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
  [PAWN]: 1,
  [KNIGHT]: 3,
  [BISHOP]: 3,
  [ROOK]: 5,
  [QUEEN]: 9,
  [KING]: 0,
};

function fenPhaseProfile(fen: string) {
  const chess = new Chess(fen);
  const parts = chess.fen().split(/\s+/);
  const pieces = allPieces(chess);
  const fullmove = Number(parts[5]);
  const fenFullmoveNumber = Number.isFinite(fullmove) && fullmove > 0 ? fullmove : null;
  const fenPlyEstimate =
    fenFullmoveNumber === null ? null : fenFullmoveNumber * 2 - (chess.turn() === BLACK ? 0 : 1);

  let nonKingMaterial = 0;
  let queenCount = 0;
  let rookCount = 0;
  let minorPieceCount = 0;
  let pawnCount = 0;
  for (const { piece } of pieces) {
    if (piece.type === KING) continue;
    nonKingMaterial += PIECE_VALUES[piece.type];
    if (piece.type === QUEEN) queenCount += 1;
    if (piece.type === ROOK) rookCount += 1;
    if (piece.type === BISHOP || piece.type === KNIGHT) minorPieceCount += 1;
    if (piece.type === PAWN) pawnCount += 1;
  }

  const materialRatio = clamp01(nonKingMaterial / 78);
  const kings = kingSquares(chess);
  const kingsCentralizedScore = average([
    normalizedKingCentralization(kings[WHITE]),
    normalizedKingCentralization(kings[BLACK]),
  ]);
  const originalSquareOccupancyRatio = originalSquareOccupancy(chess);
  const castlingRightsCount = parts[2] === "-" ? 0 : [...(parts[2] ?? "")].filter((char) => "KQkq".includes(char)).length;
  const fenMoveNumberPhase = fenPlyEstimate === null ? 0.45 : clamp01((fenPlyEstimate - 8) / 80);
  const phaseScore = clamp01(
    (1 - materialRatio) * 0.45 +
      heavyPiecePhase(queenCount, rookCount, nonKingMaterial) * 0.2 +
      kingsCentralizedScore * 0.15 +
      (1 - originalSquareOccupancyRatio) * 0.1 +
      fenMoveNumberPhase * 0.1 +
      average([
        kingDevelopmentPhase(kings[WHITE], WHITE, materialRatio),
        kingDevelopmentPhase(kings[BLACK], BLACK, materialRatio),
      ]) *
        0.13 +
      clamp01((4 - castlingRightsCount) / 4) * 0.05,
  );

  return {
    phaseScore,
    inferredPhase: inferredPhaseLabel(phaseScore),
    suggestedMinPly: suggestedMinPly(phaseScore),
    suggestedMaxPly: suggestedMaxPly(phaseScore),
    materialRatio,
    nonKingMaterial,
    queensPresent: queenCount > 0,
    rooksPresent: rookCount > 0,
    heavyPiecesPresent: queenCount > 0 || rookCount > 0,
    minorPieceCount,
    originalSquareOccupancyRatio,
    castlingRightsCount,
    kingsCentralizedScore,
    fenFullmoveNumber,
    fenPlyEstimate,
    materialClass: materialClass({ queenCount, rookCount, minorPieceCount, pawnCount, nonKingMaterial }),
    kingSafety: {
      [WHITE]: kingSafetyClass(kings[WHITE], WHITE, materialRatio),
      [BLACK]: kingSafetyClass(kings[BLACK], BLACK, materialRatio),
    },
  };
}

function allPieces(chess: Chess) {
  return chess.board().flatMap((row) =>
    row.filter(Boolean).map((entry) => ({
      square: entry!.square as Square,
      piece: { color: entry!.color, type: entry!.type },
    })),
  );
}

function kingSquares(chess: Chess): Record<Color, Square> {
  const kings: Partial<Record<Color, Square>> = {};
  for (const { square, piece } of allPieces(chess)) {
    if (piece.type === KING) kings[piece.color] = square;
  }
  if (!kings[WHITE] || !kings[BLACK]) throw new Error("FEN must include both kings.");
  return { [WHITE]: kings[WHITE], [BLACK]: kings[BLACK] };
}

function materialClass(counts: {
  queenCount: number;
  rookCount: number;
  minorPieceCount: number;
  pawnCount: number;
  nonKingMaterial: number;
}) {
  if (counts.queenCount === 0 && counts.rookCount === 0 && counts.nonKingMaterial <= 10) {
    if (counts.minorPieceCount > 0) return "minor_pawn_endgame";
    if (counts.pawnCount > 0) return "pawn_endgame";
    return "bare_kings";
  }
  if (counts.queenCount === 0 && counts.rookCount > 0 && counts.nonKingMaterial <= 28) return "rook_endgame";
  if (counts.queenCount > 0 && counts.rookCount === 0 && counts.nonKingMaterial <= 28) return "queen_endgame";
  if (counts.queenCount === 0 && counts.rookCount === 0) return "no_heavy_piece_endgame";
  if (counts.queenCount === 0) return "queenless_heavy_piece_position";
  if (counts.nonKingMaterial >= 62) return "full_material";
  return "mixed_material";
}

function originalSquareOccupancy(chess: Chess) {
  const originals = new Map<Square, { color: Color; type: PieceSymbol }>([
    ["a1", { color: WHITE, type: ROOK }],
    ["b1", { color: WHITE, type: KNIGHT }],
    ["c1", { color: WHITE, type: BISHOP }],
    ["d1", { color: WHITE, type: QUEEN }],
    ["e1", { color: WHITE, type: KING }],
    ["f1", { color: WHITE, type: BISHOP }],
    ["g1", { color: WHITE, type: KNIGHT }],
    ["h1", { color: WHITE, type: ROOK }],
    ["a8", { color: BLACK, type: ROOK }],
    ["b8", { color: BLACK, type: KNIGHT }],
    ["c8", { color: BLACK, type: BISHOP }],
    ["d8", { color: BLACK, type: QUEEN }],
    ["e8", { color: BLACK, type: KING }],
    ["f8", { color: BLACK, type: BISHOP }],
    ["g8", { color: BLACK, type: KNIGHT }],
    ["h8", { color: BLACK, type: ROOK }],
  ]);
  for (const file of "abcdefgh") {
    originals.set(`${file}2` as Square, { color: WHITE, type: PAWN });
    originals.set(`${file}7` as Square, { color: BLACK, type: PAWN });
  }

  let occupied = 0;
  for (const [square, expected] of originals) {
    const piece = chess.get(square);
    if (piece?.color === expected.color && piece.type === expected.type) occupied += 1;
  }
  return occupied / originals.size;
}

function heavyPiecePhase(queenCount: number, rookCount: number, nonKingMaterial: number) {
  if (queenCount === 0 && rookCount === 0) return nonKingMaterial <= 14 ? 0.95 : 0.82;
  if (queenCount === 0 && rookCount <= 2) return 0.72;
  if (queenCount === 0) return 0.62;
  if (queenCount > 0 && rookCount >= 3) return 0.18;
  if (queenCount > 0 && rookCount > 0) return 0.35;
  return 0.45;
}

function inferredPhaseLabel(phaseScore: number) {
  if (phaseScore < 0.25) return "opening";
  if (phaseScore < 0.4) return "early_middlegame";
  if (phaseScore < 0.62) return "middlegame";
  if (phaseScore < 0.78) return "late_middlegame";
  return "endgame";
}

function suggestedMinPly(phaseScore: number) {
  if (phaseScore >= 0.9) return 60;
  if (phaseScore >= 0.85) return 50;
  if (phaseScore >= 0.7) return 35;
  if (phaseScore >= 0.5) return 20;
  if (phaseScore >= 0.3) return 12;
  return 4;
}

function suggestedMaxPly(phaseScore: number) {
  if (phaseScore < 0.25) return 24;
  if (phaseScore < 0.4) return 40;
  if (phaseScore < 0.62) return 80;
  return null;
}

function kingSafetyClass(square: Square, color: Color, materialRatio: number) {
  if (materialRatio < 0.45 && normalizedKingCentralization(square) > 0.45) return "exposed_endgame_king";
  const shape = castlingShape(color, square);
  if (shape === "castled-kingside" || shape === "castled-queenside") return shape;
  if (shape === "uncastled") return "uncastled_center";
  const backRank = color === WHITE ? 1 : 8;
  return squareRank(square) === backRank ? "king_walked_back_rank" : "king_walked";
}

function kingDevelopmentPhase(square: Square, color: Color, materialRatio: number) {
  const shape = castlingShape(color, square);
  if (shape === "uncastled") return 0;
  if (shape === "castled-kingside" || shape === "castled-queenside") return 0.75;
  if (materialRatio < 0.45) return 0.85;
  const backRank = color === WHITE ? 1 : 8;
  return squareRank(square) === backRank ? 0.45 : 0.65;
}

function castlingShape(color: Color, square: Square) {
  if (color === WHITE && square === "g1") return "castled-kingside";
  if (color === WHITE && square === "c1") return "castled-queenside";
  if (color === BLACK && square === "g8") return "castled-kingside";
  if (color === BLACK && square === "c8") return "castled-queenside";
  if ((color === WHITE && square === "e1") || (color === BLACK && square === "e8")) return "uncastled";
  return "king-moved";
}

function normalizedKingCentralization(square: Square) {
  return clamp01(1 - kingDistanceToCenter(square) / 7);
}

function kingDistanceToCenter(square: Square) {
  const file = squareFile(square);
  const rank = squareRank(square);
  return Math.min(
    Math.abs(file - 3) + Math.abs(rank - 4),
    Math.abs(file - 4) + Math.abs(rank - 4),
    Math.abs(file - 3) + Math.abs(rank - 5),
    Math.abs(file - 4) + Math.abs(rank - 5),
  );
}

function squareFile(square: Square) {
  return square.charCodeAt(0) - 97;
}

function squareRank(square: Square) {
  return Number(square[1]);
}

function average(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
