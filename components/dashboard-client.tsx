"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import type { DashboardClassifications, DashboardPosition, DashboardSummary, EloHistoryPoint } from "@/lib/dashboard";
import { buildLastMoveBadge, classificationColor, type MoveClassification } from "@/lib/training-board-ui";
import { ReplayThumbnail, type ThumbnailMovePreview } from "@/components/position-thumbnail";
import { DAILY_TARGET_OPTIONS } from "@/lib/training/training-preferences";


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

function DailyGoalSection({
  summary,
  hasData,
}: {
  summary: DashboardSummary;
  hasData: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReducedMotion) {
      setMounted(true);
      return;
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, [prefersReducedMotion]);

  const target = summary.dailyTargetPositions;
  const completed = summary.dailyCompletedToday;
  const remaining = Math.max(0, target - completed);
  const progressPercent = Math.min(100, Math.max(0, (completed / target) * 100));

  const targetLevel = DAILY_TARGET_OPTIONS.find(
    (o) => o.positions === target,
  )?.label ?? `${target}/day`;

  return (
    <section className="app-brutal-section p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--app-muted)]">
            Today&apos;s training
          </h2>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-black tabular-nums text-[var(--app-text)]">
              {completed}
              <span className="text-lg font-bold text-[var(--app-muted)]"> / {target}</span>
            </span>
            <span className="text-sm font-medium text-[var(--app-muted)]">
              positions complete
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--app-muted-soft)]">
            {targetLevel} goal{remaining > 0 ? ` · ${remaining} remaining` : " · complete!"}
          </div>
        </div>

        {hasData && (
          <Link
            href="/train"
            className="app-brutal-button inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm"
          >
            Continue training
          </Link>
        )}
      </div>

      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[var(--app-bg-2)]">
        <div
          className="h-full rounded-full bg-[var(--app-accent)] transition-[width] duration-700 ease-out"
          style={{ width: mounted ? `${progressPercent}%` : "0%" }}
        />
      </div>
    </section>
  );
}

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
      <DailyGoalSection summary={summary} hasData={hasData} />

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
        className="group inline-flex min-h-10 items-center gap-3 rounded-none border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-4 py-2 shadow-[3px_3px_0_var(--app-brutal-edge)] transition hover:border-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
      >
        <span className="text-xs font-black uppercase tracking-[0.22em] text-[var(--app-muted)] group-hover:text-[var(--app-text)]">
          Queue types
        </span>
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center border border-[var(--app-border-strong)] text-[11px] font-black leading-none text-[var(--app-muted)] group-hover:border-[var(--app-accent)] group-hover:text-[var(--app-accent)]"
        >
          ?
        </span>
      </button>
      {open ? (
        <div
          ref={tooltipRef}
          role="tooltip"
          id={id}
          className="fixed z-[90] w-[500px] max-w-[calc(100vw-32px)] border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-5 py-4 text-xs leading-5 shadow-[4px_4px_0_var(--app-brutal-edge)]"
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
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

  if (p.status === "deleted") return null;
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
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());

  // Single global ticker for all countdowns
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Bucket counts from filtered personal positions, excluding locally-deleted ids
  const bucketCounts = useMemo(() => {
    const counts: Record<QueueBucket, number> = { dueNow: 0, new: 0, learning: 0, mastered: 0, retired: 0 };
    for (const p of positions) {
      if (deletedIds.has(p.id)) continue;
      const bucket = queueBucketForPosition(p, nowMs);
      if (bucket) counts[bucket]++;
    }
    return counts;
  }, [positions, nowMs, deletedIds]);

  // Filtered positions for selected bucket, excluding locally-deleted ids
  const filteredPositions = useMemo(() => {
    if (!selectedBucket) return [];
    return positions.filter((p) => !deletedIds.has(p.id) && queueBucketForPosition(p, nowMs) === selectedBucket);
  }, [positions, selectedBucket, nowMs, deletedIds]);

  const toggleBucket = (bucket: QueueBucket) => {
    setSelectedBucket((prev) => (prev === bucket ? null : bucket));
  };

  const hasItems = (bucket: QueueBucket) => bucketCounts[bucket] > 0;

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
              onClick={() => hasItems(def.bucket) && toggleBucket(def.bucket)}
              className={[
                "app-brutal-row relative rounded-lg p-4 text-left transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]",
                !hasItems(def.bucket) && !isSelected ? "cursor-default opacity-55" : "",
                isSelected ? "border-[var(--app-accent)] ring-1 ring-[var(--app-accent)]" : hasItems(def.bucket) ? "cursor-pointer hover:border-[var(--app-border-strong)]" : "",
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
                <QueuePositionRow
                  key={pos.id}
                  position={pos}
                  nowMs={nowMs}
                  onDelete={(id) =>
                    setDeletedIds((prev) => {
                      const next = new Set(prev);
                      next.add(id);
                      return next;
                    })
                  }
                />
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
  dueNow: "Positions ready for review.",
  learning: "Positions you are currently learning, but that are not due for review yet.",
  new: "Unattempted positions, either sampled from your own mistakes or generated as random training material.",
  mastered: "Positions from Learning that you played acceptably 3 times in a row without serious mistakes.",
  retired: "Mastered positions that you played correctly at least 7 times. These are archived and no longer served.",
};

/* ─── Queue Position Row ─── */

/* ─── Queue position display helpers ─── */

function getFenTurnSide(fen: string): "white" | "black" {
  const parts = fen.trim().split(/\s+/);
  return parts[1] === "b" ? "black" : "white";
}

function buildNoteMovePreview(
  fenBefore: string,
  moveUci: string | null | undefined,
  classification: string | null | undefined,
): ThumbnailMovePreview | null {
  if (!moveUci || moveUci.length < 4) return null;

  const from = moveUci.slice(0, 2);
  const to = moveUci.slice(2, 4);
  const promotion = moveUci.length > 4 ? moveUci.slice(4, 5) : undefined;

  try {
    const chess = new Chess(fenBefore);
    const move = chess.move({ from, to, promotion });
    if (!move) return null;

    return {
      fenBefore,
      fenAfter: chess.fen(),
      move: { from, to },
      badge: classificationBadgeFor(classification),
    };
  } catch {
    return null;
  }
}

function parseMoveInputForFen(fen: string, input: string): { uci: string; san: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try SAN first
  try {
    const chess = new Chess(fen);
    const move = chess.move(trimmed);
    if (move) {
      return {
        uci: move.from + move.to + (move.promotion ?? ""),
        san: move.san,
      };
    }
  } catch {
    // SAN parse failed — fall through to UCI
  }

  // Try UCI (4 or 5 chars: from(2) + to(2) + optional promotion(1))
  if (trimmed.length === 4 || trimmed.length === 5) {
    const lower = trimmed.toLowerCase();
    try {
      const chess = new Chess(fen);
      const move = chess.move({
        from: lower.slice(0, 2),
        to: lower.slice(2, 4),
        promotion: trimmed.length === 5 ? lower[4] : undefined,
      });
      if (move) {
        return {
          uci: lower,
          san: move.san,
        };
      }
    } catch {
      // UCI parse failed
    }
  }

  return null;
}

function classificationBadgeFor(classification: string | null | undefined) {
  if (!classification) return null;
  const normalized = classification.toLowerCase();
  if (!(normalized in CLASS_COLORS)) return null;
  return buildLastMoveBadge(normalized as MoveClassification);
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
  onDelete,
}: {
  position: DashboardPosition;
  nowMs: number;
  onDelete: (id: string) => void;
}) {
  const [noteMovePreview, setNoteMovePreview] = useState<ThumbnailMovePreview | null>(null);
  const noteHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const NOTE_HOVER_DELAY_MS = 100;
  const [notes, setNotes] = useState(position.moveNotes);
  const [editingMoveKey, setEditingMoveKey] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState<string>("");
  const [savingNote, setSavingNote] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newMoveInput, setNewMoveInput] = useState("");
  const [newNoteText, setNewNoteText] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionStage, setDeletionStage] = useState<"idle" | "success" | "collapsing">("idle");
  const [isUndoingDelete, setIsUndoingDelete] = useState(false);
  const [deleteUndo, setDeleteUndo] = useState<{
    status: string;
    nextReviewAt: string | null;
    retiredAt: string | null;
  } | null>(null);
  const deleteCollapseTimerRef = useRef<number | null>(null);
  const deleteRemoveTimerRef = useRef<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  function clearDeleteTimers() {
    if (deleteCollapseTimerRef.current) {
      window.clearTimeout(deleteCollapseTimerRef.current);
      deleteCollapseTimerRef.current = null;
    }
    if (deleteRemoveTimerRef.current) {
      window.clearTimeout(deleteRemoveTimerRef.current);
      deleteRemoveTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => { clearDeleteTimers(); };
  }, []);

  if (deletionStage === "success" || deletionStage === "collapsing") {
    const collapsing = deletionStage === "collapsing";
    return (
      <div
        className={[
          "overflow-hidden transition-[max-height,opacity] duration-300 ease-out",
          collapsing ? "max-h-0 opacity-0" : "max-h-40 opacity-100",
        ].join(" ")}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col gap-4 rounded-lg border border-[color-mix(in_srgb,var(--app-class-good)_40%,transparent)] bg-[var(--app-panel-solid)] p-5 text-[var(--app-class-good)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 10 L9 14 L15 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-black uppercase tracking-[0.14em]">
              Position successfully deleted
            </span>
          </div>

          <button
            type="button"
            onClick={undoDelete}
            disabled={isUndoingDelete || collapsing}
            className="inline-flex min-h-10 items-center justify-center border border-[var(--app-class-good)] bg-transparent px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--app-class-good)] transition hover:bg-[var(--app-class-good)] hover:text-[var(--app-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUndoingDelete ? "Undoing..." : "Undo"}
          </button>
        </div>
      </div>
    );
  }

  const DELETE_SKIP_KEY = "blindspots:skipDeleteConfirmation";

  function openDeleteFlow() {
    if (isDeleting) return;
    let skip = false;
    try {
      skip = window.localStorage.getItem(DELETE_SKIP_KEY) === "true";
    } catch {
      skip = false;
    }
    if (skip) {
      void performDelete();
    } else {
      setModalOpen(true);
    }
  }

  function closeModal() {
    setModalVisible(false);
    window.setTimeout(() => {
      setModalOpen(false);
      setDontShowAgain(false);
    }, 180);
  }

  async function confirmDelete() {
    if (dontShowAgain) {
      try {
        window.localStorage.setItem(DELETE_SKIP_KEY, "true");
      } catch {
        // localStorage unavailable — proceed without persistence
      }
    }
    await performDelete();
    closeModal();
  }

  async function performDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/dashboard/mistakes/${encodeURIComponent(position.id)}/delete`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Delete failed: ${res.status}`);
      }
      const payload = await res.json().catch(() => null);
      setDeleteUndo(payload?.undo ?? {
        status: position.status,
        nextReviewAt: position.nextReviewAt,
        retiredAt: null,
      });
      setDeletionStage("success");

      clearDeleteTimers();
      deleteCollapseTimerRef.current = window.setTimeout(() => {
        setDeletionStage("collapsing");
      }, 8000);

      deleteRemoveTimerRef.current = window.setTimeout(() => {
        onDelete(position.id);
      }, 8300);
    } catch (err) {
      console.error("[dashboard] failed to delete position", err);
      window.alert("Could not delete this position. Try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function undoDelete() {
    if (isUndoingDelete || !deleteUndo) return;

    clearDeleteTimers();
    setIsUndoingDelete(true);

    try {
      const res = await fetch(`/api/dashboard/mistakes/${encodeURIComponent(position.id)}/undo-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(deleteUndo),
      });

      if (!res.ok) {
        throw new Error(`Undo failed: ${res.status}`);
      }

      setDeletionStage("idle");
      setDeleteUndo(null);
    } catch (err) {
      console.error("[dashboard] failed to undo delete position", err);
      window.alert("Could not undo delete. Try refreshing the dashboard.");
      deleteCollapseTimerRef.current = window.setTimeout(() => {
        setDeletionStage("collapsing");
      }, 8000);
      deleteRemoveTimerRef.current = window.setTimeout(() => {
        onDelete(position.id);
      }, 8300);
    } finally {
      setIsUndoingDelete(false);
    }
  }

  function startEditNote(moveKey: string, currentText: string) {
    setAdding(false);
    setAddError(null);
    setEditingMoveKey(moveKey);
    setEditingNoteText(currentText);
  }

  function cancelEditNote() {
    setEditingMoveKey(null);
    setEditingNoteText("");
  }

  async function saveEditedNote() {
    if (!editingMoveKey || savingNote) return;
    const target = notes.find((n) => n.moveKey === editingMoveKey);
    if (!target) return;

    setSavingNote(true);
    try {
      const res = await fetch("/api/dashboard/notes/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionFen: position.startingFen,
          moveUci: target.moveUci,
          noteText: editingNoteText,
        }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const savedText = editingNoteText;
      setNotes((prev) =>
        prev.map((n) => (n.moveKey === editingMoveKey ? { ...n, note: savedText } : n)),
      );
      cancelEditNote();
    } catch (err) {
      console.error("[dashboard] failed to save note edit", err);
      window.alert("Could not save the note. Try again.");
    } finally {
      setSavingNote(false);
    }
  }

  function openAddComposer() {
    cancelEditNote();
    setAdding(true);
    setNewMoveInput("");
    setNewNoteText("");
    setAddError(null);
  }

  function closeAddComposer() {
    setAdding(false);
    setNewMoveInput("");
    setNewNoteText("");
    setAddError(null);
  }

  async function saveNewNote() {
    if (savingNote) return;
    setAddError(null);

    const parsed = parseMoveInputForFen(position.startingFen, newMoveInput);
    if (!parsed) {
      setAddError("Invalid move. Use SAN (e.g. Nxg3) or UCI (e.g. g4g3).");
      return;
    }
    if (!newNoteText.trim()) {
      setAddError("Note text is required.");
      return;
    }

    setSavingNote(true);
    try {
      const res = await fetch("/api/dashboard/notes/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionFen: position.startingFen,
          moveUci: parsed.uci,
          noteText: newNoteText,
        }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const body = (await res.json().catch(() => null)) as { moveKey?: string } | null;
      const moveKey = body?.moveKey ?? "";

      setNotes((prev) => {
        const existingIdx = prev.findIndex((n) => n.moveKey === moveKey);
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], note: newNoteText };
          return next;
        }
        return [
          {
            moveKey,
            moveUci: parsed.uci,
            moveSan: parsed.san,
            classification: null,
            evalBeforeCp: null,
            evalAfterCp: null,
            note: newNoteText,
            moverColor: null,
          } as (typeof prev)[number],
          ...prev,
        ];
      });

      closeAddComposer();
    } catch (err) {
      console.error("[dashboard] failed to save new note", err);
      setAddError("Save failed. Try again.");
    } finally {
      setSavingNote(false);
    }
  }

  const showDelete = !position.id.startsWith("session:") && position.sourceType !== "training_session";
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
    <div className="grid gap-2">
      {showDelete && (
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={openDeleteFlow}
            disabled={isDeleting}
            aria-label="Delete position"
            className="group/del relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel-solid)] text-[var(--app-muted)] shadow-[2px_2px_0_var(--app-brutal-shadow)] transition-[width,color,border-color,background-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:w-32 hover:border-[var(--app-class-blunder)] hover:text-[var(--app-class-blunder)] focus-visible:w-32 focus-visible:border-[var(--app-class-blunder)] focus-visible:text-[var(--app-class-blunder)] focus-visible:outline-none disabled:opacity-50"
        >
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-150 ease-out group-hover/del:opacity-0 group-focus-visible/del:opacity-0">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2 L12 12 M12 2 L2 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap text-[11px] font-black uppercase tracking-[0.14em] opacity-0 transition-opacity delay-75 duration-150 ease-out group-hover/del:opacity-100 group-focus-visible/del:opacity-100">
            Delete
          </span>
        </button>
        </div>
      )}
      <div className="app-brutal-row relative grid grid-cols-1 gap-4 rounded-lg border border-[var(--app-border)] p-5 md:grid-cols-[380px_24px_1px_24px_minmax(340px,max-content)_16px_1px_16px_minmax(280px,1fr)] md:gap-0 md:items-stretch">
      {/* Thumbnail column */}
      <div className="flex flex-col items-center gap-2">
        <ReplayThumbnail
          previousFen={position.previousFen}
          finalFen={position.startingFen}
          playedMove={position.playedMoveUci}
          movePreview={noteMovePreview}
          orientation={userOrientation}
          size={360}
        />
        <span className="text-xs font-medium text-[var(--app-muted)]">
          {sideLabel}
        </span>
      </div>

      {/* Separator 1 */}
      <div className="hidden md:block" aria-hidden="true" />
      <div className="hidden md:block w-px bg-[var(--app-border)]" aria-hidden="true" />
      <div className="hidden md:block" aria-hidden="true" />

      {/* Content column */}
      <div className="flex min-w-0 flex-col justify-start py-2">
        {/* Title row */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="min-w-0 text-xl font-black leading-tight tracking-[-0.03em] text-[var(--app-text)]">
            {queuePositionTitle(position)}
          </h3>
          <StatusTag status={position.status} label={position.statusLabel} />
        </div>

        {/* Eval + attempt summary */}
        <div className="text-base font-medium leading-6 text-[var(--app-muted)]">
          {evalDisplay != null && <span className="text-[var(--app-text)] font-bold">Eval {evalDisplay}</span>}
          {evalDisplay != null && <span className="mx-2 text-[var(--app-border-soft)]">·</span>}
          <span>{attemptLabel}</span>
          {hasResult && (
            <>
              <span className="mx-2 text-[var(--app-border-soft)]">·</span>
              <span className={`${lastAttemptClass(position)} font-bold`}>{lastResultText}</span>
            </>
          )}
        </div>

        {/* Progress dots (non-due, attempted, not mastered/retired) */}
        {!isOverdue && position.attempts > 0 && position.status !== "mastered" && position.status !== "retired" && (
          <div className="mt-2 text-base font-medium text-[var(--app-muted)]">
            <span className="text-lg leading-none">
              {Array.from({ length: 3 }, (_, i) => (
                <span key={i} className={i < streak ? "text-[var(--app-accent)]" : "text-[var(--app-muted-soft)]"}>
                  {i < streak ? "●" : "○"}{i < 2 ? " " : ""}
                </span>
              ))}
            </span>
            <span className="ml-2">{streak} of 3 to graduate</span>
          </div>
        )}

        {/* Due now status */}
        {isOverdue && (
          <div className="mt-2 text-base text-[var(--app-muted)]">
            Due now
          </div>
        )}

        {/* Next review (future only) */}
        {!isOverdue && (
          <div className="mt-2 text-base text-[var(--app-muted)]">
            {formatReviewAbsolute(position.nextReviewAt)}
            {countdown && (
              <span className="tabular-nums font-semibold text-[var(--app-text)]"> · in {countdown}</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/train?mistakeId=${encodeURIComponent(position.id)}`}
            className="app-brutal-button inline-flex min-h-12 min-w-0 items-center justify-center px-4 py-2.5 text-sm"
          >
            {position.attempts > 0 ? "Retry" : "Start"}
          </Link>
          <Link
            href={`/train?mistakeId=${encodeURIComponent(position.id)}&mode=postmortem`}
            className="app-brutal-button-secondary inline-flex min-h-12 min-w-0 items-center justify-center px-6 py-3 text-sm"
          >
            Analyze
          </Link>
        </div>
      </div>

      {/* Separator 2 */}
      <div className="hidden md:block" aria-hidden="true" />
      <div className="hidden md:block w-px bg-[var(--app-border)]" aria-hidden="true" />
      <div className="hidden md:block" aria-hidden="true" />

      {/* Notes column */}
      <div className="min-w-0 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xl font-black leading-tight tracking-[-0.03em] text-[var(--app-text)]">
            Notes
          </h3>
          <button
            type="button"
            onClick={() => (adding ? closeAddComposer() : openAddComposer())}
            aria-label={adding ? "Close add-note form" : "Add note"}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--app-border)] bg-[var(--app-panel-solid)] text-[var(--app-muted)] transition-colors hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] focus-visible:border-[var(--app-accent)] focus-visible:text-[var(--app-accent)] focus-visible:outline-none"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              {adding ? (
                <path d="M2 2 L12 12 M12 2 L2 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M7 2 L7 12 M2 7 L12 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {adding && (
          <div className="mt-3 grid gap-2 rounded-md border border-[var(--app-accent)] bg-[var(--app-panel-deep)] p-3">
            <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
              Move
              <input
                type="text"
                value={newMoveInput}
                onChange={(e) => setNewMoveInput(e.target.value)}
                placeholder="e.g. Nxg3 or g4g3"
                className="rounded border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-[var(--app-text)] focus-visible:border-[var(--app-accent)] focus-visible:outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
              Note
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                rows={3}
                className="rounded border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-2 py-1.5 text-sm font-normal normal-case tracking-normal leading-5 text-[var(--app-text)] focus-visible:border-[var(--app-accent)] focus-visible:outline-none"
              />
            </label>
            {addError && (
              <div className="text-xs text-[var(--app-class-blunder)]">{addError}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAddComposer}
                disabled={savingNote}
                className="app-brutal-button-secondary inline-flex min-h-9 items-center justify-center px-3 py-1.5 text-xs disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNewNote}
                disabled={savingNote}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--app-brutal-edge)] bg-[var(--app-class-good)] px-3 py-1.5 text-xs font-black uppercase tracking-[0.06em] text-[#050505] shadow-[2px_2px_0_var(--app-brutal-shadow)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_var(--app-brutal-shadow)] disabled:opacity-60"
              >
                {savingNote ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        {notes.length === 0 ? (
          <div className="mt-2 text-sm text-[var(--app-muted)]">N/A</div>
        ) : (
          <div className="mt-3 grid gap-2">
            {notes.map((note) => {
              const evalDeltaCp =
                note.evalBeforeCp != null && note.evalAfterCp != null
                  ? note.evalAfterCp - note.evalBeforeCp
                  : null;
              const isMoverImprovement =
                evalDeltaCp == null
                  ? null
                  : note.moverColor === "black"
                    ? evalDeltaCp < 0
                    : evalDeltaCp > 0;

              return (
                <div
                  key={note.moveKey}
                  tabIndex={0}
                  onPointerEnter={() => {
                    if (noteHoverTimerRef.current) clearTimeout(noteHoverTimerRef.current);
                    const preview = buildNoteMovePreview(position.startingFen, note.moveUci, note.classification);
                    noteHoverTimerRef.current = setTimeout(() => setNoteMovePreview(preview), NOTE_HOVER_DELAY_MS);
                  }}
                  onPointerLeave={() => {
                    if (noteHoverTimerRef.current) clearTimeout(noteHoverTimerRef.current);
                    setNoteMovePreview(null);
                  }}
                  onFocus={() => {
                    if (noteHoverTimerRef.current) clearTimeout(noteHoverTimerRef.current);
                    const preview = buildNoteMovePreview(position.startingFen, note.moveUci, note.classification);
                    noteHoverTimerRef.current = setTimeout(() => setNoteMovePreview(preview), NOTE_HOVER_DELAY_MS);
                  }}
                  onBlur={() => {
                    if (noteHoverTimerRef.current) clearTimeout(noteHoverTimerRef.current);
                    setNoteMovePreview(null);
                  }}
                  className="relative grid gap-1 border border-[var(--app-border)] bg-[var(--app-panel-deep)] px-3 py-2 pr-9 transition-colors hover:border-[var(--app-accent)] focus-visible:border-[var(--app-accent)] focus-visible:outline-none"
                >
                  {editingMoveKey !== note.moveKey && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditNote(note.moveKey, note.note);
                      }}
                      aria-label="Edit note"
                      className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded text-[var(--app-muted)] transition-colors hover:text-[var(--app-accent)] focus-visible:text-[var(--app-accent)] focus-visible:outline-none"
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M9 2 L12 5 L5 12 L2 12 L2 9 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
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
                        <span className={isMoverImprovement ? "text-[var(--app-class-good)]" : "text-[var(--app-class-blunder)]"}>
                          Δ {formatEvalCp(evalDeltaCp)}
                        </span>
                      )}
                    </div>
                  )}

                  {editingMoveKey === note.moveKey ? (
                    <>
                      <textarea
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelEditNote();
                          }
                        }}
                        rows={3}
                        autoFocus
                        className="font-sans text-sm leading-5 text-[var(--app-text)] rounded border border-[var(--app-accent)] bg-[var(--app-panel-solid)] px-2 py-1.5 focus-visible:outline-none"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void saveEditedNote();
                        }}
                        disabled={savingNote}
                        aria-label="Save note"
                        className="absolute right-2 bottom-2 z-10 flex h-6 w-6 items-center justify-center rounded bg-[var(--app-class-good)] text-[#050505] shadow-[2px_2px_0_var(--app-brutal-shadow)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_var(--app-brutal-shadow)] focus-visible:outline-none disabled:opacity-60"
                      >
                        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                          <path d="M3 7 L6 10 L11 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <p className="font-sans text-sm leading-5 text-[var(--app-text)]">
                      {note.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {modalOpen && (
        <DeleteConfirmationModal
          visible={modalVisible}
          setVisible={setModalVisible}
          isDeleting={isDeleting}
          dontShowAgain={dontShowAgain}
          setDontShowAgain={setDontShowAgain}
          onCancel={closeModal}
          onConfirm={confirmDelete}
        />
      )}
      </div>
    </div>
  );
}

function DeleteConfirmationModal({
  visible,
  setVisible,
  isDeleting,
  dontShowAgain,
  setDontShowAgain,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  setVisible: (v: boolean) => void;
  isDeleting: boolean;
  dontShowAgain: boolean;
  setDontShowAgain: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [setVisible]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className={[
        "fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 transition-opacity duration-200 ease-out",
        visible ? "opacity-100" : "opacity-0",
      ].join(" ")}
    >
      <div
        className={[
          "app-brutal-section w-full max-w-md p-6 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.96]",
        ].join(" ")}
      >
        <h2
          id="delete-modal-title"
          className="text-lg font-black uppercase tracking-[-0.01em] text-[var(--app-text)]"
        >
          Are you sure you want to delete this position?
        </h2>
        <p className="mt-2 text-sm text-[var(--app-muted)]">
          It will be removed from your training queue.
        </p>

        <label className="mt-5 inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--app-muted)] hover:text-[var(--app-text)]">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[var(--app-accent)]"
          />
          Don&apos;t show this warning again
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="app-brutal-button-secondary inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--app-brutal-edge)] bg-[var(--app-class-blunder)] px-5 py-2.5 text-sm font-black uppercase tracking-[0.04em] text-white shadow-[3px_3px_0_var(--app-brutal-shadow)] transition-transform duration-150 ease-out hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_var(--app-brutal-shadow)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[0_0_0_var(--app-brutal-shadow)] disabled:opacity-60"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
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
  const guides = Array.from(new Set(
    Array.from({ length: guideCount }, (_, i) =>
      Math.round(maxElo - (range * i) / (guideCount - 1)),
    ),
  ));

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
        {guides.map((g, i) => {
          const gy = py + ((maxElo - g) / range) * vSpace;
          return (
            <line key={`grid-${i}-${g}`} x1={px} y1={gy} x2={width - px} y2={gy} stroke="var(--app-border-soft)" strokeWidth="1" />
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
    <span className={["inline-flex min-h-7 items-center border px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em]", colorMap[status] ?? "border-[var(--app-border)] text-[var(--app-muted)]"].join(" ")}>
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
