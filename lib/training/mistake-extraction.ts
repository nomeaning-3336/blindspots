/**
 * Extract mineable failed user moves from training sequence evaluations.
 *
 * This module only imports from local .ts files so it can be loaded by
 * Node's --experimental-strip-types runtime for testing.
 */

import { normalizeSetupPrelude } from "./setup-prelude.ts";
import { inferLegalMoveBetweenFens } from "./fen-transition.ts";
import {
  buildMinedMistakeKey,
  isMineableUserMistake,
} from "./mistake-mining.ts";
import type { MineableMove, MineableMoveInput } from "./mistake-mining.ts";

/**
 * Extract mineable failed user moves from a training sequence evaluation.
 *
 * Setup preludes are captured in two ways:
 * 1. Explicit: when evalRow.previousDecisionFen + evalRow.previousMoveUci
 *    are present (e.g. the served-position prelude for the first move).
 *    Validated via normalizeSetupPrelude — invalid data is silently skipped.
 * 2. Inferred: for i > 0, we infer the opponent's move between
 *    fenAfterUserMove[i-1] and decisionFen[i] via inferLegalMoveBetweenFens.
 *
 * Missing preludes are counted but never block mining.
 */
export function extractMineableMistakesFromSequence(
  positionEvaluations: MineableMoveInput[],
): MineableMove[] {
  const result: MineableMove[] = [];

  for (let i = 0; i < positionEvaluations.length; i++) {
    const evalRow = positionEvaluations[i];

    if (!evalRow || typeof evalRow !== "object") continue;

    const decisionFen = evalRow.decisionFen;
    const uci = evalRow.uci;

    if (!decisionFen) continue;
    if (!uci) continue;

    if (!isMineableUserMistake(evalRow.classification)) continue;

    const moveKey = buildMinedMistakeKey(decisionFen, uci);

    let setupPreviousFen: string | null = null;
    let setupPlayedMoveUci: string | null = null;
    let setupPlayedMoveSan: string | null = null;

    // Try explicit prelude first (caller-provided, e.g. initial served position).
    if (evalRow.previousDecisionFen && evalRow.previousMoveUci) {
      const prelude = normalizeSetupPrelude({
        fen: decisionFen,
        previousFen: evalRow.previousDecisionFen,
        playedMove: evalRow.previousMoveUci,
      });
      if (prelude) {
        setupPreviousFen = evalRow.previousDecisionFen;
        setupPlayedMoveUci = evalRow.previousMoveUci;
        setupPlayedMoveSan = evalRow.previousMoveSan ?? null;
      }
    }

    // Fallback to inferred prelude for i > 0 (opponent move between user moves).
    if (!setupPreviousFen && i > 0) {
      const prevRow = positionEvaluations[i - 1];
      if (prevRow?.fenAfterUserMove) {
        const inferred = inferLegalMoveBetweenFens({
          fromFen: prevRow.fenAfterUserMove,
          toFen: decisionFen,
        });
        if (inferred) {
          const prelude = normalizeSetupPrelude({
            fen: decisionFen,
            previousFen: prevRow.fenAfterUserMove,
            playedMove: inferred,
          });
          if (prelude) {
            setupPreviousFen = prevRow.fenAfterUserMove;
            setupPlayedMoveUci = inferred;
            setupPlayedMoveSan = null; // opponent move SAN not available
          }
        }
      }
    }

    result.push({
      moveKey,
      decisionFen,
      uci,
      san: evalRow.san ?? "",
      classification: evalRow.classification ?? "",
      cpLoss: typeof evalRow.cpLoss === "number" ? evalRow.cpLoss : 0,
      evalBefore: typeof evalRow.evalBefore === "number" ? evalRow.evalBefore : 0,
      evalAfter: typeof evalRow.evalAfter === "number" ? evalRow.evalAfter : 0,
      mateBefore: evalRow.mateBefore ?? null,
      mateAfter: evalRow.mateAfter ?? null,
      fenAfterUserMove: evalRow.fenAfterUserMove ?? "",
      setupPreviousFen,
      setupPlayedMoveUci,
      setupPlayedMoveSan,
    });
  }

  return result;
}
