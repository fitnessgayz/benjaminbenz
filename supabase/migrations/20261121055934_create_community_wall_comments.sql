-- Comments attach to shared Wall events, never to private workout logs.
create table community_private.community_wall_comments (
  id uuid primary key default gen_random_uuid(),
  event_id text not null check (char_length(event_id) between 1 and 140),
  author_id uuid not null references public.client_community_profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index community_wall_comments_thread_idx
  on community_private.community_wall_comments(event_id, created_at desc, id desc);
create index community_wall_comments_author_idx
  on community_private.community_wall_comments(author_id);

alter table community_private.community_wall_comments enable row level security;
revoke all on community_private.community_wall_comments from public, anon, authenticated;

-- Match the three-day window used by the Wall. Always check live consent
-- through the existing visible feed, including for threads already saved.
create function community_private.community_wall_comment_event_is_visible(p_event_id text)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1
    from community_private.community_wall_feed() event
    where event.event_id = p_event_id
      and event.occurred_at between now() - interval '72 hours' and now()
  );
$$;
revoke all on function community_private.community_wall_comment_event_is_visible(text)
  from public, anon, authenticated;

create function community_private.community_wall_comments(p_event_id text)
returns table (
  id uuid, user_id uuid, nickname text, avatar_id text,
  body text, created_at timestamptz, is_own boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') = 'true'
    or p_event_id is null or char_length(p_event_id) not between 1 and 140
    or not community_private.community_wall_comment_event_is_visible(p_event_id) then
    return;
  end if;

  return query
  select recent.id, recent.author_id, author.display_name, author.avatar_id,
    recent.body, recent.created_at, recent.author_id = actor
  from (
    select comment.id, comment.author_id, comment.body, comment.created_at
    from community_private.community_wall_comments comment
    where comment.event_id = p_event_id
    order by comment.created_at desc, comment.id desc
    limit 100
  ) recent
  join public.client_community_profiles author on author.user_id = recent.author_id
  order by recent.created_at, recent.id;
end;
$$;

create function community_private.community_add_wall_comment(p_event_id text, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  cleaned_body text;
  inserted_id uuid;
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') = 'true'
    or not exists (
      select 1 from public.client_community_profiles author where author.user_id = actor
    ) then
    raise exception using errcode = '42501', message = 'Set up your Community profile to comment.';
  end if;

  if p_body is null or char_length(p_body) > 2500 then
    raise exception using errcode = '22023', message = 'Enter a comment up to 500 characters.';
  end if;
  cleaned_body := regexp_replace(p_body, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if char_length(cleaned_body) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Enter a comment up to 500 characters.';
  end if;

  if p_event_id is null or char_length(p_event_id) not between 1 and 140
    or not community_private.community_wall_comment_event_is_visible(p_event_id) then
    raise exception using errcode = '42501', message = 'This post is no longer available.';
  end if;

  insert into community_private.community_wall_comments (event_id, author_id, body)
    values (p_event_id, actor, cleaned_body)
    returning community_wall_comments.id into inserted_id;
  return inserted_id;
end;
$$;

create function community_private.community_delete_wall_comment(p_comment_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') = 'true' then
    return false;
  end if;
  delete from community_private.community_wall_comments comment
    where comment.id = p_comment_id and comment.author_id = actor;
  return found;
end;
$$;

revoke all on function community_private.community_wall_comments(text) from public, anon, authenticated;
revoke all on function community_private.community_add_wall_comment(text, text) from public, anon, authenticated;
revoke all on function community_private.community_delete_wall_comment(uuid) from public, anon, authenticated;
grant execute on function community_private.community_wall_comments(text) to authenticated;
grant execute on function community_private.community_add_wall_comment(text, text) to authenticated;
grant execute on function community_private.community_delete_wall_comment(uuid) to authenticated;

create function public.community_wall_comments(p_event_id text)
returns table (
  id uuid, user_id uuid, nickname text, avatar_id text,
  body text, created_at timestamptz, is_own boolean
)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_wall_comments(p_event_id);
$$;

create function public.community_add_wall_comment(p_event_id text, p_body text)
returns uuid
language sql security invoker set search_path = '' as $$
  select community_private.community_add_wall_comment(p_event_id, p_body);
$$;

create function public.community_delete_wall_comment(p_comment_id uuid)
returns boolean
language sql security invoker set search_path = '' as $$
  select community_private.community_delete_wall_comment(p_comment_id);
$$;

revoke all on function public.community_wall_comments(text) from public, anon, authenticated;
revoke all on function public.community_add_wall_comment(text, text) from public, anon, authenticated;
revoke all on function public.community_delete_wall_comment(uuid) from public, anon, authenticated;
grant execute on function public.community_wall_comments(text) to authenticated;
grant execute on function public.community_add_wall_comment(text, text) to authenticated;
grant execute on function public.community_delete_wall_comment(uuid) to authenticated;
