-- Add app_training mining fields to user_mistakes.
-- This enables app-native mistake mining where failed user moves from
-- /train sequences are persisted into the active mistakes pool.
--
-- Key: user_id + move_key = normalized(decisionFen) + "::" + uci

-- New columns for app-native mistake mining
ALTER TABLE public.user_mistakes
  ADD COLUMN IF NOT EXISTS move_key text,
  ADD COLUMN IF NOT EXISTS result_fen text,
  ADD COLUMN IF NOT EXISTS setup_previous_fen text,
  ADD COLUMN IF NOT EXISTS setup_played_move_uci text,
  ADD COLUMN IF NOT EXISTS setup_played_move_san text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS mate_before integer,
  ADD COLUMN IF NOT EXISTS mate_after integer,
  ADD COLUMN IF NOT EXISTS consecutive_correct_count integer NOT NULL DEFAULT 0;

-- Unique index: one row per (user, move_key) for app-native mistakes
CREATE UNIQUE INDEX IF NOT EXISTS user_mistakes_user_move_key_unique
  ON public.user_mistakes (user_id, move_key)
  WHERE move_key IS NOT NULL;

-- Add 'app_training' to the source_type CHECK constraint.
-- PostgreSQL doesn't support ALTER CONSTRAINT for CHECK constraints,
-- so we drop the existing constraint and recreate it.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'user_mistakes'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%source_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_mistakes DROP CONSTRAINT %I', constraint_name);
  END IF;

  EXECUTE 'ALTER TABLE public.user_mistakes ADD CONSTRAINT user_mistakes_source_type_check
    CHECK (source_type IN (''own_game'', ''imported_pgn'', ''lichess_puzzle_filler'', ''legacy_fallback'', ''app_training''))';
END $$;

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION public.update_user_mistakes_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_mistakes_updated_at ON public.user_mistakes;
CREATE TRIGGER trg_user_mistakes_updated_at
  BEFORE UPDATE ON public.user_mistakes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_mistakes_updated_at();
