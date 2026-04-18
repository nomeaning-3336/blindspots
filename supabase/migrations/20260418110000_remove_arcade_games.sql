drop trigger if exists set_arcade_games_updated_at on public.arcade_games;

drop function if exists public.set_arcade_games_updated_at();

drop table if exists public.arcade_games;
