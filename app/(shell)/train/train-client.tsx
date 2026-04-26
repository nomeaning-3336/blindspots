"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chess, type Square } from "chess.js";
import { AnalysisBoard, type BoardMove, type EngineArrow } from "@/components/chess/analysis-board";
import { classifyRankedMove, isRecommendableClassification } from "@/lib/move-classification";
import {
  analyzeBoardThemeForAppTheme,
  normalizeAnalyzePreferences,
  type AnalyzePreferences,
  type AnalyzeBoardTheme,
  type AnalyzePieceTheme,
} from "@/lib/analyze-preferences";
import {
  DEFAULT_BLINDSPOTS_ELO,
  classificationColor,
  classificationIcon,
  classificationLabel,
  getTrainingBoardHighlights,
  moveBadgeForPosition,
  type MoveClassification,
} from "@/lib/training-board-ui";

type TrainingState = "active" | "complete" | "drift";
type OnboardingScreen = "loading" | "connect" | "analysis" | "summary" | "done";
type ProfileProvider = "chesscom" | "lichess";
type TrainingMove = {
  san: string;
  uci: string;
  side: "white" | "black";
  fenBefore?: string;
  fenAfter?: string;
  cpLoss?: number;
  evalBefore?: number;
  evalAfter?: number;
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
  classification?: MoveClassification;
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
};

type EngineLineResult = {
  cp: number;
  depth: number;
  rank: number;
  bestMove: string;
  bestSan: string;
  pv: string[];
  pvSan: string[];
  classification?: MoveClassification;
};

type EvalGraphPoint = {
  value: number;
  positionIndex: number;
  classification?: MoveClassification;
};

type ExploratoryPosition = {
  fen: string;
  lastMove: { from: string; to: string } | null;
};

type NextPositionResponse = {
  fen?: string;
  previousFen?: string;
  playedMove?: string;
  sequenceLength?: number;
  source?: string;
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
const TRAIN_SOUND_SOURCES = {
  move: "/analyze/sounds/move-self.mp3",
  capture: "/analyze/sounds/capture.mp3",
} as const;
const primaryActionClassName =
  "min-h-11 rounded-[8px] border border-[var(--app-accent)] bg-[var(--app-accent)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]";
const trainSoundBank = new Map<keyof typeof TRAIN_SOUND_SOURCES, AudioBuffer>();
const defaultTrainSoundPlyRef = { current: 0 };
let trainAudioContext: AudioContext | null = null;
let trainSoundPrimePromise: Promise<void> | null = null;

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

type TrainSoundMove = {
  san?: unknown;
  captured?: unknown;
  flags?: unknown;
};

function primeTrainSounds() {
  const context = ensureTrainAudioContext();
  if (!context || typeof fetch === "undefined") return;
  if (trainSoundPrimePromise) return;

  trainSoundPrimePromise = Promise.all(
    (Object.entries(TRAIN_SOUND_SOURCES) as Array<[keyof typeof TRAIN_SOUND_SOURCES, string]>)
      .map(async ([name, src]) => {
      if (trainSoundBank.has(name)) return;
      const response = await fetch(src, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Could not load train sound: ${src}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await decodeTrainSound(context, arrayBuffer);
      trainSoundBank.set(name, buffer);
    }),
  ).then(
    () => {},
    () => {
      trainSoundPrimePromise = null;
    });
}

function ensureTrainAudioContext() {
  if (typeof window === "undefined") return null;
  if (trainAudioContext) return trainAudioContext;
  const AudioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;

  try {
    trainAudioContext = new AudioContextCtor();
  } catch {
    trainAudioContext = null;
  }

  return trainAudioContext;
}

function resumeTrainAudioContext() {
  const context = ensureTrainAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => {});
  }
}

function decodeTrainSound(context: AudioContext, arrayBuffer: ArrayBuffer) {
  const data = arrayBuffer.slice(0);
  return new Promise<AudioBuffer>((resolve, reject) => {
    const maybePromise = context.decodeAudioData(data, resolve, reject);
    if (maybePromise instanceof Promise) {
      maybePromise.then(resolve, reject);
    }
  });
}

const MOVE_SCALE_RATIOS = [
  1.0, 1.12246, 1.25992, 1.33484, 1.49831, 1.68179, 1.88775, 2.0,
] as const;
const MOVE_SCALE_LABELS = ["do", "re", "mi", "fa", "sol", "la", "si", "do"] as const;

/** Normalized pitch for a given move index across a sequence.
 * The entire scale (do→do octave) is spread evenly across the sequence length,
 * so the first move always lands on do and the last move on do octave.
 * @param moveIndex 0-based index of the target move
 * @param sequenceLength total number of moves in the sequence
 * @param reverse true for backward traversal (unused in normalized mode, kept for API compat)
 */
function normalizedMovePitch(moveIndex: number, sequenceLength: number): number {
  if (sequenceLength <= 1) return MOVE_SCALE_RATIOS[0];
  const scaleSpan = MOVE_SCALE_RATIOS.length - 1; // 7 steps from do to do octave
  const step = (scaleSpan * moveIndex) / (sequenceLength - 1);
  const lowerIdx = Math.floor(step);
  const t = step - lowerIdx;
  // Linear interpolation between adjacent scale ratios
  return MOVE_SCALE_RATIOS[lowerIdx] * (1 - t) + MOVE_SCALE_RATIOS[lowerIdx + 1] * t;
}

function trainMoveIsCapture(move?: TrainSoundMove | null) {
  if (!move) return false;
  if (move.captured) return true;
  if (typeof move.flags === "string" && /[ce]/.test(move.flags)) return true;
  return typeof move.san === "string" && move.san.includes("x");
}

function pitchRatioForPly(plyIndex: number) {
  return MOVE_SCALE_RATIOS[((plyIndex % MOVE_SCALE_RATIOS.length) + MOVE_SCALE_RATIOS.length) % MOVE_SCALE_RATIOS.length];
}

type TrainSoundOptions = {
  pitchIndex?: number;
  advanceLivePitch?: boolean;
  plyRef?: { current: number };
};

function playTrainMoveSound(
  move: TrainSoundMove | null | undefined,
  options: TrainSoundOptions = {},
) {
  if (!move) return;
  primeTrainSounds();
  resumeTrainAudioContext();
  const context = ensureTrainAudioContext();
  const isCapture = trainMoveIsCapture(move);
  const soundName = isCapture ? "capture" : "move";
  let buffer = trainSoundBank.get(soundName);
  if (context && !buffer && trainSoundPrimePromise) {
    void trainSoundPrimePromise.then(() => {
      buffer = trainSoundBank.get(soundName);
      if (buffer) {
        playTrainMoveSoundImpl(context, move, buffer, options, isCapture);
      }
    });
    return;
  }
  if (!context || !buffer) return;
  playTrainMoveSoundImpl(context, move, buffer, options, isCapture);
}

function playTrainMoveSoundImpl(
  context: AudioContext,
  move: TrainSoundMove,
  buffer: AudioBuffer,
  options: TrainSoundOptions,
  isCapture: boolean,
) {
  try {
    const source = context.createBufferSource();
    source.buffer = buffer;

    let pitchIndex: number;
    if (options.pitchIndex !== undefined) {
      pitchIndex = options.pitchIndex;
    } else {
      const ref = options.plyRef ?? defaultTrainSoundPlyRef;
      pitchIndex = ref.current;
    }

    const playbackRate = pitchRatioForPly(pitchIndex);
    source.playbackRate.value = playbackRate;

    if (typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).__blindspotsTrainSoundEvents) {
      const events = (window as unknown as { __blindspotsTrainSoundEvents: Array<{ san: unknown; uci: unknown; pitchIndex: number; playbackRate: number; source: string }> }).__blindspotsTrainSoundEvents;
      events.push({
        san: (move as { san?: unknown })?.san,
        uci: (move as { uci?: unknown })?.uci,
        pitchIndex,
        playbackRate,
        source: options.pitchIndex !== undefined ? "replay" : "live",
      });
    }

    const gainNode = context.createGain();
    gainNode.gain.value = isCapture ? 1.0 : 0.85;
    source.connect(gainNode);
    gainNode.connect(context.destination);
    source.start();

    if (options.advanceLivePitch !== false) {
      const ref = options.plyRef ?? defaultTrainSoundPlyRef;
      ref.current += 1;
    }
  } catch {}
}

function moveForExploreSound(
  positions: SequencePosition[],
  currentIndex: number,
  nextIndex: number,
) {
  if (nextIndex < currentIndex) return positions[currentIndex]?.move ?? null;
  if (nextIndex > currentIndex) return positions[nextIndex]?.move ?? null;
  return null;
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
  const [startingFen, setStartingFen] = useState(mockRep.fen);
  const [fen, setFen] = useState(mockRep.fen);
  const [moves, setMoves] = useState<TrainingMove[]>(mockRep.moveHistory);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [sequenceLength, setSequenceLength] = useState(mockRep.sequenceLength);
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
  const [engineLineCache, setEngineLineCache] = useState<Record<string, EngineLineResult[]>>({});
  const [engineLineErrorFens, setEngineLineErrorFens] = useState<Set<string>>(new Set());
  const [engineLineLoadingFen, setEngineLineLoadingFen] = useState<string | null>(null);
  const [cachedNextPosition, setCachedNextPosition] = useState<NextPositionResponse | null>(null);
  const [isOpponentThinking, setIsOpponentThinking] = useState(false);
  const [isCompletingSequence, setIsCompletingSequence] = useState(false);
  const [isPositionLoading, setIsPositionLoading] = useState(true);
  const [hoveredAnnotationSquare, setHoveredAnnotationSquare] = useState<string | null>(null);
  const [hoveredEngineLineIndex, setHoveredEngineLineIndex] = useState<number | null>(null);
  const [hoveredMoveSquares, setHoveredMoveSquares] = useState<{ from: string; to: string } | null>(null);
  const [onboardingScreen, setOnboardingScreen] = useState<OnboardingScreen>("loading");
  const [selectedProvider, setSelectedProvider] = useState<ProfileProvider | null>(null);
  const [profileUsername, setProfileUsername] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [isConnectingProfile, setIsConnectingProfile] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0);
  const [initializationSummary, setInitializationSummary] =
    useState<InitializationSummary | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [visualPreferences, setVisualPreferences] = useState<{
    boardTheme: AnalyzeBoardTheme;
    pieceTheme: AnalyzePieceTheme;
  } | null>(null);
  const [pieceLineCache, setPieceLineCache] = useState<Record<string, EngineLineResult[]>>({});
  const [pieceLinesLoadingKey, setPieceLinesLoadingKey] = useState<string | null>(null);
  const moveSoundPlyRef = useRef(0);
  const completingRef = useRef(false);
  const completionRequestRef = useRef(0);
  const initialOpponentMoveRef = useRef<TrainingMove | null>(null);
  const initialOpponentRequestRef = useRef(0);
  const [initialOpponentMove, setInitialOpponentMove] = useState<TrainingMove | null>(null);
  const [displayStartingFen, setDisplayStartingFen] = useState(mockRep.fen);
  const nextPositionPrefetchRef = useRef<Promise<NextPositionResponse | null> | null>(null);
  const engineLineCacheRef = useRef<Record<string, EngineLineResult[]>>({});
  const engineLinePrefetchRef = useRef<Map<string, Promise<void>>>(new Map());
  const pieceLineCacheRef = useRef<Record<string, EngineLineResult[]>>({});

  useEffect(() => {
    engineLineCacheRef.current = engineLineCache;
  }, [engineLineCache]);

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
          setSequenceLength(normalizeSequenceLength(payload.preferences.sequence_length));
        }
        if (payload.profile?.blindspots_elo) {
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
    primeTrainSounds();

    function primeSounds() {
      primeTrainSounds();
      resumeTrainAudioContext();
    }

    window.addEventListener("pointerdown", primeSounds, { once: true });
    window.addEventListener("keydown", primeSounds, { once: true });
    return () => {
      window.removeEventListener("pointerdown", primeSounds);
      window.removeEventListener("keydown", primeSounds);
    };
  }, []);

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
    initialOpponentRequestRef.current += 1;
    moveSoundPlyRef.current = 0;
    setState(nextState);
    setResultMode("results");
    setExploreIndex(0);
    resetExploratoryLine();
    setSelectedMoveIndex(null);
    setEngineLineCache({});
    setEngineLineErrorFens(new Set());
    setEngineLineLoadingFen(null);
    setIsOpponentThinking(false);
    setIsCompletingSequence(false);
    setEloResult(null);
    setLastMove(null);
    setDisplayStartingFen(startingFen);
    if (nextState === "active") {
      void loadNextPosition();
    }
    if (nextState === "complete") {
      return;
    }
    if (nextState === "drift") {
      setFen(startingFen);
      setMoves([...mockRep.moveHistory, { san: "Rb8?", uci: "b4b8", side: "white" }]);
    }
  }

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
      setIsPositionLoading(true);
    }

    try {
      const payload = pendingPrefetch
        ? await pendingPrefetch
        : await fetchNextPosition();
      nextPositionPrefetchRef.current = null;
      setCachedNextPosition(null);

      if (!payload?.fen) {
        setStartingFen(mockRep.fen);
        setDisplayStartingFen(mockRep.fen);
        setFen(mockRep.fen);
        setMoves([]);
        setInitialOpponentMove(null);
        setSequenceLength(DEFAULT_SEQUENCE_LENGTH);
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
    completingRef.current = false;
    initialOpponentMoveRef.current = null;
    setInitialOpponentMove(null);
    moveSoundPlyRef.current = 0;

    setStartingFen(payload.fen);
    setDisplayStartingFen(payload.previousFen ?? payload.fen);
    setMoves([]);
    setLastMove(null);
    setResultMode("results");
    setExploreIndex(0);
    resetExploratoryLine();
    setSelectedMoveIndex(null);
    setEngineLineCache({});
    setEngineLineErrorFens(new Set());
    setEngineLineLoadingFen(null);
    setPieceLineCache({});
    setPieceLinesLoadingKey(null);
    setSequenceLength(normalizeSequenceLength(payload.sequenceLength));

    if (payload.previousFen && payload.playedMove) {
      void playInitialOpponentMoveFromPayload(payload);
    } else {
      void playInitialOpponentMove(payload.fen);
    }
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

    initialOpponentMoveRef.current = applied.move;
    setInitialOpponentMove(applied.move);

    setIsOpponentThinking(true);

    // Show the "before" position with the move highlighted.
    setFen(previousFen);
    await sleep(360);

    if (initialOpponentRequestRef.current !== requestId) return;

    setLastMove(applied.lastMove);
    playTrainMoveSound(applied.move, { plyRef: moveSoundPlyRef });
    await sleep(540);

    if (initialOpponentRequestRef.current !== requestId) return;

    setFen(payload.fen!);

    if (initialOpponentRequestRef.current === requestId) {
      setIsOpponentThinking(false);
    }
  }

  async function playInitialOpponentMove(targetFen: string) {
    const requestId = initialOpponentRequestRef.current + 1;
    initialOpponentRequestRef.current = requestId;

    initialOpponentMoveRef.current = null;

    const parts = targetFen.split(" ");
    if (parts.length < 2) return;
    const userTurn = parts[1];
    const opponentTurn = userTurn === "w" ? "b" : "w";
    parts[1] = opponentTurn;
    const opponentFen = parts.join(" ");

    setIsOpponentThinking(true);

    try {
      const response = await fetch("/api/train/opponent-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: opponentFen, userBlindspotElo: blindspotsElo }),
      });
      const data = (await response.json().catch(() => null)) as OpponentMoveResponse | null;
      const oppMove = data?.move;
      if (!response.ok || !oppMove) return;

      if (initialOpponentRequestRef.current !== requestId) return;

      const chess = new Chess(opponentFen);
      const played = chess.move({
        from: oppMove.uci.slice(0, 2),
        to: oppMove.uci.slice(2, 4),
        promotion: oppMove.uci[4],
      });
      if (!played) return;

      if (initialOpponentRequestRef.current !== requestId) return;

      const move: TrainingMove = {
        san: oppMove.san || played.san,
        uci: `${played.from}${played.to}${played.promotion ?? ""}`,
        side: played.color === "w" ? "white" : "black",
        fenBefore: opponentFen,
        fenAfter: chess.fen(),
      };
      initialOpponentMoveRef.current = move;
      setInitialOpponentMove(move);

      // Show the opponent's position first so the user can see the "before" state.
      setFen(opponentFen);
      await sleep(360);

      if (initialOpponentRequestRef.current !== requestId) return;

      // Highlight the move on the opponent's position.
      setLastMove({ from: played.from, to: played.to });
      playTrainMoveSound(played, { plyRef: moveSoundPlyRef });
      await sleep(540);

      if (initialOpponentRequestRef.current !== requestId) return;

      // Show the resulting position.
      setFen(chess.fen());
      setStartingFen(chess.fen());
    } finally {
      if (initialOpponentRequestRef.current === requestId) {
        setIsOpponentThinking(false);
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

  async function fetchEngineLinesForFen(fenToAnalyze: string) {
    const cached = engineLineCacheRef.current[fenToAnalyze];
    if (cached) return;
    const pending = engineLinePrefetchRef.current.get(fenToAnalyze);
    if (pending) return pending;

    const promise = (async () => {
      const response = await fetch("/api/train/engine-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: fenToAnalyze }),
      });
      const payload = (await response.json().catch(() => null)) as { lines?: EngineLineResult[]; error?: string } | null;
      const lines = response.ok && Array.isArray(payload?.lines) ? payload.lines : [];
      const hadError = typeof payload?.error === "string" || !response.ok;
      setEngineLineCache((current) => {
        if (current[fenToAnalyze]) return current;
        const next = { ...current, [fenToAnalyze]: lines };
        engineLineCacheRef.current = next;
        return next;
      });
      if (hadError) {
        setEngineLineErrorFens((current) => {
          const next = new Set(current);
          next.add(fenToAnalyze);
          return next;
        });
      }
    })().catch(() => {
      setEngineLineCache((current) => {
        if (current[fenToAnalyze]) return current;
        const next = { ...current, [fenToAnalyze]: [] };
        engineLineCacheRef.current = next;
        return next;
      });
      setEngineLineErrorFens((current) => {
        const next = new Set(current);
        next.add(fenToAnalyze);
        return next;
      });
    }).finally(() => {
      engineLinePrefetchRef.current.delete(fenToAnalyze);
    });

    engineLinePrefetchRef.current.set(fenToAnalyze, promise);
    return promise;
  }

  async function fetchPieceLinesForSquare(fen: string, square: string) {
    const key = `${fen}::${square}`;
    if (pieceLineCacheRef.current[key]) return;

    const response = await fetch("/api/train/piece-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, square }),
    });
    const payload = (await response.json().catch(() => null)) as { lines?: EngineLineResult[]; error?: string } | null;
    const lines = response.ok && Array.isArray(payload?.lines) ? payload.lines : [];
    if (typeof payload?.error === "string" || !response.ok) {
      console.warn(`[piece-lines] fetch failed for ${fen}@${square}:`, payload?.error ?? "unknown error");
    }
    setPieceLineCache((current) => {
      if (current[key]) return current;
      const next = { ...current, [key]: lines };
      pieceLineCacheRef.current = next;
      return next;
    });
  }

  function warmEngineLinesForSequence(nextMoves: TrainingMove[]) {
    const fens = collectKeyAnalysisFens(startingFen, nextMoves)
      .filter((fenToAnalyze) => !engineLineCacheRef.current[fenToAnalyze]);
    if (fens.length === 0) return;

    void (async () => {
      const concurrency = 2;
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
  }

  function handleMove(move: BoardMove) {
    if (state !== "active" || isOpponentThinking || completingRef.current) return;

    try {
      const chess = new Chess(fen);
      const playedMove = chess.move({ from: move.from, to: move.to, promotion: "q" });
      if (!playedMove) return;

      const fenAfterUserMove = chess.fen();
      const userMoveCountAfterMove = Math.floor(moves.length / 2) + 1;
      const userTrainingMove: TrainingMove = {
        san: playedMove.san,
        uci: `${playedMove.from}${playedMove.to}${playedMove.promotion ?? ""}`,
        side: playedMove.color === "w" ? "white" : "black",
        fenBefore: fen,
        fenAfter: fenAfterUserMove,
      };
      const movesAfterUserMove = [...moves, userTrainingMove];

      playTrainMoveSound(playedMove, { plyRef: moveSoundPlyRef });
      setFen(fenAfterUserMove);
      setLastMove({ from: move.from, to: move.to });
      setMoves(movesAfterUserMove);
      warmEngineLinesForSequence(movesAfterUserMove);

      if (chess.isGameOver()) {
        completingRef.current = true;
        setState("complete");
        void completeSequence(movesAfterUserMove);
        return;
      }

      if (userMoveCountAfterMove >= sequenceLength) {
        completingRef.current = true;
        setState("complete");
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

    try {
      const chess = new Chess(boardFen);
      const playedMove = chess.move({ from: move.from, to: move.to, promotion: "q" });
      if (!playedMove) return;

      playTrainMoveSound(playedMove, { plyRef: moveSoundPlyRef });
      const nextExploratoryPosition = {
        fen: chess.fen(),
        lastMove: { from: playedMove.from, to: playedMove.to },
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

      playTrainMoveSound(playedMove, { plyRef: moveSoundPlyRef });
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
        setState("complete");
        void completeSequence(finalMoves);
      }
    } finally {
      setIsOpponentThinking(false);
    }
  }

  async function completeSequence(finalMoves: TrainingMove[]) {
    const requestId = completionRequestRef.current + 1;
    completionRequestRef.current = requestId;
    setIsCompletingSequence(true);

    try {
      const response = await fetch("/api/train/complete-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startingFen,
          moves: finalMoves,
          sequenceLength,
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
    await fetch("/api/train/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip" }),
    });
    setBlindspotsElo(DEFAULT_BLINDSPOTS_ELO);
    await startFirstSession();
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
      body: JSON.stringify({ action: "analyze" }),
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

  async function startFirstSession() {
    setIsSavingSettings(true);

    try {
      await fetch("/api/train/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_settings",
          sequenceLength: normalizeSequenceLength(sequenceLength),
          timePressureMode: "none",
          openingFilter: [],
        }),
      });
      setOnboardingScreen("done");
      void loadNextPosition();
    } finally {
      setIsSavingSettings(false);
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
  const visibleSequencePositions = useMemo(
    () => buildVisibleSequencePositions({
      startingFen,
      moves,
      initialOpponentMove,
    }),
    [startingFen, moves, initialOpponentMove],
  );

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
    };
  }, [startingFen, displayStartingFen, moves, initialOpponentMove, displayMoves, visibleSequencePositions]);

  const activeExploreIndex = Math.min(exploreIndex, Math.max(0, visibleSequencePositions.length - 1));
  const activeSequencePosition = visibleSequencePositions[activeExploreIndex] ?? visibleSequencePositions[0];

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

  const isExploringResults = state === "complete" && resultMode === "explore";
  const activeExploratoryPosition =
    exploratoryHistoryIndex >= 0 ? exploratoryHistory[exploratoryHistoryIndex] : null;
  const boardFen = isExploringResults
    ? (activeExploratoryPosition?.fen ?? exploratoryFen ?? activeSequencePosition?.fen ?? fen)
    : fen;
  const replayLastMove = isExploringResults
    ? (activeExploratoryPosition?.lastMove ?? exploratoryLastMove ?? lastMoveFromTrainingMove(activeSequencePosition?.move))
    : lastMove;
  const boardLastMoveBadge = isExploringResults && !activeExploratoryPosition && !exploratoryFen
    ? moveBadgeForPosition(activeSequencePosition)
    : null;
  const selectedMove =
    selectedMoveIndex != null && selectedMoveIndex > 0 && selectedMoveIndex <= moves.length
      ? moves[selectedMoveIndex - 1]
      : null;
  const selectedMoveSquares = selectedMove ? moveFromUci(selectedMove.uci) : null;
  const selectedMoveUci = selectedMove?.uci ?? null;
  const currentEngineLines = isExploringResults
    ? engineLineCache[boardFen] ?? []
    : [];
  const pieceLinesKey = exploreSelectedSquare ? `${boardFen}::${exploreSelectedSquare}` : null;
  const currentPieceLines = pieceLinesKey ? (pieceLineCache[pieceLinesKey] ?? null) : null;
  const displayLines = exploreSelectedSquare
    ? (currentPieceLines ?? [])
    : currentEngineLines;
  const classifiedDisplayLines = useMemo(
    () => displayLines.map((line, index) => ({
      ...line,
      classification: line.classification ?? engineLineClassification(index, displayLines, boardFen),
    })),
    [boardFen, displayLines],
  );
  const boardEngineLines = exploreSelectedSquare
    ? classifiedDisplayLines
    : classifiedDisplayLines.filter((line) => isRecommendableClassification(line.classification));
  const hoveredEngineLineMove =
    hoveredEngineLineIndex == null ? null : classifiedDisplayLines[hoveredEngineLineIndex]?.bestMove ?? null;
  const currentEngineEval = currentEngineLines[0]?.cp;
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
        "input, textarea, select, button, [contenteditable='true'], [data-ignore-train-shortcuts='true']",
      ),
    );
  }

  useEffect(() => {
    if (state !== "complete") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      if (shouldIgnoreTrainShortcut(event)) return;

      // Switch from results → explore on first keypress
      if (resultMode !== "explore") {
        // Align with the existing auto-switch: land on the last position
        setExploreIndex(Math.max(0, visibleSequencePositions.length - 1));
        resetExploratoryLine();
        setResultMode("explore");
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      // Exploratory history navigation (hover arrows)
      if (exploratoryHistory.length > 0) {
        if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "Home") {
          navigateExploratoryLine(exploratoryHistoryIndex - 1);
        } else {
          navigateExploratoryLine(exploratoryHistoryIndex + 1);
        }
        return;
      }

      // Visible sequence position navigation
      if (event.key === "ArrowLeft") {
        navigateExploreTo(activeExploreIndex - 1, "start");
      } else if (event.key === "ArrowRight") {
        navigateExploreTo(activeExploreIndex + 1, "end");
      } else if (event.key === "ArrowUp" || event.key === "Home") {
        navigateExploreTo(0, "start");
      } else {
        navigateExploreTo(visibleSequencePositions.length - 1, "end");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, resultMode, activeExploreIndex, exploratoryHistory.length, exploratoryHistoryIndex, visibleSequencePositions.length]);

  useEffect(() => {
    if (state !== "complete" || resultMode === "explore") return;
    const timer = window.setTimeout(() => {
      setExploreIndex(Math.max(0, visibleSequencePositions.length - 1));
      resetExploratoryLine();
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

    setHoveredEngineLineIndex(null);
    setHoveredMoveSquares(null);
    setExploratoryHistoryIndex(nextIndex);

    const position = nextIndex >= 0 ? exploratoryHistory[nextIndex] : null;
    setExploratoryFen(position?.fen ?? null);
    setExploratoryLastMove(position?.lastMove ?? null);
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
    resetExploratoryLine();
    setHoveredEngineLineIndex(null);
    setHoveredMoveSquares(null);
    const targetPos = visibleSequencePositions[boundedIndex];
    if (targetPos?.move && typeof targetPos.pitchIndex === "number") {
      playTrainMoveSound(targetPos.move, {
        pitchIndex: targetPos.pitchIndex,
        advanceLivePitch: false,
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
        onSelectProvider={setSelectedProvider}
        onUsernameChange={setProfileUsername}
        onConnectProfile={connectProfile}
        onSkip={skipConnection}
        onStartTraining={() => void startFirstSession()}
      />
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-auto py-4">
      <div
        className={[
          "grid w-full gap-5 transition-opacity duration-200",
          "lg:min-h-[780px] lg:grid-cols-[minmax(0,1.36fr)_minmax(360px,0.88fr)]",
        ].join(" ")}
      >
        <section
          className="flex items-center justify-center rounded-[14px] border border-[var(--app-border-soft)] bg-[var(--app-panel-strong)] p-3 transition-colors sm:p-5 lg:min-h-0 lg:p-8"
        >
          <div className="w-full max-w-[min(92vw,74vh,920px)]">
            {visualPreferences && !isPositionLoading ? (
              <BoardWithPlayerStrips
                userSide={userMoveSide}
                boardFen={boardFen}
                isOpponentThinking={isOpponentThinking}
                isTrainingActive={state === "active"}
                isExploring={isExploringResults}
              >
                {isExploringResults ? (
                  <BoardWithEvalBar
                    evalCp={currentEngineEval}
                    isLoading={isEngineLinesLoading}
                  >
                    <AnalysisBoard
                      fen={boardFen}
                      mode="training"
                      orientation={boardOrientation}
                      coordinates
                      showLegalTargets={false}
                      selectedSquare={exploreSelectedSquare}
                      lastMove={replayLastMove}
                      lastMoveBadge={boardLastMoveBadge}
                      boardTheme={visualPreferences.boardTheme}
                      pieceTheme={visualPreferences.pieceTheme}
                      highlightedSquares={
                        hoveredMoveSquares
                          ? [
                              {
                                square: hoveredMoveSquares.from,
                                color: "color-mix(in srgb, var(--app-accent) 24%, transparent)",
                              },
                              {
                                square: hoveredMoveSquares.to,
                                color: "color-mix(in srgb, var(--app-accent) 36%, transparent)",
                              },
                            ]
                          : selectedMoveSquares
                            ? [
                                {
                                  square: selectedMoveSquares.from,
                                  color: "color-mix(in srgb, var(--app-accent) 24%, transparent)",
                                },
                                {
                                  square: selectedMoveSquares.to,
                                  color: "color-mix(in srgb, var(--app-accent) 36%, transparent)",
                                },
                              ]
                            : undefined
                      }
                      engineArrows={buildEngineArrows(boardEngineLines, hoveredEngineLineMove)}
                      onMove={(move) => {
                        setExploreSelectedSquare(null);
                        setSelectedMoveIndex(null);
                        handleExploreMove(move);
                      }}
                      onSquareClick={(square) => {
                        try {
                          const chess = new Chess(boardFen);
                          const piece = chess.get(square as Square);
                          if (piece && piece.color === chess.turn() && square !== exploreSelectedSquare) {
                            setExploreSelectedSquare(square);
                          } else {
                            setExploreSelectedSquare(null);
                          }
                        } catch {
                          setExploreSelectedSquare(null);
                        }
                      }}
                      onCircleHover={setHoveredAnnotationSquare}
                      onEngineArrowClick={handleExploreMove}
                    />
                  </BoardWithEvalBar>
                ) : (
                  <AnalysisBoard
                    fen={boardFen}
                    mode="training"
                    orientation={boardOrientation}
                    coordinates
                    showLegalTargets
                    lastMove={replayLastMove}
                    boardTheme={visualPreferences.boardTheme}
                    pieceTheme={visualPreferences.pieceTheme}
                    disabled={state !== "active" || isOpponentThinking}
                    annotationsDisabled={false}
                    highlightedSquares={getTrainingBoardHighlights(state)}
                    onMove={handleMove}
                    dataTestId="train-board"
                  />
                )}
              </BoardWithPlayerStrips>
            ) : (
              <div
                className="grid aspect-square w-full place-items-center rounded-[10px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] text-sm font-bold text-[var(--app-muted)]"
                aria-live="polite"
              >
                Finding something you mishandle...
              </div>
            )}
          </div>
        </section>

        <aside
          data-testid="train-move-panel"
          className={[
            "flex flex-col rounded-[14px] border border-[var(--app-border-soft)] bg-[var(--app-panel-strong)]",
            state === "complete" && resultMode === "results"
              ? "p-4 sm:p-5"
              : "p-5 sm:p-6 lg:min-h-[720px]",
          ].join(" ")}
        >
          {state === "complete" ? (
            <ResultsPanel
              eloResult={eloResult}
              isSaving={isCompletingSequence}
              moves={moves}
              userSide={userMoveSide}
              startingFen={startingFen}
              mode={resultMode}
              positions={visibleSequencePositions}
              currentIndex={activeExploreIndex}
              engineLines={classifiedDisplayLines}
              isEngineLinesLoading={isDisplayLoading}
              hasEngineLineError={hasEngineLineError}
              isPieceSelected={Boolean(exploreSelectedSquare)}
              hoveredAnnotationSquare={hoveredAnnotationSquare}
              hoveredEngineLineIndex={hoveredEngineLineIndex}
              onEngineLineHover={setHoveredEngineLineIndex}
              onMoveHover={setHoveredMoveSquares}
              onNavigate={navigateExploreTo}
              onNextPosition={() => switchState("active")}
              selectedMoveIndex={selectedMoveIndex}
              selectedMoveUci={selectedMoveUci}
              onSelectMove={(positionIndex) => {
                setSelectedMoveIndex(positionIndex);
                navigateExploreTo(positionIndex);
              }}
            />
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-end gap-3" aria-label="Blindspots Elo">
                    <span className="text-5xl font-bold leading-none text-[var(--app-text)]">{rating}</span>
                  </div>
                </div>
                <div className="rounded border border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-4 py-3 text-right">
                  <p className="text-lg font-bold text-[var(--app-text)]">
                    Move {moveProgress} of {sequenceLength}
                  </p>
                </div>
              </div>

              {state === "drift" ? (
                <StatusBanner
                  title="Eval dropped"
                  detail="Saved for later. You will see it again."
                  action="Again"
                  tone="warning"
                  onAction={() => switchState("active")}
                />
              ) : (
                moves.length === 0 && !isOpponentThinking && !isPositionLoading ? (
                  <PromptCard side={userMoveSide} />
                ) : null
              )}

              <MoveList
                moves={displayMoves}
                userSide={userMoveSide}
                isOpponentThinking={isOpponentThinking}
                showHeaders={false}
              />
            </>
          )}
        </aside>
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
  onSelectProvider,
  onUsernameChange,
  onConnectProfile,
  onSkip,
  onStartTraining,
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
  onSelectProvider: (provider: ProfileProvider | null) => void;
  onUsernameChange: (value: string) => void;
  onConnectProfile: (provider: ProfileProvider) => void;
  onSkip: () => void;
  onStartTraining: () => void;
}) {
  return (
    <div
      className={[
        "grid min-h-[calc(100dvh-92px)] w-full place-items-center px-4 py-8",
        screen === "analysis" ? "bg-[var(--app-bg)]" : "",
      ].join(" ")}
    >
      <section className="w-full max-w-[620px] text-center">
        {screen === "loading" ? (
          <LinearProgress completedSteps={0} />
        ) : null}

        {screen === "connect" ? (
          <div className="grid gap-8">
            <div className="grid gap-4">
              <h1 className="text-2xl font-bold text-[var(--app-text)]">
                We need your games first.
              </h1>
              <p className="text-sm leading-7 text-[var(--app-muted)]">
                We need your Lichess or Chess.com username. We are going to read your
                games. Yes, the bad ones too. Especially the bad ones.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={onboardingPrimaryButtonClass(selectedProvider === "lichess")}
                disabled={isConnectingProfile}
                onClick={() => {
                  onSelectProvider("lichess");
                }}
              >
                Use Lichess
              </button>
              <button
                type="button"
                className={onboardingPrimaryButtonClass(selectedProvider === "chesscom")}
                disabled={isConnectingProfile}
                onClick={() => {
                  onSelectProvider("chesscom");
                }}
              >
                Use Chess.com
              </button>
            </div>

            {selectedProvider ? (
              <form
                className="mx-auto grid w-full max-w-[420px] gap-3 text-left"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!isConnectingProfile && username.trim().length > 0) {
                    void onConnectProfile(selectedProvider);
                  }
                }}
              >
                <label className="grid gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
                    Public username
                  </span>
                  <input
                    value={username}
                    onChange={(event) => onUsernameChange(event.target.value)}
                    className="app-brutal-input min-h-12 px-4 text-base text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
                    placeholder={
                      selectedProvider === "lichess"
                        ? "Your Lichess username"
                        : "Your Chess.com username"
                    }
                    autoComplete="off"
                  />
                </label>
                {connectionMessage ? (
                  <p className="text-sm text-[var(--app-muted)]">{connectionMessage}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={isConnectingProfile || username.trim().length === 0}
                  className="min-h-12 rounded-[8px] border border-[var(--app-accent)] bg-[var(--app-accent)] px-5 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)] disabled:cursor-not-allowed disabled:border-[var(--app-border)] disabled:bg-[var(--app-surface-subtle)] disabled:text-[var(--app-muted)]"
                >
                  {isConnectingProfile ? "Checking..." : "Continue"}
                </button>
              </form>
            ) : null}

            <button
              type="button"
              className="mx-auto min-h-11 cursor-pointer text-sm font-bold text-[var(--app-muted)] underline-offset-4 transition hover:text-[var(--app-text)] hover:underline"
              onClick={() => void onSkip()}
            >
              Skip this. Start with random positions.
            </button>
          </div>
        ) : null}

        {screen === "analysis" ? (
          <div className="mx-auto grid w-full max-w-[430px] gap-8">
            <LinearProgress completedSteps={analysisStep} />
            <div className="mx-auto grid w-fit max-w-full gap-4 text-left">
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
            <AnalysisElapsedMessage elapsedMs={analysisElapsedMs} />
          </div>
        ) : null}

        {screen === "summary" && summary ? (
          <div className="grid gap-8">
            <h1 className="text-3xl font-bold text-[var(--app-text)]">
              We found enough.
            </h1>
            <div className="grid gap-3 border-y border-[var(--app-border-soft)] py-6 text-left sm:grid-cols-3">
              <SummaryStat value={`${summary.mistakesFound}`} label="mistakes found" />
              <SummaryStat value={`${summary.gamesAnalyzed}`} label="games checked" />
              <SummaryStat value={`${summary.averageCpLossPerMove}cp`} label="average loss" />
            </div>
            <button
              type="button"
              className="mx-auto min-h-12 rounded-[8px] border border-[var(--app-accent)] bg-[var(--app-accent)] px-6 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
              onClick={onStartTraining}
            >
              Start training
            </button>
          </div>
        ) : null}

      </section>
    </div>
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
      <PlayerTurnStrip label={opponentLabel} isActive={isOpponentActive} />
      {children}
      <PlayerTurnStrip label={userLabel} isActive={isUserActive} />
    </div>
  );
}

function PlayerTurnStrip({ label, isActive }: { label: string; isActive: boolean }) {
  return (
    <div className="flex h-7 items-center gap-2 px-0.5">
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

function PromptCard({ side }: { side: "white" | "black" }) {
  const label =
    side === "white"
      ? "White to move. Make it count."
      : "Black to move. Try not to improvise.";
  return (
    <div data-testid="train-prompt" className="mt-8 rounded-[8px] border border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-5 py-5">
      <p className="text-lg font-bold text-[var(--app-text)]">{label}</p>
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
            ? "border-[var(--app-accent)] bg-[var(--app-accent)] text-black"
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

function onboardingPrimaryButtonClass(isActive: boolean) {
  return [
    "min-h-12 rounded-[8px] border px-5 text-sm font-bold uppercase tracking-[0.12em] transition disabled:cursor-wait disabled:opacity-70",
    isActive
      ? "border-[var(--app-accent)] bg-[var(--app-accent)] text-black"
      : "border-[var(--app-border)] bg-[var(--app-surface-subtle)] text-[var(--app-text)] hover:border-[var(--app-accent)]",
  ].join(" ");
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

function getFenTurnSide(fen: string): TrainingMove["side"] {
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
      positions.push({
        index: positions.length,
        fen: fenAfter,
        label: move.san,
        move,
        pitchIndex: params.initialOpponentMove ? positions.length - 1 : positions.length,
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
        points.push({ value: move.evalBefore, positionIndex: index });
      }
      if (typeof move.evalAfter === "number") {
        points.push({
          value: move.evalAfter,
          positionIndex: index + 1,
          classification: move.classification,
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
      <div className="rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
          Blindspots Elo
        </p>
        <p className="mt-3 text-lg font-bold text-[var(--app-muted)]">Saving result...</p>
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
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
        Blindspots Elo
      </p>
      <div className="mt-6 flex flex-wrap items-baseline gap-3">
        <span className="text-3xl font-bold text-[var(--app-text)]">{result.eloBefore}</span>
        <span className="text-xl font-bold text-[var(--app-muted)]">→</span>
        <span className="text-3xl font-bold text-[var(--app-text)]">{result.eloAfter}</span>
        <span className={`text-xl font-bold ${deltaTone}`}>{signedDelta}</span>
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
  revealBadLines = false,
  hoveredDestinationSquare,
  hoveredIndex,
  onHoverLine,
  selectedMoveUci,
}: {
  lines: EngineLineResult[];
  isLoading: boolean;
  hasError?: boolean;
  revealBadLines?: boolean;
  hoveredDestinationSquare?: string | null;
  hoveredIndex?: number | null;
  onHoverLine?: (index: number | null) => void;
  selectedMoveUci?: string | null;
}) {
  const emptyMessage = isLoading
    ? "Receiving engine lines..."
    : hasError
      ? "No engine lines yet."
      : "Engine lines unavailable";
  return (
    <section className="grid gap-2" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
          Engine lines
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted-soft)]">
          {isLoading ? "Depth 18" : `${lines.length || 0} lines`}
        </span>
      </div>
      <div className={["grid gap-2", isLoading ? "opacity-60" : ""].join(" ")}>
        {lines.length === 0 ? (
          <div className="rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] px-3 py-4 text-xs font-bold text-[var(--app-muted)]">
            {emptyMessage}
          </div>
        ) : null}
        {lines.map((line, index) => {
          const lead = line.bestSan || line.bestMove;
          const pv = line.pvSan.slice(1).join(" ");
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
              className="relative cursor-default overflow-hidden rounded-none border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] py-2 pl-4 pr-3 transition-colors duration-100"
              style={{
                borderLeftColor: lineColor,
                borderLeftWidth: 3,
                background: isHovered ? "color-mix(in srgb, var(--app-accent) 6%, var(--app-surface-subtle))" : undefined,
                filter: isBlurred ? "blur(2px)" : undefined,
                opacity: isBlurred ? 0.48 : undefined,
              }}
              onPointerEnter={() => onHoverLine?.(index)}
              onPointerLeave={() => onHoverLine?.(null)}
            >
              <div className="grid grid-cols-[26px_minmax(0,1fr)_auto_auto_72px] items-center gap-2">
                <span className="text-right text-[10px] font-bold text-[var(--app-muted-soft)]">
                  #{index + 1}
                </span>
                <strong className="min-w-0 truncate text-sm font-bold" style={{ color: lineColor }}>
                  {lead}
                </strong>
                {isSelectedUserMove ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--app-accent)]">
                    Your move
                  </span>
                ) : cls ? (
                  <ClassificationBadge classification={cls} />
                ) : null}
                <span className="justify-self-end text-[10px] font-bold tabular-nums text-[var(--app-muted-soft)]">
                  {formatEval(line.cp)} d{line.depth || 18}
                </span>
              </div>
              <div className="mt-1 truncate pl-[34px] text-[11px] text-[var(--app-muted-soft)]">
                {pv || lead}
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
  isLoading,
  children,
}: {
  evalCp?: number;
  isLoading: boolean;
  children: ReactNode;
}) {
  const [lastEvalCp, setLastEvalCp] = useState<number | null>(null);

  useEffect(() => {
    if (typeof evalCp === "number") setLastEvalCp(evalCp);
  }, [evalCp]);

  const displayEvalCp = typeof evalCp === "number" ? evalCp : isLoading ? lastEvalCp : null;
  const clamped = typeof displayEvalCp === "number" ? Math.max(-600, Math.min(600, displayEvalCp)) : 0;
  const whitePct = 50 + (clamped / 600) * 42;
  const blackPct = 100 - whitePct;

  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-3">
      <div className="relative overflow-hidden rounded-[4px] border border-[var(--app-border-soft)] bg-black">
        <div
          className="absolute left-0 right-0 top-0 bg-white transition-[height] duration-200"
          style={{ height: `${whitePct}%` }}
        />
        <div
          className="absolute left-0 right-0 bottom-0 bg-black transition-[height] duration-200"
          style={{ height: `${blackPct}%` }}
        />
        <span className="absolute inset-x-0 top-1 text-center text-[9px] font-bold text-black">
          {typeof displayEvalCp === "number" ? formatEval(displayEvalCp) : isLoading ? "..." : "--"}
        </span>
      </div>
      {children}
    </div>
  );
}

function ResultsPanel({
  eloResult,
  isSaving,
  moves,
  userSide,
  startingFen,
  mode,
  positions,
  currentIndex,
  engineLines,
  isEngineLinesLoading,
  hasEngineLineError,
  isPieceSelected,
  hoveredAnnotationSquare,
  hoveredEngineLineIndex,
  onEngineLineHover,
  onMoveHover,
  onNavigate,
  onNextPosition,
  selectedMoveIndex,
  selectedMoveUci,
  onSelectMove,
}: {
  eloResult: EloResult | null;
  isSaving: boolean;
  moves: TrainingMove[];
  userSide: TrainingMove["side"];
  startingFen: string;
  mode: ResultMode;
  positions: SequencePosition[];
  currentIndex: number;
  engineLines: EngineLineResult[];
  isEngineLinesLoading: boolean;
  hasEngineLineError?: boolean;
  isPieceSelected: boolean;
  hoveredAnnotationSquare: string | null;
  hoveredEngineLineIndex: number | null;
  onEngineLineHover: (index: number | null) => void;
  onMoveHover: (move: { from: string; to: string } | null) => void;
  onNavigate: (index: number) => void;
  onNextPosition: () => void;
  selectedMoveIndex: number | null;
  selectedMoveUci: string | null;
  onSelectMove?: (positionIndex: number) => void;
}) {
  const userMoves = moves
    .map((move, index) => ({ ...move, absoluteIndex: index }))
    .filter((move) => move.side === userSide);
  const graphPoints = buildEvalGraphPoints(moves, userSide, startingFen);

  if (mode === "explore") {
    return (
      <div className="flex flex-1 flex-col gap-4 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        <EloResultCard result={eloResult} isLoading={isSaving} />
        <EngineLinesSection
          lines={engineLines}
          isLoading={isEngineLinesLoading}
          hasError={hasEngineLineError}
          revealBadLines={isPieceSelected}
          hoveredDestinationSquare={hoveredAnnotationSquare}
          hoveredIndex={hoveredEngineLineIndex}
          onHoverLine={onEngineLineHover}
          selectedMoveUci={selectedMoveUci}
        />
        <EvalGraph
          points={graphPoints}
          currentIndex={currentIndex}
          compact
          onSelectPosition={onNavigate}
        />
        <AnalysisMoveTable
          moves={userMoves}
          currentIndex={currentIndex}
          selectedMoveIndex={selectedMoveIndex}
          isAnalyzing={isSaving}
          compact
          onSelectPosition={
            onSelectMove
              ? (index) => onSelectMove(index)
              : undefined
          }
        />
        <div className="mt-auto pt-1">
          <button
            type="button"
            className={`${primaryActionClassName} w-full`}
            onClick={onNextPosition}
          >
            Next position
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 opacity-80 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
      <EloResultCard result={eloResult} isLoading={isSaving} />
      <EvalGraph points={graphPoints} currentIndex={positions.length - 1} compact />
      <AnalysisMoveTable moves={userMoves} isAnalyzing={isSaving} compact />
      <div className="pt-1">
        <button
          type="button"
          className={`${primaryActionClassName} w-full`}
          onClick={onNextPosition}
        >
          Next position
        </button>
      </div>
    </div>
  );
}

function EvalGraph({
  points: graphPoints,
  currentIndex,
  compact = false,
  onSelectPosition,
}: {
  points: EvalGraphPoint[];
  currentIndex: number;
  compact?: boolean;
  onSelectPosition?: (index: number) => void;
}) {
  const clampedValues = graphPoints.map((point) => Math.max(-600, Math.min(600, point.value)));
  const width = 520;
  const height = compact ? 108 : 128;
  const padding = 18;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const points = clampedValues.map((value, index) => {
    const x = padding + (clampedValues.length <= 1 ? 0 : (index / (clampedValues.length - 1)) * usableWidth);
    const y = padding + ((600 - value) / 1200) * usableHeight;
    return { ...graphPoints[index]!, x, y, value: graphPoints[index]!.value };
  });

  return (
    <div className="grid gap-2">
      <div className={[compact ? "h-28" : "h-36", "overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)]"].join(" ")}>
        {points.length >= 2 ? (
          <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Sequence eval graph">
            <line
              x1={padding}
              x2={width - padding}
              y1={height / 2}
              y2={height / 2}
              stroke="color-mix(in srgb, var(--app-border-strong) 16%, transparent)"
              strokeDasharray="5 6"
            />
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
                  {formatEval(point.value)}
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
  );
}

function AnalysisMoveTable({
  moves,
  currentIndex,
  selectedMoveIndex,
  isAnalyzing,
  compact = false,
  onSelectPosition,
  onHoverMove,
}: {
  moves: Array<TrainingMove & { absoluteIndex?: number }>;
  currentIndex?: number;
  selectedMoveIndex?: number | null;
  isAnalyzing?: boolean;
  compact?: boolean;
  onSelectPosition?: (index: number) => void;
  onHoverMove?: (move: { from: string; to: string } | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)]">
      <div className="grid min-h-8 grid-cols-[minmax(0,1.1fr)_68px_68px_76px] items-center border-b border-[var(--app-border-soft)] px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
        <span>Move</span>
        <span className="text-right">Before</span>
        <span className="text-right">After</span>
        <span className="text-right">Loss</span>
      </div>
      {moves.length === 0 ? (
        <div className="px-3 py-4 text-sm text-[var(--app-muted)]">No move grades yet.</div>
      ) : null}
      {moves.map((move, index) => {
        const positionIndex = (move.absoluteIndex ?? index) + 1;
        const isSelected = selectedMoveIndex != null && selectedMoveIndex === positionIndex;
        const pendingValue = isAnalyzing ? "..." : "--";
        return (
        <button
          type="button"
          key={`${move.uci}-${index}`}
          className={[
            "grid w-full grid-cols-[minmax(0,1.1fr)_68px_68px_76px] items-center border-b border-[var(--app-border-soft)] px-3 text-left last:border-b-0",
            compact ? "min-h-9 text-xs" : "min-h-10 text-sm",
            onSelectPosition ? "cursor-pointer transition" : "cursor-default",
            currentIndex === positionIndex || isSelected ? "bg-[var(--app-highlight-soft)]" : "",
          ].join(" ")}
          disabled={!onSelectPosition}
          onClick={() => onSelectPosition?.(positionIndex)}
          onPointerEnter={() => onHoverMove?.(moveFromUci(move.uci))}
          onPointerLeave={() => onHoverMove?.(null)}
        >
          <span className="flex min-w-0 items-center gap-2 font-bold">
            {move.classification ? <ClassificationBadge classification={move.classification} /> : null}
            <span className="truncate" style={{ color: classificationColor(move.classification) }}>
              {move.san}
            </span>
          </span>
          <span className="overflow-hidden whitespace-nowrap text-right tabular-nums text-[var(--app-muted)]">
            {typeof move.evalBefore === "number" ? formatEval(move.evalBefore) : pendingValue}
          </span>
          <span className="overflow-hidden whitespace-nowrap text-right tabular-nums text-[var(--app-muted)]">
            {typeof move.evalAfter === "number" ? formatEval(move.evalAfter) : pendingValue}
          </span>
          <span className="overflow-hidden whitespace-nowrap text-right tabular-nums text-[var(--app-muted)]">
            {typeof move.cpLoss === "number" ? `${move.cpLoss}cp` : pendingValue}
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
}: {
  moves: TrainingMove[];
  userSide: TrainingMove["side"];
  isOpponentThinking: boolean;
  showHeaders?: boolean;
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
              {row.white?.classification ? <ClassificationBadge classification={row.white.classification} /> : null}
              <span className="truncate" style={{ color: classificationColor(row.white?.classification) }}>
                {row.white?.san ?? ""}
              </span>
              {typeof row.white?.cpLoss === "number" ? (
                <span className="shrink-0 text-[11px] font-normal text-[var(--app-muted)]">
                  {row.white.cpLoss}cp
                </span>
              ) : null}
            </span>
            <span data-testid="train-move-black" className="flex min-w-0 items-center gap-2 font-bold">
              {row.black?.classification ? <ClassificationBadge classification={row.black.classification} /> : null}
              <span className="truncate" style={{ color: classificationColor(row.black?.classification) }}>
                {row.black?.san ?? ""}
              </span>
              {typeof row.black?.cpLoss === "number" ? (
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

function formatEval(cp: number) {
  if (Math.abs(cp) >= 600) return cp > 0 ? "+6.0" : "-6.0";
  const pawns = cp / 100;
  if (Math.abs(pawns) < 0.05) return "0.0";
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

function buildEngineArrows(
  lines: EngineLineResult[],
  emphasizedMoveUci: string | null = null,
): EngineArrow[] {
  return lines.map((line, index) => ({
    from: line.bestMove.slice(0, 2),
    to: line.bestMove.slice(2, 4),
    label: formatEval(line.cp),
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
