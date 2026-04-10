alter table if exists public.user_analyze_preferences
  drop constraint if exists user_analyze_preferences_piece_theme_check;

alter table if exists public.user_analyze_preferences
  add constraint user_analyze_preferences_piece_theme_check
  check (
    piece_theme in (
      'cburnett',
      'alpha-wood',
      'maestro',
      'smart',
      'staunty-wood',
      'governor',
      'companion'
    )
  );
