create table if not exists public.memo_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  game_id uuid null,
  title text null,
  opening_name text null,
  eco text null,
  color text null check (color in ('white', 'black')),
  result text null check (result in ('win', 'draw', 'loss')),
  opponent text null,
  played_at timestamptz null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.memo_entries (
  id uuid primary key default gen_random_uuid(),
  memo_group_id uuid not null references public.memo_groups(id) on delete cascade,
  user_id uuid not null,
  fen text not null,
  ply integer null,
  turn_color text null check (turn_color in ('white', 'black')),
  last_move_san text null,
  last_move_uci text null,
  note_text text not null default '',
  tags jsonb not null default '[]'::jsonb,
  arrows jsonb not null default '[]'::jsonb,
  highlighted_squares jsonb not null default '[]'::jsonb,
  orientation text null check (orientation in ('white', 'black')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists memo_groups_user_updated_at_idx
on public.memo_groups (user_id, updated_at desc);

create index if not exists memo_groups_user_played_at_idx
on public.memo_groups (user_id, played_at desc);

create index if not exists memo_groups_user_opening_name_idx
on public.memo_groups (user_id, opening_name);

create index if not exists memo_entries_user_created_at_idx
on public.memo_entries (user_id, created_at desc);

create index if not exists memo_entries_group_created_at_idx
on public.memo_entries (memo_group_id, created_at asc);

create index if not exists memo_entries_note_text_fts_idx
on public.memo_entries
using gin (to_tsvector('english', coalesce(note_text, '')));

create index if not exists memo_entries_tags_idx
on public.memo_entries
using gin (tags jsonb_path_ops);

create or replace function public.set_memo_groups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create or replace function public.set_memo_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create or replace function public.touch_parent_memo_group_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    update public.memo_groups
    set updated_at = timezone('utc'::text, now())
    where id = old.memo_group_id;
    return old;
  end if;

  update public.memo_groups
  set updated_at = timezone('utc'::text, now())
  where id = new.memo_group_id;

  return new;
end;
$$;

drop trigger if exists set_memo_groups_updated_at on public.memo_groups;
create trigger set_memo_groups_updated_at
before update on public.memo_groups
for each row
execute function public.set_memo_groups_updated_at();

drop trigger if exists set_memo_entries_updated_at on public.memo_entries;
create trigger set_memo_entries_updated_at
before update on public.memo_entries
for each row
execute function public.set_memo_entries_updated_at();

drop trigger if exists touch_parent_memo_group_updated_at on public.memo_entries;
create trigger touch_parent_memo_group_updated_at
after insert or update or delete on public.memo_entries
for each row
execute function public.touch_parent_memo_group_updated_at();

alter table public.memo_groups enable row level security;
alter table public.memo_entries enable row level security;

drop policy if exists "Users can view their own memo groups" on public.memo_groups;
create policy "Users can view their own memo groups"
on public.memo_groups
for select
using (auth.uid() = user_id);

drop policy if exists "Users can create their own memo groups" on public.memo_groups;
create policy "Users can create their own memo groups"
on public.memo_groups
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own memo groups" on public.memo_groups;
create policy "Users can update their own memo groups"
on public.memo_groups
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own memo groups" on public.memo_groups;
create policy "Users can delete their own memo groups"
on public.memo_groups
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can view their own memo entries" on public.memo_entries;
create policy "Users can view their own memo entries"
on public.memo_entries
for select
using (auth.uid() = user_id);

drop policy if exists "Users can create their own memo entries" on public.memo_entries;
create policy "Users can create their own memo entries"
on public.memo_entries
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.memo_groups
    where memo_groups.id = memo_entries.memo_group_id
      and memo_groups.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their own memo entries" on public.memo_entries;
create policy "Users can update their own memo entries"
on public.memo_entries
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.memo_groups
    where memo_groups.id = memo_entries.memo_group_id
      and memo_groups.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their own memo entries" on public.memo_entries;
create policy "Users can delete their own memo entries"
on public.memo_entries
for delete
using (auth.uid() = user_id);
