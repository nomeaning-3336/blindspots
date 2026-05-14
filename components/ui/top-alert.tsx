"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TopAlertKind = "success" | "error" | "info" | "warning";

export type TopAlertMessage = {
  id: string;
  kind?: TopAlertKind;
  title?: string;
  message: string;
  durationMs?: number;
};

type Phase = "entering" | "visible" | "leaving";

function kindColor(k: TopAlertKind): string {
  switch (k) {
    case "success": return "var(--app-class-good)";
    case "error":    return "var(--app-class-blunder)";
    case "info":     return "var(--app-accent)";
    case "warning":  return "var(--app-class-inaccuracy)";
  }
}

function kindRole(k: TopAlertKind): "status" | "alert" {
  return k === "success" || k === "info" ? "status" : "alert";
}

function kindAriaLive(k: TopAlertKind): "polite" | "assertive" {
  return k === "success" || k === "info" ? "polite" : "assertive";
}

export function TopAlertViewport({
  alert,
  onDismiss,
}: {
  alert: TopAlertMessage | null;
  onDismiss: (id: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("entering");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!alert) {
      setPhase("entering");
      return;
    }

    setPhase("entering");
    const raf = requestAnimationFrame(() => {
      setPhase("visible");
    });

    const durationMs = alert.durationMs ?? 2200;
    timerRef.current = setTimeout(() => {
      setPhase("leaving");
      timerRef.current = setTimeout(() => {
        onDismiss(alert.id);
      }, 320);
    }, durationMs);

    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [alert, onDismiss]);

  if (!alert) return null;

  const k = alert.kind ?? "info";

  const phaseClasses = {
    entering: "opacity-0 -translate-y-6",
    visible:  "opacity-100 translate-y-5",
    leaving:  "opacity-0 -translate-y-4",
  };

  return (
    <div
      role={kindRole(k)}
      aria-live={kindAriaLive(k)}
      className={[
        "fixed left-1/2 top-0 z-[1000] w-[min(92vw,420px)] -translate-x-1/2",
        "transition-all duration-300 ease-out",
        phaseClasses[phase],
      ].join(" ")}
      style={{ top: "20px" }}
    >
      <div
        className="flex items-start gap-3 border border-[var(--app-border-strong)] bg-[var(--app-panel-solid)] px-4 py-3 shadow-[2px_2px_0_var(--app-border-strong)]"
        style={{ borderLeftWidth: 4, borderLeftColor: kindColor(k) }}
      >
        {alert.title ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-[var(--app-text)]">{alert.title}</span>
            <span className="text-xs text-[var(--app-muted)]">{alert.message}</span>
          </div>
        ) : (
          <span className="text-sm text-[var(--app-text)]">{alert.message}</span>
        )}
      </div>
    </div>
  );
}

export function useTopAlert() {
  const [alert, setAlert] = useState<TopAlertMessage | null>(null);

  const showAlert = useCallback((input: Omit<TopAlertMessage, "id">) => {
    setAlert({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      kind: input.kind ?? "info",
      title: input.title,
      message: input.message,
      durationMs: input.durationMs ?? 2200,
    });
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlert((current) => current?.id === id ? null : current);
  }, []);

  return { alert, showAlert, dismissAlert };
}
