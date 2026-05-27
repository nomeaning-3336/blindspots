import { Chess } from "chess.js";

export type SpaFillerOrigin = "random_position" | "lichess_puzzle";
export type SpaQueueSource = "review" | "active" | "filler";

export type SpaPersonalColdCandidate = {
  fen: string;
  candidateType: "personal";
  queueSource: "review" | "active";
  sourceType?: string;
  trainingItemId: string;
  tags?: string[];
  openingName?: string;
  eco?: string;
  reviewCount?: number;
};

export type SpaFillerColdCandidate = {
  fen: string;
  candidateType: "filler";
  queueSource: "filler";
  sourceType?: string;
  fillerId: string;
  fillerOrigin: SpaFillerOrigin;
  fillerCursor: number;
  selectedPhase?: string;
};

export type SpaColdCandidate =
  | SpaPersonalColdCandidate
  | SpaFillerColdCandidate;

export type SpaStoredMove = {
  san: string;
  uci: string;
  side: "w" | "b";
};

export type SpaActiveSession = {
  id: string;
  startingFen: string;
  moves: SpaStoredMove[];
  sequenceLength: number;
  selectedTrainingItemId: string | null;
  queueSource: SpaQueueSource;
  fillerId: string | null;
  fillerOrigin: SpaFillerOrigin | null;
  opponentMode: string;
  startedAt: string;
};

export type SpaBoardHistoryEntry = {
  fen: string;
  lastMove: { from: string; to: string } | null;
};

export type RestoredSpaBoardState = {
  fen: string;
  history: SpaBoardHistoryEntry[];
  historyIndex: number;
  lastMove: { from: string; to: string } | null;
};

export type SpaCompletionResult = {
  sessionId: string;
  trainingOutcome: "pass" | "acceptable" | "fail";
  averageCpLoss: number;
  maxSingleCpLoss: number;
  elo: {
    eloBefore: number;
    eloAfter: number;
    eloDelta: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const entries = value.filter((entry): entry is string => typeof entry === "string");
  return entries.length > 0 ? entries : undefined;
}

function validateFen(fen: string): void {
  try {
    new Chess(fen);
  } catch {
    throw new Error("Training payload contains an invalid FEN.");
  }
}

function parseFillerOrigin(value: unknown): SpaFillerOrigin | null {
  return value === "random_position" || value === "lichess_puzzle"
    ? value
    : null;
}

function parseStoredMove(value: unknown): SpaStoredMove {
  if (!isRecord(value)) {
    throw new Error("Active session contains an invalid stored move.");
  }

  const san = readNonEmptyString(value.san);
  const uci = readNonEmptyString(value.uci);
  const side = value.side === "w" || value.side === "b" ? value.side : null;

  if (!san || !uci || !side || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    throw new Error("Active session contains an invalid stored move.");
  }

  return { san, uci, side };
}

export function parseColdCandidateResponse(value: unknown): SpaColdCandidate {
  if (!isRecord(value)) {
    throw new Error("Next-position response is invalid.");
  }

  const fen = readNonEmptyString(value.fen);
  const candidateType = value.candidateType;
  const queueSource = value.queueSource;

  if (!fen) {
    throw new Error("Next-position response has no playable FEN.");
  }

  validateFen(fen);

  if (candidateType === "personal") {
    const trainingItemId = readNonEmptyString(value.trainingItemId);

    if (
      !trainingItemId ||
      (queueSource !== "review" && queueSource !== "active")
    ) {
      throw new Error("Personal candidate identity is invalid.");
    }

    return {
      fen,
      candidateType,
      queueSource,
      trainingItemId,
      sourceType: readOptionalString(value.sourceType),
      tags: readOptionalStringArray(value.tags),
      openingName: readOptionalString(value.openingName),
      eco: readOptionalString(value.eco),
      reviewCount:
        typeof value.reviewCount === "number" && Number.isFinite(value.reviewCount)
          ? value.reviewCount
          : undefined,
    };
  }

  if (candidateType === "filler" && queueSource === "filler") {
    const fillerId = readNonEmptyString(value.fillerId);
    const fillerOrigin = parseFillerOrigin(value.fillerOrigin);
    const fillerCursor =
      typeof value.fillerCursor === "number" &&
      Number.isSafeInteger(value.fillerCursor) &&
      value.fillerCursor >= 0
        ? value.fillerCursor
        : null;

    if (!fillerId || !fillerOrigin || fillerCursor === null) {
      throw new Error("Filler candidate identity is invalid.");
    }

    return {
      fen,
      candidateType,
      queueSource,
      fillerId,
      fillerOrigin,
      fillerCursor,
      sourceType: readOptionalString(value.sourceType),
      selectedPhase: readOptionalString(value.selectedPhase),
    };
  }

  throw new Error("Next-position response has an invalid candidate type.");
}

export function parseActiveSessionResponse(value: unknown): SpaActiveSession | null {
  if (!isRecord(value) || !("session" in value)) {
    throw new Error("Active-session response is invalid.");
  }

  if (value.session === null) {
    return null;
  }

  if (!isRecord(value.session)) {
    throw new Error("Active-session response is invalid.");
  }

  const session = value.session;
  const id = readNonEmptyString(session.id);
  const startingFen = readNonEmptyString(session.startingFen);
  const queueSource =
    session.queueSource === "review" ||
    session.queueSource === "active" ||
    session.queueSource === "filler"
      ? session.queueSource
      : null;
  const selectedTrainingItemId =
    typeof session.selectedTrainingItemId === "string"
      ? session.selectedTrainingItemId
      : null;
  const fillerId =
    typeof session.fillerId === "string" ? session.fillerId : null;
  const fillerOrigin = parseFillerOrigin(session.fillerOrigin);
  const startedAt = readNonEmptyString(session.startedAt);
  const opponentMode = readNonEmptyString(session.opponentMode);
  const sequenceLength =
    typeof session.sequenceLength === "number" &&
    Number.isSafeInteger(session.sequenceLength) &&
    session.sequenceLength >= 1
      ? session.sequenceLength
      : null;

  if (
    !id ||
    !startingFen ||
    !queueSource ||
    !opponentMode ||
    !startedAt ||
    sequenceLength === null ||
    !Array.isArray(session.moves) ||
    session.moves.length === 0
  ) {
    throw new Error("Active-session response is invalid.");
  }

  validateFen(startingFen);

  if (
    queueSource === "filler"
      ? selectedTrainingItemId !== null || !fillerId || !fillerOrigin
      : !selectedTrainingItemId || fillerId !== null || fillerOrigin !== null
  ) {
    throw new Error("Active-session candidate identity is invalid.");
  }

  return {
    id,
    startingFen,
    moves: session.moves.map(parseStoredMove),
    sequenceLength,
    selectedTrainingItemId,
    queueSource,
    fillerId,
    fillerOrigin,
    opponentMode,
    startedAt,
  };
}

export function parseRequiredActiveSessionResponse(value: unknown): SpaActiveSession {
  const session = parseActiveSessionResponse(value);

  if (!session) {
    throw new Error("Move persistence did not return an active session.");
  }

  return session;
}

export function parseCompleteSequenceResponse(value: unknown): SpaCompletionResult {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error("Sequence completion response is invalid.");
  }

  const sessionId = readNonEmptyString(value.sessionId);
  const trainingOutcome =
    value.trainingOutcome === "pass" ||
    value.trainingOutcome === "acceptable" ||
    value.trainingOutcome === "fail"
      ? value.trainingOutcome
      : null;

  const averageCpLoss =
    typeof value.averageCpLoss === "number" && Number.isFinite(value.averageCpLoss)
      ? value.averageCpLoss
      : null;
  const maxSingleCpLoss =
    typeof value.maxSingleCpLoss === "number" && Number.isFinite(value.maxSingleCpLoss)
      ? value.maxSingleCpLoss
      : null;
  const elo = isRecord(value.elo) ? value.elo : null;

  if (!sessionId || !trainingOutcome || averageCpLoss === null || maxSingleCpLoss === null || !elo) {
    throw new Error("Sequence completion response is invalid.");
  }

  const eloBefore =
    typeof elo.eloBefore === "number" && Number.isFinite(elo.eloBefore)
      ? elo.eloBefore
      : null;
  const eloAfter =
    typeof elo.eloAfter === "number" && Number.isFinite(elo.eloAfter)
      ? elo.eloAfter
      : null;
  const eloDelta =
    typeof elo.eloDelta === "number" && Number.isFinite(elo.eloDelta)
      ? elo.eloDelta
      : null;

  if (eloBefore === null || eloAfter === null || eloDelta === null) {
    throw new Error("Sequence completion response is invalid.");
  }

  return {
    sessionId,
    trainingOutcome,
    averageCpLoss,
    maxSingleCpLoss,
    elo: {
      eloBefore,
      eloAfter,
      eloDelta,
    },
  };
}

export function buildRestoredBoardState(
  session: SpaActiveSession,
): RestoredSpaBoardState {
  const chess = new Chess(session.startingFen);
  const userSide = chess.turn();
  const history: SpaBoardHistoryEntry[] = [
    { fen: session.startingFen, lastMove: null },
  ];
  let userMoveCount = 0;

  for (const storedMove of session.moves) {
    if (storedMove.side !== chess.turn()) {
      throw new Error("Active-session move side does not match the restored board.");
    }

    const played = chess.move({
      from: storedMove.uci.slice(0, 2),
      to: storedMove.uci.slice(2, 4),
      promotion:
        storedMove.uci.length === 5 ? storedMove.uci[4] : undefined,
    });

    if (!played || played.san !== storedMove.san) {
      throw new Error("Active-session moves cannot be restored legally.");
    }

    if (storedMove.side === userSide) {
      userMoveCount += 1;
    }

    history.push({
      fen: chess.fen(),
      lastMove: {
        from: played.from,
        to: played.to,
      },
    });
  }

  if (userMoveCount !== session.sequenceLength) {
    throw new Error("Active-session sequence length does not match restored moves.");
  }

  const latest = history[history.length - 1]!;

  return {
    fen: latest.fen,
    history,
    historyIndex: history.length - 1,
    lastMove: latest.lastMove,
  };
}
