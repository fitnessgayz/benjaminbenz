-- Trigger-only comment helpers must never be exposed through PostgREST.
-- The read-marker RPC remains available only to signed-in users and performs
-- its own client-or-coach authorization before updating a thread.

revoke all on function public.set_workout_comment_session_id() from public, anon, authenticated;
revoke all on function public.touch_workout_comment_thread() from public, anon, authenticated;
revoke all on function public.mark_workout_comment_thread_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_workout_comment_thread_read(uuid) to authenticated;
