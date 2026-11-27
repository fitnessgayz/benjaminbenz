-- The existing coach administrator can review pending Spotter uploads with a normal login.
create function spotter_private.can_review_photos()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.is_coach_admin()), false) and exists (
    select 1 from auth.users account
    where account.id = (select auth.uid())
      and lower(account.email) = lower((select auth.jwt()) ->> 'email')
      and account.email_confirmed_at is not null
      and account.deleted_at is null
      and not coalesce(account.is_anonymous, false)
      and coalesce(account.banned_until <= now(), true)
  );
$$;

create function spotter_private.can_download_review_photo(p_path text, p_owner_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select spotter_private.can_review_photos()) and exists (
    select 1 from spotter_private.profile_photos photo
    where photo.path = p_path and photo.member_id::text = p_owner_id
      and photo.status = 'pending'
  );
$$;

create function spotter_private.list_pending_photo_reviews()
returns table (upload_id uuid, display_name text, slot integer, path text, submitted_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not spotter_private.can_review_photos() then
    raise exception 'Spotter photo review requires the coach administrator.' using errcode = '42501';
  end if;

  return query
    select photo.upload_id, coalesce(nullif(profile.preferences ->> 'name', ''), 'Spotter member'),
      photo.slot, photo.path, photo.submitted_at
    from spotter_private.profile_photos photo
    join spotter_private.profiles profile on profile.user_id = photo.member_id
    join storage.objects object on object.bucket_id = 'spotter-profile-photos'
      and object.name = photo.path and object.owner_id = photo.member_id::text
    where photo.status = 'pending'
    order by photo.submitted_at, photo.upload_id
    limit 30;
end;
$$;

create function spotter_private.review_photo(p_upload_id uuid, p_approve boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not spotter_private.can_review_photos() then
    raise exception 'Spotter photo review requires the coach administrator.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from spotter_private.profile_photos photo
    join storage.objects object on object.bucket_id = 'spotter-profile-photos'
      and object.name = photo.path and object.owner_id = photo.member_id::text
    where photo.upload_id = p_upload_id and photo.status = 'pending'
  ) then
    return false;
  end if;

  return public.resolve_spotter_photo_review(p_upload_id, p_approve);
end;
$$;

create function public.spotter_can_review_photos() returns boolean
language sql stable set search_path = ''
as $$ select spotter_private.can_review_photos(); $$;

create function public.spotter_list_pending_photo_reviews()
returns table (upload_id uuid, display_name text, slot integer, path text, submitted_at timestamptz)
language sql stable set search_path = ''
as $$ select * from spotter_private.list_pending_photo_reviews(); $$;

create function public.spotter_review_photo(p_upload_id uuid, p_approve boolean) returns boolean
language sql set search_path = ''
as $$ select spotter_private.review_photo(p_upload_id, p_approve); $$;

revoke all on function spotter_private.can_review_photos(),
  spotter_private.can_download_review_photo(text, text),
  spotter_private.list_pending_photo_reviews(), spotter_private.review_photo(uuid, boolean),
  public.spotter_can_review_photos(), public.spotter_list_pending_photo_reviews(),
  public.spotter_review_photo(uuid, boolean) from public, anon, authenticated;
grant execute on function spotter_private.can_review_photos(),
  spotter_private.can_download_review_photo(text, text),
  spotter_private.list_pending_photo_reviews(), spotter_private.review_photo(uuid, boolean),
  public.spotter_can_review_photos(), public.spotter_list_pending_photo_reviews(),
  public.spotter_review_photo(uuid, boolean) to authenticated;

-- Direct private downloads only. The moderator cannot list the bucket or sign URLs.
create policy "Coach administrator can open pending Spotter photos" on storage.objects
for select to authenticated using (
  bucket_id = 'spotter-profile-photos'
  and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])
  and spotter_private.can_download_review_photo(name, owner_id)
);
-- Queue one coach alert when a member submits a newly uploaded Spotter photo.
create or replace function spotter_private.notify_coach_photo_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    coach_email constant text := 'benjaminbenz.fit@gmail.com';
    notification_title constant text := 'Spotter photo needs approval';
    notification_body constant text := 'A Spotter photo is ready for review in Coach Approvals.';
    notification_url constant text := '/coach-admin.html?tab=approvals';
    notification_dedupe text := 'spotter-photo-approval:' || new.upload_id::text;
    coach_id uuid;
begin
    if (select auth.uid()) is distinct from new.member_id then
        return new;
    end if;

    select owner_account.id into coach_id
    from auth.users as owner_account
    where lower(btrim(owner_account.email)) = coach_email
        and owner_account.deleted_at is null
    order by owner_account.created_at
    limit 1;
    if coach_id is null then
        return new;
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public' and table_name = 'client_notifications'
            and column_name = 'web_dedupe_key'
    ) then
        insert into public.client_notifications
            (user_id, kind, title, body, web_category, web_url, web_dedupe_key)
        values
            (coach_id, 'general', notification_title, notification_body,
             'general', notification_url, notification_dedupe)
        on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing;
    else
        perform private.fwb_queue_notification_for_user(
            coach_id, 'coach', 'general', notification_title, notification_body,
            notification_url, notification_dedupe
        );
    end if;

    return new;
exception when others then
    -- The submitted photo remains in the approval queue if the alert fails.
    raise warning 'Spotter photo approval notification failed (SQLSTATE %).', sqlstate;
    return new;
end;
$$;

revoke all on function spotter_private.notify_coach_photo_submission()
    from public, anon, authenticated, service_role;

create or replace trigger spotter_notify_coach_photo_submission
after update of status on spotter_private.profile_photos
for each row
when (old.status = 'reserved' and new.status = 'pending')
execute function spotter_private.notify_coach_photo_submission();
