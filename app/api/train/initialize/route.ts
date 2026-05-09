import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getLinkedChessProfilesForUser } from "@/lib/chess-profile-store";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  buildTrainInitializationSummary,
  type TrainInitializationSummary,
} from "@/lib/train-initialization";
import {
  DEFAULT_RATING_DEVIATION,
  getSeededStartingElo,
  getStartingEloForSkillLevel,
  normalizeSkillLevel,
  type SkillLevel,
} from "@/lib/training/elo";
import {
  buildDefaultBlindspotProfile,
  shouldShowTrainingOnboarding,
} from "@/lib/training/default-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SEQUENCE_LENGTH = 4;
const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;

type InitializationStatus =
  | "pending"
  | "running"
  | "complete"
  | "skipped"
  | "failed"
  | "no_games";

interface InitializePayload {
  action?: "skip" | "analyze" | "save_settings";
  sequenceLength?: number;
  timePressureMode?: string;
  openingFilter?: unknown;
  skillLevel?: unknown;
}

export async function GET() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [profile, preferences, linkedProfiles] = await Promise.all([
    getOrCreateDefaultBlindspotProfile(userId),
    getTrainingPreferences(userId),
    getLinkedChessProfilesForUser(userId),
  ]);

  return NextResponse.json({
    profile,
    preferences,
    linkedProfiles,
    shouldShowOnboarding: shouldShowTrainingOnboarding(profile),
  });
}

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as InitializePayload | null;
  const action = payload?.action;

  if (action === "skip") {
    const skillLevel = normalizeSkillLevel(payload?.skillLevel);
    const startingElo = getStartingEloForSkillLevel(skillLevel);

    await upsertBlindspotProfile(userId, {
      blindspots_elo: startingElo,
      rating_deviation: DEFAULT_RATING_DEVIATION,
      initial_skill_level: skillLevel,
      initialization_status: "skipped",
      profile_initialized: false,
      weakness_vector: {},
      mastery_vector: {},
      exploit_queue: [],
      explore_queue: [],
      revisit_queue: [],
      mastered_queue: [],
    });

    return NextResponse.json({ ok: true, status: "skipped" });
  }

  if (action === "save_settings") {
    const preferences = normalizeTrainingPreferences(payload);
    await saveTrainingPreferences(userId, preferences);

    const profile = await getBlindspotProfile(userId);
    if (!profile) {
      const skillLevel = normalizeSkillLevel(payload?.skillLevel);
      const startingElo = getStartingEloForSkillLevel(skillLevel);

      await upsertBlindspotProfile(userId, {
        blindspots_elo: startingElo,
        rating_deviation: DEFAULT_RATING_DEVIATION,
        initial_skill_level: skillLevel,
        initialization_status: "skipped",
        profile_initialized: false,
        weakness_vector: {},
        mastery_vector: {},
        exploit_queue: [],
        explore_queue: [],
        revisit_queue: [],
        mastered_queue: [],
      });
    }

    return NextResponse.json({ ok: true, preferences });
  }

  if (action === "analyze") {
    return runInitialization(userId, normalizeSkillLevel(payload?.skillLevel));
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}

async function runInitialization(userId: string, skillLevel: SkillLevel) {
  const linkedProfiles = await getLinkedChessProfilesForUser(userId);

  if (linkedProfiles.length === 0) {
    const startingElo = getStartingEloForSkillLevel(skillLevel);

    await upsertBlindspotProfile(userId, {
      blindspots_elo: startingElo,
      rating_deviation: DEFAULT_RATING_DEVIATION,
      initial_skill_level: skillLevel,
      initialization_status: "no_games",
      profile_initialized: false,
      weakness_vector: {},
      mastery_vector: {},
      exploit_queue: [],
      explore_queue: [],
      revisit_queue: [],
      mastered_queue: [],
    });
    return NextResponse.json({ ok: true, status: "no_games" });
  }

  await setProfileAndLinkedStatus(userId, "running");

  try {
    const summary = await buildTrainInitializationSummary(linkedProfiles);

    if (summary === "no_games") {
      const startingElo = getStartingEloForSkillLevel(skillLevel);

      await upsertBlindspotProfile(userId, {
        blindspots_elo: startingElo,
        rating_deviation: DEFAULT_RATING_DEVIATION,
        initial_skill_level: skillLevel,
        initialization_status: "no_games",
        profile_initialized: false,
        weakness_vector: {},
        mastery_vector: {},
        exploit_queue: [],
        explore_queue: [],
        revisit_queue: [],
        mastered_queue: [],
      });
      await updateLinkedProfileInitialization(userId, "no_games");
      return NextResponse.json({ ok: true, status: "no_games" });
    }

    await persistSuccessfulInitialization(userId, summary, skillLevel);
    return NextResponse.json({ ok: true, status: "complete", summary });
  } catch (error) {
    console.error("Training initialization failed", error);
    await upsertBlindspotProfile(userId, {
      initialization_status: "failed",
      profile_initialized: false,
    });
    await updateLinkedProfileInitialization(userId, "failed");
    return NextResponse.json({
      ok: false,
      status: "failed",
      error: "Analysis didn't complete",
    });
  }
}

async function persistSuccessfulInitialization(
  userId: string,
  summary: TrainInitializationSummary,
  skillLevel: SkillLevel,
) {
  const skillStartingElo = getStartingEloForSkillLevel(skillLevel);
  const analyzedStartingElo = getSeededStartingElo(summary.totalCpLoss, summary.totalMoves);
  const startingElo = Math.round((skillStartingElo + analyzedStartingElo) / 2);

  const completedAt = new Date().toISOString();
  await upsertBlindspotProfile(userId, {
    blindspots_elo: startingElo,
    rating_deviation: DEFAULT_RATING_DEVIATION,
    initial_skill_level: skillLevel,
    initialization_status: "complete",
    initialization_completed_at: completedAt,
    profile_initialized: true,
    weakness_vector: summary.weaknessVector,
    mastery_vector: {},
    exploit_queue: summary.exploitQueue,
    explore_queue: [],
    revisit_queue: [],
    mastered_queue: [],
    total_sequences: 0,
  });
  await updateLinkedProfileInitialization(userId, "complete", completedAt);
}

async function setProfileAndLinkedStatus(userId: string, status: InitializationStatus) {
  await upsertBlindspotProfile(userId, {
    initialization_status: status,
    profile_initialized: false,
    weakness_vector: {},
    mastery_vector: {},
    exploit_queue: [],
    explore_queue: [],
    revisit_queue: [],
    mastered_queue: [],
  });
  await updateLinkedProfileInitialization(userId, status);
}

async function getBlindspotProfile(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_blindspot_profile")
    .select(
      "user_id, blindspots_elo, rating_deviation, initial_skill_level, weakness_vector, mastery_vector, exploit_queue, explore_queue, revisit_queue, mastered_queue, total_sequences, last_session_at, profile_initialized, initialization_status, initialization_completed_at, created_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load blindspot profile", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return data;
}

async function getOrCreateDefaultBlindspotProfile(userId: string) {
  const existing = await getBlindspotProfile(userId);
  if (existing) return existing;

  const values = buildDefaultBlindspotProfile(userId);
  await upsertBlindspotProfile(userId, values);
  return values;
}

async function getTrainingPreferences(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_training_preferences")
    .select(
      "user_id, sequence_length, opponent_mode, time_pressure_mode, opening_filter, skill_level, created_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load training preferences", error);
    return null;
  }

  return data;
}

async function getLinkedInitializationStatus(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("linked_chess_profiles")
    .select("initialization_status")
    .eq("user_id", userId)
    .order("linked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.initialization_status ?? null;
}

async function upsertBlindspotProfile(
  userId: string,
  values: Record<string, unknown>,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("user_blindspot_profile").upsert({
    user_id: userId,
    ...values,
  });

  if (error) {
    throw new Error(`Failed to save blindspot profile: ${error.message}`);
  }
}

async function updateLinkedProfileInitialization(
  userId: string,
  status: InitializationStatus,
  completedAt: string | null = null,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("linked_chess_profiles")
    .update({
      initialization_status: status,
      initialization_completed_at: completedAt,
    })
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to update linked profile initialization status", error);
  }
}

async function saveTrainingPreferences(
  userId: string,
  preferences: ReturnType<typeof normalizeTrainingPreferences>,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("user_training_preferences").upsert({
    user_id: userId,
    sequence_length: preferences.sequenceLength,
    opponent_mode: "standard",
    time_pressure_mode: preferences.timePressureMode,
    opening_filter: preferences.openingFilter,
    skill_level: preferences.skillLevel,
  });

  if (error) {
    throw new Error(`Failed to save training preferences: ${error.message}`);
  }
}

function normalizeTrainingPreferences(payload: InitializePayload | null) {
  const sequenceLength = normalizeSequenceLength(payload?.sequenceLength);
  const timePressureMode =
    typeof payload?.timePressureMode === "string" && payload.timePressureMode.length > 0
      ? payload.timePressureMode
      : "none";
  const openingFilter = Array.isArray(payload?.openingFilter)
    ? payload.openingFilter
    : [];
  const skillLevel = normalizeSkillLevel(payload?.skillLevel);

  return {
    sequenceLength,
    timePressureMode,
    openingFilter,
    skillLevel,
  };
}

function normalizeSequenceLength(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SEQUENCE_LENGTH;
  return Math.max(MIN_SEQUENCE_LENGTH, Math.min(MAX_SEQUENCE_LENGTH, Math.round(parsed)));
}
