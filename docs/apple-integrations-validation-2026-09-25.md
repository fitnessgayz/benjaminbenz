# Apple integration validation — September 25, 2026

Implemented in the web repository and `fwb-ios/FWB-iOS-App`. The Apple Health database migration is applied; the web pages and native app still need their normal deployment/TestFlight release.

## Delivered

Dedicated FWB Watch timer and workout companion; native Watch alerts/foreground haptics; optional live heart rate; iPhone Lock Screen/Dynamic Island countdown; opt-in today-workout widget; Siri shortcuts; supported WorkoutKit cardio plans; Apple Health imports and charts; separate default-off per-category cloud/coach sharing; web client Stats/Settings and coach Progress views; privacy copy and release documentation.

The Health import categories are workouts, steps, sleep/resting heart rate/HRV, and body weight. Client consent is separate from Health permission. Revocation deletes the corresponding imported FWB values, without modifying manual records or Apple Health. Refresh occurs when the app is active and on in-process Health changes, not as a guaranteed continuous background service.

## Verified

- Full combined iOS simulator suite: **400 passed, zero failures**. This includes concurrent login, history and coach-workspace work preserved while integrating the Apple features.
- Final installed-project timer/sharing regression run: **24 passed, zero failures**, including two added cases for stale Watch restarts and queued restart/pause combinations.
- All iPhone, Watch and widget targets compile for Debug. The final applied-project unsigned Release device-SDK build also passed, including the embedded Watch app and widget extension.
- iPhone fixture UI: Health read choices default off, sharing stays off after Health access, per-category sharing confirmation, no-data values, history/charts and cardio-planner navigation.
- Watch fixture UI: app launch on paired simulators, exercise/set display, weight adjustment, log-set action, countdown shown first, pause preserving the remaining time, resume continuing the countdown, completion, restart and clear. Native notification scheduling, deadline persistence and command validation have unit coverage. Physical haptics/sensors/delivery timing remain device checks.
- Apple web/database tests: **19 passed**. Broader related web checks: **93 passed**, plus **11 Google Health regression checks passed**.
- Full web suite at verification: **999 tests, 973 passed, 14 existing failures, 12 skipped**. The 14 failures match the pre-change baseline and concern existing layout/cache-version expectations; no new Apple Health failures remain.
- Browser fixture preview showed consented metrics, missing HRV, body-weight trend/history and imported workout metrics/source. No real account or Health records were used in tests or previews.
- `git diff --check` passed in both repositories.

## Backend

Applied `20260926002651_add_opt_in_apple_health_imports.sql`. All three new tables have RLS and SELECT policies. Direct authenticated writes are revoked; narrow authenticated RPCs check owner identity, lock consent, validate payloads and reconcile only requested/consented categories. Tests use isolated PostgreSQL fixtures, covering other-client rejection, coach read-only access, bounds, null/zero distinctions, deletion/revocation and stale uploads.

Supabase flags authenticated SECURITY DEFINER execution for the two new RPCs. That access is intentional and guarded; direct table writes are unavailable. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Required before release

Register/sign the Watch and widget bundle IDs, enable their capabilities, and regenerate the iPhone distribution profile for App Group `group.com.benjaminbenz.fwbcoach`. Match versions across targets and update App Store privacy disclosures. Requirements are iOS 17+ and watchOS 10+.

Run physical paired-device checks for background/locked rest alerts and haptics, connectivity loss/recovery, account changes, Health permission and revocation flows, live heart rate, WorkoutKit scheduling, widgets and Live Activity expiration. No new TestFlight build or web deployment was published in this task.
