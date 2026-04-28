alter table public.training_sessions
  add column if not exists position_evaluations jsonb not null default '[]'::jsonb;

comment on column public.training_sessions.position_evaluations is
  'Per-user-move decision point evaluations for a completed training sequence.';