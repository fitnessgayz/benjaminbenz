# Daily web check-in and recovery workouts

The client dashboard asks “How are you feeling today?” once per local calendar day and account. The welcome has Check in and Skip for now. A saved check-in for today also suppresses the welcome; skipping is local to that browser. Coach previews and active workouts do not trigger it. Home retains the existing gym check-in and allows the client to reopen or update the recommendation.

Mood, energy, sleep, and soreness are required for a workout recommendation. The existing optional Home form can still save partial check-ins and notes without inventing missing ratings. Web check-ins continue to use `client_progress.goal_note` and `mood_checkin_submitted_at`; only those fields are upserted, preserving measurements. Native iOS check-ins use their existing `client_check_ins` store; this change does not migrate either store or synchronize check-in answers between them.

The recommendation follows the iOS readiness thresholds:

- Ready: open the next assigned workout unchanged.
- Lower energy or mood: create a separate daily custom draft with one fewer explicitly prescribed working set/round, with a minimum of one. Preserve movement order, groups, reps, rest, instructions, and demos. Warm-up/cool-down prescriptions are unchanged.
- Low recovery: suggest an explicitly assigned recovery/mobility routine, or rest/gentle movement and an easy recovery generator setup.

The client reviews the result before opening a workout. **Keep my planned workout** opens the assigned program overview without starting a timer. Recommendations never update the assigned program. Session identity scopes daily copies by client, date, program, and source workout and matches native IDs. Account, program, day, and active-workout changes invalidate an open recommendation.

## Recovery generator

The focus picker includes Mobility / flexibility / recovery with Upper body recovery, Lower body recovery, and Full body recovery. Recovery uses approved beginner bodyweight movements explicitly tagged as mobility, stretching, flexibility, or recovery, always at easy intensity. Full-body recovery includes both upper and lower regions. Coach targets are bounded to gentle sets/reps/holds and are not expanded to fill time. Timed holds remain targets rather than fabricated logged reps. Recovery drafts do not add per-exercise warm-up sets.

## Release

Apply `supabase/migrations/20260926050807_add_recovery_exercise_library.sql` with the versioned dashboard scripts. It adds 12 explicitly approved recovery movements and preserves existing records by case-insensitive name. Until seeded, the generator explains that approved recovery movements are unavailable; it does not substitute strength exercises.

The catalog is shared with iOS. A restrictive SELECT policy hides recovery movements from requests without `x-fwb-recovery-catalog: 1`, protecting older native and cached web generators that otherwise treat them as strength exercises. Updated web client and coach library queries opt in per request; other requests and Edge Functions do not receive this header. Existing approval, active-status, and coach authorization policies remain in force. The native strength-generator filter provides additional protection, and native clients must not opt into this catalog until their generator handles recovery separately.

## Verification

Run `node --test tests/daily-*.test.js tests/mood-checkin.test.js tests/home-progress-checkin.test.js tests/client-weekly-activity.test.js tests/workout-generator*.test.js` for focused coverage. Browser review uses a local fake client/backend: no live mood, workout, gym, or notification records are written. Desktop and 390px mobile checks cover the welcome, saved answers, reduced sets/supersets, assigned-plan navigation, explicit gym attendance, and recovery generation/logger handoff.

Production deployment on 2026-09-25 (migration version `20260926050807` in UTC) verified 12 approved recovery entries. Authenticated queries without the capability still return 57 strength entries and zero recovery entries; updated queries return 57 strength and 12 recovery entries. Anonymous access remains disabled, and the header does not reveal inactive or unapproved entries.
