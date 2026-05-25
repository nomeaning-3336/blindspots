import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { Chess } from "chess.js";

const CSV_HEADER =
  "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags";

function createTempScript(tempRoot: string): string {
  const originalScript = readFileSync(
    resolve(process.cwd(), "scripts", "build-lichess-puzzle-filler-catalog.mjs"),
    "utf8",
  );
  const chessModuleUrl = new URL(
    `file:///${resolve(process.cwd(), "node_modules", "chess.js", "dist", "esm", "chess.js").replace(/\\/g, "/")}`,
  ).href;
  const tempScript = originalScript.replace(
    'import { Chess } from "chess.js";',
    `import { Chess } from ${JSON.stringify(chessModuleUrl)};`,
  );
  const tempScriptPath = resolve(tempRoot, "build-lichess-puzzle-filler-catalog.mjs");
  writeFileSync(tempScriptPath, tempScript, "utf8");
  return tempScriptPath;
}

test("Lichess importer stores the cold position after applying the trigger move", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "blindspots-lichess-import-"));
  const inputDir = resolve(tempRoot, "tmp");
  const fillerDir = resolve(tempRoot, "public", "filler");

  mkdirSync(inputDir, { recursive: true });
  mkdirSync(fillerDir, { recursive: true });

  const sourceFen = "q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17";
  const moves = "e8d7 a2e6 d7d8 f7f8";

  writeFileSync(
    resolve(inputDir, "lichess_db_puzzle.csv"),
    `${CSV_HEADER}\n00sHx,${sourceFen},${moves},1760,80,83,72,mate mateIn2 middlegame short,https://lichess.org/yyznGmXs/black#34,Italian_Game\n`,
    "utf8",
  );

  const scriptPath = createTempScript(tempRoot);

  execFileSync(process.execPath, [scriptPath], {
    cwd: tempRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  const generated = JSON.parse(
    readFileSync(resolve(fillerDir, "lichess-puzzle-catalog.json"), "utf8"),
  ) as Array<{
    id: string;
    origin: string;
    fen: string;
    phase: string;
    sourceRecordId: string;
  }>;

  assert.equal(generated.length, 1);
  assert.equal(generated[0]?.origin, "lichess_puzzle");
  assert.equal(generated[0]?.phase, "tactic");
  assert.equal(generated[0]?.sourceRecordId, "lichess:00sHx");

  const expectedBoard = new Chess(sourceFen);
  expectedBoard.move({ from: "e8", to: "d7" });
  assert.equal(generated[0]?.fen, expectedBoard.fen());
  assert.notEqual(generated[0]?.fen, sourceFen);
  assert.deepEqual(
    Object.keys(generated[0] ?? {}).sort(),
    ["fen", "id", "origin", "phase", "sourceRecordId"],
  );
});

test("Lichess importer refuses to rebind an existing UUID to a changed cold FEN", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "blindspots-lichess-rebind-"));
  const inputDir = resolve(tempRoot, "tmp");
  const fillerDir = resolve(tempRoot, "public", "filler");

  mkdirSync(inputDir, { recursive: true });
  mkdirSync(fillerDir, { recursive: true });

  const originalSourceFen = "q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17";
  const changedSourceFen = "q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP4/B5PP/5K2 b k - 0 17";
  const moves = "e8d7 a2e6 d7d8 f7f8";

  const originalBoard = new Chess(originalSourceFen);
  originalBoard.move({ from: "e8", to: "d7" });

  writeFileSync(
    resolve(fillerDir, "lichess-puzzle-catalog.json"),
    JSON.stringify([
      {
        id: "11111111-1111-4111-8111-111111111111",
        origin: "lichess_puzzle",
        fen: originalBoard.fen(),
        phase: "tactic",
        sourceRecordId: "lichess:00sHx",
      },
    ]),
    "utf8",
  );

  writeFileSync(
    resolve(inputDir, "lichess_db_puzzle.csv"),
    `${CSV_HEADER}\n00sHx,${changedSourceFen},${moves},1760,80,83,72,mate mateIn2 middlegame short,https://lichess.org/yyznGmXs/black#34,Italian_Game\n`,
    "utf8",
  );

  const scriptPath = createTempScript(tempRoot);

  assert.throws(
    () => {
      execFileSync(process.execPath, [scriptPath], {
        cwd: tempRoot,
        encoding: "utf8",
        stdio: "pipe",
      });
    },
    /Refusing to rebind existing filler UUID for lichess:00sHx/,
  );
});
