import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import path from "path";

interface MaiaWorkerResponse {
  id?: string;
  ok?: boolean;
  error?: string;
  event?: string;
  move?: string;
  model_type?: string;
  elo_self?: number;
  elo_oppo?: number;
  win_prob?: number;
  top_moves?: Array<{
    uci: string;
    probability: number;
  }>;
  traceback?: string;
}

interface PendingRequest {
  resolve: (value: MaiaMoveResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface MaiaMoveRequest {
  fen: string;
  eloSelf: number;
  eloOppo: number;
  modelType?: "blitz" | "rapid";
  topK?: number;
  topMoves?: number;
  temperature?: number;
  seed?: number;
}

export interface MaiaMoveResult {
  move: string;
  modelType: "blitz" | "rapid";
  eloSelf: number;
  eloOppo: number;
  winProb: number;
  topMoves: Array<{
    uci: string;
    probability: number;
  }>;
}

class Maia2WorkerManager {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private stdoutBuffer = "";
  private requestCounter = 0;
  private pending = new Map<string, PendingRequest>();

  private start() {
    if (this.proc) return;

    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const workerPath = path.resolve(process.cwd(), "services/maia2/worker.py");
    this.proc = spawn(pythonCmd, [workerPath], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk;
      let newlineIndex = this.stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const rawLine = this.stdoutBuffer.slice(0, newlineIndex).trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
        if (rawLine) this.handleStdoutLine(rawLine);
        newlineIndex = this.stdoutBuffer.indexOf("\n");
      }
    });

    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk: string) => {
      const text = String(chunk || "").trim();
      if (text) console.warn(`[maia2:worker] ${text}`);
    });

    this.proc.on("error", (error) => {
      this.failAllPending(new Error(`Maia worker spawn failed: ${error.message}`));
      this.readyReject?.(new Error(`Maia worker spawn failed: ${error.message}`));
      this.reset();
    });

    this.proc.on("exit", (code, signal) => {
      const detail = `code=${code ?? "null"} signal=${signal ?? "null"}`;
      this.failAllPending(new Error(`Maia worker exited unexpectedly (${detail})`));
      this.readyReject?.(new Error(`Maia worker exited unexpectedly (${detail})`));
      this.reset();
    });
  }

  private handleStdoutLine(line: string) {
    let payload: MaiaWorkerResponse;
    try {
      payload = JSON.parse(line) as MaiaWorkerResponse;
    } catch {
      console.warn(`[maia2:worker] non-json stdout: ${line}`);
      return;
    }

    if (payload.event === "ready") {
      this.readyResolve?.();
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }

    const id = String(payload.id || "").trim();
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timeout);

    if (!payload.ok || !payload.move) {
      pending.reject(
        new Error(
          String(payload.error || payload.traceback || "Maia worker returned an invalid response."),
        ),
      );
      return;
    }

    pending.resolve({
      move: payload.move,
      modelType: payload.model_type === "rapid" ? "rapid" : "blitz",
      eloSelf: Number(payload.elo_self) || 1500,
      eloOppo: Number(payload.elo_oppo) || 1500,
      winProb: Number(payload.win_prob) || 0,
      topMoves: Array.isArray(payload.top_moves)
        ? payload.top_moves
            .map((entry) => ({
              uci: String(entry?.uci || "").trim(),
              probability: Number(entry?.probability) || 0,
            }))
            .filter((entry) => entry.uci)
        : [],
    });
  }

  private failAllPending(error: Error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timeout);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private reset() {
    this.proc = null;
    this.readyPromise = null;
    this.readyResolve = null;
    this.readyReject = null;
    this.stdoutBuffer = "";
  }

  async requestMove(input: MaiaMoveRequest): Promise<MaiaMoveResult> {
    this.start();
    await this.readyPromise;
    if (!this.proc) {
      throw new Error("Maia worker is unavailable.");
    }

    const id = `maia-${Date.now()}-${this.requestCounter += 1}`;
    const payload = {
      id,
      action: "move",
      fen: input.fen,
      elo_self: Math.round(input.eloSelf),
      elo_oppo: Math.round(input.eloOppo),
      model_type: input.modelType === "rapid" ? "rapid" : "blitz",
      top_k: Math.max(1, Math.min(24, Math.round(input.topK || 8))),
      top_moves: Math.max(1, Math.min(24, Math.round(input.topMoves || 8))),
      temperature: Number.isFinite(input.temperature) ? input.temperature : 1,
      seed: Number.isFinite(input.seed) ? Math.round(Number(input.seed)) : undefined,
    };

    return new Promise<MaiaMoveResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Maia worker timed out."));
      }, 180_000);

      this.pending.set(id, { resolve, reject, timeout });
      this.proc?.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __chessviewMaia2WorkerManager: Maia2WorkerManager | undefined;
}

function getManager() {
  if (!global.__chessviewMaia2WorkerManager) {
    global.__chessviewMaia2WorkerManager = new Maia2WorkerManager();
  }
  return global.__chessviewMaia2WorkerManager;
}

export async function getMaiaMove(input: MaiaMoveRequest) {
  return getManager().requestMove(input);
}

const maia2Service = {
  getMaiaMove,
};

export default maia2Service;
