update public.user_app_preferences
set theme = case
  when theme in ('light', 'solarized') then 'paper'
  else 'dark'
end
where theme in ('midnight', 'light', 'solarized', 'forest', 'ocean', 'crimson');

alter table if exists public.user_app_preferences
  drop constraint if exists user_app_preferences_theme_check;

alter table if exists public.user_app_preferences
  alter column theme set default 'paper';

alter table if exists public.user_app_preferences
  add constraint user_app_preferences_theme_check
  check (theme in ('paper', 'dark'));

update public.user_analyze_preferences
set board_theme = case
  when board_theme in ('light', 'solarized', 'grey') then 'paper'
  else 'dark'
end
where board_theme in ('grey', 'light', 'solarized', 'forest', 'ocean', 'crimson', 'midnight');

alter table if exists public.user_analyze_preferences
  drop constraint if exists user_analyze_preferences_board_theme_check;

alter table if exists public.user_analyze_preferences
  alter column board_theme set default 'paper';

alter table if exists public.user_analyze_preferences
  add constraint user_analyze_preferences_board_theme_check
  check (board_theme in ('paper', 'dark'));

alter table if exists public.user_analyze_preferences
  drop constraint if exists user_analyze_preferences_piece_theme_check;

alter table if exists public.user_analyze_preferences
  alter column piece_theme set default 'blindspots';

alter table if exists public.user_analyze_preferences
  add constraint user_analyze_preferences_piece_theme_check
  check (
    piece_theme in (
      'blindspots',
      'cburnett',
      'alpha-wood',
      'maestro',
      'smart',
      'staunty-wood',
      'governor',
      'companion'
    )
  );
