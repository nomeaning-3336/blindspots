alter table public.user_onboarding_state
add column if not exists training_tour_checkpoint jsonb;

alter table public.user_onboarding_state
drop constraint if exists user_onboarding_state_training_tour_checkpoint_object;

alter table public.user_onboarding_state
add constraint user_onboarding_state_training_tour_checkpoint_object
check (
  training_tour_checkpoint is null
  or jsonb_typeof(training_tour_checkpoint) = 'object'
);
