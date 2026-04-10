create table if not exists public.linked_chess_profiles (
  user_id text primary key,
  provider text not null check (provider in ('chesscom', 'lichess')),
  username text not null,
  linked_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.set_linked_chess_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_linked_chess_profiles_updated_at
on public.linked_chess_profiles;

create trigger set_linked_chess_profiles_updated_at
before update on public.linked_chess_profiles
for each row
execute function public.set_linked_chess_profiles_updated_at();
