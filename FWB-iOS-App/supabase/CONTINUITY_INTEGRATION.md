# FWB cross-platform continuity contract

The iPhone app remains client-only. The website remains the client web surface and the only coach-management surface. The migration in `migrations/20260822010000_cross_platform_continuity.sql` is intentionally **not applied** by this change.

## Audit summary

- Auth already uses the shared Supabase project, persistent sessions, the publishable key, and RLS. iOS rejects the coach account. The app now refreshes its auth session on foreground without signing a client out for a transient network failure.
- Programs and macros already use `client_programs`. Program reads are now explicitly scoped to the signed-in email in addition to RLS. Program workout JSON accepts `id`, `workout_id`, or `template_id`; old JSON receives a deterministic compatibility ID.
- Workout writes already had a local atomic queue, but a session was identified only by email/date/title and stale reconciliation could delete newer web rows. The new contract uses `session_id` and `set_id`, records source/version/client time, performs version-aware set merges, and never deletes in the legacy-schema fallback.
- Workout history now groups by `session_id` when available and falls back to the legacy date/title grouping.
- In-progress workouts now use `client_workout_drafts`, a table separate from completed facts. A completed log newer than a draft suppresses and clears that draft. This keeps cross-device resumability from reopening or mutating a completed workout.
- Measurement writes remain idempotent by client/date and now use a durable iPhone outbox. Newer remote edits win with an understandable message. Photo binaries still require a connection; metadata/storage cleanup behavior is unchanged.
- Macro writes now use a durable iPhone outbox. The embedded nutrition `updated_at` is compared before retry; newer website targets win rather than being silently overwritten.
- Daily readiness check-ins already had an atomic queue, per-day upsert, and newest-update merge. They now send mutation/source-version metadata when the migration is available and retain a legacy fallback.
- Foreground activation retries queued writes and refreshes programs, readiness, history/progress, and measurements. Active workout editors are deliberately not replaced under the client’s fingers.
- Apple Health code and authorization behavior are unchanged.

## Web implementation contract

Use the same values and rules on the website:

1. Generate one UUID `session_id` when a workout begins and one UUID `set_id` when a set row is created. Preserve them across edits and retries.
2. Upsert workout rows on `(session_id, set_id)`. Send `source = 'web_app'`, `source_version = 1`, and `client_updated_at` in UTC. Treat `updated_at` as server-owned.
3. Set `completed_at` only when the workout is finished. Never clear an existing `completed_at` during an ordinary set edit.
4. Save incomplete resumable state only in `client_workout_drafts`, upserting on `(client_email, workout_key)`. Delete the draft after completion. Never copy draft JSON over completed log rows.
5. When two devices edit a set, keep the row with the newer device update time. When times are equal, server state wins. Delete a remote set only when its `updated_at` is no later than the editor’s recorded base version.
6. For nutrition and measurements, compare the saved base timestamp before overwriting. A newer server version wins and should be shown to the client.
7. Keep the legacy email/date/title/set uniqueness during rollout. Remove it only after every writer uses stable IDs and duplicate analysis is complete.

## Integration points for feature chats

This migration deliberately defines no schema for comments, notifications, form checks, weekly check-ins, RPE/RIR, or supersets/circuits.

- Comments and notifications can reference `client_workout_logs.session_id` and, when set-specific, `set_id`.
- Form checks can reference `workout_template_id`, `session_id`, and `set_id` without changing the continuity merge keys.
- Weekly check-ins should use their own feature-owned table and may reuse `source`, `source_version`, `client_updated_at`, and server-owned `updated_at` semantics.
- RPE/RIR fields belong to the feature-owned workout row extension. They participate in the same `(session_id, set_id)` upsert and timestamp conflict decision.
- Superset/circuit structure belongs to program/template JSON or feature-owned relational schema. Preserve the supplied workout/template UUID so logs retain `workout_template_id`.

Before applying the migration, inspect duplicate legacy workout and progress rows, confirm existing RLS policies still scope every table by the authenticated client, then deploy compatible web reads/writes before enabling remote drafts.
