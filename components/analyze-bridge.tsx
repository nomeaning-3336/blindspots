"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalyzePreferences } from "@/lib/analyze-preferences";
import type { ArcadeInitialGameSnapshot } from "@/lib/arcade";
import type { AnalyzeWorkspaceMode } from "./analyze-shell";

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
    __CHESSVIEW_INITIAL_WORKSPACE_MODE__?: AnalyzeWorkspaceMode | null;
    __CHESSVIEW_INITIAL_ARCADE_GAME__?: ArcadeInitialGameSnapshot | null;
    __CHESSVIEW_ARCADE_GAME_PERSIST_URL__?: string | null;
  }
}

const ANALYZE_BASE_PATH = "/analyze";
const ANALYZE_ASSET_VERSION = "2026-04-10-arcade-maia2-v82";
const ANALYZE_STYLE_ID = "analyze-style";
const ANALYZE_OVERRIDE_ID = "analyze-react-override";
const ANALYZE_CHESS_SCRIPT_ID = "analyze-chess-js";
const ANALYZE_APP_SCRIPT_ID = "analyze-runtime";

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
      margin-bottom: 2px !important;
    }

    #analyze-app-host #app .board-shell-wrap {
      background: var(--app-bg) !important;
      border-color: var(--app-border) !important;
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
      --board-stage-height: calc(
        var(--board-shell-height) + var(--board-options-height) + var(--board-stack-gap)
      ) !important;
    }

    #analyze-app-host #app .board-stack {
      height: var(--board-stage-height) !important;
      min-height: var(--board-stage-height) !important;
    }

    #analyze-app-host #app .board-frame {
      height: auto !important;
    }

    #analyze-app-host #app .eval-bar {
      height: var(--board-shell-width) !important;
      margin-top: var(--board-player-strip-size) !important;
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

    #analyze-app-host[data-layout-mode="arcade-play"] #app .workspace {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 12px !important;
    }

    #analyze-app-host[data-layout-mode="arcade-play"] #app .right,
    #analyze-app-host[data-layout-mode="arcade-play"] #app .board-analysis,
    #analyze-app-host[data-layout-mode="arcade-play"] #app .eval-bar,
    #analyze-app-host[data-layout-mode="arcade-play"] #app #coachCard,
    #analyze-app-host[data-layout-mode="arcade-play"] #app .board-options {
      display: none !important;
    }

    #analyze-app-host[data-layout-mode="arcade-play"] #app .board-stage {
      --board-player-strip-size: 48px !important;
      --board-stack-gap: 0px !important;
      --board-frame-extra-width: 0px !important;
      --board-history-width: clamp(140px, 10vw, 190px) !important;
      --board-options-height: 0px !important;
      --board-shell-width: min(
        calc(
          var(--analyze-viewport-room, 100dvh) -
            (var(--board-player-strip-size) * 2) -
            24px
        ),
        calc(100vw - var(--board-history-width) - 120px),
        800px
      ) !important;
      grid-template-columns:
        minmax(132px, var(--board-history-width))
        minmax(0, var(--board-shell-width)) !important;
      justify-content: start !important;
      gap: 10px !important;
      align-items: start !important;
      width: 100% !important;
      max-width: 100% !important;
      --board-stage-height: var(--board-shell-height) !important;
    }

    #analyze-app-host[data-layout-mode="arcade-play"] #app .board-frame {
      grid-template-columns: auto !important;
      gap: 0 !important;
      width: var(--board-shell-width) !important;
    }

    #analyze-app-host[data-layout-mode="arcade-play"] #app .board-history-panel {
      height: var(--board-shell-height) !important;
    }

    #analyze-app-host[data-layout-mode="arcade-play"] #app .board-shell-wrap {
      width: var(--board-shell-width) !important;
      max-width: none !important;
    }

    #analyze-app-host[data-layout-mode="arcade-play"] #app .board-stack {
      width: var(--board-shell-width) !important;
      min-width: var(--board-shell-width) !important;
      max-width: var(--board-shell-width) !important;
    }

    #analyze-app-host[data-layout-mode="arcade-play"] #app .board-history-panel,
    #analyze-app-host[data-layout-mode="arcade-play"] #app .board-options {
      border-radius: 0 !important;
      box-shadow: 6px 6px 0 var(--app-shell-shadow) !important;
    }

    @media (max-width: 1180px) {
      #analyze-app-host[data-layout-mode="arcade-play"] #app .board-stage {
        --board-history-width: 170px !important;
        --board-shell-width: min(
          calc(
            var(--analyze-viewport-room, 100dvh) -
              (var(--board-player-strip-size) * 2) -
              24px
          ),
          calc(100vw - 320px),
          760px
        ) !important;
        gap: 12px !important;
      }
    }

    @media (max-width: 920px) {
      #analyze-app-host[data-layout-mode="arcade-play"] #app .board-stage {
        --board-options-height: 108px !important;
        --board-shell-width: min(
          calc(100vw - 32px),
          calc(var(--analyze-viewport-room, 100dvh) - 250px),
          680px
        ) !important;
        grid-template-columns: minmax(0, 1fr) !important;
        justify-content: stretch !important;
      }

      #analyze-app-host[data-layout-mode="arcade-play"] #app .board-history-panel {
        order: 2 !important;
        width: var(--board-shell-width) !important;
        height: auto !important;
        min-height: 220px !important;
      }

      #analyze-app-host[data-layout-mode="arcade-play"] #app .board-stack {
        order: 1 !important;
      }
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
              (var(--board-player-strip-size) * 2) -
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
              (var(--board-player-strip-size) * 2) -
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
      }

      #analyze-app-host #app .right > .card {
        padding: 10px !important;
      }

      #analyze-app-host #app .workspace.report-rail-hidden .board-stage {
        --board-shell-width: min(
          calc(
            var(--analyze-viewport-room, 100dvh) -
              (var(--board-player-strip-size) * 2) -
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
              (var(--board-player-strip-size) * 2) -
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
        padding: 10px 10px 8px !important;
        gap: 8px !important;
      }

      #analyze-app-host #app .analysis-row {
        --analysis-rank-col: 1.9rem !important;
        --analysis-stats-col: 11.5ch !important;
        padding: 7px 9px 6px 14px !important;
      }

      #analyze-app-host #app .analysis-main {
        gap: 6px 8px !important;
      }

      #analyze-app-host #app .analysis-rank,
      #analyze-app-host #app .analysis-stats {
        font-size: 0.62rem !important;
      }

      #analyze-app-host #app .analysis-san {
        min-width: calc(var(--lead-cols, 6) * 0.82ch) !important;
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
}

function resetAnalyzeBootAssets() {
  document.getElementById(ANALYZE_STYLE_ID)?.remove();
  document.getElementById(ANALYZE_CHESS_SCRIPT_ID)?.remove();
  document.getElementById(ANALYZE_APP_SCRIPT_ID)?.remove();
}

export function AnalyzeBridge({
  initialPreferences,
  initialWorkspaceMode,
  layoutMode = "default",
  initialArcadeGame = null,
  arcadeGamePersistUrl = null,
  analyzePreferencesPersistUrl = null,
}: {
  initialPreferences: AnalyzePreferences | null;
  initialWorkspaceMode: AnalyzeWorkspaceMode;
  layoutMode?: "default" | "arcade-play";
  initialArcadeGame?: ArcadeInitialGameSnapshot | null;
  arcadeGamePersistUrl?: string | null;
  analyzePreferencesPersistUrl?: string | null;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    const hoverCleanups: Array<() => void> = [];

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

    document.body.classList.add("analyze-embedded");
    window.__CHESSVIEW_INITIAL_ANALYZE_PREFERENCES__ = initialPreferences;
    window.__CHESSVIEW_ANALYZE_PREFERENCES_PERSIST_URL__ =
      analyzePreferencesPersistUrl;
    window.__CHESSVIEW_INITIAL_WORKSPACE_MODE__ = initialWorkspaceMode;
    window.__CHESSVIEW_INITIAL_ARCADE_GAME__ = initialArcadeGame;
    window.__CHESSVIEW_ARCADE_GAME_PERSIST_URL__ = arcadeGamePersistUrl;
    window.__chessSomething?.applyUserAnalyzePreferences?.(initialPreferences);
    window.__chessSomething?.setWorkspaceMode?.(initialWorkspaceMode);
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
        window.__chessSomething?.setWorkspaceMode?.(initialWorkspaceMode);
        wireVisualHoverState();
        setStatus("ready");
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

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(syncLater);
      window.removeEventListener("resize", syncViewportRoom);
      hoverCleanups.forEach((cleanup) => cleanup());
      document.body.classList.remove("analyze-embedded");
    };
  }, [
    initialPreferences,
    initialWorkspaceMode,
    initialArcadeGame,
    arcadeGamePersistUrl,
    analyzePreferencesPersistUrl,
  ]);

  return (
    <div
      id="analyze-app-host"
      ref={hostRef}
      className="relative w-full"
      data-layout-mode={layoutMode}
      style={{ height: "100%" }}
    >
      {/* Standalone app mounts into #app */}
      <div id="app" />

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










