do $$
declare
  constraint_name text;
begin
  select c.conname
  into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'user_mistakes'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.user_mistakes drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.user_mistakes
  add constraint user_mistakes_status_check
  check (status in ('active', 'review', 'learning', 'mastered', 'retired', 'deleted'));
