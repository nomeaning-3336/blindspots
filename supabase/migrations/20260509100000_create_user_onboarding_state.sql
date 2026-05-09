-- Training onboarding completion state.
-- Separate from profile_initialized (which means training can work).

CREATE TABLE public.user_onboarding_state (
  user_id text PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  training_onboarding_completed_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.update_user_onboarding_state_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_onboarding_state_updated_at ON public.user_onboarding_state;
CREATE TRIGGER trg_user_onboarding_state_updated_at
  BEFORE UPDATE ON public.user_onboarding_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_onboarding_state_updated_at();