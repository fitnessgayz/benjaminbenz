# FWB Training — App Store Connect draft

## Product page

- App name: `FWB Training`
- Subtitle: `Train. Track. Progress.`
- Primary category: `Health & Fitness`
- Bundle ID: `com.benjaminbenz.fwbcoach`
- Version: `1.0`
- Copyright: `2026 Fitness with Benjamin`
- Support URL: `https://benjaminbenz.com/fwb-training-support.html`
- Privacy policy URL: `https://benjaminbenz.com/fwb-training-privacy.html`

Publish the app-specific drafts in `PublicPages` at these URLs before App Review.

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

Upload five portrait screenshots from an accepted 6.9-inch iPhone size:

1. Today/program workout
2. Exercise set logging with rest timer
3. Workout history and exercise search
4. Progress dashboard
5. Calories and macros calculator

Do not show a real client's email, health information, workout history, or credentials. Use the dedicated review/demo client.

## App Privacy questionnaire draft

Confirm these answers against the production Supabase tables and retention policy before submission.

- Contact info — Email address: collected, linked to identity, used for account authentication and app functionality.
- User content — Workout entries, readiness notes, and progress entries: collected, linked to identity, used for app functionality.
- Fitness — Exercises, sets, repetitions, load, cardio, readiness, and progress measurements: collected, linked to identity, used for app functionality.
- Health — the optional Apple Health integration is write-only. No data is read or collected from the Health app; completed FWB workouts and user-entered distance/calories are written after the client grants permission.
- Identifiers — Supabase user ID: collected, linked to identity, used for account management and app functionality.
- Diagnostics: not collected by the app unless production infrastructure independently records request/error logs; verify Supabase configuration.
- Tracking: no.
- Third-party advertising: no.

## Submission blockers

- Enroll in the Apple Developer Program and install an Apple Development/Distribution signing identity in Xcode.
- Enable the HealthKit capability for the production App ID and provisioning profiles after Developer Program enrollment.
- Create the App Store Connect app record for `com.benjaminbenz.fwbcoach`.
- Approve and publish an app-specific privacy policy and support page.
- Create the dedicated App Review client account.
- Complete App Privacy, age rating, content rights, pricing/availability, and export compliance answers in App Store Connect.
- Capture screenshots using demo data and upload the signed archive.
