# FWB Coach for iOS

This repository owns the website, client web app, and native coach iOS app.
The native client iOS app is owned by [fitnessgayz/fwb-ios](https://github.com/fitnessgayz/fwb-ios).

| Product | Repository | Native bundle / testing |
| --- | --- | --- |
| Website and client web app | fitnessgayz/benjaminbenz | benjaminbenz.com |
| Native coach iOS app | fitnessgayz/benjaminbenz | com.benjaminbenz.fwbcoach · internal FWB Coach Beta |
| Native client iOS app | fitnessgayz/fwb-ios | com.benjaminbenz.fwb · FWB Client Beta |

## Coach app

The coach app uses the existing native coach workspace migrated from the client repository: client management, program editing, session records, workout logging on behalf of clients, shared progress, exercise library, messaging, notifications, and account settings.

Sign-in and restored sessions must resolve to a coach through the server's `is_coach_admin` policy. An email constant, editable profile metadata, or a sign-in selector cannot grant coach access. Client accounts are rejected and directed to the separate client app or website. There is no native client navigation shell in this app.

Shared workout/data/UI components remain available where the coach workspace uses them; they do not constitute a second client app target. Client onboarding and its tutorial belong in the client repository, not the coach release.

Open `FWBCoach.xcodeproj`, select `FWBCoach`, and run on iOS 17 or later. The project has one shipping app target: no client Watch or widget targets. Password reset uses the existing web recovery page so the two installed apps cannot compete for the client's `fwb://` links.

## Releases

Every push to this repository's `main` runs unsigned tests, then signs and uploads only `com.benjaminbenz.fwbcoach`. The release validates the coach-only app boundary, exact bundle identifier, signing profile, trusted repository/branch, and internal automatic-distribution group before uploading.

CI waits for the exact uploaded build to finish Apple processing. App Store Connect automatically distributes eligible builds to **FWB Coach Beta**, which must remain an internal group with automatic distribution enabled. Tester membership/invitations are separate one-time account administration.

This workflow does not distribute to external clients, submit Beta App Review, or publish to the App Store. See [DEPLOYMENT.md](DEPLOYMENT.md) for signing, repository-secret setup, and verification.

The Supabase Swift package is pinned to 2.55.1. Only its publishable key is embedded; database RLS still enforces access. Sessions use a coach-specific Keychain namespace on devices. Sentry excludes user, workout, health, request, and replay data from diagnostics.
