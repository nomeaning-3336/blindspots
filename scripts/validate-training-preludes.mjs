import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { Chess } from "chess.js";

const DATASETS = [
  "training_tactic_positions.json",
  "training_opening_positions.json",
  "training_endgame_positions.json",
  "elite_positions.json",
];

const GENERATED_DATASETS = [
  "generated-training/generated_training_opening_positions.json",
  "generated-training/generated_training_middlegame_positions.json",
  "generated-training/generated_training_endgame_positions.json",
];

const includeGenerated =
  process.argv.includes("--include-generated") ||
  process.argv.includes("--all");

const MAX_FAILURES = 20;
const strict = process.argv.includes("--strict");

const datasetsToValidate = [...DATASETS];

if (includeGenerated) {
  datasetsToValidate.push(...GENERATED_DATASETS);
} else {
  // Auto-include generated datasets if they exist
  for (const filename of GENERATED_DATASETS) {
    try {
      await stat(resolve(process.cwd(), "public", filename));
      datasetsToValidate.push(filename);
      console.log(`Including generated dataset: ${filename}`);
    } catch {
      // file does not exist, skip
    }
  }
}

const summaries = [];
const failures = [];

for (const filename of datasetsToValidate) {
  const rows = await readDataset(filename);
  const summary = {
    filename,
    total: rows.length,
    validPrelude: 0,
    missingPrelude: 0,
    illegalPrelude: 0,
    staleCastlingRights: 0,
    staleEnPassant: 0,
    invalidFen: 0,
    fenMismatch: 0,
  };

  rows.forEach((row, index) => {
    const result = validateRow(row);
    if (result.ok) {
      summary.validPrelude += 1;
      return;
    }

    if (result.reason === "missing_previous_fen" || result.reason === "missing_played_move" || result.reason === "missing_fen") {
      summary.missingPrelude += 1;
    } else if (result.reason === "stale_castling_rights") {
      summary.staleCastlingRights += 1;
    } else if (result.reason === "stale_en_passant") {
      summary.staleEnPassant += 1;
    } else if (result.reason === "invalid_previous_fen") {
      summary.invalidFen += 1;
    } else if (result.reason === "fen_mismatch") {
      summary.fenMismatch += 1;
    } else {
      summary.illegalPrelude += 1;
    }

    if (failures.length < MAX_FAILURES) {
      failures.push({
        filename,
        index,
        id: rowId(row, index),
        ...result,
      });
    }
  });

  summaries.push(summary);
}

for (const summary of summaries) {
  console.log(`${summary.filename}:`);
  console.log(`  total: ${summary.total}`);
  console.log(`  validPrelude: ${summary.validPrelude}`);
  console.log(`  missingPrelude: ${summary.missingPrelude}`);
  console.log(`  illegalPrelude: ${summary.illegalPrelude}`);
  console.log(`  staleCastlingRights: ${summary.staleCastlingRights}`);
  if (summary.invalidFen) console.log(`  invalidPreviousFen: ${summary.invalidFen}`);
  if (summary.fenMismatch) console.log(`  fenMismatch: ${summary.fenMismatch}`);
  if (summary.staleEnPassant) console.log(`  staleEnPassant: ${summary.staleEnPassant}`);
}

if (failures.length) {
  console.log("");
  console.log(`Failures (up to ${MAX_FAILURES}):`);
  for (const failure of failures) {
    console.log(`- ${failure.filename} row=${failure.index} id=${failure.id}`);
    console.log(`  reason: ${failure.reason}`);
    console.log(`  fen: ${failure.fen ?? "(missing)"}`);
    console.log(`  previousFen: ${failure.previousFen ?? "(missing)"}`);
    console.log(`  playedMove: ${failure.playedMove ?? "(missing)"}`);
    if (failure.reachedFen) {
      console.log(`  reachedFen: ${failure.reachedFen}`);
    }
    if (typeof failure.boardPlacementMatches === "boolean") {
      console.log(
        `  comparison: board=${failure.boardPlacementMatches} side=${failure.sideToMoveMatches} castling=${failure.castlingRightsMatch} enPassant=${failure.enPassantMatch}`,
      );
    }
  }
}

const invalidCount = summaries.reduce(
  (count, summary) =>
    count +
    summary.missingPrelude +
    summary.illegalPrelude +
    summary.staleCastlingRights +
    summary.staleEnPassant +
    summary.invalidFen +
    summary.fenMismatch,
  0,
);

if (strict && invalidCount > 0) {
  process.exitCode = 1;
}

async function readDataset(filename) {
  const path = resolve(process.cwd(), "public", filename);
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function rowId(row, index) {
  if (typeof row?.id === "string" || typeof row?.id === "number") return String(row.id);
  if (typeof row?.game_id === "string" || typeof row?.game_id === "number") return String(row.game_id);
  if (typeof row?.gameId === "string" || typeof row?.gameId === "number") return String(row.gameId);
  return String(index);
}

function validateRow(row) {
  const fen = normalizeString(row?.fen);
  const previousFen = normalizeString(row?.previousFen) ?? normalizeString(row?.previous_fen);
  const playedMove = normalizeString(row?.playedMove) ?? normalizeString(row?.played_move);

  if (!fen) return { ok: false, reason: "missing_fen", fen, previousFen, playedMove };
  if (!previousFen) return { ok: false, reason: "missing_previous_fen", fen, previousFen, playedMove };
  if (!playedMove) return { ok: false, reason: "missing_played_move", fen, previousFen, playedMove };

  let chess;
  try {
    chess = new Chess(previousFen);
  } catch {
    return { ok: false, reason: "invalid_previous_fen", fen, previousFen, playedMove };
  }

  try {
    const move = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(playedMove)
      ? chess.move({
          from: playedMove.slice(0, 2),
          to: playedMove.slice(2, 4),
          promotion: playedMove[4],
        })
      : chess.move(playedMove);

    if (!move) {
      return { ok: false, reason: "illegal_played_move", fen, previousFen, playedMove };
    }
  } catch {
    return { ok: false, reason: "illegal_played_move", fen, previousFen, playedMove };
  }

  const reachedFen = chess.fen();
  const comparison = compareFenFields(reachedFen, fen);
  if (
    comparison.boardPlacementMatches &&
    comparison.sideToMoveMatches &&
    comparison.castlingRightsMatch &&
    comparison.enPassantMatch
  ) {
    return { ok: true, fen, previousFen, playedMove, reachedFen, ...comparison };
  }
  if (
    comparison.boardPlacementMatches &&
    comparison.sideToMoveMatches &&
    !comparison.castlingRightsMatch &&
    comparison.enPassantMatch
  ) {
    return { ok: false, reason: "stale_castling_rights", fen, previousFen, playedMove, reachedFen, ...comparison };
  }
  if (
    comparison.boardPlacementMatches &&
    comparison.sideToMoveMatches &&
    comparison.castlingRightsMatch &&
    !comparison.enPassantMatch
  ) {
    return { ok: false, reason: "stale_en_passant", fen, previousFen, playedMove, reachedFen, ...comparison };
  }
  return { ok: false, reason: "fen_mismatch", fen, previousFen, playedMove, reachedFen, ...comparison };
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compareFenFields(leftFen, rightFen) {
  const left = splitFenFields(leftFen);
  const right = splitFenFields(rightFen);
  return {
    boardPlacementMatches: left[0] === right[0],
    sideToMoveMatches: left[1] === right[1],
    castlingRightsMatch: left[2] === right[2],
    enPassantMatch: left[3] === right[3],
  };
}

function splitFenFields(fen) {
  const parts = String(fen).split(/\s+/);
  return [
    parts[0] ?? "",
    parts[1] ?? "",
    parts[2] ?? "",
    parts[3] ?? "",
  ];
}
