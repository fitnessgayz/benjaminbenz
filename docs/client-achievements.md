# Client badges and levels

Clients see their level and XP on **Home → Your wins**, their full badge collection on **Progress → Your trophy room**, and new awards in the existing workout-completion share sheet. There are 24 badges and eight levels. Badge tiers are bronze, silver, gold, and platinum.

## Earning progress

- Each completed workout: 100 XP.
- Each genuine PR improvement: 50 XP (at most one per exercise in a session).
- Each unlocked badge: 100 XP.

Levels begin at 0, 300, 750, 1,500, 3,000, 5,000, 8,000, and 12,000 XP: Getting Started, Finding Your Groove, Momentum Maker, Consistency Crew, Dedicated, Trailblazer, All-Star, and FWB Legend.

Workout badges unlock at 1, 5, 10, 25, 50, 100, and 250 completed sessions. PR badges unlock at 1, 5, 10, and 25 improvements. Consistency badges recognize 3, 8, and 12 consecutive Monday–Sunday weeks with at least one completed workout. Welcome Back recognizes a finished session after at least 14 days away. Cardio milestones recognize 1, 10, and 50 sessions. Stretching/mobility and yoga each have milestones at 1, 10, and 25 sessions. Each modality counts at most once per completed session; a mixed session can count toward multiple activities. Recovery and yoga have their own artwork and filter; cardio has a dedicated filter.

Custom artwork lives in `images/achievements/`, one SVG per badge ID. Matching native asset catalogs use the same art rendered at 128, 256, and 384 pixels. Locked medals remain recognizable in muted colors, with status also shown as text.

The pure engine (`js/client-achievements.js`) matches the native iOS `ClientAchievementEngine`. A session needs valid completion metadata and meaningful non-warm-up work. Initial exercise results establish baselines. A new weight PR must exceed the earlier positive weight record, and a bodyweight PR must exceed earlier bodyweight reps. Ties, warm-ups, cardio, and timed recovery holds do not produce strength PRs. Recovery and cardio count toward completed-session milestones. Future/invalid dates and unfinished autosaves are excluded.

## Data and privacy

The collection is derived from the client's complete saved workout history under the existing account permissions. There is no new database table, schema migration, push pipeline, public leaderboard, or automatic social post. Correcting/deleting a log recalculates awards and XP. Existing synced history makes the collection consistent across web and iOS. Sharing remains an explicit client action.

Completion celebrations compare before/after events only for the just-finished session. A failed or partial history load cannot issue awards; clients can retry loading their wins. Local session acknowledgement prevents duplicate celebrations on repeated Finish taps; cross-device badge state derives from history, not from this local acknowledgement. No achievement popup appears just because historical logs were loaded.

Reduced-motion preferences disable celebratory motion. Cards and controls adapt to mobile widths and larger text. Badge criteria, tiers, progress, and earned status are available as text rather than color alone.

## Verification

Run `node --test tests/client-achievements.test.js tests/client-achievements-ui.test.js` and the existing completion-sharing and history-pagination tests. The iOS engine and completion tests cover the same rules, including shared strength, cardio, recovery, yoga, mixed-session, and duplicate-history scenarios.

Verified on September 26, 2026: 96 focused web tests passed; the full web suite passed 1,127 tests with the same 14 pre-existing failures as clean baseline and 14 skips. The integrated native suite passed all 549 tests, followed by six passing history-readiness tests after the final missing-account guard. Visual checks covered iPhone 15 width, large Dynamic Type, Recovery filtering, and earned-badge details. No database migration is required. Releases use the existing GitHub Pages and iOS TestFlight workflows.

Release integration preserved the standalone cardio logger and its independent timer behavior. All 114 targeted badge/cardio/history/sharing/authentication checks passed after merging, along with the isolated cardio browser checks at 320, 390, and 1280 pixels and 200% text zoom.
