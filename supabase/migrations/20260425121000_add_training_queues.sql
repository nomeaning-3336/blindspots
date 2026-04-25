alter table public.user_blindspot_profile
add column if not exists exploit_queue jsonb not null default '[]'::jsonb,
add column if not exists explore_queue jsonb not null default '[]'::jsonb,
add column if not exists revisit_queue jsonb not null default '[]'::jsonb,
add column if not exists mastered_queue jsonb not null default '[]'::jsonb;
