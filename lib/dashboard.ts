import type { Json } from "@/lib/supabase/database";

export type DashboardClassifications = {
  best: number;
  excellent: number;
  good: number;
  okay: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  critical: number;
};

export type DashboardSummary = {
  totalSequences: number;
  movesEvaluated: number;
  blindspotsElo: number | null;
  eloDeltaSession: number | null;
  lastSessionAt: string | null;
  queueCounts: {
    mastered: number;
    revisit: number;
    targeted: number;
    explore: number;
    inProgress: number;
  };
  classifications: DashboardClassifications | null;
  clusters: Array<{
    id: string;
    label?: string;
    attempts: number;
    inaccuracy: number;
    mistake: number;
    blunder: number;
    critical: number;
    phase?: string;
    bucket?: string;
    tag?: string;
    severity: number;
  }>;
  recentSessions: Array<{
    id: string;
    ts: string;
    moves: number;
    delta: number | null;
    worst: string | null;
    href: string | null;
  }>;
};

type DashboardProfileInput = {
  total_sequences: number;
  blindspots_elo: number | null;
  last_session_at: string | null;
  exploit_queue: Json;
  explore_queue: Json;
  revisit_queue: Json;
  mastered_queue: Json;
  cluster_stats: Json;
};

type DashboardSessionInput = {
  id: string;
  completed_at: string | null;
  started_at: string;
  sequence_length: number;
  elo_delta: number | null;
  position_evaluations: Json;
};

type BuildDashboardSummaryInput = {
  profile: DashboardProfileInput | null;
  sessions: DashboardSessionInput[];
};

const CLASSIFICATION_KEYS = [
  "best",
  "excellent",
  "good",
  "okay",
  "inaccuracy",
  "mistake",
  "blunder",
  "critical",
] as const;

type DashboardClassification = (typeof CLASSIFICATION_KEYS)[number];

const MIN_CLUSTER_ATTEMPTS = 5;

const CLASSIFICATION_SEVERITY: Record<DashboardClassification, number> = {
  best: 0,
  excellent: 1,
  good: 2,
  okay: 2,
  inaccuracy: 3,
  mistake: 4,
  blunder: 5,
  critical: 6,
};

type PositionEvaluationInput = {
  classification: DashboardClassification;
  clusterId: string | null;
  phase: string | null;
  bucket: string | null;
  tags: string[];
};

type ClusterAccumulator = {
  id: string;
  attempts: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  critical: number;
  phase?: string;
  bucket?: string;
  tag?: string;
};

export function buildDashboardSummary({
  profile,
  sessions,
}: BuildDashboardSummaryInput): DashboardSummary {
  const evaluationsBySession = sessions.map((session) => normalizePositionEvaluations(session.position_evaluations));
  const evaluations = evaluationsBySession.flat();
  const classifications = buildClassificationCounts(evaluations);
  const clusterAttemptCounts = normalizeClusterAttemptCounts(profile?.cluster_stats);

  const exploitCount = jsonArrayLength(profile?.exploit_queue);
  const exploreCount = jsonArrayLength(profile?.explore_queue);
  const revisitCount = jsonArrayLength(profile?.revisit_queue);
  const masteredCount = jsonArrayLength(profile?.mastered_queue);

  return {
    totalSequences: profile?.total_sequences ?? 0,
    movesEvaluated: evaluations.length,
    blindspotsElo: typeof profile?.blindspots_elo === "number" ? profile.blindspots_elo : null,
    eloDeltaSession: typeof sessions[0]?.elo_delta === "number" ? sessions[0].elo_delta : null,
    lastSessionAt: profile?.last_session_at ?? sessions[0]?.completed_at ?? null,
    queueCounts: {
      mastered: masteredCount,
      revisit: revisitCount,
      targeted: exploitCount,
      explore: exploreCount,
      inProgress: exploitCount + exploreCount + revisitCount,
    },
    classifications,
    clusters: buildClusterSummaries(evaluations, clusterAttemptCounts),
    recentSessions: sessions.map((session, index) =>
      buildRecentSession(session, evaluationsBySession[index] ?? []),
    ),
  };
}

function emptyClassificationCounts(): DashboardClassifications {
  return {
    best: 0,
    excellent: 0,
    good: 0,
    okay: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    critical: 0,
  };
}

function buildClassificationCounts(evaluations: PositionEvaluationInput[]) {
  if (evaluations.length === 0) return null;
  const counts = emptyClassificationCounts();
  for (const evaluation of evaluations) {
    counts[evaluation.classification] += 1;
  }
  return counts;
}

function buildClusterSummaries(
  evaluations: PositionEvaluationInput[],
  clusterAttemptCounts: Record<string, number>,
): DashboardSummary["clusters"] {
  const clusters = new Map<string, ClusterAccumulator>();

  for (const evaluation of evaluations) {
    if (!evaluation.clusterId) continue;
    const cluster = clusters.get(evaluation.clusterId) ?? {
      id: evaluation.clusterId,
      attempts: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
      critical: 0,
    };

    cluster.attempts += 1;
    if (evaluation.classification === "inaccuracy") cluster.inaccuracy += 1;
    if (evaluation.classification === "mistake") cluster.mistake += 1;
    if (evaluation.classification === "blunder") cluster.blunder += 1;
    if (evaluation.classification === "critical") cluster.critical += 1;
    cluster.phase ??= evaluation.phase ?? parseClusterId(evaluation.clusterId).phase;
    cluster.bucket ??= evaluation.bucket ?? parseClusterId(evaluation.clusterId).bucket;
    cluster.tag ??= evaluation.tags[0];
    clusters.set(evaluation.clusterId, cluster);
  }

  return Array.from(clusters.values())
    .map((cluster) => {
      const parsed = parseClusterId(cluster.id);
      const attempts = Math.max(cluster.attempts, clusterAttemptCounts[cluster.id] ?? 0);
      const phase = cluster.phase ?? parsed.phase;
      const bucket = cluster.bucket ?? parsed.bucket;
      const tag = cluster.tag ?? parsed.tag;
      return {
        ...cluster,
        attempts,
        label: buildClusterLabel({ phase, bucket, tag }),
        phase,
        bucket,
        tag: tag ?? bucket,
        severity: cluster.critical * 5 + cluster.blunder * 4 + cluster.mistake * 3 + cluster.inaccuracy,
      };
    })
    .filter((cluster) => cluster.severity > 0)
    .filter((cluster) => cluster.attempts >= MIN_CLUSTER_ATTEMPTS)
    .filter((cluster) => cluster.phase !== "unknown")
    .filter((cluster) => cluster.bucket !== "wildcard")
    .sort((left, right) => right.severity - left.severity || right.attempts - left.attempts)
    .slice(0, 8);
}

function buildRecentSession(
  session: DashboardSessionInput,
  evaluations: PositionEvaluationInput[],
): DashboardSummary["recentSessions"][number] {
  return {
    id: session.id,
    ts: session.completed_at ?? session.started_at,
    moves: evaluations.length || session.sequence_length,
    delta: typeof session.elo_delta === "number" ? session.elo_delta : null,
    worst: getWorstClassification(evaluations),
    href: null,
  };
}

function getWorstClassification(evaluations: PositionEvaluationInput[]) {
  let worst: DashboardClassification | null = null;
  for (const evaluation of evaluations) {
    if (!worst || CLASSIFICATION_SEVERITY[evaluation.classification] > CLASSIFICATION_SEVERITY[worst]) {
      worst = evaluation.classification;
    }
  }
  return worst;
}

function normalizePositionEvaluations(raw: Json): PositionEvaluationInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, Json | undefined>;
    const classification = normalizeClassification(entry.classification);
    if (!classification) return [];
    const tags = Array.isArray(entry.tags)
      ? entry.tags.filter((tag): tag is string => typeof tag === "string")
      : [];
    return [
      {
        classification,
        clusterId: typeof entry.clusterId === "string" ? entry.clusterId : null,
        phase: typeof entry.phase === "string" ? entry.phase : null,
        bucket: typeof entry.bucket === "string" ? entry.bucket : null,
        tags,
      },
    ];
  });
}

function normalizeClassification(value: Json | undefined): DashboardClassification | null {
  return typeof value === "string" && isDashboardClassification(value) ? value : null;
}

function isDashboardClassification(value: string): value is DashboardClassification {
  return CLASSIFICATION_KEYS.includes(value as DashboardClassification);
}

function normalizeClusterAttemptCounts(raw: Json | undefined): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const attempts = (value as Record<string, Json | undefined>).attempts;
    if (typeof attempts === "number" && Number.isFinite(attempts) && attempts > 0) {
      result[id] = attempts;
    }
  }
  return result;
}

function parseClusterId(id: string) {
  const parts = id.split(":");

  if (parts[0] === "app" && parts[1] === "v1") {
    return {
      version: "v1",
      phase: parts[2] || undefined,
      bucket: parts[3] || undefined,
      tag: parts.slice(4).join(":") || undefined,
    };
  }

  if (parts[0] === "app" && parts[1] === "v0") {
    return {
      version: "v0",
      phase: parts[2] || undefined,
      bucket: parts.slice(3).join(":") || undefined,
      tag: undefined,
    };
  }

  return {
    version: "unknown",
    phase: undefined,
    bucket: undefined,
    tag: undefined,
  };
}

function buildClusterLabel({
  phase,
  bucket,
  tag,
}: {
  phase?: string;
  bucket?: string;
  tag?: string;
}) {
  const prettyPhase = humanizeClusterPart(phase);
  const prettyBucket = humanizeBucket(bucket);
  const prettyTag = humanizeClusterPart(tag);
  if (bucket === "tactic") return "Tactical Positions";
  const parts = [prettyPhase];

  if (prettyBucket && prettyBucket !== prettyPhase) {
    parts.push(prettyBucket);
  }

  if (
    prettyTag &&
    prettyTag !== "General" &&
    prettyTag !== prettyPhase &&
    prettyTag !== prettyBucket
  ) {
    parts.push(prettyTag);
  }

  return parts.filter(Boolean).join(" — ") || "General";
}

function humanizeBucket(bucket?: string) {
  if (!bucket) return "";
  const labels: Record<string, string> = {
    opening: "Opening",
    opening_gambit: "Gambit",
    opening_development: "Development",
    middlegame: "Middlegame",
    middlegame_attack: "Attack",
    middlegame_positional: "Positional",
    endgame: "Endgame",
    endgame_rook: "Rook Endgame",
    endgame_pawn: "Pawn Endgame",
    tactic: "Tactical Positions",
    wildcard: "General",
  };
  return labels[bucket] ?? humanizeClusterPart(bucket);
}

function humanizeClusterPart(value?: string) {
  if (!value) return "";
  const upper = value.toUpperCase();
  if (/^[A-E][0-9]{2}$/.test(upper)) return upper;

  return value
    .replace(/^app:v\d+:/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function jsonArrayLength(raw: Json | undefined) {
  return Array.isArray(raw) ? raw.length : 0;
}
