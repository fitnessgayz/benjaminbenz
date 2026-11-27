-- Run against a disposable database with the Spotter and owner migrations applied.
begin;

insert into auth.users (id, email, email_confirmed_at)
values ('8d970117-1d2c-4d9d-b0e8-86c253ed0001', 'benjaminbenz.fit@gmail.com', now()),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'spotter-club-author@example.invalid', now()),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0003', 'spotter-club-reporter@example.invalid', now());

insert into spotter_private.club_cities (id, name, region, country)
values ('us:ca:owner-moderation-city', 'Owner Moderation City', 'CA', 'US'),
       ('us:ca:owner-other-city', 'Owner Other City', 'CA', 'US');
insert into spotter_private.training_zip_cities(zip, city_id)
values ('94103', 'us:ca:owner-moderation-city'), ('94110', 'us:ca:owner-moderation-city')
on conflict (zip) do update set city_id = excluded.city_id;

insert into spotter_private.profiles (user_id, preferences, zip, gender, waiver_version, active)
values ('8d970117-1d2c-4d9d-b0e8-86c253ed0002', '{"name":"Club author"}', '94103', 'undisclosed', 'spotter-waiver-v1', true),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0003', '{"name":"Club reporter"}', '94110', 'undisclosed', 'spotter-waiver-v1', true);
insert into spotter_private.local_club_waivers (member_id, club_id, version)
values ('8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'running', spotter_private.current_club_waiver_version()),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0003', 'running', spotter_private.current_club_waiver_version()),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0003', 'tennis', spotter_private.current_club_waiver_version());
insert into spotter_private.local_club_memberships (member_id, club_id, city_id)
values ('8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'running', 'us:ca:owner-moderation-city'),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0003', 'running', 'us:ca:owner-moderation-city'),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0003', 'tennis', 'us:ca:owner-moderation-city');

insert into spotter_private.local_club_posts (id, author_id, club_id, city_id, training_zip, body, deleted_at)
values ('8d970117-1d2c-4d9d-b0e8-86c253ed0101', '8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'running',
           'us:ca:owner-moderation-city', null, 'Synthetic city message', null),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0102', '8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'running',
           null, '94103', 'Synthetic legacy message', null),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0103', '8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'running',
           'us:ca:owner-other-city', null, 'Synthetic other city message', null),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0104', '8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'running',
           'us:ca:owner-moderation-city', null, null, now()),
       ('8d970117-1d2c-4d9d-b0e8-86c253ed0105', '8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'running',
           null, '99999', 'Synthetic unmapped legacy message', null);
insert into community_private.content_reports (id, reporter_id, member_id, content_kind, content_id, reason, details, content_excerpt) overriding system value
values (9100000000000201, '8d970117-1d2c-4d9d-b0e8-86c253ed0003',
           '8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'spotter_club_post', '8d970117-1d2c-4d9d-b0e8-86c253ed0101',
           'other', 'Synthetic report', 'Synthetic city message'),
       (9100000000000202, '8d970117-1d2c-4d9d-b0e8-86c253ed0003',
           '8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'spotter_club_post', '8d970117-1d2c-4d9d-b0e8-86c253ed0104',
           'other', 'Synthetic report of deleted post', 'Removed content must stay removed'),
       (9100000000000203, '8d970117-1d2c-4d9d-b0e8-86c253ed0003',
           '8d970117-1d2c-4d9d-b0e8-86c253ed0002', 'wall_post', '8d970117-1d2c-4d9d-b0e8-86c253ed0101',
           'other', 'Outside the Spotter group queue', 'Outside the Spotter group queue');
insert into community_private.content_reports (
    id, reporter_id, member_id, content_kind, content_id, reason, details, reviewed_at, reviewed_by, resolution
) overriding system value
values (9100000000000204, '8d970117-1d2c-4d9d-b0e8-86c253ed0003', '8d970117-1d2c-4d9d-b0e8-86c253ed0002',
    'spotter_club_post', '8d970117-1d2c-4d9d-b0e8-86c253ed0102', 'other', 'Previously reviewed report', now(),
    '8d970117-1d2c-4d9d-b0e8-86c253ed0001', 'dismissed');

select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$
begin
    begin
        perform public.gruntr_admin_spotter_cities();
        raise exception 'Anonymous user could invoke the owner city RPC.';
    exception when insufficient_privilege then null;
    end;
end;
$$;
reset role;

-- A JWT email string alone cannot impersonate the verified owner account.
select set_config('request.jwt.claims',
    '{"sub":"8d970117-1d2c-4d9d-b0e8-86c253ed0003","email":"benjaminbenz.fit@gmail.com"}', true);
set local role authenticated;
do $$
declare
    request_sql text;
begin
    foreach request_sql in array array[
        'select public.gruntr_admin_spotter_cities()',
        'select public.gruntr_admin_spotter_groups(''us:ca:owner-moderation-city'')',
        'select public.gruntr_admin_spotter_group_posts(''us:ca:owner-moderation-city'',''running'')',
        'select public.gruntr_admin_spotter_reports()',
        'select public.gruntr_admin_set_spotter_post_hidden(''8d970117-1d2c-4d9d-b0e8-86c253ed0101'',true)',
        'select public.gruntr_admin_resolve_spotter_report(''9100000000000201'',''resolved'')'
    ] loop
        begin
            execute request_sql;
            raise exception 'Unverified account could invoke an owner RPC.';
        exception when insufficient_privilege then null;
        end;
    end loop;
end;
$$;
reset role;

-- The verified owner has an account and no Spotter profile or club membership.
select set_config('request.jwt.claims',
    '{"sub":"8d970117-1d2c-4d9d-b0e8-86c253ed0001","email":"benjaminbenz.fit@gmail.com"}', true);
set local role authenticated;
do $$
declare
    city constant text := 'us:ca:owner-moderation-city';
    other_city constant text := 'us:ca:owner-other-city';
    post constant uuid := '8d970117-1d2c-4d9d-b0e8-86c253ed0101';
    legacy_post constant uuid := '8d970117-1d2c-4d9d-b0e8-86c253ed0102';
    deleted_post constant uuid := '8d970117-1d2c-4d9d-b0e8-86c253ed0104';
    report constant text := '9100000000000201';
    deleted_report constant text := '9100000000000202';
    wall_report constant text := '9100000000000203';
    result jsonb;
begin
    assert public.spotter_can_review_photos(), 'owner photo approval authorization is retained';
    assert not has_table_privilege('authenticated', 'spotter_private.club_moderation_audit', 'select');
    assert not has_table_privilege('authenticated', 'spotter_private.owner_club_posts', 'select');

    result := public.gruntr_admin_spotter_cities('owner moderation city, ca');
    assert result @> jsonb_build_array(jsonb_build_object('id', city, 'member_count', 2, 'open_report_count', 2));
    result := public.gruntr_admin_spotter_groups(city);
    assert result @> '[{"id":"running","member_count":2,"post_count":2,"open_report_count":2}]';
    result := public.gruntr_admin_spotter_group_posts(city, 'running');
    assert result @> jsonb_build_array(
        jsonb_build_object('id', post, 'body', 'Synthetic city message', 'legacy', false),
        jsonb_build_object('id', legacy_post, 'body', 'Synthetic legacy message', 'legacy', true));
    assert strpos(result::text, 'training_zip') = 0 and strpos(result::text, 'author_id') = 0;
    assert jsonb_array_length(public.gruntr_admin_spotter_group_posts(other_city, 'running')) = 1;
    assert public.gruntr_admin_spotter_cities() @> '[{"id":"legacy-unmapped","post_count":1}]';
    result := public.gruntr_admin_spotter_group_posts('legacy-unmapped', 'running');
    assert result @> '[{"body":"Synthetic unmapped legacy message","legacy":true}]';
    assert strpos(result::text, '99999') = 0;
    assert jsonb_array_length(public.gruntr_admin_spotter_group_posts(city, 'running', 1, 1)) = 1;

    result := public.gruntr_admin_spotter_reports();
    assert jsonb_array_length(result) = 2;
    assert result @> jsonb_build_array(jsonb_build_object('id', deleted_report, 'post_body', null));
    assert strpos(result::text, 'reporter_id') = 0 and strpos(result::text, 'content_excerpt') = 0;
    assert not public.gruntr_admin_resolve_spotter_report(wall_report, 'resolved');
    assert not public.gruntr_admin_resolve_spotter_report('9100000000000204', 'resolved');
    assert public.gruntr_admin_resolve_spotter_report('9100000000000204', 'dismissed');
    begin
        perform public.gruntr_admin_resolve_spotter_report('9223372036854775808', 'resolved');
        raise exception 'An out-of-range report ID was accepted.';
    exception when invalid_parameter_value then null;
    end;
    assert not public.gruntr_admin_set_spotter_post_hidden(deleted_post, false);
    assert public.gruntr_admin_set_spotter_post_hidden(post, true);
    assert public.gruntr_admin_set_spotter_post_hidden(post, true);
    assert public.gruntr_admin_set_spotter_post_hidden(legacy_post, true);
    assert not exists (
        select 1 from jsonb_array_elements(public.gruntr_admin_spotter_group_posts(city, 'running')) as item
        where item ->> 'id' = post::text and item ->> 'hidden_at' is null
    );
    assert public.gruntr_admin_resolve_spotter_report(report, 'resolved');
    assert public.gruntr_admin_resolve_spotter_report(report, 'resolved');
    assert public.gruntr_admin_resolve_spotter_report(deleted_report, 'dismissed');
    assert jsonb_array_length(public.gruntr_admin_spotter_reports()) = 0;
    assert jsonb_array_length(public.gruntr_admin_spotter_reports('resolved')) = 1;
    assert jsonb_array_length(public.gruntr_admin_spotter_reports('dismissed')) = 2;
end;
$$;
reset role;

select set_config('request.jwt.claims',
    '{"sub":"8d970117-1d2c-4d9d-b0e8-86c253ed0003","email":"spotter-club-reporter@example.invalid"}', true);
set local role authenticated;
do $$
begin
    assert not public.spotter_club_posts('running', 'us:ca:owner-moderation-city') @>
        '[{"id":"8d970117-1d2c-4d9d-b0e8-86c253ed0101"}]';
end;
$$;
reset role;

select set_config('request.jwt.claims',
    '{"sub":"8d970117-1d2c-4d9d-b0e8-86c253ed0001","email":"benjaminbenz.fit@gmail.com"}', true);
set local role authenticated;
do $$
begin
    assert public.gruntr_admin_set_spotter_post_hidden('8d970117-1d2c-4d9d-b0e8-86c253ed0101', false);
end;
$$;
reset role;

select set_config('request.jwt.claims',
    '{"sub":"8d970117-1d2c-4d9d-b0e8-86c253ed0003","email":"spotter-club-reporter@example.invalid"}', true);
set local role authenticated;
do $$
begin
    assert public.spotter_club_posts('running', 'us:ca:owner-moderation-city') @>
        '[{"id":"8d970117-1d2c-4d9d-b0e8-86c253ed0101"}]';
    assert not public.spotter_club_posts('running', 'us:ca:owner-moderation-city') @>
        '[{"id":"8d970117-1d2c-4d9d-b0e8-86c253ed0102"}]';
end;
$$;
reset role;

do $$
begin
    assert (select array_agg(action order by id) from spotter_private.club_moderation_audit) =
        array['hide', 'hide', 'resolve', 'dismiss', 'restore'],
        'moderation audit records only actual state changes';
end;
$$;

rollback;
