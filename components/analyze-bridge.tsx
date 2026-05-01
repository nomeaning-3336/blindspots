"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalyzePreferences } from "@/lib/analyze-preferences";

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
  }
}

const ANALYZE_BASE_PATH = "/analyze";
const ANALYZE_ASSET_VERSION = "2026-04-25-nav-pause-v1";
const ANALYZE_STYLE_ID = "analyze-style";
const ANALYZE_OVERRIDE_ID = "analyze-react-override";
const ANALYZE_CHESS_SCRIPT_ID = "analyze-chess-js";
const ANALYZE_APP_SCRIPT_ID = "analyze-runtime";
const ANALYZE_PAGE_TITLE =
  "Blindspots.gg - Chess Training for the Positions You Keep Getting Wrong";

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

    /* Remove borders from move classification icons */
    #analyze-app-host #app .board-history-move-icon {
      border: none !important;
    }

    /* ============================================================
       POLISH LAYER — sensual analyze surface.
       Lifts flat panels to match landing's graphite+glow aesthetic.
       ============================================================ */
    #analyze-app-host::before {
      content: "";
      position: absolute;
      inset: -12% -8% -8% -8%;
      z-index: 0;
      pointer-events: none;
      background:
        radial-gradient(720px 340px at 78% 6%, color-mix(in srgb, var(--app-accent) 10%, transparent), transparent 64%),
        radial-gradient(520px 320px at 10% 104%, color-mix(in srgb, var(--app-accent) 5%, transparent), transparent 70%);
      opacity: 0.9;
    }
    #analyze-app-host > * { position: relative; z-index: 1; }

    #analyze-app-host #app .board-shell-wrap,
    #analyze-app-host #app .board-analysis,
    #analyze-app-host #app .board-history-panel,
    #analyze-app-host #app .section-head {
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--app-panel-strong) 94%, transparent) 0%,
          color-mix(in srgb, var(--app-panel-deep) 96%, transparent) 100%
        ) !important;
      border-color: color-mix(in srgb, var(--app-border-strong) 10%, transparent) !important;
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--app-border-strong) 6%, transparent),
        0 22px 60px -36px color-mix(in srgb, var(--app-bg) 95%, transparent);
      transition: border-color 200ms ease, box-shadow 240ms ease;
    }

    #analyze-app-host #app .board-shell-wrap {
      border-radius: 10px !important;
      box-shadow:
        inset 0 0 0 1px color-mix(in srgb, var(--app-border-strong) 7%, transparent),
        0 0 0 1px color-mix(in srgb, var(--app-accent) 5%, transparent),
        0 36px 90px -38px color-mix(in srgb, var(--app-bg) 96%, transparent),
        0 0 60px -30px color-mix(in srgb, var(--app-accent) 40%, transparent) !important;
    }

    #analyze-app-host #app .section-head {
      letter-spacing: 0.22em !important;
      text-transform: uppercase;
      font-size: 0.64rem !important;
      color: color-mix(in srgb, var(--app-text) 72%, var(--app-muted) 28%) !important;
    }

    #analyze-app-host #app .board-options .btn,
    #analyze-app-host #app .settings-trigger {
      transition:
        border-color 160ms ease,
        background 160ms ease,
        color 160ms ease,
        box-shadow 220ms ease,
        transform 160ms ease !important;
      border-radius: 4px !important;
    }
    #analyze-app-host #app .board-options .btn:hover,
    #analyze-app-host #app .board-options .btn:focus-visible,
    #analyze-app-host #app .board-options .btn[data-visual-hover="true"] {
      box-shadow:
        0 10px 26px -10px color-mix(in srgb, var(--app-accent) 55%, transparent),
        inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 18%, transparent) !important;
      transform: translateY(-1px);
    }
    #analyze-app-host #app .board-options .btn.primary,
    #analyze-app-host #app .board-options .btn[data-primary="true"] {
      background: var(--app-accent) !important;
      color: var(--app-accent-contrast) !important;
      border-color: var(--app-accent) !important;
      box-shadow: 0 12px 32px -12px color-mix(in srgb, var(--app-accent) 50%, transparent) !important;
    }

    #analyze-app-host #app .board-history-move.is-active,
    #analyze-app-host #app .board-history-move[aria-selected="true"],
    #analyze-app-host #app .analysis-row.is-active {
      background: color-mix(in srgb, var(--app-accent) 10%, transparent) !important;
      box-shadow: inset 3px 0 0 0 var(--app-accent) !important;
    }

    #analyze-app-host #app .eval-bar {
      border-radius: 3px !important;
      box-shadow:
        inset 0 0 0 1px color-mix(in srgb, var(--app-border-strong) 9%, transparent),
        0 10px 24px -16px color-mix(in srgb, var(--app-bg) 95%, transparent) !important;
    }

    #analyze-app-host #app #coachPill input:focus,
    #analyze-app-host #app #assistantInput:focus {
      outline: none !important;
      border-color: var(--app-accent) !important;
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--app-accent) 22%, transparent),
        inset 0 1px 0 color-mix(in srgb, var(--app-border-strong) 8%, transparent) !important;
    }

    #analyze-app-host #app ::-webkit-scrollbar { width: 10px; height: 10px; }
    #analyze-app-host #app ::-webkit-scrollbar-track { background: transparent; }
    #analyze-app-host #app ::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--app-border-strong) 12%, transparent);
      border-radius: 10px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    #analyze-app-host #app ::-webkit-scrollbar-thumb:hover {
      background: color-mix(in srgb, var(--app-accent) 40%, var(--app-border-strong) 28%);
      background-clip: padding-box;
    }

    #analyze-app-host #app .settings-trigger:hover,
    #analyze-app-host #app .settings-trigger[data-visual-hover="true"] {
      transform: translateY(-1px);
      box-shadow:
        0 10px 26px -12px color-mix(in srgb, var(--app-accent) 50%, transparent) !important;
    }

    #analyze-app-host #app .analysis-score,
    #analyze-app-host #app .board-history-eval,
    #analyze-app-host #app .move-eval {
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.01em;
    }

    #analyze-app-host #app .chip,
    #analyze-app-host #app .badge {
      letter-spacing: 0.14em;
      text-transform: uppercase;
      border-radius: 3px !important;
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
  initialPreferences,
  analyzePreferencesPersistUrl = null,
}: {
  initialPreferences: AnalyzePreferences | null;
  analyzePreferencesPersistUrl?: string | null;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    const hoverCleanups: Array<() => void> = [];
    let themeObserver: MutationObserver | null = null;
    let titleObserver: MutationObserver | null = null;

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
      hoverCleanups.forEach((cleanup) => cleanup());
      document.body.classList.remove("analyze-embedded");
    };
  }, [
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











