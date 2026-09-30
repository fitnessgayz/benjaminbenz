begin;

create table public.form_check_submissions (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    client_email text not null,
    exercise_code text not null default '',
    exercise_name text not null,
    workout_title text not null default '',
    media_type text not null,
    storage_path text not null unique,
    mime_type text not null,
    file_size_bytes bigint not null,
    media_duration_seconds numeric(6, 2),
    note text not null default '',
    status text not null default 'submitted',
    coach_feedback text not null default '',
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint form_check_client_email_length check (
        char_length(btrim(client_email)) between 3 and 320
    ),
    constraint form_check_exercise_code_length check (
        char_length(exercise_code) <= 120
    ),
    constraint form_check_exercise_name_length check (
        char_length(btrim(exercise_name)) between 1 and 160
    ),
    constraint form_check_workout_title_length check (
        char_length(workout_title) <= 160
    ),
    constraint form_check_media_type check (
        media_type in ('photo', 'video')
    ),
    constraint form_check_storage_path_length check (
        char_length(storage_path) between 40 and 500
    ),
    constraint form_check_mime_type check (
        (media_type = 'photo' and mime_type = 'image/jpeg')
        or
        (media_type = 'video' and mime_type in ('video/mp4', 'video/quicktime', 'video/x-m4v'))
    ),
    constraint form_check_file_size check (
        file_size_bytes between 1 and 104857600
    ),
    constraint form_check_duration check (
        (media_type = 'photo' and media_duration_seconds is null)
        or
        (
            media_type = 'video'
            and media_duration_seconds is not null
            and media_duration_seconds > 0
            and media_duration_seconds <= 60
        )
    ),
    constraint form_check_note_length check (
        char_length(note) <= 1000
    ),
    constraint form_check_status check (
        status in ('submitted', 'in_review', 'reviewed', 'needs_resubmission')
    ),
    constraint form_check_feedback_length check (
        char_length(coach_feedback) <= 3000
    )
);

comment on table public.form_check_submissions is
    'Client exercise-technique media submitted from the iOS app for coach review on the website.';

create index form_check_submissions_client_created_idx
    on public.form_check_submissions (client_id, created_at desc);

create index form_check_submissions_status_created_idx
    on public.form_check_submissions (status, created_at asc);

alter table public.form_check_submissions enable row level security;
alter table public.form_check_submissions force row level security;

revoke all on table public.form_check_submissions from anon, authenticated;
grant select, insert on table public.form_check_submissions to authenticated;
grant update (status, coach_feedback, reviewed_at, updated_at)
    on table public.form_check_submissions to authenticated;

create policy "Clients and coach can read form checks"
on public.form_check_submissions
for select
to authenticated
using (
    (select auth.uid()) = client_id
    or (select public.is_coach_admin())
);

create policy "Clients can submit their own form checks"
on public.form_check_submissions
for insert
to authenticated
with check (
    (select auth.uid()) = client_id
    and lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
    and status = 'submitted'
    and coach_feedback = ''
    and reviewed_at is null
);

create policy "Coach can update form-check reviews"
on public.form_check_submissions
for update
to authenticated
using ((select public.is_coach_admin()))
with check ((select public.is_coach_admin()));

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'form-checks',
    'form-checks',
    false,
    104857600,
    array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/x-m4v']
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Clients can upload their form checks"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'form-checks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Clients and coach can read form-check media"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'form-checks'
    and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or (select public.is_coach_admin())
    )
);

create policy "Clients can remove orphaned form-check uploads"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'form-checks'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
        select 1
        from public.form_check_submissions submission
        where submission.storage_path = storage.objects.name
    )
);

commit;
