"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { AnnotatedMove } from "@/lib/training/mistake-memory";
import {
  classificationColor,
  classificationLabel,
  classificationIcon,
  type MoveClassification,
} from "@/lib/training-board-ui";
import { formatLossLabel } from "@/lib/training/eval-format";

export type AnnotatableMoveRow = {
  moveKey: string;
  san: string;
  uci: string;
  from: string | null;
  to: string | null;
  classification?: string;
  cpLoss?: number;
  mateAfter?: number | null;
};

type MoveNotesPanelProps = {
  moves: AnnotatableMoveRow[];
  annotations: Record<string, AnnotatedMove>;
  selectedMoveKey: string | null;
  onSelectMove: (moveKey: string) => void;
  onUpdateNote: (moveKey: string, text: string) => void;
};

export function MoveNotesPanel({
  moves,
  annotations,
  selectedMoveKey,
  onSelectMove,
  onUpdateNote,
}: MoveNotesPanelProps) {
  const [localNote, setLocalNote] = useState("");
  const onUpdateNoteRef = useRef(onUpdateNote);
  onUpdateNoteRef.current = onUpdateNote;
  const selectedKeyRef = useRef<string | null>(null);
  const pendingNoteRef = useRef<string | null>(null);

  // Load note text when selection changes
  useEffect(() => {
    const prevKey = selectedKeyRef.current;
    const newKey = selectedMoveKey;

    // Flush pending note for previous selection before switching
    if (prevKey && prevKey !== newKey && pendingNoteRef.current !== null) {
      onUpdateNoteRef.current(prevKey, pendingNoteRef.current);
    }

    selectedKeyRef.current = newKey;
    pendingNoteRef.current = null;

    const selected = newKey ? annotations[newKey] : null;
    setLocalNote(selected?.noteText ?? "");
  }, [selectedMoveKey, annotations]);

  // Flush pending note on unmount
  useEffect(() => {
    return () => {
      if (selectedKeyRef.current && pendingNoteRef.current !== null) {
        onUpdateNoteRef.current(selectedKeyRef.current, pendingNoteRef.current);
      }
    };
  }, []);

  function handleNoteChange(text: string) {
    setLocalNote(text);
    const key = selectedKeyRef.current;
    if (!key) return;
    pendingNoteRef.current = text;
    onUpdateNoteRef.current(key, text);
  }

  // ── Empty state: no moves to annotate ──────────────────────────
  if (moves.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-3">
          <p className="text-xs text-[var(--app-muted-soft)]">
            No moves to annotate.
          </p>
        </div>
      </div>
    );
  }

  // ── Main panel ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      {/* ── Top row: compact move table ──────────────────────────── */}
      <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)]">
        <div className="grid min-h-8 grid-cols-[1fr_auto] items-center border-b border-[var(--app-border-soft)] px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-muted)]">
          <span>Move</span>
          <span className="text-left">Loss</span>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {moves.map((move) => {
            const isSelected = move.moveKey === selectedMoveKey;
            const cls = move.classification;
            return (
              <button
                key={move.moveKey}
                type="button"
                className={[
                  "grid w-full grid-cols-[1fr_auto] items-center border-b border-[var(--app-border-soft)] px-3 text-left last:border-b-0 min-h-9 text-xs transition",
                  isSelected
                    ? "bg-[var(--app-highlight-soft)]"
                    : "hover:bg-[var(--app-surface-hover)]",
                ].join(" ")}
                onClick={() => onSelectMove(move.moveKey)}
              >
                <span className="flex min-w-0 items-center gap-2 font-bold">
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
                    className="truncate tabular-nums"
                    style={{
                      color: cls
                        ? classificationColor(cls as MoveClassification)
                        : undefined,
                    }}
                  >
                    {move.san}
                  </span>
                </span>
                <span className="overflow-hidden whitespace-nowrap text-left tabular-nums text-[var(--app-muted)]">
                  {move.cpLoss != null
                    ? formatLossLabel(move.cpLoss, move.mateAfter)
                    : "--"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bottom row: notes textarea ───────────────────────────── */}
      {selectedMoveKey ? (
        <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-3">
          <textarea
            className="min-h-[72px] w-full resize-none rounded-[6px] border border-[var(--app-border)] bg-[var(--app-surface-input)] px-2.5 py-2 text-xs text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)]"
            placeholder="Add a note for this move..."
            value={localNote}
            onChange={(e) => handleNoteChange(e.target.value)}
            data-ignore-train-shortcuts="true"
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-3">
          <p className="text-[10px] text-[var(--app-muted-soft)]">
            Select a move above to add notes.
          </p>
        </div>
      )}
    </div>
  );
}
