alter table public.user_blindspot_profile
  add column if not exists review_grading_level text not null default 'balanced',
  add column if not exists review_grading_config jsonb not null default '{"passCpLossMax":50,"failCpLossMin":150}'::jsonb;

alter table public.user_blindspot_profile
  drop constraint if exists user_blindspot_profile_review_grading_level_check;

alter table public.user_blindspot_profile
  add constraint user_blindspot_profile_review_grading_level_check
  check (review_grading_level in ('forgiving', 'balanced', 'strict', 'custom'));
