const assert = require("node:assert/strict");
const test = require("node:test");
const { Chess } = require("chess.js");
const terminalDisplay = require("../lib/training/postmortem-terminal-display.ts");

const {
  getEvalBarFill,
  formatPostmortemEvalLabel,
  getPostmortemTerminalDisplay,
  whitePositiveMateCp,
} = terminalDisplay;

test("fool's mate terminal board reports decisive eval and game-over empty message", () => {
  const chess = new Chess();
  chess.move("f4");
  chess.move("e5");
  chess.move("g4");
  chess.move("Qh4#");

  const display = getPostmortemTerminalDisplay(chess.fen());

  assert.equal(chess.isCheckmate(), true);
  assert.equal(display.evalCp, -600);
  assert.equal(display.evalMate, 0);
  assert.equal(display.engineEmptyMessage, "Game over. No more moves available.");
});

test("non-terminal board does not override engine display", () => {
  const display = getPostmortemTerminalDisplay(new Chess().fen());

  assert.equal(display.evalCp, null);
  assert.equal(display.evalMate, null);
  assert.equal(display.engineEmptyMessage, null);
});

test("mate eval labels preserve mate distance while stepping through postmortem", () => {
  assert.equal(formatPostmortemEvalLabel(600, 0), "M0");
  assert.equal(formatPostmortemEvalLabel(600, 1), "M1");
  assert.equal(formatPostmortemEvalLabel(600, 2), "M2");
  assert.equal(formatPostmortemEvalLabel(-600, -1), "M1");
  assert.equal(formatPostmortemEvalLabel(-600, -2), "M2");
});

test("mate bar score normalizes stockfish mate sign to white perspective", () => {
  const afterG5CheckFen = "8/2p2Q1p/6pk/2b1N1P1/8/5NKP/2q2r2/8 b - - 0 43";

  assert.equal(whitePositiveMateCp(afterG5CheckFen, -1), 600);
  assert.equal(whitePositiveMateCp(afterG5CheckFen, 1), -600);
  assert.equal(whitePositiveMateCp(new Chess().fen(), 1), 600);
  assert.equal(whitePositiveMateCp(new Chess().fen(), -1), -600);
});

test("mate zero still fills the eval bar decisively from centipawn sign", () => {
  const afterG5CheckFen = "8/2p2Q1p/6pk/2b1N1P1/8/5NKP/2q2r2/8 b - - 0 43";

  assert.equal(whitePositiveMateCp(afterG5CheckFen, 0, 100), 600);
  assert.equal(whitePositiveMateCp(afterG5CheckFen, 0, -100), -600);
});

test("mate evals fill the bar completely for the winning side", () => {
  assert.deepEqual(getEvalBarFill(100, 1, 600), {
    whitePct: 100,
    blackPct: 0,
    decisiveSide: "white",
  });
  assert.deepEqual(getEvalBarFill(-100, -1, -600), {
    whitePct: 0,
    blackPct: 100,
    decisiveSide: "black",
  });
  assert.deepEqual(getEvalBarFill(600, null, null), {
    whitePct: 92,
    blackPct: 8,
    decisiveSide: null,
  });
});
