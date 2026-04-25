import {
  BISHOP,
  BLACK,
  Chess,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  SQUARES,
  WHITE,
} from "chess.js";
import type { Color, Move, Piece, PieceSymbol, Square } from "chess.js";

type TokenWeights = Record<string, number>;
type NumericFeatures = Record<string, number>;

export interface ConsequenceFingerprint {
  fen: string;
  turn: Color;
  tokens: TokenWeights;
  numeric: NumericFeatures;
  vectors: {
    whiteAttacks: number[];
    blackAttacks: number[];
    contested: number[];
    kingZoneAttacks: number[];
    saliencePressure: number[];
  };
}

export interface FenSimilarityWeights {
  tokens: number;
  pressure: number;
  scalar: number;
  mobility: number;
  material: number;
}

export interface FenSimilarityOptions {
  weights?: Partial<FenSimilarityWeights>;
}

export interface FenSimilarityBreakdown {
  score: number;
  tokenScore: number;
  pressureScore: number;
  scalarScore: number;
  mobilityScore: number;
  materialScore: number;
}

export interface AntiDuplicateOptions extends FenSimilarityOptions {
  threshold?: number;
}

export interface AntiDuplicateDelta {
  delta: number;
  maxSimilarity: number;
  reject: boolean;
  threshold: number;
  mostSimilarFen: string | null;
  mostSimilarIndex: number;
}

const DEFAULT_WEIGHTS: FenSimilarityWeights = {
  tokens: 0.42,
  pressure: 0.26,
  scalar: 0.12,
  mobility: 0.1,
  material: 0.1,
};

const DEFAULT_ANTI_DUPLICATE_DELTA_THRESHOLD = 0.08;
const ALL_SQUARES = SQUARES as Square[];
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const PIECE_TYPES = [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING] as const;
const PIECE_VALUES: Record<PieceSymbol, number> = {
  [PAWN]: 1,
  [KNIGHT]: 3,
  [BISHOP]: 3,
  [ROOK]: 5,
  [QUEEN]: 9,
  [KING]: 0,
};

const ORTHOGONAL_DIRECTIONS = [
  { df: 1, dr: 0, name: "east" },
  { df: -1, dr: 0, name: "west" },
  { df: 0, dr: 1, name: "north" },
  { df: 0, dr: -1, name: "south" },
] as const;

const DIAGONAL_DIRECTIONS = [
  { df: 1, dr: 1, name: "ne" },
  { df: -1, dr: 1, name: "nw" },
  { df: 1, dr: -1, name: "se" },
  { df: -1, dr: -1, name: "sw" },
] as const;

const SLIDING_DIRECTIONS = [...ORTHOGONAL_DIRECTIONS, ...DIAGONAL_DIRECTIONS] as const;

interface BoardState {
  pieces: Map<Square, Piece>;
  kings: Record<Color, Square>;
}

interface Direction {
  df: number;
  dr: number;
  name: string;
}

export function extractFenConsequenceFingerprint(fen: string): ConsequenceFingerprint {
  const chess = new Chess(fen);
  const canonicalFen = chess.fen();
  const board = readBoard(chess);
  const tokens: TokenWeights = {};
  const numeric: NumericFeatures = {};
  const kingZones = {
    [WHITE]: kingZone(board.kings[WHITE], WHITE),
    [BLACK]: kingZone(board.kings[BLACK], BLACK),
  };

  addPieceInteractionTokens(chess, board, kingZones, tokens, numeric);
  addPawnAndKingStructureTokens(board, kingZones, tokens, numeric);
  const vectors = buildPressureVectors(chess, board, kingZones, numeric);
  addMobilityShape(chess, board, kingZones, numeric, tokens);
  addMaterialAndPhase(board, numeric, tokens);

  return {
    fen: canonicalFen,
    turn: chess.turn(),
    tokens,
    numeric,
    vectors,
  };
}

export function compareFenFingerprints(
  left: ConsequenceFingerprint,
  right: ConsequenceFingerprint,
  options: FenSimilarityOptions = {},
): FenSimilarityBreakdown {
  const weights = normalizeWeights({ ...DEFAULT_WEIGHTS, ...options.weights });
  const tokenScore = weightedJaccard(left.tokens, right.tokens);
  const pressureScore = average([
    blendedVectorSimilarity(left.vectors.whiteAttacks, right.vectors.whiteAttacks),
    blendedVectorSimilarity(left.vectors.blackAttacks, right.vectors.blackAttacks),
    blendedVectorSimilarity(left.vectors.contested, right.vectors.contested),
    blendedVectorSimilarity(left.vectors.kingZoneAttacks, right.vectors.kingZoneAttacks),
    blendedVectorSimilarity(left.vectors.saliencePressure, right.vectors.saliencePressure),
  ]);
  const scalarScore = numericL1Similarity(left.numeric, right.numeric, (name) =>
    !name.startsWith("mobility.") && !name.startsWith("material.") && !name.startsWith("phase."),
  );
  const mobilityScore = numericL1Similarity(left.numeric, right.numeric, (name) =>
    name.startsWith("mobility."),
  );
  const materialScore = numericL1Similarity(left.numeric, right.numeric, (name) =>
    name.startsWith("material.") || name.startsWith("phase."),
  );

  const score = clamp01(
    tokenScore * weights.tokens +
      pressureScore * weights.pressure +
      scalarScore * weights.scalar +
      mobilityScore * weights.mobility +
      materialScore * weights.material,
  );

  return {
    score,
    tokenScore,
    pressureScore,
    scalarScore,
    mobilityScore,
    materialScore,
  };
}

export function compareFens(
  leftFen: string,
  rightFen: string,
  options: FenSimilarityOptions = {},
): FenSimilarityBreakdown {
  return compareFenFingerprints(
    extractFenConsequenceFingerprint(leftFen),
    extractFenConsequenceFingerprint(rightFen),
    options,
  );
}

export function antiDuplicateDelta(
  candidateFen: string,
  recentServedFens: string[],
  options: AntiDuplicateOptions = {},
): AntiDuplicateDelta {
  const threshold = options.threshold ?? DEFAULT_ANTI_DUPLICATE_DELTA_THRESHOLD;
  const candidate = extractFenConsequenceFingerprint(candidateFen);
  let maxSimilarity = 0;
  let mostSimilarFen: string | null = null;
  let mostSimilarIndex = -1;

  recentServedFens.forEach((fen, index) => {
    const similarity = compareFenFingerprints(
      candidate,
      extractFenConsequenceFingerprint(fen),
      options,
    ).score;
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      mostSimilarFen = fen;
      mostSimilarIndex = index;
    }
  });

  const delta = clamp01(1 - maxSimilarity);
  return {
    delta,
    maxSimilarity,
    reject: recentServedFens.length > 0 && delta < threshold,
    threshold,
    mostSimilarFen,
    mostSimilarIndex,
  };
}

function addPieceInteractionTokens(
  chess: Chess,
  board: BoardState,
  kingZones: Record<Color, Square[]>,
  tokens: TokenWeights,
  numeric: NumericFeatures,
) {
  for (const [targetSquare, targetPiece] of board.pieces) {
    for (const color of [WHITE, BLACK] as const) {
      const attackers = chess.attackers(targetSquare, color);
      for (const attackerSquare of attackers) {
        const attackerPiece = board.pieces.get(attackerSquare);
        if (!attackerPiece) continue;
        if (attackerPiece.color === targetPiece.color) {
          const weight = targetPiece.type === KING ? 1.4 : 0.7 + pieceWeight(targetPiece.type) * 0.15;
          addToken(tokens, `defends:${pieceKey(attackerPiece)}->${pieceKey(targetPiece)}`, weight);
          addToken(
            tokens,
            `defends-square:${pieceKey(attackerPiece)}@${attackerSquare}->${pieceKey(targetPiece)}@${targetSquare}`,
            0.25,
          );
        } else {
          const weight = 1 + pieceWeight(targetPiece.type) * 0.22;
          addToken(tokens, `attacks:${pieceKey(attackerPiece)}->${pieceKey(targetPiece)}`, weight);
          addToken(
            tokens,
            `attacks-square:${pieceKey(attackerPiece)}@${attackerSquare}->${pieceKey(targetPiece)}@${targetSquare}`,
            0.35,
          );
          addNumeric(numeric, `pressure.${targetPiece.color}.${targetPiece.type}.attackers`, 1);
        }
      }
    }
  }

  for (const defenderColor of [WHITE, BLACK] as const) {
    const attackerColor = opposite(defenderColor);
    for (const square of kingZones[defenderColor]) {
      for (const attackerSquare of chess.attackers(square, attackerColor)) {
        const attacker = board.pieces.get(attackerSquare);
        if (!attacker) continue;
        addToken(tokens, `attacks-king-zone:${pieceKey(attacker)}->${colorName(defenderColor)}:${zoneOf(square, board.kings[defenderColor])}`, 1.6);
        addToken(tokens, `attacks-king-zone-square:${pieceKey(attacker)}@${attackerSquare}->${square}`, 0.35);
        addNumeric(numeric, `kingZone.${defenderColor}.attackedSquares`, 1);
      }

      for (const defenderSquare of chess.attackers(square, defenderColor)) {
        const defender = board.pieces.get(defenderSquare);
        if (!defender) continue;
        addToken(tokens, `defends-king-zone:${pieceKey(defender)}->${colorName(defenderColor)}:${zoneOf(square, board.kings[defenderColor])}`, 0.9);
      }
    }
  }

  for (const pin of detectPins(board)) {
    addToken(
      tokens,
      `pinned:${pieceKey(pin.pinned)}:by:${pieceKey(pin.by)}:${pin.line}`,
      2.4 + pieceWeight(pin.pinned.type) * 0.15,
    );
    addToken(tokens, `pinned-square:${pieceKey(pin.pinned)}@${pin.pinnedSquare}:by:${pieceKey(pin.by)}@${pin.bySquare}`, 0.7);
    addNumeric(numeric, `pins.${pin.pinned.color}`, 1);
  }

  addLineOfSightTokens(board, kingZones, tokens, numeric);
  addLooseAndHangingTokens(chess, board, tokens, numeric);
}

function addLineOfSightTokens(
  board: BoardState,
  kingZones: Record<Color, Square[]>,
  tokens: TokenWeights,
  numeric: NumericFeatures,
) {
  for (const [from, piece] of board.pieces) {
    if (piece.type !== BISHOP && piece.type !== ROOK && piece.type !== QUEEN) continue;
    const directions = directionsForSlider(piece.type);

    for (const direction of directions) {
      let blocker: { square: Square; piece: Piece } | null = null;
      for (const square of raySquares(from, direction)) {
        const seen = board.pieces.get(square);
        if (!seen) continue;

        if (!blocker) {
          blocker = { square, piece: seen };
          continue;
        }

        const line = lineKind(direction);
        addToken(
          tokens,
          `xray:${pieceKey(piece)}->${pieceKey(seen)}:through:${pieceKey(blocker.piece)}:${line}`,
          0.65 + pieceWeight(seen.type) * 0.08,
        );
        addToken(
          tokens,
          `xray-square:${pieceKey(piece)}@${from}->${pieceKey(seen)}@${square}:through:${blocker.square}`,
          0.2,
        );
        addNumeric(numeric, `xray.${piece.color}.${piece.type}`, 1);
        break;
      }
    }

    if (piece.type === ROOK || piece.type === QUEEN) {
      const fileIndex = squareFile(from);
      const filePawns = piecesOnFile(board, fileIndex, PAWN);
      const ownPawns = filePawns.filter((pawn) => pawn.piece.color === piece.color);
      if (filePawns.length === 0) {
        addToken(tokens, `open-file-control:${pieceKey(piece)}:${FILES[fileIndex]}`, 1.2);
        addToken(tokens, `open-file-control-kind:${pieceKey(piece)}`, 1);
      } else if (ownPawns.length === 0) {
        addToken(tokens, `semi-open-file-control:${pieceKey(piece)}:${FILES[fileIndex]}`, 1);
        addToken(tokens, `semi-open-file-control-kind:${pieceKey(piece)}`, 0.8);
      }
    }

    if (piece.type === BISHOP || piece.type === QUEEN) {
      const enemyKingZone = new Set(kingZones[opposite(piece.color)]);
      for (const target of enemyKingZone) {
        const df = squareFile(target) - squareFile(from);
        const dr = squareRank(target) - squareRank(from);
        if (Math.abs(df) < 3 || Math.abs(df) !== Math.abs(dr)) continue;
        if (!pathIsClear(board, from, target)) continue;
        addToken(tokens, `long-diagonal-to-king-zone:${pieceKey(piece)}:${colorName(opposite(piece.color))}`, 1.4);
        addToken(tokens, `long-diagonal-to-king-zone-square:${pieceKey(piece)}@${from}->${target}`, 0.35);
        addNumeric(numeric, `diagonalKingPressure.${piece.color}.${piece.type}`, 1);
      }
    }
  }
}

function addLooseAndHangingTokens(
  chess: Chess,
  board: BoardState,
  tokens: TokenWeights,
  numeric: NumericFeatures,
) {
  for (const [square, piece] of board.pieces) {
    if (piece.type === KING) continue;
    const defenders = chess.attackers(square, piece.color).length;
    const attackers = chess.attackers(square, opposite(piece.color)).length;

    if (defenders === 0) {
      addToken(tokens, `loose:${pieceKey(piece)}`, 0.7 + pieceWeight(piece.type) * 0.12);
      addToken(tokens, `loose-square:${pieceKey(piece)}@${square}`, 0.25);
      addNumeric(numeric, `loose.${piece.color}.${piece.type}`, 1);
    }

    if (attackers > 0 && defenders === 0) {
      addToken(tokens, `hanging:${pieceKey(piece)}:attackers:${bucketCount(attackers)}`, 1.5 + pieceWeight(piece.type) * 0.2);
      addToken(tokens, `hanging-square:${pieceKey(piece)}@${square}`, 0.45);
      addNumeric(numeric, `hanging.${piece.color}.${piece.type}`, 1);
    } else if (attackers > defenders) {
      addToken(tokens, `underdefended:${pieceKey(piece)}:${bucketCount(attackers - defenders)}`, 0.8 + pieceWeight(piece.type) * 0.08);
      addNumeric(numeric, `underdefended.${piece.color}.${piece.type}`, 1);
    }
  }
}

function addPawnAndKingStructureTokens(
  board: BoardState,
  kingZones: Record<Color, Square[]>,
  tokens: TokenWeights,
  numeric: NumericFeatures,
) {
  addCenterStructure(board, tokens, numeric);

  for (const color of [WHITE, BLACK] as const) {
    const kingSquare = board.kings[color];
    const castling = castlingShape(color, kingSquare);
    addToken(tokens, `king:${colorName(color)}:${castling}`, 1.8);
    setNumeric(numeric, `king.${color}.file`, squareFile(kingSquare));
    setNumeric(numeric, `king.${color}.rank`, squareRank(kingSquare));

    const shield = pawnShieldSquares(kingSquare, color);
    let shieldCount = 0;
    for (const square of shield) {
      const piece = board.pieces.get(square);
      if (piece?.type === PAWN && piece.color === color) shieldCount += 1;
    }
    addToken(tokens, `king-shield:${colorName(color)}:${bucketCount(shieldCount)}`, 1.1);
    setNumeric(numeric, `king.${color}.pawnShield`, shieldCount);

    const nearFiles = nearFileIndexes(squareFile(kingSquare));
    for (const fileIndex of nearFiles) {
      const pawns = piecesOnFile(board, fileIndex, PAWN);
      const friendly = pawns.filter((pawn) => pawn.piece.color === color);
      if (pawns.length === 0) {
        addToken(tokens, `king-near-open-file:${colorName(color)}:${fileOffsetName(fileIndex - squareFile(kingSquare))}`, 1.1);
        addNumeric(numeric, `king.${color}.nearOpenFiles`, 1);
      } else if (friendly.length === 0) {
        addToken(tokens, `king-near-semi-open-file:${colorName(color)}:${fileOffsetName(fileIndex - squareFile(kingSquare))}`, 0.9);
        addNumeric(numeric, `king.${color}.nearSemiOpenFiles`, 1);
      }
    }

    const pawnInfo = analyzePawns(board, color);
    addToken(tokens, `pawn-islands:${colorName(color)}:${bucketCount(pawnInfo.islands)}`, 0.8);
    setNumeric(numeric, `pawns.${color}.islands`, pawnInfo.islands);
    setNumeric(numeric, `pawns.${color}.isolated`, pawnInfo.isolated);
    setNumeric(numeric, `pawns.${color}.doubled`, pawnInfo.doubled);
    setNumeric(numeric, `pawns.${color}.passed`, pawnInfo.passed);
    setNumeric(numeric, `pawns.${color}.advancedPassed`, pawnInfo.advancedPassed);

    for (const pawn of pawnInfo.details) {
      if (pawn.isolated) addToken(tokens, `isolated-pawn:${colorName(color)}:${FILES[squareFile(pawn.square)]}`, 0.55);
      if (pawn.doubled) addToken(tokens, `doubled-pawn:${colorName(color)}:${FILES[squareFile(pawn.square)]}`, 0.6);
      if (pawn.passed) addToken(tokens, `passed-pawn:${colorName(color)}:${rankBucket(squareRank(pawn.square), color)}`, 0.9);
      if (pawn.advancedPassed) {
        addToken(tokens, `advanced-passed-pawn:${colorName(color)}:${FILES[squareFile(pawn.square)]}`, 1.35);
      }
      if (pawn.promotionPathClear) {
        addToken(tokens, `promotion-path-clear:${colorName(color)}:${FILES[squareFile(pawn.square)]}`, 1);
      }
    }
  }

  setNumeric(numeric, "kingZone.totalSquares", kingZones[WHITE].length + kingZones[BLACK].length);
}

function addCenterStructure(board: BoardState, tokens: TokenWeights, numeric: NumericFeatures) {
  const centerSquares = ["d4", "e4", "d5", "e5"] as Square[];
  let centerPawns = 0;
  let centerPieces = 0;
  for (const square of centerSquares) {
    const piece = board.pieces.get(square);
    if (!piece) continue;
    centerPieces += 1;
    if (piece.type === PAWN) centerPawns += 1;
  }

  const locks =
    (pawnAt(board, "d4", WHITE) && pawnAt(board, "d5", BLACK) ? 1 : 0) +
    (pawnAt(board, "e4", WHITE) && pawnAt(board, "e5", BLACK) ? 1 : 0);
  if (locks >= 2) addToken(tokens, "center:locked", 1.4);
  else if (locks === 1) addToken(tokens, "center:semi-locked", 1);
  else if (centerPawns <= 1) addToken(tokens, "center:open", 1.2);
  else addToken(tokens, "center:fluid", 0.8);

  setNumeric(numeric, "center.pawns", centerPawns);
  setNumeric(numeric, "center.pieces", centerPieces);
  setNumeric(numeric, "center.locks", locks);
}

function buildPressureVectors(
  chess: Chess,
  board: BoardState,
  kingZones: Record<Color, Square[]>,
  numeric: NumericFeatures,
) {
  const whiteAttacks: number[] = [];
  const blackAttacks: number[] = [];
  const contested: number[] = [];
  const kingZoneAttacksWhite: number[] = [];
  const kingZoneAttacksBlack: number[] = [];
  const salienceWhite: number[] = [];
  const salienceBlack: number[] = [];
  const whiteKingZone = new Set(kingZones[WHITE]);
  const blackKingZone = new Set(kingZones[BLACK]);

  for (const square of ALL_SQUARES) {
    const whiteCount = chess.attackers(square, WHITE).length;
    const blackCount = chess.attackers(square, BLACK).length;
    const contestedSquare = whiteCount > 0 && blackCount > 0 ? 1 : 0;
    const salience = squareSalience(square, board, whiteKingZone, blackKingZone);

    whiteAttacks.push(whiteCount);
    blackAttacks.push(blackCount);
    contested.push(contestedSquare);
    salienceWhite.push(whiteCount * salience);
    salienceBlack.push(blackCount * salience);
    kingZoneAttacksWhite.push(blackKingZone.has(square) ? whiteCount : 0);
    kingZoneAttacksBlack.push(whiteKingZone.has(square) ? blackCount : 0);

    if (contestedSquare) addNumeric(numeric, "pressure.contestedSquares", 1);
  }

  setNumeric(numeric, "pressure.whiteTotal", sum(whiteAttacks));
  setNumeric(numeric, "pressure.blackTotal", sum(blackAttacks));
  setNumeric(numeric, "pressure.whiteKingZoneAttackTotal", sum(kingZoneAttacksWhite));
  setNumeric(numeric, "pressure.blackKingZoneAttackTotal", sum(kingZoneAttacksBlack));

  return {
    whiteAttacks,
    blackAttacks,
    contested,
    kingZoneAttacks: [...kingZoneAttacksWhite, ...kingZoneAttacksBlack],
    saliencePressure: [...salienceWhite, ...salienceBlack],
  };
}

function addMobilityShape(
  chess: Chess,
  board: BoardState,
  kingZones: Record<Color, Square[]>,
  numeric: NumericFeatures,
  tokens: TokenWeights,
) {
  const turn = chess.turn();
  const enemyKingZone = new Set(kingZones[opposite(turn)]);
  const moves = chess.moves({ verbose: true }) as Move[];
  let captures = 0;
  let checks = 0;
  let nearKing = 0;

  for (const move of moves) {
    addNumeric(numeric, `mobility.${turn}.${move.piece}`, 1);
    if (move.isCapture()) captures += 1;
    if (enemyKingZone.has(move.to)) nearKing += 1;
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    if (chess.isCheck()) checks += 1;
    chess.undo();
  }

  setNumeric(numeric, "mobility.legalMoves", moves.length);
  setNumeric(numeric, "mobility.legalCaptures", captures);
  setNumeric(numeric, "mobility.legalChecks", checks);
  setNumeric(numeric, "mobility.nearKingZone", nearKing);
  addToken(tokens, `mobility-shape:${colorName(turn)}:moves:${bucketCount(moves.length)}`, 0.8);
  addToken(tokens, `mobility-shape:${colorName(turn)}:captures:${bucketCount(captures)}`, 0.7);
  addToken(tokens, `mobility-shape:${colorName(turn)}:checks:${bucketCount(checks)}`, checks > 0 ? 1.1 : 0.45);

  for (const pieceType of PIECE_TYPES) {
    const count = moves.filter((move) => move.piece === pieceType).length;
    if (count > 0) addToken(tokens, `mobility-by-piece:${colorName(turn)}:${pieceType}:${bucketCount(count)}`, 0.45);
  }

  setNumeric(numeric, `mobility.${turn}.kingDistance`, kingDistanceToCenter(board.kings[turn]));
}

function addMaterialAndPhase(board: BoardState, numeric: NumericFeatures, tokens: TokenWeights) {
  let nonPawnMaterial = 0;

  for (const color of [WHITE, BLACK] as const) {
    let material = 0;
    let majors = 0;
    let minors = 0;
    let queens = 0;
    for (const pieceType of PIECE_TYPES) {
      const count = [...board.pieces.values()].filter(
        (piece) => piece.color === color && piece.type === pieceType,
      ).length;
      setNumeric(numeric, `material.${color}.${pieceType}`, count);
      material += count * pieceWeight(pieceType);
      if (pieceType !== PAWN && pieceType !== KING) nonPawnMaterial += count * pieceWeight(pieceType);
      if (pieceType === ROOK || pieceType === QUEEN) majors += count;
      if (pieceType === BISHOP || pieceType === KNIGHT) minors += count;
      if (pieceType === QUEEN) queens += count;
    }

    setNumeric(numeric, `material.${color}.total`, material);
    setNumeric(numeric, `material.${color}.majors`, majors);
    setNumeric(numeric, `material.${color}.minors`, minors);
    setNumeric(numeric, `material.${color}.queens`, queens);
    addToken(tokens, `material:${colorName(color)}:queens:${queens > 0 ? "present" : "absent"}`, 1);
    addToken(tokens, `material:${colorName(color)}:majors:${bucketCount(majors)}`, 0.55);
    addToken(tokens, `material:${colorName(color)}:minors:${bucketCount(minors)}`, 0.55);
  }

  setNumeric(numeric, "material.balance", (numeric["material.w.total"] ?? 0) - (numeric["material.b.total"] ?? 0));
  setNumeric(numeric, "phase.scalar", clamp01(nonPawnMaterial / 62));
  addToken(tokens, `phase:${phaseBucket(nonPawnMaterial / 62)}`, 0.9);
}

function readBoard(chess: Chess): BoardState {
  const pieces = new Map<Square, Piece>();
  const kings: Partial<Record<Color, Square>> = {};

  for (const row of chess.board()) {
    for (const entry of row) {
      if (!entry) continue;
      const piece = { color: entry.color, type: entry.type };
      pieces.set(entry.square, piece);
      if (entry.type === KING) kings[entry.color] = entry.square;
    }
  }

  if (!kings[WHITE] || !kings[BLACK]) {
    throw new Error("FEN must include both kings.");
  }

  return {
    pieces,
    kings: {
      [WHITE]: kings[WHITE],
      [BLACK]: kings[BLACK],
    },
  };
}

function detectPins(board: BoardState) {
  const pins: Array<{
    pinnedSquare: Square;
    pinned: Piece;
    bySquare: Square;
    by: Piece;
    line: string;
  }> = [];

  for (const color of [WHITE, BLACK] as const) {
    const king = board.kings[color];
    for (const direction of SLIDING_DIRECTIONS) {
      let candidate: { square: Square; piece: Piece } | null = null;
      for (const square of raySquares(king, direction)) {
        const piece = board.pieces.get(square);
        if (!piece) continue;

        if (!candidate) {
          if (piece.color !== color) break;
          candidate = { square, piece };
          continue;
        }

        if (piece.color === color) break;
        if (sliderAttacksAlong(piece.type, direction)) {
          pins.push({
            pinnedSquare: candidate.square,
            pinned: candidate.piece,
            bySquare: square,
            by: piece,
            line: lineKind(direction),
          });
        }
        break;
      }
    }
  }

  return pins;
}

function analyzePawns(board: BoardState, color: Color) {
  const pawns = [...board.pieces.entries()]
    .filter(([, piece]) => piece.type === PAWN && piece.color === color)
    .map(([square]) => square);
  const enemyPawns = [...board.pieces.entries()]
    .filter(([, piece]) => piece.type === PAWN && piece.color === opposite(color))
    .map(([square]) => square);
  const filesWithPawns = new Set(pawns.map(squareFile));
  const fileCounts = new Map<number, number>();
  for (const square of pawns) fileCounts.set(squareFile(square), (fileCounts.get(squareFile(square)) ?? 0) + 1);

  let isolated = 0;
  let doubled = 0;
  let passed = 0;
  let advancedPassed = 0;
  const details: Array<{
    square: Square;
    isolated: boolean;
    doubled: boolean;
    passed: boolean;
    advancedPassed: boolean;
    promotionPathClear: boolean;
  }> = [];

  for (const square of pawns) {
    const file = squareFile(square);
    const rank = squareRank(square);
    const isIsolated = !filesWithPawns.has(file - 1) && !filesWithPawns.has(file + 1);
    const isDoubled = (fileCounts.get(file) ?? 0) > 1;
    const isPassed = !enemyPawns.some((enemy) => {
      const enemyFile = squareFile(enemy);
      const enemyRank = squareRank(enemy);
      if (Math.abs(enemyFile - file) > 1) return false;
      return color === WHITE ? enemyRank > rank : enemyRank < rank;
    });
    const isAdvancedPassed = isPassed && (color === WHITE ? rank >= 6 : rank <= 3);
    const promotionPathClear = isPassed && pathToPromotionIsClear(board, square, color);

    if (isIsolated) isolated += 1;
    if (isDoubled) doubled += 1;
    if (isPassed) passed += 1;
    if (isAdvancedPassed) advancedPassed += 1;
    details.push({
      square,
      isolated: isIsolated,
      doubled: isDoubled,
      passed: isPassed,
      advancedPassed: isAdvancedPassed,
      promotionPathClear,
    });
  }

  return {
    isolated,
    doubled,
    passed,
    advancedPassed,
    islands: countPawnIslands(filesWithPawns),
    details,
  };
}

function weightedJaccard(left: TokenWeights, right: TokenWeights) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  if (keys.size === 0) return 1;

  let intersection = 0;
  let union = 0;
  for (const key of keys) {
    const leftWeight = left[key] ?? 0;
    const rightWeight = right[key] ?? 0;
    intersection += Math.min(leftWeight, rightWeight);
    union += Math.max(leftWeight, rightWeight);
  }

  return union === 0 ? 1 : clamp01(intersection / union);
}

function blendedVectorSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length) {
    throw new Error("Cannot compare vectors with different lengths.");
  }
  return clamp01(cosineSimilarity(left, right) * 0.55 + vectorL1Similarity(left, right) * 0.45);
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 && rightNorm === 0) return 1;
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return clamp01(dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)));
}

function vectorL1Similarity(left: number[], right: number[]) {
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < left.length; index += 1) {
    numerator += Math.abs(left[index] - right[index]);
    denominator += Math.max(1, Math.abs(left[index]), Math.abs(right[index]));
  }
  return denominator === 0 ? 1 : clamp01(1 - numerator / denominator);
}

function numericL1Similarity(
  left: NumericFeatures,
  right: NumericFeatures,
  include: (name: string) => boolean,
) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(include);
  if (keys.length === 0) return 1;

  let numerator = 0;
  let denominator = 0;
  for (const key of keys) {
    const leftValue = left[key] ?? 0;
    const rightValue = right[key] ?? 0;
    numerator += Math.abs(leftValue - rightValue);
    denominator += Math.max(1, Math.abs(leftValue), Math.abs(rightValue));
  }

  return denominator === 0 ? 1 : clamp01(1 - numerator / denominator);
}

function normalizeWeights(weights: FenSimilarityWeights): FenSimilarityWeights {
  const total = Object.values(weights).reduce((acc, weight) => acc + Math.max(0, weight), 0) || 1;
  return {
    tokens: Math.max(0, weights.tokens) / total,
    pressure: Math.max(0, weights.pressure) / total,
    scalar: Math.max(0, weights.scalar) / total,
    mobility: Math.max(0, weights.mobility) / total,
    material: Math.max(0, weights.material) / total,
  };
}

function addToken(tokens: TokenWeights, token: string, weight = 1) {
  tokens[token] = (tokens[token] ?? 0) + weight;
}

function setNumeric(numeric: NumericFeatures, key: string, value: number) {
  numeric[key] = value;
}

function addNumeric(numeric: NumericFeatures, key: string, value: number) {
  numeric[key] = (numeric[key] ?? 0) + value;
}

function pieceKey(piece: Piece) {
  return `${piece.color}${piece.type}`;
}

function pieceWeight(pieceType: PieceSymbol) {
  return PIECE_VALUES[pieceType];
}

function opposite(color: Color): Color {
  return color === WHITE ? BLACK : WHITE;
}

function colorName(color: Color) {
  return color === WHITE ? "white" : "black";
}

function squareFile(square: Square) {
  return square.charCodeAt(0) - 97;
}

function squareRank(square: Square) {
  return Number(square[1]);
}

function toSquare(fileIndex: number, rank: number): Square | null {
  if (fileIndex < 0 || fileIndex > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[fileIndex]}${rank}` as Square;
}

function raySquares(from: Square, direction: Direction) {
  const squares: Square[] = [];
  let file = squareFile(from) + direction.df;
  let rank = squareRank(from) + direction.dr;
  while (true) {
    const square = toSquare(file, rank);
    if (!square) break;
    squares.push(square);
    file += direction.df;
    rank += direction.dr;
  }
  return squares;
}

function directionsForSlider(pieceType: PieceSymbol): Direction[] {
  if (pieceType === BISHOP) return [...DIAGONAL_DIRECTIONS];
  if (pieceType === ROOK) return [...ORTHOGONAL_DIRECTIONS];
  if (pieceType === QUEEN) return [...SLIDING_DIRECTIONS];
  return [];
}

function sliderAttacksAlong(pieceType: PieceSymbol, direction: Direction) {
  const diagonal = Math.abs(direction.df) === 1 && Math.abs(direction.dr) === 1;
  if (pieceType === QUEEN) return true;
  if (pieceType === BISHOP) return diagonal;
  if (pieceType === ROOK) return !diagonal;
  return false;
}

function lineKind(direction: Direction) {
  return Math.abs(direction.df) === 1 && Math.abs(direction.dr) === 1 ? "diagonal" : "orthogonal";
}

function pathIsClear(board: BoardState, from: Square, to: Square) {
  const df = Math.sign(squareFile(to) - squareFile(from));
  const dr = Math.sign(squareRank(to) - squareRank(from));
  let file = squareFile(from) + df;
  let rank = squareRank(from) + dr;

  while (file !== squareFile(to) || rank !== squareRank(to)) {
    const square = toSquare(file, rank);
    if (!square) return false;
    if (board.pieces.has(square)) return false;
    file += df;
    rank += dr;
  }

  return true;
}

function piecesOnFile(board: BoardState, fileIndex: number, pieceType?: PieceSymbol) {
  return [...board.pieces.entries()]
    .filter(([square, piece]) => squareFile(square) === fileIndex && (!pieceType || piece.type === pieceType))
    .map(([square, piece]) => ({ square, piece }));
}

function kingZone(kingSquare: Square, color: Color) {
  const squares = new Set<Square>([kingSquare]);
  const file = squareFile(kingSquare);
  const rank = squareRank(kingSquare);
  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      const square = toSquare(file + df, rank + dr);
      if (square) squares.add(square);
    }
  }

  const forward = color === WHITE ? 1 : -1;
  for (const distance of [1, 2]) {
    for (let df = -1; df <= 1; df += 1) {
      const square = toSquare(file + df, rank + forward * distance);
      if (square) squares.add(square);
    }
  }

  return [...squares];
}

function pawnShieldSquares(kingSquare: Square, color: Color) {
  const squares: Square[] = [];
  const file = squareFile(kingSquare);
  const rank = squareRank(kingSquare);
  const forward = color === WHITE ? 1 : -1;
  for (const distance of [1, 2]) {
    for (let df = -1; df <= 1; df += 1) {
      const square = toSquare(file + df, rank + forward * distance);
      if (square) squares.push(square);
    }
  }
  return squares;
}

function castlingShape(color: Color, kingSquare: Square) {
  if (color === WHITE && kingSquare === "g1") return "castled-kingside";
  if (color === WHITE && kingSquare === "c1") return "castled-queenside";
  if (color === BLACK && kingSquare === "g8") return "castled-kingside";
  if (color === BLACK && kingSquare === "c8") return "castled-queenside";
  if ((color === WHITE && kingSquare === "e1") || (color === BLACK && kingSquare === "e8")) {
    return "uncastled";
  }
  return "king-moved";
}

function nearFileIndexes(fileIndex: number) {
  return [fileIndex - 1, fileIndex, fileIndex + 1].filter((file) => file >= 0 && file <= 7);
}

function fileOffsetName(offset: number) {
  if (offset < 0) return "left";
  if (offset > 0) return "right";
  return "same";
}

function pawnAt(board: BoardState, square: Square, color: Color) {
  const piece = board.pieces.get(square);
  return piece?.type === PAWN && piece.color === color;
}

function rankBucket(rank: number, color: Color) {
  const progress = color === WHITE ? rank : 9 - rank;
  if (progress <= 2) return "home";
  if (progress <= 4) return "mid";
  if (progress <= 6) return "advanced";
  return "promotion";
}

function countPawnIslands(filesWithPawns: Set<number>) {
  let islands = 0;
  let inIsland = false;
  for (let file = 0; file < 8; file += 1) {
    if (filesWithPawns.has(file)) {
      if (!inIsland) islands += 1;
      inIsland = true;
    } else {
      inIsland = false;
    }
  }
  return islands;
}

function pathToPromotionIsClear(board: BoardState, square: Square, color: Color) {
  const file = squareFile(square);
  const forward = color === WHITE ? 1 : -1;
  let rank = squareRank(square) + forward;
  while (rank >= 1 && rank <= 8) {
    const next = toSquare(file, rank);
    if (!next) return false;
    if (board.pieces.has(next)) return false;
    rank += forward;
  }
  return true;
}

function squareSalience(
  square: Square,
  board: BoardState,
  whiteKingZone: Set<Square>,
  blackKingZone: Set<Square>,
) {
  let salience = 1;
  const file = squareFile(square);
  const rank = squareRank(square);
  const piece = board.pieces.get(square);
  if ((file === 3 || file === 4) && (rank === 4 || rank === 5)) salience += 0.65;
  if (file >= 2 && file <= 5 && rank >= 3 && rank <= 6) salience += 0.2;
  if (whiteKingZone.has(square) || blackKingZone.has(square)) salience += 1.05;
  if (piece) salience += pieceWeight(piece.type) * 0.18;
  return salience;
}

function zoneOf(square: Square, king: Square) {
  const df = squareFile(square) - squareFile(king);
  const dr = squareRank(square) - squareRank(king);
  if (df === 0 && dr === 0) return "king";
  if (dr > 0) return df === 0 ? "front" : "front-flank";
  if (dr < 0) return df === 0 ? "back" : "back-flank";
  return "side";
}

function bucketCount(value: number) {
  if (value <= 0) return "0";
  if (value === 1) return "1";
  if (value === 2) return "2";
  if (value <= 4) return "3-4";
  if (value <= 8) return "5-8";
  if (value <= 16) return "9-16";
  return "17+";
}

function phaseBucket(phase: number) {
  if (phase >= 0.72) return "opening";
  if (phase >= 0.34) return "middlegame";
  return "endgame";
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

function average(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
