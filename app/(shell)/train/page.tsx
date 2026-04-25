"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { AnalysisBoard, type BoardMove } from "@/components/chess/analysis-board";
import {
  analyzeBoardThemeForAppTheme,
  normalizeAnalyzePreferences,
  type AnalyzePreferences,
  type AnalyzeBoardTheme,
  type AnalyzePieceTheme,
} from "@/lib/analyze-preferences";

type TrainingState = "active" | "complete" | "drift";

type TrainingMove = {
  san: string;
  side: "white" | "black";
};

const ANALYZE_PREFERENCES_STORAGE_KEY = "chessview-analyze-preferences";

const mockRep = {
  fen: "8/2k3pp/p2r4/2K1p3/1R2Pp2/P4P2/6PP/8 w - - 0 57",
  completedFen: "8/1k4pp/p2K4/4p3/1R2Pp2/P4P2/6PP/8 b - - 2 58",
  sideToMove: "White",
  prompt: "Find the best move for White",
  sequenceLength: 5,
  rating: 1647,
  completedRating: 1656,
  streak: 1,
  completedStreak: 2,
  bestStreak: 14,
  similarPriorFailures: 14,
  estimatedTime: "4.1m",
  targetLabel: "Recurring blindspot",
  moveHistory: [
    { san: "...", side: "black" },
    { san: "Kc7", side: "white" },
  ] satisfies TrainingMove[],
  completedMoves: [
    { san: "...", side: "black" },
    { san: "Kc7", side: "white" },
    { san: "Rb7+", side: "white" },
    { san: "Kxb7", side: "black" },
    { san: "Kxd6", side: "white" },
  ] satisfies TrainingMove[],
};

export default function TrainPage() {
  const [state, setState] = useState<TrainingState>("active");
  const [fen, setFen] = useState(mockRep.fen);
  const [elapsed, setElapsed] = useState(3);
  const [moves, setMoves] = useState<TrainingMove[]>(mockRep.moveHistory);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [silentEval, setSilentEval] = useState(false);
  const [visualPreferences, setVisualPreferences] = useState<{
    boardTheme: AnalyzeBoardTheme;
    pieceTheme: AnalyzePieceTheme;
  }>(() => {
    const normalized = normalizeAnalyzePreferences(null);
    return {
      boardTheme: normalized.boardTheme,
      pieceTheme: normalized.pieceTheme,
    };
  });

  useEffect(() => {
    if (state !== "active") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    function readVisualPreferences() {
      let stored: unknown = null;
      try {
        const raw = window.localStorage.getItem(ANALYZE_PREFERENCES_STORAGE_KEY);
        stored = raw ? JSON.parse(raw) : null;
      } catch {
        stored = null;
      }

      const storedPreferences =
        stored && typeof stored === "object"
          ? (stored as Partial<AnalyzePreferences>)
          : null;
      const normalized = normalizeAnalyzePreferences(storedPreferences);
      const appTheme = document.documentElement.dataset.theme;
      setVisualPreferences({
        boardTheme: analyzeBoardThemeForAppTheme(appTheme),
        pieceTheme: normalized.pieceTheme,
      });
    }

    readVisualPreferences();
    window.addEventListener("storage", readVisualPreferences);
    const observer = new MutationObserver(readVisualPreferences);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("storage", readVisualPreferences);
      observer.disconnect();
    };
  }, []);

  function switchState(nextState: TrainingState) {
    setState(nextState);
    setLastMove(nextState === "complete" ? { from: "c5", to: "d6" } : null);
    if (nextState === "active") {
      setFen(mockRep.fen);
      setMoves(mockRep.moveHistory);
      setElapsed(3);
    }
    if (nextState === "complete") {
      setFen(mockRep.completedFen);
      setMoves(mockRep.completedMoves);
      setElapsed(121);
    }
    if (nextState === "drift") {
      setFen(mockRep.fen);
      setMoves([...mockRep.moveHistory, { san: "Rb8?", side: "white" }]);
      setElapsed(48);
    }
  }

  function handleMove(move: BoardMove) {
    try {
      const chess = new Chess(fen);
      chess.move({ from: move.from, to: move.to, promotion: "q" });
      setFen(chess.fen());
      setLastMove({ from: move.from, to: move.to });
      setMoves((current) => [...current, { san: move.san ?? move.uci ?? `${move.from}${move.to}`, side: chess.turn() === "w" ? "black" : "white" }]);
      if (moves.length + 1 >= mockRep.sequenceLength) {
        setState("complete");
      }
    } catch {
      // The board only emits legal moves, but keep the page resilient to stale FEN.
    }
  }

  const status = useMemo(() => statusForState(state), [state]);
  const rating = state === "complete" ? mockRep.completedRating : mockRep.rating;
  const streak = state === "complete" ? mockRep.completedStreak : mockRep.streak;

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-auto py-4">
      <div className="grid w-full gap-5 lg:min-h-[780px] lg:grid-cols-[minmax(0,1.36fr)_minmax(360px,0.88fr)]">
        <section className="flex items-center justify-center rounded-[14px] border border-[var(--app-border-soft)] bg-[var(--app-panel-strong)] p-3 sm:p-5 lg:min-h-0 lg:p-8">
          <div className="w-full max-w-[min(92vw,74vh,920px)]">
            <AnalysisBoard
              fen={fen}
              mode="training"
              orientation="white"
              coordinates
              lastMove={lastMove}
              boardTheme={visualPreferences.boardTheme}
              pieceTheme={visualPreferences.pieceTheme}
              highlightedSquares={
                state === "complete"
                  ? { d6: "color-mix(in srgb, var(--app-accent) 44%, var(--app-selection) 56%)" }
                  : state === "drift"
                    ? { b8: "color-mix(in srgb, var(--app-class-mistake) 42%, #7f8190 58%)" }
                    : { c7: "color-mix(in srgb, var(--app-accent) 30%, var(--app-selection) 70%)" }
              }
              onMove={handleMove}
            />
          </div>
        </section>

        <aside className="flex flex-col rounded-[14px] border border-[var(--app-border-soft)] bg-[var(--app-panel-strong)] p-5 sm:p-6 lg:min-h-[720px]">
          <div className="flex items-start justify-between gap-4">
            <div className="inline-flex min-h-12 items-center gap-2 rounded border border-[var(--app-accent)] bg-[var(--app-accent-soft)] px-4 text-lg font-bold text-[var(--app-text)]">
              <ClockIcon />
              <span>{formatTime(elapsed)}</span>
            </div>
            <div className="flex items-center gap-3 text-[var(--app-muted)]">
              <ChatIcon />
              <TuneIcon />
              <span className="text-lg font-bold">({mockRep.estimatedTime})</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <MetricCard label="Rating" value={rating} delta={state === "complete" ? "+9.4" : null} />
            <MetricCard
              label="Win streak"
              value={streak}
              delta={state === "complete" ? "+1" : null}
              sideValue={`${mockRep.bestStreak} best`}
            />
          </div>

          {state === "complete" ? (
            <StatusBanner
              title="Rep complete"
              detail="Eval preserved"
              action="Next position"
              tone="success"
              onAction={() => switchState("active")}
            />
          ) : state === "drift" ? (
            <StatusBanner
              title="Eval dropped"
              detail="Rep saved for review"
              action="Retry"
              tone="warning"
              onAction={() => switchState("active")}
            />
          ) : (
            <PromptCard />
          )}

          <div className="mt-5 border-y border-[var(--app-border-soft)] py-4">
            <ToggleRow
              label="Auto-advance to next position"
              checked={autoAdvance}
              onChange={setAutoAdvance}
            />
            <ToggleRow
              label="Silent eval"
              detail="No engine hints"
              checked={silentEval}
              onChange={setSilentEval}
            />
          </div>

          <MoveList moves={moves} sequenceLength={mockRep.sequenceLength} />

          <div className="mt-auto pt-5">
            <div className="mb-4 grid grid-cols-3 gap-2 rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-1">
              <StateButton active={state === "active"} onClick={() => switchState("active")}>
                Active
              </StateButton>
              <StateButton active={state === "complete"} onClick={() => switchState("complete")}>
                Complete
              </StateButton>
              <StateButton active={state === "drift"} onClick={() => switchState("drift")}>
                Drift
              </StateButton>
            </div>
            <div className="flex items-center justify-between rounded-[12px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-2">
              <div className="flex items-center gap-2">
                <IconButton label="Session menu"><DotsIcon /></IconButton>
                <IconButton label="Inspect position"><SearchIcon /></IconButton>
                <IconButton label="Insight"><LightIcon /></IconButton>
              </div>
              <div className="flex items-center gap-2">
                <IconButton label="Reset"><ResetIcon /></IconButton>
                <IconButton label="Previous"><ChevronLeftIcon /></IconButton>
                <IconButton label="Next"><ChevronRightIcon /></IconButton>
              </div>
            </div>
          </div>

          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
            {status}
          </p>
        </aside>
      </div>
    </div>
  );
}

function PromptCard() {
  return (
    <div className="mt-4 rounded-[8px] border border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-4 py-4">
      <div className="flex items-center gap-4">
        <QueenIcon />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--app-text)]">{mockRep.prompt}</p>
          <p className="mt-1 text-xs text-[var(--app-muted)]">
            {mockRep.targetLabel} · Similar to {mockRep.similarPriorFailures} prior misses · {mockRep.sequenceLength}-move sequence
          </p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  sideValue,
}: {
  label: string;
  value: number;
  delta?: string | null;
  sideValue?: string;
}) {
  return (
    <div className="min-h-[106px] rounded-[8px] bg-black/30 p-4">
      <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">{label}</p>
      <div className="mt-2 flex items-end gap-3">
        <span className="text-4xl font-bold leading-none text-[var(--app-text)]">{value}</span>
        {delta ? (
          <span className="mb-1 rounded-[5px] bg-[var(--app-accent)] px-2 py-1 text-xs font-bold text-black">
            {delta}
          </span>
        ) : null}
        {sideValue ? (
          <span className="mb-1 text-sm font-bold uppercase text-[var(--app-muted)]">{sideValue}</span>
        ) : null}
      </div>
    </div>
  );
}

function StatusBanner({
  title,
  detail,
  action,
  tone,
  onAction,
}: {
  title: string;
  detail: string;
  action: string;
  tone: "success" | "warning";
  onAction: () => void;
}) {
  const isSuccess = tone === "success";
  return (
    <div
      className="mt-4 flex items-center justify-between gap-4 rounded-[10px] border px-4 py-4"
      style={{
        borderColor: isSuccess ? "rgba(49, 249, 106, 0.52)" : "var(--app-class-mistake-border)",
        background: isSuccess
          ? "linear-gradient(90deg, rgba(49,249,106,0.24), rgba(49,249,106,0.04))"
          : "linear-gradient(90deg, var(--app-class-mistake-soft), rgba(0,0,0,0.12))",
      }}
    >
      <div className="flex items-center gap-3">
        <TargetIcon />
        <div>
          <p className="text-base font-bold text-[var(--app-text)]">{title}</p>
          <p className="text-xs font-bold uppercase text-[var(--app-muted)]">{detail}</p>
        </div>
      </div>
      <button
        type="button"
        className="min-h-10 rounded-full border border-white/80 px-5 text-xs font-bold uppercase text-[var(--app-text)] transition hover:bg-white hover:text-black"
        onClick={onAction}
      >
        {action}
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-11 w-full items-center gap-3 border-b border-[var(--app-border-soft)] text-left last:border-b-0"
      onClick={() => onChange(!checked)}
    >
      <span
        className="relative h-5 w-10 rounded-full transition"
        style={{ background: checked ? "var(--app-accent)" : "rgba(255,255,255,0.36)" }}
      >
        <span
          className="absolute top-1 h-3 w-3 rounded-full bg-white transition"
          style={{ left: checked ? "22px" : "5px" }}
        />
      </span>
      <span className="text-base font-bold text-[var(--app-text)]">{label}</span>
      {detail ? <span className="text-xs font-bold uppercase text-[var(--app-muted)]">{detail}</span> : null}
    </button>
  );
}

function MoveList({ moves, sequenceLength }: { moves: TrainingMove[]; sequenceLength: number }) {
  const rows = Array.from({ length: Math.max(sequenceLength, moves.length) }, (_, index) => moves[index] ?? null);
  return (
    <div className="mt-4 overflow-hidden">
      {rows.map((move, index) => (
        <div
          key={`${index}-${move?.san ?? "empty"}`}
          className={[
            "grid min-h-12 grid-cols-[46px_1fr_1fr] items-center border-b border-[var(--app-border-soft)] px-2 text-sm",
            move && index === moves.length - 1 ? "bg-white/[0.03]" : "",
          ].join(" ")}
        >
          <span className="text-right text-[var(--app-muted)]">{index + 1}</span>
          <span className="pl-8 text-[var(--app-muted)]">{move?.side === "white" ? move.san : "..."}</span>
          <span className="justify-self-center">
            {move?.side === "black" || move?.san === "..." ? (
              <span className={index === moves.length - 1 ? "rounded-[6px] border border-violet-600 px-10 py-2 font-bold text-[var(--app-text)]" : "font-bold text-[var(--app-text)]"}>
                {move.san}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function StateButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "min-h-9 rounded-[7px] px-3 text-xs font-bold uppercase transition",
        active ? "bg-[var(--app-accent)] text-black" : "text-[var(--app-muted)] hover:bg-white/10 hover:text-[var(--app-text)]",
      ].join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center rounded-[9px] bg-white/[0.05] text-[var(--app-muted)] transition hover:bg-white/12 hover:text-[var(--app-text)]"
    >
      {children}
    </button>
  );
}

function statusForState(state: TrainingState) {
  if (state === "complete") return "Profile updated · Position family retained";
  if (state === "drift") return "Eval drift logged · Similar positions will repeat";
  return "Training a recurring blindspot · Silent eval";
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function ClockIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function ChatIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 17H6l-3 3v-5.5A6.5 6.5 0 0 1 9.5 8H10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><path d="M14.5 4A6.5 6.5 0 0 1 21 10.5V17l-3-3h-3.5A6.5 6.5 0 1 1 14.5 4Z" stroke="currentColor" strokeWidth="1.7" /></svg>;
}

function TuneIcon() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h7M15 7h5M4 17h5M13 17h7M9 4v6M15 14v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function QueenIcon() {
  return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-[var(--app-text)]"><path d="m4 9 4 4 4-7 4 7 4-4-2 10H6L4 9Z" fill="currentColor" /><path d="M6 21h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function TargetIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[var(--app-accent)]"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" /><path d="m15 9-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function DotsIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5.5v.01M12 12v.01M12 18.5v.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

function SearchIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

function LightIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18h6M10 22h4M8 14a6 6 0 1 1 8 0c-.8.7-1 1.5-1 2H9c0-.5-.2-1.3-1-2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ResetIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6v5h-5M19 13a7 7 0 1 1-2-5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ChevronLeftIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ChevronRightIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
