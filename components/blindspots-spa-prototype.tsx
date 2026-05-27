"use client";

import { AuthSignOutButton } from "@/components/auth-sign-out-button";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { AnalysisBoard, type BoardMove } from "@/components/chess/analysis-board";
import type { AppTheme } from "@/lib/app-theme";
import {
  MAIA3_DEFAULT_OPPO_ELO,
  MAIA3_DEFAULT_SELF_ELO,
  MAIA3_MODEL_URL,
  MAIA3_OPPONENT_MODE,
} from "@/lib/maia3/maia3-constants";
import type { Maia3WorkerRequest, Maia3WorkerResponse } from "@/lib/maia3/maia3-worker-protocol";
import type { StockfishAnalysisRequest, StockfishAnalysisResponse } from "@/lib/stockfish-client/stockfish-analysis-protocol";
import type { ClientSequenceAnalysis } from "@/lib/stockfish-client/stockfish-analysis-types";
import {
  buildRestoredBoardState,
  parseCompleteSequenceResponse,
  parseActiveSessionResponse,
  parseColdCandidateResponse,
  parseRequiredActiveSessionResponse,
  type SpaActiveSession,
  type SpaBoardHistoryEntry,
  type SpaCompletionResult,
  type SpaColdCandidate,
} from "@/lib/training/spa-training-hydration";

type BoardHistoryEntry = SpaBoardHistoryEntry;
type SplashPhase = "blank" | "branded" | "hidden";
type TrainingLoadState = "loading" | "ready" | "error";
type TrainingActionState = "idle" | "finishing" | "loading-next";
type TrainingViewMode = "playing" | "analysis";

const SPLASH_BRAND_DELAY_MS = 250;
const SPLASH_COMPLETE_DELAY_MS = 1250;
const EMPTY_BOARD_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";

const TODAY = {
  due: 3,
  done: 2,
  target: 10,
  reviewDue: 2,
  newFromGames: 1,
  rating: 1842,
  ratingHistory: [1801, 1798, 1812, 1820, 1818, 1824, 1831, 1835, 1842],
};

export function BlindspotsSpaPrototype({
  initialTheme,
}: {
  initialTheme: AppTheme;
}) {
  const [theme, setTheme] = useState<AppTheme>(initialTheme);
  const [splashPhase, setSplashPhase] = useState<SplashPhase>("blank");
  const [trainingLoadState, setTrainingLoadState] = useState<TrainingLoadState>("loading");
  const [trainingLoadError, setTrainingLoadError] = useState<string | null>(null);
  const [coldCandidate, setColdCandidate] = useState<SpaColdCandidate | null>(null);
  const [activeSession, setActiveSession] = useState<SpaActiveSession | null>(null);
  const [completionResult, setCompletionResult] = useState<SpaCompletionResult | null>(null);
  const [trainingActionState, setTrainingActionState] = useState<TrainingActionState>("idle");
  const [trainingActionError, setTrainingActionError] = useState<string | null>(null);
  const [moveSyncError, setMoveSyncError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<TrainingViewMode>("playing");
  const [clientAnalysis, setClientAnalysis] = useState<ClientSequenceAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [completionSaveError, setCompletionSaveError] = useState<string | null>(null);
  const [selectedAnalysisMoveIndex, setSelectedAnalysisMoveIndex] = useState<number | null>(null);
  const [stockfishReady, setStockfishReady] = useState(false);
  const [stockfishInitStarted, setStockfishInitStarted] = useState(false);
  const [maiaReady, setMaiaReady] = useState(false);
  const [maiaThinking, setMaiaThinking] = useState(false);
  const [maiaError, setMaiaError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ from: string; to: string } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [addFenOpen, setAddFenOpen] = useState(false);
  const [inSession, setInSession] = useState(false);
  const [boardFen, setBoardFen] = useState(EMPTY_BOARD_FEN);
  const [boardHistory, setBoardHistory] = useState<BoardHistoryEntry[]>([
    { fen: EMPTY_BOARD_FEN, lastMove: null },
  ]);
  const [boardHistoryIndex, setBoardHistoryIndex] = useState(0);
  const optimisticMoveUcisRef = useRef<string[]>([]);
  const confirmedSessionRef = useRef<SpaActiveSession | null>(null);
  const coldCandidateRef = useRef<SpaColdCandidate | null>(null);
  const syncInFlightRef = useRef(false);
  const syncGenerationRef = useRef(0);
  const completionRequestedGenerationRef = useRef<number | null>(null);
  const visibleBoardFenRef = useRef(EMPTY_BOARD_FEN);
  const visibleBoardHistoryRef = useRef<BoardHistoryEntry[]>([
    { fen: EMPTY_BOARD_FEN, lastMove: null },
  ]);
  const visibleBoardHistoryIndexRef = useRef(0);
  const maiaWorkerRef = useRef<Worker | null>(null);
  const maiaRequestIdRef = useRef<string | null>(null);
  const maiaRequestedKeyRef = useRef<string | null>(null);
  const stockfishWorkerRef = useRef<Worker | null>(null);
  const stockfishRequestIdRef = useRef<string | null>(null);
  const pendingAnalysisGenerationRef = useRef<number | null>(null);
  const clientAnalysisRef = useRef<ClientSequenceAnalysis | null>(null);
  const completionStartedGenerationRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const brandTimer = window.setTimeout(() => {
      setSplashPhase("branded");
    }, SPLASH_BRAND_DELAY_MS);

    const completeTimer = window.setTimeout(() => {
      setSplashPhase("hidden");
    }, SPLASH_COMPLETE_DELAY_MS);

    return () => {
      window.clearTimeout(brandTimer);
      window.clearTimeout(completeTimer);
    };
  }, []);

  function createMaiaWorker() {
    const existingWorker = maiaWorkerRef.current;
    if (existingWorker) {
      existingWorker.terminate();
      maiaWorkerRef.current = null;
    }

    const worker = new Worker(new URL("../workers/maia3-opponent.worker.ts", import.meta.url), {
      type: "module",
    });

    maiaWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<Maia3WorkerResponse>) => {
      const response = event.data;

      if (response.type === "ready") {
        setMaiaReady(true);
        return;
      }

      if (
        response.requestId &&
        response.requestId !== maiaRequestIdRef.current
      ) {
        return;
      }

      setMaiaThinking(false);

      if (response.type === "error") {
        setMaiaError("Opponent unavailable.");
        return;
      }

      const generation = syncGenerationRef.current;

      try {
        const isTerminal = appendOptimisticMoveUci(response.uci);

        if (isTerminal) {
          beginAnalysisTransition("terminal");
        }

        void flushOptimisticMovesToServer(generation);
      } catch {
        setMaiaError("Opponent unavailable.");
      }
    };

    const request: Maia3WorkerRequest = {
      type: "initialize",
      modelUrl: MAIA3_MODEL_URL,
    };
    worker.postMessage(request);
  }

  useEffect(() => {
    createMaiaWorker();

    return () => {
      maiaWorkerRef.current?.terminate();
      maiaWorkerRef.current = null;
    };
  }, []);

  function createStockfishWorker() {
    const existingWorker = stockfishWorkerRef.current;
    if (existingWorker) {
      existingWorker.terminate();
      stockfishWorkerRef.current = null;
    }

    setStockfishReady(false);

    const worker = new Worker(new URL("../workers/stockfish-analysis.worker.ts", import.meta.url), {
      type: "module",
    });

    stockfishWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<StockfishAnalysisResponse>) => {
      const response = event.data;

      if (response.type === "ready") {
        setStockfishReady(true);
        const generation = pendingAnalysisGenerationRef.current;
        if (generation !== null) startClientSequenceAnalysis(generation);
        return;
      }

      if (response.requestId && response.requestId !== stockfishRequestIdRef.current) {
        return;
      }

      if (response.type === "error") {
        setAnalysisError("Analysis unavailable.");
        setTrainingActionState("idle");
        return;
      }

      clientAnalysisRef.current = response.analysis;
      setClientAnalysis(response.analysis);
      setSelectedAnalysisMoveIndex(response.analysis.learnerMoves[0]?.moveIndex ?? null);
      maybeCompleteAnalyzedSequence(syncGenerationRef.current);
    };

    const request: StockfishAnalysisRequest = { type: "initialize" };
    worker.postMessage(request);
  }

  function applyColdCandidate(candidate: SpaColdCandidate) {
    syncGenerationRef.current += 1;
    optimisticMoveUcisRef.current = [];
    confirmedSessionRef.current = null;
    coldCandidateRef.current = candidate;
    completionRequestedGenerationRef.current = null;
    completionStartedGenerationRef.current = null;
    pendingAnalysisGenerationRef.current = null;
    clientAnalysisRef.current = null;
    visibleBoardFenRef.current = candidate.fen;
    visibleBoardHistoryRef.current = [{ fen: candidate.fen, lastMove: null }];
    visibleBoardHistoryIndexRef.current = 0;
    maiaRequestIdRef.current = null;
    maiaRequestedKeyRef.current = null;
    setMaiaThinking(false);
    setMaiaError(null);
    setMoveSyncError(null);
    setViewMode("playing");
    setClientAnalysis(null);
    setAnalysisError(null);
    setCompletionSaveError(null);
    setSelectedAnalysisMoveIndex(null);
    setActiveSession(null);
    setColdCandidate(candidate);
    setCompletionResult(null);
    setBoardFen(candidate.fen);
    setBoardHistory([{ fen: candidate.fen, lastMove: null }]);
    setBoardHistoryIndex(0);
    setCommitted(null);
    setSelected(null);
    setInSession(false);
  }

  function applyPersistedSession(session: SpaActiveSession, options?: { restoreTerminalToAnalysis?: boolean }) {
    const restoredBoard = buildRestoredBoardState(session);
    const restoredIsTerminal = options?.restoreTerminalToAnalysis && (() => {
      try { return new Chess(restoredBoard.fen).isGameOver(); } catch { return false; }
    })();

    const generation = syncGenerationRef.current + 1;
    syncGenerationRef.current = generation;

    confirmedSessionRef.current = session;
    coldCandidateRef.current = null;
    optimisticMoveUcisRef.current = session.moves.map((move) => move.uci);
    completionRequestedGenerationRef.current = restoredIsTerminal ? generation : null;
    completionStartedGenerationRef.current = null;
    pendingAnalysisGenerationRef.current = restoredIsTerminal ? generation : null;
    clientAnalysisRef.current = null;
    visibleBoardFenRef.current = restoredBoard.fen;
    visibleBoardHistoryRef.current = restoredBoard.history;
    visibleBoardHistoryIndexRef.current = restoredBoard.historyIndex;
    maiaRequestIdRef.current = null;
    maiaRequestedKeyRef.current = null;
    setMaiaThinking(false);
    setMaiaError(null);
    setMoveSyncError(null);
    setViewMode(restoredIsTerminal ? "analysis" : "playing");
    setClientAnalysis(null);
    setAnalysisError(null);
    setCompletionSaveError(null);
    setSelectedAnalysisMoveIndex(null);
    setActiveSession(session);
    setColdCandidate(null);
    setCompletionResult(null);
    setTrainingActionState(restoredIsTerminal ? "finishing" : "idle");
    setBoardFen(restoredBoard.fen);
    setBoardHistory(restoredBoard.history);
    setBoardHistoryIndex(restoredBoard.historyIndex);
    setCommitted(restoredBoard.lastMove);
    setSelected(null);
    setInSession(true);

    return { restoredBoard, restoredIsTerminal, generation };
  }

  function readApiError(value: unknown, fallback: string): string {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "error" in value &&
      typeof value.error === "string" &&
      value.error.length > 0
    ) {
      return value.error;
    }

    return fallback;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTrainingBoardState() {
      setTrainingLoadState("loading");
      setTrainingLoadError(null);

      try {
        const activeResponse = await fetch("/api/train/active-session", {
          method: "GET",
          cache: "no-store",
        });

        if (!activeResponse.ok) {
          throw new Error("Failed to load active training session.");
        }

        const restoredSession = parseActiveSessionResponse(await activeResponse.json());

        if (restoredSession) {
          if (cancelled) return;

          const { restoredIsTerminal } = applyPersistedSession(restoredSession, { restoreTerminalToAnalysis: true });
          setTrainingLoadState("ready");

          if (restoredIsTerminal) {
            createStockfishWorker();
            setStockfishInitStarted(true);
          }

          return;
        }

        const nextResponse = await fetch(
          "/api/train/next-position",
          {
            method: "GET",
            cache: "no-store",
          },
        );

        if (!nextResponse.ok) {
          throw new Error("Failed to load the next training position.");
        }

        const candidate = parseColdCandidateResponse(await nextResponse.json());

        if (cancelled) return;

        applyColdCandidate(candidate);
        setTrainingLoadState("ready");
      } catch (error) {
        if (cancelled) return;

        setActiveSession(null);
        setColdCandidate(null);
        setCompletionResult(null);
        setTrainingActionState("idle");
        setTrainingActionError(null);
        setMoveSyncError(null);
        confirmedSessionRef.current = null;
        coldCandidateRef.current = null;
        optimisticMoveUcisRef.current = [];
        completionRequestedGenerationRef.current = null;
        syncGenerationRef.current += 1;
        visibleBoardFenRef.current = EMPTY_BOARD_FEN;
        visibleBoardHistoryRef.current = [{ fen: EMPTY_BOARD_FEN, lastMove: null }];
        visibleBoardHistoryIndexRef.current = 0;
        maiaRequestIdRef.current = null;
        maiaRequestedKeyRef.current = null;
        setMaiaThinking(false);
        setMaiaError(null);
        setBoardFen(EMPTY_BOARD_FEN);
        setBoardHistory([{ fen: EMPTY_BOARD_FEN, lastMove: null }]);
        setBoardHistoryIndex(0);
        setCommitted(null);
        setSelected(null);
        setInSession(false);
        setTrainingLoadError(
          error instanceof Error ? error.message : "Failed to load training state.",
        );
        setTrainingLoadState("error");
      }
    }

    void loadTrainingBoardState();

    return () => {
      cancelled = true;
    };
  }, []);

  const stage = completionResult || viewMode === "analysis" ? "review" : inSession || committed ? "playing" : "loaded";
  const hasBlockingInitializationError = trainingLoadState === "error" || maiaError !== null;
  const showSplash = !hasBlockingInitializationError && (splashPhase !== "hidden" || trainingLoadState === "loading" || !maiaReady);
  const visibleSplashPhase: Exclude<SplashPhase, "hidden"> =
    splashPhase === "blank" ? "blank" : "branded";
  const isLatestBoardState = boardHistoryIndex === boardHistory.length - 1;

  let learnerSide: "w" | "b" | null = null;
  let currentTurn: "w" | "b" | null = null;

  try {
    const startingFen = activeSession?.startingFen ?? coldCandidate?.fen ?? null;

    learnerSide = startingFen ? new Chess(startingFen).turn() : null;
    currentTurn = new Chess(boardFen).turn();
  } catch {
    learnerSide = null;
    currentTurn = null;
  }

  const isOpponentTurn =
    (activeSession !== null || coldCandidate !== null || inSession) &&
    completionResult === null &&
    learnerSide !== null &&
    currentTurn !== null &&
    currentTurn !== learnerSide;
  const legacySessionBlocked =
    activeSession !== null && activeSession.opponentMode !== MAIA3_OPPONENT_MODE;

  const learnerColor: "white" | "black" =
    learnerSide === "b" ? "black" : "white";
  const opponentColor: "white" | "black" =
    learnerColor === "white" ? "black" : "white";

  const learnerTurn =
    trainingLoadState === "ready" &&
    completionResult === null &&
    !isOpponentTurn;
  const opponentTurn =
    trainingLoadState === "ready" &&
    completionResult === null &&
    isOpponentTurn;

  const trainingBoardInteractive =
    trainingLoadState === "ready" &&
    (trainingActionState === "idle") &&
    viewMode === "playing" &&
    maiaReady &&
    !maiaThinking &&
    !maiaError &&
    !legacySessionBlocked &&
    completionResult === null &&
    learnerSide !== null &&
    currentTurn === learnerSide &&
    isLatestBoardState &&
    (activeSession !== null || coldCandidate !== null);

  const canNavigateHistory =
    (trainingActionState === "idle" || viewMode === "analysis") && boardHistory.length > 1;
  const lastMove = committed ? [committed.from, committed.to] : [];

  async function handleToggleTheme() {
    const nextTheme: AppTheme = theme === "paper" ? "dark" : "paper";

    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;

    const formData = new FormData();
    formData.set("next", "/");
    formData.set("theme", nextTheme);

    const response = await fetch("/auth/theme/save", {
      method: "POST",
      headers: {
        "x-chessview-fetch": "1",
      },
      body: formData,
    });

    if (!response.ok) {
      const previousTheme: AppTheme = nextTheme === "paper" ? "dark" : "paper";
      setTheme(previousTheme);
      document.documentElement.dataset.theme = previousTheme;
    }
  }

  function sameMoveUcis(left: string[], right: string[]) {
    return left.length === right.length && left.every((move, index) => move === right[index]);
  }

  async function persistFirstOptimisticMove(candidate: SpaColdCandidate, firstMoveUci: string) {
    return fetch("/api/train/active-session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(
        candidate.candidateType === "personal"
          ? {
              candidateType: "personal",
              queueSource: candidate.queueSource,
              trainingItemId: candidate.trainingItemId,
              firstMoveUci,
            }
          : {
              candidateType: "filler",
              queueSource: "filler",
              fillerId: candidate.fillerId,
              fillerOrigin: candidate.fillerOrigin,
              firstMoveUci,
            },
      ),
    });
  }

  async function persistOptimisticMoveList(session: SpaActiveSession, moveUcis: string[]) {
    return fetch("/api/train/active-session", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sessionId: session.id,
        moveUcis,
      }),
    });
  }

  function rollbackUnsyncedMoves() {
    completionRequestedGenerationRef.current = null;
    const confirmedSession = confirmedSessionRef.current;

    if (confirmedSession) {
      const restoredBoard = buildRestoredBoardState(confirmedSession);
      optimisticMoveUcisRef.current = confirmedSession.moves.map((move) => move.uci);
      visibleBoardFenRef.current = restoredBoard.fen;
      visibleBoardHistoryRef.current = restoredBoard.history;
      visibleBoardHistoryIndexRef.current = restoredBoard.historyIndex;
      setActiveSession(confirmedSession);
      setColdCandidate(null);
      setBoardFen(restoredBoard.fen);
      setBoardHistory(restoredBoard.history);
      setBoardHistoryIndex(restoredBoard.historyIndex);
      setCommitted(restoredBoard.lastMove);
      setSelected(null);
      setInSession(true);
    } else {
      const candidate = coldCandidateRef.current;
      optimisticMoveUcisRef.current = [];
      visibleBoardFenRef.current = candidate?.fen ?? EMPTY_BOARD_FEN;
      visibleBoardHistoryRef.current = [{ fen: candidate?.fen ?? EMPTY_BOARD_FEN, lastMove: null }];
      visibleBoardHistoryIndexRef.current = 0;
      setActiveSession(null);
      setColdCandidate(candidate);
      setBoardFen(candidate?.fen ?? EMPTY_BOARD_FEN);
      setBoardHistory([{ fen: candidate?.fen ?? EMPTY_BOARD_FEN, lastMove: null }]);
      setBoardHistoryIndex(0);
      setCommitted(null);
      setSelected(null);
      setInSession(false);
    }

    setTrainingActionState("idle");
    setMoveSyncError(
      "Your recent moves could not be synced. The board was restored to the last saved position.",
    );
  }

  async function completeConfirmedSequence(session: SpaActiveSession, analysis: ClientSequenceAnalysis | null) {
    setTrainingActionState("finishing");
    setTrainingActionError(null);
    setCompletionSaveError(null);

    async function requestCompletionResult() {
      const response = await fetch("/api/train/complete-sequence", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.id,
          clientAnalysis: analysis,
        }),
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          readApiError(responseBody, "Failed to complete the current sequence."),
        );
      }

      return parseCompleteSequenceResponse(responseBody);
    }

    try {
      let result: SpaCompletionResult;

      try {
        result = await requestCompletionResult();
      } catch {
        result = await requestCompletionResult();
      }

      setCompletionResult(result);
      setSelected(null);
      setTrainingActionState("idle");
    } catch (error) {
      completionStartedGenerationRef.current = null;
      setCompletionSaveError(
        error instanceof Error ? error.message : "Could not save result.",
      );
      setTrainingActionState("idle");
    }
  }

  async function flushOptimisticMovesToServer(generation: number) {
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;

    try {
      while (generation === syncGenerationRef.current) {
        const optimisticMoveUcis = optimisticMoveUcisRef.current;
        let confirmedSession = confirmedSessionRef.current;

        if (optimisticMoveUcis.length === 0) {
          break;
        }

        if (!confirmedSession) {
          const candidate = coldCandidateRef.current;

          if (!candidate) {
            throw new Error("No loaded training position is available.");
          }

          const response = await persistFirstOptimisticMove(candidate, optimisticMoveUcis[0]!);
          const responseBody = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(readApiError(responseBody, "Failed to save the played move."));
          }

          const persistedSession = parseRequiredActiveSessionResponse(responseBody);

          if (generation !== syncGenerationRef.current) {
            return;
          }

          confirmedSessionRef.current = persistedSession;
          confirmedSession = persistedSession;
          coldCandidateRef.current = null;
          setActiveSession(persistedSession);
          setColdCandidate(null);
          continue;
        }

        const confirmedMoveUcis = confirmedSession.moves.map((move) => move.uci);

        if (confirmedMoveUcis.length < optimisticMoveUcis.length) {
          const moveUcisSnapshot = optimisticMoveUcis.slice();
          const response = await persistOptimisticMoveList(confirmedSession, moveUcisSnapshot);
          const responseBody = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(readApiError(responseBody, "Failed to save the played move."));
          }

          const persistedSession = parseRequiredActiveSessionResponse(responseBody);

          if (generation !== syncGenerationRef.current) {
            return;
          }

          confirmedSessionRef.current = persistedSession;
          setActiveSession(persistedSession);
          continue;
        }

        if (!sameMoveUcis(confirmedMoveUcis, optimisticMoveUcis)) {
          throw new Error("Saved training state does not match the played moves.");
        }

        const restoredBoard = buildRestoredBoardState(confirmedSession);

        if (restoredBoard.fen !== visibleBoardFenRef.current) {
          throw new Error("Saved training state does not match the played moves.");
        }

        maybeCompleteAnalyzedSequence(generation);

        break;
      }
    } catch {
      if (generation === syncGenerationRef.current) {
        rollbackUnsyncedMoves();
      }
    } finally {
      syncInFlightRef.current = false;

      if (
        generation === syncGenerationRef.current &&
        completionRequestedGenerationRef.current === null
      ) {
        const confirmedLength = confirmedSessionRef.current?.moves.length ?? 0;

        if (optimisticMoveUcisRef.current.length > confirmedLength) {
          void flushOptimisticMovesToServer(generation);
        }
      }
    }
  }

  function completePersistedSequence() {
    beginAnalysisTransition("finish");
  }

  function beginAnalysisTransition(_reason: "finish" | "terminal") {
    const generation = syncGenerationRef.current;

    setViewMode("analysis");
    setTrainingActionState("finishing");
    setTrainingActionError(null);
    setMoveSyncError(null);
    setAnalysisError(null);
    setCompletionSaveError(null);
    setClientAnalysis(null);
    setMaiaThinking(false);
    maiaRequestIdRef.current = null;
    maiaRequestedKeyRef.current = null;
    completionRequestedGenerationRef.current = generation;
    completionStartedGenerationRef.current = null;
    clientAnalysisRef.current = null;

    if (!stockfishInitStarted) {
      setStockfishInitStarted(true);
      createStockfishWorker();
    }

    startClientSequenceAnalysis(generation);
    void flushOptimisticMovesToServer(generation);
  }

  function retryClientSequenceAnalysis() {
    const generation = syncGenerationRef.current;
    setAnalysisError(null);
    setStockfishReady(false);
    pendingAnalysisGenerationRef.current = generation;
    createStockfishWorker();
  }

  function startClientSequenceAnalysis(generation: number) {
    const worker = stockfishWorkerRef.current;
    const startingFen = confirmedSessionRef.current?.startingFen ?? coldCandidateRef.current?.fen;

    pendingAnalysisGenerationRef.current = generation;

    if (!worker || !startingFen || !stockfishReady) return;

    const learnerSideForAnalysis = new Chess(startingFen).turn();
    const requestId = `stockfish-${generation}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    stockfishRequestIdRef.current = requestId;
    pendingAnalysisGenerationRef.current = null;

    const request: StockfishAnalysisRequest = {
      type: "analyze-sequence",
      requestId,
      startingFen,
      moveUcis: optimisticMoveUcisRef.current.slice(),
      learnerSide: learnerSideForAnalysis,
    };
    worker.postMessage(request);
  }

  function maybeCompleteAnalyzedSequence(generation: number) {
    if (
      generation !== syncGenerationRef.current ||
      completionRequestedGenerationRef.current !== generation ||
      completionStartedGenerationRef.current === generation
    ) {
      return;
    }

    const session = confirmedSessionRef.current;
    const analysis = clientAnalysisRef.current;

    if (!session || !analysis) return;

    const confirmedUcis = session.moves.map((move) => move.uci);
    if (!sameMoveUcis(confirmedUcis, optimisticMoveUcisRef.current)) return;

    completionStartedGenerationRef.current = generation;
    void completeConfirmedSequence(session, analysis);
  }

  function appendOptimisticMoveUci(uci: string): boolean {
    const chess = new Chess(visibleBoardFenRef.current);
    const played = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });

    if (!played) {
      throw new Error("Move is not legal on the visible board.");
    }

    const nextFen = chess.fen();
    const nextHistory = [
      ...visibleBoardHistoryRef.current.slice(0, visibleBoardHistoryIndexRef.current + 1),
      { fen: nextFen, lastMove: { from: played.from, to: played.to } },
    ];

    optimisticMoveUcisRef.current = [
      ...optimisticMoveUcisRef.current,
      `${played.from}${played.to}${played.promotion ?? ""}`,
    ];
    visibleBoardFenRef.current = nextFen;
    visibleBoardHistoryRef.current = nextHistory;
    visibleBoardHistoryIndexRef.current = nextHistory.length - 1;
    maiaRequestedKeyRef.current = null;
    setBoardFen(nextFen);
    setBoardHistory(nextHistory);
    setBoardHistoryIndex(nextHistory.length - 1);
    setCommitted({ from: played.from, to: played.to });
    setSelected(null);
    setInSession(true);
    setTrainingActionError(null);
    setMoveSyncError(null);

    return chess.isGameOver();
  }

  function retryMaiaInitialization() {
    setMaiaReady(false);
    setMaiaError(null);
    setMaiaThinking(false);
    maiaRequestIdRef.current = null;
    maiaRequestedKeyRef.current = null;
    createMaiaWorker();
  }

  function requestMaiaReplyForCurrentPosition(options?: { retry?: boolean }) {
    if (maiaThinking || viewMode === "analysis" || completionResult || legacySessionBlocked) {
      return;
    }

    if (!maiaReady) {
      if (options?.retry) {
        retryMaiaInitialization();
      }
      return;
    }

    if (!options?.retry && maiaError) return;

    const worker = maiaWorkerRef.current;
    const startingFen = confirmedSessionRef.current?.startingFen ?? coldCandidateRef.current?.fen;

    if (!worker || !startingFen) return;

    const chess = new Chess(visibleBoardFenRef.current);

    if (chess.isGameOver() || learnerSide === null || chess.turn() === learnerSide) {
      return;
    }

    const generation = syncGenerationRef.current;
    const moveUcis = optimisticMoveUcisRef.current.slice();
    const requestKey = `${generation}:${moveUcis.join(" ")}`;

    if (maiaRequestedKeyRef.current === requestKey) {
      return;
    }

    const requestId = `maia-${generation}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    maiaRequestedKeyRef.current = requestKey;
    maiaRequestIdRef.current = requestId;
    setMaiaThinking(true);
    setMaiaError(null);

    const request: Maia3WorkerRequest = {
      type: "generate-move",
      requestId,
      startingFen,
      moveUcis,
      selfElo: MAIA3_DEFAULT_SELF_ELO,
      oppoElo: MAIA3_DEFAULT_OPPO_ELO,
    };
    worker.postMessage(request);
  }

  function handleBoardMove(move: BoardMove) {
    if (!trainingBoardInteractive) return;

    let isTerminal = false;

    try {
      const uci = `${move.from}${move.to}${move.uci?.[4] ?? ""}`;
      isTerminal = appendOptimisticMoveUci(uci);
    } catch {
      return;
    }

    const generation = syncGenerationRef.current;

    if (isTerminal) {
      beginAnalysisTransition("terminal");
    } else {
      requestMaiaReplyForCurrentPosition();
    }

    void flushOptimisticMovesToServer(generation);
  }

  function stepBoard(delta: -1 | 1) {
    const nextIndex = boardHistoryIndex + delta;
    const entry = boardHistory[nextIndex];
    if (!entry) return;
    visibleBoardFenRef.current = entry.fen;
    visibleBoardHistoryIndexRef.current = nextIndex;
    setBoardHistoryIndex(nextIndex);
    setBoardFen(entry.fen);
    setCommitted(entry.lastMove);
    setSelected(null);
    if (boardHistory.length > 1) setInSession(true);
  }

  function selectAnalyzedMove(moveIndex: number) {
    const historyIndex = moveIndex + 1;
    const entry = boardHistory[historyIndex];
    if (!entry) return;

    visibleBoardFenRef.current = entry.fen;
    visibleBoardHistoryIndexRef.current = historyIndex;
    setSelectedAnalysisMoveIndex(moveIndex);
    setBoardHistoryIndex(historyIndex);
    setBoardFen(entry.fen);
    setCommitted(entry.lastMove);
    setSelected(null);
  }

  async function loadNextSequence() {
    setTrainingActionState("loading-next");
    setTrainingActionError(null);

    try {
      const response = await fetch("/api/train/next-position", {
        method: "GET",
        cache: "no-store",
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          readApiError(responseBody, "Failed to load the next training position."),
        );
      }

      const candidate = parseColdCandidateResponse(responseBody);

      applyColdCandidate(candidate);
      setTrainingActionState("idle");
    } catch (error) {
      setTrainingActionError(
        error instanceof Error ? error.message : "Failed to load the next training position.",
      );
      setTrainingActionState("idle");
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!canNavigateHistory) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isEditing =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.getAttribute("contenteditable") === "true";

      if (isEditing) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepBoard(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepBoard(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [boardHistory, boardHistoryIndex, canNavigateHistory]);

  useEffect(() => {
    if (trainingLoadState !== "ready" || !isLatestBoardState) return;
    requestMaiaReplyForCurrentPosition();
  }, [
    trainingLoadState,
    isLatestBoardState,
    maiaReady,
    maiaThinking,
    maiaError,
    boardFen,
    activeSession,
    completionResult,
    legacySessionBlocked,
  ]);

  return (
    <div className="bs-kit-app" aria-busy={showSplash}>
      {showSplash ? <SpaBootSplash phase={visibleSplashPhase} /> : null}
      <ShellActions
        theme={theme}
        onToggleTheme={() => {
          void handleToggleTheme();
        }}
        onAddFen={() => setAddFenOpen(true)}
      />
      <AddFenSheet open={addFenOpen} onClose={() => setAddFenOpen(false)} onAdd={() => setAddFenOpen(false)} />

      <div className="bs-kit-workspace">
        <div className="bs-kit-board-pane">
          <div className="bs-kit-board-stack">
            <PlayerStrip
              side={flipped ? learnerColor : opponentColor}
              name={flipped ? "You" : "Opponent"}
              turn={flipped ? learnerTurn : opponentTurn}
            />
            <div className="bs-kit-board-wrap">
              <AnalysisBoard
                fen={boardFen}
                mode="training"
                orientation={flipped ? opponentColor : learnerColor}
                coordinates
                boardTheme="paper"
                pieceTheme="blindspots"
                pieceAnimation
                showLegalTargets
                selectedSquare={selected}
                lastMove={committed}
                highlightedSquares={[]}
                disabled={!trainingBoardInteractive}
                onMove={(move) => {
                  void handleBoardMove(move);
                }}
                onSquareClick={(square) => {
                  if (!trainingBoardInteractive) return;
                  try {
                    const chess = new Chess(boardFen);
                    const piece = chess.get(square as Square);
                    if (selected === square) {
                      setSelected(null);
                      return;
                    }
                    if (!piece) {
                      setSelected(null);
                      return;
                    }
                    if (piece.color !== chess.turn()) {
                      setSelected(null);
                      return;
                    }
                    setSelected(square);
                  } catch {
                    setSelected(null);
                  }
                  }}
                className="bs-kit-analysis-board"
              />
            </div>
            <PlayerStrip
              side={flipped ? opponentColor : learnerColor}
              name={flipped ? "Opponent" : "You"}
              turn={flipped ? opponentTurn : learnerTurn}
            />
            <div className="bs-kit-board-actions">
              <div className="l">
                <button className="bs-kit-btn ghost sm" onClick={() => setFlipped((value) => !value)}>
                  <FlipIcon /> Flip
                </button>
                <button
                  className="bs-kit-btn ghost sm"
                  onClick={() => stepBoard(-1)}
                  disabled={!canNavigateHistory || boardHistoryIndex === 0}
                  aria-label="Step back"
                >
                  <StepBackIcon /> Back
                </button>
                <button
                  className="bs-kit-btn ghost sm"
                  onClick={() => stepBoard(1)}
                  disabled={!canNavigateHistory || boardHistoryIndex === boardHistory.length - 1}
                  aria-label="Step forward"
                >
                  <StepForwardIcon /> Forward
                </button>
              </div>
              <div className="r">
                {trainingLoadState === "error" ? (
                  <button
                    className="bs-kit-btn ghost sm"
                    onClick={() => window.location.reload()}
                  >
                    Retry load
                  </button>
                ) : null}
                {activeSession && !completionResult && viewMode === "playing" ? (
                  <button
                    className="bs-kit-btn ghost sm"
                    onClick={() => {
                      completePersistedSequence();
                    }}
                    disabled={trainingActionState !== "idle" || !isLatestBoardState || isOpponentTurn}
                  >
                    <CheckIcon /> Finish sequence
                  </button>
                ) : null}
                {completionResult ? (
                  <button
                    className="bs-kit-btn ghost sm"
                    onClick={() => {
                      void loadNextSequence();
                    }}
                    disabled={trainingActionState !== "idle"}
                  >
                    <SkipIcon /> Next sequence
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="bs-kit-sidebar">
          <TrainingErrorPanel
            loadState={trainingLoadState}
            error={trainingLoadError}
            actionError={trainingActionError}
            moveSyncError={moveSyncError}
            analysisError={analysisError}
            maiaError={maiaError}
            onRetryAnalysis={retryClientSequenceAnalysis}
            onRetryMaiaReply={() => requestMaiaReplyForCurrentPosition({ retry: true })}
          />
          {completionResult && completionResult.rated ? (
            <TrainingCompletionPanel result={completionResult} />
          ) : null}
          {viewMode === "analysis" ? (
            <ClientAnalysisPanel
              analysis={clientAnalysis}
              selectedMoveIndex={selectedAnalysisMoveIndex}
              onSelectMove={selectAnalyzedMove}
              isUnrated={activeSession?.opponentMode === MAIA3_OPPONENT_MODE}
              completionSaveError={completionSaveError}
              completionDone={completionResult !== null}
              onRetrySave={() => maybeCompleteAnalyzedSequence(syncGenerationRef.current)}
            />
          ) : null}
          <TodayPanel
            hideStats={inSession}
            hideRating={stage === "playing"}
            eloBefore={completionResult?.rated ? (completionResult.elo.eloBefore ?? null) : null}
            eloAfter={completionResult?.rated ? (completionResult.elo.eloAfter ?? null) : null}
            eloChange={completionResult?.rated ? (completionResult.elo.eloDelta ?? null) : null}
          />
        </aside>
      </div>
    </div>
  );
}

function SpaBootSplash({
  phase,
}: {
  phase: Exclude<SplashPhase, "hidden">;
}) {
  return (
    <div
      className="bs-kit-splash"
      data-phase={phase}
      data-testid="spa-boot-splash"
      role="status"
      aria-label="Loading Blindspots"
    >
      <div className="bs-kit-splash-brand" aria-hidden="true">
        <img
          src="/blindspots-logo.svg"
          width={28}
          height={28}
          alt=""
          className="bs-kit-splash-logo"
        />
        <span className="bs-kit-splash-wordmark">
          blindspots<span className="bs-kit-splash-tld">.gg</span>
        </span>
      </div>
    </div>
  );
}

function ShellActions({
  theme,
  onToggleTheme,
  onAddFen,
}: {
  theme: AppTheme;
  onToggleTheme: () => void;
  onAddFen: () => void;
}) {
  return (
    <div className="bs-kit-shell-actions">
      <button className="bs-kit-btn-quiet" onClick={onAddFen}>
        <PlusIcon /> Add FEN
      </button>
      <button className="bs-kit-btn-quiet" onClick={onToggleTheme} title="Toggle theme">
        {theme === "paper" ? <MoonIcon /> : <SunIcon />}
      </button>
      <button
        type="button"
        className="bs-kit-btn-quiet"
        data-testid="spa-settings-placeholder"
      >
        <SettingsIcon />
        <span>Settings</span>
      </button>
      <AuthSignOutButton className="bs-kit-btn-quiet" />
    </div>
  );
}

function PlayerStrip({ side, name, turn = false }: { side: "white" | "black"; name: string; turn?: boolean }) {
  return (
    <div className="bs-kit-player-strip" aria-label={turn ? `${name} to move` : name}>
      <div className="who">
        <span className={`side ${side}`} />
        <span className="name">{name}</span>
      </div>
    </div>
  );
}

function TrainingErrorPanel({
  loadState,
  error,
  actionError,
  moveSyncError,
  analysisError,
  maiaError,
  onRetryAnalysis,
  onRetryMaiaReply,
}: {
  loadState: TrainingLoadState;
  error: string | null;
  actionError: string | null;
  moveSyncError: string | null;
  analysisError: string | null;
  maiaError: string | null;
  onRetryAnalysis: () => void;
  onRetryMaiaReply: () => void;
}) {
  if (loadState === "error") {
    return (
      <div className="bs-kit-panel" data-testid="spa-training-load-error">
        <div className="bs-kit-panel-title">Training unavailable</div>
        <div className="bs-kit-muted-line">{error ?? "Failed to load training state."}</div>
        <button className="bs-kit-btn ghost sm" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (!actionError && !moveSyncError && !analysisError && !maiaError) {
    return null;
  }

  return (
    <div className="bs-kit-panel" data-testid="spa-training-error">
      {maiaError ? (
        <>
          <div className="bs-kit-panel-title">Opponent unavailable.</div>
          <button className="bs-kit-btn ghost sm" onClick={onRetryMaiaReply}>
            Retry
          </button>
        </>
      ) : null}
      {actionError ? (
        <div className="bs-kit-muted-line" data-testid="spa-training-action-error">
          {actionError}
        </div>
      ) : null}
      {analysisError ? (
        <>
          <div className="bs-kit-panel-title">Analysis unavailable.</div>
          <button className="bs-kit-btn ghost sm" onClick={onRetryAnalysis}>
            Retry
          </button>
        </>
      ) : null}
      {moveSyncError ? (
        <div className="bs-kit-muted-line" data-testid="spa-training-sync-error">
          {moveSyncError}
        </div>
      ) : null}
    </div>
  );
}

function ClientAnalysisPanel({
  analysis,
  selectedMoveIndex,
  onSelectMove,
  isUnrated,
  completionSaveError,
  completionDone,
  onRetrySave,
}: {
  analysis: ClientSequenceAnalysis | null;
  selectedMoveIndex: number | null;
  onSelectMove: (moveIndex: number) => void;
  isUnrated?: boolean;
  completionSaveError?: string | null;
  completionDone?: boolean;
  onRetrySave?: () => void;
}) {
  if (!analysis) {
    return <div className="bs-kit-panel" data-testid="spa-client-analysis" />;
  }

  const outcomeLabel =
    analysis.trainingOutcome === "pass"
      ? "Passed"
      : analysis.trainingOutcome === "acceptable"
        ? "Acceptable"
        : "Failed";
  const selectedMove =
    analysis.learnerMoves.find((move) => move.moveIndex === selectedMoveIndex) ??
    analysis.learnerMoves[0] ??
    null;

  return (
    <div className="bs-kit-panel" data-testid="spa-client-analysis">
      <div className="bs-kit-panel-title">Analysis</div>
      <div className="bs-kit-due-row">
        <span>{outcomeLabel}</span>
        <span>{analysis.averageCpLoss} average CPL</span>
      </div>
      <div className="bs-kit-muted-line">
        Maximum CPL: <b>{analysis.maxSingleCpLoss}</b>
      </div>
      {isUnrated ? (
        <div className="bs-kit-muted-line"><b>Unrated</b></div>
      ) : null}
      {completionSaveError ? (
        <>
          <div className="bs-kit-muted-line" data-testid="spa-completion-save-error">
            Could not save result.
          </div>
          <button className="bs-kit-btn ghost sm" onClick={onRetrySave}>
            Retry
          </button>
        </>
      ) : null}
      <div className="bs-kit-stat-list">
        {analysis.learnerMoves.map((move) => (
          <button
            key={move.moveIndex}
            className="bs-kit-btn ghost sm"
            data-selected={move.moveIndex === selectedMove?.moveIndex ? "true" : "false"}
            onClick={() => onSelectMove(move.moveIndex)}
          >
            {move.playedSan} · {move.classification} · {move.cpLoss} CPL
          </button>
        ))}
      </div>
      {selectedMove?.bestLineUcis.length ? (
        <div className="bs-kit-muted-line">
          Best line: <b>{selectedMove.bestLineUcis.join(" ")}</b>
        </div>
      ) : null}
    </div>
  );
}

function TrainingCompletionPanel({ result }: { result: SpaCompletionResult }) {
  const outcomeLabel =
    result.trainingOutcome === "pass"
      ? "Passed"
      : result.trainingOutcome === "acceptable"
        ? "Acceptable"
        : "Failed";

  return (
    <div className="bs-kit-panel" data-testid="spa-training-completion-result">
      <div className="bs-kit-panel-title">Result</div>
      <div className="bs-kit-due-row">
        <span>{outcomeLabel}</span>
        <span>{result.averageCpLoss} average CPL</span>
      </div>
      <div className="bs-kit-muted-line">
        Maximum CPL: <b>{result.maxSingleCpLoss}</b>
      </div>
      <div className="bs-kit-muted-line">
        {result.rated ? (
          <>
            Rating: <b>{result.elo.eloBefore}</b> → <b>{result.elo.eloAfter}</b>{" "}
            ({result.elo.eloDelta >= 0 ? "+" : ""}{result.elo.eloDelta})
          </>
        ) : (
          <b>Unrated</b>
        )}
      </div>
    </div>
  );
}

function TodayPanel({
  hideRating,
  hideStats,
  eloBefore,
  eloAfter,
  eloChange,
}: {
  hideRating: boolean;
  hideStats: boolean;
  eloBefore: number | null;
  eloAfter: number | null;
  eloChange: number | null;
}) {
  const showEloChange = eloBefore != null && eloAfter != null;
  return (
    <div className="bs-kit-panel">
      {!hideStats ? (
        <div>
          <div className="bs-kit-panel-title">Today</div>
          <div className="bs-kit-due-row">
            <span>{TODAY.due}</span>
            <span>positions due</span>
          </div>
          <div className="bs-kit-muted-line"><b>{TODAY.done}</b> / {TODAY.target} complete</div>
        </div>
      ) : null}
      {!hideStats ? (
        <div className="bs-kit-stat-list">
          <div><span>Review due</span><b>{TODAY.reviewDue}</b></div>
          <div><span>New from your games</span><b>{TODAY.newFromGames}</b></div>
        </div>
      ) : null}
      <div className="bs-kit-rating" data-compact={hideStats ? "true" : "false"}>
        <div className="bs-kit-panel-title">Rating</div>
        {hideRating ? (
          <span className="masked">????</span>
        ) : showEloChange ? (
          <div className="elo-change">
            <span className="old">{eloBefore}</span>
            <span className="arrow">→</span>
            <span className="new">{eloAfter}</span>
            <b>{eloChange! >= 0 ? "+" : ""}{eloChange}</b>
          </div>
        ) : (
          <>
            <span className="rating-number">{TODAY.rating}</span>
            <RatingSparkline points={TODAY.ratingHistory} />
          </>
        )}
      </div>
    </div>
  );
}

function RatingSparkline({ points }: { points: number[] }) {
  const width = 252;
  const height = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const stepX = width / (points.length - 1);
  const d = points.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill="var(--bs-accent)" opacity="0.12" />
      <path d={d} fill="none" stroke="var(--bs-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AddFenSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (fen: string) => void;
}) {
  const [value, setValue] = useState("");
  if (!open) return null;
  return (
    <div className="bs-kit-add-fen">
      <div className="inner">
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="r1bqk2r/pp2bppp/2n1pn2/3p4/3PP3/2NB1N2/PPP2PPP/R1BQK2R w KQkq - 0 7"
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim()) onAdd(value.trim());
            if (event.key === "Escape") onClose();
          }}
        />
        <button className="bs-kit-btn primary sm" onClick={() => value.trim() && onAdd(value.trim())}>Add</button>
        <button className="bs-kit-btn ghost sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function Icon({
  children,
  width = 16,
  height = 16,
  strokeWidth = 1.8,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
function PlusIcon() { return <Icon width={14} height={14} strokeWidth={2}><path d="M12 5v14M5 12h14" /></Icon>; }
function MoonIcon() { return <Icon><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></Icon>; }
function SunIcon() { return <Icon><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></Icon>; }
function SettingsIcon() {
  return (
    <Icon>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8.6 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 3.9l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15.4 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.18.38.52.68.93.82.2.07.42.1.63.1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08Z" />
    </Icon>
  );
}
function FlipIcon() { return <Icon><path d="M3 7h13M16 7l-3-3M16 7l-3 3M21 17H8M8 17l3-3M8 17l3 3" /></Icon>; }
function SkipIcon() { return <Icon><polyline points="9 18 15 12 9 6" /></Icon>; }
function StepBackIcon() { return <Icon><polyline points="15 18 9 12 15 6" /></Icon>; }
function StepForwardIcon() { return <Icon><polyline points="9 18 15 12 9 6" /></Icon>; }
function CheckIcon() { return <Icon><polyline points="20 6 9 17 4 12" /></Icon>; }
