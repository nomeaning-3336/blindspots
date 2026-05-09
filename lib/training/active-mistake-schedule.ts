/**
 * Pure scheduling helpers for active app-training mistakes.
 * No Supabase / path-alias imports so the module can be loaded by createRequire.
 */

/**
 * Simple reschedule for active app-training mistakes.
 *
 *   failure   → 10 minutes, streak resets to 0
 *   0 correct → 1 day
 *   1 correct → 3 days
 *   2+ correct → 7 days
 */
export function getNextReviewAtForActiveMistake(input: {
  wasCorrect: boolean;
  consecutiveCorrectCountBefore: number;
  now?: Date;
}): Date {
  const nowMs = (input.now ?? new Date()).getTime();

  if (!input.wasCorrect) {
    return new Date(nowMs + 10 * 60 * 1000); // 10 minutes
  }

  const streak = input.consecutiveCorrectCountBefore;
  if (streak >= 2) return new Date(nowMs + 7 * 24 * 60 * 60 * 1000); // 7 days
  if (streak >= 1) return new Date(nowMs + 3 * 24 * 60 * 60 * 1000); // 3 days
  return new Date(nowMs + 1 * 24 * 60 * 60 * 1000); // 1 day
}

/**
 * Compute the next consecutive correct count for an active mistake attempt.
 */
export function nextConsecutiveCorrectCount(
  wasCorrect: boolean,
  previous: number,
): number {
  return wasCorrect ? previous + 1 : 0;
}
