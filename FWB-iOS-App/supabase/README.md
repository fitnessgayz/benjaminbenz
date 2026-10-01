# FWB Training Supabase backend

The migrations in this directory support cross-platform workout continuity,
comments, check-ins, form checks, notifications, set metadata, and exercise
ordering. The iOS build never applies database migrations itself.

The retired AI workout-analysis Edge Function is intentionally excluded from
the app and this release. Do not add API keys, Supabase secret keys, or a
service-role key to the iOS target or this repository.

## Workout comments contract

`migrations/20260822020000_workout_comments.sql` defines the private workout
thread shared by the iOS client and coach website. Threads use the same
client/date/title session UUID as the workout-log continuity contract. Clients
can create, read, and comment only on their own thread; the authenticated coach
admin can read threads and add replies. Read timestamps are server-controlled
through `mark_workout_comment_thread_read` so a client cannot forge future read
state.

Review and apply this migration through the website's normal Supabase release
process. The iOS build does not apply database migrations.
