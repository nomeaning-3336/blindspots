"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { PositionMistakeMemory, MistakeMoveMemory } from "@/lib/training/mistake-memory";
import {
  classificationColor,
  classificationLabel,
  classificationIcon,
  type MoveClassification,
} from "@/lib/training-board-ui";
import { formatLossLabel } from "@/lib/training/eval-format";

type MistakeMemoryPanelProps = {
  memory: PositionMistakeMemory | null;
  onSelectFailedMove: (uci: string) => void;
  onUpdateNote: (uci: string, text: string) => void;
  onAddBoardSnapshot: (uci: string) => void;
  onHoverFailedMove: (from: string, to: string) => void;
  onHoverEnd: () => void;
  boardFen: string;
  boardOrientation: "white" | "black";
  boardLastMove: { from: string; to: string } | null;
};

export function MistakeMemoryPanel({
  memory,
  onSelectFailedMove,
  onUpdateNote,
  onAddBoardSnapshot,
  onHoverFailedMove,
  onHoverEnd,
  boardFen,
  boardOrientation,
  boardLastMove,
}: MistakeMemoryPanelProps) {
  // ── All hooks — stable between memory=null and memory=non-null ──────
  const selectedMove = useMemo<MistakeMoveMemory | null>(() => {
    if (!memory || !memory.selectedFailedMoveUci) return null;
    return (
      memory.failedMoves.find(
        (m) => m.uci === memory.selectedFailedMoveUci,
      ) ?? null
    );
  }, [memory]);

  const selectedUci = memory?.selectedFailedMoveUci ?? null;

  // Sort failed moves by cpLoss descending (worst first)
  const sortedMoves = useMemo(
    () =>
      memory
        ? [...memory.failedMoves].sort(
            (a, b) => (b.cpLoss ?? 0) - (a.cpLoss ?? 0),
          )
        : [],
    [memory?.failedMoves],
  );

  const [localNote, setLocalNote] = useState("");
  const onUpdateNoteRef = useRef(onUpdateNote);
  onUpdateNoteRef.current = onUpdateNote;
  const selectedUciRef = useRef<string | null>(null);
  const pendingNoteRef = useRef<string | null>(null);

  // When the selected move changes, flush pending note and load new one.
  useEffect(() => {
    const uci = selectedMove?.uci ?? null;
    // Flush pending note for previous selection before switching
    if (selectedUciRef.current && selectedUciRef.current !== uci && pendingNoteRef.current !== null) {
      onUpdateNoteRef.current(selectedUciRef.current, pendingNoteRef.current);
    }
    selectedUciRef.current = uci;
    pendingNoteRef.current = null;
    const textBlock = selectedMove?.notes.find((n) => n.type === "text");
    setLocalNote(textBlock?.type === "text" ? textBlock.text : "");
  }, [selectedMove?.uci, memory?.selectedFailedMoveUci]);

  // Flush pending note on unmount
  useEffect(() => {
    return () => {
      if (selectedUciRef.current && pendingNoteRef.current !== null) {
        onUpdateNoteRef.current(selectedUciRef.current, pendingNoteRef.current);
      }
    };
  }, []);

  function handleNoteChange(text: string) {
    setLocalNote(text);
    const uci = selectedUciRef.current;
    if (!uci) return;
    pendingNoteRef.current = text;
    onUpdateNoteRef.current(uci, text);
  }

  const failedMoveCount = memory?.failedMoves.length ?? 0;

  // ── Empty state ─────────────────────────────────────────────────────
  if (failedMoveCount === 0) {
    return (
      <div className="train-mistake-memory-panel flex flex-col gap-2">
        <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-3">
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
            Mistake Memory
          </h3>
          <p className="text-xs text-[var(--app-muted-soft)]">
            No mistakes recorded for this position yet.
          </p>
        </div>
      </div>
    );
  }

  // ── Main panel ──────────────────────────────────────────────────────
  return (
    <div className="train-mistake-memory-panel flex flex-col gap-2">
      <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)]">
        <h3 className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
          Mistake Memory
        </h3>

        {/* ── Top row: failed moves list ───────────────────────────── */}
        <div className="max-h-32 overflow-y-auto px-1 pb-1">
          {sortedMoves.map((failedMove) => {
            const isSelected = failedMove.uci === selectedUci;
            const cls = failedMove.classification;
            const fromTo = moveFromUci(failedMove.uci);
            return (
              <button
                key={failedMove.uci}
                type="button"
                className={[
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition",
                  isSelected
                    ? "bg-[var(--app-highlight-soft)]"
                    : "hover:bg-[var(--app-surface-hover)]",
                ].join(" ")}
                onClick={() => onSelectFailedMove(failedMove.uci)}
                onPointerEnter={() => {
                  if (fromTo) onHoverFailedMove(fromTo.from, fromTo.to);
                }}
                onPointerLeave={onHoverEnd}
              >
                {cls ? (
                  <img
                    src={classificationIcon(cls as MoveClassification)}
                    alt={classificationLabel(cls as MoveClassification)}
                    className="h-3.5 w-3.5 shrink-0"
                    draggable={false}
                  />
                ) : (
                  <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--app-border-soft)]" />
                )}
                <span
                  className="min-w-0 truncate font-bold tabular-nums"
                  style={{ color: cls ? classificationColor(cls as MoveClassification) : undefined }}
                >
                  {failedMove.san ?? failedMove.uci}
                </span>
                {failedMove.cpLoss != null ? (
                  <span className="shrink-0 tabular-nums text-[var(--app-muted)]">
                    {formatLossLabel(failedMove.cpLoss, failedMove.mateAfter)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bottom row: notes area ─────────────────────────────────── */}
      {selectedMove ? (
        <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)]">
          <div className="grid gap-2 p-3">
            <textarea
              className="min-h-[72px] w-full resize-none rounded-[6px] border border-[var(--app-border)] bg-[var(--app-surface-input)] px-2.5 py-2 text-xs text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)]"
              placeholder="Add a note for this mistake..."
              value={localNote}
              onChange={(e) => handleNoteChange(e.target.value)}
              data-ignore-train-shortcuts="true"
            />
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--app-text)] transition hover:border-[var(--app-accent)]"
              onClick={() => onAddBoardSnapshot(selectedMove.uci)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <rect x="1" y="2" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 1.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Add board snapshot
            </button>

            {selectedMove.notes
              .filter((n) => n.type === "board-snapshot")
              .map((block, i) => {
                if (block.type !== "board-snapshot") return null;
                return (
                  <div
                    key={i}
                    className="rounded-[4px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--app-muted)]">
                        Board snapshot
                      </span>
                      {block.caption ? (
                        <span className="truncate text-[10px] text-[var(--app-muted-soft)]">
                          {block.caption}
                        </span>
                      ) : null}
                    </div>
                    <code className="mt-0.5 block truncate text-[9px] text-[var(--app-muted-soft)]">
                      {block.fen}
                    </code>
                    {block.lastMove ? (
                      <span className="mt-0.5 block text-[9px] text-[var(--app-muted-soft)]">
                        {block.lastMove.from}
                        {block.lastMove.to}
                      </span>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-3">
          <p className="text-[10px] text-[var(--app-muted-soft)]">
            Select a failed move above to add notes.
          </p>
        </div>
      )}
    </div>
  );
}

function moveFromUci(uci: string) {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}
