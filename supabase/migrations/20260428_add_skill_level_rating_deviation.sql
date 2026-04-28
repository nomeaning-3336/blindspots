-- supabase/migrations/20260428_add_skill_level_rating_deviation.sql

alter table public.user_blindspot_profile
  add column if not exists initial_skill_level text;

alter table public.user_blindspot_profile
  add column if not exists rating_deviation numeric;

update public.user_blindspot_profile
set rating_deviation = 650
where rating_deviation is null;

alter table public.user_blindspot_profile
  alter column rating_deviation set default 650;

alter table public.user_blindspot_profile
  alter column rating_deviation set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_blindspot_profile_initial_skill_level_check'
  ) then
    alter table public.user_blindspot_profile
      add constraint user_blindspot_profile_initial_skill_level_check
      check (
        initial_skill_level is null
        or initial_skill_level in ('new_to_chess', 'beginner', 'intermediate', 'advanced')
      );
  end if;
end $$;

alter table public.user_training_preferences
  add column if not exists skill_level text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_training_preferences_skill_level_check'
  ) then
    alter table public.user_training_preferences
      add constraint user_training_preferences_skill_level_check
      check (
        skill_level is null
        or skill_level in ('new_to_chess', 'beginner', 'intermediate', 'advanced')
      );
  end if;
end $$;

comment on column public.user_blindspot_profile.initial_skill_level is
  'User-selected starting chess skill bracket for Blindspots rating calibration.';

comment on column public.user_blindspot_profile.rating_deviation is
  'Rating uncertainty used to make early Blindspots rating updates larger and later updates smaller.';

comment on column public.user_training_preferences.skill_level is
  'User-selected chess skill bracket from onboarding.';
