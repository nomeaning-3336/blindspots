alter table public.training_sessions
add column if not exists elo_before integer not null default 1200,
add column if not exists elo_after integer not null default 1200,
add column if not exists elo_delta integer not null default 0,
add column if not exists k_factor integer not null default 64,
add column if not exists opponent_elo integer not null default 1300,
add column if not exists expected_score float not null default 0.5,
add column if not exists actual_score float not null default 0;
