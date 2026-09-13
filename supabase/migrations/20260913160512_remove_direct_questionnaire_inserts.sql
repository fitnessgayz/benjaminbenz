-- Questionnaire submissions use a JWT-verified Edge Function so payload
-- allowlisting, size limits, idempotency, and safe profile updates are applied
-- consistently. Clients only need direct SELECT access to their matched copy.
drop policy if exists "Clients can submit their onboarding questionnaire"
on public.client_fitness_questionnaires;

revoke insert on table public.client_fitness_questionnaires from authenticated;
