-- Create training_move_notes table for per-move user annotations.
-- Notes are keyed by moveKey (normalizedDecisionFen::uci) so that the same
-- decision position is reused across training sequences.
--
-- This table replaces the client-only MistakeNoteBlock approach with a
-- persistent store that survives page reloads and can be queried by
-- decisionFen when reviewing mined mistakes.

CREATE TABLE IF NOT EXISTS public.training_move_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  move_key text NOT NULL,
  decision_fen text NOT NULL,
  move_uci text NOT NULL,
  move_san text,
  note_text text NOT NULL DEFAULT '',
  classification text,
  cp_loss integer,
  eval_before_cp integer,
  eval_after_cp integer,
  mate_before integer,
  mate_after integer,
  attempt_count integer NOT NULL DEFAULT 1,
  first_attempted_at timestamptz NOT NULL DEFAULT now(),
  last_attempted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one note per (user, move_key)
CREATE UNIQUE INDEX IF NOT EXISTS training_move_notes_user_move_key_unique
  ON public.training_move_notes (user_id, move_key);

-- Index for looking up notes by decision FEN (used when reviewing mined mistakes)
CREATE INDEX IF NOT EXISTS training_move_notes_decision_fen_idx
  ON public.training_move_notes (user_id, decision_fen);

-- Enable RLS
ALTER TABLE public.training_move_notes ENABLE ROW LEVEL SECURITY;

-- Users can read only their own notes
CREATE POLICY select_own_move_notes ON public.training_move_notes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own notes
CREATE POLICY insert_own_move_notes ON public.training_move_notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own notes
CREATE POLICY update_own_move_notes ON public.training_move_notes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own notes
CREATE POLICY delete_own_move_notes ON public.training_move_notes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION public.update_training_move_notes_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_training_move_notes_updated_at ON public.training_move_notes;
CREATE TRIGGER trg_training_move_notes_updated_at
  BEFORE UPDATE ON public.training_move_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_training_move_notes_updated_at();
