"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chess, type Square } from "chess.js";
import { AnalysisBoard, type BoardMove, type EngineArrow } from "@/components/chess/analysis-board";
import {
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
  engineLineContinuationSan,
  formatClassifiedMoveLead,
  getTrainingBoardHighlights,
  moveHighlightsForClassifiedMove,
  type MoveClassification,
} from "@/lib/training-board-ui";
import {
  buildCanonicalPostmortemMoves,
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
  getEvalBarFill,
  getPostmortemTerminalDisplay,
  whitePositiveMateCp,
} from "@/lib/training/postmortem-terminal-display";
import {
  postMortemNavigationAction,
  type PostMortemNavigationKey,
} from "@/lib/training-postmortem-navigation";
import { runStartTrainingTransition } from "@/lib/train-onboarding-transition";
import {
  buildSessionMistakeMemories,
  createEmptyPositionMemory,
  normalizeDecisionFen,
  selectFailedMove,
  updateNoteBlock,
  appendBoardSnapshot,
  isFailedClassification,
  type PositionMistakeMemory,
  type MistakeMoveMemory,
} from "@/lib/training/mistake-memory";
import { MistakeMemoryPanel } from "@/components/train/mistake-memory-panel";

type TrainingState = "active" | "complete" | "drift" | "resolving";
type OnboardingScreen = "loading" | "connect" | "analysis" | "summary" | "done";
type ProfileProvider = "chesscom" | "lichess";
type SkillLevel = "new_to_chess" | "beginner" | "intermediate" | "advanced" | "expert";

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
};

type VisibleSequencePosition = {
  index: number;
  fen: string;
  label: string;
  move?: TrainingMove;
  pitchIndex?: number;
  userMoveIndex?: number;
};

type EngineLineResult = {
  cp: number;
  mate?: number | null;
  depth: number;
  rank: number;
  bestMove: string;
  bestSan: string;
  pv: string[];
  pvSan: string[];
  continuationSan?: string[];
  classification?: MoveClassification;
  source?: "multipv" | "candidate";
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

const postmortemActionTextClassName = "text-center text-xs font-bold uppercase leading-none tracking-[0.12em]";
const primaryActionClassName =
  `app-brutal-button inline-flex min-h-11 min-w-0 items-center justify-center px-4 py-3 text-sm`;
const secondaryActionClassName =
  `inline-flex min-h-11 min-w-0 items-center justify-center rounded-[8px] border border-[#050505] bg-[var(--app-panel-solid)] px-3 py-3 text-sm font-bold uppercase tracking-[0.04em] text-[var(--app-text)] shadow-[3px_3px_0_#050505] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_#050505] sm:px-4`;

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

export default function TrainPage() {
  const [state, setState] = useState<TrainingState>("active");
  const [startingFen, setStartingFen] = useState<string>("");
  const [fen, setFen] = useState<string>(DEFAULT_TRAINING_FEN);
  const [moves, setMoves] = useState<TrainingMove[]>(mockRep.moveHistory);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [sequenceLength, _setSequenceLength] = useState(4);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("beginner");
  const [blindspotsElo, setBlindspotsElo] = useState(mockRep.rating);
  const [eloResult, setEloResult] = useState<EloResult | null>(null);
  const [resultMode, setResultMode] = useState<ResultMode>("results");
  const [exploreIndex, setExploreIndex] = useState(0);
  const [exploratoryFen, setExploratoryFen] = useState<string | null>(null);
  const [exploratoryLastMove, setExploratoryLastMove] = useState<{ from: string; to: string } | null>(null);
  const [exploratoryHistory, setExploratoryHistory] = useState<ExploratoryPosition[]>([]);
  const [exploratoryHistoryIndex, setExploratoryHistoryIndex] = useState(-1);
  const [exploreSelectedSquare, setExploreSelectedSquare] = useState<string | null>(null);
  const [selectedMoveIndex, setSelectedMoveIndex] = useState<number | null>(null);
  const [isManualPostmortemExploration, setIsManualPostmortemExploration] = useState(false);
  const [engineLineCache, setEngineLineCache] = useState<Record<string, EngineLineResult[]>>({});
  const [engineLineErrorFens, setEngineLineErrorFens] = useState<Set<string>>(new Set());
  const [engineLineLoadingFen, setEngineLineLoadingFen] = useState<string | null>(null);
  const [cachedNextPosition, setCachedNextPosition] = useState<NextPositionResponse | null>(null);
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
  const completingRef = useRef(false);
  const completionRequestRef = useRef(0);
  const initialOpponentMoveRef = useRef<TrainingMove | null>(null);
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
  const [mistakeMemories, setMistakeMemories] = useState<Record<string, PositionMistakeMemory>>({});
  const seededMistakeFensRef = useRef<Set<string>>(new Set());
  const sessionNewMoveUcisRef = useRef<Set<string>>(new Set());
  const [postmortemSidePanel, setPostmortemSidePanel] = useState<"analysis" | "memory">("analysis");

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

        if (payload.shouldShowOnboarding) {
          setOnboardingScreen("connect");
        } else {
          setOnboardingScreen("done");
          void loadNextPosition();
        }
      } catch {
        if (alive) setOnboardingScreen("connect");
      }
    }

    void loadOnboardingState();

    return () => {
      alive = false;
    };
  }, []);

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
      fen,
      boardFen: fen,
      currentFen: fen,
      isAwaitingStartGesture,
      pendingInitialEngineMove: pendingInitialEngineMove
        ? {
            previousFen: pendingInitialEngineMove.previousFen,
            playedMove: pendingInitialEngineMove.playedMove,
            fen: pendingInitialEngineMove.fen,
          }
        : null,
    };
  }, [fen, isAwaitingStartGesture, pendingInitialEngineMove]);

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
    seededMistakeFensRef.current.clear();
    sessionNewMoveUcisRef.current.clear();
    setMistakeMemories({});
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

  async function loadNextPosition() {
    const cachedPosition = cachedNextPosition;
    if (cachedPosition?.fen) {
      setCachedNextPosition(null);
      nextPositionPrefetchRef.current = null;
      applyNextPosition(cachedPosition);
      setIsPositionLoading(false);
      return;
    }

    const pendingPrefetch = nextPositionPrefetchRef.current;
    if (!pendingPrefetch) {
      setCurrentChallengeElo(null);
      setHasLoadedPosition(false);
      setIsPositionLoading(true);
    }

    try {
      const payload = pendingPrefetch
        ? await pendingPrefetch
        : await fetchNextPosition();
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

      applyNextPosition(payload);
    } finally {
      setIsPositionLoading(false);
    }
  }

  async function fetchNextPosition() {
    const response = await fetch("/api/train/next-position", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as NextPositionResponse | null;
    if (!response.ok || !payload?.fen) return null;
    return payload;
  }

  function applyNextPosition(payload: NextPositionResponse) {
    if (!payload.fen) return;

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

    completingRef.current = false;
    initialOpponentMoveRef.current = null;
    setInitialOpponentMove(null);
    setActiveSetupReplayIndex(1);
    moveSoundPlyRef.current = 0;
    setPositionLoadError(null);

    const visibleInitialFen = payload.previousFen ?? payload.fen;
    setStartingFen(payload.fen);
    setDisplayStartingFen(visibleInitialFen);
    setFen(visibleInitialFen);
    setHasLoadedPosition(true);
    setMoves([]);
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

      if (startTrainingGestureConsumedRef.current) {
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

    await unlockTrainAudio();
    await primeTrainAudio();
    await playInitialOpponentMoveFromPayload(pending);
  }

  async function playInitialOpponentMoveFromPayload(payload: NextPositionResponse) {
    const requestId = initialOpponentRequestRef.current + 1;
    initialOpponentRequestRef.current = requestId;

    initialOpponentMoveRef.current = null;
    setInitialOpponentMove(null);

    const previousFen = payload.previousFen!;
    const playedMove = payload.playedMove!;

    const applied = applyIndexedMove(previousFen, playedMove);
    if (!applied) return;

    if (process.env.NODE_ENV !== "production") {
      console.log("[train-setup-move]", { previousFen, playedMove, fen: payload.fen, san: applied.move.san, uci: applied.move.uci, from: applied.lastMove.from, to: applied.lastMove.to });
    }

    initialOpponentMoveRef.current = applied.move;

    setIsOpponentThinking(true);

    // Show the "before" position briefly.
    setFen(previousFen);
    await nextAnimationFrame();
    await delayMs(PRELUDE_SETUP_MOVE_DELAY_MS);

    if (initialOpponentRequestRef.current !== requestId) return;

    // Apply the move, sound, and visual transition together — synchronized.
    setActiveSetupReplayIndex(1);
    setInitialOpponentMove(applied.move);
    setExploreSelectedSquare(null);
    setLastMove(applied.lastMove);
    setFen(payload.fen!);
    playTrainMoveSound({ move: applied.move, plyRef: moveSoundPlyRef, source: "initial-engine", advanceLivePitch: false });

    if (initialOpponentRequestRef.current === requestId) {
      setIsOpponentThinking(false);
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
    if (isActiveSetupReplay && activeSetupReplayIndex === 0) return;
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
        timeoutMs: 2500,
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

  const rating = state === "complete" ? (eloResult?.eloAfter ?? blindspotsElo) : blindspotsElo;
  const userMoveSide = getFenTurnSide(startingFen);
  const boardOrientation = userMoveSide;
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

  // ── Mistake memory: seed from session evaluations ───────────────────
  // Build a map from session data. Only seeds once per (normalized) FEN;
  // user edits (notes, snapshots, selection) are not overwritten.
  useEffect(() => {
    if (!isPostMortemVisible) return;

    const sessionMemories: Record<string, PositionMistakeMemory> = {};

    for (const pos of visibleSequencePositions) {
      if (pos.userMoveIndex == null || !pos.move?.fenBefore) continue;
      const classification = getAuthoritativeMoveClassification({
        move: pos.move,
        moveScore: completedMoveScoreByUserMoveIndex.get(pos.userMoveIndex),
      });
      if (!isFailedClassification(classification)) continue;

      const normFen = normalizeDecisionFen(pos.move.fenBefore);
      if (seededMistakeFensRef.current.has(`${normFen}::${pos.move.uci}`)) continue;

      const existing = sessionMemories[normFen] ?? mistakeMemories[normFen] ?? createEmptyPositionMemory(pos.move.fenBefore);
      sessionMemories[normFen] = {
        decisionFen: existing.decisionFen,
        failedMoves: (() => {
          const moveIdx = existing.failedMoves.findIndex((m) => m.uci === pos.move!.uci);
          if (moveIdx >= 0) return existing.failedMoves; // Already present
          return [
            ...existing.failedMoves,
            {
              uci: pos.move.uci,
              san: pos.move.san,
              classification,
              cpLoss: pos.move.cpLoss,
              evalBefore: pos.move.evalBefore ?? null,
              evalAfter: pos.move.evalAfter ?? null,
              mateBefore: pos.move.mateBefore ?? null,
              mateAfter: pos.move.mateAfter ?? null,
              attemptCount: 1,
              firstAttemptedAt: new Date().toISOString(),
              lastAttemptedAt: new Date().toISOString(),
              notes: [],
            } satisfies MistakeMoveMemory,
          ];
        })(),
        selectedFailedMoveUci: existing.selectedFailedMoveUci,
      };
      if (existing.failedMoves.findIndex((m) => m.uci === pos.move!.uci) < 0) {
        sessionNewMoveUcisRef.current.add(pos.move!.uci);
      }
      seededMistakeFensRef.current.add(`${normFen}::${pos.move!.uci}`);
    }

    if (Object.keys(sessionMemories).length > 0) {
      setMistakeMemories((prev) => ({ ...prev, ...sessionMemories }));
    }
  }, [isPostMortemVisible, visibleSequencePositions, completedMoveScoreByUserMoveIndex]);

  // Derive the active decision FEN from the currently selected/stepped position.
  const activeDecisionFen = useMemo<string | null>(() => {
    if (!isPostMortemVisible) return null;
    const pos = visibleSequencePositions[activeExploreIndex];
    if (!pos?.move?.fenBefore) return null;
    return normalizeDecisionFen(pos.move.fenBefore);
  }, [isPostMortemVisible, activeExploreIndex, visibleSequencePositions]);

  const activeMistakeMemory = useMemo<PositionMistakeMemory | null>(() => {
    if (!activeDecisionFen) return null;
    const mem = mistakeMemories[activeDecisionFen];
    return mem
      ? {
          ...mem,
          selectedFailedMoveUci: mem.selectedFailedMoveUci ?? mem.failedMoves[0]?.uci,
        }
      : null;
  }, [activeDecisionFen, mistakeMemories]);

  function handleSelectFailedMove(uci: string) {
    if (!activeDecisionFen) return;
    if (process.env.NODE_ENV !== "production") {
      console.log("[mistake-memory] select-failed-move", uci);
    }
    setMistakeMemories((prev) => {
      const mem = prev[activeDecisionFen];
      if (!mem) return prev;
      return { ...prev, [activeDecisionFen]: selectFailedMove(mem, uci) };
    });
  }

  function handleUpdateNote(uci: string, text: string) {
    if (!activeDecisionFen) return;
    if (process.env.NODE_ENV !== "production") {
      console.log("[mistake-memory] update-note", activeDecisionFen, uci);
    }
    setMistakeMemories((prev) => {
      const mem = prev[activeDecisionFen];
      if (!mem) return prev;
      return { ...prev, [activeDecisionFen]: updateNoteBlock(mem, uci, text) };
    });
  }

  function handleAddBoardSnapshot(uci: string) {
    if (!activeDecisionFen) return;
    if (process.env.NODE_ENV !== "production") {
      console.log("[mistake-memory] add-board-snapshot", activeDecisionFen, uci, boardFen);
    }
    setMistakeMemories((prev) => {
      const mem = prev[activeDecisionFen];
      if (!mem) return prev;
      return {
        ...prev,
        [activeDecisionFen]: appendBoardSnapshot(mem, uci, {
          fen: boardFen,
          lastMove: replayLastMove ?? undefined,
          orientation: boardOrientation,
        }),
      };
    });
  }

  function handleHoverFailedMove(from: string, to: string) {
    setHoveredMoveSquares({ from, to });
  }

  function handleHoverFailedMoveEnd() {
    setHoveredMoveSquares(null);
  }

  // Dev-only: log active position changes
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (activeDecisionFen) {
      console.log("[mistake-memory] active-position", activeDecisionFen);
    }
  }, [activeDecisionFen]);

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

  const isExploringResults = state === "complete" && resultMode === "explore";
  const isActiveSetupReplay =
    state === "active" &&
    !!initialOpponentMove &&
    moves.length === 0;

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
    () => displayLines.map((line, index) => ({
      ...line,
      classification: line.classification ?? engineLineClassification(index, displayLines, boardFen),
    })),
    [boardFen, displayLines],
  );
  const boardEngineLines = effectiveExploreSelectedSquare
    ? classifiedDisplayLines
    : classifiedDisplayLines.filter((line) => isRecommendableClassification(line.classification));
  const hoveredEngineLineMove =
    hoveredEngineLineIndex == null ? null : classifiedDisplayLines[hoveredEngineLineIndex]?.bestMove ?? null;
  const terminalBoardDisplay = useMemo(
    () => getPostmortemTerminalDisplay(boardFen),
    [boardFen],
  );
  const currentEngineEval = currentEngineLines[0]?.cp ?? terminalBoardDisplay.evalCp ?? undefined;
  const currentEngineMate = currentEngineLines[0]?.mate ?? terminalBoardDisplay.evalMate ?? null;
  const currentEngineMateCp = whitePositiveMateCp(boardFen, currentEngineMate, currentEngineEval);
  const boardFrameClassName = [
    "app-brutal-board-frame relative max-w-full overflow-visible",
    isExploringResults
      ? "w-[min(88vw,calc(100dvh-10.25rem),836px)]"
      : "w-[min(82vw,calc(100dvh-12.5rem),800px)]",
  ].join(" ");
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

      const action = postMortemNavigationAction({
        key: event.key as PostMortemNavigationKey,
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
        if (activeSetupReplayIndex === 1) {
          setActiveSetupReplayIndex(0);
        }
      } else if (event.key === "ArrowRight" || event.key === "End") {
        if (activeSetupReplayIndex === 0) {
          setActiveSetupReplayIndex(1);
          if (initialOpponentMove) {
            playTrainMoveSound({ move: initialOpponentMove, pitchIndex: 0, advanceLivePitch: false, source: "replay" });
          }
        }
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

      const positions = visibleSequencePositions;
      if (positions.length <= 1) return;

      const liveLastIndex = positions.length - 1;
      const currentIndex = activeReplayIndex ?? liveLastIndex;

      const nextIndex =
        e.key === "ArrowLeft"
          ? Math.max(0, currentIndex - 1)
          : Math.min(liveLastIndex, currentIndex + 1);

      if (nextIndex === currentIndex) return;

      e.preventDefault();
      e.stopPropagation();

      const nextPosition = positions[nextIndex];
      setIsManualPostmortemExploration(false);
      setActiveReplayIndex(nextIndex === liveLastIndex ? null : nextIndex);

      if (e.key === "ArrowRight" && nextPosition?.move) {
        playTrainMoveSound({
          move: nextPosition.move,
          plyRef: moveSoundPlyRef,
          pitchIndex: nextPosition.pitchIndex,
          source: "replay",
          advanceLivePitch: false,
        });
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
    <div className="-mx-4 -mb-4 flex h-full min-h-0 w-[calc(100%+2rem)] flex-1 overflow-hidden px-3 py-3 md:-mx-6 md:w-[calc(100%+3rem)]">
      <div
        ref={trainLayoutGridRef}
        data-train-layout-state={isPostMortemVisible ? "results" : "playing"}
        className={[
          "mx-auto grid h-full min-h-0 w-full max-w-[100rem] min-w-0 gap-4 transition-opacity duration-200",
          isPostMortemVisible
            ? "lg:grid-cols-[minmax(0,1.22fr)_minmax(28rem,0.92fr)] lg:items-stretch"
            : "lg:grid-cols-1 lg:items-center lg:justify-items-center",
        ].join(" ")}
      >
        <section
          className={[
            "app-brutal-section flex min-h-0 min-w-0 items-center justify-center overflow-hidden p-3 sm:p-4 lg:p-4",
            isPostMortemVisible ? "" : "lg:w-fit lg:justify-self-center",
          ].join(" ")}
        >
          <div className="flex min-h-0 min-w-0 items-center justify-center">
            <div className={boardFrameClassName}>
              {boardFen ? (
                <>
                  <BoardWithPlayerStrips
                    userSide={userMoveSide}
                    boardFen={boardFen ?? ""}
                    isOpponentThinking={isOpponentThinking}
                    isTrainingActive={state === "active"}
                    isExploring={isExploringResults}
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
                        disabled={isPositionLoading || !hasLoadedPosition || state !== "active" || isOpponentThinking || isAwaitingStartGesture || (isActiveSetupReplay && activeSetupReplayIndex === 0)}
                        annotationsDisabled={false}
                        highlightedSquares={getTrainingBoardHighlights(state)}
                        onMove={handleMove}
                        dataTestId="train-board"
                      />
                    )}
                  </BoardWithPlayerStrips>
                  {isAwaitingStartGesture ? (
                    <div
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[10px] bg-black/70 backdrop-blur-sm"
                      data-testid="audio-unlock-overlay"
                    >
                      <p className="text-sm font-bold uppercase tracking-[0.18em] text-white">
                        Press any key or click the board to start
                      </p>
                    </div>
                  ) : null}
                  {isPositionLoading || state === "resolving" ? (
                    <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-black/20">
                      <div className="app-brutal-section-soft flex flex-col items-center gap-2 px-4 py-3 text-center">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--app-text)]">
                          {state === "resolving" ? "Sequence complete" : <LoadingPositionText />}
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
                  Finding something you mishandle...
                </div>
              )}
            </div>
          </div>
        </section>

        {isPostMortemVisible ? (
          <aside
            data-testid="train-move-panel"
            className={[
              "app-brutal-section flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden",
              resultMode === "results" ? "p-3 sm:p-4" : "p-3 sm:p-4",
            ].join(" ")}
          >
            {/* ── Compact toggle: Analysis | Mistake Memory ───────────────── */}
            <div className="inline-flex justify-center w-full gap-1">
              {(["analysis", "memory"] as const).map((item) => {
                const active = postmortemSidePanel === item;
                return (
                  <button
                    key={item}
                    type="button"
                    className={[
                      "inline-flex items-center border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition",
                      active
                        ? "relative z-10 border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                        : "cursor-pointer border-[var(--app-border)] bg-transparent text-[var(--app-muted)] hover:border-[var(--app-accent)] hover:text-[var(--app-text)]",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--app-accent)]",
                    ].join(" ")}
                    onClick={() => setPostmortemSidePanel(item)}
                  >
                    {item === "analysis" ? "Analysis" : "Mistake Memory"}
                    {item === "memory" && activeMistakeMemory && activeMistakeMemory.failedMoves.length > 0 ? (
                      <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--app-class-blunder)] px-1 text-[9px] font-bold leading-none text-white">
                        {activeMistakeMemory.failedMoves.length}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* ── Panel content ───────────────────────────────────────────── */}
            <div className="train-postmortem-panel flex min-h-0 flex-1 flex-col gap-4">
              {postmortemSidePanel === "analysis" ? (
                <ResultsPanel
                eloResult={eloResult}
                isSaving={isCompletingSequence}
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
                <MistakeMemoryPanel
                  memory={activeMistakeMemory}
                  onSelectFailedMove={handleSelectFailedMove}
                  onUpdateNote={handleUpdateNote}
                  onAddBoardSnapshot={handleAddBoardSnapshot}
                  boardFen={boardFen}
                  boardOrientation={boardOrientation}
                  boardLastMove={replayLastMove}
                  newMoveUcis={sessionNewMoveUcisRef.current}
                />
              )}
            </div>

            {/* ── Action buttons visible below both tabs ────────────────── */}
            <div className="mt-auto grid grid-cols-2 gap-2 pt-1 shrink-0">
              <button
                type="button"
                className={`${primaryActionClassName} w-full`}
                onClick={() => switchState("active")}
              >
                Next position
              </button>
              <a href="/" className={`${secondaryActionClassName} w-full`}>
                Return to Dashboard
              </a>
            </div>
          </aside>
        ) : null}
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
              className={[
                "mx-auto min-h-12 cursor-pointer rounded-[8px] border border-[var(--app-accent)] bg-[var(--app-accent)] px-6 text-sm font-bold uppercase tracking-[0.12em] !text-black transition",
                "hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]",
                isStartingTraining
                  ? "cursor-wait opacity-70"
                  : "",
              ].join(" ")}
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
  children,
}: {
  userSide: TrainingMove["side"];
  boardFen: string;
  isOpponentThinking: boolean;
  isTrainingActive: boolean;
  isExploring: boolean;
  children: import("react").ReactNode;
}) {
  const opponentSide = userSide === "white" ? "black" : "white";
  const userLabel = userSide === "white" ? "White" : "Black";
  const opponentLabel = userSide === "white" ? "Black" : "White";

  let isUserActive = false;
  let isOpponentActive = false;

  if (isExploring) {
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

function LoadingPositionText() {
  return (
    <span aria-label="Loading position">
      Loading position
      <span className="train-loading-dots" aria-hidden="true">
        <span className="train-loading-dot" />
        <span className="train-loading-dot" />
        <span className="train-loading-dot" />
      </span>
    </span>
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
}): VisibleSequencePosition[] {
  const positions: VisibleSequencePosition[] = [];
  const userSide = getFenTurnSide(params.startingFen);
  let userMoveIndex = 0;

  if (params.initialOpponentMove) {
    positions.push({
      index: 0,
      fen: params.startingFen,
      label: params.initialOpponentMove.san,
      move: params.initialOpponentMove,
      pitchIndex: 0,
    });
  } else {
    positions.push({
      index: 0,
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

function EloResultCard({ result, isLoading }: { result: EloResult | null; isLoading: boolean }) {
  if (isLoading && !result) {
    return (
      <div className="flex items-center rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-5">
        <p className="text-lg font-bold text-[var(--app-muted)]">Saving result...</p>
      </div>
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
    <div className="rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-5">
      <div className="flex items-center">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xl font-bold text-[var(--app-muted)]">{result.eloBefore}</span>
          <span className="text-lg font-bold text-[var(--app-muted)]">→</span>
          <span className="text-3xl font-bold text-[var(--app-text)]">{result.eloAfter}</span>
          <span className={`text-xl font-bold ${deltaTone}`}>{signedDelta}</span>
        </div>
      </div>
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

function engineLineColor(cls: MoveClassification | undefined): string {
  return classificationColor(cls);
}

function EngineLinesSection({
  lines,
  isLoading,
  hasError = false,
  emptyMessageOverride,
  revealBadLines = false,
  hoveredDestinationSquare,
  hoveredIndex,
  onHoverLine,
  onSelectLine,
  selectedMoveUci,
}: {
  lines: EngineLineResult[];
  isLoading: boolean;
  hasError?: boolean;
  emptyMessageOverride?: string | null;
  revealBadLines?: boolean;
  hoveredDestinationSquare?: string | null;
  hoveredIndex?: number | null;
  onHoverLine?: (index: number | null) => void;
  onSelectLine?: (move: BoardMove) => void;
  selectedMoveUci?: string | null;
}) {
  const emptyMessage = isLoading
    ? "Receiving engine lines..."
    : emptyMessageOverride
      ? emptyMessageOverride
      : hasError
      ? "No engine lines yet."
      : "Engine lines unavailable";
  const displayRows: Array<EngineLineResult | null> = Array.from({ length: 5 }, (_, index) => lines[index] ?? null);
  return (
    <section className="grid gap-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
          Engine lines
        </h2>
      </div>
      <div className={["grid gap-2", isLoading ? "opacity-60" : ""].join(" ")}>
        {displayRows.map((line, index) => {
          if (!line) {
            const shouldShowEmptyMessage = index === 0 && lines.length === 0 && !isLoading;
            return (
              <div
                key={`engine-placeholder-${index}`}
                aria-hidden="true"
                className={[
                  "min-h-[38px] rounded-none border border-dashed border-[var(--app-border-soft)] bg-transparent",
                  shouldShowEmptyMessage
                    ? "flex items-center px-3 text-xs font-bold text-[var(--app-muted)] opacity-100"
                    : "opacity-45",
                ].join(" ")}
              >
                {shouldShowEmptyMessage ? emptyMessage : null}
              </div>
            );
          }

          const lead = line.bestSan || line.bestMove;
          const pv = engineLineContinuationSan(line);
          const cls = line.classification;
          const lineColor = engineLineColor(cls);
          const isBlurred = !revealBadLines && !isRecommendableClassification(cls);
          const isHovered =
            hoveredIndex === index ||
            (hoveredDestinationSquare ? line.bestMove.slice(2, 4) === hoveredDestinationSquare : false);
          const isSelectedUserMove = selectedMoveUci ? line.bestMove === selectedMoveUci : false;
          return (
            <div
              key={`${line.rank}-${line.bestMove}-${index}`}
              className="relative cursor-pointer overflow-hidden rounded-none border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] py-2 pl-2.5 pr-3 transition-colors duration-100"
              style={{
                borderLeftColor: lineColor,
                borderLeftWidth: 3,
                background: isHovered ? "color-mix(in srgb, var(--app-accent) 6%, var(--app-surface-subtle))" : undefined,
                filter: isBlurred ? "blur(2px)" : undefined,
                opacity: isBlurred ? 0.48 : undefined,
              }}
              onPointerEnter={() => onHoverLine?.(index)}
              onPointerLeave={() => onHoverLine?.(null)}
              onClick={() => onSelectLine?.({ from: line.bestMove.slice(0, 2), to: line.bestMove.slice(2, 4) })}
            >
              <div className="grid grid-cols-[22px_auto_auto_auto_minmax(0,1fr)_auto_auto] items-center gap-2">
                <span className="text-right text-xs font-black leading-none text-[var(--app-text)]">
                  #{index + 1}
                </span>
                {cls && !isSelectedUserMove ? (
                  <ClassificationBadge classification={cls} />
                ) : <span />}
                <span className="text-xs font-black tabular-nums text-[var(--app-text)]">
                  {formatPostmortemEvalLabel(line.cp, line.mate)}
                </span>
                <strong className="min-w-0 truncate text-base font-black leading-none text-[var(--app-text)]">
                  {lead}
                </strong>
                <span className="min-w-0 truncate text-xs font-bold text-[var(--app-muted)]">
                  {pv}
                </span>
                {isSelectedUserMove ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--app-accent)]">
                    Your move
                  </span>
                ) : line.source === "candidate" ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--app-muted-soft)]">
                    candidate
                  </span>
                ) : null}
                <span className="justify-self-end text-[10px] font-bold tabular-nums text-[var(--app-muted-soft)]">
                  {line.depth || 18}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BoardWithEvalBar({
  evalCp,
  evalMate,
  evalMateCp,
  isLoading,
  orientation,
  children,
}: {
  evalCp?: number;
  evalMate?: number | null;
  evalMateCp?: number | null;
  isLoading: boolean;
  orientation: "white" | "black";
  children: ReactNode;
}) {
  const [lastEval, setLastEval] = useState<{ cp: number | null; mate: number | null; mateCp: number | null }>({
    cp: null,
    mate: null,
    mateCp: null,
  });

  useEffect(() => {
    if (typeof evalCp === "number" || typeof evalMate === "number") {
      setLastEval({
        cp: typeof evalCp === "number" ? evalCp : null,
        mate: typeof evalMate === "number" ? evalMate : null,
        mateCp: typeof evalMateCp === "number" ? evalMateCp : null,
      });
    }
  }, [evalCp, evalMate, evalMateCp]);

  const displayEvalCp = typeof evalCp === "number" ? evalCp : isLoading ? lastEval.cp : null;
  const displayEvalMate = typeof evalMate === "number" ? evalMate : isLoading ? lastEval.mate : null;
  const displayEvalMateCp = typeof evalMateCp === "number" ? evalMateCp : isLoading ? lastEval.mateCp : null;
  const { whitePct, blackPct, decisiveSide } = getEvalBarFill(displayEvalCp, displayEvalMate, displayEvalMateCp);

  // Determine which side is top/bottom based on board orientation
  const topSide = orientation === "white" ? "black" : "white";
  const bottomSide = orientation === "white" ? "white" : "black";

  const topPct = topSide === "white" ? whitePct : blackPct;
  const bottomPct = bottomSide === "white" ? whitePct : blackPct;

  return (
    <div className="relative w-full overflow-visible pl-9">
      <div className="pointer-events-none absolute left-0 top-0 h-full w-6 shrink-0">
        <div className="relative h-full overflow-hidden rounded-[4px] border border-[var(--app-border-soft)] bg-black">
          <div
            className={[
              "absolute left-0 right-0 top-0 transition-[height] duration-200",
              topSide === "white" ? "bg-white" : "bg-black",
            ].join(" ")}
            style={{ height: `${topPct}%` }}
          />
          <div
            className={[
              "absolute left-0 right-0 bottom-0 transition-[height] duration-200",
              bottomSide === "white" ? "bg-white" : "bg-black",
            ].join(" ")}
            style={{ height: `${bottomPct}%` }}
          />
          <span
            className={[
              "absolute inset-x-0 top-1 text-center text-[9px] font-bold",
              decisiveSide === "white"
                ? "text-black"
                : decisiveSide === "black"
                  ? "text-white"
                  : topSide === "white" ? "text-black" : "text-white",
            ].join(" ")}
          >
            {typeof displayEvalCp === "number" || typeof displayEvalMate === "number"
              ? formatPostmortemEvalLabel(displayEvalCp, displayEvalMate)
              : isLoading ? "..." : "--"}
          </span>
        </div>
      </div>

      {children}
    </div>
  );
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
}: {
  eloResult: EloResult | null;
  isSaving: boolean;
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
  const userMoves = moves
    .map((move, index) => ({ ...move, absoluteIndex: index }))
    .filter((move) => move.side === userSide);
  const graphPoints = buildEvalGraphPointsFromCanonical(canonicalMoves);

  if (mode === "explore") {
    return (
      <div className="flex flex-1 flex-col gap-4 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        <EloResultCard result={eloResult} isLoading={isSaving} />
        <EvalGraph
          points={graphPoints}
          currentIndex={currentIndex}
          compact
          onSelectPosition={onNavigate}
          engineCp={currentEngineEval}
        >
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
          />
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
    <div className="flex flex-1 flex-col gap-4 opacity-80 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
      <EloResultCard result={eloResult} isLoading={isSaving} />
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
  const height = compact ? 140 : 160;
  const padding = 28;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const points = clampedValues.map((value, index) => {
    const x = padding + (clampedValues.length <= 1 ? 0 : (index / (clampedValues.length - 1)) * usableWidth);
    const y = padding + ((graphMaxValue - value) / graphSpan) * usableHeight;
    return { ...graphPoints[index]!, x, y, value: graphPoints[index]!.value };
  });

  return (
    <div className="grid gap-2">
      {children ? (
        <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-3">
          {children}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)]">
        <div className={compact ? "h-36" : "h-40"}>
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
                    className="pointer-events-none fill-[var(--app-muted)] text-[9px] font-bold"
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
  return (
    <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)]">
      <div className="grid min-h-8 grid-cols-[minmax(0,1.1fr)_68px_68px_76px] items-center border-b border-[var(--app-border-soft)] px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
        <span>Move</span>
        <span className="text-left">Before</span>
        <span className="text-left">After</span>
        <span className="text-left">Loss</span>
      </div>
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
        const visibleClassification = showEvaluations
          ? canonicalRow?.classification ?? getAuthoritativeMoveClassification({ move, moveScore })
          : undefined;
        const evalBefore = canonicalRow?.evalBefore ?? move.evalBefore;
        const evalAfter = canonicalRow?.evalAfter ?? move.evalAfter;
        const mateBefore = canonicalRow?.mateBefore ?? move.mateBefore;
        const mateAfter = canonicalRow?.mateAfter ?? move.mateAfter;
        const cpLoss = canonicalRow?.cpLoss ?? move.cpLoss;
        return (
        <button
          type="button"
          key={`${move.uci}-${index}`}
          className={[
            "grid w-full grid-cols-[minmax(0,1.1fr)_68px_68px_76px] items-center border-b border-[var(--app-border-soft)] px-3 text-left last:border-b-0",
            compact ? "min-h-9 text-xs" : "min-h-10 text-sm",
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
          <span className="overflow-hidden whitespace-nowrap text-left tabular-nums text-[var(--app-muted)]">
            {typeof evalBefore === "number" ? formatEvalLabel(evalBefore, mateBefore) : pendingValue}
          </span>
          <span className="overflow-hidden whitespace-nowrap text-left tabular-nums text-[var(--app-muted)]">
            {typeof evalAfter === "number" ? formatEvalLabel(evalAfter, mateAfter) : pendingValue}
          </span>
          <span className="overflow-hidden whitespace-nowrap text-left tabular-nums text-[var(--app-muted)]">
            {showEvaluations ? formatLossLabel(cpLoss, mateAfter) : pendingValue}
          </span>
        </button>
        );
      })}
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
                <span className="shrink-0 text-[11px] font-normal text-[var(--app-muted)]">
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
                <span className="shrink-0 text-[11px] font-normal text-[var(--app-muted)]">
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

function ClassificationBadge({ classification }: { classification: MoveClassification }) {
  const label = classificationLabel(classification);
  return (
    <span
      className="grid h-4 w-4 shrink-0 place-items-center"
      title={label}
      aria-label={label}
    >
      <img
        src={classificationIcon(classification)}
        alt=""
        className="h-4 w-4"
        draggable={false}
      />
    </span>
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

function TargetIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[var(--app-accent)]"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" /><path d="m15 9-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function KingIcon() {
  return <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-[var(--app-text)]"><path d="M12 3v5M9.5 5.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M7 21h10M8 18h8M8.8 15.5c-1.4-1-2.3-2.6-2.3-4.4A5.5 5.5 0 0 1 12 5.6a5.5 5.5 0 0 1 5.5 5.5c0 1.8-.9 3.4-2.3 4.4H8.8Z" fill="currentColor" /></svg>;
}
