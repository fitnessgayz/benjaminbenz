create index if not exists fwb_native_push_queue_device_idx
  on public.fwb_native_push_queue (device_id);

drop policy if exists "Native push queue has no client access"
  on public.fwb_native_push_queue;
create policy "Native push queue has no client access"
  on public.fwb_native_push_queue
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
