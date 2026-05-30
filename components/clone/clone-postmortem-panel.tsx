"use client";

import type { CloneGameView } from "@/components/clone/clone-spa";

interface ClonePostmortemPanelProps {
  game: CloneGameView;
}

function resultLabel(result: CloneGameView["result"], userColor: "white" | "black"): string {
  if (!result) return "Game in progress";
  if (result === "draw") return "Draw";
  return result === userColor ? "You won!" : "You lost";
}

export function ClonePostmortemPanel({ game }: ClonePostmortemPanelProps) {
  const result = resultLabel(game.result, game.userColor);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-lg font-bold text-[var(--app-text)]">{result}</h3>
        <p className="text-sm text-[var(--app-muted)]">
          {game.movesUci.length} moves played
        </p>
      </div>

      <div>
<h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--app-muted)]">
          Moves
        </h4>
        <div className="flex flex-col gap-1 text-sm">
          {game.movesUci.length === 0 ? (
            <p className="text-[var(--app-muted)]">No moves yet.</p>
          ) : (
            <div className="flex flex-col">
              {Array.from({ length: Math.ceil(game.movesUci.length / 2) }).map(
                (_, i) => {
                  const whiteMove = game.movesUci[i * 2];
                  const blackMove = game.movesUci[i * 2 + 1];
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[2rem_1fr_1fr] gap-2 text-[var(--app-text)]"
                    >
                      <span className="text-[var(--app-muted)]">{i + 1}.</span>
                      <span>{whiteMove ?? "—"}</span>
                      <span className="text-[var(--app-muted)]">
                        {blackMove ?? "—"}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
