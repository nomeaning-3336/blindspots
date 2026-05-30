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

  if (state.screen === "loading") {
    return (
      <div className="clone-workspace flex items-center justify-center">
        <div className="text-[var(--app-muted)]">Loading…</div>
      </div>
    );
  }

  if (
    state.screen === "needs-profile" ||
    state.screen === "needs-training"
  ) {
    return (
      <CloneOnboarding
        screen={state.screen}
        onSuccess={handleTrainingSuccess}
        onError={handleTrainingError}
      />
    );
  }

  if (state.screen === "training") {
    return (
      <div className="clone-workspace flex items-center justify-center">
        <div className="text-[var(--app-muted)]">Training your clone…</div>
      </div>
    );
  }

  const game =
    state.screen === "playing" || state.screen === "postmortem"
      ? state.game
      : null;
  if (!game) return null;

  const isPostmortem = state.screen === "postmortem";

  return (
    <div
      className="clone-workspace"
      data-mode={isPostmortem ? "postmortem" : "playing"}
    >
      <div className="bs-kit-board-pane">
        <div className="bs-kit-board-stack">
          <ClonePlayerStrip
            cloneUsername={cloneUsername}
            cloneColor={game.cloneColor}
            thinking={cloneThinking}
          />
          <div className="bs-kit-board-wrap">
            <AnalysisBoard
              fen={game.currentFen}
              orientation={game.userColor}
              onMove={handleMove}
              disabled={isPostmortem}
              mode={isPostmortem ? "analysis" : "training"}
              coordinates={true}
              className="!rounded-[10px]"
            />
          </div>
        </div>
      </div>
      {isPostmortem && (
        <aside className="bs-kit-sidebar">
          <ClonePostmortemPanel game={game} />
        </aside>
      )}
    </div>
  );
}
