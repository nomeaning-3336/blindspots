"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type {
  AnalyzeBoardTheme,
  AnalyzePieceTheme,
} from "@/lib/analyze-preferences";
import type {
  PracticeColor,
  PracticeEngineType,
  PracticeGameState,
  PracticeMoveRecord,
  PracticeStoredGame,
} from "@/lib/practice";
import {
  engineDisplayName,
  getPracticePreset,
  normalizePracticeGameState,
} from "@/lib/practice";
import { PracticeBoard } from "./practice-board";
import { PracticeMoveList } from "./practice-move-list";
import styles from "./practice.module.css";

type BoardTheme = {
  light: string;
  dark: string;
};

const BOARD_THEMES: Record<string, BoardTheme> = {
  light: { light: "#f7f0e0", dark: "#d9ccb5" },
  solarized: { light: "#f3ebcf", dark: "#c8ba98" },
  forest: { light: "#dce7d8", dark: "#7d9770" },
  ocean: { light: "#dce6f2", dark: "#5c769a" },
  crimson: { light: "#f0dde2", dark: "#73515f" },
  midnight: { light: "#efe6fb", dark: "#6d5a8f" },
};

const CLOCK_REFRESH_MS = 100;
const PRACTICE_SOUND_BASE = "/analyze/sounds";

function resolveBoardTheme(themeKey: string | null | undefined) {
  return BOARD_THEMES[String(themeKey || "midnight")] || BOARD_THEMES.midnight;
}

function formatClock(ms: number) {
  const safe = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${String(remainingMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function cloneState(state: PracticeGameState): PracticeGameState {
  return JSON.parse(JSON.stringify(state)) as PracticeGameState;
}

function materializeClocks(state: PracticeGameState, activeTurnStartedAt: number | null, now: number) {
  const clocks = {
    w: state.clocksMs.w,
    b: state.clocksMs.b,
  };
  if (state.status !== "active" || !activeTurnStartedAt) return clocks;
  const elapsed = Math.max(0, now - activeTurnStartedAt);
  clocks[state.activeColor] = Math.max(0, clocks[state.activeColor] - elapsed);
  return clocks;
}

function chooseEngineThinkTimeMs(state: PracticeGameState, clocks: Record<PracticeColor, number>) {
  const engineColor = state.playerColor === "w" ? "b" : "w";
  const remaining = clocks[engineColor];
  const incrementMs = state.incrementSeconds * 1000;
  const presetFloor =
    state.presetKey === "classical"
      ? 900
      : state.presetKey === "rapid"
        ? 550
        : state.presetKey === "blitz"
          ? 260
          : 120;
  const presetCap =
    state.presetKey === "classical"
      ? 6_500
      : state.presetKey === "rapid"
        ? 3_500
        : state.presetKey === "blitz"
          ? 1_800
          : 550;
  const reserve =
    state.presetKey === "classical"
      ? Math.max(2_500, incrementMs * 2)
      : state.presetKey === "rapid"
        ? Math.max(1_500, Math.floor(incrementMs * 1.5))
        : state.presetKey === "blitz"
          ? Math.max(700, incrementMs)
          : Math.max(250, Math.floor(incrementMs * 0.6));
  const safeAvailable = Math.max(80, remaining - reserve);
  const phaseMoves =
    state.presetKey === "classical"
      ? 30
      : state.presetKey === "rapid"
        ? 24
        : state.presetKey === "blitz"
          ? 18
          : 12;
  const dynamicBudget =
    Math.floor(remaining / phaseMoves) + Math.floor(incrementMs * 0.65);
  const boundedBudget = Math.min(presetCap, dynamicBudget, safeAvailable);
  return Math.max(Math.min(presetFloor, safeAvailable), boundedBudget);
}

function deriveGameStatus(chess: Chess, timeoutColor?: PracticeColor) {
  if (timeoutColor) {
    return {
      status: "timeout" as const,
      result: timeoutColor === "w" ? ("0-1" as const) : ("1-0" as const),
    };
  }
  if (chess.isCheckmate()) {
    return {
      status: "checkmate" as const,
      result: chess.turn() === "w" ? ("0-1" as const) : ("1-0" as const),
    };
  }
  if (
    chess.isStalemate() ||
    chess.isDraw() ||
    chess.isInsufficientMaterial() ||
    chess.isThreefoldRepetition()
  ) {
    return {
      status: "draw" as const,
      result: "1/2-1/2" as const,
    };
  }
  return {
    status: "active" as const,
    result: "*" as const,
  };
}

async function requestStockfishMove(options: {
  fen: string;
  opponentElo: number;
  moveTimeMs: number;
}) {
  const worker = new Worker("/analyze/stockfish.js");

  return await new Promise<string>((resolve, reject) => {
    let uciReady = false;

    const cleanup = () => {
      worker.terminate();
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Stockfish move request timed out."));
    }, Math.max(2_500, options.moveTimeMs + 2_000));

    worker.onmessage = (event) => {
      const line = String(event.data || "");
      if (line.includes("uciok")) {
        uciReady = true;
        const stockfishElo = Math.max(1320, Math.min(3190, Math.round(options.opponentElo)));
        worker.postMessage("setoption name Threads value 1");
        worker.postMessage("setoption name Hash value 16");
        worker.postMessage("setoption name UCI_LimitStrength value true");
        worker.postMessage(`setoption name UCI_Elo value ${stockfishElo}`);
        worker.postMessage("isready");
        return;
      }
      if (line.includes("readyok") && uciReady) {
        worker.postMessage(`position fen ${options.fen}`);
        worker.postMessage(`go movetime ${Math.max(80, Math.round(options.moveTimeMs))}`);
        return;
      }
      if (line.startsWith("bestmove")) {
        window.clearTimeout(timeout);
        const move = line.split(/\s+/)[1] || "";
        cleanup();
        if (!move || move === "(none)") {
          reject(new Error("Stockfish did not return a legal move."));
          return;
        }
        resolve(move.trim());
      }
    };

    worker.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error("Stockfish worker failed."));
    };

    worker.postMessage("uci");
  });
}

async function requestMaiaMove(options: {
  fen: string;
  presetKey: PracticeGameState["presetKey"];
  opponentElo: number;
  moveCount: number;
  signal?: AbortSignal;
}) {
  const openingBoost = options.moveCount < 12 ? 0.14 : 0;
  const temperature =
    options.opponentElo <= 900
      ? 1.55 + openingBoost
      : options.opponentElo <= 1200
        ? 1.35 + openingBoost
        : options.opponentElo <= 1500
          ? 1.18 + openingBoost
          : options.opponentElo <= 1900
            ? 1.02 + openingBoost * 0.5
            : 0.95;
  const topK =
    options.opponentElo <= 900
      ? 16
      : options.opponentElo <= 1200
        ? 14
        : options.opponentElo <= 1500
          ? 12
          : options.opponentElo <= 1900
            ? 10
            : 8;

  const response = await fetch("/api/practice/maia-move", {
    method: "POST",
    signal: options.signal,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fen: options.fen,
      eloSelf: options.opponentElo,
      eloOppo: options.opponentElo,
      modelType:
        options.presetKey === "rapid" || options.presetKey === "classical"
          ? "rapid"
          : "blitz",
      topK,
      topMoves: topK,
      temperature,
      seed: Date.now() + options.moveCount * 9973,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | { move?: string; error?: string }
    | null;

  if (!response.ok || !data?.move) {
    throw new Error(data?.error || "Maia move request failed.");
  }

  return data.move;
}

function chooseEmergencyMove(fen: string) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (!moves.length) {
    throw new Error("No legal move available.");
  }
  return `${moves[0].from}${moves[0].to}${moves[0].promotion ?? ""}`;
}

export function PracticeGameRoom({
  game,
  initialBoardTheme,
  initialPieceTheme,
}: {
  game: PracticeStoredGame;
  initialBoardTheme?: AnalyzeBoardTheme | null;
  initialPieceTheme?: AnalyzePieceTheme | null;
}) {
  const [roomState, setRoomState] = useState<PracticeGameState>(game.state);
  const [engineThinking, setEngineThinking] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<BoardTheme>(
    resolveBoardTheme(initialBoardTheme || "midnight"),
  );
  const activeTurnStartedAtRef = useRef<number | null>(Date.now());
  const saveTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const moveAudioRef = useRef<HTMLAudioElement | null>(null);
  const captureAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const [, forceTick] = useState(0);

  const chess = useMemo(() => new Chess(roomState.currentFen), [roomState.currentFen]);
  const preset = useMemo(() => getPracticePreset(roomState.presetKey), [roomState.presetKey]);
  const engineColor: PracticeColor = roomState.playerColor === "w" ? "b" : "w";

  const visibleClocks = materializeClocks(
    roomState,
    activeTurnStartedAtRef.current,
    Date.now(),
  );

  const persistSnapshot = useCallback(
    async (nextState: PracticeGameState, keepalive = false) => {
      const normalized = normalizePracticeGameState(nextState);
      if (!normalized) return;
      try {
        await fetch(`/api/practice/games/${game.id}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ state: normalized }),
          keepalive,
        });
      } catch {
        // Best-effort persistence for practice rooms.
      }
    },
    [game.id],
  );

  const materializeState = useCallback(
    (baseState: PracticeGameState, now = Date.now()) => {
      const snapshot = cloneState(baseState);
      snapshot.clocksMs = materializeClocks(baseState, activeTurnStartedAtRef.current, now);
      snapshot.updatedAt = new Date(now).toISOString();
      return snapshot;
    },
    [],
  );

  const commitState = useCallback(
    (nextState: PracticeGameState, options?: { immediateSave?: boolean }) => {
      const normalized = normalizePracticeGameState(nextState);
      if (!normalized) return;
      activeTurnStartedAtRef.current =
        normalized.status === "active" ? Date.now() : null;
      setRoomState(normalized);

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (options?.immediateSave) {
        void persistSnapshot(normalized);
      } else {
        saveTimerRef.current = window.setTimeout(() => {
          void persistSnapshot(normalized);
        }, 300);
      }
    },
    [persistSnapshot],
  );

  const playSound = useCallback((capture: boolean) => {
    const sound = capture ? captureAudioRef.current : moveAudioRef.current;
    if (!sound) return;
    sound.currentTime = 0;
    void sound.play().catch(() => {});
  }, []);

  const applyMove = useCallback(
    (
      moveInput: { from: string; to: string; promotion?: "q" | "r" | "b" | "n" },
      mover: PracticeColor,
      spentMs: number,
    ) => {
      const now = Date.now();
      const snapshot = materializeState(roomState, now);
      const chessForMove = new Chess(snapshot.currentFen);
      const move = chessForMove.move({
        from: moveInput.from,
        to: moveInput.to,
        promotion: moveInput.promotion,
      });

      if (!move) {
        throw new Error("Illegal move.");
      }

      const nextClocks = {
        ...snapshot.clocksMs,
      };
      nextClocks[mover] = Math.max(
        0,
        nextClocks[mover] + snapshot.incrementSeconds * 1000,
      );

      const derived = deriveGameStatus(chessForMove);
      const moveRecord: PracticeMoveRecord = {
        ply: snapshot.moves.length + 1,
        color: mover,
        uci: `${move.from}${move.to}${move.promotion ?? ""}`,
        san: move.san,
        from: move.from,
        to: move.to,
        promotion: move.promotion ?? null,
        fenAfter: chessForMove.fen(),
        spentMs: Math.max(0, Math.round(spentMs)),
        clockAfterMs: nextClocks[mover],
      };

      playSound(Boolean(move.captured));

      commitState(
        {
          ...snapshot,
          currentFen: chessForMove.fen(),
          clocksMs: nextClocks,
          activeColor: chessForMove.turn() as PracticeColor,
          moves: [...snapshot.moves, moveRecord],
          lastMoveUci: moveRecord.uci,
          status: derived.status,
          result: derived.result,
          updatedAt: new Date(now).toISOString(),
        },
        { immediateSave: true },
      );
    },
    [commitState, materializeState, playSound, roomState],
  );

  const finalizeTimeout = useCallback(
    (color: PracticeColor) => {
      requestIdRef.current += 1;
      const timeoutState = materializeState(roomState);
      commitState(
        {
          ...timeoutState,
          clocksMs: {
            ...timeoutState.clocksMs,
            [color]: 0,
          },
          status: "timeout",
          result: color === "w" ? "0-1" : "1-0",
        },
        { immediateSave: true },
      );
      setEngineThinking(false);
    },
    [commitState, materializeState, roomState],
  );

  useEffect(() => {
    moveAudioRef.current = new Audio(`${PRACTICE_SOUND_BASE}/move-self.mp3`);
    captureAudioRef.current = new Audio(`${PRACTICE_SOUND_BASE}/capture.mp3`);
    moveAudioRef.current.preload = "auto";
    captureAudioRef.current.preload = "auto";

    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;

      for (const sound of [moveAudioRef.current, captureAudioRef.current]) {
        if (!sound) continue;
        sound.muted = true;
        sound
          .play()
          .then(() => {
            sound.pause();
            sound.currentTime = 0;
            sound.muted = false;
          })
          .catch(() => {
            sound.muted = false;
          });
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (initialBoardTheme) {
      setTheme(resolveBoardTheme(initialBoardTheme));
      return;
    }
    const updateTheme = () => {
      setTheme(resolveBoardTheme(document.documentElement.dataset.theme));
    };

    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [initialBoardTheme]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      forceTick((value) => value + 1);
      if (roomState.status !== "active") return;
      const clocks = materializeClocks(roomState, activeTurnStartedAtRef.current, Date.now());
      if (clocks[roomState.activeColor] <= 0) {
        finalizeTimeout(roomState.activeColor);
      }
    }, CLOCK_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [finalizeTimeout, roomState]);

  useEffect(() => {
    const flush = () => {
      const snapshot = materializeState(roomState);
      void persistSnapshot(snapshot, true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [materializeState, persistSnapshot, roomState]);

  useEffect(() => {
    if (roomState.status !== "active") return;
    if (chess.turn() !== engineColor) return;
    if (engineThinking) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setEngineThinking(true);
    setError("");
    let cancelled = false;

    const start = Date.now();
    const startSnapshot = materializeState(roomState, start);
    const startingClocks = {
      ...startSnapshot.clocksMs,
    };
    const targetThinkMs = chooseEngineThinkTimeMs(startSnapshot, startingClocks);
    const maiaAbortController =
      startSnapshot.engineType === "maia" ? new AbortController() : null;
    const maiaHardStop = maiaAbortController
      ? window.setTimeout(() => {
          maiaAbortController.abort();
        }, Math.max(700, targetThinkMs + 1_500))
      : null;

    const run = async () => {
      try {
        let moveUci = "";
        try {
          moveUci =
            startSnapshot.engineType === "stockfish"
              ? await requestStockfishMove({
                  fen: startSnapshot.currentFen,
                  opponentElo: startSnapshot.opponentElo,
                  moveTimeMs: targetThinkMs,
                })
              : await requestMaiaMove({
                  fen: startSnapshot.currentFen,
                  presetKey: startSnapshot.presetKey,
                  opponentElo: startSnapshot.opponentElo,
                  moveCount: startSnapshot.moves.length,
                  signal: maiaAbortController?.signal,
                });
        } catch (primaryEngineError) {
          if (startSnapshot.engineType === "maia") {
            try {
              moveUci = await requestStockfishMove({
                fen: startSnapshot.currentFen,
                opponentElo: Math.max(1350, startSnapshot.opponentElo),
                moveTimeMs: Math.min(1_000, Math.max(140, targetThinkMs)),
              });
            } catch {
              moveUci = chooseEmergencyMove(startSnapshot.currentFen);
            }
          } else {
            moveUci = chooseEmergencyMove(startSnapshot.currentFen);
          }

          if (!moveUci) {
            throw primaryEngineError;
          }
        } finally {
          if (maiaHardStop) {
            window.clearTimeout(maiaHardStop);
          }
        }

        const elapsed = Date.now() - start;
        if (elapsed < targetThinkMs) {
          await new Promise((resolve) => window.setTimeout(resolve, targetThinkMs - elapsed));
        }

        if (cancelled || requestIdRef.current !== requestId) return;
        const spentMs = Date.now() - start;
        applyMove(
          {
            from: moveUci.slice(0, 2),
            to: moveUci.slice(2, 4),
            promotion: (moveUci.slice(4, 5) || undefined) as
              | "q"
              | "r"
              | "b"
              | "n"
              | undefined,
          },
          engineColor,
          spentMs,
        );
      } catch (engineError) {
        if (cancelled || requestIdRef.current !== requestId) return;
        setError(
          engineError instanceof Error
            ? engineError.message
            : "Opponent move failed.",
        );
      } finally {
        if (!cancelled && requestIdRef.current === requestId) {
          setEngineThinking(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (maiaHardStop) {
        window.clearTimeout(maiaHardStop);
      }
      maiaAbortController?.abort();
    };
  }, [applyMove, chess, engineColor, materializeState, roomState]);

  function handlePlayerMove(move: {
    from: string;
    to: string;
    promotion?: "q" | "r" | "b" | "n";
  }) {
    if (roomState.status !== "active") return;
    if (chess.turn() !== roomState.playerColor) return;
    if (engineThinking) return;
    setError("");
    try {
      const before = materializeState(roomState);
      const spentMs = Math.max(0, roomState.clocksMs[roomState.playerColor] - before.clocksMs[roomState.playerColor]);
      applyMove(move, roomState.playerColor, spentMs);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Move failed.");
    }
  }

  const topPlayerIsEngine = roomState.orientation === "w";
  const topPlayer = topPlayerIsEngine
    ? {
        name: engineDisplayName(roomState.engineType),
        badge:
          roomState.engineType === "maia"
            ? `${roomState.opponentElo} ELO`
            : `${roomState.opponentElo} ELO`,
        color: engineColor,
        clock: visibleClocks[engineColor],
        active: roomState.activeColor === engineColor && roomState.status === "active",
      }
    : {
        name: "You",
        badge: "Player",
        color: roomState.playerColor,
        clock: visibleClocks[roomState.playerColor],
        active:
          roomState.activeColor === roomState.playerColor &&
          roomState.status === "active",
      };

  const bottomPlayer = topPlayerIsEngine
    ? {
        name: "You",
        badge: "Player",
        color: roomState.playerColor,
        clock: visibleClocks[roomState.playerColor],
        active:
          roomState.activeColor === roomState.playerColor &&
          roomState.status === "active",
      }
    : {
        name: engineDisplayName(roomState.engineType),
        badge:
          roomState.engineType === "maia"
            ? `${roomState.opponentElo} ELO`
            : `${roomState.opponentElo} ELO`,
        color: engineColor,
        clock: visibleClocks[engineColor],
        active: roomState.activeColor === engineColor && roomState.status === "active",
      };

  return (
    <section className={styles.roomShell}>
      <div className={styles.roomTopbar}>
        <a href="/practice" className={styles.backButton}>
          Back To Practice
        </a>
      </div>

      <div className={styles.roomStage}>
        <aside className={styles.historyPanel}>
          <PracticeMoveList moves={roomState.moves} currentPly={roomState.moves.length} />
        </aside>

        <div className={styles.boardColumn}>
          <div className={styles.boardFrame}>
            <div className={styles.boardShellWrap}>
              <div
                className={`${styles.playerStrip} ${styles.playerStripTop}`}
              >
                <span
                  className={`${styles.playerTurnDot} ${
                    topPlayer.active ? styles.playerTurnDotActive : ""
                  }`}
                />
                <div className={styles.playerMain}>
                  <span className={styles.playerName}>{topPlayer.name}</span>
                  <span className={styles.playerBadge}>
                    {topPlayer.badge}
                    {topPlayer.active && engineThinking && topPlayer.color === engineColor
                      ? " · Thinking"
                      : ""}
                  </span>
                </div>
                <span
                  className={`${styles.playerClock} ${
                    topPlayer.active ? "" : styles.playerClockIdle
                  }`}
                >
                  {formatClock(topPlayer.clock)}
                </span>
              </div>

              <PracticeBoard
                fen={roomState.currentFen}
                orientation={roomState.orientation}
                canInteract={
                  roomState.status === "active" &&
                  !engineThinking &&
                  chess.turn() === roomState.playerColor
                }
                playerColor={roomState.playerColor}
                pieceTheme={initialPieceTheme || "maestro"}
                lastMoveUci={roomState.lastMoveUci}
                lightSquare={theme.light}
                darkSquare={theme.dark}
                onMove={handlePlayerMove}
              />

              <div
                className={`${styles.playerStrip} ${styles.playerStripBottom}`}
              >
                <span
                  className={`${styles.playerTurnDot} ${
                    bottomPlayer.active ? styles.playerTurnDotActive : ""
                  }`}
                />
                <div className={styles.playerMain}>
                  <span className={styles.playerName}>{bottomPlayer.name}</span>
                  <span className={styles.playerBadge}>{bottomPlayer.badge}</span>
                </div>
                <span
                  className={`${styles.playerClock} ${
                    bottomPlayer.active ? "" : styles.playerClockIdle
                  }`}
                >
                  {formatClock(bottomPlayer.clock)}
                </span>
              </div>
            </div>
          </div>

          {error ? (
            <div className={styles.roomError}>{error}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
