-- Training onboarding completion state.
-- Separate from profile_initialized (which means training can work).

create table if not exists public.user_onboarding_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  training_onboarding_completed_at timestamptz default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_onboarding_state enable row level security;

create or replace function public.update_user_onboarding_state_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_onboarding_state_updated_at
on public.user_onboarding_state;

create trigger trg_user_onboarding_state_updated_at
before update on public.user_onboarding_state
for each row
execute function public.update_user_onboarding_state_updated_at();

drop policy if exists "Users can read their own onboarding state"
on public.user_onboarding_state;

create policy "Users can read their own onboarding state"
on public.user_onboarding_state
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own onboarding state"
on public.user_onboarding_state;

create policy "Users can insert their own onboarding state"
on public.user_onboarding_state
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own onboarding state"
on public.user_onboarding_state;

create policy "Users can update their own onboarding state"
on public.user_onboarding_state
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);