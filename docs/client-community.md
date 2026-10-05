# Client Community: invite-only first release

Community is available to signed-in clients on iOS and mobile web. Joining creates a display name and a rotatable 16-character invite code. A code sends a pending request; the recipient accepts or declines it. Either participant can remove an accepted connection. Leaving Community removes the profile, invitations, connections, and shared achievement summary.

Sharing XP and earned badges is a separate choice and starts off. Only accepted connections can read that summary while the owner has sharing on. This feature does not expose workout logs, body measurements, health data, email addresses, or progress photos. Unconnected clients cannot list profiles or achievements. The `progress_opt_in` setting from the earlier preview remains stored but has no sharing behavior and is hidden in the web UI.

The shared summary is calculated from each client's complete workout history and uploaded from the iOS or web app when Community is opened or achievements refresh. It is a client-supplied display projection; it must not be used as the authoritative source for future rankings or awards. A future leaderboard needs server-calculated scores from the underlying records.

The database contract is in `supabase/migrations/20261005203404_client_community_connections.sql`. It uses row-level policies for profiles, accepted connections, sharing preferences, and achievement summaries. Connection mutations run through authenticated RPCs backed by narrow functions in the unexposed `community_private` schema. The database migration was applied to the FWB project on 2026-10-05. A transactional two-account check verified profile invisibility before invitation, no achievement visibility while pending or opted out, visibility after acceptance plus opt-in, and immediate loss of visibility after removal. The test transaction was rolled back; no test profiles remain.

Leaderboard and challenges remain marked Coming Soon. They are outside this first release.
