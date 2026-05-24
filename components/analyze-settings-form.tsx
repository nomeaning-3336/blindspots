"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { AnalyzePieceTheme, AnalyzePreferences } from "@/lib/analyze-preferences";
import {
  analyzeBoardThemeForAppTheme,
  normalizeAnalyzePreferences,
} from "@/lib/analyze-preferences";

const LOCAL_STORAGE_KEY = "chessview-analyze-preferences";

const PIECE_THEMES: Array<{
  id: AnalyzePieceTheme;
  label: string;
  assetSet: string;
}> = [
  { id: "blindspots", label: "Blindspots", assetSet: "blindspots" },
  { id: "cburnett", label: "Cburnett", assetSet: "cburnett" },
  { id: "alpha-wood", label: "Alpha Wood", assetSet: "alpha" },
  { id: "maestro", label: "Maestro", assetSet: "maestro" },
  { id: "smart", label: "Smart", assetSet: "merida" },
  { id: "staunty-wood", label: "Staunty Wood", assetSet: "staunty" },
  { id: "governor", label: "Governor", assetSet: "governor" },
  { id: "companion", label: "Companion", assetSet: "companion" },
];

const MULTI_PV_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);

function pieceAsset(assetSet: string, code: string) {
  return `/analyze/pieces/${assetSet}/${code}.svg`;
}

function syncedBoardTheme(preferences: AnalyzePreferences) {
  const currentTheme =
    typeof document !== "undefined" ? document.documentElement.dataset.theme : null;

  return {
    ...preferences,
    boardTheme: analyzeBoardThemeForAppTheme(currentTheme),
  };
}

export function AnalyzeSettingsForm({
  currentPreferences,
  sections = "all",
  saveLabel = "Save Analyze Settings",
  helperText,
}: {
  currentPreferences: AnalyzePreferences;
  sections?: "all" | "search" | "visual";
  saveLabel?: string;
  helperText?: string;
}) {
  const [preferences, setPreferences] = useState<AnalyzePreferences>(currentPreferences);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const lastSavedRef = useRef(JSON.stringify(currentPreferences));

  const limitLabel = preferences.limitKind === "depth" ? "Search Depth" : "Search Time (ms)";

  function update<K extends keyof AnalyzePreferences>(key: K, value: AnalyzePreferences[K]) {
    setPreferences((previous) => ({ ...previous, [key]: value }));
    setMessage("");
  }

  useEffect(() => {
    const serialized = JSON.stringify(syncedBoardTheme(preferences));
    if (serialized === lastSavedRef.current) return;

    const timeoutId = window.setTimeout(() => {
      startTransition(async () => {
        setMessage("");
        const response = await fetch("/api/analyze/preferences", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: serialized,
        });

        if (response.status === 401) {
          // Unauthenticated - save to localStorage instead
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
            lastSavedRef.current = serialized;
            setMessage("Analyze settings saved locally.");
          } catch {
            setMessage("Analyze settings could not be saved.");
          }
          return;
        }

        if (!response.ok) {
          setMessage("Analyze settings could not be saved right now.");
          return;
        }

        lastSavedRef.current = serialized;
        setMessage("Analyze settings saved.");
      });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [preferences, startTransition]);

  // Load from localStorage on mount if no server preferences provided
  useEffect(() => {
    // Check if currentPreferences looks like it came from normalizeAnalyzePreferences(null)
    // which is the case when the server had no stored preferences (unauthenticated)
    const isLikelyDefaultPreferences =
      currentPreferences.limitKind === "time" &&
      currentPreferences.timeLimitValue === 250 &&
      currentPreferences.depthLimitValue === 18 &&
      currentPreferences.linesShown === 3 &&
      currentPreferences.threads === 1 &&
      currentPreferences.pieceTheme === "blindspots";

    if (!isLikelyDefaultPreferences) return;
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const normalized = syncedBoardTheme(normalizeAnalyzePreferences(parsed));
        setPreferences(normalized);
        lastSavedRef.current = JSON.stringify(normalized);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [currentPreferences]);

  return (
    <div className="mt-6 grid gap-5">
      {(sections === "all" || sections === "search") && (
        <section className="app-brutal-inset p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--app-muted)]">Search</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
                Search Mode
              </span>
              <select
                value={preferences.limitKind}
                onChange={(event) =>
                  update("limitKind", event.target.value === "depth" ? "depth" : "time")
                }
                className="app-brutal-input px-4 py-3 text-sm text-[var(--app-text)] outline-none transition"
              >
                <option value="time">Time</option>
                <option value="depth">Depth</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
                {limitLabel}
              </span>
              <input
                type="number"
                min={1}
                max={preferences.limitKind === "depth" ? 245 : 1000000}
                step={1}
                value={
                  preferences.limitKind === "depth"
                    ? preferences.depthLimitValue
                    : preferences.timeLimitValue
                }
                onChange={(event) => {
                  const nextValue = Number.parseInt(event.target.value || "0", 10);
                  if (preferences.limitKind === "depth") {
                    update("depthLimitValue", Number.isFinite(nextValue) ? nextValue : 18);
                  } else {
                    update("timeLimitValue", Number.isFinite(nextValue) ? nextValue : 250);
                  }
                }}
                className="app-brutal-input px-4 py-3 text-sm text-[var(--app-text)] outline-none transition"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
                Multi PV
              </span>
              <select
                value={preferences.linesShown}
                onChange={(event) => update("linesShown", Number.parseInt(event.target.value, 10) || 3)}
                className="app-brutal-input px-4 py-3 text-sm text-[var(--app-text)] outline-none transition"
              >
                {MULTI_PV_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
                Threads
              </span>
              <input
                type="number"
                min={1}
                max={32}
                step={1}
                value={preferences.threads}
                onChange={(event) =>
                  update("threads", Number.parseInt(event.target.value || "0", 10) || 1)
                }
                className="app-brutal-input px-4 py-3 text-sm text-[var(--app-text)] outline-none transition"
              />
            </label>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--app-muted)]">
            These control the default engine search mode, search budget, number of lines,
            and Stockfish threads on the analyze board.
          </p>
        </section>
      )}

      {(sections === "all" || sections === "visual") && (
        <>
          <section className="app-brutal-inset p-5">
            <div className="mt-4 app-theme-grid">
              {PIECE_THEMES.map((theme) => (
                <label key={theme.id} className="app-theme-option">
                  <input
                    type="radio"
                    name="pieceTheme"
                    value={theme.id}
                    checked={preferences.pieceTheme === theme.id}
                    onChange={() => update("pieceTheme", theme.id)}
                  />
                  <div className="app-theme-option-card">
                    <div className="analyze-piece-preview">
                      <img src={pieceAsset(theme.assetSet, "wK")} alt="" />
                      <img src={pieceAsset(theme.assetSet, "bQ")} alt="" />
                    </div>
                    <div className="app-theme-meta mt-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
                        {theme.label}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </section>
        </>
      )}

      {(message || helperText) && (
        <p className="text-sm leading-6 text-[var(--app-muted)]">
          {isPending ? `${saveLabel}...` : message || helperText}
        </p>
      )}
    </div>
  );
}




