-- Add sync metadata columns to linked_chess_profiles for incremental Lichess sync.
-- Also wire linked_profile_id on user_mistakes.

ALTER TABLE public.linked_chess_profiles
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_game_id_seen text,
  ADD COLUMN IF NOT EXISTS last_sync_status text CHECK (last_sync_status IN ('idle', 'running', 'success', 'error')),
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS last_sync_game_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_mistake_count integer NOT NULL DEFAULT 0;

-- Ensure id is populated for existing rows (gen_random_uuid is stable per row)
UPDATE public.linked_chess_profiles SET id = gen_random_uuid() WHERE id IS NULL;

-- Add unique index on id so FK can reference it
CREATE UNIQUE INDEX IF NOT EXISTS linked_chess_profiles_id_unique
  ON public.linked_chess_profiles (id);

ALTER TABLE public.linked_chess_profiles
  ALTER COLUMN id SET NOT NULL;

-- Add FK from user_mistakes to linked_chess_profiles (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_mistakes_linked_profile_id_fkey'
      AND conrelid = 'public.user_mistakes'::regclass
  ) THEN
    ALTER TABLE public.user_mistakes
      ADD CONSTRAINT user_mistakes_linked_profile_id_fkey
      FOREIGN KEY (linked_profile_id)
      REFERENCES public.linked_chess_profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;
