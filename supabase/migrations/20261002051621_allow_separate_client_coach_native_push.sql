-- The client and coach now have separate installations and APNs topics.
-- Keep notification-owner/device checks and private function privileges intact.
create or replace function private.fwb_enqueue_native_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.fwb_native_push_queue (notification_id, device_id)
  select new.id, device.id
    from public.client_notification_devices as device
   where device.user_id = new.user_id
     and device.platform = 'ios'
     and device.is_active is true
     and device.bundle_identifier in (
       'com.benjaminbenz.fwbcoach',
       'com.benjaminbenz.fwb'
     )
  on conflict (notification_id, device_id) do nothing;

  return new;
end;
$$;

revoke all on function private.fwb_enqueue_native_push() from public, anon, authenticated;
