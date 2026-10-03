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

Open this directory in Android Studio, install Android SDK 36, and use JDK 17. The project uses Android Gradle Plugin 8.13.2 and Gradle 8.13. The checked-in Gradle wrapper downloads the right Gradle version and verifies its SHA-256 checksum.

### Windows laptop setup

1. Install [Android Studio](https://developer.android.com/studio) and Git for Windows.
2. In PowerShell, run:

   ```powershell
   git clone https://github.com/fitnessgayz/benjaminbenz.git
   cd benjaminbenz
   git switch codex/android-fwb-parity
   ```

3. Open the `FWB-Android-App` folder in Android Studio, let Gradle sync, and install Android SDK Platform 36 if prompted. Set the Gradle JDK to 17 (Android Studio's bundled JDK works if it is version 17 or newer).
4. Choose an Android emulator or connect an Android phone with USB debugging enabled, then click **Run**. Use an existing FWB client account to sign in.

From PowerShell in `FWB-Android-App`, `./gradlew.bat :app:assembleDebug` builds a debug APK. This is a development build; several iOS features are still being ported.

The repository's Android build workflow uses GitHub Actions to assemble and retain a debug APK after an Android change is pushed or submitted as a pull request. It does not sign or publish a Google Play release.

The app contains only the existing Supabase publishable key. Client data access continues to depend on the live project's RLS policies. Do not add a service-role or secret key to the app.
