alter table public.user_mistakes
  rename to user_training_items;

alter table public.training_sessions
  rename column selected_mistake_id to selected_training_item_id;

alter table public.user_mistake_attempts
  rename column mistake_id to training_item_id;

comment on table public.user_training_items is
  'Personal scheduled training items. An item may originate from a detected mistake, a manually added position, imported material, saved external content, or promoted filler.';

comment on column public.training_sessions.selected_training_item_id is
  'FK to the personal scheduled training item served for this session. Null for shared filler sessions.';

comment on column public.user_mistake_attempts.training_item_id is
  'Optional link from a recorded bad-move attempt to the personal training item whose position was being trained.';
