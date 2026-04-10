create table if not exists public.arcade_games (
  id text primary key,
  user_id text not null,
  variant_key text not null check (variant_key in ('vanilla', 'drunkfish', 'weirdhorse')),
  status text not null default 'active' check (status in ('active', 'finished')),
  current_fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  state jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  last_played_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists arcade_games_user_id_last_played_idx
on public.arcade_games (user_id, last_played_at desc);

create or replace function public.set_arcade_games_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_arcade_games_updated_at
on public.arcade_games;

create trigger set_arcade_games_updated_at
before update on public.arcade_games
for each row
execute function public.set_arcade_games_updated_at();
