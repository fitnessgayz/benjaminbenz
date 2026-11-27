create function spotter_private.owner_spotter_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
    perform spotter_private.require_gruntr_owner();

    return jsonb_build_object(
        'active_profiles', (
            select count(*)
            from spotter_private.profiles profile
            where profile.active and spotter_private.profile_is_visible(profile.user_id)
        ),
        'pending_photos', (
            select count(*)
            from spotter_private.profile_photos photo
            join spotter_private.profiles profile on profile.user_id = photo.member_id
            join storage.objects object on object.bucket_id = 'spotter-profile-photos'
                and object.name = photo.path and object.owner_id = photo.member_id::text
            where photo.status = 'pending'
        ),
        'open_group_reports', (
            select count(*)
            from community_private.content_reports report
            where report.content_kind = 'spotter_club_post'
                and report.reviewed_at is null
                and not exists (
                    select 1 from spotter_private.club_report_resolutions resolution
                    where resolution.report_id = report.id
                )
        )
    );
end;
$$;

create function public.gruntr_admin_spotter_summary() returns jsonb
language sql stable set search_path = '' as $$
    select spotter_private.owner_spotter_summary();
$$;

revoke all on function spotter_private.owner_spotter_summary(), public.gruntr_admin_spotter_summary()
    from public, anon, authenticated;
grant execute on function spotter_private.owner_spotter_summary(), public.gruntr_admin_spotter_summary()
    to authenticated;
