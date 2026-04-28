-- Allow the Expert onboarding bracket to be persisted.

alter table public.user_blindspot_profile
  drop constraint if exists user_blindspot_profile_initial_skill_level_check;

alter table public.user_blindspot_profile
  add constraint user_blindspot_profile_initial_skill_level_check
  check (
    initial_skill_level is null
    or initial_skill_level in ('new_to_chess', 'beginner', 'intermediate', 'advanced', 'expert')
  );

alter table public.user_training_preferences
  drop constraint if exists user_training_preferences_skill_level_check;

alter table public.user_training_preferences
  add constraint user_training_preferences_skill_level_check
  check (
    skill_level is null
    or skill_level in ('new_to_chess', 'beginner', 'intermediate', 'advanced', 'expert')
  );
