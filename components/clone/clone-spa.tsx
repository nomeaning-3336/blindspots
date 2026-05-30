"use client";

import { useCallback, useEffect, useState } from "react";
import { AnalysisBoard, type BoardMove } from "@/components/chess/analysis-board";
import { CloneOnboarding } from "@/components/clone/clone-onboarding";
import { ClonePostmortemPanel } from "@/components/clone/clone-postmortem-panel";
import { ClonePlayerStrip } from "@/components/clone/clone-player-strip";

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
  const [newGamePending, setNewGamePending] = useState(false);

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

        const clone = data.clone as {
          id: string;
          provider: ChessProvider;
          username: string;
          status: string;
        };
        setCloneUsername(clone.username);

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
  const boardDisabled = onboardingScreen || isPostmortem || cloneThinking;
  const dataMode = isPostmortem
    ? "postmortem"
    : onboardingScreen
      ? "onboarding"
      : "playing";

  return (
    <div
      className="clone-workspace"
      data-mode={dataMode}
      data-panel={hasPanel ? "true" : "false"}
    >
      <div className="bs-kit-board-pane">
        <div className="bs-kit-board-stack">
          {game && (
            <ClonePlayerStrip
              cloneUsername={cloneUsername}
              cloneColor={game.cloneColor}
              thinking={cloneThinking}
            />
          )}
          <div className="bs-kit-board-wrap">
            <AnalysisBoard
              fen={visibleFen}
              orientation={boardOrientation}
              onMove={handleMove}
              disabled={boardDisabled}
              mode={isPostmortem ? "analysis" : "training"}
              coordinates={true}
              className="!rounded-[10px]"
            />
          </div>
        </div>
      </div>
      {hasPanel && (
        <aside className="bs-kit-sidebar">
          {onboardingScreen ? (
            state.screen === "training" ? (
              <div className="flex flex-col gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-8 shadow-lg">
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
  );
}
