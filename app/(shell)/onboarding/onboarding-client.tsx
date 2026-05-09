"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PositionThumbnail } from "@/components/position-thumbnail";
import type { OnboardingState } from "@/lib/onboarding-state";

const DEMO_FEN = "r2q1rk1/ppp2ppp/2n1bn2/3pp3/4P1b1/2N1BN2/PPP2PPP/R1BQ1RK1 w - 0 8";

type TourStep = {
  id: string;
  spotlight: "board" | "info" | "postmortem" | "notes" | "mistakes" | "elo" | "filler" | "start";
  headline: string;
  body: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    spotlight: "info",
    headline: "You play here. We learn here.",
    body: "Blindspots does not ask you to import your chess life story. You train directly on generated positions, and your Elo starts calibrating immediately. No ceremony.",
  },
  {
    id: "board",
    spotlight: "board",
    headline: "Sequences, not slot machines.",
    body: "Every training prompt is a short sequence — a few moves, not one. You are not looking for the engine's single best move. You are trying to keep the position intact across multiple decisions.",
  },
  {
    id: "eval",
    spotlight: "board",
    headline: "Eval preservation is the goal.",
    body: "The engine evaluates each position at each ply. The goal is to minimize cp loss — not to find a brilliant trick. A \"good\" move is often just the one that doesn't crack your position.",
  },
  {
    id: "postmortem",
    spotlight: "postmortem",
    headline: "After the sequence: postmortem.",
    body: "Once you finish, Blindspots shows you what held, what cracked, and why. Every move is classified. You can see where the eval swung and which decision was the pivot point.",
  },
  {
    id: "notes",
    spotlight: "notes",
    headline: "Notes on moves that will betray you.",
    body: "You can attach a short note to any move — a reminder of what you were thinking, what pattern you missed, or why your gut was lying to you. Notes are for the little traps your future self will absolutely pretend to remember.",
  },
  {
    id: "mistakes",
    spotlight: "mistakes",
    headline: "Failed moves come back. That's the point.",
    body: "If a move quietly wrecks your position, we tag it, bottle it, and serve it back to you later as an active mistake. Due active mistakes return before filler positions — so you keep working on your own material.",
  },
  {
    id: "elo",
    spotlight: "elo",
    headline: "Your Elo starts as a guess.",
    body: "Blindspots Elo is calibrated from your completed sequences, not from external games. The board starts snitching immediately. The number will stabilize once you have enough sessions for the algorithm to trust itself.",
  },
  {
    id: "start",
    spotlight: "start",
    headline: "The board is waiting.",
    body: "Generated positions keep the engine running until your own mistakes become the good stuff. Your first sequence is ready. The only thing left to do is play.",
  },
];

interface OnboardingClientProps {
  userId: string;
  initialState: OnboardingState;
}

export default function OnboardingClient({ userId, initialState }: OnboardingClientProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  const step = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;
  const isCompleted = initialState.trainingOnboardingCompleted;

  const handleNext = useCallback(() => {
    if (isLastStep) {
      completeAndGo();
    } else {
      setStepIndex((s) => s + 1);
    }
  }, [isLastStep]);

  const handlePrev = useCallback(() => {
    setStepIndex((s) => Math.max(0, s - 1));
  }, []);

  const handleSkip = useCallback(() => {
    void completeAndGo();
  }, []);

  async function completeAndGo() {
    setIsCompleting(true);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      if (!res.ok) throw new Error("Failed to complete onboarding");
      router.push("/train");
      router.refresh();
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
      setIsCompleting(false);
    }
  }

  function spotlightClass(spotlightOf: TourStep["spotlight"]) {
    const active = step.spotlight === spotlightOf;
    return active ? "" : "opacity-30";
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden px-4 py-6">
      <div className="app-brutal-section flex w-full max-w-[900px] flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--app-muted)]">
            {isCompleted ? "Replay onboarding" : "Welcome to Blindspots"}
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--app-muted)]">
            {stepIndex + 1} / {TOUR_STEPS.length}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full overflow-hidden border border-[var(--app-border-soft)]">
          <div
            className="h-full bg-[var(--app-accent)] transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        {/* Main content area */}
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-center">
          {/* Left: mock training frame */}
          <div className={["relative transition-opacity duration-200", spotlightClass("board")].join(" ")}>
            <div className="app-brutal-board-frame overflow-hidden" style={{ width: "100%", aspectRatio: "1" }}>
              <PositionThumbnail fen={DEMO_FEN} size={400} />
            </div>

            {/* Overlay badges for different spotlight states */}
            {step.spotlight === "board" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="app-brutal-card-strong px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                  Play sequence
                </div>
              </div>
            )}
            {step.spotlight === "postmortem" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                <div className="app-brutal-card-strong px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                  Postmortem
                </div>
              </div>
            )}
            {step.spotlight === "notes" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                <div className="app-brutal-card-strong px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                  Move notes
                </div>
              </div>
            )}
            {step.spotlight === "mistakes" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                <div className="app-brutal-card-strong px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                  Active mistakes
                </div>
              </div>
            )}
            {step.spotlight === "elo" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                <div className="app-brutal-card-strong px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                  Elo calibration
                </div>
              </div>
            )}
            {step.spotlight === "start" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="app-brutal-button px-6 py-3 text-sm font-bold uppercase tracking-widest">
                  Start training
                </div>
              </div>
            )}
          </div>

          {/* Right: info panel */}
          <div className={["flex flex-col gap-4 transition-opacity duration-200", spotlightClass("info")].join(" ")}>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--app-muted)]">
              {step.id}
            </div>
            <h2 className="text-2xl font-bold leading-tight text-[var(--app-text)]">
              {step.headline}
            </h2>
            <p className="text-sm leading-7 text-[var(--app-muted)]">{step.body}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrev}
            disabled={stepIndex === 0}
            className={[
              "app-brutal-button min-h-11 px-5 text-xs",
              stepIndex === 0 ? "opacity-30 cursor-not-allowed" : "",
            ].join(" ")}
          >
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              disabled={isCompleting || isCompleted}
              className="min-h-11 border border-[var(--app-border)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--app-muted)] transition hover:border-[var(--app-accent)] hover:text-[var(--app-text)] disabled:opacity-30"
            >
              {isCompleted ? "Completed" : "Skip tour"}
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={isCompleting}
              className="app-brutal-button min-h-11 px-6 text-xs disabled:opacity-50"
            >
              {isCompleting
                ? "Finishing..."
                : isLastStep
                  ? "Start training"
                  : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}