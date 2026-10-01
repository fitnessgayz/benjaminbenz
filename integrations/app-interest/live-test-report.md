# Live signup verification

Initial signup and duplicate testing was completed on September 26, 2026. Version 3 was deployed later that day with new-signup email notifications. Google authorization for the send-mail scope was completed on September 28, 2026, followed by a live end-to-end notification test.

Tests used the connected signup page without Google sign-in and posted to the public `/exec` endpoint recorded in `deployment.json`.

| Check | Observed result |
| --- | --- |
| New signup | The response showed “You're on the list!”, one row was added to `App Interest`, and one notification arrived at `benjaminbenz.fit@gmail.com`. |
| Same email in uppercase | The response showed success; no second row and no second notification were created. |
| Notification contents | The message contained the synthetic name, email, goal, experience, device, and response-sheet link. It omitted the phone number. |
| Concurrent real signup | A real signup received its own notification while the synthetic test record existed, and its sheet row was preserved during cleanup. |
| Cleanup | The synthetic test row was removed, the concurrent real signup shifted into the empty position, and the real rows remained contiguous. |

The September 28 synthetic record used name `FWB EMAIL NOTIFICATION TEST` and email `fwb-email-notification-test-20260928@example.com`. Its displayed signup timestamp was `9/28/2026 10:00:31`. The mixed-case duplicate changed the submitted values so the absence of another row or alert confirmed email-based deduplication.

The notification search showed exactly one message for the synthetic address after both submissions. A separate real signup at approximately 10:01 AM produced its own alert, confirming that authorization and delivery worked for the live flow. No personal details from real signups are recorded in this report.

Six signups received before the send-mail permission was authorized remained in the sheet but did not produce retroactive notifications. The synthetic notification email was retained as verification evidence; only its sheet row was removed.

All 68 offline backend checks passed after the notification change. They cover validation, formula escaping, header protection, locking, deduplication, notification contents, duplicate suppression, notification failure behavior, and the exact manifest permissions. The saved signup remains successful if email delivery fails because the row is flushed before `MailApp` runs.

The production signup page remains at an unlisted main-domain address with iOS-only and Android-coming-soon copy. It is not linked from the website.
