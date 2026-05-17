"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { PositionThumbnail } from "@/components/position-thumbnail";
import { buildMoveKey } from "@/lib/training/mistake-memory";
import type { AnnotatedMove } from "@/lib/training/mistake-memory";

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

function legalMovesFromFen(fen: string): string[] {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    return moves.map((m) => m.from + m.to + (m.promotion ? m.promotion : ""));
  } catch {
    return [];
  }
}

function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const move = chess.move({ from, to, promotion });
    return move ? move.san : "";
  } catch {
    return "";
  }
}

function MoveChip({
  fen,
  uci,
  san,
  currentUci,
  currentText,
  notes,
  onChange,
}: {
  fen: string;
  uci: string;
  san: string;
  currentUci: string;
  currentText: string;
  notes: ExistingNote[];
  onChange: (fen: string, uci: string) => void;
}) {
  const isSelected = currentUci === uci;
  const noteForMove = notes.find((n) => n.moveUci === uci);
  const draftTextForSelectedMove = isSelected ? currentText : noteForMove?.noteText ?? "";
  const hasNote = draftTextForSelectedMove.trim().length > 0;

  return (
    <button
      type="button"
      onClick={() => onChange(fen, uci)}
      className={[
        "relative rounded-[6px] border px-2.5 py-1.5 text-xs font-bold transition",
        isSelected
          ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-text)]"
          : "border-[var(--app-border)] text-[var(--app-muted)] hover:border-[var(--app-border-strong)]",
        hasNote && !isSelected
          ? "ring-1 ring-[var(--app-class-good)] text-[var(--app-text)]"
          : "",
      ].join(" ")}
    >
      {san}
      {hasNote && !isSelected ? (
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--app-class-good)] align-middle"
        />
      ) : null}
    </button>
  );
}

export function MoveNotesPanel({
  rows,
  notesByFen,
  onSaveNote,
  savedMoveKey = null,
  tourTarget,
  onOpenPosition,
}: MoveNotesPanelProps) {
  const [expandedFen, setExpandedFen] = useState<string | null>(null);
  const [draftMoveUci, setDraftMoveUci] = useState<Record<string, string>>({});
  const [draftNoteText, setDraftNoteText] = useState<Record<string, string>>({});

  const draftNoteTextRef = useRef<Record<string, string>>({});
  draftNoteTextRef.current = draftNoteText;

  const pendingKeyRef = useRef<string | null>(null);
  const pendingTextRef = useRef<string | null>(null);
  const pendingEditedRef = useRef(false);

  // Reset draft when row expands
  useEffect(() => {
    if (expandedFen) {
      const notes = notesByFen[expandedFen] ?? [];
      const firstNote = notes[0];
      setDraftMoveUci((prev) => {
        const next = { ...prev };
        next[expandedFen] = prev[expandedFen] ?? firstNote?.moveUci ?? "";
        return next;
      });
      setDraftNoteText((prev) => {
        const next = { ...prev };
        next[expandedFen] = prev[expandedFen] ?? firstNote?.noteText ?? "";
        return next;
      });
    }
  }, [expandedFen, notesByFen]);

  function handleExpand(fen: string) {
    if (expandedFen === fen) {
      // Collapse
      if (pendingKeyRef.current && pendingTextRef.current !== null && pendingEditedRef.current) {
        onSaveNote(pendingKeyRef.current, draftMoveUci[pendingKeyRef.current] ?? "", pendingTextRef.current);
      }
      pendingKeyRef.current = null;
      pendingTextRef.current = null;
      pendingEditedRef.current = false;
      setExpandedFen(null);
    } else {
      // Switch — flush previous
      if (pendingKeyRef.current && pendingTextRef.current !== null && pendingEditedRef.current) {
        onSaveNote(pendingKeyRef.current, draftMoveUci[pendingKeyRef.current] ?? "", pendingTextRef.current);
      }
      const notes = notesByFen[fen] ?? [];
      const firstNote = notes[0];
      pendingKeyRef.current = fen;
      pendingTextRef.current = null;
      pendingEditedRef.current = false;
      setDraftMoveUci((prev) => ({ ...prev, [fen]: firstNote?.moveUci ?? "" }));
      setDraftNoteText((prev) => ({ ...prev, [fen]: firstNote?.noteText ?? "" }));
      setExpandedFen(fen);
    }
  }

  function handleNoteTextChange(fen: string, text: string) {
    setDraftNoteText((prev) => ({ ...prev, [fen]: text }));
    pendingKeyRef.current = fen;
    pendingTextRef.current = text;
    pendingEditedRef.current = true;
    onSaveNote(fen, draftMoveUci[fen] ?? "", text);
  }

  function handleMoveUciChange(fen: string, uci: string) {
    const existingText =
      (notesByFen[fen] ?? []).find((note) => note.moveUci === uci)?.noteText ?? "";

    setDraftMoveUci((prev) => ({ ...prev, [fen]: uci }));
    setDraftNoteText((prev) => ({ ...prev, [fen]: existingText }));

    pendingKeyRef.current = fen;
    pendingTextRef.current = null;
    pendingEditedRef.current = false;
  }

  function handleDelete(moveKey: string) {
    // noop — edit/delete removed
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
        const currentUci = draftMoveUci[row.decisionFen] ?? row.playedUci ?? "";
        const currentText = draftNoteText[row.decisionFen] ?? "";
        const legalMoves = legalMovesFromFen(row.decisionFen);
        const legalMovesValid = currentUci === "" || legalMoves.includes(currentUci);

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
                {/* Actual move input */}
                <div className="mb-3">
                  <div className="flex flex-wrap gap-1.5">
                    {row.playedUci && (
                      <MoveChip
                        fen={row.decisionFen}
                        uci={row.playedUci}
                        san={row.playedSan ?? row.playedUci}
                        currentUci={currentUci}
                        currentText={currentText}
                        notes={notes}
                        onChange={handleMoveUciChange}
                      />
                    )}
                    {legalMoves.map((uci) => {
                      if (uci === row.playedUci) return null;
                      const san = uciToSan(row.decisionFen, uci);
                      return (
                        <MoveChip
                          key={uci}
                          fen={row.decisionFen}
                          uci={uci}
                          san={san}
                          currentUci={currentUci}
                          currentText={currentText}
                          notes={notes}
                          onChange={handleMoveUciChange}
                        />
                      );
                    })}
                  </div>
                  {!legalMovesValid && currentUci !== "" ? (
                    <p className="mt-1 text-[10px] text-[var(--app-class-mistake)]">
                      Not a legal move from this position.
                    </p>
                  ) : null}
                </div>

                {/* Note textarea */}
                <div className="mb-2">
                  <textarea
                    className="min-h-[120px] w-full resize-y rounded-[6px] border border-[var(--app-border)] bg-[var(--app-surface-input)] px-2.5 py-2 text-xs text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)]"
                    placeholder={currentUci ? "Add a note for this move..." : "Select a move to add a note..."}
                    value={currentText}
                    onChange={(e) => handleNoteTextChange(row.decisionFen, e.target.value)}
                    data-ignore-train-shortcuts="true"
                  />
                </div>

                {/* Save indicator */}
                {savedMoveKey && savedMoveKey.startsWith(row.decisionFen) ? (
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
