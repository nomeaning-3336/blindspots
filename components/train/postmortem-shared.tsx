"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { BoardMove } from "@/components/chess/analysis-board";
import {
  isRecommendableClassification,
  type MoveClassification,
} from "@/lib/move-classification";
import { getEvalBarFill, formatPostmortemEvalLabel } from "@/lib/training/postmortem-terminal-display";
import {
  classificationColor,
  classificationIcon,
  classificationLabel,
  engineLineContinuationSan,
} from "@/lib/training-board-ui";

export type EngineLineResult = {
  cp: number;
  mate?: number | null;
  depth: number;
  rank: number;
  bestMove: string;
  bestSan: string;
  pv: string[];
  pvSan: string[];
  continuationSan?: string[];
  classification?: MoveClassification;
  source?: "multipv" | "candidate";
};

export function EngineLinesSection({
  lines,
  isLoading,
  hasError = false,
  emptyMessageOverride,
  revealBadLines = false,
  hoveredDestinationSquare,
  hoveredIndex,
  onHoverLine,
  onSelectLine,
  selectedMoveUci,
}: {
  lines: EngineLineResult[];
  isLoading: boolean;
  hasError?: boolean;
  emptyMessageOverride?: string | null;
  revealBadLines?: boolean;
  hoveredDestinationSquare?: string | null;
  hoveredIndex?: number | null;
  onHoverLine?: (index: number | null) => void;
  onSelectLine?: (move: BoardMove) => void;
  selectedMoveUci?: string | null;
}) {
  const emptyMessage = isLoading
    ? "Receiving engine lines..."
    : emptyMessageOverride
      ? emptyMessageOverride
      : hasError
        ? "No engine lines yet."
        : "Engine lines unavailable";
  const displayRows: Array<EngineLineResult | null> = Array.from({ length: 5 }, (_, index) => lines[index] ?? null);

  return (
    <section className="grid gap-[var(--pm-gap)]" aria-live="polite">
      <div className="flex items-center gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted-soft)] min-[1500px]:text-sm">
          Engine lines
        </h2>
      </div>
      <div className={["grid gap-[calc(var(--pm-gap)*0.7)]", isLoading ? "opacity-60" : ""].join(" ")}>
        {displayRows.map((line, index) => {
          if (!line) {
            const shouldShowEmptyMessage = index === 0 && lines.length === 0 && !isLoading;
            return (
              <div
                key={`engine-placeholder-${index}`}
                aria-hidden="true"
                className={[
                  "h-[var(--pm-engine-row-h)] rounded-none border border-dashed border-[var(--app-border-soft)] bg-transparent",
                  shouldShowEmptyMessage
                    ? "flex items-center px-3 text-sm font-bold text-[var(--app-muted-soft)] opacity-100"
                    : "opacity-45",
                ].join(" ")}
              >
                {shouldShowEmptyMessage ? emptyMessage : null}
              </div>
            );
          }

          const lead = line.bestSan || line.bestMove;
          const pv = engineLineContinuationSan(line);
          const cls = line.classification;
          const lineColor = classificationColor(cls);
          const isBlurred = !revealBadLines && !isRecommendableClassification(cls);
          const isHovered =
            hoveredIndex === index ||
            (hoveredDestinationSquare ? line.bestMove.slice(2, 4) === hoveredDestinationSquare : false);
          const isSelectedUserMove = selectedMoveUci ? line.bestMove === selectedMoveUci : false;

          return (
            <div
              key={`${line.rank}-${line.bestMove}-${index}`}
              className="relative h-[var(--pm-engine-row-h)] cursor-pointer overflow-hidden rounded-none border border-[var(--app-border-soft)] py-1 pl-3 pr-3 transition-colors duration-100"
              style={{
                borderLeftColor: lineColor,
                borderLeftWidth: 3,
                background: isHovered ? "color-mix(in srgb, var(--app-accent) 6%, var(--app-surface-subtle))" : undefined,
                filter: isBlurred ? "blur(2px)" : undefined,
                opacity: isBlurred ? 0.48 : undefined,
              }}
              onPointerEnter={() => onHoverLine?.(index)}
              onPointerLeave={() => onHoverLine?.(null)}
              onClick={() => onSelectLine?.({ from: line.bestMove.slice(0, 2), to: line.bestMove.slice(2, 4) })}
            >
              <div className="grid h-full grid-cols-[26px_20px_auto_auto_minmax(0,1fr)_32px] items-center gap-2.5">
                <span className="text-right text-sm font-black leading-none text-[var(--app-text)]">
                  #{index + 1}
                </span>
                {cls ? (
                  <ClassificationBadge classification={cls} />
                ) : (
                  <span className="h-5 w-5" />
                )}
                <span className="text-sm font-black tabular-nums text-[var(--app-text)]">
                  {formatPostmortemEvalLabel(line.cp, line.mate)}
                </span>
                <strong className="min-w-0 truncate text-base font-black leading-none text-[var(--app-text)]">
                  {lead}
                </strong>
                <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                  <span className="min-w-0 truncate text-sm font-bold text-[var(--app-muted-soft)]">
                    {pv}
                  </span>
                  {isSelectedUserMove ? (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--app-accent)]">
                      Your move
                    </span>
                  ) : line.source === "candidate" ? (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--app-muted-soft)]">
                      candidate
                    </span>
                  ) : null}
                </div>
                <span className="justify-self-end text-xs font-bold tabular-nums text-[var(--app-muted-soft)]">
                  {line.depth || 18}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function BoardWithEvalBar({
  evalCp,
  evalMate,
  evalMateCp,
  isLoading,
  orientation,
  children,
}: {
  evalCp?: number;
  evalMate?: number | null;
  evalMateCp?: number | null;
  isLoading: boolean;
  orientation: "white" | "black";
  children: ReactNode;
}) {
  const [lastEval, setLastEval] = useState<{ cp: number | null; mate: number | null; mateCp: number | null }>({
    cp: null,
    mate: null,
    mateCp: null,
  });

  useEffect(() => {
    if (typeof evalCp === "number" || typeof evalMate === "number") {
      setLastEval({
        cp: typeof evalCp === "number" ? evalCp : null,
        mate: typeof evalMate === "number" ? evalMate : null,
        mateCp: typeof evalMateCp === "number" ? evalMateCp : null,
      });
    }
  }, [evalCp, evalMate, evalMateCp]);

  const displayEvalCp = typeof evalCp === "number" ? evalCp : isLoading ? lastEval.cp : null;
  const displayEvalMate = typeof evalMate === "number" ? evalMate : isLoading ? lastEval.mate : null;
  const displayEvalMateCp = typeof evalMateCp === "number" ? evalMateCp : isLoading ? lastEval.mateCp : null;
  const { whitePct, blackPct, decisiveSide } = getEvalBarFill(displayEvalCp, displayEvalMate, displayEvalMateCp);

  const topSide = orientation === "white" ? "black" : "white";
  const bottomSide = orientation === "white" ? "white" : "black";
  const topPct = topSide === "white" ? whitePct : blackPct;
  const bottomPct = bottomSide === "white" ? whitePct : blackPct;

  return (
    <div
      className="relative w-full overflow-visible pl-9"
      data-testid="eval-bar"
      data-white-pct={whitePct}
      data-black-pct={blackPct}
      data-decisive-side={decisiveSide ?? "neutral"}
      data-eval-label={typeof displayEvalCp === "number" || typeof displayEvalMate === "number"
        ? formatPostmortemEvalLabel(displayEvalCp, displayEvalMate)
        : isLoading ? "..." : "--"}
    >
      <div className="pointer-events-none absolute left-0 top-0 h-full w-6 shrink-0">
        <div className="relative h-full overflow-hidden rounded-[4px] border border-[var(--app-border-soft)] bg-black">
          <div
            className={[
              "absolute left-0 right-0 top-0 transition-[height] duration-200",
              topSide === "white" ? "bg-white" : "bg-black",
            ].join(" ")}
            style={{ height: `${topPct}%` }}
          />
          <div
            className={[
              "absolute left-0 right-0 bottom-0 transition-[height] duration-200",
              bottomSide === "white" ? "bg-white" : "bg-black",
            ].join(" ")}
            style={{ height: `${bottomPct}%` }}
          />
          <span
            className={[
              "absolute inset-x-0 top-1 text-center text-[9px] font-bold",
              decisiveSide === "white"
                ? "text-black"
                : decisiveSide === "black"
                  ? "text-white"
                  : topSide === "white" ? "text-black" : "text-white",
            ].join(" ")}
          >
            {typeof displayEvalCp === "number" || typeof displayEvalMate === "number"
              ? formatPostmortemEvalLabel(displayEvalCp, displayEvalMate)
              : isLoading ? "..." : "--"}
          </span>
        </div>
      </div>

      {children}
    </div>
  );
}

export function ClassificationBadge({ classification }: { classification: MoveClassification }) {
  const label = classificationLabel(classification);
  return (
    <span
      className="grid h-5 w-5 shrink-0 place-items-center"
      title={label}
      aria-label={label}
    >
      <img
        src={classificationIcon(classification)}
        alt=""
        className="h-5 w-5"
        draggable={false}
      />
    </span>
  );
}
