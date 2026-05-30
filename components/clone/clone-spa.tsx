"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnalysisBoard, type BoardMove } from "@/components/chess/analysis-board";
import { CloneOnboarding } from "@/components/clone/clone-onboarding";
import { ClonePostmortemPanel } from "@/components/clone/clone-postmortem-panel";
import { ClonePlayerStrip } from "@/components/clone/clone-player-strip";
import type { AppTheme } from "@/lib/app-theme";

type ChessProvider = "chesscom" | "lichess";

export type CloneGameView = {
  id: string;
  userColor: "white" | "black";
  cloneColor: "white" | "black";
  startingFen: string;
  currentFen: string;
  movesUci: string[];
  result: "white" | "black" | "draw" | null;
  state: "playing" | "postmortem";
};

type CloneProfileView = {
  id: string;
  provider: ChessProvider;
  username: string;
  status: string;
  rating: number | null;
};

type CloneSpaState =
  | { screen: "loading" }
  | { screen: "needs-profile" }
  | { screen: "needs-training"; provider: ChessProvider; username: string }
  | { screen: "training"; provider: ChessProvider; username: string }
  | { screen: "playing"; game: CloneGameView }
  | { screen: "postmortem"; game: CloneGameView };

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

async function fetchCloneStatus() {
  const res = await fetch("/api/clone/status");
  if (!res.ok) throw new Error("Failed to fetch clone status");
  return res.json();
}

async function createCloneGame(): Promise<CloneGameView> {
  const res = await fetch("/api/clone/game", { method: "POST" });
  if (!res.ok) throw new Error("Failed to create game");
  const data = await res.json();
  return data.game;
}

async function abandonCloneGame(gameId: string) {
  const res = await fetch(`/api/clone/game/${gameId}/abandon`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to abandon game");
}

async function postMove(
  gameId: string,
  uci: string
): Promise<{ game: CloneGameView; cloneMove: string | null }> {
  const res = await fetch(`/api/clone/game/${gameId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uci }),
  });
  if (!res.ok) throw new Error("Failed to post move");
  return res.json();
}

export function CloneSpa() {
  const [state, setState] = useState<CloneSpaState>({ screen: "loading" });
  const [cloneThinking, setCloneThinking] = useState(false);
  const [cloneUsername, setCloneUsername] = useState<string>("Your Clone");
  const [cloneProvider, setCloneProvider] = useState<ChessProvider | null>(null);
  const [cloneRating, setCloneRating] = useState<number | null>(null);
  const [newGamePending, setNewGamePending] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "dark"
      ? "dark"
      : "paper"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Mount: fetch status and route
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCloneStatus();

        if (cancelled) return;

        if (data.status === "no-clone") {
          setState({ screen: "needs-profile" });
          return;
        }

        const clone = data.clone as CloneProfileView;
        setCloneUsername(clone.username);
        setCloneProvider(clone.provider);
        setCloneRating(clone.rating ?? null);

        if (data.activeGame) {
          // Restore active playing game
          setState({
            screen:
              data.activeGame.state === "postmortem" ? "postmortem" : "playing",
            game: data.activeGame as CloneGameView,
          });
          return;
        }

        // No active game
        if (clone.status === "needs_training") {
          setState({
            screen: "needs-training",
            provider: clone.provider,
            username: clone.username,
          });
          return;
        }

        if (clone.status === "ready") {
          // Boot straight to board
          try {
            const game = await createCloneGame();
            if (!cancelled) setState({ screen: "playing", game });
          } catch {
            if (!cancelled) {
              setState({
                screen: "needs-training",
                provider: clone.provider,
                username: clone.username,
              });
            }
          }
          return;
        }

        // training or failed — treat as needs-training
        setState({
          screen: "needs-training",
          provider: clone.provider,
          username: clone.username,
        });
      } catch {
        if (!cancelled) setState({ screen: "needs-profile" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleMove = useCallback(
    async (move: BoardMove) => {
      if (state.screen !== "playing") return;
      const game = state.game;
      const uci = move.uci;
      if (!uci) return;

      // Optimistic local update
      const optimisticMoves = [...game.movesUci, uci];
      const optimisticGame: CloneGameView = {
        ...game,
        movesUci: optimisticMoves,
      };
      setState({ screen: "playing", game: optimisticGame });
      setCloneThinking(true);

      try {
        const result = await postMove(game.id, uci);
        setCloneThinking(false);
        setState({
          screen: result.game.state === "postmortem" ? "postmortem" : "playing",
          game: result.game,
        });
      } catch {
        setCloneThinking(false);
        // Revert optimistic update by re-fetching game state
        setState({ screen: "playing", game });
      }
    },
    [state]
  );

  const handleTrainingSuccess = useCallback(
    async (provider: ChessProvider, username: string) => {
      setState({ screen: "training", provider, username });
      try {
        const game = await createCloneGame();
        setState({ screen: "playing", game });
      } catch {
        setState({ screen: "needs-training", provider, username });
      }
    },
    []
  );

  const handleTrainingError = useCallback(
    (provider: ChessProvider, username: string) => {
      setState({ screen: "needs-training", provider, username });
    },
    []
  );

  const handleNewGame = useCallback(async () => {
    if (newGamePending) return;
    setNewGamePending(true);
    try {
      const game = await createCloneGame();
      setState({ screen: "playing", game });
    } catch {
      // Keep the postmortem panel visible if creation fails.
    } finally {
      setNewGamePending(false);
    }
  }, [newGamePending]);

  const handleRestartGame = useCallback(async () => {
    if (state.screen !== "playing" || newGamePending) return;
    setNewGamePending(true);
    try {
      await abandonCloneGame(state.game.id);
      const game = await createCloneGame();
      setState({ screen: "playing", game });
    } catch {
      // Keep the current board if restart fails.
    } finally {
      setNewGamePending(false);
    }
  }, [newGamePending, state]);

  const handleToggleTheme = useCallback(async () => {
    const nextTheme: AppTheme = theme === "paper" ? "dark" : "paper";
    const previousTheme = theme;

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
      setTheme(previousTheme);
      document.documentElement.dataset.theme = previousTheme;
    }
  }, [theme]);

  if (state.screen === "loading") {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="text-[var(--app-muted)]">Loading…</div>
      </div>
    );
  }

  // Board-first SPA: the workspace shell is always rendered after loading.
  // Onboarding/training live in the right panel; during active play there is
  // no right panel; after the game ends the postmortem panel appears.
  const onboardingScreen =
    state.screen === "needs-profile" ||
    state.screen === "needs-training" ||
    state.screen === "training";

  const game =
    state.screen === "playing" || state.screen === "postmortem"
      ? state.game
      : null;

  const isPostmortem = state.screen === "postmortem";
  const hasPanel = onboardingScreen || isPostmortem;

  const visibleFen = game?.currentFen ?? STARTING_FEN;
  const boardOrientation = game?.userColor ?? "white";
  const visibleOrientation =
    flipped ? (boardOrientation === "white" ? "black" : "white") : boardOrientation;
  const boardDisabled = onboardingScreen || isPostmortem || cloneThinking;
  const dataMode = isPostmortem
    ? "postmortem"
    : onboardingScreen
      ? "onboarding"
      : "playing";

  return (
    <div className="bs-kit-app" data-mode={dataMode} data-panel={hasPanel ? "true" : "false"}>
      <ShellActions
        theme={theme}
        onToggleTheme={() => {
          void handleToggleTheme();
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <PathRoot segments={pathRootSegmentsForState(state)} />

      <div className="bs-kit-workspace clone-workspace">
        <div className="bs-kit-board-pane">
        <div className="bs-kit-board-stack">
          {game && (
              <ClonePlayerStrip
                cloneUsername={cloneUsername}
                rating={cloneRating}
                cloneColor={game.cloneColor}
                thinking={cloneThinking}
              />
          )}
          <div className="bs-kit-board-wrap">
            <AnalysisBoard
              fen={visibleFen}
              orientation={visibleOrientation}
              onMove={handleMove}
              disabled={boardDisabled}
                mode={isPostmortem ? "analysis" : "training"}
                coordinates={true}
                boardTheme="paper"
                pieceTheme="blindspots"
                pieceAnimation
                showLegalTargets
                className="bs-kit-analysis-board !rounded-[10px]"
              />
          </div>
          {(state.screen === "playing" || state.screen === "postmortem") && (
            <div className="bs-kit-board-actions">
              <div className="l">
                <button
                  className="bs-kit-btn ghost sm"
                  onClick={() => setFlipped((value) => !value)}
                >
                  <FlipIcon /> Flip
                </button>
              </div>
              <div className="r">
                {state.screen === "playing" ? (
                  <button
                    className="bs-kit-btn ghost sm"
                    onClick={() => {
                      void handleRestartGame();
                    }}
                    disabled={newGamePending}
                  >
                    <RestartIcon /> {newGamePending ? "Starting..." : "New game"}
                  </button>
                ) : (
                  <button
                    className="bs-kit-btn ghost sm"
                    onClick={() => {
                      void handleNewGame();
                    }}
                    disabled={newGamePending}
                  >
                    <RestartIcon /> {newGamePending ? "Starting..." : "New game"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
        {hasPanel && (
          <aside className="bs-kit-sidebar">
          {onboardingScreen ? (
            state.screen === "training" ? (
              <div className="flex flex-col gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-6">
                <h2 className="text-xl font-bold text-[var(--app-text)]">
                  Training your clone…
                </h2>
                <p className="text-sm text-[var(--app-muted)]">
                  Importing your recent games and learning your style. This
                  only takes a moment.
                </p>
              </div>
            ) : (
              <CloneOnboarding
                screen={state.screen}
                initialProvider={
                  state.screen === "needs-training"
                    ? state.provider
                    : undefined
                }
                initialUsername={
                  state.screen === "needs-training"
                    ? state.username
                    : undefined
                }
                onSuccess={handleTrainingSuccess}
                onError={handleTrainingError}
              />
            )
          ) : (
            game && (
              <ClonePostmortemPanel
                game={game}
                onNewGame={handleNewGame}
                newGamePending={newGamePending}
              />
            )
          )}
          </aside>
        )}
      </div>
      {settingsOpen && (
        <CloneSettingsDialog
          provider={cloneProvider}
          username={
            state.screen === "needs-training" || state.screen === "training"
              ? state.username
              : cloneUsername === "Your Clone"
                ? null
                : cloneUsername
          }
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function pathRootSegmentsForState(state: CloneSpaState): string[] {
  switch (state.screen) {
    case "needs-profile":
      return ["Connect profile"];
    case "needs-training":
      return ["Ready to train"];
    case "training":
      return ["Training clone"];
    case "playing":
      return ["Playing your clone"];
    case "postmortem":
      return ["Post-mortem"];
    case "loading":
      return [];
  }
}

function ShellActions({
  theme,
  onToggleTheme,
  onOpenSettings,
}: {
  theme: AppTheme;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="bs-kit-shell-actions">
      <button className="bs-kit-btn-quiet" onClick={onToggleTheme} title="Toggle theme">
        {theme === "paper" ? <MoonIcon /> : <SunIcon />}
      </button>
      <button className="bs-kit-btn-quiet" onClick={onOpenSettings} title="Settings">
        <SettingsIcon /> Settings
      </button>
      <CloneSignOutButton className="bs-kit-btn-quiet" />
    </div>
  );
}

function PathRoot({ segments }: { segments: string[] }) {
  return (
    <div className="bs-kit-path-root" aria-label={["Blindspots", ...segments].join(" > ")}>
      <img
        src="/icon.svg"
        width={20}
        height={20}
        alt=""
        className="bs-kit-path-logo"
      />
      {segments.map((segment) => (
        <span className="bs-kit-path-segment" key={segment}>
          <span className="bs-kit-path-separator" aria-hidden="true">&gt;</span>
          <span>{segment}</span>
        </span>
      ))}
    </div>
  );
}

function CloneSettingsDialog({
  provider,
  username,
  onClose,
}: {
  provider: ChessProvider | null;
  username: string | null;
  onClose: () => void;
}) {
  const profileLabel =
    provider && username
      ? `${provider === "lichess" ? "Lichess" : "Chess.com"} / ${username}`
      : "No linked profile";

  return (
    <div className="clone-settings-scrim" role="presentation" onMouseDown={onClose}>
      <div
        className="clone-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--app-text)]">Settings</h2>
            <p className="text-sm text-[var(--app-muted)]">Clone app controls</p>
          </div>
          <button className="bs-kit-btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid gap-2 border-t border-[var(--app-border)] pt-4">
          <span className="text-xs font-bold uppercase tracking-wide text-[var(--app-muted)]">
            Linked profile
          </span>
          <span className="text-sm font-semibold text-[var(--app-text)]">
            {profileLabel}
          </span>
        </div>
        <button className="bs-kit-btn secondary sm" disabled title="Not implemented yet">
          Reset clone
        </button>
        <CloneSignOutButton className="bs-kit-btn ghost sm" />
      </div>
    </div>
  );
}

function CloneSignOutButton({ className = "" }: { className?: string }) {
  function handleSignOut() {
    try {
      window.localStorage.removeItem("chess-something:settings");
    } catch {}

    window.location.assign("/auth/sign-out");
  }

  return (
    <button type="button" className={className} onClick={handleSignOut}>
      <SignOutIcon /> Sign Out
    </button>
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
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function MoonIcon() {
  return <Icon><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></Icon>;
}

function SunIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </Icon>
  );
}

function SettingsIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </Icon>
  );
}

function SignOutIcon() {
  return (
    <Icon>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 19V5a2 2 0 0 0-2-2h-5" />
      <path d="M14 21h5a2 2 0 0 0 2-2" />
    </Icon>
  );
}

function FlipIcon() {
  return (
    <Icon>
      <path d="M3 7h13M16 7l-3-3M16 7l-3 3M21 17H8M8 17l3-3M8 17l3 3" />
    </Icon>
  );
}

function RestartIcon() {
  return (
    <Icon>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </Icon>
  );
}
