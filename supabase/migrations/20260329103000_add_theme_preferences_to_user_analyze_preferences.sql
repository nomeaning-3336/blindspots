alter table if exists public.user_analyze_preferences
add column if not exists board_theme text not null default 'dark-blue'
check (board_theme in ('green', 'grey', 'blue', 'light-wood', 'dark-wood', 'dark-blue'));

alter table if exists public.user_analyze_preferences
add column if not exists piece_theme text not null default 'maestro'
check (
  piece_theme in ('alpha-wood', 'maestro', 'smart', 'staunty-wood', 'governor', 'companion')
);
