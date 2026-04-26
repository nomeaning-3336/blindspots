alter table public.user_blindspot_profile
add column if not exists recent_served_modes jsonb not null default '[]'::jsonb;
