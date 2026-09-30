-- Notification inbox and APNs registration foundation for the FWB client app.
-- This migration is intentionally committed for review and must not be applied
-- until notification infrastructure is ready to be activated.

create table if not exists public.client_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'general' check (
    kind in (
      'coach_reply',
      'program_update',
      'workout_reminder',
      'achievement',
      'weekly_check_in',
      'general'
    )
  ),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists client_notifications_user_created_idx
  on public.client_notifications (user_id, created_at desc);

create index if not exists client_notifications_user_unread_idx
  on public.client_notifications (user_id, created_at desc)
  where read_at is null;

alter table public.client_notifications enable row level security;

create policy "Clients can read their notifications"
  on public.client_notifications
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (select public.is_coach_admin())
  );

create policy "Coach can create client notifications"
  on public.client_notifications
  for insert
  to authenticated
  with check ((select public.is_coach_admin()));

create policy "Clients can mark their notifications read"
  on public.client_notifications
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Coach can delete client notifications"
  on public.client_notifications
  for delete
  to authenticated
  using ((select public.is_coach_admin()));

revoke all on table public.client_notifications from anon, authenticated;
grant select, insert, delete on table public.client_notifications to authenticated;
grant update (read_at) on table public.client_notifications to authenticated;

create table if not exists public.client_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coach_replies boolean not null default true,
  program_updates boolean not null default true,
  workout_reminders boolean not null default true,
  achievements boolean not null default true,
  weekly_check_ins boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_notification_preferences enable row level security;

create policy "Clients can read notification preferences"
  on public.client_notification_preferences
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (select public.is_coach_admin())
  );

create policy "Clients can create notification preferences"
  on public.client_notification_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Clients can update notification preferences"
  on public.client_notification_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.client_notification_preferences from anon, authenticated;
grant select, insert, update on table public.client_notification_preferences to authenticated;

create table if not exists public.client_notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_email text not null check (client_email = lower(client_email)),
  device_token text not null check (char_length(device_token) between 32 and 512),
  platform text not null default 'ios' check (platform = 'ios'),
  environment text not null check (environment in ('sandbox', 'production')),
  bundle_identifier text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_token)
);

create index if not exists client_notification_devices_delivery_idx
  on public.client_notification_devices (user_id, is_active, environment);

alter table public.client_notification_devices enable row level security;

create policy "Clients can read their notification devices"
  on public.client_notification_devices
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Clients can register notification devices"
  on public.client_notification_devices
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and lower(coalesce((select auth.jwt()) ->> 'email', '')) = client_email
  );

create policy "Clients can refresh notification devices"
  on public.client_notification_devices
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and lower(coalesce((select auth.jwt()) ->> 'email', '')) = client_email
  );

create policy "Clients can remove notification devices"
  on public.client_notification_devices
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.client_notification_devices from anon, authenticated;
grant select, insert, update, delete on table public.client_notification_devices to authenticated;
