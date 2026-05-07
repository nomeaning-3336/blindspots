import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname, basename, extname } from "node:path";
import process from "node:process";
import { Chess } from "chess.js";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import https from "node:https";
import http from "node:http";
import { Readable } from "node:stream";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const HELP = `generate-training-corpus.mjs — Generate training position datasets from game sources.

Usage:
  node scripts/generate-training-corpus.mjs --source <path> [options]
  node scripts/generate-training-corpus.mjs --source-url <url> [options]

Required (one of):
  --source <path>     Path to local game source file (PGN, JSON, NDJSON)
  --source-url <url>  URL to .pgn.zst dump (streamed, not downloaded)

Streaming example:
  npm run generate:training-corpus -- \\
    --source-url https://database.lichess.org/standard/lichess_db_standard_rated_2026-04.pgn.zst \\
    --opening 10000 --middlegame 10000 --endgame 10000 --strict

.zst streaming requires the zstd CLI installed:
  Windows:  winget install Meta.Zstandard
  Linux:    sudo apt install zstd
  macOS:    brew install zstd

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

Accepted source formats (--source):
  - .pgn              Standard PGN with full move history (multi-game supported)
  - .json             JSON array of game objects with a "moves" field
  - .ndjson / .jsonl  Newline-delimited JSON, one game object per line

Accepted source URLs (--source-url):
  - .pgn.zst          Lichess standard PGN Zstandard-compressed dump
  Streaming is required for .pgn.zst URLs — full download is not supported.

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
    sourceUrl: null,
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
      case "--source-url": {
        args.sourceUrl = raw[++i] ?? null;
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
// Source discovery (local files)
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
  console.error("ERROR: No source game file or URL provided.");
  console.error("");
  console.error("The generator requires an authoritative game source with full move history.");
  console.error("Accepted source formats:");
  console.error("  - .pgn       Standard PGN with complete move text (--source)");
  console.error("  - .json      JSON array of game objects with a \"moves\" field (--source)");
  console.error("  - .ndjson    Newline-delimited JSON, one game object per line (--source)");
  console.error("  - .pgn.zst   Lichess PGN Zstandard dump URL (--source-url)");
  console.error("");
  console.error("Provide a source with --source or --source-url:");
  console.error("  node scripts/generate-training-corpus.mjs --source data/lichess-games.pgn");
  console.error("  node scripts/generate-training-corpus.mjs --source-url https://database.lichess.org/.../lichess_db_standard_rated_2026-04.pgn.zst");
  console.error("");
  console.error("Unacceptable sources (will be rejected):");
  console.error("  - FEN-only datasets");
  console.error("  - Puzzle FEN + solution with no previous move history");
  console.error("  - Manually guessed previous positions");
  console.error("  - Positions generated by reversing moves from FEN");
  console.error("");
  console.error("The repo does not currently contain any source game files.");
  console.error("To proceed, obtain a PGN or JSON game file and re-run with --source,");
  console.error("or use --source-url with a Lichess PGN dump URL.");
}

// ---------------------------------------------------------------------------
// zstd discovery
// ---------------------------------------------------------------------------

const ZSTD_CANDIDATE_PATHS = [];

function findZstd() {
  // Check explicitly provided env var first
  if (process.env.ZSTD_PATH) return process.env.ZSTD_PATH;

  // Common install locations on Windows
  if (process.platform === "win32") {
    ZSTD_CANDIDATE_PATHS.push(
      "zstd.exe",
      "zstd",
    );
    // Winget install location
    const localAppData = process.env.LOCALAPPDATA || "";
    if (localAppData) {
      const wingetBase = resolve(localAppData, "Microsoft", "WinGet", "Packages");
      ZSTD_CANDIDATE_PATHS.push(
        resolve(wingetBase, "Meta.Zstandard_Microsoft.Winget.Source_8wekyb3d8bbwe", "zstd-v1.5.7-win64", "zstd.exe"),
      );
    }
    // Common manual install paths
    ZSTD_CANDIDATE_PATHS.push(
      resolve(process.cwd(), "data", "zstd.exe"),
    );
  } else {
    ZSTD_CANDIDATE_PATHS.push("zstd");
  }

  return "zstd"; // rely on PATH by default; spawn will fail if missing
}

async function checkZstdAvailable() {
  const zstdPath = findZstd();
  return new Promise((resolve) => {
    try {
      const proc = spawn(zstdPath, ["--version"], {
        stdio: "pipe",
        shell: process.platform === "win32",
      });
      let output = "";
      proc.stdout.on("data", (d) => { output += d.toString(); });
      proc.stderr.on("data", (d) => { output += d.toString(); });
      proc.on("close", (code) => {
        resolve(code === 0 ? zstdPath : null);
      });
      proc.on("error", () => {
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

function printZstdMissingError() {
  console.error("ERROR: zstd CLI is required for streaming .pgn.zst sources.");
  console.error("");
  console.error("Installation instructions:");
  console.error("  Windows (winget):  winget install Meta.Zstandard");
  console.error("  Windows (choco):   choco install zstandard");
  console.error("  Linux:             sudo apt install zstd");
  console.error("  macOS:             brew install zstd");
  console.error("");
  console.error("After installing, restart your terminal and re-run the command.");
  console.error("");
  console.error("Alternatively, download the PGN dump, decompress it manually,");
  console.error("and use --source with the local .pgn file:");
  console.error("  zstd -d lichess_db_standard_rated_2026-04.pgn.zst");
  console.error("  node scripts/generate-training-corpus.mjs --source lichess_db_standard_rated_2026-04.pgn");
}

// ---------------------------------------------------------------------------
// PGN parsing (local files)
// ---------------------------------------------------------------------------

const EVENT_HEADER_RE = /^\[Event\s+"[^"]*"\]/m;

function splitPgnGames(raw) {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const gameStarts = [];

  for (let i = 0; i < lines.length; i++) {
    if (EVENT_HEADER_RE.test(lines[i])) {
      gameStarts.push(i);
    }
  }

  if (gameStarts.length === 0) {
    return [text];
  }

  return gameStarts.map((start, index) => {
    const end = index < gameStarts.length - 1 ? gameStarts[index + 1] : lines.length;
    return lines.slice(start, end).join("\n").trim();
  });
}

/**
 * Extract game from a complete PGN text block.
 * Tolerates Lichess-style comments (clock, eval, etc.).
 */
function extractGameFromPgn(pgnBlock, index) {
  let gameId = `pgn_${index}`;
  let tags = [];
  let moveHistory = [];
  let cleanPgn = "";

  try {
    const chess = new Chess();
    chess.loadPgn(pgnBlock);

    const headers = chess.header();
    if (headers.Site) {
      const parts = headers.Site.split("/");
      if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (last && last.length >= 8) gameId = last;
      }
    }
    if (headers.White) tags.push(headers.White);
    if (headers.Black) tags.push(headers.Black);
    if (headers.Event) tags.push(headers.Event);
    if (headers.ECO) tags.push(headers.ECO);

    moveHistory = chess.history({ verbose: true });
    cleanPgn = chess.pgn();
  } catch (err) {
    // Try cleaning Lichess clock/eval comments and retry
    try {
      const cleaned = cleanPgnComments(pgnBlock);
      const chess = new Chess();
      chess.loadPgn(cleaned);

      const headers = chess.header();
      if (headers.Site) {
        const parts = headers.Site.split("/");
        if (parts.length > 0) {
          const last = parts[parts.length - 1];
          if (last && last.length >= 8) gameId = last;
        }
      }
      if (headers.White) tags.push(headers.White);
      if (headers.Black) tags.push(headers.Black);
      if (headers.Event) tags.push(headers.Event);
      if (headers.ECO) tags.push(headers.ECO);

      moveHistory = chess.history({ verbose: true });
      cleanPgn = chess.pgn();
    } catch {
      return null;
    }
  }

  if (moveHistory.length === 0) return null;

  return { gameId, tags, moveHistory, pgn: cleanPgn };
}

/**
 * Remove Lichess inline comments that can confuse PGN parsers.
 * Handles: { [%clk ...] }, { [%eval ...] }, { %emt ... }
 * Preserves the move text structure.
 */
function cleanPgnComments(pgnText) {
  // Remove brace comments entirely
  let cleaned = pgnText.replace(/\{[^}]*\}/g, "");
  // Remove RAV (parenthetical variations) — keep only main line
  // Simplistic: remove top-level parenthetical blocks
  cleaned = cleaned.replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "");
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
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
      break;
    }

    if (!move) break;

    positions.push({
      previousFen,
      playedMove: `${move.from}${move.to}${move.promotion ?? ""}`,
      fen: chess.fen(),
      sourceGameId: game.gameId,
      sourcePly: positions.length,
      sourceType: "json",
      tags: [...game.tags],
    });
  }

  return positions;
}

function replayPgnGame(game) {
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
// Streaming PGN parser (for --source-url)
// ---------------------------------------------------------------------------

const STREAMING_EVENT_MARKER = "\n[Event ";

class StreamingPgnParser {
  constructor(onGame) {
    this.buffer = "";
    this.onGame = onGame;
  }

  feed(chunk) {
    this.buffer += chunk;

    // Start search from position 1 if buffer begins with [Event, else from 0
    while (true) {
      const searchFrom = this.buffer.startsWith("[Event ") ? 1 : 0;
      const idx = this.buffer.indexOf(STREAMING_EVENT_MARKER, searchFrom);

      if (idx === -1) break; // No next game boundary yet

      const gameText = this.buffer.substring(0, idx).trim();
      // Keep the \n[Event " part for the next game
      this.buffer = this.buffer.substring(idx + 1); // skip the \n

      if (gameText) {
        this.onGame(gameText);
      }
    }
  }

  flush() {
    const remaining = this.buffer.trim();
    this.buffer = "";
    if (remaining) {
      this.onGame(remaining);
    }
  }
}

// ---------------------------------------------------------------------------
// URL streamer (--source-url)
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with automatic redirect following.
 * Returns the http.IncomingMessage response.
 */
function fetchWithRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;

    function doFetch(currentUrl, redirectsLeft) {
      mod.get(currentUrl, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          // Consume response body to free memory
          res.resume();
          // Resolve relative redirects
          const redirectUrl = new URL(res.headers.location, currentUrl).href;
          doFetch(redirectUrl, redirectsLeft - 1);
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
          return;
        }

        resolve(res);
      }).on("error", reject);
    }

    doFetch(url, maxRedirects);
  });
}

/**
 * Stream positions from a .pgn.zst URL.
 * Uses HTTPS fetch → zstd -dc → incremental PGN parse → position extraction.
 * Stops when all phase targets are met.
 */
async function streamFromUrl(url, targets, args) {
  // Verify zstd is available
  const zstdAvailable = await checkZstdAvailable();
  if (!zstdAvailable) {
    printZstdMissingError();
    process.exit(1);
  }

  const zstdPath = findZstd();
  console.log(`zstd: ${zstdAvailable}`);

  // State
  const counts = { opening: 0, middlegame: 0, endgame: 0 };
  const seen = new Set();
  const phaseRows = { opening: [], middlegame: [], endgame: [] };
  let gamesProcessed = 0;
  let validCandidates = 0;
  let skippedTerminal = 0;
  let skippedPrelude = 0;
  let skippedBadPgn = 0;
  let bytesDownloaded = 0;
  let stopped = false;

  const startTime = Date.now();

  function allTargetsMet() {
    return (
      counts.opening >= targets.opening &&
      counts.middlegame >= targets.middlegame &&
      counts.endgame >= targets.endgame
    );
  }

  function logProgress() {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const mb = (bytesDownloaded / (1024 * 1024)).toFixed(1);
    const mem = process.memoryUsage?.()
      ? `${(process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(0)}MB`
      : "n/a";
    console.log(
      `[training-corpus:stream] games=${gamesProcessed} valid=${validCandidates} ` +
        `opening=${counts.opening}/${targets.opening} ` +
        `middlegame=${counts.middlegame}/${targets.middlegame} ` +
        `endgame=${counts.endgame}/${targets.endgame} ` +
        `skip_term=${skippedTerminal} skip_prelude=${skippedPrelude} ` +
        `skip_badpgn=${skippedBadPgn} mem=${mem} elapsed=${elapsed}s dl=${mb}MB`,
    );
  }

  function processGame(pgnText) {
    if (stopped) return;

    gamesProcessed++;
    const game = extractGameFromPgn(pgnText, gamesProcessed);
    if (!game) {
      skippedBadPgn++;
      return;
    }

    const positions = replayPgnGame(game);
    for (const pos of positions) {
      if (stopped) return;

      // Exclude terminal positions
      if (isTerminalPosition(pos.fen)) {
        skippedTerminal++;
        continue;
      }

      // Validate prelude
      const validation = validatePrelude(pos.previousFen, pos.playedMove, pos.fen);
      if (!validation.ok) {
        skippedPrelude++;
        continue;
      }

      // Classify phase
      const phase = classifyPhase(pos.sourcePly, pos.fen);

      // Skip phases we don't need
      if (counts[phase] >= targets[phase]) continue;

      // Deduplicate
      const key = normalizeFenKey(pos.fen);
      if (seen.has(key)) continue;
      seen.add(key);

      const row = buildRow(pos, phase, "pgn");
      phaseRows[phase].push(row);
      counts[phase]++;
      validCandidates++;

      // Check stop
      if (allTargetsMet()) {
        stopped = true;
        return;
      }
    }

    // Progress log every 1000 games
    if (gamesProcessed % 1000 === 0) {
      logProgress();
    }
  }

  // Build the pipeline
  console.log(`[training-corpus:stream] Fetching ${url}`);
  const response = await fetchWithRedirects(url);

  const contentType = response.headers["content-type"] || "";
  console.log(`[training-corpus:stream] Connected (status=${response.statusCode}, type=${contentType})`);

  // Spawn zstd decompressor
  const zstdProc = spawn(zstdPath, ["-dc"], {
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  // Collect zstd stderr for diagnostics
  let zstdStderr = "";
  zstdProc.stderr.on("data", (d) => {
    zstdStderr += d.toString();
  });

  zstdProc.on("error", (err) => {
    if (!stopped) {
      console.error(`[training-corpus:stream] zstd process error: ${err.message}`);
    }
  });

  zstdProc.on("close", (code) => {
    if (!stopped && code !== 0 && code !== null) {
      console.error(`[training-corpus:stream] zstd exited with code ${code}`);
      if (zstdStderr) console.error(`[training-corpus:stream] zstd stderr: ${zstdStderr.trim()}`);
    }
  });

  // Create streaming PGN parser
  const parser = new StreamingPgnParser(processGame);

  // Pipe response to zstd
  response.on("data", (chunk) => {
    bytesDownloaded += chunk.length;
    try {
      zstdProc.stdin.write(chunk);
    } catch (err) {
      if (!stopped) {
        console.error(`[training-corpus:stream] Error writing to zstd: ${err.message}`);
      }
    }
  });

  response.on("end", () => {
    zstdProc.stdin.end();
  });

  response.on("error", (err) => {
    if (!stopped) {
      console.error(`[training-corpus:stream] Download error: ${err.message}`);
    }
    zstdProc.stdin.end();
  });

  // Read zstd stdout
  zstdProc.stdout.on("data", (chunk) => {
    parser.feed(chunk.toString());

    if (stopped) {
      // Cleanly abort the pipeline
      response.destroy();
      zstdProc.stdin.end();
      if (zstdProc.exitCode === null) {
        zstdProc.kill();
      }
    }
  });

  // Wait for the stream to complete
  return new Promise((resolve, reject) => {
    function finish() {
      parser.flush();

      logProgress();
      console.log(
        `[training-corpus:stream] Stream finished. ` +
          `Games: ${gamesProcessed}, valid: ${validCandidates}`,
      );

      if (zstdStderr) {
        console.error(`[training-corpus:stream] zstd stderr (may be harmless): ${zstdStderr.trim().slice(0, 500)}`);
      }

      resolve({ phaseRows, counts, gamesProcessed, validCandidates, skippedTerminal, skippedPrelude, skippedBadPgn, bytesDownloaded });
    }

    zstdProc.stdout.on("end", finish);
    zstdProc.stdout.on("error", (err) => {
      if (stopped) {
        finish();
      } else {
        reject(err);
      }
    });

    response.on("end", () => {
      // Give zstd time to flush its output
    });

    response.on("error", (err) => {
      if (stopped) {
        finish();
      } else {
        reject(err);
      }
    });

    // Safety timeout: if stream hangs, force finish after some idle time
    let idleTimer;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (!stopped) {
        idleTimer = setTimeout(() => {
          console.error("[training-corpus:stream] Stream idle timeout — forcing finish");
          stopped = true;
          response.destroy();
          zstdProc.kill();
          finish();
        }, 30000);
      }
    };

    resetIdleTimer();
    zstdProc.stdout.on("data", () => resetIdleTimer());
  });
}

// ---------------------------------------------------------------------------
// Local source loader (--source)
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
  if (!args.source && !args.sourceUrl) {
    const repoSource = await findRepoSource();
    if (repoSource) {
      args.source = repoSource;
      console.log(`Found repo source: ${repoSource}`);
    } else {
      printSourceError();
      process.exit(1);
    }
  }

  const targets = {
    opening: args.opening,
    middlegame: args.middlegame,
    endgame: args.endgame,
  };

  if (args.sourceUrl) {
    // ---- STREAMING MODE ----
    console.log(`Source URL: ${args.sourceUrl}`);
  } else {
    // ---- LOCAL FILE MODE ----
    const sourcePath = resolve(process.cwd(), args.source);
    console.log(`Source: ${sourcePath}`);
  }

  console.log(`Output: ${args.out}`);
  console.log(
    `Targets: opening=${args.opening} middlegame=${args.middlegame} endgame=${args.endgame} puzzles=${args.puzzles}`,
  );
  console.log(`Seed: ${args.seed}  Dry-run: ${args.dryRun}  Strict: ${args.strict}\n`);

  // Step 2: Acquire positions
  let phaseRows;
  let stats;

  if (args.sourceUrl) {
    // Streaming from URL
    const result = await streamFromUrl(args.sourceUrl, targets, args);
    phaseRows = result.phaseRows;
    stats = {
      extracted: result.validCandidates + result.skippedTerminal + result.skippedPrelude,
      excludedTerminal: result.skippedTerminal,
      excludedPreludeFail: result.skippedPrelude + result.skippedBadPgn,
      totalCandidates: result.validCandidates,
      gamesProcessed: result.gamesProcessed,
    };
  } else {
    // Local file loading
    const sourcePath = resolve(process.cwd(), args.source);
    const source = await loadSource(sourcePath);

    if (source.games.length === 0) {
      console.error("ERROR: No valid games found in source.");
      process.exit(1);
    }

    const totalMoves = source.games.reduce((sum, g) => {
      return sum + (g.moveHistory ? g.moveHistory.length : (g.movesText?.split(/\s+/).length ?? 0));
    }, 0);
    console.log(`Total moves across all games: ${totalMoves}`);

    console.log("\n--- Extracting positions ---");

    const candidates = [];
    stats = { extracted: 0, excludedTerminal: 0, excludedInvalidFen: 0, excludedPreludeFail: 0 };

    for (let i = 0; i < source.games.length; i++) {
      const game = source.games[i];
      const positions =
        source.type === "pgn"
          ? replayPgnGame(game)
          : replayJsonGame(game);

      for (const pos of positions) {
        stats.extracted++;

        if (isTerminalPosition(pos.fen)) {
          stats.excludedTerminal++;
          continue;
        }

        const validation = validatePrelude(pos.previousFen, pos.playedMove, pos.fen);
        if (!validation.ok) {
          stats.excludedPreludeFail++;
          continue;
        }

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

    // Deduplicate by normalized FEN key
    console.log("\n--- Deduplicating ---");

    phaseRows = { opening: [], middlegame: [], endgame: [] };
    const seen = new Set();

    for (const row of candidates) {
      if (row.phase === "opening" || row.phase === "middlegame" || row.phase === "endgame") {
        const key = normalizeFenKey(row.fen);
        if (!seen.has(key)) {
          seen.add(key);
          phaseRows[row.phase].push(row);
        }
      }
    }

    console.log(`Unique positions after dedup: ${seen.size}`);
    console.log(`  Opening: ${phaseRows.opening.length}`);
    console.log(`  Middlegame: ${phaseRows.middlegame.length}`);
    console.log(`  Endgame: ${phaseRows.endgame.length}`);
  }

  // Step 3: Sample to targets
  console.log("\n--- Shuffling and sampling ---");

  const output = {};
  const shortfalls = [];

  for (const phase of ["opening", "middlegame", "endgame"]) {
    const target = targets[phase];
    if (target <= 0) {
      console.log(`  ${phase}: skipped (target=0)`);
      continue;
    }

    // Streaming already naturally sampled; just cap to target
    const rows = phaseRows[phase] ?? [];
    const sampled = rows.slice(0, target);

    output[phase] = sampled;
    console.log(`  ${phase}: sampled ${sampled.length} (target: ${target}, available: ${rows.length})`);

    if (sampled.length < target) {
      shortfalls.push({ phase, target, actual: sampled.length });
    }
  }

  // Puzzle report
  console.log(`\n  puzzle: 0 generated (no authoritative puzzle source)`);

  // Step 4: Shortfall warnings
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

  // Step 5: Write output
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

  console.log("\nPuzzle corpus skipped: standard PGN stream does not identify puzzle moments.");
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
