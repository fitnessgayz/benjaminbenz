-- Workout/session comments shared between FWB Training clients and the coach website.
-- This migration is intentionally not applied by the iOS project.

create table public.workout_comment_threads (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  client_email text not null,
  entry_date date not null,
  workout_title text not null,
  workout_session_id uuid not null,
  client_last_read_at timestamptz,
  coach_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_comment_threads_client_email_present
    check (length(btrim(client_email)) between 3 and 320),
  constraint workout_comment_threads_workout_title_present
    check (length(btrim(workout_title)) between 1 and 240),
  constraint workout_comment_threads_session_unique
    unique (client_user_id, workout_session_id)
);

create table public.workout_comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.workout_comment_threads(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  author_role text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint workout_comments_author_role_valid
    check (author_role in ('client', 'coach')),
  constraint workout_comments_body_length_valid
    check (length(btrim(body)) between 1 and 2000)
);

comment on table public.workout_comment_threads is
  'One private client/coach thread per workout session. The generated session UUID matches the client_workout_logs continuity key.';
comment on column public.workout_comment_threads.workout_session_id is
  'Deterministic md5 UUID of lower(client_email)|entry_date|lower(workout_title), compatible with legacy workout logs.';
comment on table public.workout_comments is
  'Immutable client and coach messages. Coach replies are authored by the website.';

create or replace function public.set_workout_comment_session_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.workout_session_id = md5(
    lower(btrim(new.client_email)) || '|' || new.entry_date::text || '|' || lower(btrim(new.workout_title))
  )::uuid;
  return new;
end;
$$;

revoke all on function public.set_workout_comment_session_id() from public, anon, authenticated;

create trigger set_workout_comment_session_id_before_write
before insert or update of client_email, entry_date, workout_title
on public.workout_comment_threads
for each row execute function public.set_workout_comment_session_id();

create index workout_comment_threads_client_email_updated_idx
  on public.workout_comment_threads (lower(client_email), updated_at desc);
create index workout_comment_threads_session_idx
  on public.workout_comment_threads (workout_session_id);
create index workout_comments_thread_created_idx
  on public.workout_comments (thread_id, created_at);
create index workout_comments_author_user_idx
  on public.workout_comments (author_user_id);

alter table public.workout_comment_threads enable row level security;
alter table public.workout_comments enable row level security;

create policy "Participants can read workout comment threads"
on public.workout_comment_threads
for select
to authenticated
using (
  (select auth.uid()) = client_user_id
  or (select public.is_coach_admin())
);

create policy "Participants can update workout comment read state"
on public.workout_comment_threads
for update
to authenticated
using (
  (select auth.uid()) = client_user_id
  or (select public.is_coach_admin())
)
with check (
  (select auth.uid()) = client_user_id
  or (select public.is_coach_admin())
);

create policy "Clients can create their own workout comment threads"
on public.workout_comment_threads
for insert
to authenticated
with check (
  (select auth.uid()) = client_user_id
  and lower(client_email) = lower((select auth.jwt()) ->> 'email')
  and not (select public.is_coach_admin())
);

create policy "Participants can read workout comments"
on public.workout_comments
for select
to authenticated
using (
  (select public.is_coach_admin())
  or exists (
    select 1
    from public.workout_comment_threads thread
    where thread.id = workout_comments.thread_id
      and thread.client_user_id = (select auth.uid())
  )
);

create policy "Participants can add workout comments"
on public.workout_comments
for insert
to authenticated
with check (
  author_user_id = (select auth.uid())
  and (
    (
      author_role = 'client'
      and not (select public.is_coach_admin())
      and exists (
        select 1
        from public.workout_comment_threads thread
        where thread.id = workout_comments.thread_id
          and thread.client_user_id = (select auth.uid())
      )
    )
    or (
      author_role = 'coach'
      and (select public.is_coach_admin())
    )
  )
);

create or replace function public.touch_workout_comment_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workout_comment_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

revoke all on function public.touch_workout_comment_thread() from public, anon, authenticated;

create trigger touch_workout_comment_thread_after_insert
after insert on public.workout_comments
for each row
execute function public.touch_workout_comment_thread();

create or replace function public.mark_workout_comment_thread_read(target_thread_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if (select public.is_coach_admin()) then
    update public.workout_comment_threads
    set coach_last_read_at = now()
    where id = target_thread_id;
  else
    update public.workout_comment_threads
    set client_last_read_at = now()
    where id = target_thread_id
      and client_user_id = (select auth.uid());
  end if;

  if not found then
    raise exception 'Workout comment thread not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.protect_workout_comment_read_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select public.is_coach_admin()) then
    if new.client_last_read_at is distinct from old.client_last_read_at then
      raise exception 'Coach cannot change the client read timestamp' using errcode = '42501';
    end if;
    if new.coach_last_read_at is distinct from old.coach_last_read_at then
      new.coach_last_read_at = now();
    end if;
  else
    if new.coach_last_read_at is distinct from old.coach_last_read_at then
      raise exception 'Client cannot change the coach read timestamp' using errcode = '42501';
    end if;
    if new.client_last_read_at is distinct from old.client_last_read_at then
      new.client_last_read_at = now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_workout_comment_read_state() from public, anon, authenticated;

create trigger protect_workout_comment_read_state_before_update
before update of client_last_read_at, coach_last_read_at
on public.workout_comment_threads
for each row execute function public.protect_workout_comment_read_state();

revoke all on function public.mark_workout_comment_thread_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_workout_comment_thread_read(uuid) to authenticated;

revoke all on table public.workout_comment_threads from anon;
revoke all on table public.workout_comments from anon;
revoke all on table public.workout_comment_threads from authenticated;
revoke all on table public.workout_comments from authenticated;

grant select on table public.workout_comment_threads to authenticated;
grant insert (client_user_id, client_email, entry_date, workout_title)
  on table public.workout_comment_threads to authenticated;
grant update (client_last_read_at, coach_last_read_at)
  on table public.workout_comment_threads to authenticated;
grant select on table public.workout_comments to authenticated;
grant insert (thread_id, author_user_id, author_role, body)
  on table public.workout_comments to authenticated;
