-- ============================================================
-- user_clones
-- ============================================================
create table if not exists user_clones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  provider text not null check (provider in ('chesscom', 'lichess')),
  username text not null,

  status text not null default 'needs_training'
    check (status in ('needs_training', 'training', 'ready', 'failed')),

  source_game_count integer not null default 0,
  source_position_count integer not null default 0,
  source_started_at timestamptz,
  source_ended_at timestamptz,

  embedding_model text,
  embedding_version text not null default 'maia4all-v1',
  embedding real[],

  training_error text,
  trained_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id),

  constraint user_clones_embedding_dim_check
  check (
    embedding is null
    or cardinality(embedding) = 128
  ),

  constraint user_clones_ready_embedding_check
  check (
    status <> 'ready'
    or cardinality(embedding) = 128
  ),

  constraint user_clones_ready_model_check
  check (
    status <> 'ready'
    or embedding_model is not null
  )
);

-- ============================================================
-- clone_games
-- ============================================================
create table if not exists clone_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clone_id uuid not null references user_clones(id) on delete cascade,

  user_color text not null check (user_color in ('white', 'black')),
  clone_color text not null check (clone_color in ('white', 'black')),

  starting_fen text not null
    default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  current_fen text not null,
  moves_uci jsonb not null default '[]'::jsonb,

  result text check (result is null or result in ('white', 'black', 'draw')),
  state text not null default 'playing'
    check (state in ('playing', 'postmortem', 'abandoned')),

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clone_games_user_state_created_idx
on clone_games (user_id, state, created_at desc);

-- At most one active (playing) game per user. Lets game creation be
-- idempotent: concurrent inserts collide here and fall back to the
-- existing playing game instead of leaking duplicate rows.
create unique index if not exists clone_games_one_playing_per_user_idx
on clone_games (user_id)
where state = 'playing';

-- ============================================================
-- clone_game_events
-- ============================================================
create table if not exists clone_game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references clone_games(id) on delete cascade,

  ply integer not null check (ply >= 0),
  actor text not null check (actor in ('user', 'clone')),

  fen_before text not null,
  move_uci text not null,
  fen_after text not null,

  model text,
  move_policy jsonb,

  created_at timestamptz not null default now(),

  unique (game_id, ply)
);
