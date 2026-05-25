alter table public.training_sessions
  add column if not exists filler_id uuid,
  add column if not exists filler_origin text,
  add column if not exists candidate_metadata jsonb not null default '{}'::jsonb;

alter table public.training_sessions
  alter column elo_before drop not null,
  alter column elo_after drop not null,
  alter column elo_delta drop not null,
  alter column k_factor drop not null,
  alter column opponent_elo drop not null,
  alter column expected_score drop not null,
  alter column actual_score drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sessions_filler_origin_check'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_filler_origin_check
      check (
        filler_origin is null
        or filler_origin in ('random_position', 'lichess_puzzle')
      );
  end if;
end
$$;

create unique index if not exists training_sessions_one_active_per_user_idx
  on public.training_sessions (user_id)
  where completed_at is null;

comment on column public.training_sessions.filler_id is
  'Stable committed filler-catalog UUID for sessions started from shared filler content. Null for personal items.';

comment on column public.training_sessions.filler_origin is
  'Shared filler provenance only: random_position or lichess_puzzle. Null for personal items.';

comment on column public.training_sessions.candidate_metadata is
  'Cold candidate display/provenance metadata persisted when the active session begins.';
