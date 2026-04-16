# Supabase Auth Migration

Chessview now uses Supabase Auth as the single auth layer.

## What Changed

- Clerk was removed from the app shell, auth pages, and route protection.
- Sign-in and sign-up now use custom themed Chessview forms.
- Server-side auth checks now read the Supabase session user id and reuse that id for saved preferences, linked profiles, and Arcade ownership.
- The public header and app shell nav now sign out through Supabase while still clearing the saved analyze-settings key in local storage.

## Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Auth Setup

1. Enable Email auth in Supabase Authentication.
2. If you want Google sign-in, enable the Google provider in Supabase Authentication and add your app URL plus `/auth/callback` to the allowed redirect URLs.
3. If you want email confirmation, keep email confirmations enabled and add your app URL plus `/auth/callback` to the allowed redirect URLs.
4. If you want immediate sign-in after sign-up during local development, disable email confirmation in Supabase Auth.

## Notes

- Redirect-after-auth still uses the existing `next` query param flow.
- Existing per-user rows in Supabase are now expected to use the Supabase auth user id as `user_id`.
