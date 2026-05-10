import type { Json } from "@/lib/supabase/database";

export type DashboardClassifications = {
  brilliant: number;
  critical: number;
  best: number;
  excellent: number;
  good: number;
  okay: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
};

export type DashboardPosition = {
  id: string;
  startingFen: string;
  sourceType: string;
  sourceLabel: string;
  status: string;
  statusLabel: string;
  queueLabel?: string;
  openingName: string | null;
  lastResult: "pass" | "acceptable" | "fail" | null;
  lastAttemptAt: string | null;
  nextReviewAt: string | null;
  attempts: number;
  cpLoss: number | null;
  worstMoveLossCp: number | null;
  servedCount: number;
  previousFen: string | null;
  playedMoveUci: string | null;
  decisionEvalCp: number | null;
  consecutiveCorrectCount: number;
  moveKey: string | null;
  moveNotes: DashboardMoveNote[];
};

export type DashboardMoveNote = {
  moveKey: string;
  note: string;
  classification: string | null;
  evalBeforeCp: number | null;
  evalAfterCp: number | null;
  moveSan: string | null;
  moveUci: string | null;
};

export type EloHistoryPoint = {
  elo: number;
  ts: string;
};

export type DashboardCluster = {
  id: string;
  label: string;
  attempts: number;
  failures: number;
};

export type DashboardSummary = {
  totalSequences: number;
  movesEvaluated: number;
  blindspotsElo: number | null;
  eloDeltaSession: number | null;
  lastSessionAt: string | null;
  eloHistory: EloHistoryPoint[];
  queueCounts: {
    mastered: number;
    revisit: number;
    targeted: number;
    explore: number;
    inProgress: number;
  };
  queueOverview: {
    reviewDue: number;
    active: number;
    filler: number;
    mastered: number;
    retired: number;
  };
  recentPassRate: number | null;
  avgEvalLossCp: number | null;
  classifications: DashboardClassifications | null;
  clusters: DashboardCluster[];
  recentPositions: DashboardPosition[];
  positions: DashboardPosition[];
  recentSessions: Array<{
    id: string;
    ts: string;
    title: string;
    moves: number;
    delta: number | null;
    worst: string | null;
    href: string | null;
    startingFen: string;
    outcome: "pass" | "acceptable" | "fail" | null;
    avgCpLoss: number | null;
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
  elo_after: number | null;
  starting_fen: string;
  training_outcome: "pass" | "acceptable" | "fail" | null;
  average_cp_loss: number | null;
  position_evaluations: Json;
};

type DashboardMistakeInput = {
  id: string;
  source_type: string;
  starting_fen: string;
  status: string;
  opening_name: string | null;
  review_count: number;
  pass_count: number;
  acceptable_count: number;
  fail_count: number;
  last_attempt_at: string | null;
  next_review_at: string | null;
  cp_loss: number | null;
  served_count: number;
  setup_previous_fen: string | null;
  setup_played_move_uci: string | null;
  eval_before_cp: number | null;
  consecutive_correct_count: number;
  move_key: string | null;
};

type BuildDashboardSummaryInput = {
  profile: DashboardProfileInput | null;
  sessions: DashboardSessionInput[];
  mistakes: DashboardMistakeInput[];
  avgCpLoss: number | null;
  notes: Array<{
    move_key: string;
    note_text: string;
    classification: string | null;
    eval_before_cp: number | null;
    eval_after_cp: number | null;
    move_san: string | null;
    move_uci: string | null;
  }>;
};

const CLASSIFICATION_KEYS = [
  "brilliant",
  "critical",
  "best",
  "excellent",
  "good",
  "okay",
  "inaccuracy",
  "mistake",
  "blunder",
] as const;

type DashboardClassification = (typeof CLASSIFICATION_KEYS)[number];

const CLASSIFICATION_SEVERITY: Record<DashboardClassification, number> = {
  brilliant: 0,
  critical: 1,
  best: 2,
  excellent: 3,
  good: 4,
  okay: 4,
  inaccuracy: 5,
  mistake: 6,
  blunder: 7,
};

type PositionEvaluationInput = {
  classification: DashboardClassification;
  clusterId: string | null;
  phase: string | null;
  bucket: string | null;
  tags: string[];
  openingName: string | null;
  eco: string | null;
};

export function buildDashboardSummary({
  profile,
  sessions,
  mistakes,
  avgCpLoss,
  notes,
}: BuildDashboardSummaryInput): DashboardSummary {
  const evaluationsBySession = sessions.map((session) => normalizePositionEvaluations(session.position_evaluations));
  const evaluations = evaluationsBySession.flat();
  const classifications = buildClassificationCounts(evaluations);
  const clusters = buildDashboardClusters(evaluations);

  const exploitCount = jsonArrayLength(profile?.exploit_queue);
  const exploreCount = jsonArrayLength(profile?.explore_queue);
  const revisitCount = jsonArrayLength(profile?.revisit_queue);
  const masteredCount = jsonArrayLength(profile?.mastered_queue);

  const notesByKey = new Map<string, DashboardMoveNote>();
  for (const n of notes) {
    if (n.move_key) {
      notesByKey.set(n.move_key, {
        moveKey: n.move_key,
        note: n.note_text,
        classification: n.classification,
        evalBeforeCp: n.eval_before_cp,
        evalAfterCp: n.eval_after_cp,
        moveSan: n.move_san,
        moveUci: n.move_uci,
      });
    }
  }

  const mistakePositions = buildPositionRows(mistakes, notesByKey);
  const sessionPositions = buildSessionPositionRows(sessions);
  const positions = sortDashboardPositions([...mistakePositions, ...sessionPositions]);
  const recentPositions = positions.slice(0, 8);

  const queueOverview = buildQueueOverview(mistakes);
  const recentPassRate = computePassRate(mistakes);

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
    queueOverview,
    recentPassRate,
    avgEvalLossCp: avgCpLoss,
    classifications,
    clusters,
    recentPositions,
    positions,
    eloHistory: buildEloHistory(sessions),
    recentSessions: sessions.map((session, index) =>
      buildRecentSession(session, evaluationsBySession[index] ?? []),
    ),
  };
}

function buildPositionRows(
  mistakes: DashboardMistakeInput[],
  notesByKey: Map<string, DashboardMoveNote>,
): DashboardPosition[] {
  return mistakes.map((m) => {
    const moveNotes: DashboardMoveNote[] = [];
    if (m.move_key) {
      const note = notesByKey.get(m.move_key);
      if (note) moveNotes.push(note);
    }
    return {
      id: m.id,
      startingFen: m.starting_fen,
      sourceType: m.source_type,
      sourceLabel: sourceTypeLabel(m.source_type),
      status: m.status,
      statusLabel: statusLabel(m.status),
      queueLabel: queueLabel(m.status, m.source_type),
      openingName: m.opening_name,
      lastResult: inferLastResult(m),
      lastAttemptAt: m.last_attempt_at,
      nextReviewAt: m.next_review_at,
      attempts: m.review_count,
      cpLoss: m.cp_loss,
      worstMoveLossCp: m.cp_loss,
      servedCount: m.served_count,
      previousFen: m.setup_previous_fen,
      playedMoveUci: m.setup_played_move_uci,
      decisionEvalCp: m.eval_before_cp,
      consecutiveCorrectCount: m.consecutive_correct_count,
      moveKey: m.move_key,
      moveNotes,
    };
  });
}

function buildSessionPositionRows(sessions: DashboardSessionInput[]): DashboardPosition[] {
  return sessions.map((session) => ({
    id: `session:${session.id}`,
    startingFen: session.starting_fen,
    sourceType: "training_session",
    sourceLabel: "Training session",
    status: "session",
    statusLabel: "Completed",
    queueLabel: undefined,
    openingName: null,
    lastResult: session.training_outcome,
    lastAttemptAt: session.completed_at ?? session.started_at,
    nextReviewAt: null,
    attempts: 1,
    cpLoss: session.average_cp_loss,
    worstMoveLossCp: session.average_cp_loss,
    servedCount: 1,
    previousFen: null,
    playedMoveUci: null,
    decisionEvalCp: null,
    consecutiveCorrectCount: 0,
    moveKey: null,
    moveNotes: [],
  }));
}

function sortDashboardPositions(positions: DashboardPosition[]): DashboardPosition[] {
  return [...positions].sort((left, right) => positionTimestamp(right) - positionTimestamp(left));
}

function positionTimestamp(position: DashboardPosition): number {
  const value = position.lastAttemptAt ?? position.nextReviewAt ?? "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildQueueOverview(mistakes: DashboardMistakeInput[]) {
  let reviewDue = 0;
  let active = 0;
  let filler = 0;
  let mastered = 0;
  let retired = 0;
  const now = new Date().toISOString();

  for (const m of mistakes) {
    if (m.status === "mastered") { mastered++; continue; }
    if (m.status === "retired") { retired++; continue; }

    const isDue = typeof m.next_review_at === "string" && m.next_review_at <= now;

    if (m.status === "review") {
      if (isDue) reviewDue++;
      continue;
    }
    if (m.source_type === "lichess_puzzle_filler") { filler++; continue; }

    // Active app-training mistake is always "active" in the queue overview.
    // If its next_review_at is past, it also counts toward "Review due".
    if (m.source_type === "app_training" && isDue) reviewDue++;

    active++;
  }

  return { reviewDue, active, filler, mastered, retired };
}

function computePassRate(mistakes: DashboardMistakeInput[]): number | null {
  const attempted = mistakes.filter((m) => m.review_count > 0);
  if (attempted.length === 0) return null;
  const totalPass = attempted.reduce((sum, m) => sum + (m.pass_count ?? 0), 0);
  const totalAttempts = attempted.reduce((sum, m) => sum + (m.review_count ?? 0), 0);
  return totalAttempts > 0 ? totalPass / totalAttempts : null;
}

function buildEloHistory(sessions: DashboardSessionInput[]): EloHistoryPoint[] {
  return sessions
    .filter((s) => typeof s.elo_after === "number" && s.completed_at)
    .map((s) => ({ elo: s.elo_after!, ts: s.completed_at! }))
    .reverse();
}

function sourceTypeLabel(sourceType: string): string {
  switch (sourceType) {
    case "own_game": return "User game mistake";
    case "imported_pgn": return "Imported PGN";
    case "lichess_puzzle_filler": return "Random puzzle";
    case "legacy_fallback": return "Blindspots mistake";
    case "app_training": return "Training mistake";
    default: return "Unknown";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "active": return "New";
    case "review": return "Review due";
    case "mastered": return "Mastered";
    case "retired": return "Retired";
    default: return "Unknown";
  }
}

function queueLabel(status: string, sourceType: string): string | undefined {
  if (status === "mastered" || status === "retired") return undefined;
  if (status === "review") return "Review";
  if (sourceType === "lichess_puzzle_filler") return "Random";
  return "Active";
}

function inferLastResult(m: DashboardMistakeInput): "pass" | "acceptable" | "fail" | null {
  if (m.review_count === 0) return null;
  if (m.pass_count >= m.acceptable_count && m.pass_count >= m.fail_count) return "pass";
  if (m.acceptable_count >= m.fail_count) return "acceptable";
  return "fail";
}

function emptyClassificationCounts(): DashboardClassifications {
  return {
    brilliant: 0,
    critical: 0,
    best: 0,
    excellent: 0,
    good: 0,
    okay: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
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

function buildDashboardClusters(evaluations: PositionEvaluationInput[]): DashboardCluster[] {
  const byId = new Map<string, DashboardCluster>();

  for (const evaluation of evaluations) {
    const id = evaluation.clusterId;
    if (!id || isSparseDashboardCluster(id)) continue;

    const existing = byId.get(id) ?? {
      id,
      label: clusterLabel(id, evaluation),
      attempts: 0,
      failures: 0,
    };

    existing.attempts += 1;
    if (CLASSIFICATION_SEVERITY[evaluation.classification] >= CLASSIFICATION_SEVERITY.inaccuracy) {
      existing.failures += 1;
    }
    byId.set(id, existing);
  }

  return [...byId.values()]
    .filter((cluster) => cluster.attempts >= 5 && cluster.failures > 0)
    .sort((left, right) => {
      if (right.failures !== left.failures) return right.failures - left.failures;
      if (right.attempts !== left.attempts) return right.attempts - left.attempts;
      return left.label.localeCompare(right.label);
    });
}

function isSparseDashboardCluster(id: string) {
  return id === "app:v1:unknown:wildcard" || id === "app:v1:opening:wildcard";
}

function clusterLabel(id: string, evaluation: PositionEvaluationInput) {
  const parts = id.split(":");
  const version = parts[1];
  const phase = normalizePhase(parts[2] ?? evaluation.phase);
  const bucket = parts[3] ?? evaluation.bucket ?? "";
  const detail = parts[4] ?? "";

  if (version === "v0") return phaseLabel(phase);

  if (phase === "tactic") return "Tactical Positions";
  if (phase === "opening") {
    const openingDetail = normalizeDisplayName(detail.toUpperCase()) ?? normalizeDisplayName(evaluation.eco);
    return openingDetail ? `Opening — ${openingDetail}` : "Opening";
  }
  if (phase === "middlegame") {
    const label = detailLabel(detail) ?? bucketDetailLabel(bucket);
    return label ? `Middlegame — ${label}` : "Middlegame";
  }
  if (phase === "endgame") {
    const label = detailLabel(detail) ?? bucketDetailLabel(bucket);
    return label ? `Endgame — ${label}` : "Endgame";
  }

  return phaseLabel(phase);
}

function phaseLabel(phase: ReturnType<typeof normalizePhase>) {
  switch (phase) {
    case "opening": return "Opening";
    case "middlegame": return "Middlegame";
    case "endgame": return "Endgame";
    case "tactic": return "Tactical Positions";
    default: return "Training Positions";
  }
}

function bucketDetailLabel(bucket: string) {
  switch (bucket) {
    case "middlegame_attack": return "Attack";
    case "middlegame_positional": return "Positional";
    case "endgame_rook": return "Rook Endgame";
    case "endgame_pawn": return "Pawn Endgame";
    case "opening_gambit": return "Gambit";
    case "opening_development": return "Development";
    default: return null;
  }
}

function detailLabel(detail: string) {
  if (!detail) return null;
  if (/^[a-e][0-9]{2}$/i.test(detail)) return detail.toUpperCase();
  return detail
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildRecentSession(
  session: DashboardSessionInput,
  evaluations: PositionEvaluationInput[],
): DashboardSummary["recentSessions"][number] {
  return {
    id: session.id,
    ts: session.completed_at ?? session.started_at,
    title: buildSessionPositionTitle(evaluations),
    moves: evaluations.length || session.sequence_length,
    delta: typeof session.elo_delta === "number" ? session.elo_delta : null,
    worst: getWorstClassification(evaluations),
    href: null,
    startingFen: session.starting_fen,
    outcome: session.training_outcome,
    avgCpLoss: session.average_cp_loss,
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

function buildSessionPositionTitle(evaluations: PositionEvaluationInput[]): string {
  const primary = evaluations[0] ?? null;
  const phase = normalizePhase(primary?.phase);
  const bucket = primary?.bucket ?? null;
  const tags = primary?.tags ?? [];
  const openingName = normalizeDisplayName(primary?.openingName);
  const eco = normalizeDisplayName(primary?.eco);

  if (phase === "opening") {
    const detail =
      openingName ??
      eco ??
      openingDetailFromBucket(bucket) ??
      openingDetailFromTags(tags);

    return detail ? `Opening - ${detail}` : "Opening";
  }

  if (phase === "middlegame") return "Middlegame";
  if (phase === "endgame") return endgameTitleFromBucket(bucket);
  if (phase === "tactic") return "Tactic";

  return "Training position";
}

function normalizePhase(value: string | null | undefined) {
  if (value === "opening") return "opening";
  if (value === "middlegame") return "middlegame";
  if (value === "endgame") return "endgame";
  if (value === "tactic") return "tactic";
  return "unknown";
}

function normalizeDisplayName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function openingDetailFromBucket(bucket: string | null): string | null {
  switch (bucket) {
    case "opening_gambit":
      return "Gambit";
    case "opening_development":
      return "Development";
    case "opening":
      return null;
    default:
      return null;
  }
}

function openingDetailFromTags(tags: string[]): string | null {
  if (tags.some((tag) => tag === "gambit" || tag === "opening_gambit")) {
    return "Gambit";
  }
  if (tags.some((tag) => tag === "development" || tag === "opening_development")) {
    return "Development";
  }
  return null;
}

function endgameTitleFromBucket(bucket: string | null): string {
  switch (bucket) {
    case "endgame_rook":
      return "Endgame - Rook endgame";
    case "endgame_pawn":
      return "Endgame - Pawn endgame";
    default:
      return "Endgame";
  }
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
        openingName: typeof entry.openingName === "string" ? entry.openingName : null,
        eco: typeof entry.eco === "string" ? entry.eco : null,
      },
    ];
  });
}

function normalizeClassification(value: Json | undefined): DashboardClassification | null {
  if (typeof value !== "string") return null;
  if (isDashboardClassification(value)) return value;
  return normalizeLegacyEnCroissantClassification(value);
}

function isDashboardClassification(value: string): value is DashboardClassification {
  return CLASSIFICATION_KEYS.includes(value as DashboardClassification);
}

function normalizeLegacyEnCroissantClassification(value: string): DashboardClassification | null {
  switch (value) {
    case "interesting":
      return "excellent";
    case "dubious":
      return "inaccuracy";
    default:
      return null;
  }
}

function jsonArrayLength(raw: Json | undefined) {
  return Array.isArray(raw) ? raw.length : 0;
}
