"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DashboardClassifications, DashboardPosition, DashboardSummary, EloHistoryPoint } from "@/lib/dashboard";
import { classificationColor } from "@/lib/training-board-ui";
import { PositionThumbnail } from "@/components/position-thumbnail";

type DashboardView = "summary" | "history";
type PositionFilter = "all" | "review" | "new" | "learning" | "mastered" | "failed";

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

const FILTER_OPTIONS: Array<{ value: PositionFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "review", label: "Review due" },
  { value: "new", label: "New" },
  { value: "learning", label: "Learning" },
  { value: "mastered", label: "Mastered" },
  { value: "failed", label: "Failed recently" },
];

export function DashboardClient({ summary }: { summary: DashboardSummary }) {
  const [view, setView] = useState<DashboardView>("summary");
  const hasData = summary.totalSequences > 0 || summary.recentSessions.length > 0;

  return (
    <main className="app-paper-shell min-h-[calc(100dvh-64px)] overflow-x-hidden px-4 py-5 md:px-8">
      <div className="mx-auto grid w-full max-w-[1180px] gap-5">
        <section className="app-brutal-section p-5 md:p-6">
          <Hero summary={summary} hasData={hasData} />
          <div className="mt-5 flex justify-center">
            <ViewToggle view={view} setView={setView} />
          </div>
        </section>

        <section className="app-brutal-section p-5 md:p-6">
          {view === "summary" ? (
            <SummaryTab summary={summary} hasData={hasData} />
          ) : (
            <PositionsTab positions={summary.positions} />
          )}
        </section>

        {view === "summary" && (
          <RecentActivitySection
            sessions={summary.recentSessions}
            positions={summary.recentPositions}
          />
        )}
      </div>
    </main>
  );
}

/* ─── Summary Tab ─── */

function SummaryTab({ summary, hasData }: { summary: DashboardSummary; hasData: boolean }) {
  return (
    <div className="grid gap-5">
      <EloSection
        elo={summary.blindspotsElo}
        delta={summary.eloDeltaSession}
        history={summary.eloHistory}
      />
      <QueueSummaryCards summary={summary} />
      <ProgressSnapshot summary={summary} hasData={hasData} />
      <MoveClassifications classifications={summary.classifications} />
    </div>
  );
}

function QueueSummaryCards({ summary }: { summary: DashboardSummary }) {
  const q = summary.queueOverview;
  return (
    <div>
      <SectionLabel>Queue overview</SectionLabel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <QueueTile label="Review due" value={q.reviewDue} accent />
        <QueueTile label="Active" value={q.active} />
        <QueueTile label="Random" value={q.filler} />
        <QueueTile label="Mastered" value={q.mastered} />
        <QueueTile label="Retired" value={q.retired} />
      </div>
    </div>
  );
}

function EloSection({ elo, delta, history }: { elo: number | null; delta: number | null; history: EloHistoryPoint[] }) {
  return (
    <div className="app-brutal-section-soft flex flex-col items-center p-5 md:p-7">
      <div className="w-full"><SectionLabel>Blindspots Elo</SectionLabel></div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="shrink-0">
          <div className="text-[56px] font-bold leading-none text-[var(--app-text)] md:text-[68px]">
            {elo == null ? "-" : formatNumber(elo)}
          </div>
        </div>
        {history.length >= 2 && <EloChart points={history} />}
      </div>
      {history.length < 2 && (
        <p className="mt-3 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--app-muted-soft)]">
          {history.length === 0
            ? "Complete a session to start tracking Elo."
            : "One session recorded. Keep going to see a trend."}
        </p>
      )}
    </div>
  );
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

function RecentActivitySection({
  sessions,
  positions,
}: {
  sessions: DashboardSummary["recentSessions"];
  positions: DashboardPosition[];
}) {
  const hasAnything = sessions.length > 0 || positions.length > 0;

  if (!hasAnything) {
    return (
      <section className="app-brutal-section p-5 md:p-6">
        <SectionLabel>Recent training</SectionLabel>
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <div className="text-sm font-bold text-[var(--app-text)]">No training history yet.</div>
          <p className="max-w-sm text-xs leading-6 text-[var(--app-muted)]">
            Connect a chess profile or start training. The database cannot judge what it has not seen.
          </p>
          <div className="flex gap-2">
            <Link href="/train" className="app-brutal-button inline-flex items-center px-4 py-2 text-xs">
              Start training
            </Link>
            <Link href="/account" className="app-brutal-button inline-flex items-center px-4 py-2 text-xs">
              Connect account
            </Link>
          </div>
        </div>
      </section>
    );
  }

  type ActivityRow = {
    key: string;
    ts: string;
    fen: string;
    title: string;
    subtitle: string;
    outcome: "pass" | "acceptable" | "fail" | null;
    worst: string | null;
    delta: number | null;
    avgCpLoss: number | null;
    moves: number | null;
    statusLabel?: string;
    attempts?: number;
    nextReviewAt?: string | null;
  };

  const rows: ActivityRow[] = sessions.map((s) => ({
    key: s.id,
    ts: s.ts,
    fen: s.startingFen,
    title: s.title,
    subtitle: `${s.moves} move${s.moves !== 1 ? "s" : ""}`,
    outcome: s.outcome,
    worst: s.worst,
    delta: s.delta,
    avgCpLoss: s.avgCpLoss,
    moves: s.moves,
  }));

  const positionRows: ActivityRow[] = positions
    .filter((p) => !p.id.startsWith("session:"))
    .filter((p) => !sessions.some((s) => s.startingFen === p.startingFen && s.ts === p.lastAttemptAt))
    .map((p) => ({
      key: p.id,
      ts: p.lastAttemptAt ?? p.nextReviewAt ?? "",
      fen: p.startingFen,
      title: p.openingName ?? p.sourceLabel,
      subtitle: p.queueLabel ?? p.statusLabel,
      outcome: p.lastResult,
      worst: null,
      delta: null,
      avgCpLoss: p.cpLoss,
      moves: null,
      statusLabel: p.statusLabel,
      attempts: p.attempts,
      nextReviewAt: p.nextReviewAt,
    }));

  const allRows = [...rows, ...positionRows]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 5);

  return (
    <section className="app-brutal-section p-5 md:p-6">
      <SectionLabel right={`${allRows.length} shown`}>Recent training</SectionLabel>
      <div className="grid gap-3">
        {allRows.map((row) => (
          <ActivityCard key={row.key} row={row} />
        ))}
      </div>
    </section>
  );
}

function ActivityCard({ row }: {
  row: {
    fen: string;
    title: string;
    subtitle: string;
    outcome: "pass" | "acceptable" | "fail" | null;
    worst: string | null;
    delta: number | null;
    avgCpLoss: number | null;
    moves: number | null;
    statusLabel?: string;
    attempts?: number;
    nextReviewAt?: string | null;
  };
}) {
  return (
    <div className="app-brutal-row flex flex-col gap-4 rounded-lg p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <div className="shrink-0 self-center sm:self-auto" aria-label={row.title}>
        <PositionThumbnail fen={row.fen} size={144} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-sm font-bold leading-6 text-[var(--app-text)]">{row.title}</span>
          <ResultTag result={row.outcome} />
          {row.statusLabel && <StatusTag status={row.statusLabel === "New" ? "active" : row.statusLabel === "Review due" ? "review" : row.statusLabel === "Mastered" ? "mastered" : "retired"} label={row.statusLabel} />}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs leading-5 text-[var(--app-muted)]">
          <span>{row.subtitle}</span>
          {row.moves != null && <span>{row.moves} moves</span>}
          {row.worst && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5" style={{ background: CLASS_COLORS[row.worst] ?? "var(--app-muted)" }} />
              {row.worst}
            </span>
          )}
          {row.delta != null && (
            <span className={["font-bold", deltaClass(row.delta)].join(" ")}>{signed(row.delta)} Elo</span>
          )}
          {row.avgCpLoss != null && <span>{Math.round(row.avgCpLoss)}cp avg loss</span>}
          {row.attempts != null && row.attempts > 0 && <span>{row.attempts} attempt{row.attempts !== 1 ? "s" : ""}</span>}
          {row.nextReviewAt && <span>Review {formatDate(row.nextReviewAt).text}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/train"
            className="inline-flex min-h-8 items-center border border-[var(--app-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text)] transition hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--app-accent)]"
            title="Retry route not wired yet"
          >
            Retry
          </Link>
          <Link
            href={`/analysis?fen=${encodeURIComponent(row.fen)}`}
            className="inline-flex min-h-8 items-center border border-[var(--app-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text)] transition hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--app-accent)]"
          >
            Analyze
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─── Positions Tab ─── */

function PositionsTab({ positions }: { positions: DashboardPosition[] }) {
  const [filter, setFilter] = useState<PositionFilter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return positions;
    return positions.filter((p) => {
      switch (filter) {
        case "review": return p.status === "review";
        case "new": return p.status === "active";
        case "learning": return p.status === "review" && p.attempts > 0 && p.attempts < 5;
        case "mastered": return p.status === "mastered";
        case "failed": return p.lastResult === "fail";
        default: return true;
      }
    });
  }, [positions, filter]);

  if (!positions.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="text-sm font-bold text-[var(--app-text)]">No archived positions.</div>
        <p className="max-w-sm text-xs leading-6 text-[var(--app-muted)]">
          Complete a training sequence and positions will show up here with their eval trace, result, and review schedule.
        </p>
        <Link href="/train" className="app-brutal-button inline-flex items-center px-4 py-2 text-xs">
          Start training
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <FilterBar filter={filter} setFilter={setFilter} />
      <PositionList positions={filtered} />
    </div>
  );
}

function FilterBar({ filter, setFilter }: { filter: PositionFilter; setFilter: (f: PositionFilter) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setFilter(opt.value)}
          className={[
            "min-h-9 border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition",
            filter === opt.value
              ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
              : "cursor-pointer border-[var(--app-border)] text-[var(--app-muted)] hover:border-[var(--app-accent)] hover:text-[var(--app-text)]",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function PositionList({ positions }: { positions: DashboardPosition[] }) {
  if (!positions.length) {
    return (
      <div className="py-6 text-center text-xs text-[var(--app-muted)]">
        No positions match this filter.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Desktop header */}
      <div className="hidden grid-cols-[8.5rem_minmax(0,1.5fr)_auto_auto_auto_auto_auto] items-center gap-4 border-b border-[var(--app-border-soft)] px-4 pb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-muted)] lg:grid">
        <span>Board</span>
        <span>Source</span>
        <span>Status</span>
        <span>Result</span>
        <span>Attempts</span>
        <span className="text-right">Eval loss</span>
        <span className="text-right">Actions</span>
      </div>
      {positions.map((pos) => (
        <PositionRow key={pos.id} position={pos} />
      ))}
    </div>
  );
}

function PositionRow({ position }: { position: DashboardPosition }) {
  return (
    <div className="app-brutal-row grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-4 py-4 sm:grid-cols-[7.5rem_1fr_auto_auto_auto_auto] sm:gap-4 lg:grid-cols-[8.5rem_minmax(0,1.5fr)_auto_auto_auto_auto_auto]">
      {/* Thumbnail */}
      <div className="hidden sm:block" aria-label={`Position: ${position.sourceLabel}, ${position.statusLabel}`}>
        <PositionThumbnail fen={position.startingFen} size={108} />
      </div>

      {/* Source info */}
      <div className="min-w-0">
        <div className="truncate text-sm font-bold leading-6 text-[var(--app-text)]">
          {position.openingName ?? position.sourceLabel}
        </div>
        <div className="mt-1 text-xs leading-5 text-[var(--app-muted-soft)]">
          {position.sourceLabel}
          {position.queueLabel && (
            <span className="ml-1.5 border-l border-[var(--app-border-soft)] pl-1.5">{position.queueLabel}</span>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="hidden sm:block">
        <StatusTag status={position.status} label={position.statusLabel} />
      </div>

      {/* Result */}
      <div className="hidden sm:block">
        <ResultTag result={position.lastResult} />
      </div>

      {/* Attempts */}
      <div className="hidden text-right text-sm font-bold text-[var(--app-text)] sm:block">
        {position.attempts > 0 ? position.attempts : "-"}
      </div>

      {/* Eval loss */}
      <div className="hidden text-right text-sm sm:block">
        {position.cpLoss != null ? (
          <span className={position.cpLoss > 100 ? "font-bold text-[var(--app-class-blunder)]" : "font-bold text-[var(--app-text)]"}>
            {position.cpLoss}cp
          </span>
        ) : (
          <span className="text-[var(--app-muted-soft)]">-</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <Link
          href="/train"
          className="inline-flex min-h-8 items-center border border-[var(--app-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text)] transition hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--app-accent)]"
          title="Retry route not wired yet"
          aria-label={`Retry position ${position.id}`}
        >
          Retry
        </Link>
        <Link
          href={`/analysis?fen=${encodeURIComponent(position.startingFen)}`}
          className="inline-flex min-h-8 items-center border border-[var(--app-border)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text)] transition hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--app-accent)]"
          aria-label={`Analyze position ${position.id}`}
        >
          Analyze
        </Link>
      </div>
    </div>
  );
}

/* ─── Shared sections from original dashboard ─── */

function Hero({ summary, hasData }: { summary: DashboardSummary; hasData: boolean }) {
  const parts = [
    summary.totalSequences > 0 ? `${formatNumber(summary.totalSequences)} sequences completed` : null,
    summary.queueOverview.reviewDue > 0 ? `${formatNumber(summary.queueOverview.reviewDue)} due for review` : null,
    summary.queueCounts.inProgress > 0 ? `${formatNumber(summary.queueCounts.inProgress)} in progress` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="app-eyebrow mb-3">Dashboard</div>
        <h1 className="max-w-[620px] text-[22px] font-bold leading-tight text-[var(--app-text)] sm:text-[30px]">
          Positions you missed. Positions you reviewed. Positions that still refuse to die.
        </h1>
        <p className="mt-3 max-w-[560px] text-xs leading-6 text-[var(--app-muted)]">
          {hasData
            ? "Review queue, active mistakes, and random positions — all in one place."
            : "No completed sessions yet. Go train. The dashboard is not psychic."}
        </p>
      </div>
      <Link
        href="/train"
        className="app-brutal-button inline-flex min-h-11 items-center justify-center px-5 py-3 text-xs"
      >
        Continue training
      </Link>
    </div>
  );
}

function ProgressSnapshot({ summary, hasData }: { summary: DashboardSummary; hasData: boolean }) {
  return (
    <div>
      <SectionLabel>Progress snapshot</SectionLabel>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <StatTile label="Sequences Completed" value={hasData ? formatNumber(summary.totalSequences) : "-"} />
        <StatTile label="Moves evaluated" value={hasData ? formatNumber(summary.movesEvaluated) : "-"} />
        <StatTile
          label="Last session"
          value={formatDate(summary.lastSessionAt).text}
          sub={(function() {
            const { daysAgo } = formatDate(summary.lastSessionAt, true);
            if (daysAgo == null) return summary.lastSessionAt ? undefined : "never";
            return undefined;
          })()}
        />
      </div>
    </div>
  );
}

function MoveClassifications({ classifications }: { classifications: DashboardClassifications | null }) {
  const rows = useMemo(() => {
    if (!classifications) return [];
    return CLASS_ROWS.filter((row) => row.canonical || classifications[row.id] > 0);
  }, [classifications]);

  if (!classifications) {
    return (
      <div className="min-w-0">
        <SectionLabel>Move classifications</SectionLabel>
        <Panel className="p-4 text-xs leading-6 text-[var(--app-muted)]">
          No classified moves yet. Train a sequence. Stockfish does the rest.
        </Panel>
      </div>
    );
  }

  const total = rows.reduce((sum, row) => sum + classifications[row.id], 0);
  const displayTotal = Math.max(total, 1);
  const rowCount = Math.max(1, Math.ceil(rows.length / 2));

  return (
    <div className="min-w-0">
      <SectionLabel right={`${formatNumber(total)} moves`}>Move classifications</SectionLabel>
      <Panel className="p-4">
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
        <div
          className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-flow-col sm:grid-cols-2"
          style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, auto))` }}
        >
          {rows.map((row) => {
            const count = classifications[row.id];
            const pct = total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "0.0%";
            return (
              <div key={row.id} className="grid grid-cols-[8px_minmax(0,1fr)_auto_44px] items-center gap-2 text-[11px]">
                <span className="h-2 w-2" style={{ background: row.color }} />
                <span className="min-w-0 truncate text-[var(--app-text)]">{row.label}</span>
                <span className="font-bold text-[var(--app-text)]">{formatNumber(count)}</span>
                <span className="text-right font-bold text-[var(--app-text)]">{pct}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ─── Primitives ─── */

function ViewToggle({
  view,
  setView,
}: {
  view: DashboardView;
  setView: (view: DashboardView) => void;
}) {
  return (
    <div className="inline-flex">
      {(["summary", "history"] as const).map((item) => {
        const active = view === item;
        return (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            className={[
              "-ml-px first:ml-0 border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition",
              active
                ? "relative z-10 border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                : "cursor-pointer border-[var(--app-border)] bg-transparent text-[var(--app-muted)] hover:border-[var(--app-accent)] hover:text-[var(--app-text)]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--app-accent)]",
            ].join(" ")}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

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
