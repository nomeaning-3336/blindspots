"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Chess, type Square } from "chess.js";
import { AnalysisBoard, type BoardMove, type EngineArrow } from "@/components/chess/analysis-board";
import {
  BoardWithEvalBar,
  ClassificationBadge,
  EngineLinesSection,
  type EngineLineResult,
} from "@/components/train/postmortem-shared";
import {
  classifyEvaluatedMove,
  classifyRankedMove,
  isRecommendableClassification,
} from "@/lib/move-classification";
import {
  formatEvalLabel,
  formatLossLabel,
  graphValueFromEval,
} from "@/lib/training/eval-format";
import {
  analyzeBoardThemeForAppTheme,
  normalizeAnalyzePreferences,
  type AnalyzePreferences,
  type AnalyzeBoardTheme,
  type AnalyzePieceTheme,
} from "@/lib/analyze-preferences";
import {
  DEFAULT_BLINDSPOTS_ELO,
  classificationForPlayedMove,
  classificationColor,
  classificationIcon,
  classificationLabel,
  formatClassifiedMoveLead,
  getTrainingBoardHighlights,
  moveHighlightsForClassifiedMove,
  type MoveClassification,
} from "@/lib/training-board-ui";
import {
  buildCanonicalPostmortemMoves,
  classificationFromCpLoss,
  getAuthoritativeMoveClassification,
  mergeMoveWithAuthoritativeScore,
  type CanonicalPostmortemMove,
} from "@/lib/training/postmortem-view-model";
import {
  buildDeepestEngineLineMap,
  mergePieceLinesWithDeeperKnownLines,
} from "@/lib/training/engine-line-cache";
import {
  formatPostmortemEvalLabel,
  getPostmortemTerminalDisplay,
  whitePositiveMateCp,
} from "@/lib/training/postmortem-terminal-display";
import {
  postMortemNavigationAction,
  type PostMortemNavigationKey,
} from "@/lib/training-postmortem-navigation";
import { runStartTrainingTransition } from "@/lib/train-onboarding-transition";
import {
  buildSessionAnnotations,
  buildMoveKey,
  normalizeDecisionFen,
  isFailedClassification,
  updateNoteText,
  type AnnotatedMove,
} from "@/lib/training/mistake-memory";
import { MoveNotesPanel } from "@/components/train/mistake-memory-panel";
import { TopAlertViewport, useTopAlert } from "@/components/ui/top-alert";
import { normalizeNotes, formatEvalCp, type NormalizedNote, type RawNoteRow } from "@/lib/notes";

type TrainingState = "active" | "complete" | "drift" | "resolving";
type OnboardingScreen = "loading" | "connect" | "analysis" | "summary" | "done";
type ProfileProvider = "chesscom" | "lichess";
type SkillLevel = "new_to_chess" | "beginner" | "intermediate" | "advanced" | "expert";

type AttemptRegistryEntry = {
  id: string;
  decisionFen: string;
  moveUci: string;
  moveSan: string;
  classification: "inaccuracy" | "mistake" | "blunder";
  cpLoss: number;
  playedAt: string;
  note: string | null;
};

function moveDeltaToneClass(cpLoss?: number | null, classification?: MoveClassification | null) {
  if (typeof cpLoss === "number") {
    if (cpLoss > 0) return "text-[var(--app-class-blunder)]";
    if (cpLoss < 0) return "text-[var(--app-class-good)]";
    return "text-[var(--app-muted-soft)]";
  }
  switch (classification) {
    case "blunder":
    case "mistake":
    case "inaccuracy":
      return "text-[var(--app-class-blunder)]";
    case "brilliant":
    case "best":
    case "excellent":
    case "good":
      return "text-[var(--app-class-good)]";
    default:
      return "text-[var(--app-muted-soft)]";
  }
}

function evalDeltaToneClass(delta: number | null | undefined) {
  if (typeof delta !== "number" || delta === 0) return "text-[var(--app-muted-soft)]";
  return delta > 0 ? "text-[var(--app-class-good)]" : "text-[var(--app-class-blunder)]";
}

function moverColorFromFen(fen: string | null | undefined): "white" | "black" | null {
  if (!fen) return null;
  const turn = fen.trim().split(/\s+/)[1];
  if (turn === "w") return "white";
  if (turn === "b") return "black";
  return null;
}

function sideToMoveFromFen(fen: string | null | undefined): "white" | "black" | null {
  return moverColorFromFen(fen);
}

function evalDeltaToneClassForMover(input: {
  evalBeforeCp: number | null | undefined;
  evalAfterCp: number | null | undefined;
  moverColor: "white" | "black" | null | undefined;
}) {
  if (
    typeof input.evalBeforeCp !== "number" ||
    typeof input.evalAfterCp !== "number" ||
    !input.moverColor
  ) {
    return "text-[var(--app-muted-soft)]";
  }

  const rawDelta = input.evalAfterCp - input.evalBeforeCp;
  if (rawDelta === 0) return "text-[var(--app-muted-soft)]";

  const perspectiveDelta =
    input.moverColor === "black" ? -rawDelta : rawDelta;

  return perspectiveDelta > 0
    ? "text-[var(--app-class-good)]"
    : "text-[var(--app-class-blunder)]";
}

const SKILL_LEVEL_STARTING_ELO: Record<SkillLevel, number> = {
  new_to_chess: 0,
  beginner: 500,
  intermediate: 1000,
  advanced: 1500,
  expert: 2000,
};

const ENABLE_CLIENT_STOCKFISH_LINES = true;
const CLIENT_STOCKFISH_MULTIPV = 5;
const CLIENT_STOCKFISH_MOVETIME_MS = 800;
const PRELUDE_SETUP_MOVE_DELAY_MS = 1000;
const COMPLETION_EVAL_GRACE_MS = 500;
const PREPLAY_PRELUDE_POST_FADE_DELAY_MS = 500;

type PostmortemTourStep = {
  target: string;
  headline: string;
  body: string;
  cta?: string;
  requiresAction?: "add-position-to-learning-queue";
  suppressSpotlight?: boolean;
  centerCard?: boolean;
  sidePanel?: "analysis" | "memory" | "keep";
};

const POSTMORTEM_TOUR_STEPS = [
  {
    target: "elo-card",
    headline: "Your blindspots ELO.",
    body: "This ELO will be used to tune the difficulty of your opponent engine. Play well and it will go up, play badly and expect it to go down.",
  },
  {
    target: "engine-lines",
    headline: "Engine lines",
    body: "Here you can see the top 5 engine lines for a given board position. These are also visualized on the board.",
  },
  {
    target: "eval-graph",
    headline: "Eval chart.",
    body: "Just a chart.",
  },
  {
    target: "move-table",
    headline: "Your played moves.",
    body: "Every move you played during the sequence: eval before, eval after and total centipawns lost.",
  },
  {
    target: "add-position-to-learning-queue",
    headline: "Add positions to your Learning queue.",
    body: "This is the core of your journey here at Blindspots. After a sequence is complete, you can navigate to any of the positions of the sequence and press Add Position to Learning Queue. This schedules a future review for that position where you will have a chance to see and remember exactly what went wrong and then try an alternative move.",
  },
  {
    target: "add-position-to-learning-queue",
    headline: "Add any position to the Learning queue.",
    body: "Now go ahead and try adding any position from this completed sequence to the Learning queue.",
    cta: "Okay",
    requiresAction: "add-position-to-learning-queue",
    suppressSpotlight: true,
  },
  {
    target: "postmortem-panel",
    headline: "Notes",
    body: "Now that we know how to add a position to the Learning queue, let's see how to use the Notes section.",
    centerCard: true,
    suppressSpotlight: true,
    sidePanel: "analysis",
  },
  {
    target: "notes-panel",
    headline: "Write a note to your future self.",
    body: "Select any of the moves you made, and write any note you want to see in the future. When the position comes back for review, this note might be shown to you, or hidden to see if you will perform well without it. This part is optional, but useful to remember things such as \"I played queen to a4 here but totally forgot the knight can fork the queen and king.\" Also useful to see commonly recurring patterns in your play, or rather, your \"blindspots\".",
  },
  {
    target: "postmortem-actions",
    headline: "Keep playing, or call it a day.",
    body: "The next position might be sampled from a random position to see how you play, or one of your already played positions that you didn't perform very well so you can try to fix your past mistake. Or you can go back to the main dashboard.",
    cta: "Set preferences",
  },
] as const satisfies readonly PostmortemTourStep[];

type TrainingMove = {
  san: string;
  uci: string;
  side: "white" | "black";
  fenBefore?: string;
  fenAfter?: string;
  cpLoss?: number;
  evalBefore?: number;
  evalAfter?: number;
  mateBefore?: number | null;
  mateAfter?: number | null;
  classification?: MoveClassification;
};

type MoveHighlightTarget = {
  from: string;
  to: string;
  classification?: MoveClassification;
};

type EloResult = {
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  kFactor: number;
  opponentElo: number;
  expectedScore: number;
  actualScore: number;
  rawDelta: number;
  clampedDelta: number;
  skipped: boolean;
};

type OpponentMoveResponse = {
  move?: {
    san: string;
    uci: string;
  };
  error?: string;
};

type MoveScore = {
  userMoveIndex: number;
  cpLoss: number;
  evalBefore?: number;
  evalAfter?: number;
  mateBefore?: number | null;
  mateAfter?: number | null;
  classification?: MoveClassification;
};

type CompletedMoveEvaluation = {
  userMoveIndex: number;
  moveScore: MoveScore;
  positionEvaluation: unknown;
};

type ResultMode = "results" | "explore";

type SequencePosition = {
  index: number;
  fen: string;
  label: string;
  move?: TrainingMove;
  surfacedNotes?: unknown;
  moveNotes?: unknown;
  move_notes?: unknown;
  notes?: unknown;
};

type VisibleSequencePosition = SequencePosition & {
  pitchIndex?: number;
  userMoveIndex?: number;
};

function trainPieceLineCacheKey(fen: string, square: string) {
  return `${fen}::${square}`;
}

function scoreEngineLineForSideToMove(line: EngineLineResult, isBlackToMove: boolean) {
  if (typeof line.mate === "number") {
    const mateCp = line.mate > 0 ? 100000 : -100000;
    return isBlackToMove ? -mateCp : mateCp;
  }

  return isBlackToMove ? -line.cp : line.cp;
}

type EvalGraphPoint = {
  value: number;
  positionIndex: number;
  classification?: MoveClassification;
  engineCp?: number;
  mate?: number | null;
};

type ExploratoryPosition = {
  fen: string;
  lastMove: { from: string; to: string } | null;
  move?: TrainingMove;
};

type NextPositionResponse = {
  fen?: string;
  previousFen?: string;
  playedMove?: string;
  decisionFen?: string;
  actualMoveUci?: string;
  actualMoveSan?: string;
  bestMoveUci?: string;
  bestMoveSan?: string;
  sequenceLength?: number;
  source?: string;
  selectedServeMode?: string;
  selectedPhase?: string;
  selectedBucket?: string;
  tags?: string[];
  isTactic?: boolean;
  tacticRating?: number;
  openingName?: string;
  eco?: string;
  challengeElo?: number;
  mistakeId?: string;
  queueSource?: string;
  cpLoss?: number;
  error?: string;
  attemptRegistry?: Array<{
    id: string;
    decisionFen: string;
    moveUci: string;
    moveSan: string;
    classification: "inaccuracy" | "mistake" | "blunder";
    cpLoss: number;
    playedAt: string;
    note: string | null;
  }>;
  moveNotes?: unknown;
};

interface InitializationSummary {
  mistakesFound: number;
  gamesAnalyzed: number;
  averageCpLossPerMove: number;
}

interface OnboardingStatePayload {
  shouldShowOnboarding: boolean;
  preferences: {
    sequence_length: number;
    opponent_mode: string;
    time_pressure_mode: string;
    opening_filter?: unknown;
    skill_level?: SkillLevel | null;
  } | null;
  profile: {
    blindspots_elo: number;
    total_sequences: number;
  } | null;
}

const ANALYZE_PREFERENCES_STORAGE_KEY = "chessview-analyze-preferences";
const ANALYZE_RUNTIME_SETTINGS_STORAGE_KEY = "chess-something:settings";
const MIN_ONBOARDING_EVALUATION_MS = 1200;
const ONBOARDING_BUILD_PROFILE_MS = 900;
const ANALYSIS_FAILURE_MESSAGE =
  "Analysis did not finish. We are sending you into training anyway.";
const DEFAULT_SEQUENCE_LENGTH = 4;
const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;
const EVAL_GRAPH_RANGE = 14;
const MIN_EVAL_GRAPH_SPAN = 2;
const DEFAULT_TRAINING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ONBOARDING_PREVIEW_POSITION = {
  previousFen:
    "r2qk2r/3bbp2/p1np3p/2p1p3/1p2P3/2PP2Pp/PPB1QP1B/RN2K2R w KQkq - 0 18",
  playedMove: "e1g1",
  playedMoveSan: "O-O",
  fen:
    "r2qk2r/3bbp2/p1np3p/2p1p3/1p2P3/2PP2Pp/PPB1QP1B/RN3RK1 b kq - 1 18",
  sequenceLength: 4,
  source: "onboarding",
} satisfies NextPositionResponse & {
  previousFen: string;
  playedMove: string;
  playedMoveSan: string;
  fen: string;
};
// Train audio - managed by lib/train-audio.ts
import {
  primeTrainAudio,
  unlockTrainAudio,
  playTrainMoveSound,
  setupTrainAudioUnlockOnGesture,
  getTrainAudioStats,
  pitchRatioForPly,
  type TrainSoundMove,
  type PlayTrainSoundOptions,
} from "@/lib/train-audio";
import { DAILY_TARGET_OPTIONS, MISTAKE_CAPTURE_THRESHOLD_OPTIONS } from "@/lib/training/training-preferences";

const postmortemActionTextClassName = "text-center text-sm font-bold uppercase leading-none tracking-[0.1em]";
const primaryActionClassName =
  `app-brutal-button inline-flex min-h-10 min-w-0 items-center justify-center px-3 py-2 text-sm`;
const secondaryActionClassName =
  `app-brutal-button-secondary inline-flex min-h-10 min-w-0 items-center justify-center px-3 py-2 text-sm`;

function readVisualPreferences() {
  let storedPreferences: Partial<AnalyzePreferences> | null = null;
  try {
    const raw =
      window.localStorage.getItem(ANALYZE_RUNTIME_SETTINGS_STORAGE_KEY) ??
      window.localStorage.getItem(ANALYZE_PREFERENCES_STORAGE_KEY);
    storedPreferences = raw ? (JSON.parse(raw) as Partial<AnalyzePreferences>) : null;
  } catch {
    storedPreferences = null;
  }

  const normalized = normalizeAnalyzePreferences(storedPreferences);
  const appTheme = document.documentElement.dataset.theme;

  return {
    boardTheme: analyzeBoardThemeForAppTheme(appTheme),
    pieceTheme: normalized.pieceTheme,
  };
}

function hasAnalyzeRuntimeSettings() {
  try {
    return Boolean(window.localStorage.getItem(ANALYZE_RUNTIME_SETTINGS_STORAGE_KEY));
  } catch {
    return false;
  }
}

// Train audio now managed by lib/train-audio.ts

function moveForExploreSound(
  positions: SequencePosition[],
  currentIndex: number,
  nextIndex: number,
) {
  if (nextIndex < currentIndex) return positions[currentIndex]?.move ?? null;
  if (nextIndex > currentIndex) return positions[nextIndex]?.move ?? null;
  return null;
}

function collectCompletedMoveEvaluations(
  evaluations: Record<
    number,
    {
      status: "pending" | "done" | "error";
      moveScore?: MoveScore;
      positionEvaluation?: unknown;
    }
  >,
): CompletedMoveEvaluation[] {
  return Object.entries(evaluations).flatMap(([rawIndex, entry]) => {
    const userMoveIndex = Number(rawIndex);
    if (!Number.isInteger(userMoveIndex)) return [];
    if (entry.status !== "done") return [];
    if (!entry.moveScore || !entry.positionEvaluation) return [];

    return [{
      userMoveIndex,
      moveScore: {
        ...entry.moveScore,
        userMoveIndex,
      },
      positionEvaluation: entry.positionEvaluation,
    }];
  });
}

function countUserMovesForCompletion(startingFen: string, moves: TrainingMove[]) {
  try {
    const chess = new Chess(startingFen);
    const userColor = chess.turn() === "w" ? "white" : "black";
    return moves.filter((move) => move.side === userColor).length;
  } catch {
    return 0;
  }
}

function delayMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForIntroOverlayExit(element: HTMLElement | null) {
  if (!element) return;

  // Let the browser start the CSS transition before we inspect animations.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const animations = element
    .getAnimations({ subtree: true })
    .filter((a) => a.playState !== "finished" && a.playState !== "idle");

  if (animations.length > 0) {
    await Promise.race([
      Promise.allSettled(animations.map((a) => a.finished)),
      delayMs(1000),
    ]);
  }

  // One more frame so the browser paints the cleared overlay.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForTourTargetMotion(target: Element, timeoutMs = 800) {
  const animatedContainer = target.closest(".train-postmortem-panel") ?? target;
  const animations = animatedContainer
    .getAnimations({ subtree: true })
    .filter((animation) => animation.playState !== "finished" && animation.playState !== "idle");

  if (animations.length === 0) return;

  await Promise.race([
    Promise.allSettled(animations.map((animation) => animation.finished)),
    delayMs(timeoutMs),
  ]);
}

async function waitForCompletedMoveEvaluations({
  getEvaluations,
  expectedCount,
  timeoutMs = 2500,
}: {
  getEvaluations: () => Record<
    number,
    {
      status: "pending" | "done" | "error";
      moveScore?: MoveScore;
      positionEvaluation?: unknown;
    }
  >;
  expectedCount: number;
  timeoutMs?: number;
}): Promise<CompletedMoveEvaluation[]> {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    const evaluations = getEvaluations();
    const completed = collectCompletedMoveEvaluations(evaluations);

    if (expectedCount <= 0 || completed.length >= expectedCount) {
      return completed;
    }

    const hasPending = Object.values(evaluations).some((entry) => entry.status === "pending");
    if (!hasPending) {
      return completed;
    }

    await delayMs(50);
  }

  return collectCompletedMoveEvaluations(getEvaluations());
}

async function readServerVisualPreferences() {
  const response = await fetch("/api/analyze/preferences", { cache: "no-store" });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as
    | { preferences?: Partial<AnalyzePreferences> }
    | null;
  const normalized = normalizeAnalyzePreferences(payload?.preferences ?? null);
  const appTheme = document.documentElement.dataset.theme;

  return {
    boardTheme: analyzeBoardThemeForAppTheme(appTheme),
    pieceTheme: normalized.pieceTheme,
  };
}

const mockRep = {
  fen: "8/2k3pp/p2r4/2K1p3/1R2Pp2/P4P2/6PP/8 w - - 0 57",
  completedFen: "8/1k4pp/p2K4/4p3/1R2Pp2/P4P2/6PP/8 b - - 2 58",
  sideToMove: "White",
  prompt: "Play it out",
  sequenceLength: DEFAULT_SEQUENCE_LENGTH,
  rating: DEFAULT_BLINDSPOTS_ELO,
  completedRating: 1656,
  moveHistory: [
  ] satisfies TrainingMove[],
  completedMoves: [
    { san: "Kc7", uci: "c5c7", side: "white" },
    { san: "Rxd4", uci: "d6d4", side: "black" },
    { san: "Rb7+", uci: "b4b7", side: "white" },
    { san: "Kxb7", uci: "c7b7", side: "black" },
    { san: "Kxd6", uci: "c5d6", side: "white" },
  ] satisfies TrainingMove[],
};

type TrainPageProps = {
  initialOnboarding?: boolean;
  forceOnboarding?: boolean;
  initialMistakeId?: string;
  initialMode?: "play" | "postmortem";
};

export default function TrainPage(props: TrainPageProps) {
  const { initialOnboarding = false, forceOnboarding = false, initialMistakeId, initialMode = "play" } = props;
  const initialMistakeIdConsumedRef = useRef(false);
  const [state, setState] = useState<TrainingState>("active");
  const [startingFen, setStartingFen] = useState<string>("");
  const searchParams = useSearchParams();
  const initialPreludeRef = useRef<{ previousFen: string; playedMove: string } | null>(null);
  const [moves, setMoves] = useState<TrainingMove[]>(mockRep.moveHistory);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [sequenceLength, _setSequenceLength] = useState(4);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("beginner");
  const [blindspotsElo, setBlindspotsElo] = useState(mockRep.rating);
  const [eloResult, setEloResult] = useState<EloResult | null>(null);
  const [resultMode, setResultMode] = useState<ResultMode>("results");
  const { alert: topAlert, showAlert, dismissAlert } = useTopAlert();
  const [exploreIndex, setExploreIndex] = useState(0);
  const [exploratoryFen, setExploratoryFen] = useState<string | null>(null);
  const [exploratoryLastMove, setExploratoryLastMove] = useState<{ from: string; to: string } | null>(null);
  const [exploratoryHistory, setExploratoryHistory] = useState<ExploratoryPosition[]>([]);
  const [exploratoryHistoryIndex, setExploratoryHistoryIndex] = useState(-1);
  const [exploreSelectedSquare, setExploreSelectedSquare] = useState<string | null>(null);
  const [selectedMoveIndex, setSelectedMoveIndex] = useState<number | null>(null);
  const [isManualPostmortemExploration, setIsManualPostmortemExploration] = useState(false);
  const [initialModeApplied, setInitialModeApplied] = useState(false);
  const [engineLineCache, setEngineLineCache] = useState<Record<string, EngineLineResult[]>>({});
  const [engineLineErrorFens, setEngineLineErrorFens] = useState<Set<string>>(new Set());
  const [engineLineLoadingFen, setEngineLineLoadingFen] = useState<string | null>(null);
  const [cachedNextPosition, setCachedNextPosition] = useState<NextPositionResponse | null>(null);
  const [surfacedNotesForFen, setSurfacedNotesForFen] = useState<{ fen: string; notes: RawNoteRow[] }>({ fen: "", notes: [] });
  const [currentPositionNotes, setCurrentPositionNotes] = useState<unknown[]>([]);
  const [currentChallengeElo, setCurrentChallengeElo] = useState<number | null>(null);
  const [isOpponentThinking, setIsOpponentThinking] = useState(false);
  const [isCompletingSequence, setIsCompletingSequence] = useState(false);
  const [isPositionLoading, setIsPositionLoading] = useState(true);
  const [hoveredAnnotationSquare, setHoveredAnnotationSquare] = useState<string | null>(null);
  const [hoveredEngineLineIndex, setHoveredEngineLineIndex] = useState<number | null>(null);
  const [hoveredMoveSquares, setHoveredMoveSquares] = useState<MoveHighlightTarget | null>(null);
  const [onboardingScreen, setOnboardingScreen] = useState<OnboardingScreen>("loading");
  const [selectedProvider, setSelectedProvider] = useState<ProfileProvider | null>(null);
  const [profileUsername, setProfileUsername] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [isConnectingProfile, setIsConnectingProfile] = useState(false);
  const [positionLoadError, setPositionLoadError] = useState<string | null>(null);
  const [isAwaitingStartGesture, setIsAwaitingStartGesture] = useState(false);
  const [pendingInitialEngineMove, setPendingInitialEngineMove] = useState<NextPositionResponse | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [asyncMoveEvaluations, setAsyncMoveEvaluations] = useState<Record<number, { status: "pending" | "done" | "error"; moveScore?: MoveScore; positionEvaluation?: unknown }>>({});
  const asyncMoveEvaluationsRef = useRef<Record<number, { status: "pending" | "done" | "error"; moveScore?: MoveScore; positionEvaluation?: unknown }>>({});
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0);
  const [initializationSummary, setInitializationSummary] =
    useState<InitializationSummary | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isStartingTraining, setIsStartingTraining] = useState(false);
  const [visualPreferences, setVisualPreferences] = useState<{
    boardTheme: AnalyzeBoardTheme;
    pieceTheme: AnalyzePieceTheme;
  }>({
    boardTheme: "midnight",
    pieceTheme: "maestro",
  });
  const [pieceLineCache, setPieceLineCache] = useState<Record<string, EngineLineResult[]>>({});
  const [pieceLinesLoadingKey, setPieceLinesLoadingKey] = useState<string | null>(null);
  const moveSoundPlyRef = useRef(0);
  const hasStartedFirstOnboardingSequenceRef = useRef(false);
  const completingRef = useRef(false);
  const completionRequestRef = useRef(0);
  const initialOpponentMoveRef = useRef<TrainingMove | null>(null);
  const [attemptRegistry, setAttemptRegistry] = useState<AttemptRegistryEntry[]>([]);
  const initialOpponentRequestRef = useRef(0);
  const selectedServeModeRef = useRef<string | null>(null);
  const selectedBucketRef = useRef<string | null>(null);
  const selectedPhaseRef = useRef<string | null>(null);
  const selectedTagsRef = useRef<string[] | null>(null);
  const selectedIsTacticRef = useRef<boolean | null>(null);
  const selectedTacticRatingRef = useRef<number | null>(null);
  const selectedOpeningNameRef = useRef<string | null>(null);
  const selectedEcoRef = useRef<string | null>(null);
  const currentMistakeIdRef = useRef<string | null>(null);
  const currentQueueSourceRef = useRef<string | null>(null);
  const [initialOpponentMove, setInitialOpponentMove] = useState<TrainingMove | null>(null);
  const [displayStartingFen, setDisplayStartingFen] = useState<string>("");
  const [hasLoadedPosition, setHasLoadedPosition] = useState(false);
  const [activeSetupReplayIndex, setActiveSetupReplayIndex] = useState<0 | 1>(1);
  const [activeReplayIndex, setActiveReplayIndex] = useState<number | null>(null);
  const nextPositionPrefetchRef = useRef<Promise<NextPositionResponse | null> | null>(null);
  const engineLineCacheRef = useRef<Record<string, EngineLineResult[]>>({});
  const engineLinePrefetchRef = useRef<Map<string, Promise<void>>>(new Map());
  const completedEngineLineFensRef = useRef<Set<string>>(new Set());
  const pieceLineCacheRef = useRef<Record<string, EngineLineResult[]>>({});
  const trainLayoutGridRef = useRef<HTMLDivElement | null>(null);
  const startTrainingGestureConsumedRef = useRef(false);
  const isPostMortemVisible = state === "complete" || state === "drift";
  const shouldAnimatePieces = state === "active" || isPostMortemVisible;

  const [fenCopied, setFenCopied] = useState(false);
  const [addingPositionToQueue, setAddingPositionToQueue] = useState(false);
  const fenCopyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fenCopyTimerRef.current) {
        window.clearTimeout(fenCopyTimerRef.current);
      }
    };
  }, []);

  const shouldRunPreplayOnboarding = initialOnboarding || forceOnboarding;

  const [fen, setFen] = useState<string>(
    shouldRunPreplayOnboarding ? ONBOARDING_PREVIEW_POSITION.previousFen : DEFAULT_TRAINING_FEN,
  );

  const PREPLAY_TOUR_STEPS = [
    {
      headline: "Welcome to Blindspots.",
      body: "Let's show you how this whole thing works, so you don't accidentally step on a rook with your pinky toe.",
    },
    {
      headline: "The loop.",
      body: "You'll be playing what we call a sequence — a position where you have to persevere against an engine opponent for four moves.",
    },
    {
      headline: "Keep the position afloat.",
      body: "Play your best chess for those four moves. At the end, we'll give our friend Stockfish a quick phone call to see how you did.",
    },
    {
      headline: "Your move.",
      body: "Go ahead.",
      cta: "Begin the Sequence",
    },
  ];

  const [trainOnboardingIntroStep, setTrainOnboardingIntroStep] = useState(0);
  const [trainOnboardingIntroDone, setTrainOnboardingIntroDone] = useState(false);
  const [trainOnboardingIntroVisible, setTrainOnboardingIntroVisible] = useState(false);
  const [trainOnboardingIntroExiting, setTrainOnboardingIntroExiting] = useState(false);
  const [isStartingPreplayPosition, setIsStartingPreplayPosition] = useState(false);
  const trainOnboardingIntroActive =
    shouldRunPreplayOnboarding && onboardingScreen === "done" && !trainOnboardingIntroDone;
  const [moveAnnotations, setMoveAnnotations] = useState<Record<string, AnnotatedMove>>({});
  const seededMoveKeysRef = useRef<Set<string>>(new Set());
  const [selectedMoveKey, setSelectedMoveKey] = useState<string | null>(null);
  const [savedMoveNoteKey, setSavedMoveNoteKey] = useState<string | null>(null);
  const [postmortemSidePanel, setPostmortemSidePanel] = useState<"analysis" | "memory">("analysis");
  const [postmortemOnboardingActive, setPostmortemOnboardingActive] = useState(false);
  const [postmortemOnboardingStep, setPostmortemOnboardingStep] = useState(0);
  const [postmortemOnboardingFinished, setPostmortemOnboardingFinished] = useState(false);
  const [postmortemAddPositionActionDone, setPostmortemAddPositionActionDone] = useState(false);
  const [postmortemAddPositionInstructionAcknowledged, setPostmortemAddPositionInstructionAcknowledged] = useState(false);
  const currentPostmortemTourStep = POSTMORTEM_TOUR_STEPS[postmortemOnboardingStep] as PostmortemTourStep;
  const isPostmortemAddPositionActionStep =
    postmortemOnboardingActive &&
    (currentPostmortemTourStep?.requiresAction ?? null) === "add-position-to-learning-queue";
  const isPostmortemAddPositionWaiting =
    isPostmortemAddPositionActionStep &&
    postmortemAddPositionInstructionAcknowledged &&
    !postmortemAddPositionActionDone;
  const [onboardingCompletionInFlight, setOnboardingCompletionInFlight] = useState(false);
  const [postmortemTourSoftSwitching, setPostmortemTourSoftSwitching] = useState(false);
  const [postmortemAddPositionCheckpointReached, setPostmortemAddPositionCheckpointReached] = useState(false);
  const [showOnboardingPreferencesModal, setShowOnboardingPreferencesModal] = useState(false);
  const [selectedDailyTargetLevel, setSelectedDailyTargetLevel] = useState<string>("balanced");
    const [isSavingOnboardingPreferences, setIsSavingOnboardingPreferences] = useState(false);

  useEffect(() => {
    engineLineCacheRef.current = engineLineCache;
  }, [engineLineCache]);

  useEffect(() => {
    pieceLineCacheRef.current = pieceLineCache;
  }, [pieceLineCache]);

  useEffect(() => {
    asyncMoveEvaluationsRef.current = asyncMoveEvaluations;
  }, [asyncMoveEvaluations]);

  useLayoutEffect(() => {
    const grid = trainLayoutGridRef.current;
    if (!grid) return;

    function syncBoardCenterOffset() {
      if (!grid) return;
      const computed = window.getComputedStyle(grid);
      const columnGap = parseFloat(computed.columnGap) || 0;
      const columnWidths = computed.gridTemplateColumns
        .split(" ")
        .map((value) => parseFloat(value))
        .filter((value) => Number.isFinite(value));

      const boardColumnWidth = columnWidths[0] ?? 0;
      const postMortemColumnWidth = columnWidths[1] ?? 0;
      const hasDesktopTwoColumnLayout =
        window.matchMedia("(min-width: 1024px)").matches &&
        boardColumnWidth > 0 &&
        postMortemColumnWidth > 0;

      const offset = hasDesktopTwoColumnLayout
        ? (postMortemColumnWidth + columnGap) / 2
        : 0;

      grid.style.setProperty("--train-board-center-offset", `${offset}px`);
    }

    syncBoardCenterOffset();

    const observer = new ResizeObserver(syncBoardCenterOffset);
    observer.observe(grid);
    window.addEventListener("resize", syncBoardCenterOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBoardCenterOffset);
    };
  }, []);

  // Use a ref to track whether onboarding intro was ever activated.
  // This avoids the effect re-triggering when trainOnboardingIntroActive flips to false.
  const onboardingIntroWasActiveRef = useRef(false);
  if (shouldRunPreplayOnboarding && !onboardingIntroWasActiveRef.current) {
    onboardingIntroWasActiveRef.current = true;
  }

  useEffect(() => {
    let alive = true;

    async function loadOnboardingState() {
      try {
        const response = await fetch("/api/train/initialize", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load training profile.");
        }
        const payload = (await response.json()) as OnboardingStatePayload;
        if (!alive) return;

        if (payload.preferences) {
          if (
            payload.preferences.skill_level === "new_to_chess" ||
            payload.preferences.skill_level === "beginner" ||
            payload.preferences.skill_level === "intermediate" ||
            payload.preferences.skill_level === "advanced" ||
            payload.preferences.skill_level === "expert"
          ) {
            setSkillLevel(payload.preferences.skill_level);
          }
        }
        if (typeof payload.profile?.blindspots_elo === "number") {
          setBlindspotsElo(payload.profile.blindspots_elo);
        }

        setOnboardingScreen("done");

        // Only seed onboarding intro if it hasn't been shown yet.
        // Do not call loadNextPosition here — onboarding intro CTA handles it.
        if (shouldRunPreplayOnboarding && !trainOnboardingIntroDone) {
          setStartingFen(ONBOARDING_PREVIEW_POSITION.fen);
          setDisplayStartingFen(ONBOARDING_PREVIEW_POSITION.previousFen);
          setFen(ONBOARDING_PREVIEW_POSITION.previousFen);
          setMoves([]);
          setLastMove(null);
          setInitialOpponentMove(null);
          initialOpponentMoveRef.current = null;
          initialPreludeRef.current = {
            previousFen: ONBOARDING_PREVIEW_POSITION.previousFen,
            playedMove: ONBOARDING_PREVIEW_POSITION.playedMove,
          };
          setIsPositionLoading(false);
          setIsAwaitingStartGesture(false);
          setPendingInitialEngineMove(null);
          setHasLoadedPosition(false);
          setActiveSetupReplayIndex(0);
          setTrainOnboardingIntroVisible(true);
        } else if (!shouldRunPreplayOnboarding && !initialMistakeId) {
          void loadNextPosition();
        }
      } catch {
        if (!alive) return;
        setOnboardingScreen("done");
        if (shouldRunPreplayOnboarding && !trainOnboardingIntroDone) {
          setStartingFen(ONBOARDING_PREVIEW_POSITION.fen);
          setDisplayStartingFen(ONBOARDING_PREVIEW_POSITION.previousFen);
          setFen(ONBOARDING_PREVIEW_POSITION.previousFen);
          setMoves([]);
          setLastMove(null);
          setInitialOpponentMove(null);
          initialOpponentMoveRef.current = null;
          initialPreludeRef.current = {
            previousFen: ONBOARDING_PREVIEW_POSITION.previousFen,
            playedMove: ONBOARDING_PREVIEW_POSITION.playedMove,
          };
          setIsPositionLoading(false);
          setIsAwaitingStartGesture(false);
          setPendingInitialEngineMove(null);
          setHasLoadedPosition(false);
          setActiveSetupReplayIndex(0);
          setTrainOnboardingIntroVisible(true);
        } else if (!shouldRunPreplayOnboarding && !initialMistakeId) {
          void loadNextPosition();
        }
      }
    }

    void loadOnboardingState();

    return () => {
      alive = false;
    };
  }, [shouldRunPreplayOnboarding, trainOnboardingIntroDone]);


  const isOnboardingFirstPostmortem =
    shouldRunPreplayOnboarding &&
    hasStartedFirstOnboardingSequenceRef.current &&
    !postmortemOnboardingFinished &&
    isPostMortemVisible;

  useEffect(() => {
    if (!isOnboardingFirstPostmortem) return;
    if (postmortemOnboardingActive) return;

    let cancelled = false;

    async function startWhenFirstTargetExists() {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (cancelled) return;

        const target = document.querySelector('[data-tour="elo-card"]');
        if (target) {
          await waitForTourTargetMotion(target);
          if (cancelled) return;
          if (!cancelled) {
            if (process.env.NODE_ENV !== "production") {
              console.debug("[train-onboarding]", "elo-card found, starting tour");
            }
            setPostmortemOnboardingStep(0);
            setPostmortemOnboardingActive(true);
            setPostmortemAddPositionActionDone(false);
            setPostmortemAddPositionInstructionAcknowledged(false);
            setPostmortemAddPositionCheckpointReached(false);
          }
          return;
        }

        await delayMs(50);
      }

      if (!cancelled) {
        setPostmortemOnboardingStep(0);
        setPostmortemOnboardingActive(true);
        setPostmortemAddPositionInstructionAcknowledged(false);
        setPostmortemAddPositionCheckpointReached(false);
      }
    }

    void startWhenFirstTargetExists();

    return () => {
      cancelled = true;
    };
  }, [
    isOnboardingFirstPostmortem,
    postmortemOnboardingActive,
  ]);

  useEffect(() => {
    if (!postmortemOnboardingActive) return;
    const currentStep = POSTMORTEM_TOUR_STEPS[postmortemOnboardingStep] as PostmortemTourStep | undefined;
    if (!currentStep?.target) return;
    if (currentStep.sidePanel === "memory") {
      setPostmortemSidePanel("memory");
    } else if (currentStep.sidePanel === "analysis") {
      setPostmortemSidePanel("analysis");
    } else if (currentStep.target === "notes-panel") {
      setPostmortemSidePanel("memory");
    } else if (currentStep.target !== "postmortem-actions") {
      setPostmortemSidePanel("analysis");
    }
  }, [postmortemOnboardingActive, postmortemOnboardingStep]);

  async function startPreplayOnboardingPosition() {
    if (hasStartedFirstOnboardingSequenceRef.current) return;
    hasStartedFirstOnboardingSequenceRef.current = true;
    setIsStartingPreplayPosition(true);

    try {
      await unlockTrainAudio();
      await primeTrainAudio();

      // Prepare metadata and board state (not yet visible as prelude).
      initialPreludeRef.current = {
        previousFen: ONBOARDING_PREVIEW_POSITION.previousFen,
        playedMove: ONBOARDING_PREVIEW_POSITION.playedMove,
      };

      const applied = applyIndexedMove(
        ONBOARDING_PREVIEW_POSITION.previousFen,
        ONBOARDING_PREVIEW_POSITION.playedMove,
      );

      if (!applied) {
        throw new Error("Invalid static onboarding prelude: e1g1 did not apply.");
      }

      const initialMove: TrainingMove = {
        san: applied.move.san,
        uci: applied.move.uci,
        side: "white",
        fenBefore: ONBOARDING_PREVIEW_POSITION.previousFen,
        fenAfter: ONBOARDING_PREVIEW_POSITION.fen,
      };

      // Re-affirm metadata for downstream memoised values, but keep the visible
      // board at previousFen (pre-move position). The prelude animation will
      // be applied in Phase 2 after the overlay fades out.
      setStartingFen(ONBOARDING_PREVIEW_POSITION.fen);
      setDisplayStartingFen(ONBOARDING_PREVIEW_POSITION.previousFen);
      setMoves([]);
      setLastMove(null);
      setInitialOpponentMove(null);
      initialOpponentMoveRef.current = null;
      // activeSetupReplayIndex stays at 0 — boardFen remains at previousFen

      // ── Phase 1: Fade out the intro overlay ─────────────────────
      // Start the CSS opacity transition.  Do NOT apply the prelude
      // animation or sound yet — the overlay must finish fading first.
      setTrainOnboardingIntroExiting(true);
      setTrainOnboardingIntroDone(true);

      // Wait for the actual CSS transition/animation on the overlay
      // element subtree to finish — not a brittle fixed timeout.
      await waitForIntroOverlayExit(introOverlayRef.current);

      // ── Phase 2: Overlay is gone — unmount it and start the prelude ──
      setTrainOnboardingIntroVisible(false);

      setState("active");
      setResultMode("results");
      setPositionLoadError(null);
      setIsPositionLoading(false);
      setIsAwaitingStartGesture(false);
      setPendingInitialEngineMove(null);
      setHasLoadedPosition(true);
      setIsOpponentThinking(true);
      setIsCompletingSequence(false);

      // Pause so the user sees the board in previousFen before the prelude animates.
      await delayMs(PREPLAY_PRELUDE_POST_FADE_DELAY_MS);

      // ── Apply the visual prelude move (castling) ────────────────
      setActiveSetupReplayIndex(1);
      setFen(ONBOARDING_PREVIEW_POSITION.fen);

      initialOpponentMoveRef.current = initialMove;
      setInitialOpponentMove(initialMove);
      setLastMove(applied.lastMove);

      playTrainMoveSound({
        move: applied.move,
        plyRef: moveSoundPlyRef,
        source: "initial-engine",
        advanceLivePitch: false,
      });
    } catch (error) {
      console.error("[train-onboarding] failed to start static prelude", error);
      setPositionLoadError("Could not start the onboarding position.");
      hasStartedFirstOnboardingSequenceRef.current = false;
    } finally {
      setIsOpponentThinking(false);
      setIsPositionLoading(false);
      setIsAwaitingStartGesture(false);
      setPendingInitialEngineMove(null);
      setIsStartingPreplayPosition(false);
    }
  }

  useLayoutEffect(() => {
    let alive = true;

    function syncVisualPreferences() {
      if (alive) setVisualPreferences(readVisualPreferences());
    }

    setVisualPreferences(readVisualPreferences());
    if (!hasAnalyzeRuntimeSettings()) {
      void readServerVisualPreferences().then((preferences) => {
        if (alive && preferences) setVisualPreferences(preferences);
      });
    }
    window.addEventListener("storage", syncVisualPreferences);
    const observer = new MutationObserver(syncVisualPreferences);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      alive = false;
      window.removeEventListener("storage", syncVisualPreferences);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    void primeTrainAudio();
    setupTrainAudioUnlockOnGesture();
  }, []);

  // Test hook: exposes board FEN and setup state to QA tests.
  // Exposes state.fen (the core state that drives AnalysisBoard rendering),
  // plus setup overlay state. Does not include PII, auth tokens, queue data.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__blindspotsTrainState = {
      state,
      fen,
      boardFen: fen,
      currentFen: fen,
      startingFen,
      displayStartingFen,
      boardOrientation,
      hasLoadedPosition,
      isPositionLoading,
      isAwaitingStartGesture,
      isStartingPreplayPosition,
      trainOnboardingIntroActive,
      trainOnboardingIntroDone,
      isPostMortemVisible,
      postmortemOnboardingActive,
      postmortemOnboardingStep,
      postmortemOnboardingFinished,
      isOpponentThinking,
      activeSetupReplayIndex,
      pendingInitialEngineMove: pendingInitialEngineMove
        ? {
            previousFen: pendingInitialEngineMove.previousFen,
            playedMove: pendingInitialEngineMove.playedMove,
            fen: pendingInitialEngineMove.fen,
          }
        : null,
    };
  }, [
    state,
    fen,
    hasLoadedPosition,
    isPositionLoading,
    isAwaitingStartGesture,
    trainOnboardingIntroActive,
    trainOnboardingIntroDone,
    isPostMortemVisible,
    postmortemOnboardingActive,
    postmortemOnboardingStep,
    postmortemOnboardingFinished,
    isOpponentThinking,
    activeSetupReplayIndex,
    pendingInitialEngineMove,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "production") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__blindspotsAnalyzeFen = async (fenOverride?: string) => {
      const targetFen = fenOverride ?? fen;

      function logLines(lines: Array<{ rank: number; depth: number; cp: number; mate?: number | null; bestSan: string; pvSan: string[] }>) {
        console.table(
          lines.map((line) => ({
            rank: line.rank,
            depth: line.depth,
            cp: line.cp,
            mate: line.mate ?? null,
            bestSan: line.bestSan,
            pvSan: line.pvSan.join(" "),
          })),
        );
      }

      try {
        const [{ getClientStockfishEngine }, { clientLinesToTrainingEngineLines }] = await Promise.all([
          import("@/lib/stockfish/client-engine"),
          import("@/lib/stockfish/client-lines-to-training-lines"),
        ]);

        const engine = getClientStockfishEngine();
        const result = await engine.analyzeFen({
          fen: targetFen,
          multiPv: CLIENT_STOCKFISH_MULTIPV,
          movetimeMs: CLIENT_STOCKFISH_MOVETIME_MS,
          onUpdate: (lines) => {
            logLines(clientLinesToTrainingEngineLines({ fen: targetFen, lines }));
          },
        });
        const convertedLines = clientLinesToTrainingEngineLines({ fen: targetFen, lines: result.lines });
        logLines(convertedLines);
        return convertedLines;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message !== "Client Stockfish search stopped.") {
          console.error("Client Stockfish smoke test failed.", error);
        }
        return [];
      }
    };
  }, [fen]);

  // Start gesture handler — intercepts the first user interaction to unlock audio
  // and play the pending initial engine move.
  useEffect(() => {
    if (!isAwaitingStartGesture) return;

    function handleGesture(e: MouseEvent | KeyboardEvent) {
      // Ignore keyboard events from editable elements
      const target = e.target as Element;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target.getAttribute("contenteditable") === "true") return;

      // For keyboard events, only respond to meaningful keys (not modifiers alone)
      if (e instanceof KeyboardEvent) {
        if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
      }

      const pending = pendingInitialEngineMove;
      if (!pending) return;

      e.preventDefault();
      e.stopPropagation();

      void startPendingInitialEngineMove(pending);
    }

    window.addEventListener("pointerdown", handleGesture);
    window.addEventListener("keydown", handleGesture);
    return () => {
      window.removeEventListener("pointerdown", handleGesture);
      window.removeEventListener("keydown", handleGesture);
    };
  }, [isAwaitingStartGesture, pendingInitialEngineMove]);

  useEffect(() => {
    if (onboardingScreen !== "analysis") return;

    const startedAt = performance.now();
    setAnalysisElapsedMs(0);
    const timer = window.setInterval(() => {
      setAnalysisElapsedMs(performance.now() - startedAt);
    }, 500);
    return () => window.clearInterval(timer);
  }, [onboardingScreen]);

  function switchState(nextState: TrainingState) {
    completingRef.current = false;
    initialOpponentMoveRef.current = null;
    setInitialOpponentMove(null);
    setActiveSetupReplayIndex(1);
    initialOpponentRequestRef.current += 1;
    moveSoundPlyRef.current = 0;
    setState(nextState);
    setResultMode("results");
    setExploreIndex(0);
    resetExploratoryLine();
    setExploreSelectedSquare(null);
    setSelectedMoveIndex(null);
    setActiveReplayIndex(null);
    setIsManualPostmortemExploration(false);
    setEngineLineCache({});
    completedEngineLineFensRef.current.clear();
    setEngineLineErrorFens(new Set());
    setEngineLineLoadingFen(null);
    setIsOpponentThinking(false);
    setIsCompletingSequence(false);
    setEloResult(null);
    setLastMove(null);
    setDisplayStartingFen(startingFen);
    seededMoveKeysRef.current.clear();
    setMoveAnnotations({});
    setSelectedMoveKey(null);
    setPostmortemSidePanel("analysis");
    if (nextState === "active") {
      setCurrentChallengeElo(null);
      startTrainingGestureConsumedRef.current = true;
      setIsAwaitingStartGesture(false);
      setIsPositionLoading(true);
      void unlockTrainAudio();
      if (process.env.NODE_ENV !== "production") {
        console.log("[train-start-gesture] next-position-click-consumed-gesture");
      }
      void loadNextPosition();
    }
    if (nextState === "complete") {
      return;
    }
    if (nextState === "resolving") {
      return;
    }
    if (nextState === "drift") {
      setFen(startingFen);
      setMoves([...mockRep.moveHistory, { san: "Rb8?", uci: "b4b8", side: "white" }]);
    }
  }

  // Resolve "resolving" state: after a brief dwell, transition to "complete"
  useEffect(() => {
    if (state !== "resolving") return;
    const RESOLUTION_DWELL_MS = 1050;
    const timer = window.setTimeout(() => {
      setState("complete");
    }, RESOLUTION_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const mistakeIdParam = searchParams?.get("positionId") ?? searchParams?.get("mistakeId");
  const modeParam = searchParams?.get("mode"); // "play" | "postmortem"

  // ── Dev-only debug FEN injection ──────────────────────────────────
  const debugFen = searchParams?.get("debugFEN") ?? searchParams?.get("debugFen");
  const debugMode = searchParams?.get("debugMode") ?? "postmortem";
  const debugPreludeMove = searchParams?.get("preludeMove");
  const debugPreviousFen = searchParams?.get("debugPreviousFEN") ?? searchParams?.get("debugPreviousFen");

  function loadDebugFenPosition() {
    if (process.env.NODE_ENV === "production" || !debugFen) return false;

    // Force onboarding to done for debug mode
    if (onboardingScreen !== "done") setOnboardingScreen("done");

    let previousFen: string | null = debugPreviousFen ?? null;
    let finalFen = debugFen;

    // If only debugFEN and preludeMove provided, apply the move to get the final position
    if (!debugPreviousFen && debugPreludeMove) {
      try {
        const chess = new Chess(debugFen);
        const m = chess.move({
          from: debugPreludeMove.slice(0, 2),
          to: debugPreludeMove.slice(2, 4),
          promotion: debugPreludeMove.length > 4 ? (debugPreludeMove[4] as any) : undefined,
        });
        if (m) {
          previousFen = debugFen;
          finalFen = chess.fen();
        }
      } catch { /* invalid move — skip prelude */ }
    }

    setStartingFen(finalFen);
    setDisplayStartingFen(previousFen ?? finalFen);
    setFen(previousFen ?? finalFen);
    setMoves([]);
    setCurrentPositionNotes([]);
    setLastMove(null);
    setInitialOpponentMove(null);
    initialOpponentMoveRef.current = null;
    setActiveSetupReplayIndex(0);
    setState(debugMode === "play" ? "active" : "complete");
    if (debugMode === "postmortem") setResultMode("explore");
    setIsPositionLoading(false);
    setIsAwaitingStartGesture(false);
    setPendingInitialEngineMove(null);
    setHasLoadedPosition(true);
    setIsOpponentThinking(false);

    if (previousFen && debugPreludeMove) {
      initialPreludeRef.current = {
        previousFen,
        playedMove: debugPreludeMove,
      };
    }

    if (debugMode === "postmortem") {
      setTimeout(() => { void fetchEngineLinesForFen(finalFen); }, 100);
    }

    return true;
  }

  // ── Exact-position loading ───────────────────────────────────────

  async function loadSpecificPosition(mistakeId: string, mode: "play" | "postmortem") {
    setIsPositionLoading(true);
    setPositionLoadError(null);
    const res = await fetch(`/api/train/position?positionId=${encodeURIComponent(mistakeId)}`);
    if (!res.ok) {
      setPositionLoadError("That queue position could not be loaded.");
      setIsPositionLoading(false);
      return;
    }
    const payload = await res.json();
    setStartingFen(payload.fen);
    setDisplayStartingFen(payload.previousFen ?? payload.fen);
    setFen(payload.previousFen ?? payload.fen);
    setMoves([]);
    setCurrentPositionNotes(normalizeTrainingNotes(payload.moveNotes));
    setLastMove(null);
    setInitialOpponentMove(null);
    initialOpponentMoveRef.current = null;
    setActiveSetupReplayIndex(0);
    setState(mode === "postmortem" ? "complete" : "active");
    setResultMode(mode === "postmortem" ? "explore" : "results");
    setIsPositionLoading(false);
    setIsAwaitingStartGesture(false);
    setPendingInitialEngineMove(null);
    setHasLoadedPosition(true);
    setIsOpponentThinking(false);

    if (payload.previousFen && payload.playedMove) {
      initialPreludeRef.current = {
        previousFen: payload.previousFen,
        playedMove: payload.playedMove,
      };
      if (mode === "play") {
        void startPendingInitialEngineMove(payload);
      }
    } else {
      initialPreludeRef.current = null;
    }
  }

  useEffect(() => {
    if (!onboardingScreen) return;
    if (onboardingScreen !== "done" && !debugFen) return;
    if (loadDebugFenPosition()) return;
    if (initialMistakeId && !initialMistakeIdConsumedRef.current && !trainOnboardingIntroActive) {
      initialMistakeIdConsumedRef.current = true;
      void loadSpecificPosition(initialMistakeId, initialMode);
    }
  }, [onboardingScreen, initialMistakeId, initialMode, trainOnboardingIntroActive]);

  async function loadNextPosition(options: { autoStart?: boolean; mistakeId?: string } = {}) {
    const cachedPosition = cachedNextPosition;
    if (cachedPosition?.fen) {
      const skipPreludeAnimation =
        Boolean(options.autoStart) && shouldRunPreplayOnboarding;
      setCachedNextPosition(null);
      nextPositionPrefetchRef.current = null;
      applyNextPosition(cachedPosition, {
        autoStart: options.autoStart,
        skipPreludeAnimation,
      });
      setIsPositionLoading(false);
      return;
    }

    const pendingPrefetch = nextPositionPrefetchRef.current;
    if (!pendingPrefetch) {
      setCurrentChallengeElo(null);
      setHasLoadedPosition(false);
      if (!options.autoStart) {
        setIsPositionLoading(true);
      }
    }

    try {
      const payload = options.mistakeId
        ? await fetchNextPosition(options.mistakeId)
        : pendingPrefetch
          ? await pendingPrefetch
          : await fetchNextPosition();
      const skipPreludeAnimation =
        Boolean(options.autoStart) && shouldRunPreplayOnboarding;
      nextPositionPrefetchRef.current = null;
      setCachedNextPosition(null);

      if (!payload?.fen) {
        const errorMessage = payload?.error ?? "No training positions available. Please try again.";
        setPositionLoadError(errorMessage);
        setStartingFen("");
        setDisplayStartingFen("");
        setFen("");
        setHasLoadedPosition(false);
        setMoves([]);
        setAsyncMoveEvaluations({});
        setInitialOpponentMove(null);
        setCurrentChallengeElo(null);
        return;
      }

      applyNextPosition(payload, {
        autoStart: options.autoStart,
        skipPreludeAnimation,
      });
    } finally {
      setIsPositionLoading(false);
    }
  }

  async function fetchNextPosition(mistakeId?: string) {
    const url = mistakeId
      ? `/api/train/next-position?positionId=${encodeURIComponent(mistakeId)}`
      : "/api/train/next-position";
    const response = await fetch(url, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as NextPositionResponse | null;
    if (!response.ok || !payload?.fen) return null;
    return payload;
  }

  function applyNextPosition(
    payload: NextPositionResponse,
    options: { autoStart?: boolean; skipPreludeAnimation?: boolean } = {},
  ) {
    if (!payload.fen) return;

    const shouldAutoStart = options.autoStart || startTrainingGestureConsumedRef.current;

    const debug = (payload as Record<string, unknown>).debug as Record<string, unknown> | undefined;
    selectedServeModeRef.current =
      (payload.selectedServeMode as string | null | undefined) ??
      (debug?.selectedServeMode as string | null | undefined) ??
      (debug?.requestedServeMode as string | null | undefined) ??
      null;

    selectedBucketRef.current =
      (payload.selectedBucket as string | null | undefined) ??
      (debug?.selectedBucket as string | null | undefined) ??
      null;

    selectedPhaseRef.current =
      (payload.selectedPhase as string | null | undefined) ??
      (debug?.selectedPhase as string | null | undefined) ??
      null;

    selectedTagsRef.current =
      Array.isArray(payload.tags)
        ? payload.tags.filter((tag): tag is string => typeof tag === "string")
        : Array.isArray(debug?.tags)
          ? (debug.tags as string[]).filter((tag): tag is string => typeof tag === "string")
          : null;

    selectedIsTacticRef.current =
      typeof payload.isTactic === "boolean"
        ? payload.isTactic
        : typeof debug?.isTactic === "boolean"
          ? (debug.isTactic as boolean)
          : null;

    selectedTacticRatingRef.current =
      typeof payload.tacticRating === "number"
        ? payload.tacticRating
        : typeof debug?.tacticRating === "number"
          ? (debug.tacticRating as number)
          : null;

    selectedOpeningNameRef.current =
      typeof payload.openingName === "string"
        ? payload.openingName
        : typeof debug?.openingName === "string"
          ? (debug.openingName as string)
          : null;

    selectedEcoRef.current =
      typeof payload.eco === "string"
        ? payload.eco
        : typeof debug?.eco === "string"
          ? (debug.eco as string)
          : null;

    currentMistakeIdRef.current =
      typeof payload.mistakeId === "string" ? payload.mistakeId : null;
    currentQueueSourceRef.current =
      typeof payload.queueSource === "string" ? payload.queueSource : null;

    if (Array.isArray(payload.attemptRegistry)) {
      setAttemptRegistry(payload.attemptRegistry as AttemptRegistryEntry[]);
    } else {
      setAttemptRegistry([]);
    }

    completingRef.current = false;
    initialOpponentMoveRef.current = null;
    setInitialOpponentMove(null);
    setActiveSetupReplayIndex(1);
    moveSoundPlyRef.current = 0;
    setPositionLoadError(null);

    const visibleInitialFen = payload.previousFen ?? payload.fen;
    setStartingFen(payload.fen);
    initialPreludeRef.current = (payload.previousFen && payload.playedMove)
      ? { previousFen: payload.previousFen, playedMove: payload.playedMove }
      : null;
    setDisplayStartingFen(visibleInitialFen);
    setFen(visibleInitialFen);
    setHasLoadedPosition(true);
    setMoves([]);
    setCurrentPositionNotes(normalizeTrainingNotes(payload.moveNotes));
    setLastMove(null);
    setResultMode("results");
    setExploreIndex(0);
    resetExploratoryLine();
    setExploreSelectedSquare(null);
    setSelectedMoveIndex(null);
    setActiveReplayIndex(null);
    setIsManualPostmortemExploration(false);
    setEngineLineCache({});
    completedEngineLineFensRef.current.clear();
    setEngineLineErrorFens(new Set());
    setEngineLineLoadingFen(null);
    setPieceLineCache({});
    setPieceLinesLoadingKey(null);
    setCurrentChallengeElo(typeof payload.challengeElo === "number" ? payload.challengeElo : null);

    if (payload.previousFen && payload.playedMove) {
      setPendingInitialEngineMove(payload);

      if (options.skipPreludeAnimation) {
        completeInitialOpponentMove(payload);
      } else if (shouldAutoStart) {
        setIsAwaitingStartGesture(false);
        if (process.env.NODE_ENV !== "production") {
          console.log("[train-start-gesture] apply-next-position-auto-start-prelude", {
            fen: payload.fen,
            previousFen: payload.previousFen,
            playedMove: payload.playedMove,
          });
        }
        void startPendingInitialEngineMove(payload);
      } else {
        if (process.env.NODE_ENV !== "production") {
          console.log("[train-start-gesture] cold-load-awaiting-gesture", {
            fen: payload.fen,
            previousFen: payload.previousFen,
            playedMove: payload.playedMove,
          });
          console.log("[train-start-gesture] hard-refresh-awaiting-gesture", {
            fen: payload.fen,
            previousFen: payload.previousFen,
            playedMove: payload.playedMove,
          });
        }
        setIsAwaitingStartGesture(true);
      }
    } else {
      startTrainingGestureConsumedRef.current = false;
      setPendingInitialEngineMove(null);
      setIsAwaitingStartGesture(false);
    }
  }

  async function startPendingInitialEngineMove(pending: NextPositionResponse) {
    startTrainingGestureConsumedRef.current = false;
    setIsAwaitingStartGesture(false);
    setPendingInitialEngineMove(null);

    void unlockTrainAudio();
    void primeTrainAudio();
    const fallback = window.setTimeout(() => {
      completeInitialOpponentMove(pending);
    }, PRELUDE_SETUP_MOVE_DELAY_MS + 900);

    try {
      await playInitialOpponentMoveFromPayload(pending);
    } finally {
      window.clearTimeout(fallback);
      completeInitialOpponentMove(pending);
    }
  }

  function completeInitialOpponentMove(payload: NextPositionResponse) {
    if (!payload.fen) return;

    const applied = payload.previousFen && payload.playedMove
      ? applyIndexedMove(payload.previousFen, payload.playedMove)
      : null;

    setState("active");
    setHasLoadedPosition(true);
    setIsPositionLoading(false);
    setIsAwaitingStartGesture(false);
    setIsOpponentThinking(false);
    setPendingInitialEngineMove(null);
    setActiveSetupReplayIndex(1);
    setExploreSelectedSquare(null);

    if (applied) {
      initialOpponentMoveRef.current = applied.move;
      setInitialOpponentMove(applied.move);
      setLastMove(applied.lastMove);
    }

    setFen(payload.fen);
  }

  async function playInitialOpponentMoveFromPayload(payload: NextPositionResponse) {
    const requestId = initialOpponentRequestRef.current + 1;
    initialOpponentRequestRef.current = requestId;

    initialOpponentMoveRef.current = null;
    setInitialOpponentMove(null);

    const previousFen = payload.previousFen!;
    const playedMove = payload.playedMove!;

    const applied = applyIndexedMove(previousFen, playedMove);
    if (!applied) {
      if (initialOpponentRequestRef.current === requestId) {
        setIsOpponentThinking(false);
        setIsAwaitingStartGesture(false);
        setPendingInitialEngineMove(null);
      }
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[train-setup-move]", { previousFen, playedMove, fen: payload.fen, san: applied.move.san, uci: applied.move.uci, from: applied.lastMove.from, to: applied.lastMove.to });
    }

    initialOpponentMoveRef.current = applied.move;

    try {
      setIsOpponentThinking(true);

      // Show the "before" position briefly.
      setFen(previousFen);
      await nextAnimationFrame();
      await delayMs(PRELUDE_SETUP_MOVE_DELAY_MS);

      if (initialOpponentRequestRef.current !== requestId) return;

      // Apply the move, sound, and visual transition together — synchronized.
      setState("active");
      setHasLoadedPosition(true);
      setIsPositionLoading(false);
      setActiveSetupReplayIndex(1);
      setInitialOpponentMove(applied.move);
      setExploreSelectedSquare(null);
      setLastMove(applied.lastMove);
      setFen(payload.fen!);
      playTrainMoveSound({ move: applied.move, plyRef: moveSoundPlyRef, source: "initial-engine", advanceLivePitch: false });
    } finally {
      if (initialOpponentRequestRef.current === requestId) {
        setIsOpponentThinking(false);
        setIsAwaitingStartGesture(false);
        setPendingInitialEngineMove(null);
      }
    }
  }

  function prefetchNextPosition() {
    if (nextPositionPrefetchRef.current) return;
    const promise = fetchNextPosition();
    nextPositionPrefetchRef.current = promise;
    void promise.then((payload) => {
      if (payload?.fen && nextPositionPrefetchRef.current === promise) {
        setCachedNextPosition(payload);
      }
    });
  }

  function normalizeEngineLineSnapshot(fenForLines: string, lines: EngineLineResult[]) {
    const isBlackToMove = fenForLines.split(/\s+/)[1] === "b";

    return lines
      .filter((line) => line.bestMove)
      .sort((left, right) => {
        const leftScore = scoreEngineLineForSideToMove(left, isBlackToMove);
        const rightScore = scoreEngineLineForSideToMove(right, isBlackToMove);
        if (leftScore !== rightScore) return rightScore - leftScore;
        return right.depth - left.depth;
      })
      .slice(0, CLIENT_STOCKFISH_MULTIPV)
      .map((line, index) => ({
        ...line,
        rank: index + 1,
      }));
  }

  function replaceAndStoreEngineLinesForFen(fenToAnalyze: string, lines: EngineLineResult[]) {
    const snapshotLines = normalizeEngineLineSnapshot(fenToAnalyze, lines);

    setEngineLineCache((current) => {
      const next = { ...current, [fenToAnalyze]: snapshotLines };
      engineLineCacheRef.current = next;
      return next;
    });
  }

  function mergeAndStoreEngineLinesForFen(fenToAnalyze: string, lines: EngineLineResult[]) {
    const existingTopLines =
      engineLineCacheRef.current[fenToAnalyze] ??
      engineLineCache[fenToAnalyze] ??
      [];
    const deepestTopLines = Array.from(
      buildDeepestEngineLineMap(fenToAnalyze, [existingTopLines, lines]).values(),
    );

    setEngineLineCache((current) => {
      const currentLines = current[fenToAnalyze] ?? [];
      const mergedLines = Array.from(
        buildDeepestEngineLineMap(fenToAnalyze, [currentLines, deepestTopLines]).values(),
      );
      const next = { ...current, [fenToAnalyze]: normalizeEngineLineSnapshot(fenToAnalyze, mergedLines) };
      engineLineCacheRef.current = next;
      return next;
    });
  }

  function markEngineLineErrorFen(fenToAnalyze: string) {
    setEngineLineErrorFens((current) => {
      const next = new Set(current);
      next.add(fenToAnalyze);
      return next;
    });
  }

  function clearEngineLineErrorFen(fenToAnalyze: string) {
    setEngineLineErrorFens((current) => {
      if (!current.has(fenToAnalyze)) return current;
      const next = new Set(current);
      next.delete(fenToAnalyze);
      return next;
    });
  }

  async function fetchServerEngineLinesForFen(fenToAnalyze: string) {
    const response = await fetch("/api/train/engine-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen: fenToAnalyze }),
    });
    const payload = (await response.json().catch(() => null)) as { lines?: EngineLineResult[]; error?: string } | null;
    const lines = response.ok && Array.isArray(payload?.lines) ? payload.lines : [];
    const hadError = typeof payload?.error === "string" || !response.ok;

    mergeAndStoreEngineLinesForFen(fenToAnalyze, lines);

    if (hadError) {
      markEngineLineErrorFen(fenToAnalyze);
    } else {
      completedEngineLineFensRef.current.add(fenToAnalyze);
      clearEngineLineErrorFen(fenToAnalyze);
    }
  }

  async function fetchClientEngineLinesForFen(fenToAnalyze: string) {
    const [{ getClientStockfishEngine }, { clientLinesToTrainingEngineLines }] = await Promise.all([
      import("@/lib/stockfish/client-engine"),
      import("@/lib/stockfish/client-lines-to-training-lines"),
    ]);

    const sideToMove = fenToAnalyze.split(/\s+/)[1] ?? "?";
    const isDev = process.env.NODE_ENV !== "production";

    const engine = getClientStockfishEngine();
    const result = await engine.analyzeFen({
      fen: fenToAnalyze,
      multiPv: CLIENT_STOCKFISH_MULTIPV,
      movetimeMs: CLIENT_STOCKFISH_MOVETIME_MS,
      onUpdate: (lines) => {
        const convertedLines = clientLinesToTrainingEngineLines({ fen: fenToAnalyze, lines });
        if (isDev) {
          console.log("[client-engine-lines:debug]", {
            source: "client-update",
            fen: fenToAnalyze,
            sideToMove,
            rawClientLines: lines.length,
            convertedLines: convertedLines.length,
            best: convertedLines[0] ? { san: convertedLines[0].bestSan, cp: convertedLines[0].cp, mate: convertedLines[0].mate, rank: convertedLines[0].rank, depth: convertedLines[0].depth } : null,
          });
        }
      },
    });

    const convertedLines = clientLinesToTrainingEngineLines({ fen: fenToAnalyze, lines: result.lines });
    if (convertedLines.length === 0) {
      throw new Error("Client Stockfish returned no coherent engine lines.");
    }
    replaceAndStoreEngineLinesForFen(fenToAnalyze, convertedLines);
    completedEngineLineFensRef.current.add(fenToAnalyze);
    clearEngineLineErrorFen(fenToAnalyze);
    if (isDev) {
      console.log("[client-engine-lines:debug]", {
        source: "client-final",
        fen: fenToAnalyze,
        sideToMove,
        rawClientLines: result.lines.length,
        convertedLines: convertedLines.length,
        best: convertedLines[0] ? { san: convertedLines[0].bestSan, cp: convertedLines[0].cp, mate: convertedLines[0].mate, rank: convertedLines[0].rank, depth: convertedLines[0].depth } : null,
        completed: completedEngineLineFensRef.current.has(fenToAnalyze),
      });
    }
  }

  async function fetchEngineLinesForFen(fenToAnalyze: string) {
    const cached = engineLineCacheRef.current[fenToAnalyze];
    const hasCompletedClientLines = completedEngineLineFensRef.current.has(fenToAnalyze);
    if (cached && (!ENABLE_CLIENT_STOCKFISH_LINES || hasCompletedClientLines)) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[client-engine-lines:debug]", {
          source: "cache-hit",
          fen: fenToAnalyze,
          cachedLines: cached.length,
          completed: hasCompletedClientLines,
        });
      }
      return;
    }
    const pending = engineLinePrefetchRef.current.get(fenToAnalyze);
    if (pending) return pending;

    const promise = (async () => {
      if (ENABLE_CLIENT_STOCKFISH_LINES) {
        try {
          await fetchClientEngineLinesForFen(fenToAnalyze);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message === "Client Stockfish search stopped.") {
            if (process.env.NODE_ENV !== "production") {
              console.log("[client-engine-lines:debug]", {
                source: "cancel",
                fen: fenToAnalyze,
              });
            }
            return;
          }
          console.warn("[client-engine-lines] falling back to server:", message);
        }
      }

      await fetchServerEngineLinesForFen(fenToAnalyze);
    })().catch(() => {
      mergeAndStoreEngineLinesForFen(fenToAnalyze, []);
      markEngineLineErrorFen(fenToAnalyze);
    }).finally(() => {
      engineLinePrefetchRef.current.delete(fenToAnalyze);
    });

    engineLinePrefetchRef.current.set(fenToAnalyze, promise);
    return promise;
  }

  async function fetchPieceLinesForSquare(fen: string, square: string) {
    const key = trainPieceLineCacheKey(fen, square);
    if (pieceLineCacheRef.current[key]) return;

    const response = await fetch("/api/train/piece-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, square }),
    });
    const payload = (await response.json().catch(() => null)) as { lines?: EngineLineResult[]; error?: string } | null;
    const fetchedPieceLines = response.ok && Array.isArray(payload?.lines) ? payload.lines : [];
    if (typeof payload?.error === "string" || !response.ok) {
      console.warn(`[piece-lines] fetch failed for ${fen}@${square}:`, payload?.error ?? "unknown error");
    }
    const knownTopLines =
      engineLineCacheRef.current[fen] ??
      engineLineCache[fen] ??
      [];
    const existingPieceLines =
      pieceLineCacheRef.current[key] ??
      pieceLineCache[key] ??
      [];
    const mergedPieceLines = mergePieceLinesWithDeeperKnownLines({
      fen,
      square,
      pieceLines: fetchedPieceLines,
      knownLineLists: [knownTopLines, existingPieceLines],
    });
    setPieceLineCache((current) => {
      if (current[key]) return current;
      const next = { ...current, [key]: mergedPieceLines };
      pieceLineCacheRef.current = next;
      return next;
    });
  }

  function warmEngineLinesForSequence(nextMoves: TrainingMove[]) {
    if (!startingFen) return;
    const fens = collectKeyAnalysisFens(startingFen, nextMoves)
      .filter((fenToAnalyze) => !engineLineCacheRef.current[fenToAnalyze]);
    if (fens.length === 0) return;

    void (async () => {
      const concurrency = ENABLE_CLIENT_STOCKFISH_LINES ? 1 : 2;
      for (let index = 0; index < fens.length; index += concurrency) {
        await Promise.all(fens.slice(index, index + concurrency).map((fenToAnalyze) => fetchEngineLinesForFen(fenToAnalyze)));
      }
    })();
  }

  function resetExploratoryLine() {
    setExploratoryFen(null);
    setExploratoryLastMove(null);
    setExploratoryHistory([]);
    setExploratoryHistoryIndex(-1);
    setIsManualPostmortemExploration(false);
  }

  function handleMove(move: BoardMove) {
    if (state !== "active" || isOpponentThinking || completingRef.current) return;
    if (isViewingPreludeReplay) return;
    if (isViewingActiveReplay) return;

    setActiveReplayIndex(null);

    try {
      const chess = new Chess(boardFen);
      const playedMove = chess.move({ from: move.from, to: move.to, promotion: "q" });
      if (!playedMove) return;

      const fenAfterUserMove = chess.fen();
      const userMoveCountAfterMove = Math.floor(moves.length / 2) + 1;
      const userTrainingMove: TrainingMove = {
        san: playedMove.san,
        uci: `${playedMove.from}${playedMove.to}${playedMove.promotion ?? ""}`,
        side: playedMove.color === "w" ? "white" : "black",
        fenBefore: boardFen!,
        fenAfter: fenAfterUserMove,
      };
      const movesAfterUserMove = [...moves, userTrainingMove];

      playTrainMoveSound({ move: playedMove, plyRef: moveSoundPlyRef });
      setExploreSelectedSquare(null);
      setFen(fenAfterUserMove);
      setLastMove({ from: move.from, to: move.to });
      setMoves(movesAfterUserMove);
      warmEngineLinesForSequence(movesAfterUserMove);

      const isFinalUserMoveInSequence = userMoveCountAfterMove >= sequenceLength;

      void evaluateUserMoveAsync({
        userMoveIndex: userMoveCountAfterMove - 1,
        decisionFen: boardFen!,
        uci: userTrainingMove.uci,
        san: userTrainingMove.san,
        timeLimitMs: isFinalUserMoveInSequence ? 500 : 1000,
      });

      if (chess.isGameOver()) {
        completingRef.current = true;
        setState("resolving");
        void completeSequence(movesAfterUserMove);
        return;
      }

      if (userMoveCountAfterMove >= sequenceLength) {
        completingRef.current = true;
        setState("resolving");
        void completeSequence(movesAfterUserMove);
        return;
      }

      void requestOpponentMove(fenAfterUserMove, movesAfterUserMove);
    } catch {
      // The board only emits legal moves, but keep the page resilient to stale FEN.
    }
  }

  function handleExploreMove(move: BoardMove) {
    if (!isExploringResults) return;

    setIsManualPostmortemExploration(true);
    setSelectedMoveIndex(null);
    setHoveredMoveSquares(null);
    setHoveredEngineLineIndex(null);
    setActiveReplayIndex(null);

    try {
      const chess = new Chess(boardFen);
      const playedMove = chess.move({ from: move.from, to: move.to, promotion: "q" });
      if (!playedMove) return;

      playTrainMoveSound({ move: playedMove, plyRef: moveSoundPlyRef });
      const currentFen = boardFen;
      const playedUci = `${playedMove.from}${playedMove.to}${playedMove.promotion ?? ""}`;
      const classification = classificationForPlayedMove(
        { uci: playedUci },
        classifiedDisplayLines,
      );
      const nextExploratoryPosition: ExploratoryPosition = {
        fen: chess.fen(),
        lastMove: { from: playedMove.from, to: playedMove.to },
        move: {
          san: playedMove.san,
          uci: playedUci,
          side: (playedMove.color === "w" ? "white" : "black") as "white" | "black",
          fenBefore: currentFen,
          fenAfter: chess.fen(),
          classification,
        },
      };
      const nextHistory = [
        ...exploratoryHistory.slice(0, exploratoryHistoryIndex + 1),
        nextExploratoryPosition,
      ];
      setExploratoryHistory(nextHistory);
      setExploratoryHistoryIndex(nextHistory.length - 1);
      setExploratoryFen(nextExploratoryPosition.fen);
      setExploratoryLastMove(nextExploratoryPosition.lastMove);
      setHoveredEngineLineIndex(null);
      setHoveredMoveSquares(null);
      setExploreSelectedSquare(null);
      void fetchEngineLinesForFen(nextExploratoryPosition.fen);
    } catch {
      // The board only emits legal moves, but ignore stale exploratory FENs.
    }
  }

  async function requestOpponentMove(
    fenAfterUserMove: string,
    movesAfterUserMove: TrainingMove[],
  ) {
    setIsOpponentThinking(true);

    try {
      const response = await fetch("/api/train/opponent-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: fenAfterUserMove,
          userBlindspotElo: blindspotsElo,
          challengeElo: currentChallengeElo,
        }),
      });
      const payload = (await response.json().catch(() => null)) as OpponentMoveResponse | null;
      const opponentMove = payload?.move;
      if (!response.ok || !opponentMove) return;

      const chess = new Chess(fenAfterUserMove);
      const playedMove = chess.move({
        from: opponentMove.uci.slice(0, 2),
        to: opponentMove.uci.slice(2, 4),
        promotion: opponentMove.uci[4],
      });
      if (!playedMove) return;

      playTrainMoveSound({ move: playedMove, plyRef: moveSoundPlyRef });
      setFen(chess.fen());
      setLastMove({ from: playedMove.from, to: playedMove.to });
      const finalMoves = [
        ...movesAfterUserMove,
        {
          san: opponentMove.san || playedMove.san,
          uci: `${playedMove.from}${playedMove.to}${playedMove.promotion ?? ""}`,
          side: playedMove.color === "w" ? "white" : "black",
          fenBefore: fenAfterUserMove,
          fenAfter: chess.fen(),
        } satisfies TrainingMove,
      ];
      setMoves(finalMoves);
      warmEngineLinesForSequence(finalMoves);

      if (chess.isGameOver()) {
        setState("resolving");
        void completeSequence(finalMoves);
      }
    } finally {
      setIsOpponentThinking(false);
    }
  }

  async function evaluateUserMoveAsync(input: {
    userMoveIndex: number;
    decisionFen: string;
    uci: string;
    san: string;
    timeLimitMs?: number;
  }) {
    setAsyncMoveEvaluations((current) => ({
      ...current,
      [input.userMoveIndex]: { status: "pending" },
    }));

    try {
      const response = await fetch("/api/train/evaluate-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionFen: input.decisionFen,
          uci: input.uci,
          san: input.san,
          selectedBucket: selectedBucketRef.current,
          selectedPhase: selectedPhaseRef.current,
          selectedTags: selectedTagsRef.current,
          timeLimitMs: input.timeLimitMs,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.moveScore) {
        throw new Error(payload?.error ?? "Move evaluation failed");
      }

      setAsyncMoveEvaluations((current) => ({
        ...current,
        [input.userMoveIndex]: {
          status: "done",
          moveScore: {
            ...payload.moveScore,
            userMoveIndex: input.userMoveIndex,
          },
          positionEvaluation: {
            ...payload.positionEvaluation,
            index: input.userMoveIndex,
          },
        },
      }));

      // Also merge into the moves array immediately so the graph/table updates without waiting for complete-sequence
      setMoves((current) =>
        current.map((m, i) => {
          if (m.side !== userMoveSide) return m;
          const moveIdx = current.filter((x) => x.side === userMoveSide).indexOf(m);
          if (moveIdx !== input.userMoveIndex) return m;
          return {
            ...m,
            cpLoss: payload.moveScore.cpLoss,
            evalBefore: payload.moveScore.evalBefore,
            evalAfter: payload.moveScore.evalAfter,
            classification: payload.moveScore.classification,
          };
        }),
      );
    } catch {
      setAsyncMoveEvaluations((current) => ({
        ...current,
        [input.userMoveIndex]: { status: "error" },
      }));
    }
  }

  async function completeSequence(finalMoves: TrainingMove[]) {
    const requestId = completionRequestRef.current + 1;
    completionRequestRef.current = requestId;
    setIsCompletingSequence(true);

    try {
      const expectedPrecomputedCount = countUserMovesForCompletion(startingFen, finalMoves);
      const completedEvaluations = await waitForCompletedMoveEvaluations({
        getEvaluations: () => asyncMoveEvaluationsRef.current,
        expectedCount: expectedPrecomputedCount,
        timeoutMs: COMPLETION_EVAL_GRACE_MS,
      });

      if (process.env.NODE_ENV !== "production") {
        console.log("[complete-sequence:client-precomputed]", {
          expectedPrecomputedCount,
          sentPrecomputedCount: completedEvaluations.length,
        });
      }

      const response = await fetch("/api/train/complete-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startingFen,
          moves: finalMoves,
          sequenceLength,
          selectedServeMode: selectedServeModeRef.current,
          selectedBucket: selectedBucketRef.current,
          selectedPhase: selectedPhaseRef.current,
          selectedTags: selectedTagsRef.current,
          selectedIsTactic: selectedIsTacticRef.current,
          selectedTacticRating: selectedTacticRatingRef.current,
          selectedOpeningName: selectedOpeningNameRef.current,
          selectedEco: selectedEcoRef.current,
          selectedMistakeId: currentMistakeIdRef.current,
          queueSource: currentQueueSourceRef.current,
          challengeElo: currentChallengeElo,
          previousFen: initialPreludeRef.current?.previousFen ?? null,
          playedMove: initialPreludeRef.current?.playedMove ?? null,
          precomputedEvaluations: completedEvaluations,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { elo?: EloResult; moveScores?: MoveScore[] }
        | null;
      if (completionRequestRef.current !== requestId || !response.ok || !payload?.elo) return;

      setEloResult(payload.elo);
      setBlindspotsElo(payload.elo.eloAfter);
      if (Array.isArray(payload.moveScores)) {
        setMoves((current) => applyMoveScores(current, payload.moveScores ?? [], startingFen));
      }
      prefetchNextPosition();
    } finally {
      if (completionRequestRef.current === requestId) {
        setIsCompletingSequence(false);
      }
    }
  }

  async function connectProfile(provider: ProfileProvider) {
    const username = profileUsername.trim();
    if (!username) {
      setSelectedProvider(provider);
      setConnectionMessage("We need the public username, not the nickname you use in your head.");
      return;
    }

    setIsConnectingProfile(true);
    setConnectionMessage("");

    try {
      const formData = new FormData();
      formData.set("next", "/train");
      formData.set("provider", provider);
      formData.set("username", username);

      const response = await fetch("/auth/profile/link", {
        method: "POST",
        headers: {
          "x-chessview-fetch": "1",
        },
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setConnectionMessage(resolveProfileConnectionError(payload?.error));
        return;
      }

      beginAnalysis();
    } finally {
      setIsConnectingProfile(false);
    }
  }

  async function skipConnection() {
    setBlindspotsElo(SKILL_LEVEL_STARTING_ELO[skillLevel]);
    await startFirstSession({
      persistOnboarding: async () => {
        await fetch("/api/train/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "skip", skillLevel }),
        });
      },
    });
  }

  function beginAnalysis() {
    setAnalysisStep(0);
    setAnalysisError("");
    setAnalysisElapsedMs(0);
    setInitializationSummary(null);
    setOnboardingScreen("analysis");

    window.setTimeout(() => setAnalysisStep((current) => Math.max(current, 1)), 450);
    void runAnalysis();
  }

  async function runAnalysis() {
    const startedAt = performance.now();
    const response = await fetch("/api/train/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "analyze", skillLevel }),
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          status?: string;
          summary?: InitializationSummary;
        }
      | null;

    if (payload?.status === "complete" && payload.summary) {
      await waitForMinimumElapsed(startedAt, MIN_ONBOARDING_EVALUATION_MS);
      setAnalysisStep(2);
      await sleep(ONBOARDING_BUILD_PROFILE_MS);
      setAnalysisStep(3);
      setInitializationSummary(payload.summary);
      window.setTimeout(() => setOnboardingScreen("summary"), 450);
      return;
    }

    if (payload?.status === "no_games") {
      await waitForMinimumElapsed(startedAt, 1200);
      setAnalysisStep(3);
      window.setTimeout(() => {
        void startFirstSession();
      }, 450);
      return;
    }

    await waitForMinimumElapsed(startedAt, MIN_ONBOARDING_EVALUATION_MS);
    setAnalysisStep(2);
    await sleep(ONBOARDING_BUILD_PROFILE_MS);
    setAnalysisError(ANALYSIS_FAILURE_MESSAGE);
    window.setTimeout(() => {
      void startFirstSession();
    }, 3000);
  }

  async function refreshProfileAfterOnboardingStart() {
    try {
      const initResponse = await fetch("/api/train/initialize", { cache: "no-store" });
      const initPayload = await initResponse.json().catch(() => null);
      if (typeof initPayload?.profile?.blindspots_elo === "number") {
        setBlindspotsElo(initPayload.profile.blindspots_elo);
      }
      if (initPayload?.preferences?.skill_level) {
        setSkillLevel(initPayload.preferences.skill_level);
      }
    } catch {
      // Non-critical — keep existing Elo state on refresh failure.
    }
  }

  async function startFirstSession(options: { persistOnboarding?: () => Promise<void> } = {}) {
    if (isStartingTraining) return;
    startTrainingGestureConsumedRef.current = true;
    void unlockTrainAudio();
    setIsStartingTraining(true);

    try {
      setIsSavingSettings(true);
      await runStartTrainingTransition({
        enterTrainingSurface() {
          setOnboardingScreen("done");
        },
        persistOnboarding: options.persistOnboarding,
        async saveSettings() {
          await fetch("/api/train/initialize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save_settings",
              sequenceLength: 4,
              timePressureMode: "none",
              openingFilter: [],
              skillLevel,
            }),
          });
        },
        loadPosition: loadNextPosition,
      });
      void refreshProfileAfterOnboardingStart();
    } finally {
      setIsSavingSettings(false);
      setIsStartingTraining(false);
    }
  }

  function completeTrainingOnboarding() {
    if (onboardingCompletionInFlight) return;
    // Show preferences modal after spotlights instead of completing immediately
    setShowOnboardingPreferencesModal(true);
    setPostmortemOnboardingFinished(true);
    setPostmortemOnboardingActive(false);
  }

  async function finishOnboardingWithPreferences() {
    setIsSavingOnboardingPreferences(true);
    const dailyTarget = DAILY_TARGET_OPTIONS.find((o) => o.level === selectedDailyTargetLevel) ?? DAILY_TARGET_OPTIONS[1];

    try {
      await fetch("/api/train/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyTargetLevel: dailyTarget.level,
          dailyTargetPositions: dailyTarget.positions,
        }),
      });
    } catch { /* continue even if prefs save fails */ }

    setShowOnboardingPreferencesModal(false);
    setIsSavingOnboardingPreferences(false);

    // Now actually complete onboarding
    if (onboardingCompletionInFlight) return;
    setOnboardingCompletionInFlight(true);
    fetch("/api/onboarding/complete", { method: "POST", headers: { "Content-Type": "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`Onboarding completion failed with ${response.status}`);
      })
      .catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[train-postmortem-tour] completion failed", error);
        }
      })
      .finally(() => {
        setOnboardingCompletionInFlight(false);
      });
  }

  const handlePostmortemTourBack = useCallback(() => {
    const notesBridgeStepIndex = POSTMORTEM_TOUR_STEPS.findIndex(
      (step) => step.headline === "Notes" && step.centerCard === true
    );
    setPostmortemAddPositionInstructionAcknowledged(false);
    setPostmortemOnboardingStep((current) => {
      if (postmortemAddPositionCheckpointReached && notesBridgeStepIndex >= 0) {
        return Math.max(notesBridgeStepIndex, current - 1);
      }
      return Math.max(0, current - 1);
    });
  }, [postmortemAddPositionCheckpointReached]);

  const handlePostmortemTourNext = useCallback(() => {
    const currentStep = POSTMORTEM_TOUR_STEPS[postmortemOnboardingStep] as PostmortemTourStep | undefined;
    if (currentStep?.requiresAction === "add-position-to-learning-queue") {
      if (!postmortemAddPositionInstructionAcknowledged) {
        setPostmortemAddPositionInstructionAcknowledged(true);
        return;
      }
      if (!postmortemAddPositionActionDone) {
        return;
      }
    }

    // Bridge step → Notes: fade card first, switch panel, then advance
    if (currentStep?.centerCard && currentStep?.sidePanel === "analysis") {
      const nextStep = POSTMORTEM_TOUR_STEPS[postmortemOnboardingStep + 1];
      if (nextStep?.target === "notes-panel") {
        setPostmortemTourSoftSwitching(true);
        setTimeout(() => {
          setPostmortemOnboardingStep((current) => {
            if (current < POSTMORTEM_TOUR_STEPS.length - 1) {
              return current + 1;
            }
            void completeTrainingOnboarding();
            return current;
          });
          setPostmortemTourSoftSwitching(false);
        }, 180);
        return;
      }
    }

    setPostmortemOnboardingStep((current) => {
      if (current < POSTMORTEM_TOUR_STEPS.length - 1) {
        return current + 1;
      }
      void completeTrainingOnboarding();
      return current;
    });
  }, [postmortemOnboardingStep, postmortemAddPositionInstructionAcknowledged, postmortemAddPositionActionDone, onboardingCompletionInFlight]);

  const handlePostmortemTourSkip = useCallback(() => {
    void completeTrainingOnboarding();
  }, [onboardingCompletionInFlight]);

  const handleMissingPostmortemTourTarget = useCallback(() => {
    setPostmortemOnboardingStep((current) => {
      if (current < POSTMORTEM_TOUR_STEPS.length - 1) {
        return current + 1;
      }
      void completeTrainingOnboarding();
      return current;
    });
  }, [onboardingCompletionInFlight]);

  const rating = state === "complete" ? (eloResult?.eloAfter ?? blindspotsElo) : blindspotsElo;
  const userMoveSide = getFenTurnSide(startingFen);
  const isStaticOnboardingPosition =
    shouldRunPreplayOnboarding &&
    hasStartedFirstOnboardingSequenceRef.current &&
    !postmortemOnboardingFinished;
  const boardOrientation = isStaticOnboardingPosition ? "black" : userMoveSide;
  const userMoveCount = moves.filter((move) => move.side === userMoveSide).length;
  const moveProgress = Math.min(userMoveCount + 1, sequenceLength);
  const displayMoves = useMemo(
    () => initialOpponentMove ? [initialOpponentMove, ...moves] : moves,
    [initialOpponentMove, moves],
  );
  const completedMoveScoreByUserMoveIndex = useMemo(() => {
    const map = new Map<number, MoveScore>();
    for (const key of Object.keys(asyncMoveEvaluations)) {
      const eval_ = asyncMoveEvaluations[Number(key)];
      if (eval_?.status === "done" && eval_.moveScore) {
        map.set(eval_.moveScore.userMoveIndex, eval_.moveScore);
      }
    }
    return map;
  }, [asyncMoveEvaluations]);

  const visibleSequencePositions = useMemo(
    () => startingFen
      ? buildVisibleSequencePositions({
          startingFen,
          moves,
          initialOpponentMove,
          preludeBeforeFen: initialPreludeRef.current?.previousFen ?? null,
        }).map((position) => {
          if (position.userMoveIndex != null) {
            const moveScore = completedMoveScoreByUserMoveIndex.get(position.userMoveIndex);
            return {
              ...position,
              move: position.move
                ? mergeMoveWithAuthoritativeScore({ move: position.move, moveScore })
                : position.move,
            };
          }
          return position;
        })
      : [],
    [startingFen, moves, initialOpponentMove, completedMoveScoreByUserMoveIndex],
  );

  const completedMoveScores = useMemo(
    () => Array.from(completedMoveScoreByUserMoveIndex.values()),
    [completedMoveScoreByUserMoveIndex],
  );
  const canonicalPostmortemMoves = useMemo(
    () => buildCanonicalPostmortemMoves({
      positions: visibleSequencePositions.map((position) => ({
        ...position,
        kind: position.userMoveIndex != null
          ? "user"
          : position.move
            ? "engine"
            : "setup",
      })),
      moveScores: completedMoveScores,
      userMoveIndexByPositionIndex: new Map(
        visibleSequencePositions.flatMap((position) =>
          position.userMoveIndex != null ? [[position.index, position.userMoveIndex] as const] : [],
        ),
      ),
    }),
    [completedMoveScores, visibleSequencePositions],
  );

  const activeReplayLastIndex = Math.max(0, visibleSequencePositions.length - 1);
  const effectiveActiveReplayIndex =
    state === "active" && activeReplayIndex !== null
      ? Math.min(activeReplayIndex, activeReplayLastIndex)
      : null;
  const activeReplayPosition =
    effectiveActiveReplayIndex !== null
      ? visibleSequencePositions[effectiveActiveReplayIndex] ?? null
      : null;
  const isViewingActiveReplay =
    state === "active" &&
    activeReplayPosition !== null &&
    effectiveActiveReplayIndex !== null &&
    effectiveActiveReplayIndex < activeReplayLastIndex;

  // Dev-only timeline instrumentation — placed after displayMoves/visibleSequencePositions are declared
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !(window as unknown as Record<string, unknown>).__BLINDSPOTS_QA__) return;
    (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline = {
      get startingFen() { return startingFen; },
      get displayStartingFen() { return displayStartingFen; },
      get moves() { return moves; },
      get initialOpponentMove() { return initialOpponentMove; },
      get displayMoves() { return displayMoves; },
      get visibleSequencePositions() { return visibleSequencePositions; },
      get isActiveSetupReplay() { return isActiveSetupReplay; },
      get activeSetupReplayIndex() { return activeSetupReplayIndex; },
      get setupBeforeFen() { return activeSetupBeforeFen; },
      get setupAfterFen() { return activeSetupAfterFen; },
      get activeSetupCurrentFen() { return activeSetupCurrentFen; },
    };
  }, [startingFen, displayStartingFen, moves, initialOpponentMove, displayMoves, visibleSequencePositions]);

  const activeExploreIndex = Math.min(exploreIndex, Math.max(0, visibleSequencePositions.length - 1));
  const activeSequencePosition = visibleSequencePositions[activeExploreIndex] ?? visibleSequencePositions[0];
  const activeCanonicalMove = canonicalPostmortemMoves.find((move) => move.positionIndex === activeExploreIndex) ?? null;

  // ── Move annotations: seed from session evaluations ──────────────
  // Build a flat map of moveKey → AnnotatedMove from session data.
  // Seeds all user moves once per moveKey; user edits (noteText) are preserved.
  useEffect(() => {
    if (!isPostMortemVisible) return;

    const sessionAnnotations: Record<string, AnnotatedMove> = {};

    for (const pos of visibleSequencePositions) {
      if (pos.userMoveIndex == null || !pos.move?.fenBefore) continue;

      const moveKey = buildMoveKey(pos.move.fenBefore, pos.move.uci);
      if (seededMoveKeysRef.current.has(moveKey)) continue;

      const classification = getAuthoritativeMoveClassification({
        move: pos.move,
        moveScore: completedMoveScoreByUserMoveIndex.get(pos.userMoveIndex),
      });

      // Merge with any earlier entry in this batch, then with existing state
      const batchEntry = sessionAnnotations[moveKey];
      const existingStateEntry = moveAnnotations[moveKey];
      const merged = batchEntry ?? existingStateEntry;
      const now = new Date().toISOString();

      sessionAnnotations[moveKey] = merged
        ? {
            ...merged,
            san: pos.move.san ?? merged.san,
            classification: classification ?? merged.classification,
            cpLoss: pos.move.cpLoss ?? merged.cpLoss,
            evalBefore: pos.move.evalBefore ?? merged.evalBefore,
            evalAfter: pos.move.evalAfter ?? merged.evalAfter,
            mateBefore: pos.move.mateBefore ?? merged.mateBefore,
            mateAfter: pos.move.mateAfter ?? merged.mateAfter,
            attemptCount: merged.attemptCount + 1,
            lastAttemptedAt: now,
          }
        : {
            moveKey,
            decisionFen: normalizeDecisionFen(pos.move.fenBefore),
            uci: pos.move.uci,
            san: pos.move.san,
            classification,
            cpLoss: pos.move.cpLoss,
            evalBefore: pos.move.evalBefore ?? null,
            evalAfter: pos.move.evalAfter ?? null,
            mateBefore: pos.move.mateBefore ?? null,
            mateAfter: pos.move.mateAfter ?? null,
            attemptCount: 1,
            firstAttemptedAt: now,
            lastAttemptedAt: now,
            noteText: "",
          };

      seededMoveKeysRef.current.add(moveKey);
    }

    if (Object.keys(sessionAnnotations).length > 0) {
      setMoveAnnotations((prev) => ({ ...prev, ...sessionAnnotations }));
    }
  }, [isPostMortemVisible, visibleSequencePositions, completedMoveScoreByUserMoveIndex]);

  // ── Move notes: derive annotatable user moves ─────────────────────
  // Show all user moves from the canonical postmortem moves table.
  const annotatableMoves = useMemo(() => {
    if (!isPostMortemVisible) return [];
    return canonicalPostmortemMoves
      .filter((cm) => cm.kind === "user" && cm.uci && cm.move?.fenBefore)
      .map((cm) => ({
        moveKey: buildMoveKey(cm.move!.fenBefore!, cm.uci!),
        san: cm.san ?? "",
        uci: cm.uci!,
        from: cm.from,
        to: cm.to,
        classification: cm.classification,
        cpLoss: cm.cpLoss as number | undefined,
        mateAfter: cm.mateAfter as number | null | undefined,
      }));
  }, [isPostMortemVisible, canonicalPostmortemMoves]);

  // Dev-only: log annotation state
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (annotatableMoves.length > 0) {
      console.log("[move-notes] annotatable-moves", annotatableMoves.length);
    }
  }, [annotatableMoves]);

  function handleSelectMove(moveKey: string) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[move-notes] select-move", moveKey);
    }
    setSelectedMoveKey(moveKey);
    // Sync board and analysis table to the same move.
    const canonicalMove = canonicalPostmortemMoves.find((cm) => {
      if (!cm.move?.fenBefore || !cm.uci) return false;
      return buildMoveKey(cm.move.fenBefore, cm.uci) === moveKey;
    });
    if (canonicalMove && canonicalMove.positionIndex != null) {
      navigateExploreTo(canonicalMove.positionIndex);
    }
  }

  function handleUpdateNote(moveKey: string, text: string) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[move-notes] update-note", moveKey);
    }
    setSavedMoveNoteKey((current) => (current === moveKey ? null : current));
    setMoveAnnotations((prev) => updateNoteText(prev, moveKey, text));
    dirtyMoveNoteKeysRef.current.add(moveKey);
  }

  // ── Sync selectedMoveIndex -> selectedMoveKey for notes panel ────
  useEffect(() => {
    if (selectedMoveIndex == null || !isPostMortemVisible) return;
    const canonicalMove = canonicalPostmortemMoves.find(
      (m) => m.positionIndex === selectedMoveIndex,
    );
    if (!canonicalMove?.move?.fenBefore || !canonicalMove.uci) return;
    const key = buildMoveKey(canonicalMove.move.fenBefore, canonicalMove.uci);
    setSelectedMoveKey((current) => (current === key ? current : key));
  }, [selectedMoveIndex, canonicalPostmortemMoves, isPostMortemVisible]);

  // ── Persist notes to Supabase with debounce ──────────────────────
  const dirtyMoveNoteKeysRef = useRef<Set<string>>(new Set());
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref mirror so the setTimeout callback always reads the latest annotations.
  const moveAnnotationsRef = useRef(moveAnnotations);
  moveAnnotationsRef.current = moveAnnotations;

  function retryLater() {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => syncDirtyMoveNoteKeys("retry"), 2000);
  }

  function syncDirtyMoveNoteKeys(reason: "debounce" | "flush" | "retry") {
    const dirty = dirtyMoveNoteKeysRef.current;
    if (dirty.size === 0) return;
    const snapshot = moveAnnotationsRef.current;
    for (const key of dirty) {
      const entry = snapshot[key];
      if (!entry) { dirty.delete(key); continue; }
      const sentNoteText = entry.noteText;
      fetch("/api/train/move-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moveKey: entry.moveKey,
          decisionFen: entry.decisionFen,
          moveUci: entry.uci,
          moveSan: entry.san ?? null,
          noteText: entry.noteText,
          classification: entry.classification ?? null,
          cpLoss: entry.cpLoss ?? null,
          evalBeforeCp: entry.evalBefore ?? null,
          evalAfterCp: entry.evalAfter ?? null,
          mateBefore: entry.mateBefore ?? null,
          mateAfter: entry.mateAfter ?? null,
          attemptCount: entry.attemptCount,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`move-notes sync failed: ${res.status}`);
          }
          const body = (await res.json().catch(() => null)) as {
            moveSan?: string | null;
            classification?: string | null;
            evalBeforeCp?: number | null;
            evalAfterCp?: number | null;
          } | null;
          if (body) {
            setMoveAnnotations((prev) => {
              const current = prev[key];
              if (!current) return prev;
              return {
                ...prev,
                [key]: {
                  ...current,
                  san: body.moveSan ?? current.san,
                  classification: body.classification ?? current.classification,
                  evalBefore: body.evalBeforeCp ?? current.evalBefore,
                  evalAfter: body.evalAfterCp ?? current.evalAfter,
                },
              };
            });
          }
          const currentText = moveAnnotationsRef.current[key]?.noteText ?? "";
          if (currentText === sentNoteText) {
            dirty.delete(key);
            setSavedMoveNoteKey(key);
          } else if (reason !== "flush") {
            retryLater();
          }
        })
        .catch((err: unknown) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[move-notes] sync failed for", key, err);
          }
          if (reason !== "flush") {
            retryLater();
          }
        });
    }
  }

  // Debounced sync: on each tick, POST all dirty keys.
  useEffect(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncDirtyMoveNoteKeys("debounce");
    }, 2000);
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [moveAnnotations]);

  // Flush dirty notes when postmortem panel closes.
  // Keys are only removed from the dirty set on successful POST,
  // so nothing is lost if the network or API fails.
  useEffect(() => {
    if (isPostMortemVisible) return;
    syncDirtyMoveNoteKeys("flush");
  }, [isPostMortemVisible]);

  const currentDecisionFen = normalizeDecisionFen(
    activeSequencePosition?.move?.fenBefore ?? startingFen,
  );

  // Load surfaced notes for the current decision position so the
  // training "Notes" rail can show what the user has previously noted
  // about this exact FEN, matching the dashboard view.
  useEffect(() => {
    const fen = currentDecisionFen;
    if (!fen) {
      setSurfacedNotesForFen({ fen: "", notes: [] });
      return;
    }
    let cancelled = false;
    fetch(`/api/train/move-notes?decisionFen=${encodeURIComponent(fen)}`)
      .then((res) => (res.ok ? res.json() : { notes: [] }))
      .then((data: { notes?: RawNoteRow[] }) => {
        if (cancelled) return;
        setSurfacedNotesForFen({ fen, notes: Array.isArray(data.notes) ? data.notes : [] });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (process.env.NODE_ENV !== "production") {
          console.warn("[train] surfaced notes load failed", err);
        }
        setSurfacedNotesForFen({ fen, notes: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [currentDecisionFen]);

  // Load existing notes from Supabase when postmortem opens.
  useEffect(() => {
    if (!isPostMortemVisible) return;
    const loadedFens = new Set<string>();
    for (const move of annotatableMoves) {
      const fen = move.moveKey.split("::")[0];
      if (!fen || loadedFens.has(fen)) continue;
      loadedFens.add(fen);
    }
    if (loadedFens.size === 0) return;
    for (const fen of loadedFens) {
      fetch(`/api/train/move-notes?decisionFen=${encodeURIComponent(fen)}`)
        .then((res) => res.json())
        .then((data: { notes?: Array<Record<string, unknown>> }) => {
          if (!data.notes) return;
          const loaded: Record<string, AnnotatedMove> = {};
          for (const row of data.notes) {
            const moveKey = row.move_key as string;
            loaded[moveKey] = {
              moveKey,
              decisionFen: row.decision_fen as string,
              uci: row.move_uci as string,
              san: (row.move_san as string) ?? undefined,
              classification: (row.classification as string) ?? undefined,
              cpLoss: (row.cp_loss as number) ?? undefined,
              evalBefore: (row.eval_before_cp as number) ?? null,
              evalAfter: (row.eval_after_cp as number) ?? null,
              mateBefore: (row.mate_before as number) ?? null,
              mateAfter: (row.mate_after as number) ?? null,
              attemptCount: (row.attempt_count as number) ?? 1,
              firstAttemptedAt: (row.first_attempted_at as string) ?? new Date().toISOString(),
              lastAttemptedAt: (row.last_attempted_at as string) ?? new Date().toISOString(),
              noteText: (row.note_text as string) ?? "",
            };
          }
          if (Object.keys(loaded).length > 0) {
            setMoveAnnotations((prev) => ({ ...prev, ...loaded }));
          }
        })
        .catch((err: unknown) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[move-notes] load failed", err);
          }
        });
    }
  }, [isPostMortemVisible]);

  // Dev-only replay state instrumentation
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !(window as unknown as Record<string, unknown>).__BLINDSPOTS_QA__) return;
    const currentIndex = activeExploreIndex;
    const currentPos = activeSequencePosition;
    (window as unknown as { __blindspotsTrainReplayState?: unknown }).__blindspotsTrainReplayState = {
      get activeExploreIndex() { return currentIndex; },
      get maxExploreIndex() { return Math.max(0, visibleSequencePositions.length - 1); },
      get activeFen() { return currentPos?.fen; },
      get activeMove() { return currentPos?.move; },
      get visibleSequencePositions() { return visibleSequencePositions; },
    };
  }, [activeExploreIndex, activeSequencePosition, visibleSequencePositions]);

  // Dev-only audio stats instrumentation
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !(window as unknown as Record<string, unknown>).__BLINDSPOTS_QA__) return;
    (window as unknown as { __blindspotsTrainAudioStats?: unknown }).__blindspotsTrainAudioStats = getTrainAudioStats();
  });

  function normalizeTrainingNotes(input: unknown): NormalizedNote[] {
    if (!Array.isArray(input)) return [];
    const rows: RawNoteRow[] = input.map((note: any) => ({
      move_key: note.moveKey ?? note.move_key ?? null,
      decision_fen: note.decisionFen ?? note.decision_fen ?? null,
      move_uci: note.moveUci ?? note.move_uci ?? note.uci ?? null,
      move_san: note.moveSan ?? note.move_san ?? note.san ?? null,
      classification: note.classification ?? note.moveClassification ?? note.move_classification ?? null,
      note_text: note.noteText ?? note.note_text ?? note.note ?? note.text ?? null,
      eval_before_cp: note.evalBeforeCp ?? note.eval_before_cp ?? null,
      eval_after_cp: note.evalAfterCp ?? note.eval_after_cp ?? null,
    }));
    return normalizeNotes(rows);
  }

  const isExploringResults = state === "complete" && resultMode === "explore";
  const isActiveSetupReplay =
    state === "active" &&
    !!initialPreludeRef.current &&
    moves.length === 0;
  const isViewingPreludeReplay = isActiveSetupReplay && activeSetupReplayIndex === 0;
  const showStartGestureOverlay = state === "active" && isAwaitingStartGesture;

  const activeSetupBeforeFen = displayStartingFen;
  const activeSetupAfterFen = startingFen;
  const activeSetupCurrentFen =
    activeSetupReplayIndex === 0 ? activeSetupBeforeFen : activeSetupAfterFen;
  const activeSetupCurrentLastMove =
    activeSetupReplayIndex === 1 && initialOpponentMove
      ? lastMoveFromTrainingMove(initialOpponentMove)
      : null;

  const activeExploratoryPosition =
    exploratoryHistoryIndex >= 0 ? exploratoryHistory[exploratoryHistoryIndex] : null;
  const boardFen = isExploringResults
    ? (activeExploratoryPosition?.fen ?? exploratoryFen ?? activeSequencePosition?.fen ?? fen ?? "")
    : isActiveSetupReplay
      ? activeSetupCurrentFen
      : activeReplayPosition?.fen ?? (fen ?? "");
  const boardRailMoves = useMemo(
    () => displayMoves.map((move, index) => ({ move, index })),
    [displayMoves],
  );
  const opponentRailMoves = useMemo(
    () => boardRailMoves.filter(({ move }) => move.side !== userMoveSide),
    [boardRailMoves, userMoveSide],
  );
  const userRailMoves = useMemo(
    () => boardRailMoves.filter(({ move }) => move.side === userMoveSide),
    [boardRailMoves, userMoveSide],
  );
  const resurfacedNotes = useMemo(() => {
    const position = activeSequencePosition as
      | (VisibleSequencePosition & {
          surfacedNotes?: unknown;
          moveNotes?: unknown;
          move_notes?: unknown;
          notes?: unknown;
          mistakeNotes?: unknown;
          mistake_notes?: unknown;
        })
      | undefined;
    const fromPosition =
      position?.surfacedNotes ??
      position?.moveNotes ??
      position?.move_notes ??
      position?.notes ??
      position?.mistakeNotes ??
      position?.mistake_notes ??
      null;
    if (Array.isArray(fromPosition) && fromPosition.length > 0) {
      return normalizeTrainingNotes(fromPosition);
    }
    if (surfacedNotesForFen.fen && surfacedNotesForFen.fen === currentDecisionFen) {
      return normalizeTrainingNotes(surfacedNotesForFen.notes);
    }
    return [];
  }, [activeSequencePosition, surfacedNotesForFen, currentDecisionFen]);

  if (process.env.NODE_ENV === "development") {
    const posAny = activeSequencePosition as Record<string, unknown> | undefined;
    console.log("[train] current position notes", {
      surfacedNotes: posAny?.surfacedNotes,
      moveNotes: posAny?.moveNotes,
      move_notes: posAny?.move_notes,
      notes: posAny?.notes,
      mistakeNotes: posAny?.mistakeNotes,
      mistake_notes: posAny?.mistake_notes,
      surfacedFromFen: surfacedNotesForFen,
      normalized: resurfacedNotes,
    });
  }
  const replayLastMove = isExploringResults
    ? (activeExploratoryPosition?.lastMove ?? exploratoryLastMove ?? lastMoveFromTrainingMove(activeSequencePosition?.move))
    : isActiveSetupReplay
      ? activeSetupCurrentLastMove
      : activeReplayPosition?.move
        ? lastMoveFromTrainingMove(activeReplayPosition.move)
        : lastMove;
  const boardLastMoveBadge = (() => {
    if (!isExploringResults) return null;
    if (!activeExploratoryPosition?.move) return activeCanonicalMove?.boardBadge ?? null;
    const move = activeExploratoryPosition?.move ?? activeSequencePosition?.move;
    const classification = classificationForPlayedMove(
      move,
      move?.fenBefore ? engineLineCache[move.fenBefore] ?? [] : [],
    );
    return classification
      ? {
          label: classificationLabel(classification),
          icon: classificationIcon(classification),
          color: classificationColor(classification),
        }
      : null;
  })();
  const selectedMove =
    selectedMoveIndex != null && selectedMoveIndex > 0 && selectedMoveIndex <= moves.length
      ? moves[selectedMoveIndex - 1]
      : null;
  const selectedMoveSquares = selectedMove ? moveFromUci(selectedMove.uci) : null;
  const selectedMoveClassification = classificationForPlayedMove(
    selectedMove,
    selectedMove?.fenBefore ? engineLineCache[selectedMove.fenBefore] ?? [] : [],
  );
  const selectedCanonicalMove = selectedMoveIndex != null
    ? canonicalPostmortemMoves.find((move) => move.positionIndex === selectedMoveIndex) ?? null
    : null;
  const selectedMoveHighlight = selectedCanonicalMove?.boardHighlight
    ? selectedCanonicalMove.boardHighlight
    : selectedMove && selectedMoveSquares
    ? { ...selectedMoveSquares, classification: selectedMoveClassification }
    : null;
  const selectedMoveUci = selectedMove?.uci ?? null;
  const userColor = getFenTurnSide(startingFen);
  const selectedMoveOwner =
    selectedMove && userColor
      ? selectedMove.side === userColor ? "user" : "engine"
      : null;
  const currentEngineLines = isExploringResults
    ? engineLineCache[boardFen] ?? []
    : [];
  const hasSelectablePieceOnSquare = (square: string | null) => {
    if (!square) return false;
    try {
      const chess = new Chess(boardFen);
      const piece = chess.get(square as Square);
      return Boolean(piece && piece.color === chess.turn());
    } catch {
      return false;
    }
  };
  const effectiveExploreSelectedSquare = hasSelectablePieceOnSquare(exploreSelectedSquare)
    ? exploreSelectedSquare
    : null;
  const pieceLinesKey = effectiveExploreSelectedSquare
    ? trainPieceLineCacheKey(boardFen, effectiveExploreSelectedSquare)
    : null;
  const cachedPieceLines = pieceLinesKey
    ? (pieceLineCache[pieceLinesKey] ?? pieceLineCacheRef.current[pieceLinesKey] ?? null)
    : null;
  const cachedTopLines =
    engineLineCache[boardFen] ??
    engineLineCacheRef.current[boardFen] ??
    [];
  const terminalBoardDisplay = useMemo(
    () => getPostmortemTerminalDisplay(boardFen),
    [boardFen],
  );
  const currentEngineEval = currentEngineLines[0]?.cp ?? terminalBoardDisplay.evalCp ?? undefined;
  const currentEngineMate = currentEngineLines[0]?.mate ?? terminalBoardDisplay.evalMate ?? null;
  const displayLines = effectiveExploreSelectedSquare && cachedPieceLines
    ? mergePieceLinesWithDeeperKnownLines({
        fen: boardFen,
        square: effectiveExploreSelectedSquare,
        pieceLines: cachedPieceLines,
        knownLineLists: [cachedTopLines],
      })
    : effectiveExploreSelectedSquare
      ? []
      : currentEngineLines;
  const classifiedDisplayLines = useMemo(
    () => displayLines.map((line, index) => {
      const selectedPieceClassification =
        effectiveExploreSelectedSquare && typeof currentEngineEval === "number"
          ? classifyEvaluatedMove({
              previous: {
                cp: currentEngineEval,
                mate: currentEngineMate ?? null,
                bestMove: currentEngineLines[0]?.bestMove,
              },
              next: {
                cp: line.cp,
                mate: line.mate ?? null,
                bestMove: line.bestMove,
              },
              color: engineColorFromFen(boardFen),
              move: line.bestMove,
            })
          : undefined;

      return {
        ...line,
        classification: selectedPieceClassification ?? line.classification ?? engineLineClassification(index, displayLines, boardFen),
      };
    }),
    [boardFen, currentEngineEval, currentEngineLines, currentEngineMate, displayLines, effectiveExploreSelectedSquare],
  );
  const boardEngineLines = effectiveExploreSelectedSquare
    ? classifiedDisplayLines
    : classifiedDisplayLines.filter((line) => isRecommendableClassification(line.classification));
  const hoveredEngineLineMove =
    hoveredEngineLineIndex == null ? null : classifiedDisplayLines[hoveredEngineLineIndex]?.bestMove ?? null;
  const currentEngineMateCp = whitePositiveMateCp(boardFen, currentEngineMate, currentEngineEval);
  const boardFrameClassName = [
    "app-brutal-board-frame relative max-w-full overflow-visible",
    isExploringResults
      ? "w-[min(88vw,calc(100dvh-10.25rem),836px)]"
      : state === "active" && !trainOnboardingIntroActive
        ? "w-[min(82vw,calc(100dvh-12.5rem),800px)]"
        : "w-[min(82vw,calc(100dvh-12.5rem),800px)]",
  ].join(" ");
  const trainViewportClassName =
    "-mx-4 -mb-4 flex h-full min-h-0 w-[calc(100%+2rem)] flex-1 overflow-hidden px-3 py-3 md:-mx-6 md:w-[calc(100%+3rem)]";
  const playingGridClassName =
    "mx-auto grid h-full min-h-0 w-fit max-w-[calc(100vw-32px)] min-w-0 grid-cols-1 gap-5 transition-opacity duration-200 lg:grid-cols-[auto_320px] lg:items-center lg:justify-center lg:translate-x-[5vw]";
  const playingBoardSectionClassName =
    "app-brutal-section relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden p-3 sm:p-4 lg:w-fit lg:p-4";
  const preplayBoardHandoffClassName = "";
  const isEngineLinesLoading = Boolean(
    isExploringResults && engineLineLoadingFen === boardFen,
  );
  const isPieceLinesLoading = Boolean(
    exploreSelectedSquare && pieceLinesKey && pieceLinesLoadingKey === pieceLinesKey,
  );
  const isDisplayLoading = exploreSelectedSquare ? isPieceLinesLoading : isEngineLinesLoading;
  const hasEngineLineError = isExploringResults && engineLineErrorFens.has(boardFen);

  useEffect(() => {
    const exploreFen = isExploringResults ? boardFen : null;
    if (!isExploringResults || !exploreFen) return;
    if (engineLineCache[exploreFen]) {
      return;
    }

    let cancelled = false;
    setEngineLineLoadingFen(exploreFen);
    void fetchEngineLinesForFen(exploreFen).finally(() => {
      if (!cancelled) setEngineLineLoadingFen(null);
    });

    return () => {
      cancelled = true;
    };
  }, [boardFen, isExploringResults]);

  useEffect(() => {
    if (!isExploringResults || !exploreSelectedSquare) {
      setPieceLinesLoadingKey(null);
      return;
    }
    const key = `${boardFen}::${exploreSelectedSquare}`;
    if (pieceLineCacheRef.current[key]) {
      setPieceLinesLoadingKey(null);
      return;
    }

    let cancelled = false;
    setPieceLinesLoadingKey(key);
    void fetchPieceLinesForSquare(boardFen, exploreSelectedSquare).finally(() => {
      if (!cancelled) setPieceLinesLoadingKey(null);
    });

    return () => {
      cancelled = true;
    };
  }, [boardFen, exploreSelectedSquare, isExploringResults]);

  // ── Keyboard navigation (visible/replay timeline) ───────────────────────────

  function shouldIgnoreTrainShortcut(event: KeyboardEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest(
        "input, textarea, select, [contenteditable='true'], [data-ignore-train-shortcuts='true']",
      ),
    );
  }

  useEffect(() => {
    if (state !== "complete") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      if (shouldIgnoreTrainShortcut(event)) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Home") {
        navigateExploreTo(0, "start");
        return;
      }
      if (event.key === "End") {
        navigateExploreTo(Math.max(0, visibleSequencePositions.length - 1), "end");
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        goReplayPrevious();
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        goReplayNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, resultMode, activeExploreIndex, exploratoryHistory.length, exploratoryHistoryIndex, visibleSequencePositions.length]);

  // ── Keyboard navigation (active setup replay: ArrowLeft/Right between a and b) ──

  useEffect(() => {
    if (!isActiveSetupReplay) return;

    function handleSetupReplayKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      if (shouldIgnoreTrainShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "ArrowLeft" || event.key === "Home") {
        goReplayPrevious();
      } else if (event.key === "ArrowRight" || event.key === "End") {
        goReplayNext();
      }
    }

    window.addEventListener("keydown", handleSetupReplayKey);
    return () => window.removeEventListener("keydown", handleSetupReplayKey);
  }, [isActiveSetupReplay, activeSetupReplayIndex, initialOpponentMove]);

  // ── Keyboard navigation (active sequence replay: ArrowLeft/Right through history) ──

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof Element)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.getAttribute("contenteditable") === "true"
      );
    }

    function handleActiveReplayKeydown(e: KeyboardEvent) {
      if (isAwaitingStartGesture) return;
      if (state !== "active") return;
      if (isOpponentThinking || isCompletingSequence) return;
      if (isEditableTarget(e.target)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === "ArrowLeft") {
        goReplayPrevious();
      } else {
        goReplayNext();
      }
    }

    window.addEventListener("keydown", handleActiveReplayKeydown);
    return () => {
      window.removeEventListener("keydown", handleActiveReplayKeydown);
    };
  }, [
    activeReplayIndex,
    isAwaitingStartGesture,
    isCompletingSequence,
    isOpponentThinking,
    state,
    visibleSequencePositions,
  ]);

  useEffect(() => {
    if (state !== "complete" || resultMode === "explore") return;
    const timer = window.setTimeout(() => {
      setExploreIndex(Math.max(0, visibleSequencePositions.length - 1));
      resetExploratoryLine();
      setExploreSelectedSquare(null);
      setResultMode("explore");
    }, 180);
    return () => window.clearTimeout(timer);
  }, [resultMode, visibleSequencePositions.length, state]);

  function navigateExploratoryLine(nextIndex: number) {
    if (nextIndex < -1) {
      return;
    }
    if (nextIndex >= exploratoryHistory.length) {
      return;
    }

    const currentIndex = exploratoryHistoryIndex;
    const movingForward = nextIndex > currentIndex;

    setIsManualPostmortemExploration(false);
    setSelectedMoveIndex(null);
    setHoveredEngineLineIndex(null);
    setHoveredMoveSquares(null);
    setExploratoryHistoryIndex(nextIndex);

    const position = nextIndex >= 0 ? exploratoryHistory[nextIndex] : null;
    setExploratoryFen(position?.fen ?? null);
    setExploratoryLastMove(position?.lastMove ?? null);
    setExploreSelectedSquare(null);
    if (position?.fen) {
      void fetchEngineLinesForFen(position.fen);
    }

    if (movingForward && position?.move) {
      playTrainMoveSound({
        move: position.move,
        source: "replay",
        advanceLivePitch: false,
      });
    }
  }

  function navigateExploreTo(
    nextIndex: number,
    boundary: "start" | "end" = "end",
  ) {
    const maxIndex = Math.max(0, visibleSequencePositions.length - 1);
    const boundedIndex = Math.max(0, Math.min(maxIndex, nextIndex));
    if (boundedIndex === activeExploreIndex && nextIndex !== activeExploreIndex) {
      return;
    }
    const previousIndex = activeExploreIndex;
    setIsManualPostmortemExploration(false);
    setSelectedMoveIndex(boundedIndex);
    resetExploratoryLine();
    setExploreSelectedSquare(null);
    setHoveredEngineLineIndex(null);
    setHoveredMoveSquares(null);
    const targetPos = visibleSequencePositions[boundedIndex];
    if (
      shouldPlayReplaySound(previousIndex, boundedIndex) &&
      targetPos?.move &&
      typeof targetPos.pitchIndex === "number"
    ) {
      playTrainMoveSound({
        move: targetPos.move,
        pitchIndex: targetPos.pitchIndex,
        advanceLivePitch: false,
        source: "replay",
      });
    }
    setExploreIndex(boundedIndex);
  }

  // ── Shared navigation helpers (reused by keyboard + wheel) ──

  function goReplayPrevious() {
    // Active setup replay: go to previous FEN (index 0)
    if (isActiveSetupReplay) {
      if (activeSetupReplayIndex === 1) setActiveSetupReplayIndex(0);
      return;
    }

    // Active sequence replay: step backward through move history
    if (state === "active") {
      if (isAwaitingStartGesture || isOpponentThinking || isCompletingSequence) return;
      const positions = visibleSequencePositions;
      if (positions.length <= 1) return;
      const liveLastIndex = positions.length - 1;
      const currentIndex = activeReplayIndex ?? liveLastIndex;
      const nextIndex = Math.max(0, currentIndex - 1);
      if (nextIndex === currentIndex) return;
      setIsManualPostmortemExploration(false);
      setActiveReplayIndex(nextIndex === liveLastIndex ? null : nextIndex);
      return;
    }

    // Postmortem: use shared navigation action dispatch
    if (state === "complete") {
      const action = postMortemNavigationAction({
        key: "ArrowLeft",
        resultMode,
        activeExploreIndex,
        visibleSequenceLength: visibleSequencePositions.length,
        exploratoryHistoryLength: exploratoryHistory.length,
        exploratoryHistoryIndex,
      });

      if (action.type === "enter-explore") {
        setSelectedMoveIndex(null);
        setExploreIndex(Math.max(0, visibleSequencePositions.length - 1));
        resetExploratoryLine();
        setExploreSelectedSquare(null);
        setResultMode("explore");
        return;
      }

      if (action.type === "branch") {
        navigateExploratoryLine(action.index);
        return;
      }

      if (action.type === "sequence") {
        navigateExploreTo(action.index, action.boundary);
      }
    }
  }

  function goReplayNext() {
    // Active setup replay: advance to current FEN (index 1)
    if (isActiveSetupReplay) {
      if (activeSetupReplayIndex === 0) {
        setActiveSetupReplayIndex(1);
        if (initialOpponentMove) {
          playTrainMoveSound({ move: initialOpponentMove, pitchIndex: 0, advanceLivePitch: false, source: "replay" });
        }
      }
      return;
    }

    // Active sequence replay: step forward through move history
    if (state === "active") {
      if (isAwaitingStartGesture || isOpponentThinking || isCompletingSequence) return;
      const positions = visibleSequencePositions;
      if (positions.length <= 1) return;
      const liveLastIndex = positions.length - 1;
      const currentIndex = activeReplayIndex ?? liveLastIndex;
      const nextIndex = Math.min(liveLastIndex, currentIndex + 1);
      if (nextIndex === currentIndex) return;
      setIsManualPostmortemExploration(false);
      setActiveReplayIndex(nextIndex === liveLastIndex ? null : nextIndex);

      const nextPosition = positions[nextIndex];
      if (nextPosition?.move) {
        playTrainMoveSound({
          move: nextPosition.move,
          plyRef: moveSoundPlyRef,
          pitchIndex: nextPosition.pitchIndex,
          source: "replay",
          advanceLivePitch: false,
        });
      }
      return;
    }

    // Postmortem: use shared navigation action dispatch
    if (state === "complete") {
      const action = postMortemNavigationAction({
        key: "ArrowRight",
        resultMode,
        activeExploreIndex,
        visibleSequenceLength: visibleSequencePositions.length,
        exploratoryHistoryLength: exploratoryHistory.length,
        exploratoryHistoryIndex,
      });

      if (action.type === "enter-explore") {
        setSelectedMoveIndex(null);
        setExploreIndex(Math.max(0, visibleSequencePositions.length - 1));
        resetExploratoryLine();
        setExploreSelectedSquare(null);
        setResultMode("explore");
        return;
      }

      if (action.type === "branch") {
        navigateExploratoryLine(action.index);
        return;
      }

      if (action.type === "sequence") {
        navigateExploreTo(action.index, action.boundary);
      }
    }
  }

  // ── Wheel navigation (board scroll → replay step) ──

  const boardContainerRef = useRef<HTMLDivElement | null>(null);
  const introOverlayRef = useRef<HTMLDivElement | null>(null);
  const wheelDeltaAccRef = useRef(0);
  const wheelNavLastRef = useRef(0);

  useEffect(() => {
    const container = boardContainerRef.current;
    if (!container) return;

    function isScrollablePanelDescendant(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false;
      // Don't hijack scroll when inside scrollable panels / engine lines / move table / mistake memory
      return target.closest(
        "textarea, input, select, [contenteditable='true'], [data-ignore-train-shortcuts='true'], [data-train-postmortem-panel], .train-mistake-memory-panel, [data-train-sidebar]",
      ) !== null;
    }

    function handleWheel(e: WheelEvent) {
      // Never hijack when interacting with form controls or scrollable panels
      if (isScrollablePanelDescendant(e.target)) return;

      // Only navigate when in a navigable state
      const canNav = isActiveSetupReplay || state === "active" || state === "complete";
      if (!canNav) return;

      // Guard during edge states
      if (state === "active" && (isAwaitingStartGesture || isOpponentThinking || isCompletingSequence)) return;

      e.preventDefault();

      wheelDeltaAccRef.current += e.deltaY;

      const absAcc = Math.abs(wheelDeltaAccRef.current);
      if (absAcc < 40) return;

      const now = performance.now();
      if (now - wheelNavLastRef.current < 150) return;
      wheelNavLastRef.current = now;

      const direction = wheelDeltaAccRef.current > 0 ? "next" : "previous";
      wheelDeltaAccRef.current = 0;

      if (process.env.NODE_ENV === "development") {
        const mode = isActiveSetupReplay ? "setup" : state === "active" ? "active" : "complete";
        console.log("[train-wheel-nav]", { direction, mode, targetIndex: isActiveSetupReplay ? activeSetupReplayIndex : state === "active" ? (activeReplayIndex ?? visibleSequencePositions.length - 1) : activeExploreIndex });
      }

      if (direction === "next") {
        goReplayNext();
      } else {
        goReplayPrevious();
      }
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [isActiveSetupReplay, state, isAwaitingStartGesture, isOpponentThinking, isCompletingSequence, activeSetupReplayIndex, activeReplayIndex, activeExploreIndex, visibleSequencePositions, resultMode, exploratoryHistory.length, exploratoryHistoryIndex]);

  // ── Train Onboarding Intro Overlay ─────────────────────────────────
// Show (and animate) the intro overlay while it is still visible.
// Once done, fade it out then unmount so it stops blocking interaction.
const introOverlay = trainOnboardingIntroVisible ? (
    <div
      ref={introOverlayRef}
      className={[
        "pointer-events-auto fixed inset-0 z-40 transition-opacity duration-300",
        (trainOnboardingIntroExiting || trainOnboardingIntroDone) ? "opacity-0" : "opacity-100",
      ].join(" ")}
      aria-hidden={trainOnboardingIntroExiting || trainOnboardingIntroDone}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <TrainOnboardingIntroOverlay
          step={trainOnboardingIntroStep}
          totalSteps={PREPLAY_TOUR_STEPS.length}
          steps={PREPLAY_TOUR_STEPS}
          isLoadingFinalStep={isStartingPreplayPosition}
          onNext={() => {
            if (isStartingPreplayPosition) return;
            if (trainOnboardingIntroStep < PREPLAY_TOUR_STEPS.length - 1) {
              setTrainOnboardingIntroStep((s) => s + 1);
            } else {
              void startPreplayOnboardingPosition();
            }
          }}
          onBack={() => {
            if (isStartingPreplayPosition) return;
            if (trainOnboardingIntroStep > 0) {
              setTrainOnboardingIntroStep((s) => s - 1);
            }
          }}
          onSkip={() => {
            if (isStartingPreplayPosition) return;
            void startPreplayOnboardingPosition();
          }}
        />
      </div>
    </div>
  ) : null;

  if (onboardingScreen !== "done") {
    return (
      <TrainOnboarding
        screen={onboardingScreen}
        selectedProvider={selectedProvider}
        username={profileUsername}
        connectionMessage={connectionMessage}
        isConnectingProfile={isConnectingProfile}
        analysisStep={analysisStep}
        analysisError={analysisError}
        analysisElapsedMs={analysisElapsedMs}
        summary={initializationSummary}
        skillLevel={skillLevel}
        onSkillLevelChange={setSkillLevel}
        onSelectProvider={setSelectedProvider}
        onUsernameChange={setProfileUsername}
        onConnectProfile={connectProfile}
        onSkip={skipConnection}
        onStartTraining={() => void startFirstSession()}
        isStartingTraining={isStartingTraining}
      />
    );
  }

  return (
    <div className={trainViewportClassName}>
      <div
        ref={trainLayoutGridRef}
        data-train-layout-state={isPostMortemVisible ? "results" : "playing"}
        className={
          isPostMortemVisible
            ? "mx-auto grid h-full min-h-0 w-full max-w-[100rem] min-w-0 gap-4 transition-opacity duration-200 lg:grid-cols-[minmax(0,1.22fr)_minmax(28rem,0.92fr)] lg:items-stretch"
            : playingGridClassName
        }
      >
        <section
          className={[
            "app-brutal-section relative flex min-h-0 min-w-0 items-center justify-center p-3 sm:p-4 lg:p-4",
            state === "active" && !trainOnboardingIntroActive ? "overflow-visible" : "overflow-hidden",
            isPostMortemVisible ? "" : "lg:w-fit",
            shouldRunPreplayOnboarding ? preplayBoardHandoffClassName : "",
          ].join(" ")}
        >
          <div className="relative flex min-h-0 w-fit max-w-full min-w-0 flex-col items-stretch justify-center self-center">
            <div ref={boardContainerRef} className={boardFrameClassName}>
              {boardFen ? (
                <>
                  <BoardWithPlayerStrips
                    userSide={userMoveSide}
                    boardFen={boardFen ?? ""}
                    isOpponentThinking={isOpponentThinking}
                    isTrainingActive={state === "active"}
                    isExploring={isExploringResults}
                    isSetupReplay={isActiveSetupReplay}
                    isReplayMode={state === "active" && (isActiveSetupReplay || activeReplayIndex !== null)}
                  >
                    {isExploringResults ? (
                      <BoardWithEvalBar
                        evalCp={currentEngineEval}
                        evalMate={currentEngineMate}
                        evalMateCp={currentEngineMateCp}
                        isLoading={isEngineLinesLoading}
                        orientation={boardOrientation}
                      >
                        <AnalysisBoard
                          fen={boardFen}
                          mode="training"
                          pieceAnimation={shouldAnimatePieces}
                          orientation={boardOrientation}
                          coordinates
                          showLegalTargets={false}
                          selectedSquare={exploreSelectedSquare}
                          lastMove={replayLastMove}
                          lastMoveBadge={boardLastMoveBadge}
                          boardTheme={visualPreferences.boardTheme}
                          pieceTheme={visualPreferences.pieceTheme}
                          disabled={isPositionLoading || !hasLoadedPosition}
                          highlightedSquares={
                            hoveredMoveSquares
                              ? moveHighlightsForClassifiedMove(hoveredMoveSquares, hoveredMoveSquares.classification)
                              : selectedMoveHighlight
                                ? moveHighlightsForClassifiedMove(selectedMoveHighlight, selectedMoveHighlight.classification)
                                : undefined
                          }
                          engineArrows={buildEngineArrows(boardEngineLines, hoveredEngineLineMove)}
                          dataTestId="train-board"
                          onMove={(move) => { setExploreSelectedSquare(null); setSelectedMoveIndex(null); handleExploreMove(move); }}
                          onSquareClick={(square) => {
                            try {
                              const chess = new Chess(boardFen);
                              const piece = chess.get(square as Square);
                              if (piece && piece.color === chess.turn() && square !== exploreSelectedSquare) { setExploreSelectedSquare(square); } else { setExploreSelectedSquare(null); }
                            } catch { setExploreSelectedSquare(null); }
                          }}
                          onCircleHover={setHoveredAnnotationSquare}
                          onEngineArrowClick={handleExploreMove}
                        />
                      </BoardWithEvalBar>
                    ) : (
                      <AnalysisBoard
                        fen={boardFen}
                        mode="training"
                        pieceAnimation={shouldAnimatePieces}
                        orientation={boardOrientation}
                        coordinates
                        showLegalTargets
                        lastMove={replayLastMove}
                        boardTheme={visualPreferences.boardTheme}
                        pieceTheme={visualPreferences.pieceTheme}
                        disabled={isPositionLoading || !hasLoadedPosition || state !== "active" || isOpponentThinking || isAwaitingStartGesture || isViewingPreludeReplay}
                        annotationsDisabled={false}
                        highlightedSquares={getTrainingBoardHighlights(state)}
                        onMove={handleMove}
                        dataTestId="train-board"
                      />
                    )}
                  </BoardWithPlayerStrips>
                  {showStartGestureOverlay ? (
                    <div
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[10px] bg-black/70 backdrop-blur-sm"
                      data-testid="audio-unlock-overlay"
                    >
                      <p className="text-sm font-bold uppercase tracking-[0.18em] text-white">
                        Press any key or click the board to start
                      </p>
                    </div>
                  ) : null}
                  {isPositionLoading && !trainOnboardingIntroActive ? (
                    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
                      <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-4 py-2 shadow-[3px_3px_0_var(--app-brutal-edge)]">
                        <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text)]">
                          Loading position
                          <span className="inline-flex w-5 justify-start">
                            <span className="app-loading-dot">.</span>
                            <span className="app-loading-dot">.</span>
                            <span className="app-loading-dot">.</span>
                          </span>
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {state === "resolving" ? (
                    <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-black/20">
                      <div className="app-brutal-section-soft flex flex-col items-center gap-2 px-4 py-3 text-center">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--app-text)]">
                          Sequence complete
                        </span>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div
                  className="grid aspect-square w-full place-items-center rounded-[10px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] text-sm font-bold text-[var(--app-muted)]"
                  aria-live="polite"
                >
                  No position available
                </div>
              )}
            </div>
          </div>
        </section>

        {!isPostMortemVisible && attemptRegistry.length > 0 ? (
          <AttemptRegistryAside
            entries={attemptRegistry}
            onNoteSaved={(id, note) => {
              setAttemptRegistry((prev) =>
                prev.map((e) => (e.id === id ? { ...e, note } : e)),
              );
            }}
          />
        ) : null}

        {!isPostMortemVisible ? (
          <>
            {(() => {
              async function copyCurrentFen() {
                const fenToCopy = boardFen;
                if (!fenToCopy) return;
                try {
                  await navigator.clipboard.writeText(fenToCopy);
                  setFenCopied(true);
                  if (fenCopyTimerRef.current) {
                    window.clearTimeout(fenCopyTimerRef.current);
                  }
                  fenCopyTimerRef.current = window.setTimeout(() => {
                    setFenCopied(false);
                  }, 1600);
                } catch (err) {
                  console.error("[train] failed to copy FEN", err);
                  window.alert("Could not copy FEN. Try again.");
                }
              }

              const copyFenPreview = boardFen
                ? boardFen.length > 34
                  ? `${boardFen.slice(0, 34)}...`
                  : boardFen
                : "No FEN available";

              const copyFenButton = (
                <button
                  type="button"
                  onClick={copyCurrentFen}
                  className="mb-4 group grid w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2.5 rounded-lg border border-[var(--app-border-soft)] bg-[color-mix(in_srgb,var(--app-panel-solid)_92%,var(--app-bg)_8%)] px-3 py-2.5 text-left transition hover:border-[var(--app-border)] hover:bg-[var(--app-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-border)]"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center text-[var(--app-muted-soft)] transition group-hover:text-[var(--app-muted)]">
                    <svg
                      aria-hidden="true"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </span>

                  <span className="min-w-0">
                    <span className="block text-[10px] font-black uppercase tracking-[0.11em] text-[var(--app-muted)]">
                      {fenCopied ? "Copied FEN" : "Copy FEN"}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[9px] leading-none tracking-normal text-[var(--app-muted-soft)]">
                      {copyFenPreview}
                    </span>
                  </span>
                </button>
              );

              return (
                <TrainingNotesRail
                  notes={resurfacedNotes}
                  copyFenButton={copyFenButton}
                  skipButton={<a href="/train" className={primaryActionClassName}>Next position</a>}
                  dashboardButton={<a href="/" className={secondaryActionClassName}>Return to Dashboard</a>}
                />
              );
            })()}
          </>
        ) : null}

        {isPostMortemVisible ? (
          <aside
            data-testid="train-move-panel"
            className={[
              "app-brutal-section flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden p-[var(--pm-card-pad)]",
            ].join(" ")}
          >
            {/* ── Compact toggle: Analysis | Notes ──────────────────────── */}
            <div className="inline-flex h-[var(--pm-tab-h)] w-full shrink-0 justify-center gap-1">
              {(["analysis", "memory"] as const).map((item) => {
                const active = postmortemSidePanel === item;
                return (
                  <button
                    key={item}
                    type="button"
                    className={[
                      "inline-flex h-full items-center border px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] transition min-[1500px]:text-sm",
                      active
                        ? "relative z-10 border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                        : "cursor-pointer border-[var(--app-border)] bg-transparent text-[var(--app-muted)] hover:border-[var(--app-accent)] hover:text-[var(--app-text)]",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--app-accent)]",
                    ].join(" ")}
                    onClick={() => setPostmortemSidePanel(item)}
                  >
                    {item === "analysis" ? "Analysis" : "Notes"}
                  </button>
                );
              })}
            </div>

            {/* ── Panel content ───────────────────────────────────────────── */}
            <div className="train-postmortem-panel flex min-h-0 flex-1 flex-col gap-[var(--pm-gap)] pr-1">
              {postmortemSidePanel === "analysis" ? (
                <ResultsPanel
                hideDelta={isOnboardingFirstPostmortem}
                isSaving={isOnboardingFirstPostmortem ? false : isCompletingSequence}
                eloResult={isOnboardingFirstPostmortem ? { eloBefore: 1200, eloAfter: 1200, eloDelta: 0, kFactor: 0, opponentElo: 0, expectedScore: 0, actualScore: 0, rawDelta: 0, clampedDelta: 0, skipped: false } as EloResult : eloResult}
                moves={moves}
                asyncMoveEvaluations={asyncMoveEvaluations}
                userSide={userMoveSide}
                startingFen={startingFen}
                mode={resultMode}
                positions={visibleSequencePositions}
                canonicalMoves={canonicalPostmortemMoves}
                currentIndex={activeExploreIndex}
                engineLines={classifiedDisplayLines}
                isEngineLinesLoading={isDisplayLoading}
                hasEngineLineError={hasEngineLineError}
                currentEngineEval={currentEngineEval}
                engineEmptyMessage={terminalBoardDisplay.engineEmptyMessage}
                isPieceSelected={Boolean(exploreSelectedSquare)}
                hoveredAnnotationSquare={hoveredAnnotationSquare}
                hoveredEngineLineIndex={hoveredEngineLineIndex}
                onEngineLineHover={setHoveredEngineLineIndex}
                onEngineLineSelect={handleExploreMove}
                onMoveHover={setHoveredMoveSquares}
                onNavigate={navigateExploreTo}
                selectedMoveIndex={selectedMoveIndex}
                isManualPostmortemExploration={isManualPostmortemExploration}
                selectedMoveUci={selectedMoveUci}
                onSelectMove={(positionIndex) => {
                  navigateExploreTo(positionIndex);
                }}
              />
              ) : (
                <div data-tour="notes-panel" className="min-h-0 flex-1">
                  <MoveNotesPanel
                    moves={annotatableMoves}
                    annotations={moveAnnotations}
                    selectedMoveKey={selectedMoveKey}
                    onSelectMove={handleSelectMove}
                    onUpdateNote={handleUpdateNote}
                    savedMoveKey={savedMoveNoteKey}
                  />
                </div>
              )}
            </div>

            {/* ── Manual queue + Copy FEN row ─────────────────────────────── */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={addingPositionToQueue || !boardFen}
                onClick={async () => {
                  if (addingPositionToQueue) return;
                  const fenToAdd = boardFen;
                  if (!fenToAdd) return;
                  const preludeMove =
                    activeExploratoryPosition?.move ?? activeSequencePosition?.move ?? null;
                  setAddingPositionToQueue(true);
                  try {
                    const res = await fetch("/api/dashboard/mistakes/add", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        decisionFen: fenToAdd,
                        setupPreviousFen: preludeMove?.fenBefore ?? null,
                        setupPlayedMoveUci: preludeMove?.uci ?? null,
                        setupPlayedMoveSan: preludeMove?.san ?? null,
                      }),
                    });
                    if (!res.ok) throw new Error(`Add failed: ${res.status}`);
                    showAlert({
                      kind: "success",
                      title: "Added to Learning queue",
                      message: "You will see this position again soon.",
                    });
                    if (isPostmortemAddPositionActionStep) {
                      setPostmortemAddPositionActionDone(true);
                      setPostmortemAddPositionCheckpointReached(true);
                      setPostmortemOnboardingStep((step) =>
                        Math.min(step + 1, POSTMORTEM_TOUR_STEPS.length - 1),
                      );
                    }
                  } catch (err) {
                    console.error("[train] failed to add position to queue", err);
                    showAlert({
                      kind: "error",
                      title: "Could not add position",
                      message: "Try again in a moment.",
                    });
                  } finally {
                    setAddingPositionToQueue(false);
                  }
                }}
                data-tour="add-position-to-learning-queue"
                className={[
                  secondaryActionClassName,
                  "min-h-12 w-full justify-center px-5 disabled:opacity-60",
                  isPostmortemAddPositionWaiting
                    ? "train-add-position-glow ring-2 ring-[var(--app-accent)] transition-all duration-300 ease-out"
                    : "",
                ].join(" ")}
              >
                <span className={postmortemActionTextClassName}>
                  {addingPositionToQueue
                    ? "Adding..."
                    : "Add Position to Learning Queue"}
                </span>
              </button>
              <button
                type="button"
                disabled={!boardFen}
                onClick={async () => {
                  const fenToCopy = boardFen;
                  if (!fenToCopy) return;
                  try {
                    await navigator.clipboard.writeText(fenToCopy);
                    setFenCopied(true);
                    if (fenCopyTimerRef.current) {
                      window.clearTimeout(fenCopyTimerRef.current);
                    }
                    fenCopyTimerRef.current = window.setTimeout(() => {
                      setFenCopied(false);
                    }, 1600);
                  } catch (err) {
                    console.error("[train] failed to copy FEN", err);
                    window.alert("Could not copy FEN. Try again.");
                  }
                }}
                className={[
                  secondaryActionClassName,
                  "min-h-12 w-full justify-center px-5 disabled:opacity-60",
                ].join(" ")}
              >
                <span className={postmortemActionTextClassName}>
                  {fenCopied ? "Copied FEN ✓" : "Copy FEN"}
                </span>
              </button>
            </div>

            {/* ── Postmortem action footer ───────────────────────────────── */}
            <div
              data-tour="postmortem-actions"
              className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              <a
                href="/train"
                onClick={isPostmortemAddPositionActionStep && !postmortemAddPositionActionDone ? (e) => e.preventDefault() : undefined}
                aria-disabled={isPostmortemAddPositionActionStep && !postmortemAddPositionActionDone ? "true" : undefined}
                className={[
                  primaryActionClassName,
                  "min-h-12 w-full justify-center px-5",
                  isPostmortemAddPositionActionStep && !postmortemAddPositionActionDone ? "opacity-40 cursor-not-allowed pointer-events-none" : "",
                ].join(" ")}
              >
                <span className={postmortemActionTextClassName}>Next Position</span>
              </a>
              <a
                href="/"
                onClick={isPostmortemAddPositionActionStep && !postmortemAddPositionActionDone ? (e) => e.preventDefault() : undefined}
                aria-disabled={isPostmortemAddPositionActionStep && !postmortemAddPositionActionDone ? "true" : undefined}
                className={[
                  secondaryActionClassName,
                  "min-h-12 w-full justify-center px-5",
                  isPostmortemAddPositionActionStep && !postmortemAddPositionActionDone ? "opacity-40 cursor-not-allowed pointer-events-none" : "",
                ].join(" ")}
              >
                <span className={postmortemActionTextClassName}>Return to Dashboard</span>
              </a>
            </div>
          </aside>
        ) : null}
      </div>
      {introOverlay}

      {postmortemOnboardingActive ? (
        <div
          className={[
            isPostmortemAddPositionWaiting
              ? "opacity-0 pointer-events-none"
              : "opacity-100",
            "transition-opacity duration-200 ease-out motion-reduce:transition-none",
          ].join(" ")}
        >
        <TrainPostmortemTourOverlay
          steps={POSTMORTEM_TOUR_STEPS}
          step={postmortemOnboardingStep}
          completionInFlight={onboardingCompletionInFlight}
          onBack={handlePostmortemTourBack}
          onNext={handlePostmortemTourNext}
          onSkip={handlePostmortemTourSkip}
          onMissingTarget={handleMissingPostmortemTourTarget}
          isActionStep={isPostmortemAddPositionActionStep}
          actionCompleted={postmortemAddPositionActionDone}
          centerCard={isPostmortemAddPositionActionStep && !postmortemAddPositionInstructionAcknowledged}
          postmortemTourSoftSwitching={postmortemTourSoftSwitching}
          backDisabled={
            postmortemOnboardingStep <= 0 ||
            (
              postmortemAddPositionCheckpointReached &&
              POSTMORTEM_TOUR_STEPS.findIndex(
                (s) => s.headline === "Notes" && s.centerCard === true
              ) >= 0 &&
              postmortemOnboardingStep <= POSTMORTEM_TOUR_STEPS.findIndex(
                (s) => s.headline === "Notes" && s.centerCard === true
              )
            )
          }
        />
        </div>
      ) : null}
      <style>{`
        .train-add-position-glow {
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--app-accent) 80%, transparent),
            0 0 24px color-mix(in srgb, var(--app-accent) 70%, transparent);
        }
        @media (prefers-reduced-motion: no-preference) {
          .train-add-position-glow {
            animation: train-glow-pulse 1.4s ease-in-out infinite alternate;
          }
        }
        @keyframes train-glow-pulse {
          from {
            box-shadow:
              0 0 0 1px color-mix(in srgb, var(--app-accent) 70%, transparent),
              0 0 14px color-mix(in srgb, var(--app-accent) 45%, transparent);
          }
          to {
            box-shadow:
              0 0 0 2px color-mix(in srgb, var(--app-accent) 95%, transparent),
              0 0 30px color-mix(in srgb, var(--app-accent) 85%, transparent);
          }
        }
      `}</style>

      {showOnboardingPreferencesModal ? (
        <OnboardingPreferencesModal
          selectedDailyTarget={selectedDailyTargetLevel}
          isSaving={isSavingOnboardingPreferences}
          onDailyTargetChange={setSelectedDailyTargetLevel}
          onFinish={finishOnboardingWithPreferences}
        />
      ) : null}

      <TopAlertViewport alert={topAlert} onDismiss={dismissAlert} />
    </div>
  );
}

function OnboardingPreferencesModal({
  selectedDailyTarget,
  isSaving,
  onDailyTargetChange,
  onFinish,
}: {
  selectedDailyTarget: string;
  isSaving: boolean;
  onDailyTargetChange: (level: string) => void;
  onFinish: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
    >
      <div className="app-brutal-card relative mx-4 w-[min(calc(100vw-2rem),64rem)] border-2 p-8" role="dialog" aria-modal="true" aria-label="Training preferences">
        <h2 className="mb-2 text-2xl font-bold leading-tight text-[var(--app-text)]">
          Your starting preferences.
        </h2>
        <p className="mb-6 text-sm leading-7 text-[var(--app-muted)]">
          And let&apos;s finish things by setting up your training rhythm. You can change these later from the <strong>Account</strong> page.
        </p>

        {/* Daily target */}
        <h3 className="mb-1 text-sm font-bold text-[var(--app-text)]">Daily target</h3>
        <p className="mb-3 text-xs text-[var(--app-muted)]">How many positions do you want to complete per day?</p>
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {DAILY_TARGET_OPTIONS.map((opt) => {
            const selected = selectedDailyTarget === opt.level;
            return (
              <button
                key={opt.level}
                type="button"
                onClick={() => onDailyTargetChange(opt.level)}
                className={[
                  "min-h-[92px] rounded-lg border p-4 text-left transition",
                  selected ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] ring-1 ring-[var(--app-accent)]" : "border-[var(--app-border)] hover:border-[var(--app-border-strong)]",
                ].join(" ")}
              >
                <span className="flex min-w-0 items-baseline gap-1 text-sm font-bold text-[var(--app-text)]">
                  <span>{opt.label}</span>
                  {(opt as any).recommended ? (
                    <span className="whitespace-nowrap text-xs font-medium text-[var(--app-muted)]">(Recommended)</span>
                  ) : null}
                </span>
                <div className="mt-0.5 text-xs text-[var(--app-muted)]">{opt.positions} positions/day</div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onFinish}
            disabled={isSaving}
            className="app-brutal-button inline-flex min-h-11 items-center justify-center px-6 py-2.5 text-sm"
          >
            {isSaving ? "Saving..." : "Finish"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrainPostmortemTourOverlay({
  steps,
  step,
  completionInFlight,
  onBack,
  onNext,
  onSkip,
  onMissingTarget,
  isActionStep,
  actionCompleted,
  centerCard = false,
  postmortemTourSoftSwitching = false,
  backDisabled = false,
}: {
  steps: readonly PostmortemTourStep[];
  step: number;
  completionInFlight: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onMissingTarget: () => void;
  isActionStep?: boolean;
  actionCompleted?: boolean;
  centerCard?: boolean;
  postmortemTourSoftSwitching?: boolean;
  backDisabled?: boolean;
}) {
  const [resolvedStepIndex, setResolvedStepIndex] = useState(step);
  const [targetRect, setTargetRect] = useState<{ top: number; left: number; width: number; height: number; right: number; bottom: number } | null>(null);
  const [missingTarget, setMissingTarget] = useState(false);
  const [isPositioningSpotlight, setIsPositioningSpotlight] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [displayedStep, setDisplayedStep] = useState(step);
  const [previousDisplayedStep, setPreviousDisplayedStep] = useState<number | null>(null);
  const [isCardSwitching, setIsCardSwitching] = useState(false);
  const [isPlacementSwitching, setIsPlacementSwitching] = useState(false);
  const cardSwitchingTimersRef = useRef<number[]>([]);
  const transitionTokenRef = useRef(0);
  const allSteps = steps as readonly PostmortemTourStep[];
  const displayedTourStep = allSteps[displayedStep] ?? allSteps[0];
  const previousTourStep = previousDisplayedStep === null ? null : allSteps[previousDisplayedStep] ?? null;
  const currentStep = allSteps[step] ?? allSteps[0];
  const shouldCenterCard = centerCard || currentStep.centerCard === true;
  const previousCenterCardRef = useRef(shouldCenterCard);
  const isFirst = step <= 0;
  const isLast = step >= steps.length - 1;

  const VIEWPORT_PAD = 16;
  const GAP = 16;

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function isRectFullyVisible(rect: DOMRect, padding = 24): boolean {
    return (
      rect.top >= padding &&
      rect.left >= padding &&
      rect.bottom <= window.innerHeight - padding &&
      rect.right <= window.innerWidth - padding
    );
  }

  function rectSnapshot(rect: DOMRect) {
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    };
  }

  function rectsClose(a: DOMRect | null, b: DOMRect, epsilon = 0.5) {
    if (!a) return false;
    return (
      Math.abs(a.top - b.top) <= epsilon &&
      Math.abs(a.left - b.left) <= epsilon &&
      Math.abs(a.width - b.width) <= epsilon &&
      Math.abs(a.height - b.height) <= epsilon
    );
  }

  // ── Resolve step: find target, scroll, measure, then update copy ──
  useLayoutEffect(() => {
    let cancelled = false;
    let targetObserver: ResizeObserver | null = null;

    async function resolveStep() {
      setIsPositioningSpotlight(true);

      const currentStep = allSteps[step];
      if (!currentStep) {
        setIsPositioningSpotlight(false);
        return;
      }

      const selector = `[data-tour="${currentStep.target}"]`;

      let target: HTMLElement | null = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        target = document.querySelector<HTMLElement>(selector);
        if (target) break;
        await delayMs(50);
        if (cancelled) return;
      }

      if (!target) {
        setMissingTarget(true);
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[train-postmortem-tour] missing target: ${currentStep.target}`);
        }
        setIsPositioningSpotlight(false);
        onMissingTarget();
        return;
      }

      setMissingTarget(false);

      // Observe target for resize/reflow
      if (targetObserver) targetObserver.disconnect();
      targetObserver = new ResizeObserver(() => {
        if (cancelled || !target) return;
        setTargetRect(target.getBoundingClientRect());
      });
      targetObserver.observe(target);

      // Scroll listener for position changes (parent scrolled, etc.)
      function handleScrollOrResize() {
        if (cancelled || !target) return;
        window.requestAnimationFrame(() => {
          if (cancelled || !target) return;
          setTargetRect(rectSnapshot(target.getBoundingClientRect()));
        });
      }
      window.addEventListener("scroll", handleScrollOrResize, true);
      window.addEventListener("resize", handleScrollOrResize);

      const rect = target.getBoundingClientRect();
      if (!isRectFullyVisible(rect, 24)) {
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      }

      // Wait for scroll to settle
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      if (cancelled) return;

      // Stabilization loop: keep measuring until rect is stable for 2 consecutive frames
      let previousRect: DOMRect | null = null;
      let stableFrames = 0;

      for (let i = 0; i < 20; i += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;

        const nextRect = target.getBoundingClientRect();
        const snapshot = rectSnapshot(nextRect);

        if (rectsClose(previousRect, nextRect)) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
        }

        previousRect = nextRect;
        setTargetRect(snapshot);

        if (stableFrames >= 2) break;
      }

      if (cancelled) return;

      setResolvedStepIndex(step);
      setIsPositioningSpotlight(false);

      // Cleanup scroll listeners
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    }

    void resolveStep();

    return () => {
      cancelled = true;
      if (targetObserver) targetObserver.disconnect();
    };
  }, [step, allSteps, onMissingTarget]);

  // ── Measure card size (re-measure when resolved step changes) ──
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    let frame = 0;
    let cardObserver: ResizeObserver | null = null;
    function measure() {
      frame = window.requestAnimationFrame(() => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setCardSize({ width: rect.width, height: rect.height });
      });
    }
    measure();
    cardObserver = new ResizeObserver(measure);
    cardObserver.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      cardObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [resolvedStepIndex]);

  // ── Track viewport size ──
  useEffect(() => {
    function updateViewportSize() {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    }
    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  // ── Crossfade card content between steps ──
  function clearSwitchingTimers() {
    cardSwitchingTimersRef.current.forEach((t) => window.clearTimeout(t));
    cardSwitchingTimersRef.current = [];
  }

  useEffect(() => {
    return clearSwitchingTimers;
  }, []);

  useEffect(() => {
    if (step === displayedStep) return;

    const previous = displayedStep;
    clearSwitchingTimers();
    setPreviousDisplayedStep(previous);
    setIsCardSwitching(true);

    const swapTimer = window.setTimeout(() => {
      setDisplayedStep(step);
    }, 80);

    const doneTimer = window.setTimeout(() => {
      setPreviousDisplayedStep(null);
      setIsCardSwitching(false);
    }, 260);

    cardSwitchingTimersRef.current.push(swapTimer, doneTimer);

    return clearSwitchingTimers;
  }, [step]);

  // ── Detect placement-mode changes (target-positioned ↔ centered) ──
  useEffect(() => {
    if (previousCenterCardRef.current !== shouldCenterCard) {
      previousCenterCardRef.current = shouldCenterCard;
      setIsPlacementSwitching(true);
      const timer = window.setTimeout(() => {
        setIsPlacementSwitching(false);
      }, 280);
      return () => window.clearTimeout(timer);
    }
  }, [shouldCenterCard]);

  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const margin = 16;
  const spotlight = targetRect
    ? {
        top: Math.max(margin, targetRect.top - 6),
        left: Math.max(margin, targetRect.left - 6),
        width: Math.min(viewportWidth - margin * 2, targetRect.width + 12),
        height: Math.min(viewportHeight - margin * 2, targetRect.height + 12),
        bottom: Math.min(viewportHeight - margin, targetRect.bottom + 6),
        right: Math.min(viewportWidth - margin, targetRect.right + 6),
      }
    : null;
  const measuredCardWidth = cardSize?.width ?? 440;
  const measuredCardHeight = cardSize?.height ?? 300;
  const cardMaxWidth = Math.min(440, viewportWidth - VIEWPORT_PAD * 2);
  const isSmallScreen = viewportWidth < 760;

  // On small screens, dock the card at the bottom.
  let cardLeft: number;
  let cardTop: number;
  let cardStyle: React.CSSProperties;

  if (shouldCenterCard) {
    const cardWidth = Math.min(520, viewportWidth - VIEWPORT_PAD * 2);
    cardStyle = {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: cardWidth,
      height: measuredCardHeight,
      maxHeight: `calc(100vh - ${VIEWPORT_PAD * 2}px)`,
    };
  } else if (isSmallScreen || !spotlight) {
    cardStyle = {
      left: VIEWPORT_PAD,
      right: VIEWPORT_PAD,
      bottom: VIEWPORT_PAD,
      height: measuredCardHeight,
      maxHeight: `calc(100vh - ${VIEWPORT_PAD * 2}px)`,
      width: "auto",
    };
  } else if (measuredCardHeight >= viewportHeight - VIEWPORT_PAD * 2) {
    // Card taller than viewport — scroll inside.
    cardStyle = {
      left: VIEWPORT_PAD,
      right: VIEWPORT_PAD,
      top: VIEWPORT_PAD,
      height: measuredCardHeight,
      maxHeight: `calc(100vh - ${VIEWPORT_PAD * 2}px)`,
      width: spotlight ? Math.min(cardMaxWidth, viewportWidth - VIEWPORT_PAD * 2) : cardMaxWidth,
    };
  } else {
    // Desktop: try right side, then left, then center horizontally.
    const preferredRight = spotlight.left + spotlight.width + GAP;
    const preferredLeft = spotlight.left - cardMaxWidth - GAP;
    const canPlaceRight = preferredRight + cardMaxWidth <= viewportWidth - VIEWPORT_PAD;
    const canPlaceLeft = preferredLeft >= VIEWPORT_PAD;

    const preferredLeftPos = canPlaceRight
      ? preferredRight
      : canPlaceLeft
        ? preferredLeft
        : Math.max(VIEWPORT_PAD, (viewportWidth - cardMaxWidth) / 2);

    const preferredTopPos = spotlight.top;

    cardLeft = clamp(preferredLeftPos, VIEWPORT_PAD, viewportWidth - cardMaxWidth - VIEWPORT_PAD);
    cardTop = clamp(preferredTopPos, VIEWPORT_PAD, viewportHeight - measuredCardHeight - VIEWPORT_PAD);

    cardStyle = {
      top: cardTop,
      left: cardLeft,
      width: cardMaxWidth,
      height: measuredCardHeight,
      maxHeight: `calc(100vh - ${VIEWPORT_PAD * 2}px)`,
    };
  }

  const cardVisibilityClass = isPlacementSwitching || postmortemTourSoftSwitching
    ? "opacity-0 scale-[0.985] translate-y-0.5"
    : "opacity-100 scale-100 translate-y-0";

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Postmortem onboarding">
      {/* Single SVG mask cutout avoids seams from stitched dim rectangles. */}
      {!currentStep.suppressSpotlight && spotlight ? (
        <svg
          aria-hidden="true"
          data-testid="train-spotlight-dim-mask"
          className="pointer-events-none fixed inset-0"
          width={viewportWidth}
          height={viewportHeight}
          viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
          preserveAspectRatio="none"
        >
          <defs>
            <mask id="train-postmortem-spotlight-mask">
              <rect x="0" y="0" width={viewportWidth} height={viewportHeight} fill="white" />
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx="10"
                ry="10"
                fill="black"
                className="transition-[x,y,width,height] duration-300 ease-out"
              />
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width={viewportWidth}
            height={viewportHeight}
            fill="black"
            fillOpacity="0.68"
            mask="url(#train-postmortem-spotlight-mask)"
          />
        </svg>
      ) : null}
      {/* Full-screen dim for centered instruction modal (no spotlight mask) */}
      {shouldCenterCard ? (
        <div className="pointer-events-none fixed inset-0 bg-black/68 transition-opacity duration-300" />
      ) : null}
      {/* Click catcher — always transparent, dim layer handled separately */}
      <button
        type="button"
        aria-label="Next tour step"
        className="absolute inset-0 cursor-default bg-transparent"
        onClick={() => { if (!isPositioningSpotlight) onNext(); }}
      />
      {/* Spotlight border — smooth transition between targets */}
      {!currentStep.suppressSpotlight && spotlight ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-[10px] border border-[var(--app-accent)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--app-accent)_42%,transparent)] transition-[top,left,width,height] duration-300 ease-out"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      ) : null}
      <div
        className={[
          "fixed flex flex-col gap-4 rounded-[8px] border border-[var(--app-border)] bg-[var(--app-panel-solid)] p-8 text-[var(--app-text)] shadow-[4px_4px_0_var(--app-brutal-edge)]",
          cardVisibilityClass,
          "transition-[opacity,transform,top,left,width,height] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none motion-reduce:transform-none",
        ].join(" ")}
        ref={cardRef}
        style={cardStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSkip(); }}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
          aria-label="Close postmortem tour"
          disabled={completionInFlight}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="mb-6 shrink-0" />

        <div className="relative min-h-0 overflow-y-auto">
          {previousTourStep ? (
            <div
              key={`prev-${previousDisplayedStep}`}
              className="pointer-events-none absolute inset-x-0 top-0 opacity-0 -translate-y-2 blur-[1px] transition-all duration-200 motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:blur-0"
            >
              <h2 className="mb-3 text-2xl font-bold leading-tight text-[var(--app-text)]">
                {previousTourStep.headline}
              </h2>
              <p className="mb-8 text-sm leading-7 text-[var(--app-muted)]">
                {previousTourStep.body}
              </p>
            </div>
          ) : null}
          <div
            key={`current-${displayedStep}`}
            className={[
              "relative transition-opacity duration-[180ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
              isCardSwitching ? "opacity-0" : "opacity-100",
              "motion-reduce:transition-none motion-reduce:opacity-100",
            ].join(" ")}
          >
            <h2 className="mb-3 text-2xl font-bold leading-tight text-[var(--app-text)]">
              {displayedTourStep.headline}
            </h2>
            <p className="mb-8 text-sm leading-7 text-[var(--app-muted)]">
              {missingTarget ? "Finding the section..." : displayedTourStep.body}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (!isPositioningSpotlight && !isFirst && !backDisabled) onBack(); }}
            aria-disabled={isFirst || isPositioningSpotlight || backDisabled}
            disabled={backDisabled}
            className="min-h-11 border border-[var(--app-border)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--app-muted)] transition hover:border-[var(--app-accent)] hover:text-[var(--app-text)] aria-disabled:cursor-not-allowed aria-disabled:opacity-40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (!isPositioningSpotlight) onNext(); }}
            className="app-brutal-button min-h-11 px-6 text-xs"
            disabled={completionInFlight || isPositioningSpotlight || (isActionStep && !actionCompleted && !shouldCenterCard)}
          >
            {completionInFlight ? "Saving..." : (isActionStep && !actionCompleted ? displayedTourStep.cta ?? "Waiting..." : displayedTourStep.cta ?? "Next")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrainOnboarding({
  screen,
  selectedProvider,
  username,
  connectionMessage,
  isConnectingProfile,
  analysisStep,
  analysisError,
  analysisElapsedMs,
  summary,
  skillLevel,
  onSkillLevelChange,
  onSelectProvider,
  onUsernameChange,
  onConnectProfile,
  onSkip,
  onStartTraining,
  isStartingTraining,
}: {
  screen: OnboardingScreen;
  selectedProvider: ProfileProvider | null;
  username: string;
  connectionMessage: string;
  isConnectingProfile: boolean;
  analysisStep: number;
  analysisError: string;
  analysisElapsedMs: number;
  summary: InitializationSummary | null;
  skillLevel: SkillLevel;
  onSkillLevelChange: (level: SkillLevel) => void;
  onSelectProvider: (provider: ProfileProvider | null) => void;
  onUsernameChange: (value: string) => void;
  onConnectProfile: (provider: ProfileProvider) => void;
  onSkip: () => void;
  onStartTraining: () => void;
  isStartingTraining: boolean;
}) {
  type OnboardingFlowStep = "source" | "username" | "skill";
  type OnboardingSource = ProfileProvider | "none";

  const [step, setStep] = useState<OnboardingFlowStep>("source");
  const [source, setSource] = useState<OnboardingSource | null>(selectedProvider);
  const [direction, setDirection] = useState<1 | -1>(1);
  const sourceNeedsUsername = source === "lichess" || source === "chesscom";
  const activeStepIndex = step === "source" ? 0 : step === "username" ? 1 : 2;

  useEffect(() => {
    if (screen !== "connect") return;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const inField =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.getAttribute("contenteditable") === "true";

      if (event.key === "Escape" && !inField) {
        if (step === "username") goToStep("source");
        if (step === "skill") goToStep(sourceNeedsUsername ? "username" : "source");
        return;
      }

      if (inField) return;

      if (step === "source") {
        if (event.key === "1") selectSource("lichess");
        if (event.key === "2") selectSource("chesscom");
        if (event.key === "3") selectSource("none");
        if (event.key === "Enter" && source) continueFromSource();
      }

      if (step === "skill") {
        const levelByKey: Record<string, SkillLevel> = {
          "1": "new_to_chess",
          "2": "beginner",
          "3": "intermediate",
          "4": "advanced",
          "5": "expert",
        };
        const selectedLevel = levelByKey[event.key];
        if (selectedLevel) onSkillLevelChange(selectedLevel);
        if (event.key === "Enter") finishOnboarding();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [screen, step, source, sourceNeedsUsername, skillLevel]);

  useEffect(() => {
    if (screen === "connect" && connectionMessage && step === "skill" && sourceNeedsUsername) {
      goToStep("username");
    }
  }, [screen, connectionMessage, step, sourceNeedsUsername]);

  function goToStep(nextStep: OnboardingFlowStep) {
    const order: Record<OnboardingFlowStep, number> = {
      source: 0,
      username: 1,
      skill: 2,
    };
    setDirection(order[nextStep] >= order[step] ? 1 : -1);
    setStep(nextStep);
  }

  function selectSource(nextSource: OnboardingSource) {
    setSource(nextSource);
    onSelectProvider(nextSource === "none" ? null : nextSource);
  }

  function continueFromSource() {
    if (!source) return;
    goToStep(source === "none" ? "skill" : "username");
  }

  function finishOnboarding() {
    if (isStartingTraining) return;
    if (source === "none") {
      void onSkip();
      return;
    }
    if (sourceNeedsUsername) {
      void onConnectProfile(source);
    }
  }

  return (
    <div
      className={[
        "app-paper-shell grid min-h-[calc(100dvh-64px)] w-full place-items-center overflow-x-hidden px-4 py-6",
      ].join(" ")}
    >
      <section className="w-full max-w-[640px] text-center">
        {screen === "loading" ? (
          <LinearProgress completedSteps={0} />
        ) : null}

        {screen === "connect" ? (
          <div className="grid min-h-[min(680px,calc(100dvh-132px))] content-between gap-8">
            <OnboardingStepHeader stepIndex={activeStepIndex} totalSteps={3} />

            <div
              key={step}
              className="train-onboarding-step grid gap-7 text-left"
              data-direction={direction}
            >
              {step === "source" ? (
                <>
                  <OnboardingTitle eyebrow="01 / Source" title="Where do you play?" />
                  <div className="grid gap-2.5">
                    <OnboardingChoice index="1" label="Lichess" detail="Use recent public games." selected={source === "lichess"} disabled={isConnectingProfile} onClick={() => selectSource("lichess")} />
                    <OnboardingChoice index="2" label="Chess.com" detail="Use recent public games." selected={source === "chesscom"} disabled={isConnectingProfile} onClick={() => selectSource("chesscom")} />
                    <OnboardingChoice index="3" label="Start without an account" detail="Use the fallback position pool." selected={source === "none"} disabled={isConnectingProfile} onClick={() => selectSource("none")} />
                  </div>
                  <div className="flex justify-end">
                    <OnboardingButton disabled={!source || isConnectingProfile} onClick={continueFromSource}>
                      Continue
                    </OnboardingButton>
                  </div>
                </>
              ) : null}

              {step === "username" && sourceNeedsUsername ? (
                <form
                  className="grid gap-7"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!isConnectingProfile && username.trim().length > 0) {
                      goToStep("skill");
                    }
                  }}
                >
                  <OnboardingTitle
                    eyebrow={`02 / ${source === "lichess" ? "Lichess" : "Chess.com"}`}
                    title="Enter your public username."
                  />
                  <label className="grid gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--app-muted)]">
                      {source === "lichess" ? "Lichess username" : "Chess.com username"}
                    </span>
                    <div className="flex min-h-13 items-center rounded-[6px] border border-[var(--app-border)] bg-[var(--app-surface-input)] transition focus-within:border-[var(--app-accent)]">
                      <span className="shrink-0 pl-4 text-xs text-[var(--app-muted-soft)]">
                        {source === "lichess" ? "lichess.org/@/" : "chess.com/member/"}
                      </span>
                      <input
                        aria-label={source === "lichess" ? "Lichess username" : "Chess.com username"}
                        value={username}
                        onChange={(event) => onUsernameChange(event.target.value)}
                        className="min-w-0 flex-1 bg-transparent px-2 py-4 text-base font-bold text-[var(--app-text)] outline-none"
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                      />
                    </div>
                    {connectionMessage ? (
                      <span className="text-sm text-[var(--app-class-blunder)]" role="status">
                        {connectionMessage}
                      </span>
                    ) : null}
                  </label>
                  <div className="flex items-center justify-between gap-3">
                    <OnboardingButton variant="secondary" onClick={() => goToStep("source")}>
                      Back
                    </OnboardingButton>
                    <OnboardingButton type="submit" disabled={isConnectingProfile || username.trim().length === 0}>
                      Continue
                    </OnboardingButton>
                  </div>
                </form>
              ) : null}

              {step === "skill" ? (
                <>
                  <OnboardingTitle eyebrow="03 / Skill" title="Set your starting point." />
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {[
                      ["new_to_chess", "1", "New to chess"],
                      ["beginner", "2", "Beginner"],
                      ["intermediate", "3", "Intermediate"],
                      ["advanced", "4", "Advanced"],
                      ["expert", "5", "Expert"],
                    ].map(([value, index, label]) => (
                      <OnboardingChoice
                        key={value}
                        index={index}
                        label={label}
                        selected={skillLevel === value}
                        disabled={isConnectingProfile || isStartingTraining}
                        onClick={() => { if (!isStartingTraining) onSkillLevelChange(value as SkillLevel); }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <OnboardingButton
                      variant="secondary"
                      disabled={isConnectingProfile}
                      onClick={() => goToStep(sourceNeedsUsername ? "username" : "source")}
                    >
                      Back
                    </OnboardingButton>
                    <OnboardingButton disabled={isConnectingProfile} onClick={finishOnboarding}>
                      {isConnectingProfile ? "Checking..." : source === "none" ? "Start training" : "Pull games"}
                    </OnboardingButton>
                  </div>
                </>
              ) : null}
            </div>

            <p className="text-left text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--app-muted-soft)]">
              {step === "source" ? "Press 1 / 2 / 3" : step === "username" ? "Enter to continue / Esc to go back" : "Press 1-5 / Esc to go back"}
            </p>
          </div>
        ) : null}

        {screen === "analysis" ? (
          <div className="mx-auto grid w-full max-w-[430px] gap-8">
            <LinearProgress completedSteps={analysisStep} />
            <div className="mx-auto grid w-full max-w-[360px] gap-4 text-left">
              {analysisError ? (
                <AnalysisLine active={false} done={false} failed label={analysisError} />
              ) : (
                <>
                  <AnalysisLine
                    active={analysisStep === 0}
                    done={analysisStep >= 1}
                    label="Pulling your recent games"
                  />
                  <AnalysisLine
                    active={analysisStep === 1}
                    done={analysisStep >= 2}
                    label="Running your moves through Stockfish"
                  />
                  <AnalysisLine
                    active={analysisStep === 2}
                    done={analysisStep >= 3}
                    label="Building the list of things you keep repeating"
                  />
                </>
              )}
            </div>
            <div className="mx-auto w-full max-w-[360px] text-left">
              <AnalysisElapsedMessage elapsedMs={analysisElapsedMs} />
            </div>
          </div>
        ) : null}

        {screen === "summary" && summary ? (
          <div className="grid gap-8">
            <h1 className="text-3xl font-bold text-[var(--app-text)]">
              We found enough.
            </h1>
            <div className="grid gap-3 border-y border-[var(--app-border-soft)] py-6 text-center sm:grid-cols-3">
              <SummaryStat value={`${summary.mistakesFound}`} label="mistakes found" />
              <SummaryStat value={`${summary.gamesAnalyzed}`} label="games checked" />
              <SummaryStat value={`${summary.averageCpLossPerMove}cp`} label="average loss" />
            </div>
            <button
              type="button"
              disabled={isStartingTraining}
              onClick={onStartTraining}
              className={primaryActionClassName}
            >
              {isStartingTraining ? "Starting..." : "Start training"}
            </button>
          </div>
        ) : null}

      </section>
    </div>
  );
}

function OnboardingStepHeader({
  stepIndex,
  totalSteps,
}: {
  stepIndex: number;
  totalSteps: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--app-muted)]">
        Step {stepIndex + 1} of {totalSteps}
      </span>
      <div className="flex flex-1 justify-end gap-1" aria-hidden="true">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <span
            key={index}
            className={[
              "h-0.5 w-8 rounded-full transition-colors duration-300",
              index <= stepIndex ? "bg-[var(--app-accent)]" : "bg-[var(--app-border-soft)]",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}

function OnboardingTitle({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="grid gap-3 text-center sm:text-left">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--app-accent)]">
        {eyebrow}
      </p>
      <h1 className="text-3xl font-bold leading-tight text-[var(--app-text)] sm:text-4xl">
        {title}
      </h1>
    </div>
  );
}

function OnboardingChoice({
  index,
  label,
  detail,
  selected,
  disabled,
  onClick,
}: {
  index: string;
  label: string;
  detail?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={[
        "grid min-h-20 w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-4 rounded-[6px] border px-4 py-3 text-left transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]",
        selected
          ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
          : "border-[var(--app-border-soft)] bg-[var(--app-panel-strong)] hover:border-[var(--app-border)]",
        disabled ? "cursor-wait opacity-60" : "",
      ].join(" ")}
    >
      <span
        className={[
          "grid h-8 w-8 place-items-center rounded border text-[10px] font-bold",
          selected
            ? "border-[var(--app-accent)] text-[var(--app-accent)]"
            : "border-[var(--app-border-soft)] text-[var(--app-muted)]",
        ].join(" ")}
      >
        {index}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[var(--app-text)]">{label}</span>
        {detail ? (
          <span className="mt-1 block text-xs leading-5 text-[var(--app-muted)]">{detail}</span>
        ) : null}
      </span>
    </button>
  );
}

function OnboardingButton({
  type = "button",
  variant = "primary",
  disabled,
  onClick,
  children,
}: {
  type?: "button" | "submit";
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex min-h-12 items-center justify-center rounded-[6px] border px-5 text-xs font-bold uppercase tracking-[0.14em] transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]",
        variant === "primary"
          ? "border-[var(--app-accent)] bg-[var(--app-accent)] !text-black hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
          : "border-[var(--app-border)] bg-transparent text-[var(--app-text)] hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]",
        disabled
          ? "cursor-not-allowed opacity-55 hover:border-[var(--app-border)] hover:bg-transparent hover:text-[var(--app-muted)]"
          : "cursor-pointer",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function BoardWithPlayerStrips({
  userSide,
  boardFen,
  isOpponentThinking,
  isTrainingActive,
  isExploring,
  isSetupReplay,
  isReplayMode,
  children,
}: {
  userSide: TrainingMove["side"];
  boardFen: string;
  isOpponentThinking: boolean;
  isTrainingActive: boolean;
  isExploring: boolean;
  isSetupReplay?: boolean;
  isReplayMode?: boolean;
  children: import("react").ReactNode;
}) {
  const opponentSide = userSide === "white" ? "black" : "white";
  const userLabel = userSide === "white" ? "White" : "Black";
  const opponentLabel = userSide === "white" ? "Black" : "White";

  let isUserActive = false;
  let isOpponentActive = false;

  if (isExploring || isReplayMode || isSetupReplay) {
    const turnSide = getFenTurnSide(boardFen);
    isUserActive = turnSide === userSide;
    isOpponentActive = turnSide === opponentSide;
  } else if (isTrainingActive) {
    isUserActive = !isOpponentThinking;
    isOpponentActive = isOpponentThinking;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <PlayerTurnStrip label={opponentLabel} isActive={isOpponentActive} align="start" />
      {children}
      <PlayerTurnStrip label={userLabel} isActive={isUserActive} align="end" />
    </div>
  );
}

type PlayerStripAlign = "start" | "end";

function PlayerTurnStrip({
  label,
  isActive,
  align = "start",
}: {
  label: string;
  isActive: boolean;
  align?: PlayerStripAlign;
}) {
  return (
    <div
      className={[
        "flex h-7 items-center gap-2 px-0.5",
        align === "end" ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-300"
        style={{ background: isActive ? "var(--app-class-best)" : "var(--app-border)" }}
      />
      <span
        className="text-sm font-bold transition-colors duration-300"
        style={{ color: isActive ? "var(--app-text)" : "var(--app-muted)" }}
      >
        {label}
      </span>
    </div>
  );
}

function ActivePlayPanel({
  rating,
  moveProgress,
  sequenceLength,
  moves,
  userSide,
  startingFen,
  state,
  isActiveSetupReplay,
  activeSetupReplayIndex,
  isOpponentThinking,
  isPositionLoading,
  positionLoadError,
  onLoadNextPosition,
  onResumeTraining,
}: {
  rating: number | null;
  moveProgress: number;
  sequenceLength: number;
  moves: TrainingMove[];
  userSide: "white" | "black";
  startingFen: string;
  state: TrainingState;
  isActiveSetupReplay: boolean;
  activeSetupReplayIndex: number | null;
  isOpponentThinking: boolean;
  isPositionLoading: boolean;
  positionLoadError: string | null;
  onLoadNextPosition: () => void;
  onResumeTraining: () => void;
}) {
  const userMoves = moves
    .map((move, index) => ({ ...move, absoluteIndex: index }))
    .filter((move) => move.side === userSide);

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Rating header + move progress */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">Blindspots Elo</p>
          <span className="text-5xl font-bold leading-none text-[var(--app-text)]">{rating ?? "--"}</span>
        </div>
        <div className="flex flex-col items-end gap-1.5 rounded border border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--app-text)]">
            Move {moveProgress} of {sequenceLength}
          </p>
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: sequenceLength }, (_, i) => (
              <span
                key={i}
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  background: i < moveProgress ? "var(--app-accent)" : "var(--app-border)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Status banners (drift, setup replay, error) */}
      {state === "drift" ? (
        <StatusBanner
          title="Eval dropped"
          detail="Saved for later. You will see it again."
          action="Again"
          tone="warning"
          onAction={onResumeTraining}
        />
      ) : isActiveSetupReplay && activeSetupReplayIndex === 0 ? (
        <div className="rounded-[8px] border border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-5 py-5">
          <p className="text-lg font-bold text-[var(--app-text)]">Before engine move</p>
        </div>
      ) : moves.length === 0 && !isOpponentThinking && !isPositionLoading ? (
        positionLoadError ? (
          <div className="rounded-[8px] border border-red-800 bg-red-950 px-5 py-5">
            <p className="text-lg font-bold text-red-400">Failed to load position</p>
            <p className="mt-1 text-sm text-red-300">{positionLoadError}</p>
            <button
              className="mt-3 rounded bg-red-800 px-4 py-2 text-sm text-white hover:bg-red-700"
              onClick={() => {
                onLoadNextPosition();
              }}
            >
              Retry
            </button>
          </div>
        ) : null
      ) : null}

      {/* Engine lines — 5 empty rows, populate when sequence ends */}
      <div className="opacity-40">
        <EngineLinesSection lines={[]} isLoading={false} />
      </div>

      {/* Eval chart — empty frame, populate when sequence ends */}
      <EvalGraph points={[]} currentIndex={-1} compact />

      {/* Move list — rows append as moves are played */}
      <AnalysisMoveTable
        moves={userMoves}
        compact
        showEvaluations={false}
      />
    </div>
  );
}

function LinearProgress({ completedSteps }: { completedSteps: number }) {
  const progress = Math.max(0, Math.min(3, completedSteps));
  const progressPercent = [0, 30, 70, 100][progress] ?? 0;

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--app-surface-subtle)]"
      role="progressbar"
      aria-label="Analysis progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progressPercent}
    >
      <div
        className="train-onboarding-progress h-full origin-left rounded-full bg-[var(--app-accent)]"
        style={{ width: `${progressPercent}%` }}
      />
    </div>
  );
}

function AnalysisElapsedMessage({ elapsedMs }: { elapsedMs: number }) {
  const message =
    elapsedMs >= 45_000
      ? "Still working. Stockfish was not built for your convenience."
      : elapsedMs >= 15_000
        ? "This takes about a minute. Real analysis is slow."
        : elapsedMs >= 5_000
          ? "Running through the bad moves now."
          : "";

  return <p className="min-h-5 text-sm text-[var(--app-muted)]">{message}</p>;
}

function AnalysisLine({
  active,
  done,
  failed = false,
  label,
}: {
  active: boolean;
  done: boolean;
  failed?: boolean;
  label: string;
}) {
  return (
    <div
      className={[
        "flex min-h-11 items-center gap-3",
        failed
          ? "text-[var(--app-class-blunder)]"
          : active || done
            ? "text-[var(--app-text)]"
            : "text-[var(--app-muted)]",
      ].join(" ")}
    >
      <span
        className={[
          "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold",
          failed
            ? "border-[var(--app-class-blunder)] bg-[var(--app-class-blunder-soft)] text-[var(--app-class-blunder)]"
            : done
            ? "border-[var(--app-accent)] bg-[var(--app-accent)] !text-black"
            : active
              ? "train-onboarding-step-active border-[var(--app-accent)] text-[var(--app-accent)]"
              : "border-[var(--app-border)] text-[var(--app-muted)]",
        ].join(" ")}
        aria-hidden="true"
      >
        {failed ? "!" : done ? "✓" : active ? "•" : ""}
      </span>
      <span className={["text-base", active || done || failed ? "font-bold" : "font-normal"].join(" ")}>
        {label}
      </span>
    </div>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-mono text-4xl font-bold tabular-nums text-[var(--app-text)]">{value}</p>
      <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
        {label}
      </p>
    </div>
  );
}

function resolveProfileConnectionError(error?: string) {
  switch (error) {
    case "profile-not-found":
      return "That profile does not exist. Or you typed it wrong.";
    case "invalid-username":
      return "That username format looks wrong.";
    case "storage-needs-migration":
      return "The linked-profile table is behind. Run the migration.";
    case "unauthorized":
      return "Sign in again before trying that.";
    default:
      return "Could not link that profile right now.";
  }
}

function waitForMinimumElapsed(startedAt: number, minimumMs: number) {
  return sleep(Math.max(0, minimumMs - (performance.now() - startedAt)));
}

function applyIndexedMove(previousFen: string, playedMove: string): {
  move: TrainingMove;
  fenAfter: string;
  lastMove: { from: string; to: string };
} | null {
  try {
    const chess = new Chess(previousFen);
    let played;
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(playedMove)) {
      played = chess.move({
        from: playedMove.slice(0, 2),
        to: playedMove.slice(2, 4),
        promotion: playedMove[4],
      });
    } else {
      played = chess.move(playedMove);
    }
    if (!played) return null;
    return {
      move: {
        san: played.san,
        uci: `${played.from}${played.to}${played.promotion ?? ""}`,
        side: played.color === "w" ? "white" : "black",
        fenBefore: previousFen,
        fenAfter: chess.fen(),
      },
      fenAfter: chess.fen(),
      lastMove: { from: played.from, to: played.to },
    };
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function shouldPlayReplaySound(oldIndex: number, newIndex: number): boolean {
  return newIndex > oldIndex;
}

function getFenTurnSide(fen: string | null): TrainingMove["side"] {
  if (!fen) return "white";
  try {
    return new Chess(fen).turn() === "w" ? "white" : "black";
  } catch {
    return "white";
  }
}

function normalizeSequenceLength(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SEQUENCE_LENGTH;
  return Math.max(MIN_SEQUENCE_LENGTH, Math.min(MAX_SEQUENCE_LENGTH, Math.round(parsed)));
}

function applyMoveScores(
  moves: TrainingMove[],
  scores: MoveScore[],
  startingFen: string,
) {
  const scoresByIndex = new Map(scores.map((score) => [score.userMoveIndex, score]));
  const userSide = getFenTurnSide(startingFen);
  let userMoveIndex = 0;

  return moves.map((move) => {
    if (move.side !== userSide) return move;

    const score = scoresByIndex.get(userMoveIndex);
    userMoveIndex += 1;

    return score
      ? {
          ...move,
          cpLoss: score.cpLoss,
          evalBefore: score.evalBefore,
          evalAfter: score.evalAfter,
          mateBefore: score.mateBefore ?? null,
          mateAfter: score.mateAfter ?? null,
          classification: score.classification,
        }
      : move;
  });
}

function buildSequencePositions(startingFen: string, moves: TrainingMove[]): SequencePosition[] {
  const positions: SequencePosition[] = [{ index: 0, fen: startingFen, label: "Start" }];
  let chess: Chess;
  try {
    chess = new Chess(startingFen);
  } catch {
    return positions;
  }

  moves.forEach((move, index) => {
    const fenBefore = move.fenBefore ?? chess.fen();
    const fenAfter = move.fenAfter ?? fenAfterUci(fenBefore, move.uci);
    if (fenAfter) {
      positions.push({
        index: index + 1,
        fen: fenAfter,
        label: move.san,
        move,
      });
      try {
        chess = new Chess(fenAfter);
      } catch {
        // Keep positions gathered so far if a stale record cannot be replayed.
      }
    }
  });

  return positions;
}

function buildVisibleSequencePositions(params: {
  startingFen: string;
  moves: TrainingMove[];
  initialOpponentMove: TrainingMove | null;
  preludeBeforeFen?: string | null;
}): VisibleSequencePosition[] {
  const positions: VisibleSequencePosition[] = [];
  const userSide = getFenTurnSide(params.startingFen);
  let userMoveIndex = 0;

  // Prelude before-FEN (index 0)
  if (params.preludeBeforeFen) {
    positions.push({
      index: 0,
      fen: params.preludeBeforeFen,
      label: "Before setup move",
    });
  }

  // Prelude after-FEN (index 1, or 0 if no prelude before)
  if (params.initialOpponentMove) {
    positions.push({
      index: positions.length,
      fen: params.startingFen,
      label: params.initialOpponentMove.san,
      move: params.initialOpponentMove,
      pitchIndex: 0,
    });
  } else {
    positions.push({
      index: positions.length,
      fen: params.startingFen,
      label: "Start",
    });
  }

  let chess: Chess;
  try {
    chess = new Chess(params.startingFen);
  } catch {
    return positions;
  }

  params.moves.forEach((move) => {
    const fenBefore = move.fenBefore ?? chess.fen();
    const fenAfter = move.fenAfter ?? fenAfterUci(fenBefore, move.uci);
    if (fenAfter) {
      const positionUserMoveIndex = move.side === userSide ? userMoveIndex : undefined;
      positions.push({
        index: positions.length,
        fen: fenAfter,
        label: move.san,
        move,
        pitchIndex: params.initialOpponentMove ? positions.length - 1 : positions.length,
        userMoveIndex: positionUserMoveIndex,
      });
      if (move.side === userSide) {
        userMoveIndex += 1;
      }
      try {
        chess = new Chess(fenAfter);
      } catch {
        // Keep positions gathered so far if a stale record cannot be replayed.
      }
    }
  });

  return positions;
}

function lastMoveFromTrainingMove(move?: TrainingMove | null) {
  if (!move?.uci || move.uci.length < 4) return null;
  return {
    from: move.uci.slice(0, 2),
    to: move.uci.slice(2, 4),
  };
}

function collectKeyAnalysisFens(startingFen: string, moves: TrainingMove[]) {
  const fens = new Set<string>();
  fens.add(startingFen);

  for (const move of moves) {
    if (move.fenBefore) fens.add(move.fenBefore);
    if (move.fenAfter) fens.add(move.fenAfter);
  }

  return [...fens];
}

function fenAfterUci(fen: string, uci: string) {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return move ? chess.fen() : null;
  } catch {
    return null;
  }
}

function lastMoveForPosition(position?: SequencePosition) {
  const uci = position?.move?.uci;
  if (!uci) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function buildEvalGraphPoints(
  moves: TrainingMove[],
  userSide: TrainingMove["side"],
  startingFen: string,
): EvalGraphPoint[] {
  const points: EvalGraphPoint[] = [];
  let chess: Chess | null = null;
  try {
    chess = new Chess(startingFen);
  } catch {
    chess = null;
  }

  moves.forEach((move, index) => {
    const fenBefore = move.fenBefore ?? chess?.fen();
    if (move.side === userSide) {
      if (points.length === 0 && typeof move.evalBefore === "number") {
        points.push({
          value: graphValueFromEval(move.evalBefore, move.mateBefore),
          positionIndex: index,
          mate: move.mateBefore ?? null,
        });
      }
      if (typeof move.evalAfter === "number") {
        points.push({
          value: graphValueFromEval(move.evalAfter, move.mateAfter),
          positionIndex: index + 1,
          classification: move.classification,
          mate: move.mateAfter ?? null,
        });
      }
    }

    const fenAfter = move.fenAfter ?? (fenBefore ? fenAfterUci(fenBefore, move.uci) : null);
    if (fenAfter) {
      try {
        chess = new Chess(fenAfter);
      } catch {
        chess = null;
      }
    }
  });

  return points;
}

function buildEvalGraphPointsFromCanonical(canonicalMoves: CanonicalPostmortemMove[]): EvalGraphPoint[] {
  const points: EvalGraphPoint[] = [];

  for (const canonicalMove of canonicalMoves) {
    if (!canonicalMove.move || canonicalMove.kind !== "user") continue;
    if (points.length === 0 && typeof canonicalMove.evalBefore === "number") {
      points.push({
        value: graphValueFromEval(canonicalMove.evalBefore, canonicalMove.mateBefore),
        positionIndex: Math.max(0, canonicalMove.positionIndex - 1),
        engineCp: canonicalMove.evalBefore,
        mate: canonicalMove.mateBefore ?? null,
      });
    }

    if (typeof canonicalMove.evalAfter === "number") {
      points.push({
        value: graphValueFromEval(canonicalMove.evalAfter, canonicalMove.mateAfter),
        positionIndex: canonicalMove.positionIndex,
        classification: canonicalMove.chartPoint?.classification,
        engineCp: canonicalMove.evalAfter,
        mate: canonicalMove.mateAfter ?? null,
      });
    }
  }

  return points;
}

function StatusBanner({
  title,
  detail,
  action,
  tone,
  onAction,
}: {
  title: string;
  detail: string;
  action: string;
  tone: "success" | "warning";
  onAction: () => void;
}) {
  const isSuccess = tone === "success";
  return (
    <div
      className="mt-4 flex items-center justify-between gap-4 rounded-[10px] border px-4 py-4"
      style={{
        borderColor: isSuccess ? "rgba(49, 249, 106, 0.52)" : "var(--app-class-mistake-border)",
        background: isSuccess
          ? "linear-gradient(90deg, rgba(49,249,106,0.24), rgba(49,249,106,0.04))"
          : "linear-gradient(90deg, var(--app-class-mistake-soft), rgba(0,0,0,0.12))",
      }}
    >
      <div className="flex items-center gap-3">
        <TargetIcon />
        <div>
          <p className="text-base font-bold text-[var(--app-text)]">{title}</p>
          <p className="text-xs font-bold uppercase text-[var(--app-muted)]">{detail}</p>
        </div>
      </div>
      <button
        type="button"
        className="min-h-10 rounded-full border border-white/80 px-5 text-xs font-bold uppercase text-[var(--app-text)] transition hover:bg-white hover:text-black"
        onClick={onAction}
      >
        {action}
      </button>
    </div>
  );
}

function EloResultCard({ result, isLoading, hideDelta, subtext }: { result: EloResult | null; isLoading: boolean; hideDelta?: boolean; subtext?: string }) {
  if (isLoading && !result) {
    return null;
  }

  if (!result) return null;

  const deltaTone =
    result.eloDelta > 0
      ? "text-[var(--app-class-good)]"
      : result.eloDelta < 0
        ? "text-[var(--app-class-blunder)]"
        : "text-[var(--app-muted)]";
  const signedDelta = result.eloDelta > 0 ? `+${result.eloDelta}` : String(result.eloDelta);

  return (
    <div data-tour="elo-card" className="rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-[var(--pm-card-pad)]">
      <div className="flex items-center">
        <div className="flex flex-wrap items-center gap-2">
          {hideDelta ? (
            <>
              <span className="text-2xl font-bold text-[var(--app-text)] min-[1500px]:text-3xl">{result.eloAfter}</span>
            </>
          ) : (
            <>
              <span className="text-base font-bold text-[var(--app-muted-soft)] min-[1500px]:text-lg">{result.eloBefore}</span>
              <span className="text-base font-bold text-[var(--app-muted-soft)] min-[1500px]:text-lg">→</span>
              <span className="text-2xl font-bold text-[var(--app-text)] min-[1500px]:text-3xl">{result.eloAfter}</span>
              <span className={`text-base font-bold min-[1500px]:text-lg ${deltaTone}`}>{signedDelta}</span>
            </>
          )}
        </div>
      </div>
      {subtext ? (
        <div className="mt-1 text-sm font-bold text-[var(--app-muted-soft)]">{subtext}</div>
      ) : null}
    </div>
  );
}

function CompactEloLine({ result, isLoading }: { result: EloResult | null; isLoading: boolean }) {
  if (isLoading && !result) {
    return (
      <div className="text-sm font-bold text-[var(--app-muted)]">Saving result...</div>
    );
  }

  if (!result) return null;

  const deltaTone =
    result.eloDelta > 0
      ? "text-[var(--app-class-good)]"
      : result.eloDelta < 0
        ? "text-[var(--app-class-blunder)]"
        : "text-[var(--app-muted)]";
  const signedDelta = result.eloDelta > 0 ? `+${result.eloDelta}` : String(result.eloDelta);

  return (
    <div className="flex items-baseline gap-2 text-sm font-bold text-[var(--app-muted)]">
      <span>{result.eloBefore}</span>
      <span>→</span>
      <span>{result.eloAfter}</span>
      <span className={deltaTone}>{signedDelta}</span>
    </div>
  );
}

function engineLineClassification(
  index: number,
  lines: EngineLineResult[],
  fen: string,
): MoveClassification | undefined {
  return classifyRankedMove(index, lines, fen);
}

function engineColorFromFen(fen: string): "w" | "b" {
  return fen.trim().split(/\s+/)[1] === "b" ? "b" : "w";
}

function ResultsPanel({
  eloResult,
  isSaving,
  moves,
  asyncMoveEvaluations,
  userSide,
  startingFen,
  mode,
  positions,
  canonicalMoves,
  currentIndex,
  engineLines,
  currentEngineEval,
  engineEmptyMessage,
  isEngineLinesLoading,
  hasEngineLineError,
  isPieceSelected,
  hoveredAnnotationSquare,
  hoveredEngineLineIndex,
  onEngineLineHover,
  onEngineLineSelect,
  onMoveHover,
  onNavigate,
  selectedMoveIndex,
  selectedMoveUci,
  onSelectMove,
  isManualPostmortemExploration,
  hideDelta,
  subtext,
}: {
  eloResult: EloResult | null;
  isSaving: boolean;
  hideDelta?: boolean;
  subtext?: string;
  moves: TrainingMove[];
  asyncMoveEvaluations: Record<number, { status: "pending" | "done" | "error"; moveScore?: MoveScore; positionEvaluation?: unknown }>;
  userSide: TrainingMove["side"];
  startingFen: string;
  mode: ResultMode;
  positions: SequencePosition[];
  canonicalMoves: CanonicalPostmortemMove[];
  currentIndex: number;
  engineLines: EngineLineResult[];
  currentEngineEval?: number;
  engineEmptyMessage?: string | null;
  isEngineLinesLoading: boolean;
  hasEngineLineError?: boolean;
  isPieceSelected: boolean;
  hoveredAnnotationSquare: string | null;
  hoveredEngineLineIndex: number | null;
  onEngineLineHover: (index: number | null) => void;
  onEngineLineSelect: (move: BoardMove) => void;
  onMoveHover: (move: MoveHighlightTarget | null) => void;
  onNavigate: (index: number) => void;
  selectedMoveIndex: number | null;
  selectedMoveUci: string | null;
  onSelectMove?: (positionIndex: number) => void;
  isManualPostmortemExploration: boolean;
}) {
  const selectedMove =
    selectedMoveIndex != null && selectedMoveIndex > 0 && selectedMoveIndex <= moves.length
      ? moves[selectedMoveIndex - 1]
      : null;
  const userColor = getFenTurnSide(startingFen);
  const selectedMoveOwner =
    selectedMove && userColor
      ? selectedMove.side === userColor ? "user" : "engine"
      : null;
  const userMoves = moves
    .map((move, index) => ({ ...move, absoluteIndex: index }))
    .filter((move) => move.side === userSide);
  const graphPoints = buildEvalGraphPointsFromCanonical(canonicalMoves);

  if (mode === "explore") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-[var(--pm-gap)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        <EloResultCard result={eloResult} isLoading={isSaving} hideDelta={hideDelta} subtext={subtext} />
        <EvalGraph
          points={graphPoints}
          currentIndex={currentIndex}
          compact
          onSelectPosition={onNavigate}
          engineCp={currentEngineEval}
        >
          <div data-tour="engine-lines">
            <EngineLinesSection
              lines={engineLines}
              isLoading={isEngineLinesLoading}
              hasError={hasEngineLineError}
              emptyMessageOverride={engineEmptyMessage}
              revealBadLines={isPieceSelected}
              hoveredDestinationSquare={hoveredAnnotationSquare}
              hoveredIndex={hoveredEngineLineIndex}
              onHoverLine={onEngineLineHover}
              onSelectLine={onEngineLineSelect}
              selectedMoveUci={selectedMoveUci}
              selectedMoveOwner={selectedMoveOwner}
            />
          </div>
        </EvalGraph>
        <AnalysisMoveTable
          moves={userMoves}
          canonicalMoves={canonicalMoves}
          currentIndex={currentIndex}
          selectedMoveIndex={selectedMoveIndex}
          isManualPostmortemExploration={isManualPostmortemExploration}
          isAnalyzing={isSaving}
          compact
          showEvaluations={true}
          onSelectPosition={
            onSelectMove
              ? (index) => onSelectMove(index)
              : undefined
          }
          asyncMoveEvaluations={asyncMoveEvaluations}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--pm-gap)] opacity-80 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
      <EloResultCard result={eloResult} isLoading={isSaving} hideDelta={hideDelta} subtext={subtext} />
      <EvalGraph points={graphPoints} currentIndex={positions.length - 1} compact engineCp={currentEngineEval} />
      <AnalysisMoveTable moves={userMoves} canonicalMoves={canonicalMoves} isAnalyzing={isSaving} compact showEvaluations={true} asyncMoveEvaluations={asyncMoveEvaluations} />
    </div>
  );
}

function EvalGraph({
  points: graphPoints,
  currentIndex,
  compact = false,
  onSelectPosition,
  engineCp,
  children,
}: {
  points: EvalGraphPoint[];
  currentIndex: number;
  compact?: boolean;
  onSelectPosition?: (index: number) => void;
  engineCp?: number;
  children?: ReactNode;
}) {
  const clampedValues = graphPoints.map((point) => Math.max(-EVAL_GRAPH_RANGE, Math.min(EVAL_GRAPH_RANGE, point.value)));
  const rawMinValue = clampedValues.length > 0 ? Math.min(...clampedValues) : -1;
  const rawMaxValue = clampedValues.length > 0 ? Math.max(...clampedValues) : 1;
  const rawSpan = rawMaxValue - rawMinValue;
  const graphSpan = Math.max(rawSpan, MIN_EVAL_GRAPH_SPAN);
  const graphMidpoint = (rawMinValue + rawMaxValue) / 2;
  const graphMinValue = graphMidpoint - graphSpan / 2;
  const graphMaxValue = graphMidpoint + graphSpan / 2;
  const width = 520;
  const height = compact ? 180 : 180;
  const padding = 28;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const points = clampedValues.map((value, index) => {
    const x = padding + (clampedValues.length <= 1 ? 0 : (index / (clampedValues.length - 1)) * usableWidth);
    const y = padding + ((graphMaxValue - value) / graphSpan) * usableHeight;
    return { ...graphPoints[index]!, x, y, value: graphPoints[index]!.value };
  });

  return (
    <div className="grid shrink-0 gap-[var(--pm-gap)]">
      {children ? (
        <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-[var(--pm-card-pad)]">
          {children}
        </div>
      ) : null}
      <div data-tour="eval-graph" className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)]">
        <div className={compact ? "h-[var(--pm-graph-h)]" : "h-32 min-[1500px]:h-40"}>
          {points.length >= 2 ? (
            <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Sequence eval graph">
              {[padding, height / 2, height - padding].map((lineY) => (
                <line
                  key={`guide-${lineY}`}
                  x1={padding}
                  x2={width - padding}
                  y1={lineY}
                  y2={lineY}
                  stroke="color-mix(in srgb, var(--app-border-strong) 16%, transparent)"
                  strokeDasharray="5 6"
                />
              ))}
              {points.slice(1).map((point, index) => {
                const previous = points[index]!;
                const color = classificationColor(point.classification);
                return (
                  <line
                    key={`${point.x}-${point.y}-${index}`}
                    x1={previous.x}
                    y1={previous.y}
                    x2={point.x}
                    y2={point.y}
                    stroke={color}
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                );
              })}
              {points.map((point, index) => (
                <g
                  key={`${point.x}-${point.y}-node`}
                  role={onSelectPosition ? "button" : undefined}
                  tabIndex={onSelectPosition ? 0 : undefined}
                  className={onSelectPosition ? "cursor-pointer outline-none" : ""}
                  onClick={() => onSelectPosition?.(point.positionIndex)}
                  onKeyDown={(event) => {
                    if (!onSelectPosition) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectPosition(point.positionIndex);
                    }
                  }}
                >
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={12}
                    fill="transparent"
                    className={onSelectPosition ? "cursor-pointer" : ""}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={point.positionIndex === currentIndex ? 6 : 4}
                    fill={index === 0 ? "var(--app-muted)" : classificationColor(point.classification)}
                    stroke={point.positionIndex === currentIndex ? "var(--app-text)" : "var(--app-panel-solid)"}
                    strokeWidth={point.positionIndex === currentIndex ? 2.5 : 2}
                    className="pointer-events-none"
                  />
                  <text
                    x={point.x}
                    y={point.y - 9}
                    textAnchor="middle"
                    className="pointer-events-none fill-[var(--app-muted-soft)] text-[11px] font-bold min-[1500px]:text-xs"
                  >
                    {formatEvalLabel(point.value, point.mate)}
                  </text>
                </g>
              ))}
            </svg>
          ) : (
            <div className="grid h-full place-items-center text-xs text-[var(--app-muted)]">
              No eval data here yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalysisMoveTable({
  moves,
  canonicalMoves,
  currentIndex,
  selectedMoveIndex,
  isAnalyzing,
  compact = false,
  showEvaluations = false,
  onSelectPosition,
  onHoverMove,
  asyncMoveEvaluations,
  isManualPostmortemExploration = false,
}: {
  moves: Array<TrainingMove & { absoluteIndex?: number }>;
  canonicalMoves?: CanonicalPostmortemMove[];
  currentIndex?: number;
  selectedMoveIndex?: number | null;
  isAnalyzing?: boolean;
  compact?: boolean;
  showEvaluations?: boolean;
  onSelectPosition?: (index: number) => void;
  onHoverMove?: (move: MoveHighlightTarget | null) => void;
  asyncMoveEvaluations?: Record<number, { status: "pending" | "done" | "error"; moveScore?: MoveScore; positionEvaluation?: unknown }>;
  isManualPostmortemExploration?: boolean;
}) {
  const rowCount = Math.max(1, moves.length);

  return (
    <div
      data-tour="move-table"
      className="flex shrink-0 flex-col overflow-hidden rounded-[8px] border border-[var(--app-border-soft)]"
      style={{ height: `calc(2rem + ${rowCount} * var(--pm-move-row-h))`, minHeight: "8rem" }}
    >
      <div className="grid h-8 shrink-0 grid-cols-[minmax(0,1.1fr)_66px_66px_76px] items-center border-b border-[var(--app-border-soft)] px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted-soft)] min-[1500px]:grid-cols-[minmax(0,1.1fr)_76px_76px_88px] min-[1500px]:text-xs">
        <span>Move</span>
        <span className="text-left">Before</span>
        <span className="text-left">After</span>
        <span className="text-left">Loss</span>
      </div>
      <div className="min-h-0 flex-1">
        {moves.length === 0 ? (
          <div className="px-3 py-4 text-sm text-[var(--app-muted)]">No move grades yet.</div>
        ) : null}
        {moves.map((move, index) => {
        const positionIndex = (move.absoluteIndex ?? index) + 1;
        const canonicalMove = canonicalMoves?.find((entry) => entry.positionIndex === positionIndex) ?? null;
        const canonicalRow = canonicalMove?.tableRow ?? null;
        const isSelected =
          !isManualPostmortemExploration &&
          selectedMoveIndex != null &&
          selectedMoveIndex === positionIndex;
        const isCurrentPosition =
          !isManualPostmortemExploration &&
          currentIndex === positionIndex;
        const pendingValue = isAnalyzing ? "..." : "--";
        const moveScore = asyncMoveEvaluations?.[move.absoluteIndex ?? index]?.moveScore;
        const cpLoss = canonicalRow?.cpLoss ?? move.cpLoss ?? moveScore?.cpLoss;
        const visibleClassification = showEvaluations
          ? classificationFromCpLoss(cpLoss) ?? canonicalRow?.classification ?? getAuthoritativeMoveClassification({ move, moveScore })
          : undefined;
        const evalBefore = canonicalRow?.evalBefore ?? move.evalBefore;
        const evalAfter = canonicalRow?.evalAfter ?? move.evalAfter;
        const mateBefore = canonicalRow?.mateBefore ?? move.mateBefore;
        const mateAfter = canonicalRow?.mateAfter ?? move.mateAfter;
        return (
        <button
          type="button"
          key={`${move.uci}-${index}`}
          className={[
            "grid w-full grid-cols-[minmax(0,1.1fr)_66px_66px_76px] items-center border-b border-[var(--app-border-soft)] px-3 text-left last:border-b-0 min-[1500px]:grid-cols-[minmax(0,1.1fr)_76px_76px_88px]",
            compact ? "h-[var(--pm-move-row-h)] text-sm min-[1500px]:text-base" : "min-h-10 text-sm",
            onSelectPosition ? "cursor-pointer transition" : "cursor-default",
            isCurrentPosition || isSelected ? "bg-[var(--app-highlight-soft)]" : "",
          ].join(" ")}
          disabled={!onSelectPosition}
          onClick={(event) => {
            event.currentTarget.blur();
            onSelectPosition?.(positionIndex);
          }}
          onPointerEnter={() => {
            const squares = moveFromUci(move.uci);
            onHoverMove?.(squares ? { ...squares, classification: canonicalMove?.boardHighlight?.classification ?? visibleClassification } : null);
          }}
          onPointerLeave={() => onHoverMove?.(null)}
        >
          <span className="flex min-w-0 items-center gap-2 font-bold">
            {visibleClassification ? <ClassificationBadge classification={visibleClassification} /> : null}
            <span className="truncate" style={{ color: classificationColor(visibleClassification) }}>
              {move.san}
            </span>
          </span>
          <span className="overflow-hidden whitespace-nowrap text-left tabular-nums text-[var(--app-muted-soft)]">
            {typeof evalBefore === "number" ? formatEvalLabel(evalBefore, mateBefore) : pendingValue}
          </span>
          <span className="overflow-hidden whitespace-nowrap text-left tabular-nums text-[var(--app-muted-soft)]">
            {typeof evalAfter === "number" ? formatEvalLabel(evalAfter, mateAfter) : pendingValue}
          </span>
          <span className="overflow-hidden whitespace-nowrap text-left tabular-nums text-[var(--app-muted-soft)]">
            {showEvaluations ? formatLossLabel(cpLoss, mateAfter) : pendingValue}
          </span>
        </button>
        );
        })}
      </div>
    </div>
  );
}

function MoveList({
  moves,
  userSide,
  isOpponentThinking,
  showHeaders = false,
  showEvaluations = false,
}: {
  moves: TrainingMove[];
  userSide: TrainingMove["side"];
  isOpponentThinking: boolean;
  showHeaders?: boolean;
  showEvaluations?: boolean;
}) {
  // Build rows keyed by fullmove number from fenBefore.
  // White column gets moves where fenBefore turn was "w".
  // Black column gets moves where fenBefore turn was "b".
  const rowsMap = new Map<number, { white?: TrainingMove; black?: TrainingMove; isFirstBlack?: boolean }>();
  for (const move of moves) {
    let moveNumber = 1;
    let wasBlack = false;
    if (move.fenBefore) {
      const parts = move.fenBefore.split(" ");
      moveNumber = parseInt(parts[5] ?? "1", 10);
      wasBlack = parts[1] === "b";
    }
    const side = wasBlack ? "black" : "white";
    if (!rowsMap.has(moveNumber)) {
      rowsMap.set(moveNumber, { [side]: move, ...(side === "black" ? { isFirstBlack: true } : {}) });
    } else {
      const row = rowsMap.get(moveNumber)!;
      row[side] = move;
    }
  }
  const rows = [...rowsMap.entries()].map(([moveNumber, row]) => ({ ...row, moveNumber }));

  return (
    <div className="mt-8 overflow-hidden border-y border-[var(--app-border-soft)] py-2">
      {showHeaders ? (
        <div className="grid min-h-9 grid-cols-[46px_minmax(0,1fr)_minmax(0,1fr)] items-center px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
          <span />
          <span className="pl-8">White</span>
          <span>Black</span>
        </div>
      ) : null}
      {moves.length === 0 ? (
        <p data-testid="train-move-empty" className="py-8 text-center text-sm text-[var(--app-muted)]">No moves yet. That is on you.</p>
      ) : null}
      {rows.map((row, index) => {
        const prefix = row.isFirstBlack ? `${row.moveNumber}... ` : `${row.moveNumber}. `;
        const whiteClassification = showEvaluations ? row.white?.classification : undefined;
        const blackClassification = showEvaluations ? row.black?.classification : undefined;
        return (
          <div
            data-testid="train-move-row"
            key={`${index}-${row.white?.uci ?? ""}-${row.black?.uci ?? ""}`}
            className={[
              "grid min-h-12 grid-cols-[46px_minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-[var(--app-border-soft)] px-2 text-sm last:border-b-0",
              index === rows.length - 1 ? "bg-white/[0.03]" : "",
            ].join(" ")}
          >
            <span data-testid="train-move-row-number" className="text-right text-[var(--app-muted)]">{prefix}</span>
            <span data-testid="train-move-white" className="flex min-w-0 items-center gap-2 pl-8 font-bold">
              {whiteClassification ? <ClassificationBadge classification={whiteClassification} /> : null}
              <span className="truncate" style={{ color: classificationColor(whiteClassification) }}>
                {row.white?.san ?? ""}
              </span>
              {showEvaluations && typeof row.white?.cpLoss === "number" ? (
                <span className={`shrink-0 text-[11px] font-normal tabular-nums ${moveDeltaToneClass(row.white.cpLoss)}`}>
                  {row.white.cpLoss}cp
                </span>
              ) : null}
            </span>
            <span data-testid="train-move-black" className="flex min-w-0 items-center gap-2 font-bold">
              {blackClassification ? <ClassificationBadge classification={blackClassification} /> : null}
              <span className="truncate" style={{ color: classificationColor(blackClassification) }}>
                {row.black?.san ?? ""}
              </span>
              {showEvaluations && typeof row.black?.cpLoss === "number" ? (
                <span className={`shrink-0 text-[11px] font-normal tabular-nums ${moveDeltaToneClass(row.black.cpLoss)}`}>
                  {row.black.cpLoss}cp
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
      {isOpponentThinking ? (
        <div className="grid min-h-12 grid-cols-[46px_minmax(0,1fr)] items-center px-2 text-sm">
          <span />
          <span className="pl-8 font-bold text-[var(--app-muted)]">Opponent thinking...</span>
        </div>
      ) : null}
    </div>
  );
}

type TrainOnboardingIntroStep = {
  headline: string;
  body: string;
  cta?: string;
};

function TrainOnboardingIntroOverlay({
  step,
  totalSteps,
  steps,
  isLoadingFinalStep,
  onNext,
  onBack,
  onSkip,
}: {
  step: number;
  totalSteps: number;
  steps: TrainOnboardingIntroStep[];
  isLoadingFinalStep: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === totalSteps - 1;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onNext();
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
    >
      <div
        className="app-brutal-card relative mx-4 w-[32rem] max-w-[90vw] border-2 p-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Onboarding step ${step + 1} of ${totalSteps}`}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSkip(); }}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
          aria-label="Close onboarding"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="mb-6" />

        <div className="min-h-[170px]">
          <h2 className="mb-3 text-2xl font-bold leading-tight text-[var(--app-text)]">
            {current.headline}
          </h2>
          <p className="mb-8 text-sm leading-7 text-[var(--app-muted)]">
            {current.body}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (!isFirst) onBack(); }}
            aria-disabled={isFirst || isLoadingFinalStep}
            className="min-h-11 border border-[var(--app-border)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--app-muted)] transition hover:border-[var(--app-accent)] hover:text-[var(--app-text)] aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
          >
            Back
          </button>

          {isLast && current.cta ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              className="app-brutal-button min-h-11 px-6 text-xs"
              disabled={isLoadingFinalStep}
            >
              {current.cta}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              className="app-brutal-button min-h-11 px-6 text-xs"
              disabled={isLoadingFinalStep}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function buildEngineArrows(
  lines: EngineLineResult[],
  emphasizedMoveUci: string | null = null,
): EngineArrow[] {
  return lines.map((line, index) => ({
    from: line.bestMove.slice(0, 2),
    to: line.bestMove.slice(2, 4),
    label: formatPostmortemEvalLabel(line.cp, line.mate),
    rank: index + 1,
    emphasis: emphasizedMoveUci === line.bestMove,
    color: classificationColor(line.classification),
  }));
}

function moveFromUci(uci?: string) {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function AttemptRegistryAside({
  entries,
  onNoteSaved,
}: {
  entries: AttemptRegistryEntry[];
  onNoteSaved: (id: string, note: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleExpand(id: string, currentNote: string | null) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setNoteText(currentNote ?? "");
    setSavedId(null);
  }

  async function handleSave(id: string) {
    setSavingId(id);
    try {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      await fetch("/api/train/attempt-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionFen: entry.decisionFen,
          moveUci: entry.moveUci,
          note: noteText,
        }),
      });
      onNoteSaved(id, noteText);
      setSavedId(id);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSavedId(null), 2000);
    } catch {
      // best-effort save
    } finally {
      setSavingId(null);
    }
  }

  return (
    <aside className="app-brutal-section flex min-h-0 flex-col overflow-hidden">
      <h3 className="shrink-0 border-b border-[var(--app-border-soft)] px-3 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-[var(--app-text)]">
        Previous mistakes here
      </h3>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="border-b border-[var(--app-border-soft)] last:border-b-0"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--app-surface-hover)]"
              onClick={() => handleExpand(entry.id, entry.note)}
            >
              <span
                className="font-bold"
                style={{ color: classificationColor(entry.classification as MoveClassification) }}
              >
                {entry.moveSan}
              </span>
              <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--app-muted-soft)]">
                {entry.classification}
              </span>
              <span className={`tabular-nums text-[var(--app-muted-soft)] ${moveDeltaToneClass(entry.cpLoss)}`}>{entry.cpLoss}cp</span>
              <span className="ml-auto shrink-0 text-[10px] text-[var(--app-muted-soft)]">
                {formatRelativeTime(entry.playedAt)}
              </span>
            </button>
            {expandedId === entry.id ? (
              <div className="border-t border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] px-3 py-2">
                <textarea
                  className="min-h-[80px] w-full resize-y rounded-[6px] border border-[var(--app-border)] bg-[var(--app-surface-input)] px-2.5 py-2 text-xs text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)]"
                  placeholder="Add a note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onBlur={() => handleSave(entry.id)}
                  data-ignore-train-shortcuts="true"
                />
                {savingId === entry.id ? (
                  <div className="mt-1 text-[10px] text-[var(--app-muted)]">Saving...</div>
                ) : savedId === entry.id ? (
                  <div className="mt-1 text-[10px] font-bold text-[var(--app-class-good)]">Note saved ✓</div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}

function TrainingNotesRail({
  notes,
  copyFenButton,
  skipButton,
  dashboardButton,
}: {
  notes: NormalizedNote[];
  copyFenButton: ReactNode;
  skipButton: ReactNode;
  dashboardButton: ReactNode;
}) {
  return (
    <aside className="flex min-h-[420px] w-full flex-col rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-solid)] p-4 ring-1 ring-inset ring-[var(--app-border-strong)] lg:min-h-[520px]">
      <div>
        <div className="mb-4 text-xl font-black leading-tight tracking-[-0.03em] text-[var(--app-text)]">
          Notes
        </div>

        {notes.length === 0 ? (
          <div className="mt-2 text-sm text-[var(--app-muted)]">
            N/A
          </div>
        ) : (
          <div className="grid gap-2">
            {notes.map((note, index) => {
              const moveLabel = note.moveSan ?? note.moveUci ?? "Previous mistake";
              const text = note.noteText || "No note text.";
              const evalBefore = note.evalBeforeCp;
              const evalAfter = note.evalAfterCp;
              const moverColor = note.moverColor ?? moverColorFromFen(note.decisionFen);
              const evalDelta =
                evalBefore != null && evalAfter != null ? evalAfter - evalBefore : null;
              const showEvalRow = evalBefore != null || evalAfter != null;

              return (
                <div
                  key={`${note.moveKey || moveLabel}-${index}`}
                  className="grid gap-1 border border-[var(--app-border)] bg-[var(--app-panel-deep)] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-sans text-sm font-semibold text-[var(--app-text)]">
                      {moveLabel}
                    </div>
                    {note.classification ? (
                      <div
                        className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
                        style={{ color: classificationColor(note.classification as MoveClassification) }}
                      >
                        {note.classification}
                      </div>
                    ) : null}
                  </div>
                  {showEvalRow ? (
                    <div className="text-xs text-[var(--app-muted)]">
                      {evalBefore != null && <span>Before: {formatEvalCp(evalBefore)}</span>}
                      {evalBefore != null && evalAfter != null && <span> · </span>}
                      {evalAfter != null && <span>After: {formatEvalCp(evalAfter)}</span>}
                      {evalDelta != null && (
                        <span className={evalDeltaToneClassForMover({ evalBeforeCp: evalBefore, evalAfterCp: evalAfter, moverColor })}>
                          {" · "}Δ {formatEvalCp(evalDelta)}
                        </span>
                      )}
                    </div>
                  ) : null}
                  <div className="font-sans text-sm leading-5 text-[var(--app-text)]">
                    {text}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto grid gap-3 pt-4">
        {copyFenButton}
        {skipButton}
        {dashboardButton}
      </div>
    </aside>
  );
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function TargetIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[var(--app-accent)]"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" /><path d="m15 9-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function KingIcon() {
  return <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-[var(--app-text)]"><path d="M12 3v5M9.5 5.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M7 21h10M8 18h8M8.8 15.5c-1.4-1-2.3-2.6-2.3-4.4A5.5 5.5 0 0 1 12 5.6a5.5 5.5 0 0 1 5.5 5.5c0 1.8-.9 3.4-2.3 4.4H8.8Z" fill="currentColor" /></svg>;
}
