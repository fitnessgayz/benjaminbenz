# FWB Coach for Android

Native Android client for the existing FWB Training service. This project is being built from the SwiftUI client in `../FWB-iOS-App/` and uses the same Supabase project and client accounts.

## Current implementation

- Native Compose app shell, FWB colors, and nine-section navigation
- Existing-client email/password sign-in and password reset
- Active client program loading from the same `client_programs` table as iOS
- Multiple program selection and version 2 client workout layout reads
- Live Home, Workouts, Logs, Progress, Stats, Food, Sessions, and Settings views; activity and measurement views are currently read-only

See [docs/PARITY.md](docs/PARITY.md) for the screen-by-screen implementation and release checklist. This is an **in-progress development build**, not a client release.

## Open and build

Open this directory in Android Studio, install Android SDK 36, and use JDK 17. The project uses Android Gradle Plugin 8.13.2 and Gradle 8.13. Run `gradle :app:assembleDebug` from this directory if Gradle is available. The Gradle wrapper properties are included, but the wrapper JAR and scripts still need to be generated with `gradle wrapper` in an environment with Gradle installed.

The repository's Android build workflow uses GitHub Actions to assemble and retain a debug APK after an Android change is pushed or submitted as a pull request. It does not sign or publish a Google Play release.

The app contains only the existing Supabase publishable key. Client data access continues to depend on the live project's RLS policies. Do not add a service-role or secret key to the app.
