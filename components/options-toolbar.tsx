"use client";

import { useState } from "react";
import { useChessApp } from "./chess-app-context";

export function OptionsToolbar() {
  const { newGame, flipBoard, haltEngine, engineLinesHidden, isReady } = useChessApp();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div
      className="flex w-full items-center gap-2 border-t border-white/10 bg-[#0a0a0a] px-3 py-2"
      style={{ minHeight: "54px" }}
    >
      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-none border-2 border-white/20 bg-transparent px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white transition hover:border-white hover:bg-white hover:text-black"
          onClick={() => newGame()}
          disabled={!isReady}
        >
          Reset Board
        </button>
        <button
          className="rounded-none border-2 border-white/20 bg-transparent px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white transition hover:border-white hover:bg-white hover:text-black"
          onClick={() => flipBoard()}
          disabled={!isReady}
        >
          Flip Board
        </button>
        <button
          className="rounded-none border-2 border-white/20 bg-transparent px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white transition hover:border-white hover:bg-white hover:text-black"
          onClick={() => haltEngine(!engineLinesHidden)}
          disabled={!isReady}
        >
          {engineLinesHidden ? "Show lines" : "Hide lines"}
        </button>
        <button
          className="rounded-none border-2 border-[#c084fc] bg-[#c084fc] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-black transition hover:border-white hover:bg-white hover:text-black"
          onClick={() => setShowSettings(true)}
          disabled={!isReady}
        >
          Import Game
        </button>
        <button
          className="rounded-none border-2 border-white/20 bg-transparent px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white transition hover:border-white hover:bg-white hover:text-black"
          onClick={() => {}}
          disabled={!isReady}
        >
          Export PGN/FEN
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings trigger */}
      <button
        className="rounded-none border-2 border-white/20 bg-transparent px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white transition hover:border-white hover:bg-white hover:text-black"
        onClick={() => setShowSettings(true)}
        disabled={!isReady}
        aria-haspopup="dialog"
        aria-expanded={showSettings}
      >
        Settings
      </button>
    </div>
  );
}
