# FWB Training — App Store Connect submission record

Last audited: August 23, 2026.

Current Apple status: `Prepare for Submission`. Build `2` is uploaded and shows `Ready to Submit` in TestFlight. Corrected build `3` is prepared locally and is waiting for macOS code-signing approval before upload. The version has not yet been added to an App Review submission.

## Product page

- App name: `FWB Training`
- Subtitle: `Train. Track. Progress.`
- Primary category: `Health & Fitness`
- Bundle ID: `com.benjaminbenz.fwbcoach`
- Version: `1.0`
- Copyright: `2026 Fitness with Benjamin`
- Support URL: `https://benjaminbenz.com/fwb-training-support.html`
- Privacy policy URL: `https://benjaminbenz.com/fwb-training-privacy.html`

Both app-specific pages are published at these URLs.

## Promotional text

Train with your assigned program, log every set, build custom workouts, track cardio, sync completed workouts to Apple Health, and review your progress—all from your phone.

## Description

FWB Training gives Fitness with Benjamin clients one focused place to follow their training and see their progress.

Log programmed or custom workouts, add or substitute exercises, record sets and cardio, use rest timers, and save progress exercise by exercise. Review workout history, search past exercise performance, follow calorie and macro targets, complete readiness check-ins, and see progress trends over time.

Optionally connect Apple Health to keep completed strength and cardio workouts together with your activity history. FWB Training writes completed workouts and any distance or calories you entered; it does not read your Health data.

An active Fitness with Benjamin client account is required. Coaching administration remains available through the web portal.

## Keywords

`fitness,workout,training,strength,coach,gym,exercise,progress,macros,cardio`

## App Review notes

FWB Training is a companion app for active Fitness with Benjamin clients. Accounts are provisioned outside the app by the coach; the app does not offer self-service account creation or purchases.

Provide Apple with a dedicated review client account whose sample program includes strength exercises, a cardio item, workout history, macro targets, and progress data. Keep the backend available throughout review.

- Review email: `[CREATE A DEDICATED REVIEW ACCOUNT]`
- Review password: `[ENTER ONLY IN APP STORE CONNECT]`
- Contact: `fwb@benjaminbenz.com`

YouTube exercise-demo links open externally.

Apple Health integration is optional and requested in context from Workout Settings. The app writes completed workouts, duration, and only user-entered distance or calories. It does not read Health data, and declining Health access does not affect workout logging.

## Screenshot plan

Five privacy-safe portrait screenshots were generated at Apple's accepted 1242 × 2688 resolution and uploaded on August 23, 2026:

1. Active workout log
2. Workout library and quick starts
3. Calories and macros calculator
4. Readiness check-in
5. Account, measurements, privacy, and support

Do not show a real client's email, health information, workout history, or credentials. Use the dedicated review/demo client.

## App Privacy questionnaire

Production code and Supabase tables were audited on August 23, 2026. Select `Yes, we collect data from this app`, then disclose:

| Apple data type | Collected | Linked to identity | Tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info — Email Address | Yes | Yes | No | App Functionality |
| Health & Fitness — Health | Yes | Yes | No | App Functionality |
| Health & Fitness — Fitness | Yes | Yes | No | App Functionality |
| User Content — Emails or Text Messages | Yes | Yes | No | App Functionality |
| User Content — Photos or Videos | Yes | Yes | No | App Functionality |
| User Content — Other User Content | Yes | Yes | No | App Functionality |
| Identifiers — User ID | Yes | Yes | No | App Functionality |
| Identifiers — Device ID | Yes | Yes | No | App Functionality |

Notes:

- `Health` covers readiness/pain notes, body weight, body composition, measurements, and other client-provided health information. Apple Health itself is write-only; the app requests no HealthKit read types.
- `Fitness` covers programs, exercises, sets, repetitions, load, effort, cardio, workout history, and progress records.
- `Emails or Text Messages` covers private client/coach workout comments.
- `Photos or Videos` covers progress photos and form-check media.
- `Other User Content` covers free-form workout, check-in, progress, and form-check notes.
- `Device ID` covers the app-specific Apple Push Notification device token.
- Data is not used for third-party advertising, developer advertising, analytics, product personalization, or tracking.
- The app includes no advertising SDK or analytics SDK. Supabase provides authentication, database, private storage, and notification infrastructure as a service provider.

## Remaining submission checklist

- Create the dedicated App Review client account.
- Enter the App Review contact phone number in international format and save the product-page metadata.
- Approve macOS code signing, upload build `3`, and select it for version `1.0`.
- Confirm and publish the completed App Privacy responses.
- Enter the dedicated review credentials, add the version for review, and explicitly confirm the final submission.

Completed in App Store Connect on August 23, 2026:

- Product subtitle and Health & Fitness category.
- Content-rights, age-rating, and regulated-medical-device declarations.
- Free pricing and availability in all 175 countries or regions.
- Public distribution limited to supported iPhone devices; Mac, Vision Pro, and Apple School Manager options are disabled.
- Product-page text, support URL, marketing URL, review notes, contact name/email, copyright, and manual release selection are filled. Apple will not save the page until the required phone number is entered.
- Five privacy-safe screenshots are uploaded.
- Privacy-policy and privacy-choices URLs are saved.
- Eight collected data types are fully configured as linked to the user, used only for App Functionality, and not used for tracking. Apple's final privacy attestation is awaiting explicit confirmation.
