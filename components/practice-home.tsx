"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PracticeGameSummary } from "@/lib/practice";
import { engineDisplayName, formatPracticeTimeControl } from "@/lib/practice";
import styles from "./practice.module.css";

function formatSavedAt(value: string) {
  try {
    return new Date(value).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export function PracticeHome({
  canCreate,
  signInHref,
  activeGames,
}: {
  canCreate: boolean;
  signInHref: string;
  activeGames: PracticeGameSummary[];
}) {
  const router = useRouter();
  const [games, setGames] = useState(activeGames);
  const [deleteError, setDeleteError] = useState("");
  const [pendingDeleteId, startDeleteTransition] = useTransition();

  function openPlayFlow() {
    if (!canCreate) {
      window.location.href = signInHref;
      return;
    }
    if (games[0]) {
      router.push(`/practice/${games[0].id}`);
      return;
    }
    router.push("/practice/new");
  }

  function deleteGame(gameId: string) {
    startDeleteTransition(async () => {
      setDeleteError("");
      try {
        const response = await fetch(`/api/practice/games/${gameId}`, {
          method: "DELETE",
        });
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(data?.error || "Could not delete the practice game.");
        }

        setGames((currentGames) =>
          currentGames.filter((game) => game.id !== gameId),
        );
      } catch (deleteGameError) {
        setDeleteError(
          deleteGameError instanceof Error
            ? deleteGameError.message
            : "Could not delete the practice game.",
        );
      }
    });
  }

  return (
    <div className={styles.page}>
      <section className={`${styles.card} ${styles.hero}`}>
        <div className={styles.heroKicker}>Practice</div>
        <h1 className={styles.heroTitle}>Live Training Floor</h1>
        <p className={styles.heroText}>
          Start a real game room, pick your opponent, and keep coming back to the
          exact same position whenever you want to resume.
        </p>
      </section>

      <section className={styles.modeGrid}>
        <button
          type="button"
          className={`${styles.card} ${styles.modeCard}`}
          onClick={openPlayFlow}
        >
          <div>
            <div className={styles.modeLabel}>Play A Game</div>
            <h2 className={styles.modeTitle}>Maia 2 Or Stockfish</h2>
          </div>
          <p className={styles.modeDescription}>
            Open a dedicated board room, choose a human-like or engine-style
            opponent, and play with a real clock. Only one live practice room can
            stay active at a time.
          </p>
        </button>

        <div
          className={`${styles.card} ${styles.modeCard} ${styles.modeCardDisabled}`}
        >
          <div>
            <div className={styles.modeLabel}>Puzzle Practice</div>
            <h2 className={styles.modeTitle}>Coming Soon</h2>
          </div>
          <p className={styles.modeDescription}>
            Tactical drills and puzzle sessions will live here once the game room
            flow is locked in.
          </p>
        </div>
      </section>

      {!canCreate ? (
        <section className={`${styles.card} ${styles.resumeCard}`}>
          <div className={styles.modeLabel}>Sign In</div>
          <div className={styles.resumeName}>Save Practice Games</div>
          <p className={styles.modeDescription}>
            Practice rooms are stored per account so you can leave and resume the
            same position later.
          </p>
          <a href={signInHref} className={styles.backButton}>
            Sign In
          </a>
        </section>
      ) : null}

      <section className={styles.pageSection}>
        <div className={styles.resumeHeader}>
          <div>
            <div className={styles.resumeKicker}>Resume</div>
            <h2 className={styles.resumeTitle}>Active Practice Games</h2>
          </div>
          <div className={styles.resumeMeta}>{games.length} saved</div>
        </div>
        {deleteError ? (
          <p className={styles.resumeError}>{deleteError}</p>
        ) : null}
        {games.length ? (
          <div className={styles.resumeGrid}>
            {games.map((game) => (
              <div key={game.id} className={`${styles.card} ${styles.resumeCard}`}>
                <div className={styles.resumeMeta}>
                  {engineDisplayName(game.engineType)} · {game.opponentElo} ELO ·{" "}
                  {formatPracticeTimeControl(
                    game.baseSeconds,
                    game.incrementSeconds,
                  )}
                </div>
                <div className={styles.resumeName}>
                  {game.moveCount ? "Resume Game" : "Fresh Board"}
                </div>
                <div className={styles.resumeFen}>{game.currentFen}</div>
                <div className={styles.resumeMeta}>
                  Last saved {formatSavedAt(game.lastPlayedAt)}
                </div>
                <div className={styles.resumeActions}>
                  <button
                    type="button"
                    className={styles.resumeActionButton}
                    onClick={() => router.push(`/practice/${game.id}`)}
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    className={`${styles.resumeActionButton} ${styles.resumeDeleteButton}`}
                    onClick={() => deleteGame(game.id)}
                    disabled={pendingDeleteId}
                  >
                    {pendingDeleteId ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={`${styles.card} ${styles.resumeCard}`}>
            <div className={styles.modeDescription}>
              No active practice rooms yet. Start one above and it will appear here
              as a resume card.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
