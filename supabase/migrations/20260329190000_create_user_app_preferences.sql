create table if not exists public.user_app_preferences (
  user_id text primary key,
  theme text not null default 'midnight' check (
    theme in ('midnight', 'light', 'solarized', 'forest', 'ocean', 'crimson')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_user_app_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_user_app_preferences_updated_at on public.user_app_preferences;

create trigger set_user_app_preferences_updated_at
before update on public.user_app_preferences
for each row
execute function public.set_user_app_preferences_updated_at();
