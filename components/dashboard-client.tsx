"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { DashboardClassifications, DashboardPosition, DashboardSummary, EloHistoryPoint } from "@/lib/dashboard";
import { classificationColor } from "@/lib/training-board-ui";
import { ReplayThumbnail } from "@/components/position-thumbnail";


const CLASS_ROWS: Array<{
  id: keyof DashboardClassifications;
  label: string;
  color: string;
  canonical?: boolean;
}> = [
  { id: "brilliant", label: "Brilliant", color: classificationColor("brilliant"), canonical: true },
  { id: "critical", label: "Critical", color: classificationColor("critical"), canonical: true },
  { id: "best", label: "Best", color: classificationColor("best"), canonical: true },
  { id: "excellent", label: "Excellent", color: classificationColor("excellent"), canonical: true },
  { id: "good", label: "Good", color: classificationColor("good"), canonical: true },
  { id: "okay", label: "Okay", color: classificationColor("okay"), canonical: true },
  { id: "inaccuracy", label: "Inaccuracy", color: classificationColor("inaccuracy"), canonical: true },
  { id: "mistake", label: "Mistake", color: classificationColor("mistake"), canonical: true },
  { id: "blunder", label: "Blunder", color: classificationColor("blunder"), canonical: true },
];

const CLASS_COLORS: Record<string, string> = {
  brilliant: classificationColor("brilliant"),
  critical: classificationColor("critical"),
  best: classificationColor("best"),
  excellent: classificationColor("excellent"),
  good: classificationColor("good"),
  okay: classificationColor("okay"),
  inaccuracy: classificationColor("inaccuracy"),
  mistake: classificationColor("mistake"),
  blunder: classificationColor("blunder"),
};

export function DashboardClient({ summary }: { summary: DashboardSummary }) {
  const hasData = summary.totalSequences > 0 || summary.recentSessions.length > 0;

  return (
    <main className="app-paper-shell min-h-[calc(100dvh-64px)] overflow-x-hidden px-4 py-5 md:px-8">
      <div className="mx-auto grid w-full max-w-[1180px] gap-5">
        <DashboardHero
          summary={summary}
          hasData={hasData}
        />

        <SummaryTab summary={summary} hasData={hasData} />
      </div>
    </main>
  );
}

/* ─── Summary Tab ─── */

function DashboardHero({
  summary,
  hasData,
}: {
  summary: DashboardSummary;
  hasData: boolean;
}) {
  const elo = summary.blindspotsElo;
  const delta = summary.eloDeltaSession;

  return (
    <section className="app-brutal-section p-5 md:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)] lg:items-center">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3 text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--app-muted)]"><span>Your Blindspots Elo</span></div>
            <div className="text-[64px] font-bold leading-none text-[var(--app-text)] md:text-[76px]">
              {elo == null ? "-" : formatNumber(elo)}
            </div>

            {delta != null && (
              <div className={["mt-2 text-sm font-bold", deltaClass(delta)].join(" ")}>
                {signed(delta)} from last session
              </div>
            )}


            {!hasData && (
              <p className="mt-3 max-w-sm text-xs leading-6 text-[var(--app-muted)]">
                No completed sessions yet. Go train. The dashboard is not psychic.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/train"
              className="app-brutal-button inline-flex min-h-11 items-center justify-center px-5 py-3 text-xs"
            >
              {hasData ? "Continue training" : "Start training"}
            </Link>
          </div>
        </div>

        <div className="min-w-0 lg:border-l lg:border-[var(--app-border-soft)] lg:pl-6">
          {summary.eloHistory.length >= 2 ? (
            <EloChart points={summary.eloHistory} />
          ) : (
            <div className="flex min-h-[180px] items-center justify-center text-center text-[10px] uppercase tracking-[0.14em] text-[var(--app-muted-soft)]">
              {summary.eloHistory.length === 0
                ? "Complete a session to start tracking Elo."
                : "One session recorded. Keep going to see a trend."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryTab({ summary, hasData }: { summary: DashboardSummary; hasData: boolean }) {
  return (
    <div className="grid gap-5">
      <QueueOverviewSection
        positions={summary.positions}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.44fr)_minmax(0,0.56fr)] lg:items-start">
        <ProgressSnapshot summary={summary} hasData={hasData} />
        <MoveClassifications classifications={summary.classifications} />
      </div>
    </div>
  );
}

function InfoTooltip({
  children,
}: {
  children: React.ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PAD = 16;
  const GAP = 8;

  const compute = useCallback(() => {
    const trigger = triggerRef.current;
    const tip = tooltipRef.current;
    if (!trigger || !tip) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipW = tip.offsetWidth;
    const tipH = tip.offsetHeight;

    let left = rect.left;
    if (left + tipW > vw - PAD) {
      left = rect.right - tipW;
      if (left < PAD) left = PAD;
    }

    let top = rect.bottom + GAP;
    if (top + tipH > vh - PAD) {
      top = rect.top - GAP - tipH;
      if (top < PAD) top = PAD;
    }

    setPos({ left, top });
  }, []);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearLeaveTimer();
    setOpen(true);
  }, [clearLeaveTimer]);

  // Once the tooltip DOM node mounts, measure & position it
  useEffect(() => {
    if (open && tooltipRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(compute);
      });
    }
  }, [open, compute]);

  const hide = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  const scheduleHide = useCallback(() => {
    leaveTimerRef.current = setTimeout(hide, 100);
  }, [hide]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        hide();
        triggerRef.current?.focus();
      }
    }
    function onResize() { compute(); }
    function onScroll() { compute(); }
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open, compute, hide]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Explain queue types"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        className="inline-flex h-9 items-center gap-2 rounded-none border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--app-muted)] shadow-[3px_3px_0_#050505] transition hover:-translate-x-[1px] hover:-translate-y-[1px] hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] hover:shadow-[4px_4px_0_#050505] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
      >
        <span>Queue types</span>
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center border border-current text-[11px] leading-none"
        >
          ?
        </span>
      </button>
      {open ? (
        <div
          ref={tooltipRef}
          role="tooltip"
          id={id}
          className="fixed z-[90] w-[500px] max-w-[calc(100vw-32px)] border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-5 py-4 text-xs leading-5 shadow-[4px_4px_0_#050505]"
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--app-accent)]">
            Queue types
          </div>
          {children}
        </div>
      ) : null}
    </>
  );
}

/* ─── Queue helpers ─── */

type QueueBucket = "dueNow" | "new" | "learning" | "mastered" | "retired";

function isPersonalMistakePosition(p: DashboardPosition) {
  return (
    !p.id.startsWith("session:") &&
    p.status !== "session" &&
    p.sourceType !== "training_session" &&
    p.sourceType !== "lichess_puzzle_filler"
  );
}

function isDueNow(p: DashboardPosition, nowMs: number) {
  if (!p.nextReviewAt) return false;
  const reviewMs = Date.parse(p.nextReviewAt);
  return Number.isFinite(reviewMs) && reviewMs <= nowMs;
}

function queueBucketForPosition(p: DashboardPosition, nowMs: number): QueueBucket | null {
  if (!isPersonalMistakePosition(p)) return null;

  if (p.status === "retired") return "retired";
  if (p.status === "mastered") return "mastered";
  if (isDueNow(p, nowMs)) return "dueNow";

  if (p.status === "active" && p.attempts === 0) return "new";
  if (p.status === "active" || p.status === "review" || p.status === "learning") return "learning";

  return null;
}

function formatReviewCountdown(nextReviewAt: string | null, nowMs: number) {
  if (!nextReviewAt) return null;

  const targetMs = Date.parse(nextReviewAt);
  if (!Number.isFinite(targetMs)) return null;

  const diffMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diffMs / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatReviewAbsolute(nextReviewAt: string | null): string {
  if (!nextReviewAt) return "Not scheduled";
  const date = new Date(nextReviewAt);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── Queue Overview Section ─── */

const QUEUE_DEFS: Array<{
  bucket: QueueBucket;
  label: string;
  accent: boolean;
  emptyLabel: string;
}> = [
  { bucket: "dueNow", label: "Due now", accent: true, emptyLabel: "No reviews due. The queue is behaving, suspiciously." },
  { bucket: "learning", label: "Learning", accent: false, emptyLabel: "No learning positions yet." },
  { bucket: "new", label: "New", accent: false, emptyLabel: "No new personal mistakes yet. Generated training still works, but it is not counted here." },
  { bucket: "mastered", label: "Mastered", accent: false, emptyLabel: "No mastered positions yet." },
  { bucket: "retired", label: "Retired", accent: false, emptyLabel: "No retired positions yet." },
];

function QueueOverviewSection({
  positions,
}: {
  positions: DashboardPosition[];
}) {
  const [selectedBucket, setSelectedBucket] = useState<QueueBucket | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Single global ticker for all countdowns
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Bucket counts from filtered personal positions only
  const bucketCounts = useMemo(() => {
    const counts: Record<QueueBucket, number> = { dueNow: 0, new: 0, learning: 0, mastered: 0, retired: 0 };
    for (const p of positions) {
      const bucket = queueBucketForPosition(p, nowMs);
      if (bucket) counts[bucket]++;
    }
    return counts;
  }, [positions, nowMs]);

  // Filtered positions for selected bucket
  const filteredPositions = useMemo(() => {
    if (!selectedBucket) return [];
    return positions.filter((p) => queueBucketForPosition(p, nowMs) === selectedBucket);
  }, [positions, selectedBucket, nowMs]);

  const toggleBucket = (bucket: QueueBucket) => {
    setSelectedBucket((prev) => (prev === bucket ? null : bucket));
  };

  return (
    <section className="app-brutal-section px-5 pb-5 pt-3 md:px-6 md:pb-6 md:pt-4">
      <SectionLabel right={
        <InfoTooltip>
          <div className="grid gap-3 text-left">
            {QUEUE_DEFS.map((def) => (
              <div key={def.bucket}>
                <span className="font-bold text-[var(--app-text)]">{def.label}:</span>{" "}
                <span className="text-[var(--app-muted)]">{QUEUE_DESCRIPTIONS[def.bucket]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-[var(--app-border-soft)] pt-2.5 text-[11px] leading-[1.4] text-[var(--app-muted-soft)]">
            Random/generated training positions are fallback material and are not counted here.
          </div>
        </InfoTooltip>
      }>
        Queue overview
      </SectionLabel>

      {/* Queue count cards */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {QUEUE_DEFS.map((def) => {
          const count = bucketCounts[def.bucket];
          const isSelected = selectedBucket === def.bucket;
          return (
            <button
              key={def.bucket}
              type="button"
              onClick={() => toggleBucket(def.bucket)}
              className={[
                "app-brutal-row relative rounded-lg p-4 text-left transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]",
                count === 0 && !isSelected ? "opacity-55" : "",
                isSelected ? "border-[var(--app-accent)] ring-1 ring-[var(--app-accent)]" : "hover:border-[var(--app-border-strong)]",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute right-3 top-3 text-[10px] leading-none transition",
                  isSelected ? "text-[var(--app-accent)]" : "text-[var(--app-muted)]",
                ].join(" ")}
              >
                {isSelected ? "▲" : "▼"}
              </span>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
                {def.label}
              </div>
              <div
                className={[
                  "mt-2 text-2xl font-bold leading-none",
                  def.accent && count > 0 ? "text-[var(--app-accent)]" : "text-[var(--app-text)]",
                ].join(" ")}
              >
                {formatNumber(count)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected queue position list */}
      {selectedBucket && (
        <div className="mt-4 border-t border-[var(--app-border-soft)] pt-4">

          {filteredPositions.length === 0 ? (
            <div className="py-8 text-center text-xs leading-6 text-[var(--app-muted)]">
              {QUEUE_DEFS.find((d) => d.bucket === selectedBucket)?.emptyLabel}
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredPositions.map((pos) => (
                <QueuePositionRow key={pos.id} position={pos} nowMs={nowMs} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ─── Queue tooltip descriptions ─── */

const QUEUE_DESCRIPTIONS: Record<QueueBucket, React.ReactNode> = {
  dueNow: <><strong>Learning</strong> mistakes ready to review. These are served <strong>before</strong> <strong>new</strong> personal mistakes.</>,
  learning: "Mistakes from your games that you are actively trying to fix. Notes and previous bad moves may appear at first, then disappear on later reviews.",
  new: "Newly found mistakes from your games that you have not attempted yet.",
  mastered: "Mistakes answered correctly at least 3 times in a row.",
  retired: "Mistakes answered correctly 7+ times in a row. Archived and no longer served.",
};

/* ─── Queue Position Row ─── */

/* ─── Queue position display helpers ─── */

function getFenTurnSide(fen: string): "white" | "black" {
  const parts = fen.trim().split(/\s+/);
  return parts[1] === "b" ? "black" : "white";
}

function sourceContextLabel(position: DashboardPosition) {
  switch (position.sourceType) {
    case "app_training":
      return "Blindspots";
    case "own_game":
    case "imported_pgn":
      return "User games";
    case "lichess_puzzle_filler":
      return "Puzzle";
    case "master_game":
    case "master_games":
      return "Master games";
    default:
      return position.sourceLabel || "Training";
  }
}

function queuePositionTitle(position: DashboardPosition) {
  const context = sourceContextLabel(position);
  return `Player vs Engine (${context})`;
}

function lastAttemptLabel(position: DashboardPosition) {
  if (!position.attempts || position.attempts <= 0) return "—";
  switch (position.lastResult) {
    case "pass": return "passed";
    case "fail": return "failed";
    case "acceptable": return "acceptable";
    default: return "—";
  }
}

function lastAttemptClass(position: DashboardPosition) {
  const label = lastAttemptLabel(position);
  if (label === "passed") return "text-[var(--app-class-good)]";
  if (label === "failed") return "text-[var(--app-class-blunder)]";
  if (label === "acceptable") return "text-[var(--app-class-inaccuracy)]";
  return "text-[var(--app-muted-soft)]";
}

function formatEvalCp(cp: number | null | undefined) {
  if (typeof cp !== "number") return null;
  const pawns = cp / 100;
  if (Math.abs(pawns) < 0.05) return "0.0";
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

function QueuePositionRow({
  position,
  nowMs,
}: {
  position: DashboardPosition;
  nowMs: number;
}) {
  const countdown = formatReviewCountdown(position.nextReviewAt, nowMs);
  const isOverdue = isDueNow(position, nowMs);
  const userOrientation = getFenTurnSide(position.startingFen);
  const sideLabel = userOrientation === "black" ? "Black to move" : "White to move";
  const evalDisplay = formatEvalCp(position.decisionEvalCp);
  const attemptLabel = position.attempts === 0 ? "First attempt" : `${position.attempts} attempt${position.attempts !== 1 ? "s" : ""}`;
  const lastResultText = lastAttemptLabel(position);
  const hasResult = position.attempts > 0 && lastResultText !== "—";
  const streak = Math.min(position.consecutiveCorrectCount ?? 0, 3);

  return (
    <div className="app-brutal-row grid gap-6 rounded-lg border border-[var(--app-border)] p-5 md:grid-cols-[328px_minmax(0,1fr)_minmax(200px,320px)] md:items-stretch">
      {/* Thumbnail column */}
      <div className="flex shrink-0 flex-col items-center gap-2">
        <ReplayThumbnail
          previousFen={position.previousFen}
          finalFen={position.startingFen}
          playedMove={position.playedMoveUci}
          orientation={userOrientation}
          size={320}
        />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted-soft)]">
          {sideLabel}
        </span>
      </div>

      {/* Content column */}
      <div className="min-w-0">
        {/* Title row */}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-lg font-semibold tracking-tight text-[var(--app-text)]">
            {queuePositionTitle(position)}
          </h3>
          <StatusTag status={position.status} label={position.statusLabel} />
        </div>

        {/* Eval + attempt summary */}
        <div className="mt-1 text-sm leading-6 text-[var(--app-muted)]">
          {evalDisplay != null && <span>Eval {evalDisplay}</span>}
          {evalDisplay != null && <span className="mx-1.5 text-[var(--app-border-soft)]">·</span>}
          <span>{attemptLabel}</span>
          {hasResult && (
            <>
              <span className="mx-1.5 text-[var(--app-border-soft)]">·</span>
              <span className={lastAttemptClass(position)}>{lastResultText}</span>
            </>
          )}
        </div>

        {/* Progress dots (non-due, attempted, not mastered/retired) */}
        {!isOverdue && position.attempts > 0 && position.status !== "mastered" && position.status !== "retired" && (
          <div className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className={i < streak ? "text-[var(--app-accent)]" : "text-[var(--app-muted-soft)]"}>
                {i < streak ? "●" : "○"}{i < 2 ? " " : ""}
              </span>
            ))}
            <span className="ml-1.5">{streak} of 3 to graduate</span>
          </div>
        )}

        {/* Due now status */}
        {isOverdue && (
          <div className="mt-1 text-sm leading-5 font-semibold text-[var(--app-class-blunder)]">
            Due now
          </div>
        )}

        {/* Next review (future only) */}
        {!isOverdue && (
          <div className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
            {formatReviewAbsolute(position.nextReviewAt)}
            {countdown && (
              <span className="tabular-nums"> · in {countdown}</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/train"
            className="inline-flex min-h-8 items-center border border-[var(--app-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text)] transition hover:border-[var(--app-accent)] hover:text-[var(--app-accent)]"
          >
            {position.attempts > 0 ? "Retry" : "Start"}
          </Link>
          <Link
            href={`/analysis?fen=${encodeURIComponent(position.startingFen)}`}
            className="inline-flex min-h-8 items-center border border-[var(--app-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text)] transition hover:border-[var(--app-accent)] hover:text-[var(--app-accent)]"
          >
            Analyze
          </Link>
        </div>
      </div>

      {/* Notes column */}
      <div className="min-w-0 border-l border-[var(--app-border)] pl-6">
        <h4 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--app-muted-soft)]">
          Notes
        </h4>

        {position.moveNotes.length === 0 ? (
          <div className="mt-2 text-sm text-[var(--app-muted)]">N/A</div>
        ) : (
          <div className="mt-3 grid gap-2">
            {position.moveNotes.map((note) => {
              const evalDeltaCp =
                note.evalBeforeCp != null && note.evalAfterCp != null
                  ? note.evalAfterCp - note.evalBeforeCp
                  : null;

              return (
                <div key={note.moveKey} className="grid gap-1 border border-[var(--app-border)] bg-[var(--app-panel-deep)] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-sans text-sm font-semibold text-[var(--app-text)]">
                      {note.moveSan || note.moveUci}
                    </span>
                    {note.classification && (
                      <span className={[
                        "font-mono text-[10px] font-bold uppercase tracking-[0.12em]",
                        classificationTextClass(note.classification),
                      ].join(" ")}>
                        {note.classification}
                      </span>
                    )}
                  </div>

                  {(note.evalBeforeCp != null || note.evalAfterCp != null || evalDeltaCp != null) && (
                    <div className="font-sans text-xs text-[var(--app-muted)]">
                      {note.evalBeforeCp != null && <span>Before: {formatEvalCp(note.evalBeforeCp)}</span>}
                      {note.evalBeforeCp != null && note.evalAfterCp != null && <span> · </span>}
                      {note.evalAfterCp != null && <span>After: {formatEvalCp(note.evalAfterCp)}</span>}
                      {(note.evalBeforeCp != null || note.evalAfterCp != null) && evalDeltaCp != null && <span> · </span>}
                      {evalDeltaCp != null && (
                        <span className={evalDeltaCp > 0 ? "text-[var(--app-class-good)]" : "text-[var(--app-class-blunder)]"}>
                          Δ {evalDeltaCp > 0 ? "+" : ""}{formatEvalCp(evalDeltaCp)}
                        </span>
                      )}
                    </div>
                  )}

                  <p className="font-sans text-sm leading-5 text-[var(--app-text)]">
                    {note.note}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function classificationTextClass(c: string) {
  const map: Record<string, string> = {
    brilliant: "text-[var(--app-class-brilliant)]",
    best: "text-[var(--app-class-best)]",
    excellent: "text-[var(--app-class-excellent)]",
    good: "text-[var(--app-class-good)]",
    okay: "text-[var(--app-class-okay)]",
    inaccuracy: "text-[var(--app-class-inaccuracy)]",
    mistake: "text-[var(--app-class-mistake)]",
    blunder: "text-[var(--app-class-blunder)]",
    critical: "text-[var(--app-class-critical)]",
  };
  return map[c.toLowerCase()] ?? "text-[var(--app-muted)]";
}

function EloChart({ points }: { points: EloHistoryPoint[] }) {
  const width = 920;
  const height = 180;
  const px = 8;
  const py = 18;
  const hSpace = width - px * 2;
  const vSpace = height - py * 2;

  const elos = points.map((p) => p.elo);
  const minElo = Math.min(...elos);
  const maxElo = Math.max(...elos);
  const range = Math.max(1, maxElo - minElo);

  const svgPoints = points.map((point, i) => {
    const x = points.length === 1 ? width / 2 : px + (hSpace * i) / (points.length - 1);
    const y = py + ((maxElo - point.elo) / range) * vSpace;
    return { ...point, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });

  const line = svgPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const area = [`${px},${height - py}`, line, `${svgPoints[svgPoints.length - 1].x},${height - py}`].join(" ");

  const guideCount = 3;
  const guides = Array.from({ length: guideCount }, (_, i) =>
    Math.round(maxElo - (range * i) / (guideCount - 1)),
  );

  const startLabel = formatShortDate(points[0].ts);
  const endLabel = formatShortDate(points[points.length - 1].ts);

  return (
    <div className="min-w-0 flex-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-[150px] w-full md:h-[190px]"
        role="img"
        aria-label="Elo progression over time"
        preserveAspectRatio="none"
      >
        {guides.map((g) => {
          const gy = py + ((maxElo - g) / range) * vSpace;
          return (
            <line key={g} x1={px} y1={gy} x2={width - px} y2={gy} stroke="var(--app-border-soft)" strokeWidth="1" />
          );
        })}
        <polyline points={area} fill="var(--app-accent-soft)" stroke="none" />
        <polyline points={line} fill="none" stroke="var(--app-accent)" strokeWidth="3" strokeLinejoin="round" />
        {svgPoints.map((p, i) => (
          <circle
            key={`${p.ts}-${i}`}
            cx={p.x}
            cy={p.y}
            r={i === svgPoints.length - 1 ? 4 : 3}
            fill={i === svgPoints.length - 1 ? "var(--app-accent)" : "var(--app-panel-solid)"}
            stroke="var(--app-text)"
            strokeWidth="1.5"
          />
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-[var(--app-muted-soft)]">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}


/* ─── Shared sections from original dashboard ─── */

function ProgressSnapshot({ summary, hasData }: { summary: DashboardSummary; hasData: boolean }) {
  const lastSession = formatDate(summary.lastSessionAt);
  return (
    <section className="app-brutal-section flex min-h-[190px] flex-col justify-center p-5 md:min-h-[220px] md:p-6 lg:self-center">
      <SectionLabel>Progress snapshot</SectionLabel>
      <div className="mt-4 flex flex-col gap-3">
        <div className="app-brutal-row flex items-center justify-between gap-4 rounded-lg px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">Sequences Completed</span>
          <span className="text-xl font-bold leading-none text-[var(--app-text)]">{hasData ? formatNumber(summary.totalSequences) : "-"}</span>
        </div>
        <div className="app-brutal-row flex items-center justify-between gap-4 rounded-lg px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">Moves Evaluated</span>
          <span className="text-xl font-bold leading-none text-[var(--app-text)]">{hasData ? formatNumber(summary.movesEvaluated) : "-"}</span>
        </div>
        <div className="app-brutal-row flex items-center justify-between gap-4 rounded-lg px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">Last Session</span>
          <span className="text-sm font-bold text-[var(--app-text)]">{summary.lastSessionAt ? lastSession.text : "never"}</span>
        </div>
      </div>
    </section>
  );
}

function MoveClassifications({ classifications }: { classifications: DashboardClassifications | null }) {
  const rows = useMemo(() => {
    if (!classifications) return [];
    return CLASS_ROWS.filter((row) => classifications[row.id] > 0);
  }, [classifications]);

  if (!classifications || rows.length === 0) {
    return (
      <section className="app-brutal-section min-h-[230px] min-w-0 p-5 md:min-h-[275px] md:p-6">
        <SectionLabel>Move classifications</SectionLabel>
        <div className="text-xs leading-6 text-[var(--app-muted)]">
          No classified moves yet. Train a sequence. Stockfish does the rest.
        </div>
      </section>
    );
  }

  const total = rows.reduce((sum, row) => sum + classifications[row.id], 0);
  const displayTotal = Math.max(total, 1);

  return (
    <section className="app-brutal-section min-h-[230px] min-w-0 p-5 md:min-h-[275px] md:p-6">
      <SectionLabel>Move classifications</SectionLabel>
      <div className="mt-2">
        <div className="mb-4 flex h-2 overflow-hidden border border-[var(--app-border-soft)] bg-[var(--app-bg)]">
          {rows.map((row) => {
            const count = classifications[row.id];
            if (count <= 0) return null;
            return (
              <div
                key={row.id}
                style={{ width: `${(count / displayTotal) * 100}%`, background: row.color }}
                title={`${row.label}: ${count}`}
              />
            );
          })}
        </div>
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => {
            const count = classifications[row.id];
            const pct = total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "0.0%";
            return (
              <div key={row.id} className="grid grid-cols-[10px_minmax(0,1fr)_auto_48px] items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: row.color }} />
                <span className="min-w-0 truncate font-medium text-[var(--app-text)]">{row.label}</span>
                <span className="font-bold tabular-nums text-[var(--app-text)]">{formatNumber(count)}</span>
                <span className="text-right font-bold tabular-nums text-[var(--app-text)]">{pct}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Primitives ─── */

function StatusTag({ status, label }: { status: string; label: string }) {
  const colorMap: Record<string, string> = {
    active: "border-[var(--app-class-good)] text-[var(--app-class-good)]",
    review: "border-[var(--app-class-brilliant)] text-[var(--app-class-brilliant)]",
    mastered: "border-[var(--app-muted)] text-[var(--app-muted)]",
    retired: "border-[var(--app-border-soft)] text-[var(--app-muted-soft)]",
  };
  return (
    <span className={["inline-flex min-h-6 items-center border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]", colorMap[status] ?? "border-[var(--app-border)] text-[var(--app-muted)]"].join(" ")}>
      {label}
    </span>
  );
}

function ResultTag({ result }: { result: "pass" | "acceptable" | "fail" | null }) {
  if (!result) return <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--app-muted-soft)]">-</span>;
  const colorMap: Record<string, string> = {
    pass: "text-[var(--app-class-good)]",
    acceptable: "text-[var(--app-class-brilliant)]",
    fail: "text-[var(--app-class-blunder)]",
  };
  return (
    <span className={["text-[10px] font-bold uppercase tracking-[0.1em]", colorMap[result]].join(" ")}>
      {result}
    </span>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={["border border-[var(--app-border)] bg-[var(--app-panel-solid)]", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--app-muted)]">
      <span>{children}</span>
      {right ? <span className="text-right text-[9px] tracking-[0.16em] text-[var(--app-muted-soft)]">{right}</span> : null}
    </div>
  );
}

function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="app-brutal-section-soft flex min-h-24 flex-col justify-between p-4">
      <div className="app-brutal-label">{label}</div>
      <div className="min-w-0 pt-4">
        <div className="min-w-0 truncate text-[24px] font-bold leading-none text-[var(--app-text)]">{value}</div>
        {sub ? <div className={["mt-2 truncate text-[11px] leading-none", toneClass(tone)].join(" ")}>{sub}</div> : null}
      </div>
    </div>
  );
}

function QueueTile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="app-brutal-section-soft min-h-20 p-4">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--app-muted)]">{label}</div>
      <div className={[
        "text-[28px] font-bold leading-none",
        value > 0
          ? accent
            ? "text-[var(--app-accent)]"
            : "text-[var(--app-text)]"
          : "text-[var(--app-muted-soft)]",
      ].join(" ")}>
        {formatNumber(value)}
      </div>
    </div>
  );
}

/* ─── Formatters ─── */

function formatNumber(value: number) {
  return value.toString();
}

function signed(value: number | null) {
  if (value == null) return "-";
  if (value === 0) return "+0";
  return value > 0 ? `+${value}` : String(value);
}

function formatDate(value: string | null, includeDaysAgo = false) {
  if (!value) return { text: "-", daysAgo: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { text: "-", daysAgo: null };
  const text = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!includeDaysAgo) return { text, daysAgo: null };
  const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  return { text, daysAgo };
}

function formatDaysAgo(daysAgo: number) {
  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  return `${daysAgo}d ago`;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toneClass(tone?: "up" | "down") {
  if (tone === "up") return "text-[var(--app-class-good)]";
  if (tone === "down") return "text-[var(--app-class-blunder)]";
  return "text-[var(--app-muted)]";
}

function deltaClass(delta: number | null) {
  if (delta == null || delta === 0) return "text-[var(--app-muted)]";
  return delta > 0 ? "text-[var(--app-class-good)]" : "text-[var(--app-class-blunder)]";
}
