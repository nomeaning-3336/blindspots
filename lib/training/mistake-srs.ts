import type { ReviewGradingConfig } from "@/lib/training/training-preferences";

export type TrainingOutcome = "pass" | "acceptable" | "fail";

export function classifyTrainingOutcome(input: {
  averageCpLoss: number;
  maxSingleCpLoss: number;
}): TrainingOutcome {
  if (input.averageCpLoss >= 150) return "fail";
  if (input.maxSingleCpLoss > 300) return "fail";
  if (input.averageCpLoss >= 50) return "acceptable";
  return "pass";
}

export function classifyReviewedMoveOutcome(input: {
  cpLoss: number;
  config: ReviewGradingConfig;
}): TrainingOutcome {
  const cpLoss = Math.max(0, Math.round(input.cpLoss));
  const passCpLossMax = Math.max(0, Math.round(input.config.passCpLossMax));
  const failCpLossMin = Math.max(passCpLossMax + 1, Math.round(input.config.failCpLossMin));

  if (cpLoss <= passCpLossMax) return "pass";
  if (cpLoss > failCpLossMin) return "fail";
  return "acceptable";
}

export function nextIntervalDays(input: {
  currentIntervalDays: number;
  outcome: TrainingOutcome;
}): number {
  const current = Math.max(1, input.currentIntervalDays);
  const passInterval = Math.max(1, Math.round(current * 2.5));

  switch (input.outcome) {
    case "pass":
      return passInterval;
    case "acceptable":
      return Math.max(1, Math.round(passInterval / 2));
    case "fail":
      return 1;
  }
}

export function shouldMasterMistake(input: {
  intervalDays: number;
  outcome: TrainingOutcome;
}): boolean {
  return input.outcome === "pass" && input.intervalDays >= 60;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
