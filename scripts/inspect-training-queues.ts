import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const queueCore: typeof import("../lib/training/queue-core") = require("../lib/training/queue-core.ts");

const {
  getQueueCounts,
  normalizeRecentServedFens,
  selectAndReserveNextTrainingPositionCore,
} = queueCore;

type ProfileJson = {
  total_sequences?: unknown;
  exploit_queue?: unknown;
  explore_queue?: unknown;
  revisit_queue?: unknown;
  mastered_queue?: unknown;
  recent_served_fens?: unknown;
};

type QueueItem = import("../lib/training/queue-core").TrainingQueueItem;

async function main() {
  const profilePath = process.argv[2];
  if (!profilePath) {
    console.error("Usage: node --experimental-strip-types scripts/inspect-training-queues.ts <profile.json>");
    process.exitCode = 1;
    return;
  }

  const profile = JSON.parse(await readFile(resolve(process.cwd(), profilePath), "utf8")) as ProfileJson;
  const queues = {
    exploitQueue: normalizeQueue(profile.exploit_queue),
    exploreQueue: normalizeQueue(profile.explore_queue),
    revisitQueue: normalizeQueue(profile.revisit_queue),
    masteredQueue: normalizeQueue(profile.mastered_queue),
  };
  const recentServedFens = normalizeRecentServedFens(profile.recent_served_fens);
  const counts = getQueueCounts(queues);
  const duplicates = findDuplicateFens(queues);
  const next = await selectAndReserveNextTrainingPositionCore(queues, {
    completedSequenceCount: profile.total_sequences,
    recentServedFens,
    now: new Date(),
  });

  console.log(`exploit count: ${counts.exploit}`);
  console.log(`explore count: ${counts.explore}`);
  console.log(`revisit count: ${counts.revisit}`);
  console.log(`mastered count: ${counts.mastered}`);
  console.log(`recent served count: ${recentServedFens.length}`);
  console.log("");
  printFirstFive("exploit", queues.exploitQueue);
  printFirstFive("explore", queues.exploreQueue);
  printFirstFive("revisit", queues.revisitQueue);
  printFirstFive("mastered", queues.masteredQueue);
  console.log("");
  console.log(`duplicate FENs across queues: ${duplicates.length ? duplicates.join(", ") : "none"}`);
  console.log(`same FEN appears in multiple queues: ${duplicates.length > 0 ? "yes" : "no"}`);
  console.log(`next selected queue: ${next.selectedQueue}`);
  console.log(`next selected FEN: ${next.item?.fen ?? "none"}`);
  console.log(`next selected already recent: ${next.item ? recentServedFens.includes(next.item.fen) : "n/a"}`);
  console.log("near source repeat filter: TODO - queue items do not currently include game_id/ply metadata");
}

function normalizeQueue(value: unknown): QueueItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    const fen = typeof candidate.fen === "string" ? candidate.fen : "";
    const source = candidate.source;
    if (!fen || (source !== "initialization" && source !== "elite" && source !== "revisit")) return [];
    return [{
      fen,
      fingerprint: candidate.fingerprint ?? {},
      scheduledAt: typeof candidate.scheduledAt === "string" ? candidate.scheduledAt : new Date().toISOString(),
      source,
      cpLoss: typeof candidate.cpLoss === "number" ? candidate.cpLoss : undefined,
      sessionId: typeof candidate.sessionId === "string" ? candidate.sessionId : undefined,
    }];
  });
}

function printFirstFive(label: string, queue: QueueItem[]) {
  console.log(`${label} first 5:`);
  for (const fen of queue.slice(0, 5).map((item) => item.fen)) {
    console.log(`  ${fen}`);
  }
  if (queue.length === 0) console.log("  none");
}

function findDuplicateFens(queues: {
  exploitQueue: QueueItem[];
  exploreQueue: QueueItem[];
  revisitQueue: QueueItem[];
  masteredQueue: QueueItem[];
}) {
  const locations = new Map<string, Set<string>>();
  for (const [name, queue] of Object.entries(queues)) {
    for (const item of queue) {
      const current = locations.get(item.fen) ?? new Set<string>();
      current.add(name);
      locations.set(item.fen, current);
    }
  }

  return [...locations.entries()]
    .filter(([, queueNames]) => queueNames.size > 1)
    .map(([fen]) => fen);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
