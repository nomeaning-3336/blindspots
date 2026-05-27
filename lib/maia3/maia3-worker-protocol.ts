export type Maia3WorkerRequest =
  | { type: "initialize"; modelUrl: string }
  | {
      type: "generate-move";
      requestId: string;
      startingFen: string;
      moveUcis: string[];
      selfElo: number;
      oppoElo: number;
    };

export type Maia3WorkerResponse =
  | { type: "ready" }
  | { type: "move"; requestId: string; uci: string }
  | { type: "error"; requestId?: string; message: string };
