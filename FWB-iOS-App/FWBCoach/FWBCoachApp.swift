import SwiftUI

@main
struct FWBCoachApp: App {
    @UIApplicationDelegateAdaptor(NotificationAppDelegate.self) private var notificationAppDelegate

    var body: some Scene {
        WindowGroup {
            rootView
        }
    }

    @ViewBuilder
    private var rootView: some View {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--client-stats-smoke")
            || ProcessInfo.processInfo.environment["CLIENT_STATS_SMOKE"] == "1" {
            ClientStatsSmokeHarness()
        } else {
            CoachAppView()
        }
        #else
        CoachAppView()
        #endif
    }
}
