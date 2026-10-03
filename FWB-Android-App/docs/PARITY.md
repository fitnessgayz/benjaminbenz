# iOS → Android parity checklist

Source of truth: `../FWB-iOS-App/FWBCoach/` at repository commit `71f5647`. The Android client must use the same Supabase project, accounts, RLS rules, and record formats so a client's activity is visible on iPhone, Android, and web.

Status: **in progress**. A checked box means the Android behavior has been implemented and verified on a device. The initial UI and data reads are present but have not passed a device build yet, so they remain unchecked.

## Client flows

| Area | iOS source | Android acceptance criteria | Done |
| --- | --- | --- | --- |
| Sign-in and account | `LoginView.swift`, `AppStores.swift` | Existing email/password accounts, restore session, password reset, coach account rejected, sign-out, client-only access | [ ] |
| Navigation and appearance | `ClientNavigationView.swift`, `BrandStyle.swift`, `AppearanceSettingsView.swift` | Same nine destinations, retained in-progress state, light/dark mode, accessibility text, keyboard behavior | [ ] |
| Home | `ClientViews.swift`, `ReadinessCheckIn.swift`, `WeeklyCoachCheckIn.swift` | Greeting, program overview, next workout, daily and weekly check-ins, snapshots, coach note, notification badge | [ ] |
| Workouts | `ClientViews.swift`, `WorkoutLoggerViews.swift`, `WorkoutSequence.swift` | Assigned library, exercise demos, custom sequence/groups, set logging, substitutions, comments, timers, celebrations, cardio | [ ] |
| Offline continuity | `OfflineWorkoutSync.swift`, `ContinuitySync.swift` | Save workout drafts locally, resume after restart, retry sync, conflict handling, no duplicate records | [ ] |
| Logs | `WorkoutHistoryViews.swift`, `WorkoutComments.swift` | Workout and cardio history, details, previous results, comments, edits/copy behaviors | [ ] |
| Progress | `ProgressViews.swift`, `ProgressSharing.swift` | Charts, records, summaries, and sharing | [ ] |
| Stats | `ClientStatsViews.swift` | Measurements, progress photos, signed media URLs, add/edit/delete, client isolation | [ ] |
| Food | `NutritionViews.swift`, `NutritionCalculator.swift` | Calorie/macro targets, calculator and edits, offline queue and conflict handling | [ ] |
| PAR-Q | `ClientWebDestinations.swift` | Read linked questionnaire, fill/edit, submit through existing Edge Function, validation | [ ] |
| Sessions | `ClientWebDestinations.swift` | Current package, used/remaining counts, dates, archived packages, source Sheet link | [ ] |
| Notifications | `NotificationsFeature.swift`, `NotificationAppDelegate.swift` | Inbox, read state, preferences, token registration, Android push delivery | [ ] |
| Settings | `ClientViews.swift`, `WorkoutSettingsView.swift` | Account, appearance, workout settings, privacy/support/deletion links, sign-out | [ ] |
| Health integration | `HealthKitWorkoutSync.swift` | Health Connect opt-in and completed strength/cardio workout writes; no health reads | [ ] |
| Error reporting | `ErrorReporting.swift` | Sanitized crash/operation reporting without client or health details | [ ] |

## Data and release checks

- [ ] Verify every Android read/write uses the same table, column, JSON, and Edge Function contracts as iOS and web.
- [ ] Verify live Supabase RLS with two different client accounts; neither can see or modify the other's records.
- [ ] Verify Android workout logging appears in iOS and web, and iOS/web changes appear in Android.
- [ ] Test signed-out, expired-session, offline, interrupted-save, and conflict flows.
- [ ] Build a signed Android App Bundle targeting Google Play's current required API level.
- [ ] Complete Google Play privacy/data-safety and Health Connect declarations where applicable.
- [ ] Run internal testing with real clients before production release.

## Current development build

Implemented in source: Compose shell, nine-tab dock, brand palette, Supabase email/password authentication, program loading, multiple-program selection, version 2 exercise layout reads, exercise demo links, and read-only Home, Workouts, Food, Sessions, and Settings views. The remaining tabs show a development notice. No client release should be made from this build.

The Android SDK, JDK, and Gradle are not installed on this Mac. Compilation and device testing remain unverified until the GitHub build workflow runs on a pushed branch or those tools are available locally.
