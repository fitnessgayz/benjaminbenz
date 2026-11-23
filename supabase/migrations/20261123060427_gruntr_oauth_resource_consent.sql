-- Dynamic OAuth clients can have the same display name across both MCP apps.
-- Reveal only whether the authenticated user's pending request targets GRUNTR.
create function fwb_workout_private.is_gruntr_oauth_authorization(p_authorization_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.oauth_authorizations as oauth_request
    where oauth_request.authorization_id = p_authorization_id
      and oauth_request.user_id = (select auth.uid())
      and (
        oauth_request.resource = 'https://mcp.benjaminbenz.com/client/mcp'
        or (oauth_request.resource is null and oauth_request.client_id = 'd255584a-e437-4743-80de-b2ad377c0739')
      )
      and oauth_request.status = 'pending'
      and oauth_request.expires_at > now()
  );
$$;
revoke all on function fwb_workout_private.is_gruntr_oauth_authorization(text) from public, anon, authenticated;
grant execute on function fwb_workout_private.is_gruntr_oauth_authorization(text) to authenticated;

create function public.is_gruntr_oauth_authorization(p_authorization_id text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select fwb_workout_private.is_gruntr_oauth_authorization(p_authorization_id);
$$;
revoke all on function public.is_gruntr_oauth_authorization(text) from public, anon, authenticated;
grant execute on function public.is_gruntr_oauth_authorization(text) to authenticated;
