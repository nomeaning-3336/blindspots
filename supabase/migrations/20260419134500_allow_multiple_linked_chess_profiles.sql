alter table if exists public.linked_chess_profiles
drop constraint if exists linked_chess_profiles_pkey;

alter table if exists public.linked_chess_profiles
add constraint linked_chess_profiles_pkey
primary key (user_id, provider, username);
