"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { TrainingPreferences } from "@/lib/training-preferences-store";

const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;

export function AccountTrainingPreferencesForm({
  currentPreferences,
}: {
  currentPreferences: TrainingPreferences;
}) {
  const [sequenceLength, setSequenceLength] = useState(currentPreferences.sequenceLength);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const lastSavedRef = useRef(currentPreferences.sequenceLength);

  useEffect(() => {
    if (sequenceLength === lastSavedRef.current) return;

    const timeoutId = window.setTimeout(() => {
      startTransition(async () => {
        setMessage("");
        const response = await fetch("/api/train/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sequenceLength }),
        });

        if (!response.ok) {
          setMessage("Training settings could not be saved right now.");
          return;
        }

        lastSavedRef.current = sequenceLength;
        setMessage("Training settings saved.");
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [sequenceLength, startTransition]);

  return (
    <div className="mt-6 grid gap-4">
      <section className="app-brutal-inset p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold uppercase tracking-[0.14em] text-[var(--app-text)]">
              Training
            </h3>
          </div>
          <label className="grid gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
              Sequence length
            </span>
            <input
              type="number"
              min={MIN_SEQUENCE_LENGTH}
              max={MAX_SEQUENCE_LENGTH}
              step={1}
              value={sequenceLength}
              className="app-brutal-input h-11 w-24 px-3 text-right font-mono text-sm font-bold tabular-nums text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) return;
                setSequenceLength(
                  Math.max(MIN_SEQUENCE_LENGTH, Math.min(MAX_SEQUENCE_LENGTH, Math.round(parsed))),
                );
              }}
            />
          </label>
        </div>
      </section>
      {(message || isPending) ? (
        <p className="text-sm leading-6 text-[var(--app-muted)]">
          {isPending ? "Saving training settings..." : message}
        </p>
      ) : null}
    </div>
  );
}
