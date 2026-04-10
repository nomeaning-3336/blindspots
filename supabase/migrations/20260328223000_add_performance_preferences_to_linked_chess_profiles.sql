alter table if exists public.linked_chess_profiles
add column if not exists preferred_performance_range_days integer
check (preferred_performance_range_days in (15, 30, 90, 365));

alter table if exists public.linked_chess_profiles
add column if not exists preferred_performance_game_type text
check (
  preferred_performance_game_type in ('all', 'bullet', 'blitz', 'rapid', 'classical', 'daily')
);
