-- Both the full fitness questionnaire and account-onboarding questionnaire now
-- use JWT-verified Edge Functions. Keep the client table read-only so every
-- payload is allowlisted and size-limited before the service-role write.
drop policy if exists "Clients can submit their onboarding questionnaire"
on public.client_fitness_questionnaires;

revoke insert on table public.client_fitness_questionnaires from authenticated;
