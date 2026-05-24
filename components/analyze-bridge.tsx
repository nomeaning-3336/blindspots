"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnalysisBoard, type BoardMove } from "@/components/chess/analysis-board";
import {
  BoardWithEvalBar,
  EngineLinesSection,
  type EngineLineResult,
} from "@/components/train/postmortem-shared";
import type { AnalyzePreferences } from "@/lib/analyze-preferences";
import { whitePositiveMateCp } from "@/lib/training/postmortem-terminal-display";
import type { MoveClassification } from "@/lib/move-classification";

declare global {
  interface Window {
    __CHESS_SOMETHING_BASE_PATH__?: string;
    __CHESS_SOMETHING_NEXT_ANALYZE_BOOT__?: {
      promise: Promise<void> | null;
      loaded: boolean;
      version?: string | null;
    };
    __CHESSVIEW_INITIAL_ANALYZE_PREFERENCES__?: AnalyzePreferences | null;
    __CHESSVIEW_ANALYZE_PREFERENCES_PERSIST_URL__?: string | null;
    __CHESSVIEW_INITIAL_ANALYZE_FEN__?: string | null;
  }
}

const ANALYZE_BASE_PATH = "/analyze";
const ANALYZE_ASSET_VERSION = "2026-05-09-postmortem-parity";
const ANALYZE_STYLE_ID = "analyze-style";
const ANALYZE_OVERRIDE_ID = "analyze-react-override";
const ANALYZE_CHESS_SCRIPT_ID = "analyze-chess-js";
const ANALYZE_APP_SCRIPT_ID = "analyze-runtime";
const ANALYZE_PAGE_TITLE =
  "Blindspots.gg - Chess Training for the Positions You Keep Getting Wrong";

type AnalyzeRuntimeRow = {
  depth?: number;
  multipv?: number;
  scoreCp?: number;
  mate?: number | null;
  pv?: string[];
  bestUci?: string;
  firstSan?: string;
  restSan?: string;
  continuationSan?: string[];
};

type AnalyzeRuntimeApi = {
  _renderCount?: number;
  currentFen?: () => string | undefined;
  doMove?: (uci: string) => void;
  setAppTheme?: (theme: string | null) => void;
  pauseForNavigation?: () => void;
  classificationForFenAndUci?: (fen: string, uci: string) => { label?: string } | null;
  state?: {
    current?: { fen?: string };
    orientation?: "white" | "black";
    boardTheme?: AnalyzePreferences["boardTheme"];
    pieceTheme?: AnalyzePreferences["pieceTheme"];
    analysisRows?: AnalyzeRuntimeRow[];
    analysisRowsFen?: string;
    engineBusy?: boolean;
    engineLoading?: boolean;
    engineLinesHidden?: boolean;
  };
};

type AnalyzeRuntimeSnapshot = {
  fen: string;
  orientation: "white" | "black";
  boardTheme: AnalyzePreferences["boardTheme"];
  pieceTheme: AnalyzePreferences["pieceTheme"];
  lines: EngineLineResult[];
  evalCp?: number;
  evalMate?: number | null;
  isLoading: boolean;
};

const DEFAULT_ANALYZE_SNAPSHOT: AnalyzeRuntimeSnapshot = {
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  orientation: "white",
  boardTheme: "paper",
  pieceTheme: "blindspots",
  lines: [],
  isLoading: true,
};

function normalizeAnalysisSan(value: string | undefined) {
  return String(value || "")
    .replace(/^\d+\.\.\.\s*/, "")
    .replace(/^\d+\.\s*/, "")
    .trim();
}

function splitAnalyzeContinuation(value: string | undefined) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function classificationFromAnalyzeLabel(label: string | undefined): MoveClassification | undefined {
  const normalized = String(label || "").trim().toLowerCase();
  if (
    normalized === "brilliant" ||
    normalized === "critical" ||
    normalized === "best" ||
    normalized === "excellent" ||
    normalized === "good" ||
    normalized === "okay" ||
    normalized === "inaccuracy" ||
    normalized === "mistake" ||
    normalized === "blunder"
  ) {
    return normalized;
  }
  return undefined;
}

function snapshotFromAnalyzeRuntime(): AnalyzeRuntimeSnapshot {
  const api = window.__chessSomething as AnalyzeRuntimeApi | undefined;
  const state = api?.state;
  const fen = api?.currentFen?.() || state?.current?.fen || DEFAULT_ANALYZE_SNAPSHOT.fen;
  const rows = Array.isArray(state?.analysisRows) && state?.analysisRowsFen === fen
    ? state.analysisRows
    : [];
  const lines = rows
    .filter((row) => row.bestUci)
    .slice(0, 5)
    .map((row, index): EngineLineResult => {
      const classification = classificationFromAnalyzeLabel(
        api?.classificationForFenAndUci?.(fen, row.bestUci || "")?.label,
      );
      return {
        cp: typeof row.scoreCp === "number" ? row.scoreCp : 0,
        mate: typeof row.mate === "number" ? row.mate : null,
        depth: typeof row.depth === "number" ? row.depth : 0,
        rank: typeof row.multipv === "number" ? row.multipv : index + 1,
        bestMove: row.bestUci || "",
        bestSan: normalizeAnalysisSan(row.firstSan) || row.bestUci || "",
        pv: Array.isArray(row.pv) ? row.pv : [],
        pvSan: splitAnalyzeContinuation(row.restSan),
        continuationSan: Array.isArray(row.continuationSan)
          ? row.continuationSan
          : splitAnalyzeContinuation(row.restSan),
        classification,
        source: "multipv",
      };
    });

  return {
    fen,
    orientation: state?.orientation === "black" ? "black" : "white",
    boardTheme: state?.boardTheme || DEFAULT_ANALYZE_SNAPSHOT.boardTheme,
    pieceTheme: state?.pieceTheme || DEFAULT_ANALYZE_SNAPSHOT.pieceTheme,
    lines,
    evalCp: lines[0]?.cp,
    evalMate: lines[0]?.mate ?? null,
    isLoading: Boolean(state?.engineBusy || state?.engineLoading) && !state?.engineLinesHidden,
  };
}

function ensureStyleLink(id: string, href: string) {
  const existing = document.getElementById(id) as HTMLLinkElement | null;
  if (existing) {
    const currentHref = existing.getAttribute("href") || "";
    if (currentHref === href) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const onLoad = () => resolve();
      const onError = () => reject(new Error(`Failed to load stylesheet: ${href}`));
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      existing.href = href;
    });
  }

  return new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
    document.head.appendChild(link);
  });
}

function ensureOverrideStyle() {
  const existing = document.getElementById(ANALYZE_OVERRIDE_ID) as HTMLStyleElement | null;
  const style = existing || document.createElement("style");
  style.id = ANALYZE_OVERRIDE_ID;
  style.textContent = `
    body.analyze-embedded {
      overflow: hidden !important;
      background: transparent !important;
    }

    #analyze-app-host {
      position: relative;
      width: 100%;
      height: var(--analyze-viewport-room, 100%);
      min-height: var(--analyze-viewport-room, 100%);
      background: transparent !important;
    }

    #analyze-app-host #app {
      position: relative;
      width: 100%;
      height: var(--analyze-viewport-room, 100%) !important;
      min-height: var(--analyze-viewport-room, 100%) !important;
      background: transparent !important;
    }

    /* Hide the embedded topbar — React shell provides the header */
    #analyze-app-host #app .topbar {
      display: none !important;
    }

    /* Hide the old standalone player strips — they are for 2-player mode, not embedded analysis */
    #analyze-app-host #app .board-player-info {
      display: none !important;
    }

    #analyze-app-host #app .shell {
      position: absolute;
      inset: 0;
      height: 100% !important;
      min-height: 100% !important;
      background: transparent;
    }

    @media (max-width: 1200px) {
      #analyze-app-host #app {
        height: auto !important;
        min-height: var(--analyze-viewport-room, 100%) !important;
      }

      #analyze-app-host #app .shell {
        height: auto !important;
        min-height: var(--analyze-viewport-room, 100%) !important;
        position: relative !important;
      }
    }

    #analyze-app-host #app #coachPill input,
    #analyze-app-host #app #assistantInput {
      font-size: 0.8rem !important;
      line-height: 1.5 !important;
      padding: 9px 12px !important;
      letter-spacing: normal !important;
    }

    /* App-shell global button resets outrank the embedded layered toolbar CSS.
       Keep the legacy look but allow responsive downscaling on narrower hosts. */
    #analyze-app-host #app .board-options .btn {
      font-family: "JetBrains Mono", monospace !important;
      font-size: clamp(0.64rem, 0.5rem + 0.24vw, 0.74rem) !important;
      font-weight: 700 !important;
      line-height: 1.1 !important;
      letter-spacing: 0.08em !important;
      min-height: 32px !important;
      padding: 7px 12px !important;
      text-transform: uppercase !important;
    }

    /* Restore the toolbar box to its natural position so its outer border
       stays intact, then create the tiny board/toolbar gap on the board frame. */
    #analyze-app-host #app .board-options {
      transform: none !important;
      position: relative;
      z-index: 2;
    }

    #analyze-app-host #app .board-options .btn:hover,
    #analyze-app-host #app .board-options .btn:focus-visible,
    #analyze-app-host #app .board-options .btn[data-visual-hover="true"],
    #analyze-app-host #app .settings-trigger:hover,
    #analyze-app-host #app .settings-trigger:focus-visible,
    #analyze-app-host #app .settings-trigger[data-visual-hover="true"] {
      border-color: var(--app-nav-hover-bg) !important;
      background: var(--app-nav-hover-bg) !important;
      color: var(--app-nav-hover-text) !important;
    }

    #analyze-app-host #app .settings-trigger:hover .settings-trigger-title,
    #analyze-app-host #app .settings-trigger[data-visual-hover="true"] .settings-trigger-title,
    #analyze-app-host #app .settings-trigger:hover .settings-chip,
    #analyze-app-host #app .settings-trigger[data-visual-hover="true"] .settings-chip,
    #analyze-app-host #app .settings-trigger:hover .settings-chip-value,
    #analyze-app-host #app .settings-trigger[data-visual-hover="true"] .settings-chip-value,
    #analyze-app-host #app .settings-trigger:hover .settings-chip-label,
    #analyze-app-host #app .settings-trigger[data-visual-hover="true"] .settings-chip-label,
    #analyze-app-host #app .settings-trigger:hover .settings-chip-colon,
    #analyze-app-host #app .settings-trigger[data-visual-hover="true"] .settings-chip-colon,
    #analyze-app-host #app .settings-trigger:focus-visible .settings-trigger-title,
    #analyze-app-host #app .settings-trigger:focus-visible .settings-chip,
    #analyze-app-host #app .settings-trigger:focus-visible .settings-chip-value,
    #analyze-app-host #app .settings-trigger:focus-visible .settings-chip-label,
    #analyze-app-host #app .settings-trigger:focus-visible .settings-chip-colon {
      color: inherit !important;
      border-color: var(--app-border-dim) !important;
    }

    #analyze-app-host #app .board-frame {
      margin-bottom: 0 !important;
    }

    #analyze-app-host #app .section-head {
      background: var(--app-bg) !important;
    }

    #analyze-app-host #app .board-analysis {
      background: var(--app-bg) !important;
    }

    #analyze-app-host #app .board-history-panel {
      background: var(--app-bg) !important;
    }

    /* Force the embedded analyze host to keep the toolbar visible */
    #analyze-app-host,
    #analyze-app-host #app,
    #analyze-app-host #app .board-pane,
    #analyze-app-host #app .board-stage,
    #analyze-app-host #app .board-stack {
      min-height: 0;
      overflow: visible !important;
    }

    #analyze-app-host #app .board-stage {
      align-items: start !important;
      --board-shell-height: var(--board-shell-width) !important;
      --board-stage-height: calc(
        var(--board-shell-width) + var(--board-options-height) + var(--board-stack-gap)
      ) !important;
    }

    #analyze-app-host #app .board-stack {
      height: var(--board-stage-height) !important;
      min-height: var(--board-stage-height) !important;
    }

    #analyze-app-host #app .board-frame {
      height: var(--board-shell-width) !important;
      grid-template-columns: var(--eval-bar-width, 14px) var(--board-shell-width) !important;
      gap: 8px !important;
      align-items: stretch !important;
    }

    #analyze-app-host #app .board-frame > * {
      align-self: stretch !important;
    }

    #analyze-app-host #app .eval-bar {
      height: var(--board-shell-width) !important;
      margin-top: 0 !important;
      align-self: stretch !important;
    }

    #analyze-app-host #app .board-options {
      display: flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      transform: none !important;
      position: relative !important;
      z-index: 3 !important;
    }

    #analyze-app-host #app .options-toolbar {
      width: 100%;
    }

    @media (min-width: 1280px) {
      #analyze-app-host #app .workspace {
        --app-right-rail-width: clamp(320px, 20vw, 420px);
        gap: 12px !important;
        padding-bottom: 10px !important;
        grid-template-columns: minmax(0, 1fr) var(--app-right-rail-width) !important;
      }

      #analyze-app-host #app .left,
      #analyze-app-host #app .board-pane {
        min-width: 0 !important;
        width: 100% !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden {
        grid-template-columns: minmax(0, 1fr) !important;
        justify-content: stretch !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden .left {
        display: grid !important;
        justify-content: center !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden .board-pane {
        width: 100% !important;
        max-width: 100% !important;
        justify-self: stretch !important;
        margin-inline: 0 !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden .board-stage {
        width: fit-content !important;
        max-width: 100% !important;
        justify-self: center !important;
        margin-inline: auto !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden .board-stage {
        --board-shell-width: min(
          calc(
            var(--analyze-viewport-room, 100dvh) -
              var(--board-options-height) -
              var(--board-stack-gap) -
              24px
          ),
          calc(
            100vw -
              var(--analysis-panel-width) -
              var(--board-history-width) -
              72px
          ),
          800px
        ) !important;
      }

      #analyze-app-host #app .board-stage {
        --analysis-panel-width: clamp(400px, 23vw, 560px) !important;
        --board-player-strip-size: 48px !important;
        --board-stack-gap: 12px !important;
        --board-frame-extra-width: 20px !important;
        --board-history-width: clamp(140px, 10vw, 190px) !important;
        --board-options-height: 118px !important;
        --board-shell-width: min(
          calc(
            var(--analyze-viewport-room, 100dvh) -
              var(--board-options-height) -
              var(--board-stack-gap) -
              24px
          ),
          calc(
            100vw -
              var(--app-right-rail-width) -
              var(--analysis-panel-width) -
              var(--board-history-width) -
              108px
          ),
          800px
        ) !important;
        width: 100% !important;
        max-width: 100% !important;
        gap: 10px !important;
        grid-template-columns:
          minmax(132px, var(--board-history-width))
          calc(var(--board-shell-width) + var(--board-frame-extra-width))
          minmax(360px, 1fr) !important;
      }
    }

    @media (max-width: 1120px) {
      #analyze-app-host #app .board-options .btn {
        font-size: 0.56rem !important;
        padding: 5px 8px !important;
        letter-spacing: 0.06em !important;
      }

      #analyze-app-host #app .options-toolbar {
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 6px 8px !important;
      }

      #analyze-app-host #app .toolbar-io-actions {
        flex-direction: row !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
      }

      #analyze-app-host #app .toolbar-io-actions .btn {
        flex: 1 1 148px !important;
        min-width: 0 !important;
        text-align: center !important;
      }
    }

    @media (min-width: 1280px) and (max-height: 1100px) {
      #analyze-app-host #app .workspace {
        --app-right-rail-width: clamp(300px, 18vw, 380px);
        gap: 10px !important;
        padding-bottom: 12px !important;
        grid-template-columns: minmax(0, 1fr) var(--app-right-rail-width) !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden {
        grid-template-columns: minmax(0, 1fr) !important;
        justify-content: stretch !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden .left {
        display: grid !important;
        justify-content: center !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden .board-pane {
        width: 100% !important;
        max-width: 100% !important;
        justify-self: stretch !important;
        margin-inline: 0 !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden .board-stage {
        width: fit-content !important;
        max-width: 100% !important;
        justify-self: center !important;
        margin-inline: auto !important;
      }

      #analyze-app-host #app .right {
        gap: 10px !important;
        grid-template-rows: minmax(0, 1fr) !important;
      }

      #analyze-app-host #app #coachCard {
        min-height: 0 !important;
        height: 100% !important;
        max-height: calc(100dvh - 92px) !important;
        overflow: auto !important;
      }

      #analyze-app-host #app .right > .card {
        padding: 10px !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden .board-stage {
        --board-shell-width: min(
          calc(
            var(--analyze-viewport-room, 100dvh) -
              var(--board-options-height) -
              var(--board-stack-gap) -
              22px
          ),
          calc(
            100vw -
              var(--analysis-panel-width) -
              var(--board-history-width) -
              68px
          ),
          700px
        ) !important;
      }

      #analyze-app-host #app .board-stage {
        --analysis-panel-width: clamp(360px, 22vw, 500px) !important;
        --board-player-strip-size: 44px !important;
        --board-stack-gap: 10px !important;
        --board-frame-extra-width: 18px !important;
        --board-history-width: clamp(132px, 10vw, 176px) !important;
        --board-options-height: 116px !important;
        --board-shell-width: min(
          calc(
            var(--analyze-viewport-room, 100dvh) -
              var(--board-options-height) -
              var(--board-stack-gap) -
              22px
          ),
          calc(
            100vw -
              var(--app-right-rail-width) -
              var(--analysis-panel-width) -
              var(--board-history-width) -
              100px
          ),
          700px
        ) !important;
        width: 100% !important;
        max-width: 100% !important;
        gap: 8px !important;
        grid-template-columns:
          minmax(126px, var(--board-history-width))
          calc(var(--board-shell-width) + var(--board-frame-extra-width))
          minmax(340px, 1fr) !important;
      }

      #analyze-app-host #app .board-stack {
        gap: 8px !important;
      }

      #analyze-app-host #app .board-frame {
        gap: 8px !important;
        grid-template-columns: 14px auto !important;
      }

      #analyze-app-host #app .eval-bar {
        width: 14px !important;
      }

      #analyze-app-host #app .board-player-info {
        justify-content: space-between !important;
        padding: 4px 8px !important;
      }

      #analyze-app-host #app .player-turn-dot {
        width: 9px !important;
        height: 9px !important;
      }

      #analyze-app-host #app .player-name {
        font-size: 0.78rem !important;
        letter-spacing: 0.04em !important;
      }

      #analyze-app-host #app .player-rating {
        font-size: 0.68rem !important;
        padding: 2px 6px !important;
      }

      #analyze-app-host #app .captured-piece {
        width: 20px !important;
        height: 20px !important;
      }

      #analyze-app-host #app .last-move-icon {
        top: 4px !important;
        right: 4px !important;
        bottom: auto !important;
        left: auto !important;
      }

      #analyze-app-host #app .player-clock {
        min-width: 74px !important;
        height: 22px !important;
        padding: 0 8px !important;
        font-size: 0.72rem !important;
      }

      #analyze-app-host #app .player-clock.empty {
        display: none !important;
      }

      #analyze-app-host #app .board-options {
        padding: 6px 12px 8px !important;
      }

      #analyze-app-host #app .board-options .btn {
        font-size: 0.68rem !important;
        min-height: 30px !important;
        padding: 6px 11px !important;
        letter-spacing: 0.055em !important;
      }

      #analyze-app-host #app .options-toolbar {
        gap: 6px 10px !important;
        margin-top: 0 !important;
      }

      #analyze-app-host #app .options-primary-actions,
      #analyze-app-host #app .toolbar-sae-actions,
      #analyze-app-host #app .toolbar-io-actions {
        gap: 4px !important;
      }

      #analyze-app-host #app .toolbar-io-actions {
        flex-direction: row !important;
        flex-wrap: wrap !important;
        align-items: flex-start !important;
        justify-content: flex-start !important;
      }

      #analyze-app-host #app .board-analysis {
        width: 100% !important;
        padding: 0 !important;
        gap: 8px !important;
        grid-template-columns: minmax(0, 1fr) !important;
      }

      #analyze-app-host #app .analysis-row {
        --analysis-rank-col: calc((var(--rank-cols, 2) + 0.55) * 0.78ch) !important;
        --analysis-stats-col: 11.5ch !important;
        padding: 7px 9px 6px 14px !important;
      }

      #analyze-app-host #app .analysis-main {
        gap: 6px 8px !important;
        grid-template-columns:
          minmax(var(--analysis-rank-col), var(--analysis-rank-col))
          minmax(calc((var(--lead-cols, 6) + 2) * 0.82ch), calc((var(--lead-cols, 6) + 2) * 0.82ch))
          minmax(108px, 108px)
          minmax(var(--analysis-stats-col), auto) !important;
      }

      #analyze-app-host #app .analysis-rank,
      #analyze-app-host #app .analysis-stats {
        font-size: 0.62rem !important;
      }

      #analyze-app-host #app .analysis-san {
        min-width: 0 !important;
        width: max-content !important;
        font-size: 0.84rem !important;
      }

      #analyze-app-host #app .analysis-class {
        gap: 3px !important;
        padding: 1px 5px !important;
        font-size: 0.54rem !important;
      }

      #analyze-app-host #app .analysis-class-icon {
        width: 13px !important;
        height: 13px !important;
        flex-basis: 13px !important;
      }

      #analyze-app-host #app .analysis-pv {
        margin-top: 4px !important;
        padding-left: calc(var(--analysis-rank-col) + 7px) !important;
        font-size: 0.6rem !important;
      }
    }

    #analyze-app-host #app #coachPill .btn.send,
    #analyze-app-host #app #sendBtn {
      min-width: 84px !important;
      padding: 8px 14px !important;
      font-size: 0.74rem !important;
      line-height: 1.1 !important;
      letter-spacing: 0.1em !important;
    }

    /* ============================================================
       TRAIN POST-MORTEM PARITY LAYER.
       Matches /train post-mortem brutal/neobrutalist visual language.
       Replaces the prior "sensual analyze surface" polish layer.
       ============================================================ */

    /* Host: no decorative glow — the shell page background carries the look */
    #analyze-app-host::before { display: none !important; }
    #analyze-app-host > * { position: relative; z-index: 1; }

    /* Container panels: use the same brutal card language as train post-mortem */
    #analyze-app-host #app .board-shell-wrap,
    #analyze-app-host #app .board-analysis,
    #analyze-app-host #app .board-history-panel,
    #analyze-app-host #app .section-head {
      background: var(--app-panel-solid) !important;
      border: 1px solid color-mix(in srgb, var(--app-text) 72%, transparent) !important;
      box-shadow: 5px 5px 0 var(--app-brutal-edge) !important;
      border-radius: 10px !important;
      transition: transform 120ms ease, box-shadow 120ms ease !important;
    }

    #analyze-app-host #app .board-shell-wrap {
      /* Convert from 3-row player-chrome container to pure square board wrapper */
      display: grid !important;
      grid-template-rows: var(--board-shell-width) !important;
      height: var(--board-shell-width) !important;
      width: var(--board-shell-width) !important;
      border: 1px solid var(--app-border) !important;
      border-radius: 10px !important;
      background: var(--app-panel-deep) !important;
      box-shadow: var(--app-shadow) !important;
      overflow: hidden !important;
      padding: 0 !important;
    }

    #analyze-app-host #app .board-shell {
      /* board-shell inherits the square exactly */
      width: var(--board-shell-width) !important;
      height: var(--board-shell-width) !important;
      border-radius: 10px !important;
      overflow: hidden !important;
      border: none !important;
      box-shadow: none !important;
      background: transparent !important;
    }

    #analyze-app-host #app .section-head {
      font-size: 0.64rem !important;
      font-weight: 700 !important;
      letter-spacing: 0.22em !important;
      text-transform: uppercase !important;
      color: color-mix(in srgb, var(--app-text) 72%, var(--app-muted) 28%) !important;
      box-shadow: none !important;
      background: var(--app-panel-solid) !important;
      border-radius: 8px !important;
    }

    /* Buttons: match train post-mortem brutal button treatment */
    #analyze-app-host #app .board-options .btn,
    #analyze-app-host #app .settings-trigger {
      border: 1px solid var(--app-brutal-edge) !important;
      background: var(--app-panel-solid) !important;
      color: var(--app-text) !important;
      box-shadow: 4px 4px 0 var(--app-brutal-edge) !important;
      border-radius: 8px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
      transition:
        transform 120ms ease,
        box-shadow 120ms ease,
        background 120ms ease,
        color 120ms ease !important;
    }

    #analyze-app-host #app .board-options .btn:hover,
    #analyze-app-host #app .board-options .btn:focus-visible,
    #analyze-app-host #app .board-options .btn[data-visual-hover="true"] {
      transform: translate(2px, 2px) !important;
      box-shadow: 2px 2px 0 var(--app-brutal-edge) !important;
      background: color-mix(in srgb, var(--app-text) 92%, transparent) !important;
      color: var(--app-bg) !important;
    }

    #analyze-app-host #app .board-options .btn.primary,
    #analyze-app-host #app .board-options .btn[data-primary="true"] {
      background: var(--app-accent) !important;
      color: var(--app-accent-contrast) !important;
      border-color: var(--app-accent) !important;
      box-shadow: 5px 5px 0 var(--app-brutal-edge) !important;
    }

    #analyze-app-host #app .board-options .btn.primary:hover,
    #analyze-app-host #app .board-options .btn.primary:focus-visible,
    #analyze-app-host #app .board-options .btn[data-primary="true"][data-visual-hover="true"] {
      background: #fff !important;
      box-shadow: 3px 3px 0 var(--app-brutal-edge) !important;
      transform: translate(2px, 2px) !important;
    }

    #analyze-app-host #app .settings-trigger:hover,
    #analyze-app-host #app .settings-trigger[data-visual-hover="true"] {
      transform: translate(2px, 2px) !important;
      box-shadow: 2px 2px 0 var(--app-brutal-edge) !important;
    }

    /* Active rows: match train post-mortem classification accent */
    #analyze-app-host #app .board-history-move.is-active,
    #analyze-app-host #app .board-history-move[aria-selected="true"],
    #analyze-app-host #app .analysis-row.is-active {
      background: color-mix(in srgb, var(--app-accent) 10%, transparent) !important;
      box-shadow: inset 3px 0 0 0 var(--app-accent) !important;
    }

    /* Eval bar: match train brutal treatment — thin border, brutal shadow, aligned to board */
    #analyze-app-host #app .eval-bar {
      border: 1px solid var(--app-brutal-edge) !important;
      border-radius: 4px !important;
      box-shadow: 3px 3px 0 var(--app-brutal-edge) !important;
    }

    /* Focus states for inputs */
    #analyze-app-host #app #coachPill input:focus,
    #analyze-app-host #app #assistantInput:focus {
      outline: none !important;
      border-color: var(--app-accent) !important;
      box-shadow: 4px 4px 0 var(--app-brutal-edge) !important;
    }

    /* Scrollbar: consistent brutal styling */
    #analyze-app-host #app ::-webkit-scrollbar { width: 8px; height: 8px; }
    #analyze-app-host #app ::-webkit-scrollbar-track { background: transparent; }
    #analyze-app-host #app ::-webkit-scrollbar-thumb {
      background: var(--app-border-strong) !important;
      border-radius: 8px !important;
      border: 2px solid transparent !important;
      background-clip: padding-box !important;
    }
    #analyze-app-host #app ::-webkit-scrollbar-thumb:hover {
      background: color-mix(in srgb, var(--app-text) 60%, transparent) !important;
      background-clip: padding-box !important;
    }

    /* Move classification chips/badges: uppercase brutal mono style */
    #analyze-app-host #app .analysis-score,
    #analyze-app-host #app .board-history-eval,
    #analyze-app-host #app .move-eval {
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.01em;
    }

    #analyze-app-host #app .chip,
    #analyze-app-host #app .badge {
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      border-radius: 4px !important;
      border: 1px solid color-mix(in srgb, var(--app-text) 32%, transparent) !important;
    }

    /* Remove old classification icon borders — train post-mortem doesn't use them */
    #analyze-app-host #app .board-history-move-icon {
      border: none !important;
    }

    /* ============================================================
       TRAIN POST-MORTEM PARITY LAYER.
       Matches /train post-mortem brutal/neobrutalist visual language.
       Replaces the prior "sensual analyze surface" polish layer.
       ============================================================ */

    /* Host: no decorative glow */
    #analyze-app-host::before { display: none !important; }
    #analyze-app-host > * { position: relative; z-index: 1; }

    /* ---- A. Normalize all analyzer headings ---- */
    #analyze-app-host #app .board-analysis-head,
    #analyze-app-host #app .board-history-head,
    #analyze-app-host #app .theme-analysis-head,
    #analyze-app-host #app .head,
    #analyze-app-host #app .export-head,
    #analyze-app-host #app .settings-head {
      border-bottom: 1px solid var(--app-border) !important;
      background: transparent !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      padding: 10px 12px !important;
    }

    #analyze-app-host #app .board-analysis-head h2,
    #analyze-app-host #app .board-history-head h2,
    #analyze-app-host #app .theme-analysis-head h2,
    #analyze-app-host #app .head h2,
    #analyze-app-host #app .export-head h2,
    #analyze-app-host #app .settings-head h2 {
      color: var(--app-text) !important;
      font-size: 0.72rem !important;
      font-weight: 800 !important;
      letter-spacing: 0.14em !important;
      text-transform: uppercase !important;
      line-height: 1.1 !important;
    }

    #analyze-app-host #app .board-analysis-head span,
    #analyze-app-host #app .board-history-head span,
    #analyze-app-host #app .theme-analysis-head span,
    #analyze-app-host #app .head span,
    #analyze-app-host #app .export-head span,
    #analyze-app-host #app .settings-head span {
      color: var(--app-muted) !important;
      font-size: 0.6rem !important;
      font-weight: 700 !important;
      letter-spacing: 0.12em !important;
      text-transform: uppercase !important;
    }

    /* ---- B. Restyle engine lines to match train post-mortem rows ---- */
    #analyze-app-host #app .board-analysis {
      background: var(--app-panel-solid) !important;
      border: 1px solid var(--app-brutal-edge) !important;
      box-shadow: 5px 5px 0 var(--app-brutal-edge) !important;
      border-radius: 10px !important;
      overflow: hidden !important;
    }

    #analyze-app-host #app .analysis-list {
      background: transparent !important;
      padding: 8px !important;
      gap: 8px !important;
    }

    #analyze-app-host #app .analysis-row {
      background: var(--app-panel-deep) !important;
      border: 1px solid var(--app-border) !important;
      border-radius: 8px !important;
      box-shadow: none !important;
      padding: 9px 10px !important;
      color: var(--app-text) !important;
    }

    #analyze-app-host #app .analysis-row:hover {
      background: var(--app-panel-solid) !important;
      border-color: var(--app-text) !important;
    }

    #analyze-app-host #app .analysis-row.is-active,
    #analyze-app-host #app .analysis-row[aria-selected="true"] {
      background: var(--app-panel-solid) !important;
      border-color: var(--app-accent) !important;
      box-shadow: inset 4px 0 0 var(--app-accent) !important;
    }

    #analyze-app-host #app .analysis-san {
      color: var(--app-text) !important;
      font-weight: 800 !important;
      font-size: 0.95rem !important;
      letter-spacing: 0.01em !important;
    }

    #analyze-app-host #app .analysis-rank,
    #analyze-app-host #app .analysis-stats,
    #analyze-app-host #app .analysis-score {
      color: var(--app-muted) !important;
      font-weight: 700 !important;
      font-variant-numeric: tabular-nums !important;
    }

    #analyze-app-host #app .analysis-pv {
      color: var(--app-muted-soft) !important;
      font-size: 0.68rem !important;
      line-height: 1.4 !important;
    }

    #analyze-app-host #app .analysis-class {
      background: transparent !important;
      border: 1px solid currentColor !important;
      border-radius: 999px !important;
      box-shadow: none !important;
      font-size: 0.56rem !important;
      font-weight: 800 !important;
      letter-spacing: 0.08em !important;
      text-transform: uppercase !important;
    }

    /* ---- C. Remove purple gradient/soft backgrounds from move history ---- */
    #analyze-app-host #app .board-history-opening {
      background: var(--app-panel-deep) !important;
      border-bottom: 1px solid var(--app-border) !important;
    }

    #analyze-app-host #app .board-history-list {
      background: transparent !important;
      padding: 8px !important;
    }

    #analyze-app-host #app .board-history-move {
      background: transparent !important;
      border: 1px solid transparent !important;
      border-radius: 6px !important;
      box-shadow: none !important;
      color: var(--app-muted) !important;
    }

    #analyze-app-host #app .board-history-move:hover {
      background: var(--app-panel-deep) !important;
      border-color: var(--app-border) !important;
      color: var(--app-text) !important;
    }

    #analyze-app-host #app .board-history-move.current,
    #analyze-app-host #app .board-history-move.is-active,
    #analyze-app-host #app .board-history-move[aria-selected="true"] {
      background: var(--app-panel-solid) !important;
      border-color: var(--app-accent) !important;
      color: var(--app-text) !important;
      box-shadow: inset 3px 0 0 var(--app-accent) !important;
    }

    #analyze-app-host #app .board-history-move.future {
      opacity: 0.62 !important;
    }

    /* Kill --move-soft purple source inline style from standalone.js */
    #analyze-app-host #app .board-history-move[style*="--move-soft"] {
      --move-soft: transparent !important;
    }

    /* ---- D. Restore Black/White labels via CSS pseudo-elements ---- */
    #analyze-app-host #app .board-shell-wrap {
      position: relative !important;
    }

    #analyze-app-host #app .board-shell-wrap[data-orientation="white"]::before,
    #analyze-app-host #app .board-shell-wrap[data-orientation="white"]::after,
    #analyze-app-host #app .board-shell-wrap[data-orientation="black"]::before,
    #analyze-app-host #app .board-shell-wrap[data-orientation="black"]::after {
      position: absolute;
      z-index: 30;
      left: 10px;
      padding: 2px 6px;
      border: 1px solid var(--app-border);
      border-radius: 999px;
      background: color-mix(in srgb, var(--app-bg) 82%, transparent);
      color: var(--app-muted);
      font-size: 0.58rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      pointer-events: none;
    }

    #analyze-app-host #app .board-shell-wrap[data-orientation="white"]::before {
      content: "Black";
      top: 8px;
    }

    #analyze-app-host #app .board-shell-wrap[data-orientation="white"]::after {
      content: "White";
      bottom: 8px;
    }

    #analyze-app-host #app .board-shell-wrap[data-orientation="black"]::before {
      content: "White";
      top: 8px;
    }

    #analyze-app-host #app .board-shell-wrap[data-orientation="black"]::after {
      content: "Black";
      bottom: 8px;
    }

    /* ---- E. Board keeps modern train shadow (not brutal outer shadow) ---- */
    #analyze-app-host #app .board-shell-wrap {
      box-shadow: var(--app-shadow) !important;
    }

    /* Container panels: brutal card language for outer shells */
    #analyze-app-host #app .board-analysis,
    #analyze-app-host #app .board-history-panel,
    #analyze-app-host #app .section-head {
      background: var(--app-panel-solid) !important;
      border: 1px solid color-mix(in srgb, var(--app-text) 72%, transparent) !important;
      box-shadow: 5px 5px 0 var(--app-brutal-edge) !important;
      border-radius: 10px !important;
      transition: transform 120ms ease, box-shadow 120ms ease !important;
    }

    /* ---- Buttons: match train post-mortem brutal button treatment ---- */
    #analyze-app-host #app .board-options .btn,
    #analyze-app-host #app .settings-trigger {
      border: 1px solid var(--app-brutal-edge) !important;
      background: var(--app-panel-solid) !important;
      color: var(--app-text) !important;
      box-shadow: 4px 4px 0 var(--app-brutal-edge) !important;
      border-radius: 8px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
      transition:
        transform 120ms ease,
        box-shadow 120ms ease,
        background 120ms ease,
        color 120ms ease !important;
    }

    #analyze-app-host #app .board-options .btn:hover,
    #analyze-app-host #app .board-options .btn:focus-visible,
    #analyze-app-host #app .board-options .btn[data-visual-hover="true"] {
      transform: translate(2px, 2px) !important;
      box-shadow: 2px 2px 0 var(--app-brutal-edge) !important;
      background: color-mix(in srgb, var(--app-text) 92%, transparent) !important;
      color: var(--app-bg) !important;
    }

    #analyze-app-host #app .board-options .btn.primary,
    #analyze-app-host #app .board-options .btn[data-primary="true"] {
      background: var(--app-accent) !important;
      color: var(--app-accent-contrast) !important;
      border-color: var(--app-accent) !important;
      box-shadow: 5px 5px 0 var(--app-brutal-edge) !important;
    }

    #analyze-app-host #app .board-options .btn.primary:hover,
    #analyze-app-host #app .board-options .btn.primary:focus-visible,
    #analyze-app-host #app .board-options .btn[data-primary="true"][data-visual-hover="true"] {
      background: #fff !important;
      box-shadow: 3px 3px 0 var(--app-brutal-edge) !important;
      transform: translate(2px, 2px) !important;
    }

    #analyze-app-host #app .settings-trigger:hover,
    #analyze-app-host #app .settings-trigger[data-visual-hover="true"] {
      transform: translate(2px, 2px) !important;
      box-shadow: 2px 2px 0 var(--app-brutal-edge) !important;
    }

    /* ---- Eval bar: match train brutal treatment ---- */
    #analyze-app-host #app .eval-bar {
      border: 1px solid var(--app-brutal-edge) !important;
      border-radius: 4px !important;
      box-shadow: 3px 3px 0 var(--app-brutal-edge) !important;
    }

    /* ---- Focus states for inputs ---- */
    #analyze-app-host #app #coachPill input:focus,
    #analyze-app-host #app #assistantInput:focus {
      outline: none !important;
      border-color: var(--app-accent) !important;
      box-shadow: 4px 4px 0 var(--app-brutal-edge) !important;
    }

    /* ---- Scrollbar: consistent brutal styling ---- */
    #analyze-app-host #app ::-webkit-scrollbar { width: 8px; height: 8px; }
    #analyze-app-host #app ::-webkit-scrollbar-track { background: transparent; }
    #analyze-app-host #app ::-webkit-scrollbar-thumb {
      background: var(--app-border-strong) !important;
      border-radius: 8px !important;
      border: 2px solid transparent !important;
      background-clip: padding-box !important;
    }
    #analyze-app-host #app ::-webkit-scrollbar-thumb:hover {
      background: color-mix(in srgb, var(--app-text) 60%, transparent) !important;
      background-clip: padding-box !important;
    }

    /* ---- Move classification chips/badges: uppercase brutal mono style ---- */
    #analyze-app-host #app .chip,
    #analyze-app-host #app .badge {
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      border-radius: 4px !important;
      border: 1px solid color-mix(in srgb, var(--app-text) 32%, transparent) !important;
    }

    /* Remove old classification icon borders */
    #analyze-app-host #app .board-history-move-icon {
      border: none !important;
    }

    /* ANALYZE POSTMORTEM PARITY OVERRIDE */
    #analyze-app-host #app .board-analysis,
    #analyze-app-host #app .board-history-panel {
      background: var(--app-panel-solid) !important;
      border: 1px solid var(--app-border) !important;
      border-radius: 8px !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }

    #analyze-app-host #app .board-analysis-head,
    #analyze-app-host #app .board-history-head,
    #analyze-app-host #app .theme-analysis-head,
    #analyze-app-host #app .head,
    #analyze-app-host #app .export-head,
    #analyze-app-host #app .settings-head {
      min-height: 32px !important;
      border-bottom: 1px solid var(--app-border-soft) !important;
      padding: 0 12px !important;
    }

    #analyze-app-host #app .board-analysis-head h2,
    #analyze-app-host #app .board-history-head h2,
    #analyze-app-host #app .theme-analysis-head h2,
    #analyze-app-host #app .head h2,
    #analyze-app-host #app .export-head h2,
    #analyze-app-host #app .settings-head h2 {
      font-size: 0.625rem !important;
      font-weight: 700 !important;
      letter-spacing: 0.12em !important;
      color: var(--app-muted) !important;
    }

    #analyze-app-host #app .board-analysis-head span,
    #analyze-app-host #app .board-history-head span,
    #analyze-app-host #app .theme-analysis-head span,
    #analyze-app-host #app .head span,
    #analyze-app-host #app .export-head span,
    #analyze-app-host #app .settings-head span {
      font-size: 0.625rem !important;
      letter-spacing: 0.1em !important;
      color: var(--app-muted-soft) !important;
    }

    #analyze-app-host #app .analysis-list {
      display: grid !important;
      gap: 0 !important;
      padding: 0 !important;
      background: transparent !important;
    }

    #analyze-app-host #app .analysis-row {
      min-height: 36px !important;
      border: 0 !important;
      border-bottom: 1px solid var(--app-border-soft) !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      padding: 0 12px !important;
    }

    #analyze-app-host #app .analysis-row:last-child {
      border-bottom: 0 !important;
    }

    #analyze-app-host #app .analysis-row:hover {
      background: var(--app-surface-hover) !important;
      border-color: var(--app-border-soft) !important;
    }

    #analyze-app-host #app .analysis-row.is-active,
    #analyze-app-host #app .analysis-row[aria-selected="true"] {
      background: var(--app-highlight-soft) !important;
      border-color: var(--app-border-soft) !important;
      box-shadow: inset 3px 0 0 var(--app-accent) !important;
    }

    #analyze-app-host #app .analysis-san {
      font-size: 0.8rem !important;
      font-weight: 700 !important;
      letter-spacing: 0 !important;
    }

    #analyze-app-host #app .analysis-rank,
    #analyze-app-host #app .analysis-stats,
    #analyze-app-host #app .analysis-score {
      font-size: 0.68rem !important;
      font-weight: 700 !important;
      color: var(--app-muted) !important;
      font-variant-numeric: tabular-nums !important;
    }

    #analyze-app-host #app .analysis-class {
      min-height: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      padding: 0 !important;
      box-shadow: none !important;
      font-size: 0.625rem !important;
      font-weight: 700 !important;
      letter-spacing: 0.08em !important;
      text-transform: uppercase !important;
    }

    #analyze-app-host #app .analysis-class-icon {
      width: 16px !important;
      height: 16px !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    #analyze-app-host #app .analysis-pv {
      margin-top: 2px !important;
      color: var(--app-muted-soft) !important;
      font-size: 0.68rem !important;
      line-height: 1.35 !important;
    }

    #analyze-app-host #app .board-history-list {
      padding: 0 !important;
      background: transparent !important;
    }

    #analyze-app-host #app .board-history-move {
      min-height: 32px !important;
      border: 0 !important;
      border-bottom: 1px solid var(--app-border-soft) !important;
      border-radius: 0 !important;
      background: transparent !important;
      padding: 0 10px !important;
      box-shadow: none !important;
    }

    #analyze-app-host #app .board-history-move:hover {
      background: var(--app-surface-hover) !important;
      border-color: var(--app-border-soft) !important;
    }

    #analyze-app-host #app .board-history-move.current,
    #analyze-app-host #app .board-history-move.is-active,
    #analyze-app-host #app .board-history-move[aria-selected="true"] {
      background: var(--app-highlight-soft) !important;
      border-color: var(--app-border-soft) !important;
      box-shadow: inset 3px 0 0 var(--app-accent) !important;
    }

    #analyze-app-host #app .board-options {
      margin-top: 8px !important;
      border: 1px solid var(--app-border) !important;
      border-radius: 8px !important;
      background: var(--app-panel-solid) !important;
      box-shadow: none !important;
      padding: 8px !important;
    }

    #analyze-app-host #app .options-toolbar {
      gap: 6px !important;
    }

    #analyze-app-host #app .board-options .btn,
    #analyze-app-host #app .settings-trigger {
      border: 1px solid var(--app-border) !important;
      border-radius: 6px !important;
      background: transparent !important;
      box-shadow: none !important;
      color: var(--app-text) !important;
      transform: none !important;
    }

    #analyze-app-host #app .board-options .btn:hover,
    #analyze-app-host #app .board-options .btn:focus-visible,
    #analyze-app-host #app .board-options .btn[data-visual-hover="true"],
    #analyze-app-host #app .settings-trigger:hover,
    #analyze-app-host #app .settings-trigger:focus-visible,
    #analyze-app-host #app .settings-trigger[data-visual-hover="true"] {
      border-color: var(--app-accent) !important;
      background: transparent !important;
      box-shadow: none !important;
      color: var(--app-accent) !important;
      transform: none !important;
    }

    #analyze-app-host #app .board-stack {
      border: 1px solid color-mix(in srgb, var(--app-text) 72%, transparent) !important;
      background: var(--app-panel-solid) !important;
      box-shadow: 4px 4px 0 var(--app-brutal-edge) !important;
      border-radius: 12px !important;
      padding: 12px !important;
      overflow: hidden !important;
    }

    #analyze-react-board-slot {
      width: var(--board-shell-width) !important;
      max-width: 100% !important;
    }

    #analyze-react-board-slot .app-brutal-board-frame {
      width: 100% !important;
    }

    #analyze-app-host #app .board-stack > .board-frame {
      display: none !important;
    }

    #analyze-app-host #app .board-frame,
    #analyze-react-board-slot .app-brutal-board-frame {
      border: 1px solid var(--app-brutal-edge) !important;
      background: var(--app-panel-solid) !important;
      box-shadow: 3px 3px 0 var(--app-brutal-edge) !important;
      border-radius: 10px !important;
      overflow: hidden !important;
    }

    #analyze-app-host #app .board-shell-wrap {
      border: 0 !important;
      border-radius: 9px !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    #analyze-app-host #app .eval-bar {
      border: 0 !important;
      border-right: 1px solid var(--app-brutal-edge) !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    #analyze-app-host #app .board-analysis > :not(#analyze-react-lines-slot) {
      display: none !important;
    }

    #analyze-react-lines-slot {
      display: block !important;
      min-height: 0 !important;
    }

    #analyze-app-host #app .analysis-main {
      grid-template-columns:
        minmax(22px, 22px)
        minmax(calc((var(--lead-cols, 6) + 2) * 0.82ch), auto)
        minmax(76px, max-content)
        minmax(var(--analysis-stats-col, 11.5ch), auto) !important;
      gap: 8px !important;
      align-items: center !important;
    }

    #analyze-app-host #app .analysis-row {
      min-height: 40px !important;
      padding: 0 12px !important;
    }

    #analyze-app-host #app .analysis-pv {
      padding-left: 30px !important;
      margin-top: 2px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    @media (min-width: 1024px) {
      #analyze-app-host #app .workspace {
        grid-template-columns: minmax(0, 1fr) !important;
        justify-items: center !important;
        align-items: center !important;
        padding: 12px !important;
        overflow: hidden !important;
      }

      #analyze-app-host #app .left {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        justify-items: center !important;
        width: 100% !important;
        max-width: 100% !important;
      }

      #analyze-app-host #app .board-stage {
        --analysis-panel-width: clamp(28rem, 30vw, 34rem) !important;
        --board-shell-width: min(
          calc(var(--analyze-viewport-room, 100dvh) - var(--board-options-height, 0px) - var(--board-stack-gap, 10px) - 68px),
          calc(100vw - var(--analysis-panel-width) - 136px),
          760px
        ) !important;
        width: min(100%, 100rem) !important;
        max-width: 100% !important;
        height: min-content !important;
        min-height: 0 !important;
        align-items: stretch !important;
        gap: 16px !important;
        grid-template-columns:
          minmax(0, auto)
          minmax(28rem, 0.92fr) !important;
      }

      #analyze-app-host #app .board-history-panel {
        display: none !important;
      }

      #analyze-app-host #app .board-stack {
        width: auto !important;
        max-width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        align-self: start !important;
      }

      #analyze-app-host #app .board-analysis {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        height: var(--board-shell-width) !important;
        min-height: 0 !important;
        align-self: start !important;
        grid-template-rows: minmax(32px, auto) minmax(0, 1fr) !important;
      }
    }

  `;
  if (!existing) {
    document.head.appendChild(style);
  }
}

function loadScriptOnce(id: string, src: string) {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  const existingSrc = existing?.getAttribute("src") || "";
  if (existing?.dataset.loaded === "true" && existingSrc === src) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const onLoad = () => {
      if (script.dataset) script.dataset.loaded = "true";
      resolve();
    };
    const onError = () => reject(new Error(`Failed to load script: ${src}`));
    const script =
      existingSrc === src && existing
        ? existing
        : Object.assign(document.createElement("script"), {
            id,
            src,
            async: false,
          });

    if (existing && existing !== script) {
      existing.remove();
    }

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      document.body.appendChild(script);
    }
  });
}

async function bootAnalyzeRuntime() {
  await ensureStyleLink(
    ANALYZE_STYLE_ID,
    `${ANALYZE_BASE_PATH}/standalone.css?v=${encodeURIComponent(ANALYZE_ASSET_VERSION)}`,
  );
  ensureOverrideStyle();
  window.__CHESS_SOMETHING_BASE_PATH__ = ANALYZE_BASE_PATH;
  await loadScriptOnce(
    ANALYZE_CHESS_SCRIPT_ID,
    "https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js",
  );

  // Ensure the standalone app mount point exists
  if (!document.getElementById("app")) {
    throw new Error("Analyze app container #app was not found.");
  }

  await loadScriptOnce(
    ANALYZE_APP_SCRIPT_ID,
    `${ANALYZE_BASE_PATH}/standalone.js?v=${encodeURIComponent(ANALYZE_ASSET_VERSION)}`,
  );
  document.title = ANALYZE_PAGE_TITLE;
}

function resetAnalyzeBootAssets() {
  document.getElementById(ANALYZE_STYLE_ID)?.remove();
  document.getElementById(ANALYZE_CHESS_SCRIPT_ID)?.remove();
  document.getElementById(ANALYZE_APP_SCRIPT_ID)?.remove();
}

export function AnalyzeBridge({
  initialFen,
  initialPreferences,
  analyzePreferencesPersistUrl = null,
}: {
  initialFen?: string | null;
  initialPreferences: AnalyzePreferences | null;
  analyzePreferencesPersistUrl?: string | null;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<AnalyzeRuntimeSnapshot>(DEFAULT_ANALYZE_SNAPSHOT);
  const [portalTargets, setPortalTargets] = useState<{
    board: HTMLElement;
    lines: HTMLElement;
  } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    const hoverCleanups: Array<() => void> = [];
    let themeObserver: MutationObserver | null = null;
    let titleObserver: MutationObserver | null = null;
    let runtimeObserver: MutationObserver | null = null;
    let snapshotInterval: number | null = null;

    const enforceAnalyzeTitle = () => {
      if (document.title !== ANALYZE_PAGE_TITLE) {
        document.title = ANALYZE_PAGE_TITLE;
      }
    };

    const syncViewportRoom = () => {
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const viewportRoom = Math.max(0, Math.floor(window.innerHeight - rect.top - 4));
      host.style.setProperty("--analyze-viewport-room", `${viewportRoom}px`);
    };

    const wireVisualHoverState = () => {
      if (!host) return;
      const hoverTargets = host.querySelectorAll<HTMLElement>(
        "#app .board-options .btn, #app .settings-trigger",
      );

      hoverTargets.forEach((element) => {
        const activate = () => {
          element.dataset.visualHover = "true";
        };
        const deactivate = () => {
          delete element.dataset.visualHover;
        };

        element.addEventListener("pointerenter", activate);
        element.addEventListener("pointerleave", deactivate);
        element.addEventListener("focus", activate);
        element.addEventListener("blur", deactivate);

        hoverCleanups.push(() => {
          element.removeEventListener("pointerenter", activate);
          element.removeEventListener("pointerleave", deactivate);
          element.removeEventListener("focus", activate);
          element.removeEventListener("blur", deactivate);
          deactivate();
        });
      });
    };

    const syncAppTheme = () => {
      const theme = document.documentElement.dataset.theme || null;
      window.__chessSomething?.setAppTheme?.(theme);
    };

    const syncRuntimeSnapshot = () => {
      setRuntimeSnapshot(snapshotFromAnalyzeRuntime());
    };

    const ensureReactSurfaceSlots = () => {
      if (!host) return false;
      const boardStack = host.querySelector<HTMLElement>("#app .board-stack");
      const boardFrame = host.querySelector<HTMLElement>("#app .board-frame");
      const boardAnalysis = host.querySelector<HTMLElement>("#app .board-analysis");
      if (!boardStack || !boardFrame || !boardAnalysis) return false;

      let boardSlot = host.querySelector<HTMLElement>("#analyze-react-board-slot");
      if (!boardSlot) {
        boardSlot = document.createElement("div");
        boardSlot.id = "analyze-react-board-slot";
        boardStack.insertBefore(boardSlot, boardFrame);
      }

      let linesSlot = host.querySelector<HTMLElement>("#analyze-react-lines-slot");
      if (!linesSlot) {
        linesSlot = document.createElement("div");
        linesSlot.id = "analyze-react-lines-slot";
        boardAnalysis.appendChild(linesSlot);
      }

      setPortalTargets({ board: boardSlot, lines: linesSlot });
      return true;
    };

    document.body.classList.add("analyze-embedded");
    enforceAnalyzeTitle();
    const titleElement = document.querySelector("title");
    if (titleElement) {
      titleObserver = new MutationObserver(enforceAnalyzeTitle);
      titleObserver.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    window.__CHESSVIEW_INITIAL_ANALYZE_PREFERENCES__ = initialPreferences;
    window.__CHESSVIEW_ANALYZE_PREFERENCES_PERSIST_URL__ =
      analyzePreferencesPersistUrl;
    window.__CHESSVIEW_INITIAL_ANALYZE_FEN__ = initialFen ?? null;
    if (initialFen) {
      try {
        localStorage.removeItem("chess-something:board-state:v1");
      } catch {
        // ignore localStorage failures
      }
    }
    window.__chessSomething?.applyUserAnalyzePreferences?.(initialPreferences);
    syncAppTheme();
    syncViewportRoom();
    let syncLater = window.requestAnimationFrame(() => {
      syncViewportRoom();
      syncLater = window.requestAnimationFrame(syncViewportRoom);
    });
    window.addEventListener("resize", syncViewportRoom);

    const bootState =
      window.__CHESS_SOMETHING_NEXT_ANALYZE_BOOT__ ||
      (window.__CHESS_SOMETHING_NEXT_ANALYZE_BOOT__ = {
        promise: null as Promise<void> | null,
        loaded: false,
        version: null as string | null,
      });

    if (bootState.version !== ANALYZE_ASSET_VERSION) {
      bootState.promise = null;
      bootState.loaded = false;
      bootState.version = ANALYZE_ASSET_VERSION;
      resetAnalyzeBootAssets();
    }

    const appContainer = host?.querySelector("#app");
    if (bootState.loaded && appContainer && !appContainer.hasChildNodes()) {
      bootState.promise = null;
      bootState.loaded = false;
      document.getElementById(ANALYZE_APP_SCRIPT_ID)?.remove();
    }

    if (!bootState.promise) {
      bootState.promise = bootAnalyzeRuntime()
        .then(() => {
          bootState.loaded = true;
        })
        .catch((bootError) => {
          bootState.promise = null;
          bootState.loaded = false;
          throw bootError;
        });
    }

    bootState.promise
      .then(() => {
        if (cancelled) return;
        enforceAnalyzeTitle();
        syncAppTheme();
        wireVisualHoverState();
        ensureReactSurfaceSlots();
        syncRuntimeSnapshot();
        const appNode = host?.querySelector("#app");
        if (appNode) {
          runtimeObserver = new MutationObserver(() => {
            ensureReactSurfaceSlots();
            syncRuntimeSnapshot();
          });
          runtimeObserver.observe(appNode, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true,
          });
        }
        snapshotInterval = window.setInterval(syncRuntimeSnapshot, 250);
        if (host?.querySelector("#app")?.hasChildNodes()) {
          setStatus("ready");
        } else {
          setStatus("error");
          setError("Analyze runtime loaded without mounting the board.");
        }
      })
      .catch((bootError) => {
        if (cancelled) return;
        setStatus("error");
        setError(
          bootError instanceof Error
            ? bootError.message
            : "Failed to boot the analyze app.",
        );
      });

    themeObserver = new MutationObserver(() => {
      syncAppTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelled = true;
      window.__chessSomething?.pauseForNavigation?.();
      window.cancelAnimationFrame(syncLater);
      window.removeEventListener("resize", syncViewportRoom);
      themeObserver?.disconnect();
      titleObserver?.disconnect();
      runtimeObserver?.disconnect();
      if (snapshotInterval) window.clearInterval(snapshotInterval);
      hoverCleanups.forEach((cleanup) => cleanup());
      setPortalTargets(null);
      document.body.classList.remove("analyze-embedded");
    };
  }, [
    initialFen,
    initialPreferences,
    analyzePreferencesPersistUrl,
  ]);

  return (
    <div
      id="analyze-app-host"
      ref={hostRef}
      className="relative w-full"
      style={{ height: "100%" }}
    >
      {/* Standalone app mounts into #app */}
      <div id="app" />
      {portalTargets
        ? createPortal(
            <AnalyzeReactBoardSurface snapshot={runtimeSnapshot} />,
            portalTargets.board,
          )
        : null}
      {portalTargets
        ? createPortal(
            <div className="p-3">
              <EngineLinesSection
                lines={runtimeSnapshot.lines}
                isLoading={runtimeSnapshot.isLoading}
                revealBadLines
                onSelectLine={(move) => {
                  const uci = `${move.from}${move.to}`;
                  window.__chessSomething?.doMove?.(uci);
                }}
              />
            </div>,
            portalTargets.lines,
          )
        : null}

      {status === "error" && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{
            background: "var(--app-overlay-veil)",
            color: "var(--app-text)",
          }}
        >
          <p className="text-red-400">Analyze boot failed: {error}</p>
        </div>
      )}
    </div>
  );
}

function AnalyzeReactBoardSurface({
  snapshot,
}: {
  snapshot: AnalyzeRuntimeSnapshot;
}) {
  const topLine = snapshot.lines[0] ?? null;
  const handleMove = (move: BoardMove) => {
    const uci = move.uci || `${move.from}${move.to}`;
    window.__chessSomething?.doMove?.(uci);
  };

  return (
    <div className="app-brutal-board-frame relative max-w-full overflow-visible">
      <BoardWithEvalBar
        evalCp={snapshot.evalCp}
        evalMate={snapshot.evalMate}
        evalMateCp={whitePositiveMateCp(snapshot.fen, snapshot.evalMate != null && snapshot.fen.split(" ")[1] === "b" ? -snapshot.evalMate : snapshot.evalMate ?? null, snapshot.evalCp)}
        isLoading={snapshot.isLoading}
        orientation={snapshot.orientation}
      >
        <AnalysisBoard
          fen={snapshot.fen}
          mode="analysis"
          pieceAnimation
          orientation={snapshot.orientation}
          coordinates
          boardTheme={snapshot.boardTheme}
          pieceTheme={snapshot.pieceTheme}
          engineArrows={topLine ? [{
            from: topLine.bestMove.slice(0, 2),
            to: topLine.bestMove.slice(2, 4),
            label: topLine.bestSan,
            rank: 1,
            emphasis: true,
          }] : []}
          onMove={handleMove}
          dataTestId="analyze-react-board"
        />
      </BoardWithEvalBar>
    </div>
  );
}











