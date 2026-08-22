# FWB Coach for iOS

Native SwiftUI app for Fitness with Benjamin. It connects to the same Supabase project as the existing web app, so iPhone, Android-browser, and desktop users share accounts, programs, and training data.

This is an independent app with the bundle identifier `com.benjaminbenz.fwbcoach`. It installs alongside Kwestly/FindSpottr instead of replacing it. The display name is **FWB Coach**.

## Native milestone

- Native email/password login and password reset using the existing Supabase accounts
- Persistent Supabase session restoration
- Client-only native experience; coach administration stays on the website
- Native dashboard, workout library, exercise logging, history, charts, records, substitutions, reminders, and rest timer
- Offline workout recovery plus automatic workout and readiness synchronization
- Daily readiness check-ins shared through the existing `client_check_ins` data used by the coach website
- Existing web Coach Admin retained as the coaching surface
- Existing web app remains available at `benjaminbenz.com` for non-iPhone users

The Supabase Swift package is pinned to version `2.55.1`. Only the publishable client key is included in the app. Database authorization remains enforced by the existing Row Level Security policies; no service-role key is present in the iOS project. Sessions use Keychain on real devices and a simulator-only local store in development because unsigned Simulator builds do not receive Keychain entitlements.

## Open and run

1. Open `FWBCoach.xcodeproj` in Xcode.
2. Select the `FWBCoach` scheme and an iPhone or iPad.
3. Choose a development team for device builds if Xcode requests one.
4. Run.

Clients use the same credentials as the web app. The coach account is intentionally rejected by the iOS app and continues to use Coach Admin on the website. Authenticated clients can only access their own rows as permitted by Supabase RLS.
