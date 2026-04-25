alter table public.user_training_preferences
alter column opponent_mode set default 'standard';

alter table public.training_sessions
alter column opponent_mode set default 'standard';

update public.user_training_preferences
set opponent_mode = 'standard'
where opponent_mode in ('comfort', 'stretch', 'pressure');

update public.training_sessions
set opponent_mode = 'standard'
where opponent_mode in ('comfort', 'stretch', 'pressure');
