"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DashboardClassifications, DashboardSummary } from "@/lib/dashboard";
import { classificationColor } from "@/lib/training-board-ui";

type DashboardView = "summary" | "clusters";

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
  const [view, setView] = useState<DashboardView>("summary");
  const hasData = summary.totalSequences > 0 || summary.recentSessions.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
      <Hero summary={summary} hasData={hasData} />
      <div className="flex justify-center">
        <ViewToggle view={view} setView={setView} />
      </div>
      {view === "summary" ? (
        <>
          <ProgressSnapshot summary={summary} hasData={hasData} />
          <TrainingQueues summary={summary} hasData={hasData} />
          <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
            <MoveClassifications classifications={summary.classifications} />
            <RecentSessions sessions={summary.recentSessions} />
          </div>
        </>
      ) : (
        <Clusters clusters={summary.clusters} />
      )}
    </div>
  );
}

function Hero({ summary, hasData }: { summary: DashboardSummary; hasData: boolean }) {
  const parts = [
    summary.totalSequences > 0 ? `${formatNumber(summary.totalSequences)} sequences completed` : null,
    summary.queueCounts.revisit > 0 ? `${formatNumber(summary.queueCounts.revisit)} due for revisit` : null,
    summary.queueCounts.inProgress > 0 ? `${formatNumber(summary.queueCounts.inProgress)} in progress` : null,
  ].filter(Boolean);

  return (
    <Panel className="p-5 sm:p-7">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="app-eyebrow mb-3">Dashboard</div>
          <h1 className="max-w-[620px] text-[22px] font-bold leading-tight text-[var(--app-text)] sm:text-[30px]">
            Your blindspots are not going to fix themselves.
          </h1>
          <p className="mt-3 max-w-[560px] text-xs leading-6 text-[var(--app-muted)]">
            {hasData
              ? "Pick up where the recommender left off."
              : "No completed sessions yet. Go train. The dashboard is not psychic."}
          </p>
        </div>
        <Link
          href="/train"
          className="inline-flex min-h-11 items-center justify-center border border-[var(--app-accent)] bg-[var(--app-accent)] px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] !text-[var(--app-accent-contrast)] transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
        >
          Continue training
        </Link>
      </div>
      {parts.length > 0 ? (
        <div className="mt-5 border-t border-[var(--app-border-soft)] pt-3 text-[11px] text-[var(--app-muted-soft)]">
          {parts.join(" / ")}
        </div>
      ) : null}
    </Panel>
  );
}

function ProgressSnapshot({ summary, hasData }: { summary: DashboardSummary; hasData: boolean }) {
  return (
    <section>
      <SectionLabel>Progress snapshot</SectionLabel>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label="Sequences" value={hasData ? formatNumber(summary.totalSequences) : "-"} sub={hasData ? "completed" : "no data"} />
        <StatTile label="Moves evaluated" value={hasData ? formatNumber(summary.movesEvaluated) : "-"} sub={hasData ? "Stockfish" : "go train"} />
        <StatTile
          label="Blindspots Elo"
          value={summary.blindspotsElo == null ? "-" : formatNumber(summary.blindspotsElo)}
          sub={summary.eloDeltaSession == null ? undefined : signed(summary.eloDeltaSession)}
          tone={summary.eloDeltaSession == null ? undefined : summary.eloDeltaSession < 0 ? "down" : "up"}
        />
        <StatTile
          label="Last session"
          value={formatDate(summary.lastSessionAt).text}
          sub={(function() {
            const { daysAgo } = formatDate(summary.lastSessionAt, true);
            if (daysAgo == null) return summary.lastSessionAt ? undefined : "never";
            return formatDaysAgo(daysAgo);
          })()}
        />
      </div>
    </section>
  );
}

function TrainingQueues({ summary, hasData }: { summary: DashboardSummary; hasData: boolean }) {
  return (
    <section>
      <SectionLabel>Training queue</SectionLabel>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <QueueTile label="Mastered" value={summary.queueCounts.mastered} hasData={hasData} />
        <QueueTile label="Due for revisit" value={summary.queueCounts.revisit} hasData={hasData} />
        <QueueTile label="Targeted" value={summary.queueCounts.targeted} hasData={hasData} />
        <QueueTile label="In progress" value={summary.queueCounts.inProgress} hasData={hasData} />
      </div>
    </section>
  );
}

function MoveClassifications({ classifications }: { classifications: DashboardClassifications | null }) {
  const rows = useMemo(() => {
    if (!classifications) return [];
    return CLASS_ROWS.filter((row) => row.canonical || classifications[row.id] > 0);
  }, [classifications]);

  if (!classifications) {
    return (
      <section className="min-w-0">
        <SectionLabel>03 / Move classifications</SectionLabel>
        <Panel className="p-4 text-xs leading-6 text-[var(--app-muted)]">
          No classified moves yet. Train a sequence. Stockfish does the rest.
        </Panel>
      </section>
    );
  }

  const total = rows.reduce((sum, row) => sum + classifications[row.id], 0);
  const displayTotal = Math.max(total, 1);
  const rowCount = Math.max(1, Math.ceil(rows.length / 2));

  return (
    <section className="min-w-0">
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
    </section>
  );
}

function RecentSessions({ sessions }: { sessions: DashboardSummary["recentSessions"] }) {
  if (!sessions.length) {
    return (
      <section className="min-w-0">
        <SectionLabel>Recent sessions</SectionLabel>
        <Panel className="p-4 text-xs leading-6 text-[var(--app-muted)]">
          No completed sessions yet. Go train.
        </Panel>
      </section>
    );
  }

  return (
    <section className="min-w-0">
      <SectionLabel>04 / Recent sessions</SectionLabel>
      <Panel>
        {sessions.slice(0, 5).map((session, index) => (
          <div
            key={session.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-b border-[var(--app-border-soft)] px-4 py-3 text-[11px] last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
          >
            <span className="min-w-0 truncate text-[var(--app-text)]">{formatDateTime(session.ts)}</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--app-muted)]">{session.moves} moves</span>
            <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--app-muted)]">
              {session.worst ? (
                <>
                  <span className="h-1.5 w-1.5" style={{ background: CLASS_COLORS[session.worst] ?? "var(--app-muted)" }} />
                  {session.worst}
                </>
              ) : (
                "unclassified"
              )}
            </span>
            <span className={["text-right text-xs font-bold", deltaClass(session.delta)].join(" ")}>
              {signed(session.delta)} Elo
            </span>
          </div>
        ))}
      </Panel>
    </section>
  );
}

function Clusters({ clusters }: { clusters: DashboardSummary["clusters"] }) {
  if (!clusters.length) {
    return (
      <section>
        <SectionLabel right="Sorted by severity">Where you keep losing evaluation</SectionLabel>
        <Panel className="p-4">
          <div className="text-sm text-[var(--app-text)]">No cluster history yet.</div>
          <div className="mt-1 text-xs leading-6 text-[var(--app-muted)]">
            Train more positions and your recurring disasters will organize themselves.
          </div>
        </Panel>
      </section>
    );
  }

  return (
    <section>
      <SectionLabel right="Sorted by severity">Where you keep losing evaluation</SectionLabel>
      <Panel>
        <div className="hidden grid-cols-[minmax(180px,1.3fr)_minmax(120px,1fr)_repeat(6,minmax(58px,0.5fr))] border-b border-[var(--app-border-soft)] px-4 py-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--app-muted)] md:grid">
          <span>Cluster</span>
          <span>Phase / bucket</span>
          <span className="text-right">Tries</span>
          <span className="text-right text-[var(--app-class-brilliant)]">Bril.</span>
          <span className="text-right text-[var(--app-class-critical)]">Crit.</span>
          <span className="text-right text-[var(--app-class-inaccuracy)]">Inacc.</span>
          <span className="text-right text-[var(--app-class-mistake)]">Mist.</span>
          <span className="text-right text-[var(--app-class-blunder)]">Blun.</span>
        </div>
        {clusters.map((cluster) => (
          <div
            key={cluster.id}
            className="grid grid-cols-2 gap-3 border-b border-[var(--app-border-soft)] px-4 py-4 text-xs last:border-b-0 md:grid-cols-[minmax(180px,1.3fr)_minmax(120px,1fr)_repeat(6,minmax(58px,0.5fr))] md:items-center"
          >
            <div className="col-span-2 min-w-0 md:col-span-1">
              <div className="truncate font-bold text-[var(--app-text)]">{cluster.label ?? "General"}</div>
              <div className="mt-1 text-[10px] text-[var(--app-muted-soft)]">{cluster.attempts} attempts</div>
            </div>
            <div className="col-span-2 flex min-w-0 flex-wrap gap-1.5 md:col-span-1">
              <Tag>{cluster.phase ?? "unknown"}</Tag>
              <Tag>{cluster.tag ?? cluster.bucket ?? "unlabeled"}</Tag>
            </div>
            <ClusterNumber label="Tries" value={cluster.attempts} />
            <ClusterNumber label="Bril." value={cluster.brilliant} color="var(--app-class-brilliant)" />
            <ClusterNumber label="Crit." value={cluster.critical} color="var(--app-class-critical)" />
            <ClusterNumber label="Inacc." value={cluster.inaccuracy} color="var(--app-class-inaccuracy)" />
            <ClusterNumber label="Mist." value={cluster.mistake} color="var(--app-class-mistake)" />
            <ClusterNumber label="Blun." value={cluster.blunder} color="var(--app-class-blunder)" />
          </div>
        ))}
      </Panel>
    </section>
  );
}

function ViewToggle({
  view,
  setView,
}: {
  view: DashboardView;
  setView: (view: DashboardView) => void;
}) {
  return (
    <div className="inline-flex">
      {(["summary", "clusters"] as const).map((item) => {
        const active = view === item;
        return (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            className={[
              "-ml-px first:ml-0 border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition",
              active
                ? "relative z-10 border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                : "cursor-pointer border-[var(--app-border)] bg-transparent text-[var(--app-muted)] hover:border-[var(--app-accent)] hover:text-[var(--app-text)]",
            ].join(" ")}
          >
            {item}
          </button>
        );
      })}
    </div>
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
    <Panel className="flex min-h-24 flex-col justify-between p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--app-muted)]">{label}</div>
      <div className="min-w-0 pt-4">
        <div className="min-w-0 truncate text-[24px] font-bold leading-none text-[var(--app-text)]">{value}</div>
        {sub ? <div className={["mt-2 truncate text-[11px] leading-none", toneClass(tone)].join(" ")}>{sub}</div> : null}
      </div>
    </Panel>
  );
}

function QueueTile({ label, value, hasData }: { label: string; value: number; hasData: boolean }) {
  return (
    <Panel className="min-h-20 p-4">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--app-muted)]">{label}</div>
      <div className={["text-[28px] font-bold leading-none", hasData && value > 0 ? "text-[var(--app-text)]" : "text-[var(--app-muted-soft)]"].join(" ")}>
        {hasData ? formatNumber(value) : "-"}
      </div>
    </Panel>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-[var(--app-border-soft)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
      {children}
    </span>
  );
}

function ClusterNumber({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 md:block md:text-right">
      <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--app-muted)] md:hidden">{label}</span>
      <span className="font-bold" style={{ color: value > 0 ? color ?? "var(--app-text)" : "var(--app-muted-soft)" }}>
        {formatNumber(value)}
      </span>
    </div>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
