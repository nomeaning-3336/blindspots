import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname, basename, extname } from "node:path";
import process from "node:process";
import { Chess } from "chess.js";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const HELP = `generate-training-corpus.mjs — Generate training position datasets from game sources.

Usage:
  node scripts/generate-training-corpus.mjs --source <path> [options]

Required:
  --source <path>     Path to game source file (PGN, JSON, NDJSON)

Optional:
  --out <dir>         Output directory (default: public/generated-training)
  --opening <n>       Target opening positions (default: 10000)
  --middlegame <n>    Target middlegame positions (default: 10000)
  --endgame <n>       Target endgame positions (default: 10000)
  --puzzles <n>       Target puzzle positions (default: 0 — disabled)
  --seed <n>          Random seed for shuffling (default: 42)
  --strict            Exit non-zero if any target is not met
  --dry-run           Validate and report without writing files
  --help              Show this help

Accepted source formats:
  - .pgn              Standard PGN with full move history (multi-game supported)
  - .json             JSON array of game objects with a "moves" field
  - .ndjson / .jsonl  Newline-delimited JSON, one game object per line

Game object schema for JSON/NDJSON:
  {
    "moves": "e2e4 e7e5 g1f3 ...",    // required: space-separated UCI moves
    "id": "game_123",                   // optional: game identifier
    "event": "...",                     // optional
    "white": "...",                     // optional
    "black": "...",                     // optional
    "tags": ["blitz", "2200+"]          // optional: tags to attach to rows
  }
`;

function parseArgs() {
  const args = {
    source: null,
    out: resolve(process.cwd(), "public", "generated-training"),
    opening: 10000,
    middlegame: 10000,
    endgame: 10000,
    puzzles: 0,
    seed: 42,
    strict: false,
    dryRun: false,
  };

  const raw = process.argv.slice(2);

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    switch (arg) {
      case "--source": {
        args.source = raw[++i] ?? null;
        break;
      }
      case "--out": {
        args.out = resolve(process.cwd(), raw[++i] ?? args.out);
        break;
      }
      case "--opening": {
        args.opening = parseInt(raw[++i], 10) || 0;
        break;
      }
      case "--middlegame": {
        args.middlegame = parseInt(raw[++i], 10) || 0;
        break;
      }
      case "--endgame": {
        args.endgame = parseInt(raw[++i], 10) || 0;
        break;
      }
      case "--puzzles": {
        args.puzzles = parseInt(raw[++i], 10) || 0;
        break;
      }
      case "--seed": {
        args.seed = parseInt(raw[++i], 10) || 42;
        break;
      }
      case "--strict": {
        args.strict = true;
        break;
      }
      case "--dry-run": {
        args.dryRun = true;
        break;
      }
      case "--help": {
        console.log(HELP);
        process.exit(0);
      }
      default: {
        console.error(`Unknown flag: ${arg}`);
        console.error("Use --help for usage.");
        process.exit(1);
      }
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Source discovery
// ---------------------------------------------------------------------------

const REPO_SOURCE_PATTERNS = [
  "data/source-games.pgn",
  "data/source-games.json",
  "data/source-games.ndjson",
  "data/source-games.jsonl",
  "public/source-games.pgn",
  "public/source-games.json",
  "data/games.pgn",
  "data/games.json",
  "data/games.ndjson",
  "data/lichess-games.pgn",
  "data/lichess-games.json",
  "data/lichess-games.ndjson",
];

async function findRepoSource() {
  for (const pattern of REPO_SOURCE_PATTERNS) {
    const fullPath = resolve(process.cwd(), pattern);
    try {
      await stat(fullPath);
      return fullPath;
    } catch {
      // file does not exist
    }
  }
  return null;
}

function printSourceError() {
  console.error("ERROR: No source game file found.");
  console.error("");
  console.error("The generator requires an authoritative game source with full move history.");
  console.error("Accepted source formats:");
  console.error("  - .pgn       Standard PGN with complete move text");
  console.error("  - .json      JSON array of game objects with a \"moves\" field");
  console.error("  - .ndjson    Newline-delimited JSON, one game object per line");
  console.error("");
  console.error("Provide a source with --source:");
  console.error("  node scripts/generate-training-corpus.mjs --source data/lichess-games.pgn");
  console.error("");
  console.error("Accepted source types:");
  console.error("  - PGN files with full move history");
  console.error("  - JSON/NDJSON game records with legal move lists");
  console.error("  - Lichess puzzle/game source ONLY if it contains original game move history");
  console.error("");
  console.error("Unacceptable sources (will be rejected):");
  console.error("  - FEN-only datasets");
  console.error("  - Puzzle FEN + solution with no previous move history");
  console.error("  - Manually guessed previous positions");
  console.error("  - Positions generated by reversing moves from FEN");
  console.error("");
  console.error("The repo does not currently contain any source game files.");
  console.error("To proceed, obtain a PGN or JSON game file and re-run with --source.");
}

// ---------------------------------------------------------------------------
// PGN parsing
// ---------------------------------------------------------------------------

const EVENT_HEADER_RE = /^\[Event\s+"[^"]*"\]/m;

function splitPgnGames(raw) {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  // Find all game start positions by locating [Event "..." ] headers
  const lines = text.split("\n");
  const gameStarts = [];

  for (let i = 0; i < lines.length; i++) {
    if (EVENT_HEADER_RE.test(lines[i])) {
      gameStarts.push(i);
    }
  }

  if (gameStarts.length === 0) {
    // No event headers — treat as single game
    return [text];
  }

  return gameStarts.map((start, index) => {
    const end = index < gameStarts.length - 1 ? gameStarts[index + 1] : lines.length;
    return lines.slice(start, end).join("\n").trim();
  });
}

function extractGameFromPgn(pgnBlock, index) {
  // Extract game ID from headers if present
  let gameId = `pgn_${index}`;
  let tags = [];

  try {
    const chess = new Chess();
    chess.loadPgn(pgnBlock);

    // Get headers
    const headers = chess.header();
    if (headers.Site) gameId = headers.Site.includes("lichess") && headers.Site.split("/").pop()
      ? headers.Site.split("/").pop()
      : `pgn_${index}`;
    if (headers.White && headers.Black) {
      tags.push(headers.White, headers.Black);
    }
    if (headers.Event) {
      tags.push(headers.Event);
    }
    if (headers.ECO) {
      tags.push(headers.ECO);
    }

    // Get move history
    const moveHistory = chess.history({ verbose: true });

    return { gameId, tags, moveHistory, pgn: chess.pgn() };
  } catch (err) {
    console.warn(`Warning: failed to parse PGN game at index ${index}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// JSON / NDJSON parsing
// ---------------------------------------------------------------------------

function parseJsonGames(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Failed to parse JSON source. Ensure the file contains valid JSON.");
    return [];
  }

  if (!Array.isArray(data)) {
    console.error("JSON source must be an array of game objects.");
    return [];
  }

  return data
    .map((game, index) => normalizeJsonGame(game, index))
    .filter(Boolean);
}

function parseNdjsonGames(text) {
  const lines = text.split("\n").filter((line) => line.trim());
  const games = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const game = JSON.parse(lines[i]);
      const normalized = normalizeJsonGame(game, i);
      if (normalized) games.push(normalized);
    } catch {
      console.warn(`Warning: skipping invalid NDJSON line ${i}`);
    }
  }

  return games;
}

function normalizeJsonGame(game, index) {
  if (!game.moves || typeof game.moves !== "string" || !game.moves.trim()) {
    console.warn(`Warning: game at index ${index} has no "moves" field — skipping`);
    return null;
  }

  const gameId = game.id ?? game.game_id ?? game.gameId ?? `json_${index}`;
  const tags = Array.isArray(game.tags) ? game.tags : [];

  return {
    gameId: String(gameId),
    tags,
    movesText: game.moves.trim(),
  };
}

// ---------------------------------------------------------------------------
// Game replay and position extraction
// ---------------------------------------------------------------------------

function replayJsonGame(game) {
  const chess = new Chess();
  const tokens = game.movesText.split(/\s+/).filter(Boolean);
  const positions = [];

  for (const token of tokens) {
    const previousFen = chess.fen();

    let move;
    try {
      move = chess.move(token);
    } catch {
      break; // illegal move — stop processing this game
    }

    if (!move) break;

    positions.push({
      previousFen,
      playedMove: `${move.from}${move.to}${move.promotion ?? ""}`,
      fen: chess.fen(),
      sourceGameId: game.gameId,
      sourcePly: positions.length,
      sourceType: "json" /* or "unknown" */,
      tags: [...game.tags],
    });
  }

  return positions;
}

function replayPgnGame(game) {
  // Replay from scratch to get accurate FENs
  const chess = new Chess();
  const positions = [];

  for (const move of game.moveHistory) {
    const previousFen = chess.fen();

    try {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    } catch {
      break;
    }

    positions.push({
      previousFen,
      playedMove: `${move.from}${move.to}${move.promotion ?? ""}`,
      fen: chess.fen(),
      sourceGameId: game.gameId,
      sourcePly: positions.length,
      sourceType: "pgn",
      tags: [...game.tags],
    });
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Validation (mirrors lib/training/setup-prelude.ts)
// ---------------------------------------------------------------------------

const UCI_MOVE_RE = /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/;

function validatePrelude(previousFen, playedMove, fen) {
  if (!previousFen || !playedMove || !fen) {
    return { ok: false, reason: "missing_fields" };
  }

  let chess;
  try {
    chess = new Chess(previousFen);
  } catch {
    return { ok: false, reason: "invalid_previous_fen" };
  }

  let move;
  try {
    if (UCI_MOVE_RE.test(playedMove)) {
      move = chess.move({
        from: playedMove.slice(0, 2),
        to: playedMove.slice(2, 4),
        promotion: playedMove[4] || undefined,
      });
    } else {
      move = chess.move(playedMove);
    }
  } catch {
    return { ok: false, reason: "illegal_played_move" };
  }

  if (!move) {
    return { ok: false, reason: "illegal_played_move" };
  }

  const reachedFen = chess.fen();
  const reachedKey = normalizeFenKey(reachedFen);
  const expectedKey = normalizeFenKey(fen);

  if (reachedKey === expectedKey) {
    return { ok: true, reachedFen };
  }

  // Check for stale castling rights or en passant
  const reachedParts = reachedKey.split(" ");
  const expectedParts = expectedKey.split(" ");

  const boardMatch = reachedParts[0] === expectedParts[0];
  const sideMatch = reachedParts[1] === expectedParts[1];
  const castlingMatch = reachedParts[2] === expectedParts[2];
  const enPassantMatch = reachedParts[3] === expectedParts[3];

  if (boardMatch && sideMatch && !castlingMatch && enPassantMatch) {
    return { ok: false, reason: "stale_castling_rights", reachedFen };
  }
  if (boardMatch && sideMatch && castlingMatch && !enPassantMatch) {
    return { ok: false, reason: "stale_en_passant", reachedFen };
  }

  return { ok: false, reason: "fen_mismatch", reachedFen };
}

// ---------------------------------------------------------------------------
// Normalized decision key (for dedup)
// ---------------------------------------------------------------------------

function normalizeFenKey(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return "";
  return parts.slice(0, 4).join(" ");
}

// ---------------------------------------------------------------------------
// Position classification
// ---------------------------------------------------------------------------

function countPieces(fen) {
  const board = fen.trim().split(/\s+/)[0] ?? "";
  let count = 0;
  for (const ch of board) {
    if (/[pnbrqkPNBRQK]/.test(ch)) count++;
  }
  return count;
}

function isEndgameMaterial(fen) {
  const count = countPieces(fen);
  if (count <= 10) return true;

  const board = fen.trim().split(/\s+/)[0] ?? "";
  const hasQueens = /[qQ]/.test(board);
  const nonPawnMaterial = board.replace(/[pP1-8/]/g, "").length;

  if (!hasQueens && nonPawnMaterial <= 6) return true;
  return false;
}

function classifyPhase(ply, fen) {
  if (ply <= 20) return "opening";

  if (isEndgameMaterial(fen)) return "endgame";
  if (ply <= 70) return "middlegame";

  const count = countPieces(fen);
  if (count <= 14) return "endgame";

  return "middlegame";
}

function isTerminalPosition(fen) {
  try {
    const chess = new Chess(fen);
    if (chess.isGameOver()) return true;
    return chess.moves().length === 0;
  } catch {
    return true;
  }
}

function sideToMoveFromFen(fen) {
  try {
    return fen.trim().split(/\s+/)[1] === "b" ? "black" : "white";
  } catch {
    return "white";
  }
}

// ---------------------------------------------------------------------------
// Seeded shuffle (Fisher-Yates)
// ---------------------------------------------------------------------------

function shuffleArray(array, seed) {
  const result = [...array];
  let s = seed;

  for (let i = result.length - 1; i > 0; i--) {
    // Mulberry32 PRNG
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const rand = ((t ^ (t >>> 14)) >>> 0) / 4294967296;

    const j = Math.floor(rand * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Build output row
// ---------------------------------------------------------------------------

let rowCounter = 0;

function buildRow(pos, phase, sourceType) {
  const id = `${pos.sourceGameId}_ply${pos.sourcePly}_${rowCounter++}`;
  return {
    id,
    fen: pos.fen,
    previousFen: pos.previousFen,
    playedMove: pos.playedMove,
    phase,
    sourceType,
    sourceGameId: pos.sourceGameId,
    sourcePly: pos.sourcePly,
    sideToMove: sideToMoveFromFen(pos.fen),
    tags: pos.tags ?? [],
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Source loader
// ---------------------------------------------------------------------------

async function loadSource(sourcePath) {
  const ext = extname(sourcePath).toLowerCase();
  const text = await readFile(sourcePath, "utf8");

  if (ext === ".pgn") {
    const blocks = splitPgnGames(text);
    console.log(`Found ${blocks.length} PGN game block(s)`);

    const games = [];
    for (let i = 0; i < blocks.length; i++) {
      const game = extractGameFromPgn(blocks[i], i);
      if (game) games.push(game);
    }

    console.log(`Parsed ${games.length} valid PGN game(s)`);
    return { type: "pgn", games };
  }

  if (ext === ".json") {
    const games = parseJsonGames(text);
    console.log(`Parsed ${games.length} JSON game(s)`);
    return { type: "json", games };
  }

  if (ext === ".ndjson" || ext === ".jsonl") {
    const games = parseNdjsonGames(text);
    console.log(`Parsed ${games.length} NDJSON game(s)`);
    return { type: "ndjson", games };
  }

  throw new Error(
    `Unsupported source format: ${ext}. Accepted: .pgn, .json, .ndjson, .jsonl`,
  );
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

async function generate(args) {
  console.log("=== Training Corpus Generator ===\n");

  // Step 1: Resolve source
  let sourcePath = args.source;
  if (!sourcePath) {
    sourcePath = await findRepoSource();
    if (!sourcePath) {
      printSourceError();
      process.exit(1);
    }
    console.log(`Found repo source: ${sourcePath}`);
  }

  sourcePath = resolve(process.cwd(), sourcePath);
  console.log(`Source: ${sourcePath}`);
  console.log(`Output: ${args.out}`);
  console.log(
    `Targets: opening=${args.opening} middlegame=${args.middlegame} endgame=${args.endgame} puzzles=${args.puzzles}`,
  );
  console.log(`Seed: ${args.seed}  Dry-run: ${args.dryRun}  Strict: ${args.strict}\n`);

  // Step 2: Load source
  const source = await loadSource(sourcePath);
  if (source.games.length === 0) {
    console.error("ERROR: No valid games found in source.");
    process.exit(1);
  }

  const totalMoves = source.games.reduce((sum, g) => {
    return sum + (g.moveHistory ? g.moveHistory.length : (g.movesText?.split(/\s+/).length ?? 0));
  }, 0);
  console.log(`Total moves across all games: ${totalMoves}`);

  // Step 3: Extract positions from all games
  console.log("\n--- Extracting positions ---");

  const candidates = [];
  const stats = { extracted: 0, excludedTerminal: 0, excludedInvalidFen: 0, excludedPreludeFail: 0 };

  for (let i = 0; i < source.games.length; i++) {
    const game = source.games[i];
    const positions =
      source.type === "pgn"
        ? replayPgnGame(game)
        : replayJsonGame(game);

    for (const pos of positions) {
      stats.extracted++;

      // Exclude terminal positions
      if (isTerminalPosition(pos.fen)) {
        stats.excludedTerminal++;
        continue;
      }

      // Validate prelude
      const validation = validatePrelude(pos.previousFen, pos.playedMove, pos.fen);
      if (!validation.ok) {
        stats.excludedPreludeFail++;
        continue;
      }

      // Classify phase
      const phase = classifyPhase(pos.sourcePly, pos.fen);
      const sourceType = source.type === "pgn" ? "pgn" : source.type === "json" ? "json" : "unknown";
      const row = buildRow(pos, phase, sourceType);
      candidates.push(row);
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`  Processed ${i + 1} games, ${candidates.length} candidates so far...`);
    }
  }

  console.log(`\nExtracted: ${stats.extracted}`);
  console.log(`Excluded (terminal): ${stats.excludedTerminal}`);
  console.log(`Excluded (prelude fail): ${stats.excludedPreludeFail}`);
  console.log(`Valid candidates: ${candidates.length}`);

  if (candidates.length === 0) {
    console.error("\nERROR: No valid candidates extracted from source.");
    console.error("Check that the source contains legal move sequences.");
    process.exit(1);
  }

  // Step 4: Deduplicate by normalized FEN key
  console.log("\n--- Deduplicating ---");

  const phaseBuckets = { opening: [], middlegame: [], endgame: [] };
  const seen = new Set();

  for (const row of candidates) {
    // Skip puzzle phase for now
    if (row.phase === "opening" || row.phase === "middlegame" || row.phase === "endgame") {
      const key = normalizeFenKey(row.fen);
      if (!seen.has(key)) {
        seen.add(key);
        phaseBuckets[row.phase].push(row);
      }
    }
  }

  console.log(`Unique positions after dedup: ${seen.size}`);
  console.log(`  Opening: ${phaseBuckets.opening.length}`);
  console.log(`  Middlegame: ${phaseBuckets.middlegame.length}`);
  console.log(`  Endgame: ${phaseBuckets.endgame.length}`);

  // Step 5: Shuffle and sample
  console.log("\n--- Shuffling and sampling ---");

  const targets = {
    opening: args.opening,
    middlegame: args.middlegame,
    endgame: args.endgame,
  };

  const output = {};
  const shortfalls = [];

  for (const phase of ["opening", "middlegame", "endgame"]) {
    const target = targets[phase];
    if (target <= 0) {
      console.log(`  ${phase}: skipped (target=0)`);
      continue;
    }

    const shuffled = shuffleArray(phaseBuckets[phase], args.seed + ["opening", "middlegame", "endgame"].indexOf(phase));
    const sampled = shuffled.slice(0, target);

    output[phase] = sampled;
    console.log(`  ${phase}: sampled ${sampled.length} (target: ${target}, available: ${phaseBuckets[phase].length})`);

    if (sampled.length < target) {
      shortfalls.push({ phase, target, actual: sampled.length });
    }
  }

  // Puzzle report
  console.log(`\n  puzzle: 0 generated (no authoritative puzzle source)`);

  // Step 6: Shortfall warnings
  if (shortfalls.length > 0) {
    console.log("\n--- Shortfalls ---");
    for (const sf of shortfalls) {
      console.log(`  ${sf.phase}: only ${sf.actual}/${sf.target} positions available`);
    }
    if (args.strict) {
      console.error("\nERROR: Strict mode enabled — exiting due to shortfalls.");
      process.exit(1);
    }
  }

  // Step 7: Write output
  if (args.dryRun) {
    console.log("\n--- Dry run complete (no files written) ---");
    console.log("Puzzle corpus skipped: no authoritative puzzle source with move history found.");
    printSummary(output);
    return;
  }

  console.log("\n--- Writing output files ---");

  try {
    await mkdir(args.out, { recursive: true });
  } catch {
    // directory exists
  }

  const fileMap = {
    opening: "generated_training_opening_positions.json",
    middlegame: "generated_training_middlegame_positions.json",
    endgame: "generated_training_endgame_positions.json",
  };

  for (const [phase, filename] of Object.entries(fileMap)) {
    const rows = output[phase];
    if (!rows || rows.length === 0) {
      console.log(`  Skipping ${filename} (no rows)`);
      continue;
    }
    const outPath = resolve(args.out, filename);
    await writeFile(outPath, JSON.stringify(rows, null, 2), "utf8");
    console.log(`  Wrote ${rows.length} rows to ${outPath}`);
  }

  console.log("\nPuzzle corpus skipped: no authoritative puzzle source with move history found.");
  console.log("\n=== Generation complete ===\n");

  printSummary(output);

  return output;
}

function printSummary(output) {
  console.log("\nSummary:");
  for (const phase of ["opening", "middlegame", "endgame"]) {
    const count = output[phase]?.length ?? 0;
    console.log(`  ${phase}: ${count}`);
  }
  console.log("  puzzle: 0 (skipped — no authoritative source)");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const args = parseArgs();

try {
  await generate(args);
} catch (err) {
  console.error(`\nFatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
