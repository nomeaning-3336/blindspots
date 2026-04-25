create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

drop table if exists public.memo_entries cascade;
drop table if exists public.memo_groups cascade;
drop table if exists public.user_llm_api_keys cascade;

alter table if exists public.linked_chess_profiles
drop column if exists preferred_performance_range_days,
drop column if exists preferred_performance_game_type,
add column if not exists raw_elo integer,
add column if not exists initialization_status text not null default 'pending',
add column if not exists initialization_completed_at timestamptz;

alter table if exists public.user_analyze_preferences
drop column if exists auto_coach_enabled;

create table if not exists public.user_training_preferences (
  user_id text primary key,
  sequence_length integer not null default 5,
  opponent_mode text not null default 'stretch',
  time_pressure_mode text not null default 'none',
  opening_filter jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.set_user_training_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_user_training_preferences_updated_at
on public.user_training_preferences;

create trigger set_user_training_preferences_updated_at
before update on public.user_training_preferences
for each row
execute function public.set_user_training_preferences_updated_at();

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starting_fen text not null,
  moves_played jsonb not null default '[]'::jsonb,
  eval_preservation_score float null,
  opponent_mode text not null,
  sequence_length integer not null,
  time_pressure_mode text not null default 'none',
  reflection_note text null,
  position_fingerprint jsonb null,
  blindspot_cluster_id uuid null,
  started_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists training_sessions_user_id_started_at_idx
on public.training_sessions (user_id, started_at desc);

create table if not exists public.user_blindspot_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blindspots_elo integer not null default 1200,
  weakness_vector jsonb not null default '{}'::jsonb,
  mastery_vector jsonb not null default '{}'::jsonb,
  total_sequences integer not null default 0,
  last_session_at timestamptz null,
  profile_initialized boolean not null default false,
  initialization_status text not null default 'pending',
  initialization_completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.set_user_blindspot_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_user_blindspot_profile_updated_at
on public.user_blindspot_profile;

create trigger set_user_blindspot_profile_updated_at
before update on public.user_blindspot_profile
for each row
execute function public.set_user_blindspot_profile_updated_at();

alter table public.linked_chess_profiles enable row level security;
alter table public.user_analyze_preferences enable row level security;
alter table public.user_app_preferences enable row level security;
alter table public.user_training_preferences enable row level security;
alter table public.training_sessions enable row level security;
alter table public.user_blindspot_profile enable row level security;

drop policy if exists linked_chess_profiles_select_own on public.linked_chess_profiles;
drop policy if exists linked_chess_profiles_insert_own on public.linked_chess_profiles;
drop policy if exists linked_chess_profiles_update_own on public.linked_chess_profiles;
drop policy if exists linked_chess_profiles_delete_own on public.linked_chess_profiles;

create policy linked_chess_profiles_select_own
on public.linked_chess_profiles
for select
using (auth.uid()::text = user_id);

create policy linked_chess_profiles_insert_own
on public.linked_chess_profiles
for insert
with check (auth.uid()::text = user_id);

create policy linked_chess_profiles_update_own
on public.linked_chess_profiles
for update
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

create policy linked_chess_profiles_delete_own
on public.linked_chess_profiles
for delete
using (auth.uid()::text = user_id);

drop policy if exists user_analyze_preferences_select_own on public.user_analyze_preferences;
drop policy if exists user_analyze_preferences_insert_own on public.user_analyze_preferences;
drop policy if exists user_analyze_preferences_update_own on public.user_analyze_preferences;
drop policy if exists user_analyze_preferences_delete_own on public.user_analyze_preferences;

create policy user_analyze_preferences_select_own
on public.user_analyze_preferences
for select
using (auth.uid()::text = user_id);

create policy user_analyze_preferences_insert_own
on public.user_analyze_preferences
for insert
with check (auth.uid()::text = user_id);

create policy user_analyze_preferences_update_own
on public.user_analyze_preferences
for update
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

create policy user_analyze_preferences_delete_own
on public.user_analyze_preferences
for delete
using (auth.uid()::text = user_id);

drop policy if exists user_app_preferences_select_own on public.user_app_preferences;
drop policy if exists user_app_preferences_insert_own on public.user_app_preferences;
drop policy if exists user_app_preferences_update_own on public.user_app_preferences;
drop policy if exists user_app_preferences_delete_own on public.user_app_preferences;

create policy user_app_preferences_select_own
on public.user_app_preferences
for select
using (auth.uid()::text = user_id);

create policy user_app_preferences_insert_own
on public.user_app_preferences
for insert
with check (auth.uid()::text = user_id);

create policy user_app_preferences_update_own
on public.user_app_preferences
for update
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

create policy user_app_preferences_delete_own
on public.user_app_preferences
for delete
using (auth.uid()::text = user_id);

drop policy if exists user_training_preferences_select_own on public.user_training_preferences;
drop policy if exists user_training_preferences_insert_own on public.user_training_preferences;
drop policy if exists user_training_preferences_update_own on public.user_training_preferences;
drop policy if exists user_training_preferences_delete_own on public.user_training_preferences;

create policy user_training_preferences_select_own
on public.user_training_preferences
for select
using (auth.uid()::text = user_id);

create policy user_training_preferences_insert_own
on public.user_training_preferences
for insert
with check (auth.uid()::text = user_id);

create policy user_training_preferences_update_own
on public.user_training_preferences
for update
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

create policy user_training_preferences_delete_own
on public.user_training_preferences
for delete
using (auth.uid()::text = user_id);

drop policy if exists training_sessions_select_own on public.training_sessions;
drop policy if exists training_sessions_insert_own on public.training_sessions;
drop policy if exists training_sessions_update_own on public.training_sessions;
drop policy if exists training_sessions_delete_own on public.training_sessions;

create policy training_sessions_select_own
on public.training_sessions
for select
using (auth.uid() = user_id);

create policy training_sessions_insert_own
on public.training_sessions
for insert
with check (auth.uid() = user_id);

create policy training_sessions_update_own
on public.training_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy training_sessions_delete_own
on public.training_sessions
for delete
using (auth.uid() = user_id);

drop policy if exists user_blindspot_profile_select_own on public.user_blindspot_profile;
drop policy if exists user_blindspot_profile_insert_own on public.user_blindspot_profile;
drop policy if exists user_blindspot_profile_update_own on public.user_blindspot_profile;
drop policy if exists user_blindspot_profile_delete_own on public.user_blindspot_profile;

create policy user_blindspot_profile_select_own
on public.user_blindspot_profile
for select
using (auth.uid() = user_id);

create policy user_blindspot_profile_insert_own
on public.user_blindspot_profile
for insert
with check (auth.uid() = user_id);

create policy user_blindspot_profile_update_own
on public.user_blindspot_profile
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy user_blindspot_profile_delete_own
on public.user_blindspot_profile
for delete
using (auth.uid() = user_id);
