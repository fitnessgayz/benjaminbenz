# FWB Coach for iOS

FWB Coach currently ships as a native SwiftUI shell around the private coach web app. SwiftUI owns the installed app boundary, loading state, and connection recovery; authentication and product navigation remain in the web experience so the app has one authoritative session and information architecture.

The shell uses the shared FWB promise—**Train with intention. Feel your progress.**—and the same semantic lime, ink, and warm-neutral palette as the website and mobile products.

## Current shell scope

- iPhone-installed `FWB Coach` product identity
- Native branded loading and connection-recovery states
- Persistent `WKWebView` data store for the coach web session
- Coach web app authentication, home, clients, inbox, and working tools

The repository still contains an earlier native authentication and client-list prototype. Those views are not wired into `AppRootView` and should not be treated as a second shipping navigation architecture.

## Run

1. Open `FWBCoach.xcodeproj` in Xcode 26 or newer.
2. Select an iPhone Simulator and run the `FWBCoach` scheme.
3. Sign in with the existing authorized coach account.

The deployment target is iOS 17. The bundle identifier is `com.benjaminbenz.FWBCoach`; select the appropriate Apple Developer team before installing on a physical device or archiving for TestFlight.
