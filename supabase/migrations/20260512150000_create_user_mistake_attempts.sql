-- Register every inaccuracy/mistake/blunder a user plays from a decision FEN,
-- surfaced during the playing phase so users see their history at a position.
-- Uses 4-token canonical FEN so that trivially-different repetitions match.
-- Notes are stored in the existing training_move_notes table keyed by
-- (user_id, move_key) where move_key = normalizeDecisionFen(fen) || '::' || uci.

create table if not exists public.user_mistake_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mistake_id uuid references user_mistakes(id) on delete cascade,
  decision_fen text not null,
  move_uci text not null,
  move_san text not null,
  classification text not null check (classification in ('inaccuracy','mistake','blunder')),
  cp_loss integer not null,
  played_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, decision_fen, move_uci)
);

create index if not exists user_mistake_attempts_unresolved
  on public.user_mistake_attempts (user_id, decision_fen)
  where resolved_at is null;

alter table public.user_mistake_attempts enable row level security;

create policy select_own_attempts on public.user_mistake_attempts
  for select using (auth.uid() = user_id);

create policy insert_own_attempts on public.user_mistake_attempts
  for insert with check (auth.uid() = user_id);

create policy update_own_attempts on public.user_mistake_attempts
  for update using (auth.uid() = user_id);
