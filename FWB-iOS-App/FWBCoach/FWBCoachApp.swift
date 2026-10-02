import SwiftUI

@main
struct FWBCoachApp: App {
    @UIApplicationDelegateAdaptor(NotificationAppDelegate.self) private var notificationAppDelegate

    init() { ErrorReporting.start() }

    var body: some Scene {
        WindowGroup {
#if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--coach-workspace-audit") {
                CoachWorkspaceAuditRootView()
            } else {
                CoachAppView()
            }
#else
            CoachAppView()
#endif
        }
    }
}
