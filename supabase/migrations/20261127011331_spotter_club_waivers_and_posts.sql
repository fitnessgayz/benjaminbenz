create table spotter_private.local_club_catalog (
    id text primary key,
    position integer not null unique
);

insert into spotter_private.local_club_catalog (id, position) values
    ('running', 1), ('pickleball', 2), ('volleyball', 3), ('tennis', 4), ('hiking', 5), ('cycling', 6),
    ('basketball', 7), ('soccer', 8), ('frisbee', 9), ('swimming', 10);

alter table spotter_private.local_club_memberships
    drop constraint local_club_memberships_club_id_check,
    add constraint local_club_memberships_club_id_fkey foreign key (club_id)
        references spotter_private.local_club_catalog(id);

create table spotter_private.local_club_waivers (
    member_id uuid not null references spotter_private.profiles(user_id) on delete cascade,
    club_id text not null references spotter_private.local_club_catalog(id),
    version text not null,
    accepted_at timestamptz not null default now(),
    primary key (member_id, club_id, version)
);

create table spotter_private.local_club_posts (
    id uuid primary key,
    author_id uuid not null references spotter_private.profiles(user_id) on delete cascade,
    club_id text not null references spotter_private.local_club_catalog(id),
    training_zip text not null,
    body text check (char_length(body) between 1 and 1000),
    created_at timestamptz not null default clock_timestamp(),
    deleted_at timestamptz,
    check ((body is null) = (deleted_at is not null))
);

create index spotter_local_club_posts_feed on spotter_private.local_club_posts
    (training_zip, club_id, created_at desc, id desc) where deleted_at is null;
create index spotter_local_club_posts_author_recent on spotter_private.local_club_posts (author_id, created_at desc);

alter table spotter_private.local_club_catalog enable row level security;
alter table spotter_private.local_club_waivers enable row level security;
alter table spotter_private.local_club_posts enable row level security;
revoke all on spotter_private.local_club_catalog, spotter_private.local_club_waivers, spotter_private.local_club_posts
    from public, anon, authenticated;

alter table community_private.content_reports
    drop constraint content_reports_content_kind_check,
    add constraint content_reports_content_kind_check check (content_kind in (
        'wall_post', 'wall_comment', 'profile', 'spotter_profile', 'spotter_message', 'spotter_photo', 'spotter_club_post'
    ));

create function spotter_private.current_club_waiver_version() returns text
language sql immutable set search_path = '' as $$
    select 'spotter-club-waiver-v1'::text;
$$;

-- Lock the actor's profile during writes so a concurrent move, pause or leave is serialized.
create function spotter_private.lock_club_actor_zip(p_actor uuid) returns text
language plpgsql set search_path = '' as $$
declare
    area text;
begin
    select zip into area from spotter_private.profiles
    where user_id = p_actor and active and spotter_private.profile_is_visible(p_actor) for update;
    if not found then
        raise exception 'Activate your Spotter profile first.' using errcode = '42501';
    end if;
    return area;
end;
$$;

create function spotter_private.club_board_member_area(p_member uuid, p_club text) returns text
language sql stable set search_path = '' as $$
    select membership.training_zip
    from spotter_private.local_club_memberships membership
    join spotter_private.profiles profile on profile.user_id = membership.member_id
        and profile.active and profile.zip = membership.training_zip
    join spotter_private.local_club_waivers waiver on waiver.member_id = membership.member_id
        and waiver.club_id = membership.club_id and waiver.version = spotter_private.current_club_waiver_version()
    where membership.member_id = p_member and membership.club_id = p_club
      and spotter_private.profile_is_visible(p_member);
$$;

create function spotter_private.require_club_board_area(p_actor uuid, p_club text) returns text
language plpgsql stable set search_path = '' as $$
declare
    area text := spotter_private.club_board_member_area(p_actor, p_club);
begin
    if area is null then
        raise exception 'Join this local Spotter club first.' using errcode = '42501';
    end if;
    return area;
end;
$$;

create or replace function spotter_private.get_local_clubs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    area text;
    current_terms_version text := spotter_private.current_club_waiver_version();
begin
    select zip into area from spotter_private.profiles where user_id = actor;
    return (
        select jsonb_agg(jsonb_build_object(
            'id', club.id,
            'member_count', coalesce(local_members.member_count, 0),
            'joined', coalesce(local_members.joined, false),
            'waiver_accepted', own_waiver.member_id is not null
        ) order by club.position)
        from spotter_private.local_club_catalog club
        left join spotter_private.local_club_waivers own_waiver on own_waiver.member_id = actor
            and own_waiver.club_id = club.id and own_waiver.version = current_terms_version
        left join (
            select membership.club_id, count(*)::integer as member_count,
                bool_or(membership.member_id = actor) as joined
            from spotter_private.local_club_memberships membership
            join spotter_private.profiles member on member.user_id = membership.member_id
                and member.active and member.zip = membership.training_zip
            join spotter_private.local_club_waivers waiver on waiver.member_id = membership.member_id
                and waiver.club_id = membership.club_id and waiver.version = current_terms_version
            where membership.training_zip = area
                and spotter_private.profile_is_visible(member.user_id)
                and not community_private.actors_are_blocked(actor, member.user_id)
            group by membership.club_id
        ) local_members on local_members.club_id = club.id
    );
end;
$$;

create or replace function spotter_private.set_local_club_membership(p_club text, p_joined boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    area text;
begin
    if p_joined is null or not exists (select 1 from spotter_private.local_club_catalog where id = p_club) then
        raise exception 'Choose a Spotter club and whether to join.' using errcode = '22023';
    end if;
    area := spotter_private.lock_club_actor_zip(actor);
    if p_joined then
        if not exists (
            select 1 from spotter_private.local_club_waivers where member_id = actor and club_id = p_club
                and version = spotter_private.current_club_waiver_version()
        ) then
            raise exception 'Accept the current waiver before joining this club.' using errcode = '42501';
        end if;
        insert into spotter_private.local_club_memberships (member_id, club_id, training_zip)
        values (actor, p_club, area) on conflict (member_id, club_id) do nothing;
    else
        delete from spotter_private.local_club_memberships where member_id = actor and club_id = p_club;
    end if;
    return true;
end;
$$;

create function spotter_private.accept_local_club_waiver_and_join(p_club text, p_version text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
begin
    if p_version is distinct from spotter_private.current_club_waiver_version()
        or not exists (select 1 from spotter_private.local_club_catalog where id = p_club) then
        raise exception 'Choose a club and accept its current waiver.' using errcode = '22023';
    end if;
    perform spotter_private.lock_club_actor_zip(actor);
    insert into spotter_private.local_club_waivers (member_id, club_id, version)
    values (actor, p_club, p_version) on conflict (member_id, club_id, version) do nothing;
    return spotter_private.set_local_club_membership(p_club, true);
end;
$$;

create function spotter_private.club_post_visible(p_viewer uuid, p_post spotter_private.local_club_posts)
returns boolean language sql stable set search_path = '' as $$
    select p_post.deleted_at is null
        and spotter_private.club_board_member_area(p_post.author_id, p_post.club_id) = p_post.training_zip
        and not community_private.actors_are_blocked(p_viewer, p_post.author_id)
        and community_private.viewer_can_see_content('spotter_club_post', p_post.id::text);
$$;

create function spotter_private.list_local_club_posts(p_club text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    area text := spotter_private.require_club_board_area(actor, p_club);
begin
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', post.id, 'author_name', post.author_name, 'body', post.body,
            'created_at', post.created_at, 'mine', post.author_id = actor
        ) order by post.created_at desc, post.id desc)
        from (
            select candidate.id, candidate.author_id, candidate.body, candidate.created_at,
                author.preferences ->> 'name' as author_name
            from spotter_private.local_club_posts candidate
            join spotter_private.profiles author on author.user_id = candidate.author_id
            where candidate.training_zip = area and candidate.club_id = p_club and candidate.deleted_at is null
                and spotter_private.club_post_visible(actor, candidate)
            order by candidate.created_at desc, candidate.id desc
            limit 40
        ) post
    ), '[]'::jsonb);
end;
$$;

create function spotter_private.post_to_local_club(p_club text, p_post_id uuid, p_body text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    area text;
    cleaned text := spotter_private.clean_text(p_body, 1000);
    previous spotter_private.local_club_posts;
begin
    if p_post_id is null or cleaned = '' then
        raise exception 'Enter a message to post to this club.' using errcode = '22023';
    end if;
    perform spotter_private.lock_club_actor_zip(actor);
    area := spotter_private.require_club_board_area(actor, p_club);
    select * into previous from spotter_private.local_club_posts where id = p_post_id;
    if found then
        if previous.author_id = actor and previous.club_id = p_club and previous.training_zip = area
            and (previous.body = cleaned or previous.deleted_at is not null) then
            return true;
        end if;
        raise exception 'This message could not be saved.' using errcode = '22023';
    end if;
    if (select count(*) from spotter_private.local_club_posts
        where author_id = actor and created_at > clock_timestamp() - interval '1 minute') >= 20 then
        raise exception 'Please wait before sending another message.' using errcode = '22023';
    end if;
    insert into spotter_private.local_club_posts (id, author_id, club_id, training_zip, body)
    values (p_post_id, actor, p_club, area, cleaned) on conflict (id) do nothing;
    if not found then raise exception 'This message could not be saved.' using errcode = '22023'; end if;
    return true;
end;
$$;

create function spotter_private.delete_local_club_post(p_club text, p_post_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    area text;
begin
    perform spotter_private.lock_club_actor_zip(actor);
    area := spotter_private.require_club_board_area(actor, p_club);
    -- Keep the request ID so an earlier retry cannot restore deleted content.
    update spotter_private.local_club_posts set body = null, deleted_at = coalesce(deleted_at, clock_timestamp())
    where id = p_post_id and club_id = p_club and training_zip = area and author_id = actor;
    return found;
end;
$$;

create function spotter_private.report_local_club_post(p_club text, p_post_id uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    area text;
    clean_reason text := btrim(coalesce(p_reason, ''), E' \n\r\t');
    post spotter_private.local_club_posts;
begin
    if char_length(clean_reason) not between 1 and 500 then
        raise exception 'Enter a report reason.' using errcode = '22023';
    end if;
    perform spotter_private.lock_club_actor_zip(actor);
    area := spotter_private.require_club_board_area(actor, p_club);
    perform pg_advisory_xact_lock(hashtextextended('community-report:' || actor::text, 0));
    select * into post from spotter_private.local_club_posts candidate
    where candidate.id = p_post_id and candidate.club_id = p_club and candidate.training_zip = area
      and candidate.author_id <> actor and spotter_private.club_post_visible(actor, candidate);
    if not found then
        raise exception 'This club message is unavailable.' using errcode = '42501';
    end if;
    if exists (select 1 from community_private.content_reports where reporter_id = actor
        and content_kind = 'spotter_club_post' and content_id = post.id::text) then return true; end if;
    if (select count(*) from community_private.content_reports where reporter_id = actor
        and created_at >= now() - interval '1 day') >= 30 then
        raise exception 'Daily community report limit reached.' using errcode = '22023';
    end if;
    insert into community_private.content_reports (
        reporter_id, member_id, content_kind, content_id, reason, details, content_excerpt
    ) values (actor, post.author_id, 'spotter_club_post', post.id::text, 'other', clean_reason, left(post.body, 500));
    return true;
end;
$$;

create function public.spotter_accept_club_waiver_and_join(p_club text, p_version text) returns boolean
language sql set search_path = '' as $$
    select spotter_private.accept_local_club_waiver_and_join(p_club, p_version);
$$;

create function public.spotter_club_posts(p_club text) returns jsonb
language sql stable set search_path = '' as $$
    select spotter_private.list_local_club_posts(p_club);
$$;

create function public.spotter_post_to_club(p_club text, p_post_id uuid, p_body text) returns boolean
language sql set search_path = '' as $$
    select spotter_private.post_to_local_club(p_club, p_post_id, p_body);
$$;

create function public.spotter_delete_club_post(p_club text, p_post_id uuid) returns boolean
language sql set search_path = '' as $$
    select spotter_private.delete_local_club_post(p_club, p_post_id);
$$;

create function public.spotter_report_club_post(p_club text, p_post_id uuid, p_reason text) returns boolean
language sql set search_path = '' as $$
    select spotter_private.report_local_club_post(p_club, p_post_id, p_reason);
$$;

revoke execute on function spotter_private.current_club_waiver_version(), spotter_private.lock_club_actor_zip(uuid),
    spotter_private.club_board_member_area(uuid, text), spotter_private.require_club_board_area(uuid, text),
    spotter_private.club_post_visible(uuid, spotter_private.local_club_posts),
    spotter_private.accept_local_club_waiver_and_join(text, text), spotter_private.list_local_club_posts(text),
    spotter_private.post_to_local_club(text, uuid, text), spotter_private.delete_local_club_post(text, uuid),
    spotter_private.report_local_club_post(text, uuid, text), public.spotter_accept_club_waiver_and_join(text, text),
    public.spotter_club_posts(text), public.spotter_post_to_club(text, uuid, text),
    public.spotter_delete_club_post(text, uuid), public.spotter_report_club_post(text, uuid, text)
    from public, anon, authenticated;

grant execute on function spotter_private.accept_local_club_waiver_and_join(text, text),
    spotter_private.list_local_club_posts(text), spotter_private.post_to_local_club(text, uuid, text),
    spotter_private.delete_local_club_post(text, uuid), spotter_private.report_local_club_post(text, uuid, text),
    public.spotter_accept_club_waiver_and_join(text, text), public.spotter_club_posts(text),
    public.spotter_post_to_club(text, uuid, text), public.spotter_delete_club_post(text, uuid),
    public.spotter_report_club_post(text, uuid, text) to authenticated;
