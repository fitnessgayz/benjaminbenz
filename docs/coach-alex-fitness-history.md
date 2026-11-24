# Coach Sessions › Alex Fitness

The Alex Fitness view shows a read-only copy of the counted gym history, not the FWB monthly total or a package-balance ledger. The tracker remains authoritative, and this import never writes back to it.

## Prepare a snapshot

- Read the first-package `Sessions` tab and each numbered `Package …` tab from the Alex Fitness Gym Master Session Tracker. Keep dated rows marked `Type = Session` and `Count? = Count`. Do not re-import archive-only copies, cancellations, rows marked `Do Not Count`, or blank template rows. Confirm package/session numbers are unique within each package.
- Preserve the calendar date and scheduled **start** time as recorded in Pacific time. Use the underlying date-time cell value when possible (including date-times formatted as dates); otherwise use a clearly stated start or start of a time range. Do not use an end-only time or assume midnight for a date-only entry. Set unrecorded start times to `null`.
- Export only `package_number`, `session_number`, `session_date` (`YYYY-MM-DD`), and `start_time` (`HH:MM:SS` or `null`), plus the verified source read timestamp. Keep the payload private. Do not put it in the repository, website assets, or client-visible tables.

## Import after deployment

With separate authorization for the hosted write, apply the new migration and, using the existing trusted Supabase writer, call `public.save_coach_alex_fitness_history(p_source_read_at, p_sessions)` with the verified complete snapshot. The RPC normalizes the row shape, rejects duplicate and invalid records, and replaces the previous snapshot only if the source timestamp is newer. Use a complete snapshot; if the source is inaccessible or any source tab is missing, leave the previous import in place.

Verify the stored row count and count of null start times against the source before checking the Alex Fitness tab. Later imports replace the same read-only snapshot; this feature does not alter any scheduled task or write to Alex Fitness, FWB, or client balances.
