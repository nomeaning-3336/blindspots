alter table public.user_blindspot_profile
  add column if not exists daily_review_target_positions integer not null default 30;

alter table public.user_blindspot_profile
  drop constraint if exists user_blindspot_profile_daily_review_target_positions_check;

alter table public.user_blindspot_profile
  add constraint user_blindspot_profile_daily_review_target_positions_check
  check (daily_review_target_positions >= 1 and daily_review_target_positions <= 500);
