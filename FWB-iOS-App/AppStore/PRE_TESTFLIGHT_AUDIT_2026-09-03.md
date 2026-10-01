# FWB Training pre-TestFlight audit — 2026-09-03

## Release decision

**BLOCKED — do not archive, distribute, or upload build 5.**

The integrated release candidate builds and its automated and simulator-covered flows pass, but the full release gate cannot be certified without a valid client login and a physical-device pass. The open items under **Release blockers** must be completed or explicitly risk-accepted before the gate changes to PASS.

## Candidate

- Branch: `codex/testflight-release-audit`
- App: FWB Training `1.0 (5)`
- Bundle identifier: `com.benjaminbenz.fwbcoach`
- Minimum iOS: 16.0
- Release baseline: `5a0a801` (`Prepare FWB Training build 5 for TestFlight`)
- Integrated height repair: `a52aea3`
- Integrated Stats & Measurements repair: `8822572`
- Integrated workout weight-field repair: `4464b6b`

## Passing evidence

### Build and automated checks

- Clean Debug test run: **42 passed, 0 failed, 0 skipped**.
- Clean Release simulator build: passed.
- Release generic iOS-device compile with signing disabled: passed.
- Xcode Release static analysis: passed with exit status 0.
- `Info.plist`, HealthKit entitlements, privacy manifest, and App Store export options parse successfully.
- The Release app includes the privacy manifest and compiled app-icon assets.
- No service-role key, private key, or embedded password was found in the iOS source. The bundled Supabase credential is the publishable client key.

### Integrated repairs

- Nutrition height entry now uses separate numeric feet/inches inputs and accepts legacy straight/curly quote formats, word forms, whitespace variants, total inches, and decimal feet. Six focused tests pass.
- Stats decoding tolerates valid `null` tape-measurement values without hiding the whole response. Measurement and photo failures are independent; loading, empty, offline, backend-error, confirmation, and history states remain distinct. Nine focused tests pass.
- Workout weight entry reliably focuses and accepts decimals in reusable fields across straight sets, supersets, and circuits. Decimal values survive the offline/persistence round trip.
- Audit-discovered accessibility omissions were repaired for Stats measurement fields and note, login email/password, and cardio type, duration, distance, calories, and notes. Runtime accessibility snapshots now expose descriptive labels and stable identifiers.

### Simulator UI/UX coverage

- Light-mode pass on an iPhone 17-class simulator.
- Dark-mode pass on an iPhone 17 Pro Max simulator.
- Today, Workouts, Progress, Macros, and Account render without clipping that prevents access; lower controls obscured by the floating tab bar can be scrolled fully above it.
- Custom workout: exercise search/add, decimal weight/reps entry, RIR selection, adding a set, keyboard Done, and local persistence were exercised.
- Assigned straight-set, superset, and circuit entry were exercised in the focused repair pass.
- Stats smoke flow: existing history, empty photos, independent photo error, measurement sheet, `166 lb`/`32 in` entry, save confirmation, and immediate chart/history visibility passed.
- Macros: feet/inches height edit and offline-save confirmation passed.
- Cardio: duration entry, difficulty feedback, save/finish, celebration, weekly-goal update, achievements, and native share sheet passed.
- Workout history empty state and Progress empty state passed.
- Sign-in validation, live invalid-credential rejection, and privacy-preserving password-reset request response passed.
- Apple Health connection reaches the native Health Access permission sheet and requests only workout-write-related types.
- Runtime-log review found no app crash, uncaught exception, assertion, or decoding failure. CoreSimulator WebKit accessibility-loader and IOSurface warnings are simulator-runtime noise. The Stats smoke harness's unauthenticated photo request is intentionally surfaced as an independent error state.

### Supabase/backend/security coverage

- Supabase project `FWB Project` is `ACTIVE_HEALTHY` on PostgreSQL 17.6.1.
- Relevant client tables have RLS enabled and authenticated client/coach-scoped policies.
- An authenticated non-coach JWT isolation audit returned zero foreign-client rows for every client-scoped table checked.
- Anonymous isolation checks returned zero visible rows for representative program, workout-log, and progress queries.
- The Stats repair's live insert/read transaction completed and was rolled back; the post-check confirmed zero audit rows remained.
- Offline measurement and workout mutation queues were exercised by tests and simulator flows.

## Release blockers

1. **Successful production-style authentication is not certified.** No valid client password was available. Run sign-in, process relaunch/session restore, sign-out, and a full authenticated feature sweep using a dedicated TestFlight QA client.
2. **Password reset is only partially certified.** The Supabase endpoint returned the correct non-enumerating response, but email delivery and the reset/deep-link completion path were not verified.
3. **Apple Health persistence is not certified.** The native permission sheet was reached, but authorization plus workout write/readback must be verified on a physical iPhone. Cover one strength workout and one cardio workout, including distance/calories and duplicate prevention.
4. **Push-notification behavior is not certified on a physical device.** Verify permission, device-token registration, foreground/background receipt, unread state, and settings recovery.
5. **Supabase Auth leaked-password protection is disabled.** Enable it or explicitly accept the risk before release. Advisor: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

The Supabase security advisor also reports informational `RLS enabled, no policy` notices for Fitbit/Google Health service-only tables. Confirm they are intentionally inaccessible to client roles; do not add client policies merely to silence the advisor.

## Required final gate run

After clearing the blockers, rerun the 42-test suite, Release simulator build, generic-device Release compile, static analysis, authenticated simulator smoke pass, and physical-device HealthKit/push pass. Only then archive and validate build 5 for TestFlight. No archive, distribution, or upload was performed during this audit.
