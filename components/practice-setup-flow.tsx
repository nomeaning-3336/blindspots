"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PRACTICE_ENGINE_OPTIONS,
  PRACTICE_INCREMENT_OPTIONS,
  PRACTICE_MAIA_ELO_OPTIONS,
  PRACTICE_STOCKFISH_ELO_OPTIONS,
  PRACTICE_TIME_PRESETS,
  type PracticeEngineType,
  type PracticePresetKey,
} from "@/lib/practice";
import { PracticeLoader } from "./practice-loader";
import styles from "./practice.module.css";

const LOADER_REVEAL_MS = 1500;

export function PracticeSetupFlow() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [engineType, setEngineType] = useState<PracticeEngineType>("maia");
  const [presetKey, setPresetKey] = useState<PracticePresetKey>("blitz");
  const [incrementSeconds, setIncrementSeconds] = useState(2);
  const [opponentElo, setOpponentElo] = useState(1500);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => setIsReady(true), LOADER_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const activePreset = useMemo(
    () =>
      PRACTICE_TIME_PRESETS.find((preset) => preset.key === presetKey) ||
      PRACTICE_TIME_PRESETS[1],
    [presetKey],
  );

  const eloOptions = useMemo(
    () =>
      engineType === "maia"
        ? PRACTICE_MAIA_ELO_OPTIONS
        : PRACTICE_STOCKFISH_ELO_OPTIONS,
    [engineType],
  );

  useEffect(() => {
    setIncrementSeconds(activePreset.defaultIncrementSeconds);
  }, [activePreset.key, activePreset.defaultIncrementSeconds]);

  useEffect(() => {
    if (!eloOptions.some((elo) => elo === opponentElo)) {
      setOpponentElo(eloOptions[0]);
    }
  }, [eloOptions, opponentElo]);

  function startGame() {
    startTransition(async () => {
      setError("");
      try {
        const response = await fetch("/api/practice/games", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            engineType,
            presetKey,
            incrementSeconds,
            opponentElo,
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | { id?: string; error?: string }
          | null;

        if (!response.ok || !data?.id) {
          throw new Error(data?.error || "Could not create a practice game.");
        }

        router.push(`/practice/${data.id}`);
      } catch (launchError) {
        setError(
          launchError instanceof Error
            ? launchError.message
            : "Could not create a practice game.",
        );
      }
    });
  }

  return (
    <div className={styles.setupStage}>
      <PracticeLoader
        title="Preparing Practice Room"
        description="Waking up the board, syncing the clock presets, and staging your opponent options."
      />
      {isReady ? (
        <div className={styles.setupModalBackdrop}>
          <div className={styles.setupModal}>
            <div className={styles.heroKicker}>Practice</div>
            <h1 className={styles.setupTitle}>Choose The Room</h1>
            <p className={styles.setupText}>
              Pick the opponent style first, then lock in the clock you want to
              train with.
            </p>

            <div className={styles.setupGrid}>
              <section>
                <h2 className={styles.setupSectionTitle}>Opponent</h2>
                <div className={styles.optionGrid}>
                  {PRACTICE_ENGINE_OPTIONS.map((engine) => (
                    <button
                      key={engine.key}
                      type="button"
                      className={`${styles.optionButton} ${
                        engineType === engine.key ? styles.optionButtonActive : ""
                      }`}
                      onClick={() => setEngineType(engine.key)}
                    >
                      <div className={styles.optionButtonTitle}>{engine.title}</div>
                      <div className={styles.optionButtonText}>
                        {engine.description}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h2 className={styles.setupSectionTitle}>Time Control</h2>
                <div className={styles.optionGrid}>
                  {PRACTICE_TIME_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      className={`${styles.optionButton} ${
                        presetKey === preset.key ? styles.optionButtonActive : ""
                      }`}
                      onClick={() => setPresetKey(preset.key)}
                    >
                      <div className={styles.optionButtonTitle}>{preset.label}</div>
                      <div className={styles.optionButtonText}>
                        {Math.floor(preset.baseSeconds / 60)} minutes ·{" "}
                        {preset.description}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h2 className={styles.setupSectionTitle}>Opponent Elo</h2>
                <div className={styles.incrementRow}>
                  {eloOptions.map((elo) => (
                    <button
                      key={`elo-${elo}`}
                      type="button"
                      className={`${styles.incrementButton} ${
                        opponentElo === elo ? styles.incrementButtonActive : ""
                      }`}
                      onClick={() => setOpponentElo(elo)}
                    >
                      {elo}
                    </button>
                  ))}
                </div>
                <div className={styles.optionButtonText}>
                  {engineType === "maia"
                    ? "Maia 2 supports a broader human-style range from 600 upward."
                    : "Stockfish strength limiting is reliable from roughly 1350 Elo upward in this room."}
                </div>
              </section>

              <section>
                <h2 className={styles.setupSectionTitle}>Increment</h2>
                <div className={styles.incrementRow}>
                  {PRACTICE_INCREMENT_OPTIONS.map((seconds) => (
                    <button
                      key={`increment-${seconds}`}
                      type="button"
                      className={`${styles.incrementButton} ${
                        incrementSeconds === seconds ? styles.incrementButtonActive : ""
                      }`}
                      onClick={() => setIncrementSeconds(seconds)}
                    >
                      +{seconds}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {error ? <p className={styles.optionButtonText}>{error}</p> : null}

            <div className={styles.setupActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => router.push("/practice")}
              >
                Back
              </button>
              <button
                type="button"
                className={styles.startButton}
                onClick={startGame}
                disabled={isPending}
              >
                {isPending ? "Starting..." : "Start Game"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
