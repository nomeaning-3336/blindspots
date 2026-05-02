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

export function nextIntervalDays(input: {
  currentIntervalDays: number;
  outcome: TrainingOutcome;
}): number {
  const current = Math.max(1, input.currentIntervalDays);
  switch (input.outcome) {
    case "pass":
      return Math.max(1, Math.round(current * 2.5));
    case "acceptable":
      return current;
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
