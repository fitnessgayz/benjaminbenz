create table if not exists public.client_progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  storage_path text not null unique,
  captured_on date not null default current_date,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists client_progress_photos_email_date_idx
  on public.client_progress_photos (lower(client_email), captured_on desc, created_at desc);

alter table public.client_progress_photos enable row level security;

revoke all on public.client_progress_photos from public, anon, authenticated;
grant select, insert, delete on public.client_progress_photos to authenticated;

drop policy if exists "Clients and coach can read progress photos" on public.client_progress_photos;
create policy "Clients and coach can read progress photos"
on public.client_progress_photos
for select
to authenticated
using (
  lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  or (select public.is_coach_admin())
);

drop policy if exists "Clients can create their progress photos" on public.client_progress_photos;
create policy "Clients can create their progress photos"
on public.client_progress_photos
for insert
to authenticated
with check (
  (
    lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  )
  or (select public.is_coach_admin())
);

drop policy if exists "Clients and coach can delete progress photos" on public.client_progress_photos;
create policy "Clients and coach can delete progress photos"
on public.client_progress_photos
for delete
to authenticated
using (
  lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  or (select public.is_coach_admin())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 6291456, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Clients and coach can read private progress photo files" on storage.objects;
create policy "Clients and coach can read private progress photo files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'progress-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_coach_admin())
  )
);

drop policy if exists "Clients can upload private progress photo files" on storage.objects;
create policy "Clients can upload private progress photo files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Clients and coach can delete private progress photo files" on storage.objects;
create policy "Clients and coach can delete private progress photo files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'progress-photos'
  and (
    owner_id = (select auth.uid())::text
    or (select public.is_coach_admin())
  )
);
