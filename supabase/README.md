# AI workout analysis backend

The iOS app invokes the authenticated `analyze-workout` Supabase Edge Function.
The function verifies the caller, loads only that client's saved workout through
RLS, and calls the OpenAI Responses API without exposing the API key to the app.

Before production use:

1. Link the Supabase CLI to project `qukdfjeupjhpthfbaonv`.
2. Add `OPENAI_API_KEY` as an Edge Function secret.
3. Optionally set `OPENAI_MODEL`; the default is `gpt-5.6-terra`.
4. Deploy `analyze-workout` with JWT verification enabled.
5. Invoke the function as a signed-in client and confirm another client's
   workout identifier cannot be analyzed.

Do not add an OpenAI key, Supabase secret key, or service-role key to the iOS
target or this repository.
