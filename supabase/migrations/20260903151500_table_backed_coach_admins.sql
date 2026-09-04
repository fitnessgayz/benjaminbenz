-- is_coach_admin() previously matched a single hardcoded email literal, while
-- every edge function instead reads a configurable, plural COACH_ADMIN_EMAILS
-- list. Adding a second coach via that env var would pass every edge-function
-- check but still be silently denied by every RLS policy that calls
-- is_coach_admin() (exercise_library, progress photos, coach requests, etc.).
--
-- This backs is_coach_admin() with a table instead, seeded with the current
-- coach so behavior is unchanged today. Adding a coach going forward means
-- inserting a row here (in addition to updating COACH_ADMIN_EMAILS).
--
-- The function is marked security definer so it can read coach_admins even
-- though the table itself has no policies (default deny) for direct queries
-- by authenticated/anon roles - only this function can read it.

create table if not exists public.coach_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.coach_admins enable row level security;
revoke all on public.coach_admins from public, anon, authenticated;

insert into public.coach_admins (email)
values (lower('benjaminbenz.fit@gmail.com'))
on conflict (email) do nothing;

create or replace function public.is_coach_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_admins
    where email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
$$;

grant execute on function public.is_coach_admin() to authenticated;
