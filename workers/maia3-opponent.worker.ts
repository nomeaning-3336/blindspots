/// <reference lib="webworker" />

import { Chess } from "chess.js";
import * as ort from "onnxruntime-web/wasm";
import { buildMaiaHistoryTokens } from "@/lib/maia3/maia3-tokenizer";
import {
  decodeMaiaMoveIndex,
  getLegalMaiaMoveIndices,
} from "@/lib/maia3/maia3-moves";
import type {
  Maia3WorkerRequest,
  Maia3WorkerResponse,
} from "@/lib/maia3/maia3-worker-protocol";

let session: ort.InferenceSession | null = null;

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = "/models/maia3/ort/";

function post(response: Maia3WorkerResponse) {
  self.postMessage(response);
}

function currentBoard(startingFen: string, moveUcis: string[]): Chess {
  const chess = new Chess(startingFen);

  for (const uci of moveUcis) {
    const played = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });

    if (!played) {
      throw new Error(`Maia request contains an illegal move: ${uci}`);
    }
  }

  return chess;
}

async function initialize(modelUrl: string) {
  session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ["wasm"],
  });
  post({ type: "ready" });
}

async function generateMove(request: Extract<Maia3WorkerRequest, { type: "generate-move" }>) {
  if (!session) {
    throw new Error("Maia session is not initialized.");
  }

  const chess = currentBoard(request.startingFen, request.moveUcis);

  if (chess.isGameOver()) {
    throw new Error("Maia cannot move from a terminal position.");
  }

  const tokens = buildMaiaHistoryTokens({
    startingFen: request.startingFen,
    moveUcis: request.moveUcis,
  });
  const feeds: Record<string, ort.Tensor> = {
    tokens: new ort.Tensor("float32", tokens, [1, 64, 97]),
    self_elos: new ort.Tensor("int64", BigInt64Array.from([BigInt(request.selfElo)]), [1]),
    oppo_elos: new ort.Tensor("int64", BigInt64Array.from([BigInt(request.oppoElo)]), [1]),
  };
  const outputs = await session.run(feeds);
  const logitsMove = outputs.logits_move?.data;

  if (!logitsMove) {
    throw new Error("Maia inference did not return move logits.");
  }

  const legalIndices = getLegalMaiaMoveIndices(chess);
  let bestIndex: number | null = null;
  let bestLogit = Number.NEGATIVE_INFINITY;

  for (const index of legalIndices) {
    const value = Number(logitsMove[index]);

    if (value > bestLogit) {
      bestLogit = value;
      bestIndex = index;
    }
  }

  if (bestIndex === null) {
    throw new Error("Maia found no legal moves.");
  }

  const uci = decodeMaiaMoveIndex(bestIndex, chess);

  if (!uci) {
    throw new Error("Maia selected an illegal move.");
  }

  post({ type: "move", requestId: request.requestId, uci });
}

self.onmessage = (event: MessageEvent<Maia3WorkerRequest>) => {
  const request = event.data;

  void (async () => {
    try {
      if (request.type === "initialize") {
        await initialize(request.modelUrl);
        return;
      }

      await generateMove(request);
    } catch (error) {
      post({
        type: "error",
        requestId: request.type === "generate-move" ? request.requestId : undefined,
        message: error instanceof Error ? error.message : "Maia worker failed.",
      });
    }
  })();
};
