# Google Health workout imports

Settings offers an optional Google Health connection for clients with Fitbit or Pixel Watch data in their Google account. This uses the Google Health API and Google OAuth, not the retired legacy Fitbit API. The requested scope is `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly` with offline access.

After consent, automatic sync checks the latest 30 days approximately every 15 minutes, even when the client has closed FWB. Clients can pause automatic sync, run Sync now while paused, or disconnect. Imported activities appear in their own Saved Logs section. They do not modify strength sets, unfinished workouts, coaching-session counts, or Apple screenshot attachments. Google total calories are labeled as total calories; unavailable metrics remain empty and a recorded zero remains zero.

## Release setup

1. In the intended Google Cloud project, enable the Google Health API. Configure the OAuth consent screen and obtain the required Google approval for the requested health-data scope before offering it broadly. During testing, only permitted test users can connect.
2. Configure a web OAuth client. Register the exact callback URL, normally `https://benjaminbenz.com/client-dashboard.html`, and the deployed app origin. If clients can use both the canonical and `www` origins, register both callback URLs. Configure any local callback separately if needed for development.
3. Set the server-only Supabase Edge Function secrets `GOOGLE_HEALTH_CLIENT_ID` and `GOOGLE_HEALTH_CLIENT_SECRET`. Leave `GOOGLE_HEALTH_REDIRECT_URI` unset to return each client to the same approved origin they started from. If using a fixed redirect, enforce that canonical origin for the website first: the OAuth state and signed-in session belong to that browser origin. Never put the client secret or refresh tokens in public JavaScript.
4. Apply `20260924141611_google_health_automatic_import.sql` after the existing Google Health migration. It adds private connection state, owner-scoped imported records, transactional sync leases, and a 15-minute `pg_cron` job. The migration creates a random dispatch secret in Supabase Vault and stores only its SHA-256 hash in a service-only table. A fresh project must have the existing `pg_cron`, `pg_net`, and Vault prerequisites available.
5. Deploy `supabase/functions/fitbit-auth` with its helper files and `verify_jwt = false`, as specified in `supabase/config.toml`. This permits the scheduled worker to authenticate with its private dispatch secret. Every client action still validates its bearer token with Supabase Auth and derives client identity from the verified account. Deploy the dashboard assets and updated privacy page in the same release.
6. With a consented test account, connect, import a real workout, verify it appears once after repeated sync and reload, pause and manually sync, then disconnect and confirm future background imports stop. Check cron and function logs for successful dispatch without logging tokens or health payloads.

The function name remains `fitbit-auth` for compatibility with existing deployment configuration. Previous write-only grants require fresh consent for reading; they are not silently upgraded. Settings reports setup unavailable when required server credentials are absent. A successful local test does not establish Google approval, production deployment, or a successful real-account import.

## Storage and concurrency

Imported records use Google's stable data-point name to prevent duplicates. A completed fetch inserts new records and updates existing records in the recent window. Failed or incomplete pagination never marks a sync successful. Imports do not delete saved FWB records when a provider record disappears or a client reconnects a different Google account; imported history is retained until deletion is requested. The database's optional reconciliation window is not used by the importer.

Each import holds a short lease tied to the connection generation. Pause, reconnect, or disconnect invalidates pending work, preventing an old request from restoring credentials or saving records after the client stopped it. Disconnect removes connection credentials; already imported records remain available under their existing owner policy.

Run the Google Health tests with `node --test tests/google-health*.test.js`. Existing notification/auth checks also cover the Settings and Supabase callback integration. Database behavior tests require the optional local PostgreSQL-compatible test runtime indicated in the test file; skipped tests must not be reported as passed.

## Verification on September 24, 2026

- 65 focused tests passed with no skips, including backend OAuth/import tests, actual PostgreSQL-compatible RLS and transactional tests, frontend controls, dashboard login, notifications, and privacy assertions. Database tests used `GOOGLE_HEALTH_PGLITE_PATH` pointing to the local PGlite installation.
- Deno typechecking passed with the function's frozen lockfile. JavaScript syntax and whitespace checks passed.
- The full suite reported 863 tests: 838 passed, 15 failed, and 10 unrelated optional tests skipped. All 15 failure names match the pre-feature baseline at `60ae894`; no new failures were introduced.
- A local browser fixture using the real dashboard markup, CSS, and Google Health controller passed at 320, 390, and 430 pixels without horizontal overflow. Pausing, manual sync while paused, disconnecting, zero-calorie rendering, keyboard toggling, and visible focus were checked with synthetic data.
- Before deployment, the live project was inspected read-only: it was healthy, its service role had the required program permissions, and there were no existing Google Health connections. No real Google account consent/import was tested.

Main implementation files are `client-dashboard.html`, `js/google-health.js`, `css/google-health.css`, the lifecycle hooks in `js/client-portal.js`, `supabase/functions/fitbit-auth/` (including its pinned dependency lock), `supabase/config.toml`, the new migration, and `fwb-training-privacy.html`. Google Health tests and the relevant existing auth/privacy assertions accompany them.

## Production release on September 24, 2026

The approved release applied the database migration to FWB Project (`qukdfjeupjhpthfbaonv`); Supabase recorded it as version `20260925003318`, name `google_health_automatic_import`. The local migration source remains `20260924141611_google_health_automatic_import.sql`. Edge Function `fitbit-auth` is active version 4. The 15-minute cron job is active, and live table grants/RLS and service-only RPC execution were verified.

A dispatch using the Vault-held scheduler credential returned HTTP 200 with zero connected clients processed and no failures. This confirms the Google client ID and secret are present in the deployed environment; it does not validate Google consent approval or a real account import. An unauthenticated dispatch returned HTTP 401. The website release is published by the accompanying push to `main` through the existing GitHub Pages workflow. A client's first approved Google connection and real workout import remain the final end-to-end check.

## Provider references

- [Google Health overview](https://developers.google.com/health/about)
- [Google Health data access and scopes](https://developers.google.com/health/migration/data-access)
- [List exercise data points](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list)
- [Exercise fields](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints#Exercise)
- [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
