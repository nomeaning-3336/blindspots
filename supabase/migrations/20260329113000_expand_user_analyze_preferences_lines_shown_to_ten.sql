alter table if exists public.user_analyze_preferences
drop constraint if exists user_analyze_preferences_lines_shown_check;

alter table if exists public.user_analyze_preferences
add constraint user_analyze_preferences_lines_shown_check
check (lines_shown >= 1 and lines_shown <= 10);
