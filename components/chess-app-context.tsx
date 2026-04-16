"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AnalyzePreferences } from "@/lib/analyze-preferences";

export interface AnalyzeNode {
  id: string;
  fen: string;
  label: string;
  san: string;
  uci: string;
  parent: AnalyzeNode | null;
  children: AnalyzeNode[];
  preferredChildId: string | null;
  mainlineChildId: string | null;
  isCapture?: boolean;
  moveClassKey?: string;
}

export interface AnalyzeAnnotation {
  type: "circle" | "arrow";
  square?: string;
  from?: string;
  to?: string;
}

export interface AnalyzeState {
  orientation: "white" | "black";
  selectedSquare: string | null;
  root: AnalyzeNode;
  current: AnalyzeNode;
  hoveredUci: string | null;
  engineMode: string;
  engineStatus: string;
  engineHint: string;
  engineReady: boolean;
  engineLoading: boolean;
  engineBusy: boolean;
  linesShown: number;
  threads: number;
  limitKind: "time" | "depth";
  limitValue: number;
  timeLimitValue: number;
  depthLimitValue: number;
  engineLinesHidden: boolean;
  openingInfo: string | null;
  openingWiki: string | null;
  openingLoading: boolean;
  analysisRows: unknown[];
  annotations: AnalyzeAnnotation[];
}

export interface AnalyzeApi {
  state: AnalyzeState;
  _renderCount: number;
  applyUserAnalyzePreferences: (preferences: AnalyzePreferences | null) => void;
  setAppTheme?: (theme: string | null) => void;
  setWorkspaceMode?: (mode: "explore" | "arcade") => void;
  doMove: (uci: string) => void;
  goToNode: (nodeId: string) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateStart: () => void;
  navigateEnd: () => void;
  navigateSibling: (delta: number) => void;
  newGame: () => void;
  flipBoard: () => void;
  selectSquare: (square: string) => void;
  startAnalysis: (mode: string) => void;
  haltEngine: (explicit?: boolean) => void;
  nodeRegistry: {
    get: (id: string) => AnalyzeNode | null;
  };
  currentFen: () => string;
  currentUci: () => string | null;
  parentFen: () => string;
  parentUci: () => string | null;
}

declare global {
  interface Window {
    __chessSomething?: AnalyzeApi;
  }
}

interface ChessAppContextValue {
  analysis: AnalyzeApi | null;
  isReady: boolean;
  orientation: "white" | "black";
  currentFen: string;
  currentUci: string | null;
  currentNode: AnalyzeNode | null;
  engineStatus: string;
  engineHint: string;
  engineReady: boolean;
  engineLinesHidden: boolean;
  linesShown: number;
  hoveredUci: string | null;
  openingInfo: string | null;
  openingWiki: string | null;
  openingLoading: boolean;
  annotations: AnalyzeAnnotation[];
  analysisRows: unknown[];
  doMove: (uci: string) => void;
  goToNode: (nodeId: string) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateStart: () => void;
  navigateEnd: () => void;
  navigateSibling: (delta: number) => void;
  newGame: () => void;
  flipBoard: () => void;
  selectSquare: (square: string) => void;
  startAnalysis: (mode?: string) => void;
  haltEngine: (explicit?: boolean) => void;
}

const ChessAppContext = createContext<ChessAppContextValue | null>(null);

export function useChessApp(): ChessAppContextValue {
  const ctx = useContext(ChessAppContext);
  if (!ctx) {
    throw new Error("useChessApp must be used within ChessAppProvider");
  }
  return ctx;
}

export function ChessAppProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [, forceUpdate] = useState(0);
  const lastRenderCount = useRef(0);
  const analysisRef = useRef<AnalyzeApi | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (window.__chessSomething) {
        analysisRef.current = window.__chessSomething;
        setIsReady(true);
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!isReady) return;

    let raf: number;

    const poll = () => {
      const api =
        analysisRef.current ??
        (typeof window !== "undefined" ? window.__chessSomething : null);
      if (api && api._renderCount !== lastRenderCount.current) {
        lastRenderCount.current = api._renderCount;
        forceUpdate((n) => n + 1);
      }
      raf = requestAnimationFrame(poll);
    };

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [isReady]);

  const api =
    analysisRef.current ??
    (typeof window !== "undefined" ? window.__chessSomething : null) ??
    null;

  const s = api?.state as AnalyzeState | undefined;
  const orientation = s?.orientation ?? "white";
  const currentFen = s?.current?.fen ?? "";
  const currentUci = s?.current?.uci ?? null;
  const currentNode = s?.current ?? null;
  const engineStatus = s?.engineStatus ?? "Loading engine";
  const engineHint = s?.engineHint ?? "";
  const engineReady = s?.engineReady ?? false;
  const engineLinesHidden = s?.engineLinesHidden ?? false;
  const linesShown = s?.linesShown ?? 3;
  const hoveredUci = s?.hoveredUci ?? null;
  const openingInfo = s?.openingInfo ?? null;
  const openingWiki = s?.openingWiki ?? null;
  const openingLoading = s?.openingLoading ?? false;
  const annotations = s?.annotations ?? [];
  const analysisRows = s?.analysisRows ?? [];

  const doMove = useCallback((uci: string) => api?.doMove(uci), [api]);
  const goToNode = useCallback((nodeId: string) => api?.goToNode(nodeId), [api]);
  const navigateBack = useCallback(() => api?.navigateBack(), [api]);
  const navigateForward = useCallback(() => api?.navigateForward(), [api]);
  const navigateStart = useCallback(() => api?.navigateStart(), [api]);
  const navigateEnd = useCallback(() => api?.navigateEnd(), [api]);
  const navigateSibling = useCallback((delta: number) => api?.navigateSibling(delta), [api]);
  const newGame = useCallback(() => api?.newGame(), [api]);
  const flipBoard = useCallback(() => api?.flipBoard(), [api]);
  const selectSquare = useCallback((square: string) => api?.selectSquare(square), [api]);
  const startAnalysis = useCallback((mode = "analysis") => api?.startAnalysis(mode), [api]);
  const haltEngine = useCallback((explicit = true) => api?.haltEngine(explicit), [api]);

  const value: ChessAppContextValue = {
    analysis: api,
    isReady,
    orientation,
    currentFen,
    currentUci,
    currentNode,
    engineStatus,
    engineHint,
    engineReady,
    engineLinesHidden,
    linesShown,
    hoveredUci,
    openingInfo,
    openingWiki,
    openingLoading,
    annotations,
    analysisRows,
    doMove,
    goToNode,
    navigateBack,
    navigateForward,
    navigateStart,
    navigateEnd,
    navigateSibling,
    newGame,
    flipBoard,
    selectSquare,
    startAnalysis,
    haltEngine,
  };

  return (
    <ChessAppContext.Provider value={value}>
      {children}
    </ChessAppContext.Provider>
  );
}
