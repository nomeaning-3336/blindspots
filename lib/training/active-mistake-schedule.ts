/**
 * Pure scheduling helpers for active app-training mistakes.
 * No Supabase / path-alias imports so the module can be loaded by createRequire.
 */

export type ActiveMistakeOutcome = "pass" | "acceptable" | "fail";

const DAY_MS = 24 * 60 * 60 * 1000;

function passDelayMs(streak: number) {
  if (streak >= 2) return 7 * DAY_MS;
  if (streak >= 1) return 3 * DAY_MS;
  return DAY_MS;
}

/**
 * Simple reschedule for active app-training mistakes.
 *
 *   failure   → 10 minutes, streak resets to 0
 *   0 correct → 1 day
 *   1 correct → 3 days
 *   2+ correct → 7 days
 *   acceptable → half of pass delay (minimum 10 minutes)
 */
export function getNextReviewAtForActiveMistake(input: {
  outcome: ActiveMistakeOutcome;
  consecutiveCorrectCountBefore: number;
  now?: Date;
}): Date {
  const nowMs = (input.now ?? new Date()).getTime();

  if (input.outcome === "fail") {
    return new Date(nowMs + 10 * 60 * 1000);
  }

  const passMs = passDelayMs(input.consecutiveCorrectCountBefore);

  if (input.outcome === "acceptable") {
    return new Date(nowMs + Math.max(10 * 60 * 1000, Math.round(passMs / 2)));
  }

  return new Date(nowMs + passMs);
}

/**
 * Compute the next consecutive correct count for an active mistake attempt.
 */
export function nextConsecutiveCorrectCount(
  outcome: ActiveMistakeOutcome,
  previous: number,
): number {
  if (outcome === "pass") return previous + 1;
  if (outcome === "acceptable") return previous;
  return 0;
}
