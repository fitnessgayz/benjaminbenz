# Apple Health workout auto-import

Prepared locally on September 27, 2026 in `fwb-ios/FWB-iOS-App`. This change has not been released to TestFlight or deployed to the website.

## Client flow

1. Open Settings → Apple Health and select Workouts & workout heart rate.
2. Choose Apple Health permissions and allow workout access.
3. Turn on Automatically sync workouts for system-scheduled background import.
4. View completed workouts in Logs → Apple Health workouts. The list covers the last 30 days and shows source, type, date, duration, and available calories, distance and average heart rate.
5. Optionally turn on **Notify me when a workout is detected** and allow iPhone notifications. New completed workouts trigger a generic local alert. Tapping it opens the activity details with Logs selected. Initial history and repeated syncs do not produce repeat alerts.
6. Optionally enable Workouts under Share with FWB & your coach to sync records to the existing account service and web/coach views. This remains a separate confirmation.

The source device or app must save a completed workout to Apple Health. FWB does not infer exercise from raw motion. Background timing is controlled by iOS; foreground and manual refresh remain available. Turning off background import still permits foreground refresh. Disabling the workout viewing category also turns off background import.

## Implementation

The existing HealthKit reader now registers workout background delivery and reinstalls observers on launch and after a permission prompt. Concurrent change callbacks wait for a serialized refresh with a follow-up pass when another change arrives. An account-scoped pending flag records unfinished work without storing Health measurements. Errors, cancellation and offline uploads leave the flag for a later retry. Delivery completion is acknowledged exactly once, including a bounded timeout. Sign-out and account changes invalidate pending results.

The existing snapshot service and database remain unchanged. Stable HealthKit UUIDs identify imports, FWB-created workouts are excluded, and category sharing consent is enforced by the existing authenticated transactional RPC. Manual training sessions and coaching counts are separate.

## Detection notifications

Detection alerts are optional and use local iPhone notifications, with no APNs backend or coach message. The banner says **Workout detected** and **New activity is available in your FWB Logs. Tap to view.** It contains no measurements, route or source details. Workouts completed before the setting was enabled do not trigger an alert. Multiple newly found workouts share one alert; its destination is the most recent activity. Per-account workout IDs prevent repeats across refreshes and restarts. Failed scheduling can retry on a later sync.

Turning off alerts, turning off workout reading, clearing the preview or switching accounts removes this feature's pending/delivered alerts. Tap destinations are checked against the signed-in account and retained through initial sign-in when necessary. If a workout is deleted or no longer readable, its detail screen explains that it is unavailable. Alerts require notification permission and follow the timing of Health updates; they do not detect exercise starting.

## Validation

- Simulator build passed.
- 84 focused tests passed across Health imports/sharing, observer completion, account sessions, coach Health access, and manual history deletion.
- After the final permission-observer fix, all 31 Health-specific tests passed again.
- Fixture UI smoke passed on iPhone 15: imported running/yoga rows, optional metrics, settings navigation, automatic-sync toggle, and sharing remaining off.
- Detection notification update: all 93 focused tests passed, including 18 notification-service tests, account-safe tap routing and notification disablement when Health reading stops.
- Detection UI smoke passed: notification toggle, matching activity details, and missing-workout fallback. Actual OS permission prompts/banners and background notification delivery still require the physical-device release check.
- No real Health records were read or uploaded during validation.

Before release, enable HealthKit Background Delivery for the iPhone App ID and regenerate its distribution profile. Validate actual background delivery on a physical paired iPhone/Watch, including locked/offline behavior, external workout deletion, duplicate prevention, account switching and consent revocation. The simulator cannot verify sensor or background-wakeup behavior. Release the updated privacy wording with the app.

## References

- [Everfit activity sync](https://help.everfit.io/en/articles/10229443-client-app-how-to-sync-activities-from-health-app) describes discovering completed Health workouts, selecting activities to sync, and viewing them in History. FWB's optional automatic import avoids requiring per-workout selection.
- [Apple observer queries](https://developer.apple.com/documentation/healthkit/executing-observer-queries) describes launch registration and query completion.
- [Apple background delivery](https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)) describes system delivery and the required entitlement.
