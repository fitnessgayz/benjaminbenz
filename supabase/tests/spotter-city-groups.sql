-- Run against a local Supabase stack with the Spotter City Groups migration applied.
begin;

insert into auth.users (id, email, email_confirmed_at) values
    ('00000000-0000-4000-8000-000000000101', 'city-alice@example.invalid', now()),
    ('00000000-0000-4000-8000-000000000102', 'city-ben@example.invalid', now()),
    ('00000000-0000-4000-8000-000000000103', 'city-chris@example.invalid', now()),
    ('00000000-0000-4000-8000-000000000104', 'city-devon@example.invalid', now()),
    ('00000000-0000-4000-8000-000000000105', 'city-elliot@example.invalid', now());

insert into spotter_private.profiles (user_id, preferences, zip, gender, waiver_version) values
    ('00000000-0000-4000-8000-000000000101', '{"name":"Alice"}', '94103', 'woman', 'spotter-waiver-v1'),
    ('00000000-0000-4000-8000-000000000102', '{"name":"Ben"}', '94110', 'man', 'spotter-waiver-v1'),
    ('00000000-0000-4000-8000-000000000103', '{"name":"Chris"}', '94612', 'man', 'spotter-waiver-v1'),
    ('00000000-0000-4000-8000-000000000104', '{"name":"Devon"}', '94103', 'undisclosed', 'spotter-waiver-v1'),
    ('00000000-0000-4000-8000-000000000105', '{"name":"Elliot"}', '99999', 'undisclosed', 'spotter-waiver-v1');

-- A legacy post retains its origin audience even after the author and club move to city membership.
insert into spotter_private.local_club_posts (id, author_id, club_id, training_zip, body)
values ('10000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000101',
    'running', '94103', 'Original ZIP board');

do $$
begin
    assert not has_function_privilege('anon', 'public.spotter_group_cities(text)', 'execute');
    assert not has_table_privilege('authenticated', 'spotter_private.training_zip_cities', 'select');
    assert not has_table_privilege('authenticated', 'spotter_private.local_club_memberships', 'select');
    assert not has_table_privilege('authenticated', 'spotter_private.local_club_posts', 'select');
    assert not has_function_privilege('authenticated', 'spotter_private.club_area(uuid,text)', 'execute');
    assert exists (
        select 1 from spotter_private.training_zip_cities
        where zip = '02108' and city_id = 'us-place-2507000'
    ), 'ZIP codes retain leading zeroes';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000101","email":"city-alice@example.invalid","role":"authenticated"}', true);
do $$
declare
    default_city jsonb;
begin
    default_city := public.spotter_group_cities('') -> 'default_city';
    assert default_city = '{"id":"us-place-0667000","name":"San Francisco","region":"CA","country":"US"}';
    assert public.spotter_group_cities('San Francisco, CA') #>> '{cities,0,id}' = 'us-place-0667000';
    assert public.spotter_group_cities('Portland') -> 'cities' @>
        '[{"name":"Portland","region":"OR"},{"name":"Portland","region":"ME"}]';
    assert public.spotter_group_cities('%') -> 'cities' = '[]'::jsonb;
    assert public.spotter_local_clubs() -> 0 ->> 'joined' = 'false';
    begin
        perform public.spotter_set_club_membership('running', true, 'us-place-0667000');
        raise exception 'Joining without the waiver succeeded.';
    exception when insufficient_privilege then null;
    end;
    begin
        perform public.spotter_local_clubs('94103');
        raise exception 'An explicit ZIP was accepted as a city.';
    exception when invalid_parameter_value then null;
    end;
    assert public.spotter_accept_club_waiver_and_join('running', 'spotter-club-waiver-v1');
    assert public.spotter_post_to_club('running', '10000000-0000-4000-8000-000000000102', 'New city board');
    assert public.spotter_post_to_club('running', '10000000-0000-4000-8000-000000000102', 'New city board', 'us-place-0667000');
    assert jsonb_array_length(public.spotter_club_posts('running')) = 2;
end;
$$;

select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000102","email":"city-ben@example.invalid","role":"authenticated"}', true);
do $$
declare
    board jsonb;
begin
    assert public.spotter_group_cities('') #>> '{default_city,id}' = 'us-place-0667000';
    assert public.spotter_local_clubs('us-place-0667000') #>> '{0,member_count}' = '1';
    begin
        perform public.spotter_club_posts('running', 'us-place-0667000');
        raise exception 'A nonmember could read the board.';
    exception when insufficient_privilege then null;
    end;
    assert public.spotter_accept_club_waiver_and_join('running', 'spotter-club-waiver-v1', 'us-place-0667000');
    assert public.spotter_local_clubs() #>> '{0,member_count}' = '2';
    board := public.spotter_club_posts('running', 'us-place-0667000');
    assert jsonb_array_length(board) = 1 and board #>> '{0,body}' = 'New city board';
    assert not (board -> 0 ? 'zip') and not (board -> 0 ? 'training_zip'), 'Do not expose member ZIPs';
    assert public.spotter_report_club_post('running', '10000000-0000-4000-8000-000000000102', 'Synthetic report', 'us-place-0667000');
    assert public.spotter_report_club_post('running', '10000000-0000-4000-8000-000000000102', 'Synthetic report', 'us-place-0667000');
    assert not public.spotter_delete_club_post('running', '10000000-0000-4000-8000-000000000102', 'us-place-0667000');
    begin
        perform public.spotter_report_club_post('running', '10000000-0000-4000-8000-000000000101', 'Outside legacy audience', 'us-place-0667000');
        raise exception 'Another ZIP gained access to an old post.';
    exception when insufficient_privilege then null;
    end;
end;
$$;

select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000103","email":"city-chris@example.invalid","role":"authenticated"}', true);
do $$
declare
    joined jsonb;
begin
    assert public.spotter_group_cities('') #>> '{default_city,id}' = 'us-place-0653000';
    assert public.spotter_local_clubs() #>> '{0,member_count}' = '0';
    assert public.spotter_accept_club_waiver_and_join('running', 'spotter-club-waiver-v1');
    assert public.spotter_set_club_membership('running', true, 'us-place-0667000');
    assert public.spotter_set_club_membership('running', true, 'us-place-0667000');
    joined := public.spotter_joined_city_clubs();
    assert jsonb_array_length(joined) = 2 and joined @>
        '[{"city":{"name":"Oakland"},"club":{"id":"running","member_count":1,"joined":true,"waiver_accepted":true}},
          {"city":{"name":"San Francisco"},"club":{"id":"running","member_count":3,"joined":true,"waiver_accepted":true}}]';
    assert public.spotter_club_posts('running') = '[]'::jsonb;
    assert jsonb_array_length(public.spotter_club_posts('running', 'us-place-0667000')) = 1;
    assert public.spotter_set_club_membership('running', false, 'us-place-0667000');
    assert public.spotter_joined_city_clubs() #>> '{0,city,name}' = 'Oakland';
    assert jsonb_array_length(public.spotter_joined_city_clubs()) = 1;
end;
$$;

select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000104","email":"city-devon@example.invalid","role":"authenticated"}', true);
do $$
begin
    assert public.spotter_accept_club_waiver_and_join('running', 'spotter-club-waiver-v1');
    assert jsonb_array_length(public.spotter_club_posts('running')) = 2, 'Same-ZIP members retain old posts';
end;
$$;

select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000105","email":"city-elliot@example.invalid","role":"authenticated"}', true);
do $$
begin
    assert public.spotter_group_cities('') -> 'default_city' = 'null'::jsonb;
    assert public.spotter_group_cities('Oakland, CA') #>> '{cities,0,name}' = 'Oakland';
    assert public.spotter_accept_club_waiver_and_join('running', 'spotter-club-waiver-v1');
    assert public.spotter_post_to_club('running', '10000000-0000-4000-8000-000000000103', 'Unmapped ZIP board');
    assert jsonb_array_length(public.spotter_club_posts('running')) = 1;
    assert public.spotter_set_club_membership('running', true, 'us-place-0653000');
    assert public.spotter_club_posts('running', 'us-place-0653000') = '[]'::jsonb;
end;
$$;

reset role;
do $$
begin
    assert (
        select count(*) from community_private.content_reports
        where content_id = '10000000-0000-4000-8000-000000000102' and content_kind = 'spotter_club_post'
    ) = 1, 'Reporting is repeat-safe';
end;
$$;
insert into community_private.member_blocks (blocker_id, blocked_id) values
    ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000101');

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000102","email":"city-ben@example.invalid","role":"authenticated"}', true);
do $$
begin
    assert public.spotter_club_posts('running') = '[]'::jsonb, 'Blocked member cannot appear in the city feed';
end;
$$;

reset role;
update spotter_private.local_club_posts set hidden_at = now()
    where id in ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000102');

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000104","email":"city-devon@example.invalid","role":"authenticated"}', true);
do $$
begin
    assert public.spotter_club_posts('running') = '[]'::jsonb, 'Moderation hides both city and legacy posts';
    begin
        perform public.spotter_report_club_post('running', '10000000-0000-4000-8000-000000000102', 'Hidden post', 'us-place-0667000');
        raise exception 'A hidden post was reportable.';
    exception when insufficient_privilege then null;
    end;
end;
$$;

reset role;
update spotter_private.profiles set zip = '94110' where user_id = '00000000-0000-4000-8000-000000000101';

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000101","email":"city-alice@example.invalid","role":"authenticated"}', true);
do $$
begin
    assert public.spotter_local_clubs() #>> '{0,joined}' = 'true', 'A same-city ZIP change preserves membership';
    assert public.spotter_delete_club_post('running', '10000000-0000-4000-8000-000000000102', 'us-place-0667000');
    assert public.spotter_post_to_club('running', '10000000-0000-4000-8000-000000000102', 'New city board');
end;
$$;

reset role;
do $$
begin
    assert exists (
        select 1 from spotter_private.local_club_posts
        where id = '10000000-0000-4000-8000-000000000102' and city_id = 'us-place-0667000'
            and training_zip is null and deleted_at is not null and body is null
    ), 'Retry cannot bring a deleted post back';
end;
$$;

rollback;
