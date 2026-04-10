update public.user_analyze_preferences
set board_theme = case board_theme
  when 'green' then 'forest'
  when 'blue' then 'ocean'
  when 'light-wood' then 'light'
  when 'dark-wood' then 'solarized'
  when 'dark-blue' then 'midnight'
  else 'grey'
end
where board_theme in ('green', 'blue', 'light-wood', 'dark-wood', 'dark-blue');

alter table if exists public.user_analyze_preferences
  drop constraint if exists user_analyze_preferences_board_theme_check;

alter table if exists public.user_analyze_preferences
  alter column board_theme set default 'grey';

alter table if exists public.user_analyze_preferences
  add constraint user_analyze_preferences_board_theme_check
  check (board_theme in ('grey', 'light', 'solarized', 'forest', 'ocean', 'crimson', 'midnight'));
