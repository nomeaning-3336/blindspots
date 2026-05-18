"use client";

import { useEffect, useRef, useState } from "react";
import { PositionThumbnail } from "@/components/position-thumbnail";
import { buildMoveKey } from "@/lib/training/mistake-memory";

export type QueuedPositionRow = {
  decisionFen: string;
  ply: number;
  sideToMove: "white" | "black";
  playedUci: string | null;
  playedSan: string | null;
};

export type ExistingNote = {
  moveKey: string;
  moveUci: string;
  moveSan: string | null;
  noteText: string;
};

type MoveNotesPanelProps = {
  rows: QueuedPositionRow[];
  notesByFen: Record<string, ExistingNote[]>;
  onSaveNote: (decisionFen: string, moveUci: string, text: string) => void;
  savedMoveKey?: string | null;
  tourTarget?: string;
  onOpenPosition?: (decisionFen: string) => void;
};

export function MoveNotesPanel({
  rows,
  notesByFen,
  onSaveNote,
  savedMoveKey = null,
  tourTarget,
  onOpenPosition,
}: MoveNotesPanelProps) {
  const [expandedFen, setExpandedFen] = useState<string | null>(null);
  const [draftNoteText, setDraftNoteText] = useState<Record<string, string>>({});

  const draftNoteTextRef = useRef<Record<string, string>>({});
  draftNoteTextRef.current = draftNoteText;

  const pendingKeyRef = useRef<string | null>(null);
  const pendingMoveUciRef = useRef<string | null>(null);
  const pendingTextRef = useRef<string | null>(null);
  const pendingEditedRef = useRef(false);

  // Reset draft when row expands
  useEffect(() => {
    if (expandedFen) {
      const row = rows.find((candidate) => candidate.decisionFen === expandedFen);
      const notes = notesByFen[expandedFen] ?? [];
      const primaryNote =
        notes.find((note) => note.moveUci === row?.playedUci) ?? notes[0];
      setDraftNoteText((prev) => {
        const next = { ...prev };
        next[expandedFen] = prev[expandedFen] ?? primaryNote?.noteText ?? "";
        return next;
      });
    }
  }, [expandedFen, notesByFen, rows]);

  function handleExpand(fen: string) {
    if (expandedFen === fen) {
      // Collapse
      if (pendingKeyRef.current && pendingMoveUciRef.current && pendingTextRef.current !== null && pendingEditedRef.current) {
        onSaveNote(pendingKeyRef.current, pendingMoveUciRef.current, pendingTextRef.current);
      }
      pendingKeyRef.current = null;
      pendingMoveUciRef.current = null;
      pendingTextRef.current = null;
      pendingEditedRef.current = false;
      setExpandedFen(null);
    } else {
      // Switch — flush previous
      if (pendingKeyRef.current && pendingMoveUciRef.current && pendingTextRef.current !== null && pendingEditedRef.current) {
        onSaveNote(pendingKeyRef.current, pendingMoveUciRef.current, pendingTextRef.current);
      }
      const row = rows.find((candidate) => candidate.decisionFen === fen);
      const notes = notesByFen[fen] ?? [];
      const primaryNote =
        notes.find((note) => note.moveUci === row?.playedUci) ?? notes[0];
      pendingKeyRef.current = fen;
      pendingMoveUciRef.current = null;
      pendingTextRef.current = null;
      pendingEditedRef.current = false;
      setDraftNoteText((prev) => ({ ...prev, [fen]: primaryNote?.noteText ?? "" }));
      setExpandedFen(fen);
    }
  }

  function handleNoteTextChange(fen: string, moveUci: string, text: string) {
    setDraftNoteText((prev) => ({ ...prev, [fen]: text }));
    pendingKeyRef.current = fen;
    pendingMoveUciRef.current = moveUci;
    pendingTextRef.current = text;
    pendingEditedRef.current = true;
    if (moveUci) {
      onSaveNote(fen, moveUci, text);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-3">
          <p className="text-xs text-[var(--app-muted-soft)]">
            No positions from this sequence have been added to the Learning Queue yet.
            Use &quot;Add Position&quot; on the Analysis tab to save one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-tour={tourTarget}>
      {rows.map((row) => {
        const isExpanded = expandedFen === row.decisionFen;
        const notes = notesByFen[row.decisionFen] ?? [];
        const primaryNote =
          notes.find((note) => note.moveUci === row.playedUci) ?? notes[0] ?? null;
        const noteMoveUci = row.playedUci ?? primaryNote?.moveUci ?? "";
        const currentText = draftNoteText[row.decisionFen] ?? primaryNote?.noteText ?? "";
        const currentMoveKey = noteMoveUci ? buildMoveKey(row.decisionFen, noteMoveUci) : null;

        return (
          <div
            key={row.decisionFen}
            className="overflow-hidden rounded-[8px] border border-[var(--app-border-soft)]"
          >
            {/* Row header — always visible */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                onOpenPosition?.(row.decisionFen);
                handleExpand(row.decisionFen);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onOpenPosition?.(row.decisionFen);
                handleExpand(row.decisionFen);
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-[var(--app-surface-hover)]"
            >
              <PositionThumbnail
                fen={row.decisionFen}
                orientation={row.sideToMove === "black" ? "black" : "white"}
                size={48}
                lastMove={row.playedUci ? { from: row.playedUci.slice(0, 2), to: row.playedUci.slice(2, 4) } : null}
              />
              <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-xs font-bold text-[var(--app-text)]">
                  ply {row.ply} · {row.sideToMove === "white" ? "white" : "black"} to move
                  {row.playedSan ? (
                    <span className="ml-1 text-[var(--app-muted)]">· {row.playedSan} played</span>
                  ) : null}
                </span>
                <span
                  className="truncate font-mono text-[10px] text-[var(--app-muted-soft)]"
                  title={row.decisionFen}
                >
                  FEN: {row.decisionFen}
                </span>
              </span>
              <svg
                className={[
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  isExpanded ? "rotate-180" : "",
                ].join(" ")}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            {/* Expanded editor */}
            {isExpanded ? (
              <div className="border-t border-[var(--app-border-soft)] bg-[var(--app-surface-subtle)] p-3">
                <div className="mb-2">
                  <textarea
                    className="min-h-[120px] w-full resize-y rounded-[6px] border border-[var(--app-border)] bg-[var(--app-surface-input)] px-2.5 py-2 text-xs text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)]"
                    placeholder="Add notes for this position..."
                    value={currentText}
                    onChange={(e) => handleNoteTextChange(row.decisionFen, noteMoveUci, e.target.value)}
                    data-ignore-train-shortcuts="true"
                  />
                </div>

                {/* Save indicator */}
                {savedMoveKey && currentMoveKey && savedMoveKey === currentMoveKey ? (
                  <div className="text-xs font-bold text-[var(--app-class-good)]">
                    Note saved ✓
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
