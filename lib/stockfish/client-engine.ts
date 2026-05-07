import { parseBestMove, parseUciInfoLine } from "./uci-parser";
import { selectCoherentClientLines } from "./client-line-snapshots";
import type {
  AnalyzeFenInput,
  AnalyzeFenResult,
  ClientEngineLine,
  ClientStockfishOptions,
} from "./types";

const DEFAULT_WORKER_URL = "/analyze/stockfish.js";
const DEFAULT_HASH_MB = 64;
const DEFAULT_MULTIPV = 3;
const DEFAULT_MOVETIME_MS = 800;
const INIT_TIMEOUT_MS = 8000;
const SEARCH_TIMEOUT_BUFFER_MS = 2500;

type PendingReady = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingSearch = {
  id: number;
  multiPv: number;
  linesByRank: Map<number, ClientEngineLine>;
  lineHistory: ClientEngineLine[];
  bestMove: string | null;
  onUpdate?: (lines: ClientEngineLine[]) => void;
  resolve: (result: AnalyzeFenResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let sharedEngine: ClientStockfishEngine | null = null;

export class ClientStockfishEngine {
  private worker: Worker | null = null;
  private initPromise: Promise<void> | null = null;
  private pendingUci: PendingReady | null = null;
  private pendingReady: PendingReady | null = null;
  private pendingSearch: PendingSearch | null = null;
  private searchId = 0;
  private configuredMultiPv: number | null = null;
  private disposed = false;

  constructor(private readonly options: ClientStockfishOptions = {}) {}

  async analyzeFen(input: AnalyzeFenInput): Promise<AnalyzeFenResult> {
    this.assertBrowser();
    await this.init();
    this.stop();

    const multiPv = clampInteger(input.multiPv ?? DEFAULT_MULTIPV, 1, 32);
    const movetimeMs = clampInteger(input.movetimeMs ?? DEFAULT_MOVETIME_MS, 20, 60_000);

    if (this.configuredMultiPv !== multiPv) {
      this.post(`setoption name MultiPV value ${multiPv}`);
      await this.waitUntilReady();
      this.configuredMultiPv = multiPv;
    }

    this.post(`position fen ${input.fen}`);

    return new Promise<AnalyzeFenResult>((resolve, reject) => {
      const id = ++this.searchId;
      const timer = setTimeout(() => {
        if (this.pendingSearch?.id !== id) return;
        this.pendingSearch = null;
        reject(new Error("Client Stockfish search timed out."));
      }, movetimeMs + SEARCH_TIMEOUT_BUFFER_MS);

      this.pendingSearch = {
        id,
        multiPv,
        linesByRank: new Map(),
        lineHistory: [],
        bestMove: null,
        onUpdate: input.onUpdate,
        resolve,
        reject,
        timer,
      };

      this.post(`go movetime ${movetimeMs}`);
    });
  }

  stop() {
    if (!this.worker) return;
    this.post("stop");
    this.rejectPendingSearch(new Error("Client Stockfish search stopped."));
  }

  dispose() {
    this.disposed = true;
    this.rejectPending(new Error("Client Stockfish disposed."));
    this.worker?.terminate();
    this.worker = null;
    this.initPromise = null;
    if (sharedEngine === this) sharedEngine = null;
  }

  private init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker(this.options.workerUrl ?? DEFAULT_WORKER_URL);
        this.worker.addEventListener("message", this.handleMessage);
        this.worker.addEventListener("error", (event) => {
          const error = new Error(event.message || "Client Stockfish worker error.");
          this.rejectPending(error);
          reject(error);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Client Stockfish worker failed to start."));
        return;
      }

      this.pendingUci = this.createPendingReady(resolve, reject, "Client Stockfish UCI init timed out.");
      this.post("uci");
    }).then(async () => {
      this.post(`setoption name Hash value ${clampInteger(this.options.hashMb ?? DEFAULT_HASH_MB, 1, 1024)}`);
      await this.waitUntilReady();
    });

    return this.initPromise;
  }

  private waitUntilReady() {
    return new Promise<void>((resolve, reject) => {
      this.pendingReady = this.createPendingReady(resolve, reject, "Client Stockfish readiness timed out.");
      this.post("isready");
    });
  }

  private createPendingReady(
    resolve: () => void,
    reject: (error: Error) => void,
    message: string,
  ): PendingReady {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, INIT_TIMEOUT_MS);
    return { resolve, reject, timer };
  }

  private handleMessage = (event: MessageEvent) => {
    const line = typeof event.data === "string" ? event.data.trim() : "";
    if (!line) return;

    if (line === "uciok") {
      this.resolvePendingReady("uci");
      return;
    }

    if (line === "readyok") {
      this.resolvePendingReady("ready");
      return;
    }

    const search = this.pendingSearch;
    if (!search) return;

    const parsedLine = parseUciInfoLine(line);
    if (parsedLine) {
      search.linesByRank.set(parsedLine.rank, parsedLine);
      search.lineHistory.push(parsedLine);
      search.onUpdate?.(this.currentLines(search));
      return;
    }

    if (line.startsWith("bestmove ")) {
      search.bestMove = parseBestMove(line);
      this.pendingSearch = null;
      clearTimeout(search.timer);
      search.resolve({
        lines: this.currentLines(search),
        bestMove: search.bestMove,
      });
    }
  };

  private currentLines(search: PendingSearch) {
    return selectCoherentClientLines(search.linesByRank, search.lineHistory, search.multiPv);
  }

  private resolvePendingReady(kind: "uci" | "ready") {
    const pending = kind === "uci" ? this.pendingUci : this.pendingReady;
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.resolve();
    if (kind === "uci") this.pendingUci = null;
    else this.pendingReady = null;
  }

  private clearPendingSearch() {
    if (!this.pendingSearch) return;
    clearTimeout(this.pendingSearch.timer);
    this.pendingSearch = null;
  }

  private rejectPendingSearch(error: Error) {
    if (!this.pendingSearch) return;
    const search = this.pendingSearch;
    this.pendingSearch = null;
    clearTimeout(search.timer);
    search.reject(error);
  }

  private rejectPending(error: Error) {
    this.pendingUci?.reject(error);
    this.pendingReady?.reject(error);
    this.rejectPendingSearch(error);
    this.pendingUci = null;
    this.pendingReady = null;
  }

  private post(command: string) {
    if (this.disposed) throw new Error("Client Stockfish engine is disposed.");
    if (!this.worker) throw new Error("Client Stockfish worker is not initialized.");
    this.worker.postMessage(command);
  }

  private assertBrowser() {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      throw new Error("Client Stockfish engine can only run in a browser with Worker support.");
    }
  }
}

export function getClientStockfishEngine(options?: ClientStockfishOptions) {
  if (!sharedEngine) sharedEngine = new ClientStockfishEngine(options);
  return sharedEngine;
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
