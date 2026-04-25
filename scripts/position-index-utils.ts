import { BISHOP, BLACK, Chess, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE } from "chess.js";
import type { Color, PieceSymbol, Square } from "chess.js";

const PIECE_VALUES: Record<PieceSymbol, number> = {
  [PAWN]: 1,
  [KNIGHT]: 3,
  [BISHOP]: 3,
  [ROOK]: 5,
  [QUEEN]: 9,
  [KING]: 0,
};

export interface PositionPhaseProfile {
  phaseScore: number;
  inferredPhase: string;
  suggestedMinPly: number;
  materialRatio: number;
  nonKingMaterial: number;
  materialClass: string;
  detailedMaterialClass: string;
  queensPresent: boolean;
  rooksPresent: boolean;
  heavyPiecesPresent: boolean;
  sideToMove: Color;
}

export function fenPhaseProfile(fen: string): PositionPhaseProfile {
  const chess = new Chess(fen);
  const pieces = allPieces(chess);
  const parts = chess.fen().split(/\s+/);
  const fullmove = Number(parts[5]);
  const fenPly = Number.isFinite(fullmove) && fullmove > 0
    ? fullmove * 2 - (chess.turn() === BLACK ? 0 : 1)
    : null;

  let nonKingMaterial = 0;
  let queenCount = 0;
  let rookCount = 0;
  let minorPieceCount = 0;
  let pawnCount = 0;
  const byColor = {
    [WHITE]: initialCounts(),
    [BLACK]: initialCounts(),
  };

  for (const { piece } of pieces) {
    byColor[piece.color][piece.type] += 1;
    if (piece.type === KING) continue;
    nonKingMaterial += PIECE_VALUES[piece.type];
    if (piece.type === QUEEN) queenCount += 1;
    if (piece.type === ROOK) rookCount += 1;
    if (piece.type === BISHOP || piece.type === KNIGHT) minorPieceCount += 1;
    if (piece.type === PAWN) pawnCount += 1;
  }

  const materialRatio = clamp01(nonKingMaterial / 78);
  const materialPhase = clamp01(1 - materialRatio);
  const movePhase = fenPly === null ? 0.45 : clamp01((fenPly - 8) / 80);
  const phaseScore = clamp01(
    materialPhase * 0.6 +
      heavyPiecePhase(queenCount, rookCount, nonKingMaterial) * 0.25 +
      movePhase * 0.15,
  );

  return {
    phaseScore,
    inferredPhase: inferredPhaseLabel(phaseScore),
    suggestedMinPly: suggestedMinPly(phaseScore),
    materialRatio,
    nonKingMaterial,
    materialClass: materialClass({ queenCount, rookCount, minorPieceCount, pawnCount, nonKingMaterial }),
    detailedMaterialClass: detailedMaterialClass({ queenCount, rookCount, minorPieceCount, pawnCount, nonKingMaterial, byColor }),
    queensPresent: queenCount > 0,
    rooksPresent: rookCount > 0,
    heavyPiecesPresent: queenCount > 0 || rookCount > 0,
    sideToMove: chess.turn(),
  };
}

export function compatiblePhaseMaterial(query: PositionPhaseProfile, candidate: PositionPhaseProfile, maxPhaseDelta = 0.25) {
  if (Math.abs(query.phaseScore - candidate.phaseScore) > maxPhaseDelta) return false;
  if (query.phaseScore >= 0.55 && !query.queensPresent && candidate.queensPresent) return false;
  if (query.phaseScore >= 0.7 && !query.rooksPresent && candidate.rooksPresent) return false;
  if (lowMaterial(query) && candidate.heavyPiecesPresent) return false;
  if (lowMaterial(query) && candidate.materialRatio > Math.max(query.materialRatio + 0.2, 0.55)) return false;
  return true;
}

function lowMaterial(profile: PositionPhaseProfile) {
  return ["minor_pawn_endgame", "pawn_endgame", "bare_kings", "no_heavy_piece_endgame"].includes(profile.materialClass);
}

function allPieces(chess: Chess) {
  return chess.board().flatMap((row) =>
    row.filter(Boolean).map((entry) => ({
      square: entry!.square as Square,
      piece: { color: entry!.color, type: entry!.type },
    })),
  );
}

function initialCounts(): Record<PieceSymbol, number> {
  return { [PAWN]: 0, [KNIGHT]: 0, [BISHOP]: 0, [ROOK]: 0, [QUEEN]: 0, [KING]: 0 };
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

function detailedMaterialClass(counts: {
  queenCount: number;
  rookCount: number;
  minorPieceCount: number;
  pawnCount: number;
  nonKingMaterial: number;
  byColor: Record<Color, Record<PieceSymbol, number>>;
}) {
  if (counts.nonKingMaterial >= 62) return "full_material";
  const whiteHeavy = counts.byColor[WHITE][QUEEN] + counts.byColor[WHITE][ROOK];
  const blackHeavy = counts.byColor[BLACK][QUEEN] + counts.byColor[BLACK][ROOK];
  const whiteMinors = counts.byColor[WHITE][BISHOP] + counts.byColor[WHITE][KNIGHT];
  const blackMinors = counts.byColor[BLACK][BISHOP] + counts.byColor[BLACK][KNIGHT];
  if (counts.queenCount === 0 && counts.rookCount === 0 && counts.minorPieceCount === 0) return counts.pawnCount > 0 ? "pawn_endgame" : "bare_kings";
  if (counts.queenCount === 0 && counts.rookCount === 0) {
    if (whiteMinors > 0 && blackMinors > 0) return "minor_vs_minor";
    if ((whiteMinors > 0 && blackMinors === 0) || (blackMinors > 0 && whiteMinors === 0)) return "minor_vs_pawns";
    return "minor_piece_endgame";
  }
  if (counts.queenCount === 0 && counts.rookCount > 0) return "rook_endgame";
  if (counts.queenCount > 0 && counts.rookCount === 0 && counts.nonKingMaterial <= 32) return "queen_endgame";
  if (whiteHeavy === 0 && blackHeavy === 0) return "no_heavy_piece_endgame";
  return "heavy_piece_middlegame";
}

function heavyPiecePhase(queenCount: number, rookCount: number, nonKingMaterial: number) {
  if (queenCount === 0 && rookCount === 0) return nonKingMaterial <= 14 ? 0.95 : 0.82;
  if (queenCount === 0 && rookCount <= 2) return 0.72;
  if (queenCount === 0) return 0.62;
  if (queenCount > 0 && rookCount >= 3) return 0.18;
  if (queenCount > 0 && rookCount > 0) return 0.35;
  return 0.45;
}

function inferredPhaseLabel(score: number) {
  if (score < 0.25) return "opening";
  if (score < 0.4) return "early_middlegame";
  if (score < 0.62) return "middlegame";
  if (score < 0.78) return "late_middlegame";
  return "endgame";
}

function suggestedMinPly(score: number) {
  if (score >= 0.9) return 60;
  if (score >= 0.85) return 50;
  if (score >= 0.7) return 35;
  if (score >= 0.5) return 20;
  if (score >= 0.3) return 12;
  return 4;
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
