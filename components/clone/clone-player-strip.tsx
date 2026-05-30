"use client";

interface ClonePlayerStripProps {
  cloneUsername: string;
  cloneColor: "white" | "black";
  thinking: boolean;
}

export function ClonePlayerStrip({
  cloneUsername,
  cloneColor,
  thinking,
}: ClonePlayerStripProps) {
  return (
    <div className="bs-kit-player-strip flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-3 w-3 rounded-full ${
            cloneColor === "white"
              ? "bg-white border border-[var(--app-border)]"
              : "bg-[var(--app-text)]"
          }`}
        />
        <span className="text-sm font-medium text-[var(--app-text)]">
          {cloneUsername}
        </span>
        {thinking && (
          <span className="text-sm text-[var(--app-muted)]">
            (Thinking…)
          </span>
        )}
      </div>
    </div>
  );
}
