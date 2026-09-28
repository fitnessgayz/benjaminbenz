# Suggested workout targets (release candidate)

The web and iOS implementation is complete for the next FWB update. Apply the production migration before publishing either client so new workout logs can retain their progression target snapshots.

## Behavior

Each supported strength exercise can show suggested working-set weights and reps, with an explanation. Applying a suggestion fills empty fields only; it does not complete sets or replace entered values. Clients review and log their actual performance normally.

The first version uses double progression: add one total rep while staying within the prescribed range, then increase the weight after two comparable successful sessions. Coaches can configure the rep range, effort target, and equipment increment. The rules require complete working-set history and adequate recorded reps in reserve (RIR, or equivalent RPE). Weight increases larger than 10% are held for review.

The engine matches exact normalized exercise names and requires matching saved targets. Incomplete, ambiguous, current, future, stale, timed, or unsupported exercise records cannot justify an increase. Older logs without target snapshots can provide a baseline in the existing pounds-based logger; they cannot prove that a historical goal was met. Missing effort data produces a hold recommendation. There is no automatic deload, PR-based starting weight, or medical/recovery assessment.

The current loggers record pounds. The engine understands pounds and kilograms for matching and future compatibility, but the entry UI must not apply kilogram targets as pounds.

## Saved plans and compatibility

Program exercises carry optional `progression` settings. Logged sets carry the original `progression_target` snapshot. A session freezes its plan when started or first used/logged, retains it through drafts and resume, and preserves it when the user changes the remaining set count.

The migration `20260928165842_add_workout_progression_targets.sql` adds one nullable JSONB column to `client_workout_logs`, validates its shape and bounds, and preserves an existing non-null snapshot on row updates. Actual performance remains editable. Existing access policies continue to apply, and historical rows are not backfilled with invented targets.

Before the migration is installed, existing workout logging remains available. Clients use narrowly scoped compatibility handling for the missing column; data returned without a persisted snapshot remains legacy history and cannot qualify for an increase.

## Cross-platform verification

The deterministic rules live in `js/workout-progression.js` and native `WorkoutProgression.swift`. Both execute the same `tests/fixtures/workout-progression.json` scenarios. Any rule or reason change must update both implementations and the shared fixtures.

Local database verification can run with:

```sh
PROGRESSION_PGLITE_PATH=/path/to/@electric-sql/pglite node --test tests/workout-progression-database.test.js
```

The PGlite test validates schema constraints, immutable target snapshots, editable actual results, and account isolation in an isolated database. It does not contact the production project.

Verified locally through September 27, 2026:

- 85 progression engine, integration, and database tests passed, with no skipped cases when PGlite was enabled.
- 68 affected iOS tests passed, including the 55 shared recommendation scenarios, snapshot/offline round trips, active-session restoration, layout, coach editing, and daily workout generation.
- 18 isolated browser scenarios passed across assigned/custom straight sets, supersets, and circuits at 320, 390, and 1280 pixels. These use production markup, styles, and refresh functions with synthetic data and network access blocked.
- After rebasing the iOS release candidate onto the production APNs changes, 100 focused native tests passed and a signing-disabled Release configuration build succeeded.
- The iPhone simulator showed the suggestion cards in all four audit formats. Applying targets kept an entered weight of 41 lb, filled the other targets at 32.5 lb, left warm-ups untouched, and kept sets unlogged. Logging set 1 retained the remaining targets. Disabling suggestions in custom settings hid that exercise's card.

The simulator audit uses `--workout-parity-audit --workout-progression-audit` in a Debug build. Shared native fixture data is bundled with the test target. These checks do not replace staging/physical-device validation before the future release.

For release: validate the migration in staging, verify program editing and workout logging on both clients, apply the migration before publishing clients, then test a fresh session, offline/resume behavior, completion, and history-based suggestions. Plateau alerts, trend charts, and Watch target display are outside this first version.
