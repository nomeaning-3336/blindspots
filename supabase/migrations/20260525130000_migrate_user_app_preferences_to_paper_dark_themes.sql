alter table public.user_app_preferences
  drop constraint if exists user_app_preferences_theme_check;

update public.user_app_preferences
set theme = case
  when theme in ('midnight', 'ocean', 'forest', 'crimson') then 'dark'
  when theme in ('light', 'solarized') then 'paper'
  when theme in ('paper', 'dark') then theme
  else 'paper'
end;

alter table public.user_app_preferences
  add constraint user_app_preferences_theme_check
  check (theme in ('paper', 'dark'));
