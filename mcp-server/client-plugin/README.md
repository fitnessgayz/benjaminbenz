# GRUNTR ChatGPT connection

The existing client connection at `/client/mcp` uses the signed-in user's Supabase OAuth bearer token and a publishable key. The connection retains its registered OAuth client name, `FWB Training Client`. Keep the separate coaching endpoint at `/mcp` available for existing users.

## Workflows

- Read account identity, the active coach-assigned program, saved client routines, and recent sets. Use the exercise library ID when known and ask which variant the user means when an alias is ambiguous.
- Use `start_my_workout`, `log_my_set`, `edit_my_set`, and `finish_my_workout` for a live workout. `cancel_my_empty_workout` closes an empty draft. Use a new request UUID for each intended write and send the same UUID and input on a retry.
- Use `log_my_workout` for a completed session. Always pass `request_id` in ChatGPT. Older callers can still send the original pounds-only schema without a request ID. That compatibility path keeps its original retry behavior.
- Use `recommend_my_exercise_progression` for advice. It needs the planned working-set count and rep range, and can use the user's available increment, reported technique, and recovery. A target is read-only.
- Use `preview_my_routine` for a new or edited client-owned weekly routine. The user reviews the before and after in GRUNTR and chooses **Approve and save routine**. Use `get_my_routine_proposal_status` to verify the save. Coach-assigned programs remain viewable and can inform a separate client-owned proposal.

## Storage and compatibility

Live sessions use the existing `client_workout_drafts` table and a ChatGPT-specific key. ChatGPT resumes them across conversations. Existing iOS and web editors keep their own in-progress state. Finishing writes stable session and set IDs, exercise order, and completion timestamps into `client_workout_logs` in one database transaction. Completed sessions use the standard GRUNTR history refresh and iOS cache paths.

Loads are normalized to the apps' pounds column. Older native readers require a number, so new records use the existing zero sentinel for sets without external resistance. ChatGPT reads the explicit bodyweight and load-unit fields and returns a null external load. Older records can have missing effort, original units, and finish times. The recommendation rules require confirmed completion, sufficient effort, repeated comparable sessions, user-confirmed controlled technique, and a small available increment before recommending added load. Setbacks, fatigue, and soreness can support a lighter session or rest. The general principles follow the [ACSM 2026 resistance-training position stand](https://doi.org/10.1249/MSS.0000000000003897).

Routine previews expire after 30 minutes. The database clears proposal details at approval or when the same account next requests a preview after expiry. The first-party web dashboard uses its GRUNTR session to approve, while a ChatGPT OAuth token carrying the Supabase `client_id` claim cannot approve. An update also checks the saved plan's version before writing. Approved routines use the existing `client_saved_workout_plans` row and include the native saved-plan snapshot.

## Synthetic verification

Run `npm run check` and `npm run build` in `mcp-server`. From the repository root, run the new database contract tests with a local PGlite package.

```sh
GRUNTR_PGLITE_PATH=/path/to/@electric-sql/pglite node --test tests/gruntr-chatgpt-workouts-database.test.js
```

The tests use two synthetic accounts and apply the relevant tracked migrations to an isolated Postgres-compatible database. They verify cross-account isolation, stable retries, canonical history rows, routine approval, and stale-update rejection. Run local Supabase advisors and a real synthetic OAuth test before rollout. In ChatGPT developer mode, exercise the live workout, history, progression, and routine flows and confirm the same completed session appears once in web and iOS history.

## Rollout and rollback

1. Verify the existing continuity, workout feedback, gym, and saved-plan migrations in the synthetic Supabase environment. Apply the additive GRUNTR migration there and run the synthetic checks.
2. Set `CLIENT_DASHBOARD_URL` to the staging client dashboard and use the staging Supabase project's publishable key in both the MCP server and the website. Configure and verify the branch Auth site URL so its OAuth consent redirect points to staging. Verify the approval page and updated consent there. Test the HTTPS MCP endpoint with the existing public PKCE OAuth registration and synthetic accounts. Refresh the ChatGPT connection to discover the updated tools.
3. After separate release authorization, apply the schema before switching the website and client MCP. Preserve the existing `/client/mcp` URL and its OAuth registration. Publishing the connection and any iOS release are independent approval steps.
4. To roll back, restore the previous MCP and website builds. Keep the additive columns, receipts, and approved or completed records in place. The old endpoint continues to write existing history rows. Preserve active drafts if the feature will be restored.

The plugin manifest points to `https://mcp.benjaminbenz.com/client/mcp`. Use the synthetic environment for development. See [deployment](../docs/DEPLOYMENT.md) and [submission](../docs/SUBMISSION.md) for the existing server configuration.
