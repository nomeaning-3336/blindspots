-- Add training preferences to user_blindspot_profile.
-- Daily target and mistake capture threshold for onboarding/personalization.

ALTER TABLE public.user_blindspot_profile
  ADD COLUMN IF NOT EXISTS daily_target_level text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS daily_target_positions integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS mistake_capture_threshold_level text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS mistake_capture_threshold_cp integer NOT NULL DEFAULT 75;

-- CHECK constraints for valid enum values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_blindspot_profile_daily_target_level_check'
    AND conrelid = 'public.user_blindspot_profile'::regclass
  ) THEN
    ALTER TABLE public.user_blindspot_profile
      ADD CONSTRAINT user_blindspot_profile_daily_target_level_check
      CHECK (daily_target_level IN ('easy', 'balanced', 'hard', 'extreme'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_blindspot_profile_daily_target_positions_check'
    AND conrelid = 'public.user_blindspot_profile'::regclass
  ) THEN
    ALTER TABLE public.user_blindspot_profile
      ADD CONSTRAINT user_blindspot_profile_daily_target_positions_check
      CHECK (daily_target_positions IN (5, 10, 20, 50));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_blindspot_profile_mistake_capture_threshold_level_check'
    AND conrelid = 'public.user_blindspot_profile'::regclass
  ) THEN
    ALTER TABLE public.user_blindspot_profile
      ADD CONSTRAINT user_blindspot_profile_mistake_capture_threshold_level_check
      CHECK (mistake_capture_threshold_level IN ('lenient', 'balanced', 'sensitive', 'strict'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_blindspot_profile_mistake_capture_threshold_cp_check'
    AND conrelid = 'public.user_blindspot_profile'::regclass
  ) THEN
    ALTER TABLE public.user_blindspot_profile
      ADD CONSTRAINT user_blindspot_profile_mistake_capture_threshold_cp_check
      CHECK (mistake_capture_threshold_cp IN (25, 50, 75, 100));
  END IF;
END $$;
