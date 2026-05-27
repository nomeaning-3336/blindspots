import { analyzeClientSequence, type ClientFenEvaluation } from "@/lib/stockfish-client/sequence-analysis";
import type { StockfishAnalysisRequest, StockfishAnalysisResponse } from "@/lib/stockfish-client/stockfish-analysis-protocol";

const STOCKFISH_WORKER_URL = "/analyze/stockfish.js";
const SEARCH_DEPTH = 16;
const INIT_TIMEOUT_MS = 8000;
const SEARCH_TIMEOUT_MS = 20000;

let engine: Worker | null = null;
let pendingReady: { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
let pendingSearch:
  | {
      resolve: (evaluation: ClientFenEvaluation) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      latest: ClientFenEvaluation;
    }
  | null = null;
let initialized = false;
let analyzing = false;

self.onmessage = (event: MessageEvent<StockfishAnalysisRequest>) => {
  const request = event.data;

  if (request.type === "initialize") {
    void initializeEngine();
    return;
  }

  if (request.type === "analyze-sequence") {
    void analyzeSequenceRequest(request);
  }
};

async function initializeEngine() {
  if (initialized) {
    post({ type: "ready" });
    return;
  }

  try {
    engine = new Worker(STOCKFISH_WORKER_URL);
    engine.onmessage = (event: MessageEvent) => handleEngineLine(String(event.data ?? "").trim());
    engine.onerror = () => {
      const error = new Error("Stockfish failed.");
      pendingReady?.reject(error);
      pendingSearch?.reject(error);
    };

    await waitForCommand("uci", "uciok");
    send("setoption name MultiPV value 1");
    await waitForCommand("isready", "readyok");
    initialized = true;
    post({ type: "ready" });
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : "Stockfish initialization failed.",
    });
  }
}

async function analyzeSequenceRequest(
  request: Extract<StockfishAnalysisRequest, { type: "analyze-sequence" }>,
) {
  if (analyzing) {
    post({ type: "error", requestId: request.requestId, message: "Stockfish analysis is already running." });
    return;
  }

  analyzing = true;

  try {
    await initializeEngine();
    const analysis = await analyzeClientSequence({
      startingFen: request.startingFen,
      moveUcis: request.moveUcis,
      learnerSide: request.learnerSide,
      evaluateFen,
    });

    post({ type: "analysis-result", requestId: request.requestId, analysis });
  } catch (error) {
    post({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Stockfish analysis failed.",
    });
  } finally {
    analyzing = false;
  }
}

function evaluateFen(fen: string): Promise<ClientFenEvaluation> {
  send(`position fen ${fen}`);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingSearch = null;
      reject(new Error("Stockfish analysis timed out."));
    }, SEARCH_TIMEOUT_MS);

    pendingSearch = {
      resolve,
      reject,
      timer,
      latest: {
        cp: 0,
        mate: null,
        bestMoveUci: null,
        bestLineUcis: [],
      },
    };

    send(`go depth ${SEARCH_DEPTH}`);
  });
}

function waitForCommand(command: string, expected: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingReady = null;
      reject(new Error(`Stockfish command timed out: ${command}`));
    }, INIT_TIMEOUT_MS);

    pendingReady = {
      resolve: () => {
        clearTimeout(timer);
        pendingReady = null;
        resolve();
      },
      reject,
      timer,
    };
    send(command);
    expectedReadyLine = expected;
  });
}

let expectedReadyLine: string | null = null;

function handleEngineLine(line: string) {
  if (!line) return;

  if (pendingReady && line === expectedReadyLine) {
    pendingReady.resolve();
    expectedReadyLine = null;
    return;
  }

  if (!pendingSearch) return;

  const info = parseInfoLine(line);
  if (info) {
    pendingSearch.latest = info;
    return;
  }

  if (line.startsWith("bestmove ")) {
    const bestMove = line.split(/\s+/)[1] ?? null;
    const search = pendingSearch;
    pendingSearch = null;
    clearTimeout(search.timer);
    search.resolve({
      ...search.latest,
      bestMoveUci: search.latest.bestMoveUci ?? bestMove,
    });
  }
}

function parseInfoLine(line: string): ClientFenEvaluation | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;

  const parts = line.split(/\s+/);
  const scoreIndex = parts.indexOf("score");
  const pvIndex = parts.indexOf("pv");

  if (scoreIndex < 0 || pvIndex < 0) return null;

  const scoreType = parts[scoreIndex + 1];
  const scoreValue = Number(parts[scoreIndex + 2]);
  const pv = parts.slice(pvIndex + 1);

  return {
    cp: scoreType === "cp" && Number.isFinite(scoreValue) ? scoreValue : null,
    mate: scoreType === "mate" && Number.isFinite(scoreValue) ? scoreValue : null,
    bestMoveUci: pv[0] ?? null,
    bestLineUcis: pv,
  };
}

function send(command: string) {
  if (!engine) throw new Error("Stockfish is not initialized.");
  engine.postMessage(command);
}

function post(response: StockfishAnalysisResponse) {
  self.postMessage(response);
}
