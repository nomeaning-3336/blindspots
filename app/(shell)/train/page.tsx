"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { Chess } from "chess.js";
import { AnalysisBoard, type BoardMove } from "@/components/chess/analysis-board";
import {
  analyzeBoardThemeForAppTheme,
  normalizeAnalyzePreferences,
  type AnalyzePreferences,
  type AnalyzeBoardTheme,
  type AnalyzePieceTheme,
} from "@/lib/analyze-preferences";

type TrainingState = "active" | "complete" | "drift";
type OpponentMode = "Comfort" | "Stretch" | "Pressure";
type EngineStyle = "Human-like" | "Hybrid" | "Computer";
type OnboardingScreen = "loading" | "connect" | "analysis" | "summary" | "settings" | "done";
type ProfileProvider = "chesscom" | "lichess";

type TrainingMove = {
  san: string;
  side: "white" | "black";
};

interface InitializationSummary {
  mistakesFound: number;
  gamesAnalyzed: number;
  averageCpLossPerGame: number;
}

interface OnboardingStatePayload {
  shouldShowOnboarding: boolean;
  preferences: {
    sequence_length: number;
    opponent_mode: string;
    time_pressure_mode: string;
    opening_filter?: unknown;
  } | null;
}

const ANALYZE_PREFERENCES_STORAGE_KEY = "chessview-analyze-preferences";

function readVisualPreferences() {
  let stored: unknown = null;
  try {
    const raw = window.localStorage.getItem(ANALYZE_PREFERENCES_STORAGE_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    stored = null;
  }

  const storedPreferences =
    stored && typeof stored === "object"
      ? (stored as Partial<AnalyzePreferences>)
      : null;
  const normalized = normalizeAnalyzePreferences(storedPreferences);
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
  sequenceLength: 5,
  rating: 1647,
  completedRating: 1656,
  moveHistory: [
  ] satisfies TrainingMove[],
  completedMoves: [
    { san: "Kc7", side: "white" },
    { san: "Rxd4", side: "black" },
    { san: "Rb7+", side: "white" },
    { san: "Kxb7", side: "black" },
    { san: "Kxd6", side: "white" },
  ] satisfies TrainingMove[],
};

export default function TrainPage() {
  const [state, setState] = useState<TrainingState>("active");
  const [fen, setFen] = useState(mockRep.fen);
  const [moves, setMoves] = useState<TrainingMove[]>(mockRep.moveHistory);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [sequenceLength, setSequenceLength] = useState(mockRep.sequenceLength);
  const [opponentMode, setOpponentMode] = useState<OpponentMode>("Stretch");
  const [engineStyle, setEngineStyle] = useState<EngineStyle>("Human-like");
  const [onboardingScreen, setOnboardingScreen] = useState<OnboardingScreen>("loading");
  const [selectedProvider, setSelectedProvider] = useState<ProfileProvider | null>(null);
  const [profileUsername, setProfileUsername] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [isConnectingProfile, setIsConnectingProfile] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [initializationSummary, setInitializationSummary] =
    useState<InitializationSummary | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [visualPreferences, setVisualPreferences] = useState<{
    boardTheme: AnalyzeBoardTheme;
    pieceTheme: AnalyzePieceTheme;
  } | null>(null);

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
          if ([3, 5, 8].includes(payload.preferences.sequence_length)) {
            setSequenceLength(payload.preferences.sequence_length);
          }
          setOpponentMode(toOpponentMode(payload.preferences.opponent_mode));
          setEngineStyle(toEngineStyle(readEngineStylePreference(payload.preferences.opening_filter)));
        }

        setOnboardingScreen(payload.shouldShowOnboarding ? "connect" : "done");
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
    function syncVisualPreferences() {
      setVisualPreferences(readVisualPreferences());
    }

    setVisualPreferences(readVisualPreferences());
    window.addEventListener("storage", syncVisualPreferences);
    const observer = new MutationObserver(syncVisualPreferences);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("storage", syncVisualPreferences);
      observer.disconnect();
    };
  }, []);

  function switchState(nextState: TrainingState) {
    setState(nextState);
    setLastMove(nextState === "complete" ? { from: "c5", to: "d6" } : null);
    if (nextState === "active") {
      setFen(mockRep.fen);
      setMoves(mockRep.moveHistory);
    }
    if (nextState === "complete") {
      setFen(mockRep.completedFen);
      setMoves(mockRep.completedMoves);
    }
    if (nextState === "drift") {
      setFen(mockRep.fen);
      setMoves([...mockRep.moveHistory, { san: "Rb8?", side: "white" }]);
    }
  }

  function handleMove(move: BoardMove) {
    try {
      const chess = new Chess(fen);
      chess.move({ from: move.from, to: move.to, promotion: "q" });
      setFen(chess.fen());
      setLastMove({ from: move.from, to: move.to });
      setMoves((current) => [...current, { san: move.san ?? move.uci ?? `${move.from}${move.to}`, side: chess.turn() === "w" ? "black" : "white" }]);
      if (moves.length + 1 >= sequenceLength) {
        setState("complete");
      }
    } catch {
      // The board only emits legal moves, but keep the page resilient to stale FEN.
    }
  }

  async function connectProfile(provider: ProfileProvider) {
    const username = profileUsername.trim();
    if (!username) {
      setSelectedProvider(provider);
      setConnectionMessage("Enter your public username to connect.");
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
    setOnboardingScreen("settings");
  }

  function beginAnalysis() {
    setAnalysisStep(0);
    setAnalysisError("");
    setInitializationSummary(null);
    setOnboardingScreen("analysis");

    window.setTimeout(() => setAnalysisStep((current) => Math.max(current, 1)), 450);
    window.setTimeout(() => setAnalysisStep((current) => Math.max(current, 2)), 1300);
    void runAnalysis();
  }

  async function runAnalysis() {
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
      setAnalysisStep(3);
      setInitializationSummary(payload.summary);
      window.setTimeout(() => setOnboardingScreen("summary"), 450);
      return;
    }

    if (payload?.status === "no_games") {
      setAnalysisStep(3);
      window.setTimeout(() => setOnboardingScreen("settings"), 450);
      return;
    }

    setAnalysisError(
      "Analysis didn't complete — your profile will build from your training sessions instead",
    );
    window.setTimeout(() => setOnboardingScreen("settings"), 3000);
  }

  async function startFirstSession() {
    setIsSavingSettings(true);

    try {
      await fetch("/api/train/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_settings",
          sequenceLength,
          opponentMode: opponentMode.toLowerCase(),
          engineStyle: serializeEngineStyle(engineStyle),
          timePressureMode: "none",
          openingFilter: [],
        }),
      });
      setOnboardingScreen("done");
    } finally {
      setIsSavingSettings(false);
    }
  }

  const rating = state === "complete" ? mockRep.completedRating : mockRep.rating;
  const userMoveCount = moves.filter((move) => move.side === "white").length;
  const moveProgress = Math.min(userMoveCount + 1, sequenceLength);
  const controlsLocked = state === "active" && moves.length > 0;

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
        summary={initializationSummary}
        sequenceLength={sequenceLength}
        opponentMode={opponentMode}
        engineStyle={engineStyle}
        isSavingSettings={isSavingSettings}
        onSelectProvider={setSelectedProvider}
        onUsernameChange={setProfileUsername}
        onConnectProfile={connectProfile}
        onSkip={skipConnection}
        onStartTraining={() => setOnboardingScreen("settings")}
        onSequenceLengthChange={setSequenceLength}
        onOpponentModeChange={setOpponentMode}
        onEngineStyleChange={setEngineStyle}
        onStartFirstSession={startFirstSession}
      />
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-auto py-4">
      <div className="grid w-full gap-5 lg:min-h-[780px] lg:grid-cols-[minmax(0,1.36fr)_minmax(360px,0.88fr)]">
        <section className="flex items-center justify-center rounded-[14px] border border-[var(--app-border-soft)] bg-[var(--app-panel-strong)] p-3 sm:p-5 lg:min-h-0 lg:p-8">
          <div className="w-full max-w-[min(92vw,74vh,920px)]">
            {visualPreferences ? (
              <AnalysisBoard
                fen={fen}
                mode="training"
                orientation="white"
                coordinates
                lastMove={lastMove}
                boardTheme={visualPreferences.boardTheme}
                pieceTheme={visualPreferences.pieceTheme}
                highlightedSquares={
                  state === "complete"
                    ? { d6: "color-mix(in srgb, var(--app-accent) 44%, var(--app-selection) 56%)" }
                    : state === "drift"
                      ? { b8: "color-mix(in srgb, var(--app-class-mistake) 42%, #7f8190 58%)" }
                      : { c7: "color-mix(in srgb, var(--app-accent) 30%, var(--app-selection) 70%)" }
                }
                onMove={handleMove}
              />
            ) : (
              <div
                className="aspect-square w-full rounded-[10px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)]"
                aria-hidden="true"
              />
            )}
          </div>
        </section>

        <aside className="flex flex-col rounded-[14px] border border-[var(--app-border-soft)] bg-[var(--app-panel-strong)] p-5 sm:p-6 lg:min-h-[720px]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-end gap-3" aria-label="Blindspots Elo">
                <span className="text-5xl font-bold leading-none text-[var(--app-text)]">{rating}</span>
                {state === "complete" ? (
                  <span className="mb-1 rounded-[5px] bg-[var(--app-accent)] px-2 py-1 text-xs font-bold text-black">
                    +9
                  </span>
                ) : null}
              </div>
            </div>
            <div className="rounded border border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-4 py-3 text-right">
              <p className="text-lg font-bold text-[var(--app-text)]">
                Move {moveProgress} of {sequenceLength}
              </p>
            </div>
          </div>

          {state === "complete" ? (
            <StatusBanner
              title="Rep complete"
              detail="Eval preserved"
              action="Next position"
              tone="success"
              onAction={() => switchState("active")}
            />
          ) : state === "drift" ? (
            <StatusBanner
              title="Eval dropped"
              detail="Rep saved for review"
              action="Retry"
              tone="warning"
              onAction={() => switchState("active")}
            />
          ) : (
            moves.length === 0 ? (
              <PromptCard prompt={mockRep.prompt} />
            ) : null
          )}

          <MoveList moves={moves} />

          <div className="mt-6">
            <div className="grid gap-3 border-t border-[var(--app-border-soft)] pt-5">
              <SegmentedControl
                label="Sequence length"
                value={String(sequenceLength)}
                options={["3", "5", "8"]}
                onChange={(value) => setSequenceLength(Number(value))}
                disabled={controlsLocked}
              />
              <SegmentedControl
                label="Opponent"
                value={opponentMode}
                options={["Comfort", "Stretch", "Pressure"]}
                onChange={(value) => setOpponentMode(value as OpponentMode)}
                disabled={controlsLocked}
              />
              <SegmentedControl
                label="Engine style"
                value={engineStyle}
                options={["Human-like", "Hybrid", "Computer"]}
                onChange={(value) => setEngineStyle(value as EngineStyle)}
                disabled={controlsLocked}
              />
            </div>
          </div>
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
  summary,
  sequenceLength,
  opponentMode,
  engineStyle,
  isSavingSettings,
  onSelectProvider,
  onUsernameChange,
  onConnectProfile,
  onSkip,
  onStartTraining,
  onSequenceLengthChange,
  onOpponentModeChange,
  onEngineStyleChange,
  onStartFirstSession,
}: {
  screen: OnboardingScreen;
  selectedProvider: ProfileProvider | null;
  username: string;
  connectionMessage: string;
  isConnectingProfile: boolean;
  analysisStep: number;
  analysisError: string;
  summary: InitializationSummary | null;
  sequenceLength: number;
  opponentMode: OpponentMode;
  engineStyle: EngineStyle;
  isSavingSettings: boolean;
  onSelectProvider: (provider: ProfileProvider | null) => void;
  onUsernameChange: (value: string) => void;
  onConnectProfile: (provider: ProfileProvider) => void;
  onSkip: () => void;
  onStartTraining: () => void;
  onSequenceLengthChange: (value: number) => void;
  onOpponentModeChange: (value: OpponentMode) => void;
  onEngineStyleChange: (value: EngineStyle) => void;
  onStartFirstSession: () => void;
}) {
  return (
    <div className="grid min-h-[calc(100dvh-92px)] w-full place-items-center px-4 py-8">
      <section className="w-full max-w-[620px] text-center">
        {screen === "loading" ? (
          <LinearProgress />
        ) : null}

        {screen === "connect" ? (
          <div className="grid gap-8">
            <div className="grid gap-4">
              <h1 className="text-2xl font-bold text-[var(--app-text)]">
                To find your blindspots, we need to see your games.
              </h1>
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
                Connect Lichess
              </button>
              <button
                type="button"
                className={onboardingPrimaryButtonClass(selectedProvider === "chesscom")}
                disabled={isConnectingProfile}
                onClick={() => {
                  onSelectProvider("chesscom");
                }}
              >
                Connect Chess.com
              </button>
            </div>

            {selectedProvider ? (
              <div className="mx-auto grid w-full max-w-[420px] gap-3 text-left">
                <label className="grid gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
                    Public username
                  </span>
                  <input
                    value={username}
                    onChange={(event) => onUsernameChange(event.target.value)}
                    className="app-brutal-input min-h-12 px-4 text-base text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
                    placeholder={
                      selectedProvider === "lichess" ? "Lichess username" : "Chess.com username"
                    }
                    autoComplete="off"
                  />
                </label>
                {connectionMessage ? (
                  <p className="text-sm text-[var(--app-muted)]">{connectionMessage}</p>
                ) : null}
                <button
                  type="button"
                  disabled={isConnectingProfile || username.trim().length === 0}
                  className="min-h-12 rounded-[8px] border border-[var(--app-accent)] bg-[var(--app-accent)] px-5 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)] disabled:cursor-not-allowed disabled:border-[var(--app-border)] disabled:bg-[var(--app-surface-subtle)] disabled:text-[var(--app-muted)]"
                  onClick={() => void onConnectProfile(selectedProvider)}
                >
                  {isConnectingProfile ? "Connecting..." : "Continue"}
                </button>
              </div>
            ) : null}

            <button
              type="button"
              className="mx-auto min-h-11 text-sm font-bold text-[var(--app-muted)] underline-offset-4 transition hover:text-[var(--app-text)] hover:underline"
              onClick={() => void onSkip()}
            >
              Skip — start with random positions
            </button>
          </div>
        ) : null}

        {screen === "analysis" ? (
          <div className="mx-auto grid w-full max-w-[620px] gap-8">
            <LinearProgress />
            <div className="grid gap-4 text-left">
              <AnalysisLine done={analysisStep >= 1} label="Fetching your recent games" />
              <AnalysisLine done={analysisStep >= 2} label="Running evaluation analysis" />
              <AnalysisLine done={analysisStep >= 3} label="Building your blindspot profile" />
            </div>
            <p className="text-sm text-[var(--app-muted)]">This takes about 30 seconds</p>
            {analysisError ? (
              <p className="rounded border border-[var(--app-class-mistake-border)] bg-[var(--app-class-mistake-soft)] px-4 py-3 text-sm text-[var(--app-text)]">
                {analysisError}
              </p>
            ) : null}
          </div>
        ) : null}

        {screen === "summary" && summary ? (
          <div className="grid gap-8">
            <h1 className="text-3xl font-bold text-[var(--app-text)]">
              Your blindspot profile is ready.
            </h1>
            <div className="grid gap-3 border-y border-[var(--app-border-soft)] py-6 text-left sm:grid-cols-3">
              <SummaryStat value={`${summary.mistakesFound}`} label="mistakes found" />
              <SummaryStat value={`${summary.gamesAnalyzed}`} label="across games" />
              <SummaryStat value={`${summary.averageCpLossPerGame}cp`} label="avg loss per game" />
            </div>
            <button
              type="button"
              className="mx-auto min-h-12 rounded-[8px] border border-[var(--app-accent)] bg-[var(--app-accent)] px-6 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
              onClick={onStartTraining}
            >
              Start training →
            </button>
          </div>
        ) : null}

        {screen === "settings" ? (
          <div className="mx-auto grid max-w-[520px] gap-6 rounded-[14px] border border-[var(--app-border-soft)] bg-[var(--app-panel-strong)] p-6 text-left">
            <SegmentedControl
              label="Sequence length"
              value={String(sequenceLength)}
              options={["3", "5", "8"]}
              onChange={(value) => onSequenceLengthChange(Number(value))}
            />
            <SegmentedControl
              label="Opponent"
              value={opponentMode}
              options={["Comfort", "Stretch", "Pressure"]}
              onChange={(value) => onOpponentModeChange(value as OpponentMode)}
            />
            <SegmentedControl
              label="Engine style"
              value={engineStyle}
              options={["Human-like", "Hybrid", "Computer"]}
              onChange={(value) => onEngineStyleChange(value as EngineStyle)}
            />
            <button
              type="button"
              disabled={isSavingSettings}
              className="min-h-12 rounded-[8px] border border-[var(--app-accent)] bg-[var(--app-accent)] px-5 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)] disabled:cursor-wait disabled:opacity-70"
              onClick={() => void onStartFirstSession()}
            >
              Start first session →
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PromptCard({ prompt }: { prompt: string }) {
  return (
    <div className="mt-8 rounded-[8px] border border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-5 py-5">
      <div className="flex items-center gap-5">
        <KingIcon />
        <div className="min-w-0">
          <p className="text-lg font-bold text-[var(--app-text)]">Your move</p>
          <p className="mt-1 text-sm text-[var(--app-muted)]">
            {prompt}
          </p>
        </div>
      </div>
    </div>
  );
}

function LinearProgress() {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--app-surface-subtle)]"
      role="progressbar"
      aria-label="Analysis progress"
    >
      <div className="train-onboarding-progress h-full w-full origin-left rounded-full bg-[var(--app-accent)]" />
    </div>
  );
}

function AnalysisLine({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex min-h-11 items-center gap-3 text-[var(--app-text)]">
      <span
        className={[
          "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold",
          done
            ? "border-[var(--app-accent)] bg-[var(--app-accent)] text-black"
            : "border-[var(--app-border)] text-[var(--app-muted)]",
        ].join(" ")}
        aria-hidden="true"
      >
        {done ? "✓" : ""}
      </span>
      <span className="text-base font-bold">{label}</span>
    </div>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-4xl font-bold text-[var(--app-text)]">{value}</p>
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
      return "That public profile could not be found.";
    case "invalid-username":
      return "That username format does not look valid.";
    case "storage-needs-migration":
      return "The linked-profile table needs the latest migration first.";
    case "unauthorized":
      return "Sign in again before connecting a profile.";
    default:
      return "Profile could not be linked right now.";
  }
}

function toOpponentMode(value: string | null | undefined): OpponentMode {
  if (value === "comfort") return "Comfort";
  if (value === "pressure") return "Pressure";
  return "Stretch";
}

function toEngineStyle(value: string | null | undefined): EngineStyle {
  if (value === "leela" || value === "hybrid") return "Hybrid";
  if (value === "stockfish" || value === "computer") return "Computer";
  return "Human-like";
}

function serializeEngineStyle(value: EngineStyle) {
  if (value === "Hybrid") return "leela";
  if (value === "Computer") return "stockfish";
  return "maia";
}

function readEngineStylePreference(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as { engineStyle?: unknown }).engineStyle;
  return typeof candidate === "string" ? candidate : null;
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

function MoveList({ moves }: { moves: TrainingMove[] }) {
  const rows = moves.reduce<Array<{ white?: string; black?: string }>>((acc, move) => {
    if (move.side === "white" || acc.length === 0) {
      acc.push(move.side === "white" ? { white: move.san } : { black: move.san });
      return acc;
    }

    acc[acc.length - 1].black = move.san;
    return acc;
  }, []);

  return (
    <div className="mt-8 overflow-hidden border-y border-[var(--app-border-soft)] py-2">
      {moves.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--app-muted)]">No moves played yet</p>
      ) : null}
      {rows.map((row, index) => (
        <div
          key={`${index}-${row.white ?? ""}-${row.black ?? ""}`}
          className={[
            "grid min-h-12 grid-cols-[46px_minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-[var(--app-border-soft)] px-2 text-sm last:border-b-0",
            index === rows.length - 1 ? "bg-white/[0.03]" : "",
          ].join(" ")}
        >
          <span className="text-right text-[var(--app-muted)]">{index + 1}.</span>
          <span className="pl-8 font-bold text-[var(--app-text)]">{row.white ?? ""}</span>
          <span className="font-bold text-[var(--app-muted)]">{row.black ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

function SegmentedControl({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={["grid gap-2", disabled ? "opacity-55" : ""].join(" ")}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
        {label}
      </p>
      <div className="grid grid-cols-3 gap-1 rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            className={[
              "min-h-9 rounded-[7px] border px-3 text-xs font-bold uppercase transition",
              option === value
                ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-text)]"
                : "border-transparent text-[var(--app-muted)] hover:bg-white/10 hover:text-[var(--app-text)]",
              disabled ? "cursor-not-allowed hover:bg-transparent hover:text-[var(--app-muted)]" : "",
            ].join(" ")}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function TargetIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[var(--app-accent)]"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" /><path d="m15 9-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function KingIcon() {
  return <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-[var(--app-text)]"><path d="M12 3v5M9.5 5.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M7 21h10M8 18h8M8.8 15.5c-1.4-1-2.3-2.6-2.3-4.4A5.5 5.5 0 0 1 12 5.6a5.5 5.5 0 0 1 5.5 5.5c0 1.8-.9 3.4-2.3 4.4H8.8Z" fill="currentColor" /></svg>;
}
