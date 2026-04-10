create table if not exists public.user_analyze_preferences (
  user_id text primary key,
  limit_kind text not null default 'time' check (limit_kind in ('time', 'depth')),
  time_limit_value integer not null default 250 check (time_limit_value >= 1 and time_limit_value <= 1000000),
  depth_limit_value integer not null default 18 check (depth_limit_value >= 1 and depth_limit_value <= 245),
  lines_shown integer not null default 3 check (lines_shown >= 1 and lines_shown <= 5),
  threads integer not null default 1 check (threads >= 1 and threads <= 32),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.set_user_analyze_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_user_analyze_preferences_updated_at
on public.user_analyze_preferences;

create trigger set_user_analyze_preferences_updated_at
before update on public.user_analyze_preferences
for each row
execute function public.set_user_analyze_preferences_updated_at();
