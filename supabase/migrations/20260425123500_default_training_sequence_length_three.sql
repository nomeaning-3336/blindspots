alter table public.user_training_preferences
alter column sequence_length set default 3;

update public.user_training_preferences
set sequence_length = 3
where sequence_length = 5;
