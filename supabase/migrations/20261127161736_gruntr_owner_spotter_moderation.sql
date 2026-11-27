-- GRUNTR Admin uses the same verified owner authorization as Spotter photo approvals.
-- Owner access here is limited to club boards, aggregate counts, and club post reports.
create table spotter_private.club_report_resolutions (
    report_id bigint primary key references community_private.content_reports(id) on delete cascade,
    status text not null check (status in ('resolved', 'dismissed')),
    resolved_at timestamptz not null default clock_timestamp()
);

create table spotter_private.club_moderation_audit (
    id bigint generated always as identity primary key,
    post_id text not null,
    report_id bigint,
    action text not null check (action in ('hide', 'restore', 'resolve', 'dismiss')),
    actor_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default clock_timestamp(),
    check ((report_id is null) = (action in ('hide', 'restore')))
);

alter table spotter_private.club_report_resolutions enable row level security;
alter table spotter_private.club_moderation_audit enable row level security;
revoke all on spotter_private.club_report_resolutions, spotter_private.club_moderation_audit
    from public, anon, authenticated;

create index spotter_club_posts_city_moderation on spotter_private.local_club_posts
    (city_id, club_id, created_at desc, id desc) where city_id is not null;

create index spotter_club_reports_by_post on community_private.content_reports (content_id)
    where content_kind = 'spotter_club_post';

create index spotter_club_reports_by_date on community_private.content_reports (created_at desc, id desc)
    where content_kind = 'spotter_club_post';

-- Keep unmapped ZIP boards reachable to the owner without returning their ZIP.
create view spotter_private.owner_group_locations with (security_invoker = true) as
    select id, name, region, country from spotter_private.club_cities
    union all
    select 'legacy-unmapped', 'Unassigned legacy groups', ''::text, ''::text;

-- Mapping old posts here leaves their member audience scoped to the original ZIP.
create view spotter_private.owner_club_posts with (security_invoker = true) as
    select post.id, post.author_id, post.club_id, post.city_id, post.body,
        post.created_at, post.hidden_at, post.deleted_at, false as legacy
    from spotter_private.local_club_posts post
    where post.city_id is not null
    union all
    select post.id, post.author_id, post.club_id, location.city_id, post.body,
        post.created_at, post.hidden_at, post.deleted_at, true
    from spotter_private.local_club_posts post
    join spotter_private.training_zip_cities location on location.zip = post.training_zip
    where post.city_id is null
    union all
    select post.id, post.author_id, post.club_id, 'legacy-unmapped', post.body,
        post.created_at, post.hidden_at, post.deleted_at, true
    from spotter_private.local_club_posts post
    where post.city_id is null and not exists (
        select 1 from spotter_private.training_zip_cities location where location.zip = post.training_zip
    );

revoke all on spotter_private.owner_group_locations, spotter_private.owner_club_posts from public, anon, authenticated;

create function spotter_private.require_gruntr_owner() returns void
language plpgsql stable set search_path = '' as $$
begin
    if spotter_private.can_review_photos() is distinct from true then
        raise exception 'GRUNTR Admin requires the verified owner account.' using errcode = '42501';
    end if;
end;
$$;

create function spotter_private.owner_open_report_count(p_post_id uuid) returns bigint
language sql stable set search_path = '' as $$
    select count(*) from community_private.content_reports report
    where report.content_kind = 'spotter_club_post' and report.content_id = p_post_id::text
        and report.reviewed_at is null
        and not exists (
            select 1 from spotter_private.club_report_resolutions resolution
            where resolution.report_id = report.id
        );
$$;

create function spotter_private.owner_city_memberships(p_city_id text)
returns table (member_id uuid, club_id text)
language sql stable set search_path = '' as $$
    select membership.member_id, membership.club_id
    from spotter_private.local_club_memberships membership
    join spotter_private.profiles profile on profile.user_id = membership.member_id and profile.active
    join spotter_private.local_club_waivers waiver on waiver.member_id = membership.member_id
        and waiver.club_id = membership.club_id and waiver.version = spotter_private.current_club_waiver_version()
    where spotter_private.profile_is_visible(profile.user_id)
        and (membership.city_id = p_city_id or (
            p_city_id = 'legacy-unmapped' and membership.city_id is null and profile.zip = membership.training_zip
            and not exists (select 1 from spotter_private.training_zip_cities mapping where mapping.zip = membership.training_zip)
        ));
$$;

create function spotter_private.owner_club_member_counts(p_city_id text)
returns table (club_id text, member_count bigint)
language sql stable set search_path = '' as $$
    select membership.club_id, count(*) from spotter_private.owner_city_memberships(p_city_id) membership
    group by membership.club_id;
$$;

create function spotter_private.owner_club_post_counts(p_city_id text)
returns table (club_id text, post_count bigint, open_report_count bigint)
language sql stable set search_path = '' as $$
    select post.club_id, count(*) filter (where post.deleted_at is null),
        sum(spotter_private.owner_open_report_count(post.id))::bigint
    from spotter_private.owner_club_posts post
    where post.city_id = p_city_id
    group by post.club_id;
$$;

create function spotter_private.owner_group_cities(p_query text, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    search text := btrim(regexp_replace(lower(left(coalesce(p_query, ''), 100)), '[,[:space:]]+', ' ', 'g'));
begin
    perform spotter_private.require_gruntr_owner();
    return coalesce((
        with active_locations as materialized (
            select distinct coalesce(membership.city_id, 'legacy-unmapped') as id
            from spotter_private.local_club_memberships membership
            where search = '' and (membership.city_id is not null or not exists (
                select 1 from spotter_private.training_zip_cities mapping where mapping.zip = membership.training_zip
            ))
            union
            select distinct post.city_id from spotter_private.owner_club_posts post where search = ''
        )
        select jsonb_agg(jsonb_build_object(
            'id', city.id, 'name', city.name, 'region', city.region, 'country', city.country,
            'member_count', (select count(distinct member_id) from spotter_private.owner_city_memberships(city.id)),
            'post_count', stats.post_count, 'open_report_count', stats.open_report_count
        ) order by city.name, city.region, city.id)
        from (
            select catalog.id, catalog.name, catalog.region, catalog.country
            from spotter_private.owner_group_locations catalog
            where (search = '' and exists (select 1 from active_locations activity where activity.id = catalog.id))
                or (search <> '' and strpos(lower(concat_ws(' ', catalog.name, catalog.region, catalog.country)), search) > 0)
            order by catalog.name, catalog.region, catalog.id
            limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
        ) city
        cross join lateral (
            select coalesce(sum(post_count), 0) as post_count,
                coalesce(sum(open_report_count), 0) as open_report_count
            from spotter_private.owner_club_post_counts(city.id)
        ) stats
    ), '[]'::jsonb);
end;
$$;

create function spotter_private.owner_city_groups(p_city_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
    perform spotter_private.require_gruntr_owner();
    if not exists (select 1 from spotter_private.owner_group_locations where id = p_city_id) then
        raise exception 'Choose a Spotter city.' using errcode = '22023';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', club.id, 'member_count', coalesce(members.member_count, 0),
            'post_count', coalesce(posts.post_count, 0), 'open_report_count', coalesce(posts.open_report_count, 0)
        ) order by club.position)
        from spotter_private.local_club_catalog club
        left join spotter_private.owner_club_member_counts(p_city_id) members on members.club_id = club.id
        left join spotter_private.owner_club_post_counts(p_city_id) posts on posts.club_id = club.id
    ), '[]'::jsonb);
end;
$$;

create function spotter_private.owner_group_posts(
    p_city_id text, p_club_id text, p_limit integer, p_offset integer
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
    perform spotter_private.require_gruntr_owner();
    if not exists (select 1 from spotter_private.owner_group_locations where id = p_city_id)
        or not exists (select 1 from spotter_private.local_club_catalog where id = p_club_id) then
        raise exception 'Choose a Spotter city and group.' using errcode = '22023';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', post.id, 'author_name', coalesce(nullif(author.preferences ->> 'name', ''), 'Spotter member'),
            'body', post.body, 'created_at', post.created_at, 'hidden_at', post.hidden_at,
            'deleted_at', post.deleted_at, 'legacy', post.legacy,
            'open_report_count', spotter_private.owner_open_report_count(post.id)
        ) order by post.created_at desc, post.id desc)
        from (
            select * from spotter_private.owner_club_posts
            where city_id = p_city_id and club_id = p_club_id
            order by created_at desc, id desc
            limit least(greatest(coalesce(p_limit, 40), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
        ) post
        left join spotter_private.profiles author on author.user_id = post.author_id
    ), '[]'::jsonb);
end;
$$;

create function spotter_private.owner_group_reports(p_status text, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
    perform spotter_private.require_gruntr_owner();
    if p_status is null or p_status not in ('open', 'resolved', 'dismissed', 'all') then
        raise exception 'Choose a report status.' using errcode = '22023';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', report.id::text, 'post_id', post.id, 'city_id', city.id,
            'city_name', city.name, 'city_region', city.region, 'city_country', city.country,
            'club_id', post.club_id, 'author_name', nullif(author.preferences ->> 'name', ''),
            'post_body', post.body, 'post_hidden_at', post.hidden_at, 'post_deleted_at', post.deleted_at,
            'reason', report.reason, 'details', report.details, 'created_at', report.created_at,
            'status', report.status, 'resolved_at', report.resolved_at
        ) order by report.created_at desc, report.id desc)
        from (
            select queue.id, queue.content_id, queue.reason, queue.details, queue.created_at,
                review.status, coalesce(queue.reviewed_at, resolution.resolved_at) as resolved_at
            from community_private.content_reports queue
            left join spotter_private.club_report_resolutions resolution on resolution.report_id = queue.id
            cross join lateral (
                select case
                    when queue.reviewed_at is not null then
                        case when queue.resolution = 'dismissed' then 'dismissed' else 'resolved' end
                    else coalesce(resolution.status, 'open')
                end as status
            ) review
            where queue.content_kind = 'spotter_club_post' and (p_status = 'all' or review.status = p_status)
            order by queue.created_at desc, queue.id desc
            limit least(greatest(coalesce(p_limit, 40), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
        ) report
        -- Historical report IDs are stored as text in the shared community reports table.
        left join spotter_private.owner_club_posts post on post.id = case
            when report.content_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then report.content_id::uuid
        end
        left join spotter_private.owner_group_locations city on city.id = post.city_id
        left join spotter_private.profiles author on author.user_id = post.author_id
    ), '[]'::jsonb);
end;
$$;

create function spotter_private.owner_set_group_post_hidden(p_post_id uuid, p_hidden boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
    previous_hidden_at timestamptz;
    previous_deleted_at timestamptz;
begin
    perform spotter_private.require_gruntr_owner();
    if p_hidden is null then
        raise exception 'Choose whether to hide or restore this post.' using errcode = '22023';
    end if;
    select hidden_at, deleted_at into previous_hidden_at, previous_deleted_at
    from spotter_private.local_club_posts where id = p_post_id for update;
    if not found or previous_deleted_at is not null then
        return false;
    end if;
    if (previous_hidden_at is not null) is distinct from p_hidden then
        update spotter_private.local_club_posts set hidden_at = case when p_hidden then clock_timestamp() else null end
        where id = p_post_id;
        insert into spotter_private.club_moderation_audit (post_id, action, actor_id)
        values (p_post_id::text, case when p_hidden then 'hide' else 'restore' end, (select auth.uid()));
    end if;
    return true;
end;
$$;

create function spotter_private.owner_resolve_group_report(p_report_id text, p_status text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
    report_number bigint;
    target_post text;
    existing_reviewed_at timestamptz;
    existing_resolution text;
begin
    perform spotter_private.require_gruntr_owner();
    if p_status is null or p_status not in ('resolved', 'dismissed') then
        raise exception 'Choose whether to resolve or dismiss this report.' using errcode = '22023';
    end if;
    if p_report_id is null or p_report_id !~ '^[1-9][0-9]{0,18}$' then
        raise exception 'Choose a valid Spotter report.' using errcode = '22023';
    end if;
    if p_report_id::numeric > 9223372036854775807 then
        raise exception 'Choose a valid Spotter report.' using errcode = '22023';
    end if;
    report_number := p_report_id::bigint;
    select content_id, reviewed_at, resolution into target_post, existing_reviewed_at, existing_resolution
    from community_private.content_reports
    where id = report_number and content_kind = 'spotter_club_post' for update;
    if not found then
        return false;
    end if;
    if existing_reviewed_at is not null then
        return p_status = case when existing_resolution = 'dismissed' then 'dismissed' else 'resolved' end;
    end if;
    insert into spotter_private.club_report_resolutions as existing (report_id, status)
    values (report_number, p_status)
    on conflict (report_id) do update set status = excluded.status, resolved_at = excluded.resolved_at
    where existing.status is distinct from excluded.status;
    if found then
        insert into spotter_private.club_moderation_audit (post_id, report_id, action, actor_id)
        values (target_post, report_number, case when p_status = 'resolved' then 'resolve' else 'dismiss' end,
            (select auth.uid()));
    end if;
    return true;
end;
$$;

create function public.gruntr_admin_spotter_cities(
    p_query text default '', p_limit integer default 50, p_offset integer default 0
) returns jsonb language sql stable set search_path = '' as $$
    select spotter_private.owner_group_cities(p_query, p_limit, p_offset);
$$;

create function public.gruntr_admin_spotter_groups(p_city_id text) returns jsonb
language sql stable set search_path = '' as $$
    select spotter_private.owner_city_groups(p_city_id);
$$;

create function public.gruntr_admin_spotter_group_posts(
    p_city_id text, p_club_id text, p_limit integer default 40, p_offset integer default 0
) returns jsonb language sql stable set search_path = '' as $$
    select spotter_private.owner_group_posts(p_city_id, p_club_id, p_limit, p_offset);
$$;

create function public.gruntr_admin_spotter_reports(
    p_status text default 'open', p_limit integer default 40, p_offset integer default 0
) returns jsonb language sql stable set search_path = '' as $$
    select spotter_private.owner_group_reports(p_status, p_limit, p_offset);
$$;

create function public.gruntr_admin_set_spotter_post_hidden(p_post_id uuid, p_hidden boolean) returns boolean
language sql set search_path = '' as $$
    select spotter_private.owner_set_group_post_hidden(p_post_id, p_hidden);
$$;

create function public.gruntr_admin_resolve_spotter_report(p_report_id text, p_status text) returns boolean
language sql set search_path = '' as $$
    select spotter_private.owner_resolve_group_report(p_report_id, p_status);
$$;

revoke all on function spotter_private.require_gruntr_owner(), spotter_private.owner_open_report_count(uuid),
    spotter_private.owner_city_memberships(text), spotter_private.owner_club_member_counts(text),
    spotter_private.owner_club_post_counts(text),
    spotter_private.owner_group_cities(text, integer, integer), spotter_private.owner_city_groups(text),
    spotter_private.owner_group_posts(text, text, integer, integer),
    spotter_private.owner_group_reports(text, integer, integer),
    spotter_private.owner_set_group_post_hidden(uuid, boolean), spotter_private.owner_resolve_group_report(text, text),
    public.gruntr_admin_spotter_cities(text, integer, integer), public.gruntr_admin_spotter_groups(text),
    public.gruntr_admin_spotter_group_posts(text, text, integer, integer),
    public.gruntr_admin_spotter_reports(text, integer, integer),
    public.gruntr_admin_set_spotter_post_hidden(uuid, boolean), public.gruntr_admin_resolve_spotter_report(text, text)
    from public, anon, authenticated;

grant execute on function spotter_private.owner_group_cities(text, integer, integer),
    spotter_private.owner_city_groups(text), spotter_private.owner_group_posts(text, text, integer, integer),
    spotter_private.owner_group_reports(text, integer, integer), spotter_private.owner_set_group_post_hidden(uuid, boolean),
    spotter_private.owner_resolve_group_report(text, text),
    public.gruntr_admin_spotter_cities(text, integer, integer), public.gruntr_admin_spotter_groups(text),
    public.gruntr_admin_spotter_group_posts(text, text, integer, integer),
    public.gruntr_admin_spotter_reports(text, integer, integer),
    public.gruntr_admin_set_spotter_post_hidden(uuid, boolean), public.gruntr_admin_resolve_spotter_report(text, text)
    to authenticated;
