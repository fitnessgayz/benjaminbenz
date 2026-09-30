import Supabase
import UIKit
import UserNotifications

extension Notification.Name {
    static let fwbNotificationRegistrationStatusChanged = Notification.Name(
        "fwbNotificationRegistrationStatusChanged"
    )
    static let fwbNotificationInboxShouldOpen = Notification.Name(
        "fwbNotificationInboxShouldOpen"
    )
}

final class NotificationAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in
            PushRegistrationCoordinator.shared.receive(deviceToken: token)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            PushRegistrationCoordinator.shared.receiveRegistrationFailure(error)
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        Task { @MainActor in
            NotificationCenter.default.post(name: .fwbNotificationInboxShouldOpen, object: nil)
        }
        completionHandler()
    }
}

private struct DeviceTokenRegistrationPayload: Encodable {
    let userID: UUID
    let clientEmail: String
    let deviceToken: String
    let platform: String
    let environment: String
    let bundleIdentifier: String
    let isActive: Bool
    let lastSeenAt: String

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case clientEmail = "client_email"
        case deviceToken = "device_token"
        case platform
        case environment
        case bundleIdentifier = "bundle_identifier"
        case isActive = "is_active"
        case lastSeenAt = "last_seen_at"
    }
}

private struct DeviceTokenDeactivation: Encodable {
    let isActive: Bool
    let lastSeenAt: String

    enum CodingKeys: String, CodingKey {
        case isActive = "is_active"
        case lastSeenAt = "last_seen_at"
    }
}

@MainActor
final class PushRegistrationCoordinator {
    static let shared = PushRegistrationCoordinator()

    private let client: SupabaseClient
    private var activeAccount: SignedInAccount?
    private var currentDeviceToken: String?

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    func activate(account: SignedInAccount) async {
        activeAccount = account
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if status == .authorized || status == .provisional || status == .ephemeral {
            registerForRemoteNotificationsIfAvailable()
        }
    }

    func clearActiveAccount(_ accountID: UUID) {
        guard activeAccount?.id == accountID else { return }
        activeAccount = nil
    }

    func registerForRemoteNotificationsIfAvailable() {
#if targetEnvironment(simulator)
        NotificationCenter.default.post(
            name: .fwbNotificationRegistrationStatusChanged,
            object: "APNs device registration is unavailable in Simulator."
        )
#else
        UIApplication.shared.registerForRemoteNotifications()
#endif
    }

    func receive(deviceToken: String) {
        currentDeviceToken = deviceToken
        Task { await uploadCurrentTokenIfPossible() }
    }

    func receiveRegistrationFailure(_ error: Error) {
        NotificationCenter.default.post(
            name: .fwbNotificationRegistrationStatusChanged,
            object: "Remote notification registration is not active for this build."
        )
    }

    func deactivateCurrentDeviceToken() async {
        guard let account = activeAccount, let currentDeviceToken else { return }

        do {
            try await client
                .from("client_notification_devices")
                .update(
                    DeviceTokenDeactivation(
                        isActive: false,
                        lastSeenAt: ISO8601DateFormatter().string(from: Date())
                    )
                )
                .eq("user_id", value: account.id.uuidString)
                .eq("device_token", value: currentDeviceToken)
                .execute()
        } catch {
            // Sign-out must still complete if notification infrastructure is unavailable.
        }

        self.currentDeviceToken = nil
        activeAccount = nil
    }

    private func uploadCurrentTokenIfPossible() async {
        guard let account = activeAccount, let currentDeviceToken else { return }

        let payload = DeviceTokenRegistrationPayload(
            userID: account.id,
            clientEmail: account.email.lowercased(),
            deviceToken: currentDeviceToken,
            platform: "ios",
            environment: Self.apnsEnvironment,
            bundleIdentifier: Bundle.main.bundleIdentifier ?? "com.benjaminbenz.fwbcoach",
            isActive: true,
            lastSeenAt: ISO8601DateFormatter().string(from: Date())
        )

        do {
            try await client
                .from("client_notification_devices")
                .upsert(payload, onConflict: "user_id,device_token")
                .execute()
            NotificationCenter.default.post(
                name: .fwbNotificationRegistrationStatusChanged,
                object: "This device is registered for future FWB push delivery."
            )
        } catch {
            NotificationCenter.default.post(
                name: .fwbNotificationRegistrationStatusChanged,
                object: "Device registration is waiting for notification infrastructure to be activated."
            )
        }
    }

    private static var apnsEnvironment: String {
#if DEBUG
        "sandbox"
#else
        "production"
#endif
    }
}
