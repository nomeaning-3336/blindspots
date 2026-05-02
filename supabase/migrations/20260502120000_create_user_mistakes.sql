-- Stage 1: Row-based mistake table for SRS-driven training.
-- Each row is one mistake from a user's own games, imported PGNs,
-- or filler positions ingested from the Lichess puzzle database.
--
-- The three-queue priority (review > active > filler) is implemented
-- in lib/training/mistake-store.ts via indexed queries.

CREATE TABLE public.user_mistakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  source_type text NOT NULL CHECK (source_type IN ('own_game', 'imported_pgn', 'lichess_puzzle_filler', 'legacy_fallback')),
  source_provider text,
  source_game_id text,
  source_game_url text,
  linked_profile_id uuid,
  game_played_at timestamptz,
  ply integer,
  user_color text CHECK (user_color IN ('white', 'black')),

  starting_fen text NOT NULL,
  decision_fen text,
  actual_move_uci text,
  actual_move_san text,
  best_move_uci text,
  best_move_san text,
  eval_before_cp integer,
  eval_after_cp integer,
  cp_loss integer,

  theme_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  opening_name text,
  eco text,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'review', 'mastered', 'retired')),
  interval_days integer NOT NULL DEFAULT 1,
  review_count integer NOT NULL DEFAULT 0,
  pass_count integer NOT NULL DEFAULT 0,
  acceptable_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,

  last_attempt_at timestamptz,
  next_review_at timestamptz,
  first_ingested_at timestamptz NOT NULL DEFAULT now(),
  last_served_at timestamptz,
  served_count integer NOT NULL DEFAULT 0,
  mastered_at timestamptz,
  retired_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for review-queue lookup (status='review', next_review_at <= now)
CREATE INDEX user_mistakes_user_status_next_review_idx
  ON public.user_mistakes (user_id, status, next_review_at);

-- Index for active-queue lookup (status='active', newest first)
CREATE INDEX user_mistakes_user_active_idx
  ON public.user_mistakes (user_id, status, first_ingested_at DESC);

-- Index for deduplication by source game + ply
CREATE INDEX user_mistakes_source_game_idx
  ON public.user_mistakes (user_id, source_game_id, ply);

-- Index for FEN-based deduplication lookups
CREATE INDEX user_mistakes_fen_idx
  ON public.user_mistakes (user_id, starting_fen);

-- Unique deduplication: one row per user per source game per ply
CREATE UNIQUE INDEX user_mistakes_user_game_ply_unique
  ON public.user_mistakes (user_id, source_type, source_game_id, ply)
  WHERE source_game_id IS NOT NULL AND ply IS NOT NULL;

ALTER TABLE public.user_mistakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_mistakes" ON public.user_mistakes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_mistakes" ON public.user_mistakes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_mistakes" ON public.user_mistakes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_delete_own_mistakes" ON public.user_mistakes
  FOR DELETE USING (auth.uid() = user_id);

-- Stage 2: Persist mistake-level training outcomes and queue source on training_sessions.
ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS selected_mistake_id uuid REFERENCES public.user_mistakes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS queue_source text,
  ADD COLUMN IF NOT EXISTS training_outcome text,
  ADD COLUMN IF NOT EXISTS average_cp_loss integer,
  ADD COLUMN IF NOT EXISTS max_single_cp_loss integer;

COMMENT ON COLUMN public.training_sessions.selected_mistake_id IS
  'FK to user_mistakes for row-based training. Null for legacy JSON-queue sessions.';
COMMENT ON COLUMN public.training_sessions.queue_source IS
  'Queue that served this position: review, active, filler, or legacy_fallback.';
COMMENT ON COLUMN public.training_sessions.training_outcome IS
  'SRS outcome for this attempt: pass, acceptable, or fail.';
COMMENT ON COLUMN public.training_sessions.average_cp_loss IS
  'Average centipawn loss across the training sequence moves.';
COMMENT ON COLUMN public.training_sessions.max_single_cp_loss IS
  'Maximum single-move centipawn loss in the training sequence.';
