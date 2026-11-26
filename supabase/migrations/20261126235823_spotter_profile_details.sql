-- Additive Spotter profile details and private photo slots.
create table spotter_private.profile_details (
    member_id uuid primary key references spotter_private.profiles(user_id) on delete cascade,
    body_type text not null default '' check (body_type in ('', 'ectomorph', 'mesomorph', 'endomorph', 'mixed')),
    supplements text not null default '' check (char_length(supplements) <= 240),
    current_program text not null default '' check (char_length(current_program) <= 120),
    shared_stats jsonb not null default '{}',
    check (jsonb_typeof(shared_stats) = 'object')
);

create table spotter_private.profile_photos (
    upload_id uuid primary key,
    member_id uuid not null references spotter_private.profiles(user_id) on delete cascade,
    slot integer not null check (slot between 0 and 3),
    path text generated always as (member_id::text || '/' || upload_id::text || '.jpg') stored unique,
    status text not null default 'reserved' check (status in ('reserved', 'pending', 'approved', 'rejected', 'retired')),
    reserved_at timestamptz not null default clock_timestamp(),
    submitted_at timestamptz,
    reviewed_at timestamptz
);
create unique index spotter_current_photo_slot on spotter_private.profile_photos (member_id, slot)
where status in ('pending', 'approved', 'rejected');
create unique index spotter_reserved_photo_slot on spotter_private.profile_photos (member_id, slot)
where status = 'reserved';
create index spotter_photo_daily_reservations on spotter_private.profile_photos (member_id, reserved_at);
create index spotter_pending_photo_reviews on spotter_private.profile_photos (submitted_at) where status = 'pending';

alter table spotter_private.profile_details enable row level security;
alter table spotter_private.profile_photos enable row level security;
revoke all on spotter_private.profile_details, spotter_private.profile_photos from public, anon, authenticated;
grant select, update (status, reviewed_at) on spotter_private.profile_photos to service_role;

alter table community_private.content_reports
    drop constraint content_reports_content_kind_check,
    add constraint content_reports_content_kind_check check (
        content_kind in ('wall_post', 'wall_comment', 'profile', 'spotter_profile', 'spotter_message', 'spotter_photo')
    );

-- Bucket settings only. Use the Storage API for object uploads and deletions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spotter-profile-photos', 'spotter-profile-photos', false, 2097152, array['image/jpeg']);

create function spotter_private.accepted_connection(first_member uuid, second_member uuid)
returns boolean language sql stable set search_path = '' as $$
    select exists (
        select 1 from spotter_private.connections
        where least(sender_id, recipient_id) = least(first_member, second_member)
            and greatest(sender_id, recipient_id) = greatest(first_member, second_member)
            and status = 'accepted'
    );
$$;

create function spotter_private.photo_is_public_to_member(viewer uuid, photo spotter_private.profile_photos)
returns boolean language sql stable set search_path = '' as $$
    select photo.status = 'approved'
        and community_private.viewer_can_see_content('spotter_photo', photo.upload_id::text)
        and spotter_private.contactable(viewer, photo.member_id);
$$;

-- Existing clients keep the same profile keys. New grids can use the approved primary image directly.
create or replace function spotter_private.profile_payload(profile spotter_private.profiles, own boolean)
returns jsonb language sql stable set search_path = '' as $$
    select case when own then
        profile.preferences || jsonb_build_object(
            'zip', profile.zip, 'gender', profile.gender, 'active', profile.active
        )
    else
        (profile.preferences - array['gym_name', 'other_gym', 'search_area', 'radius'])
            || jsonb_build_object('id', profile.user_id, 'gender', profile.gender)
            || coalesce((
                select jsonb_build_object('portrait_path', photo.path)
                from spotter_private.profile_photos photo
                join storage.objects object on object.bucket_id = 'spotter-profile-photos'
                    and object.name = photo.path and object.owner_id = photo.member_id::text
                where photo.member_id = profile.user_id and photo.slot = 0
                    and spotter_private.photo_is_public_to_member((select auth.uid()), photo)
            ), '{}'::jsonb)
    end;
$$;

create function spotter_private.profile_details_payload(viewer uuid, member uuid)
returns jsonb language sql stable set search_path = '' as $$
    select jsonb_build_object(
        'body_type', coalesce(details.body_type, ''),
        'supplements', coalesce(details.supplements, ''),
        'current_program', coalesce(details.current_program, ''),
        'shared_stats', case when viewer = member or spotter_private.accepted_connection(viewer, member)
            then coalesce(details.shared_stats, '{}'::jsonb) else '{}'::jsonb end,
        'photos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'slot', photo.slot, 'path', photo.path,
                'status', case when community_private.viewer_can_see_content('spotter_photo', photo.upload_id::text)
                               then photo.status else 'rejected' end
            ) order by photo.slot)
            from spotter_private.profile_photos photo
            join storage.objects object on object.bucket_id = 'spotter-profile-photos'
                and object.name = photo.path and object.owner_id = photo.member_id::text
            where photo.member_id = member and photo.status in ('pending', 'approved', 'rejected')
                and (viewer = member or spotter_private.photo_is_public_to_member(viewer, photo))
        ), '[]'::jsonb)
    )
    from (values (member)) subject(user_id)
    left join spotter_private.profile_details details on details.member_id = subject.user_id;
$$;

create function spotter_private.get_profile_details(p_member_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.account_id();
    member uuid := coalesce(p_member_id, actor);
begin
    if member <> actor and not spotter_private.contactable(actor, member) then
        raise exception 'This Spotter profile is unavailable.' using errcode = '42501';
    end if;
    return spotter_private.profile_details_payload(actor, member);
end;
$$;

create function spotter_private.checked_shared_stats(p_stats jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
    entry record;
    checked jsonb := jsonb_strip_nulls(coalesce(p_stats, '{}'::jsonb));
begin
    if jsonb_typeof(checked) <> 'object' then
        raise exception 'Choose valid Spotter statistics.' using errcode = '22023';
    end if;
    for entry in select key, value from jsonb_each(checked) loop
        if entry.key not in ('workouts', 'working_sets', 'streak_weeks')
            or jsonb_typeof(entry.value) <> 'number' or entry.value::text !~ '^[0-9]{1,9}$' then
            raise exception 'Shared statistics must be whole counts.' using errcode = '22023';
        end if;
    end loop;
    return checked;
end;
$$;

create function spotter_private.save_profile_details(
    p_body_type text, p_supplements text, p_current_program text, p_shared_stats jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.account_id();
    body text := btrim(coalesce(p_body_type, ''));
    supplements_text text := spotter_private.clean_text(p_supplements, 240);
    program_text text := spotter_private.clean_text(p_current_program, 120);
    stats jsonb := spotter_private.checked_shared_stats(p_shared_stats);
begin
    if not exists (select 1 from spotter_private.profiles where user_id = actor) then
        raise exception 'Set up your Spotter profile first.' using errcode = '42501';
    end if;
    if body not in ('', 'ectomorph', 'mesomorph', 'endomorph', 'mixed') then
        raise exception 'Choose a listed body type.' using errcode = '22023';
    end if;
    insert into spotter_private.profile_details (member_id, body_type, supplements, current_program, shared_stats)
    values (actor, body, supplements_text, program_text, stats)
    on conflict (member_id) do update set body_type = excluded.body_type,
        supplements = excluded.supplements, current_program = excluded.current_program,
        shared_stats = excluded.shared_stats;
    return spotter_private.profile_details_payload(actor, actor);
end;
$$;

create function spotter_private.lock_photo_slots(member uuid) returns void
language sql set search_path = '' as $$
    select pg_advisory_xact_lock(hashtextextended('spotter-photo:' || member::text, 0));
$$;

create function spotter_private.reserve_photo(p_slot integer, p_upload_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    photo spotter_private.profile_photos;
begin
    if p_slot is null or p_slot not between 0 and 3 or p_upload_id is null then
        raise exception 'Choose one of the four Spotter photo slots.' using errcode = '22023';
    end if;
    perform spotter_private.lock_photo_slots(actor);
    select * into photo from spotter_private.profile_photos where upload_id = p_upload_id;
    if found then
        if photo.member_id = actor and photo.slot = p_slot and photo.status <> 'retired'
            and (photo.status <> 'reserved' or photo.reserved_at >= now() - interval '20 minutes') then
            return to_jsonb(photo.path);
        end if;
        raise exception 'This Spotter photo upload is unavailable.' using errcode = '42501';
    end if;
    if (select count(*) from spotter_private.profile_photos
        where member_id = actor and reserved_at >= now() - interval '1 day') >= 16 then
        raise exception 'Daily Spotter photo upload limit reached.' using errcode = '22023';
    end if;
    update spotter_private.profile_photos set status = 'retired'
    where member_id = actor and slot = p_slot and status = 'reserved';
    insert into spotter_private.profile_photos (upload_id, member_id, slot)
    values (p_upload_id, actor, p_slot) returning * into photo;
    return to_jsonb(photo.path);
end;
$$;

create function spotter_private.submit_photo(p_upload_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    photo spotter_private.profile_photos;
begin
    perform spotter_private.lock_photo_slots(actor);
    select * into photo from spotter_private.profile_photos
    where upload_id = p_upload_id and member_id = actor;
    if not found or photo.status = 'retired' then
        raise exception 'This Spotter photo upload is unavailable.' using errcode = '42501';
    end if;
    if photo.status in ('pending', 'approved', 'rejected') then return true; end if;
    if photo.reserved_at < now() - interval '20 minutes' or not exists (
        select 1 from storage.objects object
        where object.bucket_id = 'spotter-profile-photos' and object.name = photo.path
            and object.owner_id = actor::text
    ) then
        raise exception 'Upload your photo before submitting it for review.' using errcode = '42501';
    end if;

    update spotter_private.profile_photos set status = 'retired'
    where member_id = actor and slot = photo.slot and status in ('pending', 'approved', 'rejected');
    update spotter_private.profile_photos set status = 'pending', submitted_at = now()
    where upload_id = p_upload_id;
    return true;
end;
$$;

create function spotter_private.remove_photo(p_slot integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.account_id();
begin
    if p_slot is null or p_slot not between 0 and 3 then
        raise exception 'Choose one of the four Spotter photo slots.' using errcode = '22023';
    end if;
    perform spotter_private.lock_photo_slots(actor);
    update spotter_private.profile_photos set status = 'retired'
    where member_id = actor and slot = p_slot and status <> 'retired';
    return true;
end;
$$;

-- These functions serve Storage RLS without exposing photo inventory or authorization facts via public RPCs.
create function spotter_private.storage_viewer()
returns uuid language sql stable set search_path = '' as $$
    select account.id from auth.users account
    where account.id = (select auth.uid())
        and not coalesce(account.is_anonymous, false)
        and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'false';
$$;

create function spotter_private.can_upload_photo(p_path text, p_owner_id text)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from spotter_private.profile_photos photo
        join spotter_private.profiles member on member.user_id = photo.member_id and member.active
        where photo.path = p_path and photo.member_id = (select spotter_private.storage_viewer())
            and p_owner_id = photo.member_id::text
            and spotter_private.profile_is_visible(member.user_id)
            and photo.status = 'reserved' and photo.reserved_at >= now() - interval '20 minutes'
    );
$$;

create function spotter_private.can_download_photo(p_path text, p_owner_id text)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from spotter_private.profile_photos photo
        cross join (select spotter_private.storage_viewer() as id) viewer
        where photo.path = p_path and p_owner_id = photo.member_id::text and viewer.id is not null
            and photo.status in ('pending', 'approved', 'rejected')
            and (viewer.id = photo.member_id or spotter_private.photo_is_public_to_member(viewer.id, photo))
    );
$$;

create function spotter_private.can_clean_photo(p_path text, p_owner_id text)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from spotter_private.profile_photos photo
        where photo.path = p_path and p_owner_id = photo.member_id::text
            and photo.member_id = (select spotter_private.storage_viewer())
            and photo.status in ('reserved', 'retired')
    );
$$;

create policy "Spotter uploads are reserved immutable files" on storage.objects
for insert to authenticated with check (
    bucket_id = 'spotter-profile-photos'
    and storage.allow_only_operation('object.upload')
    and spotter_private.can_upload_photo(name, owner_id)
);

create policy "Spotter only serves JWT authenticated photo reads" on storage.objects
for select to authenticated using (
    bucket_id = 'spotter-profile-photos'
    and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])
    and spotter_private.can_download_photo(name, owner_id)
);

create policy "Owners can look up removable Spotter uploads" on storage.objects
for select to authenticated using (
    bucket_id = 'spotter-profile-photos'
    and storage.allow_any_operation(array['object.delete', 'object.delete_many'])
    and spotter_private.can_clean_photo(name, owner_id)
);

create policy "Owners can delete retired or abandoned Spotter uploads" on storage.objects
for delete to authenticated using (
    bucket_id = 'spotter-profile-photos'
    and storage.allow_any_operation(array['object.delete', 'object.delete_many'])
    and spotter_private.can_clean_photo(name, owner_id)
);

create function spotter_private.report_photo(p_path text, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    clean_reason text := btrim(coalesce(p_reason, ''), E' \n\r\t');
    photo spotter_private.profile_photos;
begin
    if char_length(clean_reason) not between 1 and 500 then
        raise exception 'Enter a report reason.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('community-report:' || actor::text, 0));
    select * into photo from spotter_private.profile_photos candidate
    where candidate.path = p_path and candidate.member_id <> actor
        and spotter_private.photo_is_public_to_member(actor, candidate)
        and exists (
            select 1 from storage.objects object
            where object.bucket_id = 'spotter-profile-photos' and object.name = candidate.path
                and object.owner_id = candidate.member_id::text
        );
    if not found then
        raise exception 'This Spotter photo is unavailable.' using errcode = '42501';
    end if;
    if exists (select 1 from community_private.content_reports where reporter_id = actor
        and content_kind = 'spotter_photo' and content_id = photo.upload_id::text) then return true; end if;
    if (select count(*) from community_private.content_reports where reporter_id = actor
        and created_at >= now() - interval '1 day') >= 30 then
        raise exception 'Daily community report limit reached.' using errcode = '22023';
    end if;
    insert into community_private.content_reports (
        reporter_id, member_id, content_kind, content_id, reason, details
    ) values (
        actor, photo.member_id, 'spotter_photo', photo.upload_id::text, 'other', clean_reason
    );
    return true;
end;
$$;

create function public.spotter_profile_details(p_member_id uuid default null) returns jsonb
language sql stable set search_path = '' as $$ select spotter_private.get_profile_details(p_member_id); $$;
create function public.spotter_save_profile_details(
    p_body_type text, p_supplements text, p_current_program text, p_shared_stats jsonb
) returns jsonb language sql set search_path = '' as $$
    select spotter_private.save_profile_details(p_body_type, p_supplements, p_current_program, p_shared_stats);
$$;
create function public.spotter_reserve_photo(p_slot integer, p_upload_id uuid) returns jsonb
language sql set search_path = '' as $$ select spotter_private.reserve_photo(p_slot, p_upload_id); $$;
create function public.spotter_submit_photo(p_upload_id uuid) returns boolean
language sql set search_path = '' as $$ select spotter_private.submit_photo(p_upload_id); $$;
create function public.spotter_remove_photo(p_slot integer) returns boolean
language sql set search_path = '' as $$ select spotter_private.remove_photo(p_slot); $$;
create function public.spotter_report_photo(p_path text, p_reason text) returns boolean
language sql set search_path = '' as $$ select spotter_private.report_photo(p_path, p_reason); $$;

create function public.resolve_spotter_photo_review(p_upload_id uuid, p_approve boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
    if p_approve is null then
        raise exception 'Choose a resolution.' using errcode = '22023';
    end if;
    update spotter_private.profile_photos
    set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now()
    where upload_id = p_upload_id and status = 'pending';
    return found;
end;
$$;

revoke execute on function spotter_private.accepted_connection(uuid, uuid),
    spotter_private.photo_is_public_to_member(uuid, spotter_private.profile_photos),
    spotter_private.profile_details_payload(uuid, uuid), spotter_private.checked_shared_stats(jsonb),
    spotter_private.lock_photo_slots(uuid), spotter_private.storage_viewer(),
    spotter_private.get_profile_details(uuid), spotter_private.save_profile_details(text, text, text, jsonb),
    spotter_private.reserve_photo(integer, uuid), spotter_private.submit_photo(uuid),
    spotter_private.remove_photo(integer), spotter_private.report_photo(text, text),
    spotter_private.can_upload_photo(text, text), spotter_private.can_download_photo(text, text),
    spotter_private.can_clean_photo(text, text)
from public, anon, authenticated;
grant execute on function spotter_private.get_profile_details(uuid),
    spotter_private.save_profile_details(text, text, text, jsonb), spotter_private.reserve_photo(integer, uuid),
    spotter_private.submit_photo(uuid), spotter_private.remove_photo(integer), spotter_private.report_photo(text, text),
    spotter_private.can_upload_photo(text, text), spotter_private.can_download_photo(text, text),
    spotter_private.can_clean_photo(text, text)
to authenticated;

revoke execute on function public.spotter_profile_details(uuid),
    public.spotter_save_profile_details(text, text, text, jsonb), public.spotter_reserve_photo(integer, uuid),
    public.spotter_submit_photo(uuid), public.spotter_remove_photo(integer), public.spotter_report_photo(text, text),
    public.resolve_spotter_photo_review(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.spotter_profile_details(uuid),
    public.spotter_save_profile_details(text, text, text, jsonb), public.spotter_reserve_photo(integer, uuid),
    public.spotter_submit_photo(uuid), public.spotter_remove_photo(integer), public.spotter_report_photo(text, text)
to authenticated;
grant execute on function public.resolve_spotter_photo_review(uuid, boolean) to service_role;
