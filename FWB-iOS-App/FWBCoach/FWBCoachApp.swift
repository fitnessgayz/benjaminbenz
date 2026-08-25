import SwiftUI

@main
struct FWBCoachApp: App {
    @UIApplicationDelegateAdaptor(NotificationAppDelegate.self) private var notificationAppDelegate

    var body: some Scene {
        WindowGroup {
            CoachAppView()
        }
    }
}
