import { buildLastMoveBadge } from "@/lib/training-board-ui";

export type PostmortemMoveSide = "white" | "black";

export type PostmortemMoveKind = "user" | "engine" | "setup" | "explore";

export type PostmortemMoveClassification = "brilliant" | "critical" | "best" | "excellent" | "good" | "okay" | "inaccuracy" | "mistake" | "blunder";

export type PostmortemTrainingMove = {
  san: string;
  uci: string;
  side: PostmortemMoveSide;
  fenBefore?: string;
  fenAfter?: string;
  cpLoss?: number;
  evalBefore?: number;
  evalAfter?: number;
  mateBefore?: number | null;
  mateAfter?: number | null;
  classification?: PostmortemMoveClassification;
};

export type PostmortemMoveScore = {
  userMoveIndex: number;
  cpLoss: number;
  evalBefore?: number;
  evalAfter?: number;
  mateBefore?: number | null;
  mateAfter?: number | null;
  classification?: PostmortemMoveClassification;
};

export type PostmortemSequencePosition = {
  index: number;
  fen: string;
  label: string;
  move?: PostmortemTrainingMove;
  pitchIndex?: number;
  userMoveIndex?: number;
  kind?: PostmortemMoveKind;
};

export type CanonicalPostmortemMove = {
  positionIndex: number;
  userMoveIndex: number | null;
  kind: PostmortemMoveKind;
  fen: string;
  move: PostmortemTrainingMove | null;
  uci: string | null;
  from: string | null;
  to: string | null;
  san: string | null;

  classification?: PostmortemMoveClassification;
  cpLoss?: number;
  evalBefore?: number;
  evalAfter?: number;
  mateBefore?: number | null;
  mateAfter?: number | null;

  hasScore: boolean;
  hasClassification: boolean;

  boardBadge:
    | {
        label: string;
        icon: string;
        color: string;
      }
    | null;

  boardHighlight:
    | {
        from: string;
        to: string;
        classification?: PostmortemMoveClassification;
      }
    | null;

  chartPoint:
    | {
        positionIndex: number;
        classification?: PostmortemMoveClassification;
        engineCp?: number;
        mate?: number | null;
      }
    | null;

  tableRow:
    | {
        move: string;
        classification?: PostmortemMoveClassification;
        cpLoss?: number;
        evalBefore?: number;
        evalAfter?: number;
        mateBefore?: number | null;
        mateAfter?: number | null;
      }
    | null;
};

export function uciFromMove(
  move: Pick<PostmortemTrainingMove, "uci"> | null | undefined,
): {
  from: string | null;
  to: string | null;
} {
  const uci = move?.uci;
  if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    return { from: null, to: null };
  }

  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
  };
}

export function getAuthoritativeMoveClassification(input: {
  move?: { classification?: PostmortemMoveClassification } | null;
  moveScore?: { classification?: PostmortemMoveClassification } | null;
}): PostmortemMoveClassification | undefined {
  return input.moveScore?.classification ?? input.move?.classification;
}

export function classificationFromCpLoss(
  cpLoss: number | null | undefined,
): PostmortemMoveClassification | undefined {
  if (typeof cpLoss !== "number") return undefined;
  if (cpLoss >= 300) return "blunder";
  if (cpLoss >= 100) return "mistake";
  if (cpLoss >= 50) return "inaccuracy";
  return "okay";
}

export function mergeMoveWithAuthoritativeScore(input: {
  move: PostmortemTrainingMove;
  moveScore?: PostmortemMoveScore | null;
}): PostmortemTrainingMove {
  const { move, moveScore } = input;
  if (!moveScore) return move;

  return {
    ...move,
    cpLoss: moveScore.cpLoss,
    evalBefore: moveScore.evalBefore !== undefined ? moveScore.evalBefore : move.evalBefore,
    evalAfter: moveScore.evalAfter !== undefined ? moveScore.evalAfter : move.evalAfter,
    mateBefore: moveScore.mateBefore !== undefined ? moveScore.mateBefore : move.mateBefore,
    mateAfter: moveScore.mateAfter !== undefined ? moveScore.mateAfter : move.mateAfter,
    classification:
      classificationFromCpLoss(moveScore.cpLoss) ??
      getAuthoritativeMoveClassification({ move, moveScore }),
  };
}

export function buildMoveScoreByUserMoveIndex(
  scores: PostmortemMoveScore[],
): Map<number, PostmortemMoveScore> {
  return new Map(scores.map((score) => [score.userMoveIndex, score]));
}

export function buildCanonicalPostmortemMoves(input: {
  positions: PostmortemSequencePosition[];
  moveScores: PostmortemMoveScore[];
  userMoveIndexByPositionIndex?: Map<number, number>;
}): CanonicalPostmortemMove[] {
  const scoresByIndex = buildMoveScoreByUserMoveIndex(input.moveScores);

  return input.positions.map((position) => {
    const mappedUserMoveIndex = input.userMoveIndexByPositionIndex?.get(position.index);
    const userMoveIndex =
      mappedUserMoveIndex ??
      position.userMoveIndex ??
      (position.kind === "user" && typeof position.pitchIndex === "number" ? position.pitchIndex : null);
    const moveScore = userMoveIndex === null ? null : scoresByIndex.get(userMoveIndex) ?? null;
    const move = position.move
      ? mergeMoveWithAuthoritativeScore({ move: position.move, moveScore })
      : null;
    const { from, to } = uciFromMove(move);
    const cpLoss =
      typeof move?.cpLoss === "number"
        ? move.cpLoss
        : typeof moveScore?.cpLoss === "number"
          ? moveScore.cpLoss
          : undefined;
    const classification =
      classificationFromCpLoss(cpLoss) ??
      getAuthoritativeMoveClassification({ move, moveScore });
    const hasClassification = Boolean(classification);
    const boardBadge = classification ? buildLastMoveBadge(classification) : null;
    const boardHighlight = move && from && to
      ? {
          from,
          to,
          ...(classification ? { classification } : {}),
        }
      : null;
    const chartPoint = move
      ? {
          positionIndex: position.index,
          ...(classification ? { classification } : {}),
          ...(typeof move.evalAfter === "number" ? { engineCp: move.evalAfter } : {}),
          ...(move.mateAfter !== undefined ? { mate: move.mateAfter } : {}),
        }
      : null;
    const tableRow = move
      ? {
          move: move.san,
          ...(classification ? { classification } : {}),
          ...(typeof move.cpLoss === "number" ? { cpLoss: move.cpLoss } : {}),
          ...(typeof move.evalBefore === "number" ? { evalBefore: move.evalBefore } : {}),
          ...(typeof move.evalAfter === "number" ? { evalAfter: move.evalAfter } : {}),
          ...(move.mateBefore !== undefined ? { mateBefore: move.mateBefore } : {}),
          ...(move.mateAfter !== undefined ? { mateAfter: move.mateAfter } : {}),
        }
      : null;

    return {
      positionIndex: position.index,
      userMoveIndex,
      kind: position.kind ?? (userMoveIndex === null ? "engine" : "user"),
      fen: position.fen,
      move,
      uci: move?.uci ?? null,
      from,
      to,
      san: move?.san ?? null,
      ...(classification ? { classification } : {}),
      ...(typeof cpLoss === "number" ? { cpLoss } : {}),
      ...(typeof move?.evalBefore === "number" ? { evalBefore: move.evalBefore } : {}),
      ...(typeof move?.evalAfter === "number" ? { evalAfter: move.evalAfter } : {}),
      ...(move?.mateBefore !== undefined ? { mateBefore: move.mateBefore } : {}),
      ...(move?.mateAfter !== undefined ? { mateAfter: move.mateAfter } : {}),
      hasScore: Boolean(moveScore),
      hasClassification,
      boardBadge,
      boardHighlight,
      chartPoint,
      tableRow,
    };
  });
}

export function getCanonicalMoveForPosition(input: {
  positions: PostmortemSequencePosition[];
  moveScores: PostmortemMoveScore[];
  activePositionIndex: number;
  userMoveIndexByPositionIndex?: Map<number, number>;
}): CanonicalPostmortemMove | null {
  return buildCanonicalPostmortemMoves(input).find(
    (move) => move.positionIndex === input.activePositionIndex,
  ) ?? null;
}
