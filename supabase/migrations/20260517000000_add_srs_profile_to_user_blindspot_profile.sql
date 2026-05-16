alter table public.user_blindspot_profile
add column if not exists srs_profile_level text not null default 'balanced',
add column if not exists srs_config jsonb not null default '{"firstReviewDelayDays":1,"passIntervalsDays":[1,3,7,14,30,60],"failDelayDays":1,"assumedPassRate":0.78}'::jsonb;

alter table public.user_blindspot_profile
drop constraint if exists user_blindspot_profile_srs_profile_level_check;
alter table public.user_blindspot_profile
add constraint user_blindspot_profile_srs_profile_level_check
check (srs_profile_level in ('easy', 'balanced', 'hard', 'extreme', 'custom'));