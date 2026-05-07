"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { PositionMistakeMemory, MistakeMoveMemory } from "@/lib/training/mistake-memory";
import {
  classificationColor,
  classificationLabel,
  classificationIcon,
  type MoveClassification,
} from "@/lib/training-board-ui";
import { formatLossLabel } from "@/lib/training/eval-format";

type MistakeMemoryPanelProps = {
  /** The current position's mistake memory (null if no failed moves). */
  memory: PositionMistakeMemory | null;
  /** Called when the user selects a failed move by UCI. */
  onSelectFailedMove: (uci: string) => void;
  /** Called when the user types a note. Debounced, so fired after the user stops typing. */
  onUpdateNote: (uci: string, text: string) => void;
  /** Called when the user clicks "Add board snapshot". */
  onAddBoardSnapshot: (uci: string) => void;
  /** Called on pointer enter for a failed move row — highlight the board. */
  onHoverFailedMove: (from: string, to: string) => void;
  /** Called on pointer leave from a failed move row. */
  onHoverEnd: () => void;
  /** Current board FEN (for snapshot). */
  boardFen: string;
  /** Current board orientation. */
  boardOrientation: "white" | "black";
  /** Current board lastMove (for snapshot). */
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
  const selectedMove = useMemo<MistakeMoveMemory | null>(() => {
    if (!memory || !memory.selectedFailedMoveUci) return null;
    return (
      memory.failedMoves.find(
        (m) => m.uci === memory.selectedFailedMoveUci,
      ) ?? null
    );
  }, [memory]);

  const selectedUci = memory?.selectedFailedMoveUci ?? null;

  // ── Text notes with local debounce ──────────────────────────────────
  const [localNote, setLocalNote] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedUciRef = useRef<string | null>(null);

  // When the selected move changes, load its text note into local state.
  useEffect(() => {
    if (!selectedMove) {
      setLocalNote("");
      return;
    }
    selectedUciRef.current = selectedMove.uci;
    const textBlock = selectedMove.notes.find((n) => n.type === "text");
    setLocalNote(textBlock?.type === "text" ? textBlock.text : "");
  }, [selectedMove?.uci, memory?.selectedFailedMoveUci]);

  const handleNoteChange = useCallback(
    (text: string) => {
      setLocalNote(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const uci = selectedUciRef.current;
        if (uci) {
          onUpdateNote(uci, text);
        }
      }, 400);
    },
    [onUpdateNote],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Nothing to show ─────────────────────────────────────────────────
  if (!memory || memory.failedMoves.length === 0) {
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

  // Sort failed moves by cpLoss descending (worst first)
  const sortedMoves = useMemo(
    () =>
      [...memory.failedMoves].sort(
        (a, b) => (b.cpLoss ?? 0) - (a.cpLoss ?? 0),
      ),
    [memory.failedMoves],
  );

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
                {/* Classification badge */}
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
                {/* Move SAN */}
                <span
                  className="min-w-0 truncate font-bold tabular-nums"
                  style={{ color: cls ? classificationColor(cls as MoveClassification) : undefined }}
                >
                  {failedMove.san ?? failedMove.uci}
                </span>
                {/* CP loss */}
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
                <rect
                  x="1"
                  y="2"
                  width="10"
                  height="8"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" />
                <path
                  d="M4 1.5h4"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              Add board snapshot
            </button>

            {/* Render existing snapshot blocks */}
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
