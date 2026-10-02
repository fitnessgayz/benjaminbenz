import Combine
import Foundation
import UserNotifications

/// The banner deliberately contains no workout measurements or source details.
struct WorkoutDetectionNotificationPayload: Equatable {
    static let kind = "apple_health_workout"
    let accountID: UUID
    let healthkitID: UUID

    var userInfo: [AnyHashable: Any] {
        ["kind": Self.kind, "account_id": accountID.uuidString, "healthkit_id": healthkitID.uuidString]
    }

    static func parse(_ userInfo: [AnyHashable: Any]) -> Self? {
        guard userInfo["kind"] as? String == kind,
              let account = userInfo["account_id"] as? String, let accountID = UUID(uuidString: account),
              let workout = userInfo["healthkit_id"] as? String, let healthkitID = UUID(uuidString: workout)
        else { return nil }
        return Self(accountID: accountID, healthkitID: healthkitID)
    }
}

struct WorkoutDetectionNotificationPlan: Equatable {
    let payload: WorkoutDetectionNotificationPayload
    var identifier: String {
        "fwb.apple-health-workout.\(payload.accountID.uuidString.lowercased()).\(payload.healthkitID.uuidString.lowercased())"
    }
    var title: String { "Workout detected" }
    var body: String { "New activity is available in your FWB Training logs. Tap to view." }
}

@MainActor
protocol WorkoutDetectionNotificationClient {
    func requestAuthorization() async throws -> Bool
    func isAuthorized() async -> Bool
    func schedule(_ plan: WorkoutDetectionNotificationPlan) async throws
    func remove(identifiers: [String])
}

@MainActor
private final class SystemWorkoutDetectionNotificationClient: WorkoutDetectionNotificationClient {
    private let center = UNUserNotificationCenter.current()

    func requestAuthorization() async throws -> Bool {
        try await center.requestAuthorization(options: [.alert, .sound])
    }

    func isAuthorized() async -> Bool {
        let status = await center.notificationSettings().authorizationStatus
        return status == .authorized || status == .provisional || status == .ephemeral
    }

    func schedule(_ plan: WorkoutDetectionNotificationPlan) async throws {
        let content = UNMutableNotificationContent()
        content.title = plan.title
        content.body = plan.body
        content.sound = .default
        content.userInfo = plan.payload.userInfo
        content.threadIdentifier = "fwb.apple-health-workout.\(plan.payload.accountID.uuidString.lowercased())"
        try await center.add(UNNotificationRequest(identifier: plan.identifier, content: content, trigger: nil))
    }

    func remove(identifiers: [String]) {
        guard !identifiers.isEmpty else { return }
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
        center.removeDeliveredNotifications(withIdentifiers: identifiers)
    }
}

@MainActor
private final class FixtureWorkoutDetectionNotificationClient: WorkoutDetectionNotificationClient {
    func requestAuthorization() async throws -> Bool { true }
    func isAuthorized() async -> Bool { true }
    func schedule(_ plan: WorkoutDetectionNotificationPlan) async throws {}
    func remove(identifiers: [String]) {}
}

@MainActor
final class WorkoutDetectionNotificationStore: ObservableObject {
    @Published private(set) var isEnabled = false
    @Published private(set) var isUpdatingAuthorization = false
    @Published private(set) var message = ""

    private struct Preferences: Codable {
        var enabled = false
        var enabledAt: Date?
        var seen: Set<UUID> = []
        // Persist attempted identifiers before scheduling so opt-out can also clean up
        // a request accepted by the system just before the app exits.
        var requestIdentifiers: Set<String> = []
    }

    private let defaults: UserDefaults
    private let client: any WorkoutDetectionNotificationClient
    private var accountID: UUID?
    private var preferences = Preferences()
    private var generation = UUID()
    private var processing = false
    private var processingWaiters: [CheckedContinuation<Void, Never>] = []

    init(defaults: UserDefaults = .standard, client: (any WorkoutDetectionNotificationClient)? = nil) {
        self.defaults = defaults
        self.client = client ?? SystemWorkoutDetectionNotificationClient()
    }

    static func fixture(defaults: UserDefaults = .standard) -> WorkoutDetectionNotificationStore {
        WorkoutDetectionNotificationStore(defaults: defaults, client: FixtureWorkoutDetectionNotificationClient())
    }

    func configure(accountID: UUID?) {
        guard self.accountID != accountID else { return }
        invalidate()
        self.accountID = accountID
        preferences = accountID.map(load) ?? Preferences()
        isEnabled = preferences.enabled && preferences.enabledAt != nil
        message = ""
    }

    func setEnabled(_ enabled: Bool, knownWorkouts: [AppleHealthImportedWorkout] = [], now: Date = Date()) async {
        guard enabled else {
            clear()
            return
        }
        guard let accountID, !isEnabled, !isUpdatingAuthorization else { return }
        generation = UUID()
        let token = generation
        isUpdatingAuthorization = true
        message = ""
        defer {
            if generation == token { isUpdatingAuthorization = false }
        }

        do {
            let granted = try await client.requestAuthorization()
            guard isCurrent(accountID, token: token), !Task.isCancelled else { return }
            guard granted else {
                message = "Allow notifications in iPhone Settings to receive workout detection alerts."
                return
            }
            preferences.enabled = true
            preferences.enabledAt = now
            preferences.seen.formUnion(knownWorkouts.map(\.healthkitID))
            isEnabled = true
            persist()
        } catch {
            guard isCurrent(accountID, token: token), !Task.isCancelled else { return }
            message = "Notification permission could not be updated. Please try again."
        }
    }

    func process(workouts: [AppleHealthImportedWorkout], accountID: UUID, now: Date = Date()) async {
        let token = generation
        await acquireProcessing()
        defer { releaseProcessing() }
        guard isCurrent(accountID, token: token), isEnabled, !Task.isCancelled,
              let enabledAt = preferences.enabledAt else { return }

        let candidates = workouts.filter {
            $0.endedAt >= enabledAt && $0.endedAt <= now && $0.startedAt <= $0.endedAt
                && !preferences.seen.contains($0.healthkitID)
        }
        guard let latest = candidates.max(by: {
            $0.endedAt == $1.endedAt ? $0.healthkitID.uuidString < $1.healthkitID.uuidString : $0.endedAt < $1.endedAt
        }) else { return }

        let authorized = await client.isAuthorized()
        guard isCurrent(accountID, token: token), isEnabled, !Task.isCancelled else { return }
        guard authorized else {
            message = "Allow notifications in iPhone Settings to receive workout detection alerts."
            return
        }

        let plan = WorkoutDetectionNotificationPlan(payload: .init(accountID: accountID, healthkitID: latest.healthkitID))
        preferences.requestIdentifiers.insert(plan.identifier)
        persist()
        do {
            try await client.schedule(plan)
            guard isCurrent(accountID, token: token), isEnabled, !Task.isCancelled else {
                // Removal before an in-flight add finishes is insufficient: remove
                // once more after completion, while processing remains serialized.
                client.remove(identifiers: [plan.identifier])
                if isCurrent(accountID, token: token) {
                    preferences.requestIdentifiers.remove(plan.identifier)
                    persist()
                }
                return
            }
            preferences.seen.formUnion(candidates.map(\.healthkitID))
            persist()
            message = ""
        } catch {
            client.remove(identifiers: [plan.identifier])
            guard isCurrent(accountID, token: token) else { return }
            preferences.requestIdentifiers.remove(plan.identifier)
            persist()
            if !Task.isCancelled {
            message = "The workout alert could not be delivered. FWB Training will try again on the next sync."
            }
        }
    }

    /// Opt-out removes only this feature's notifications for the active account.
    func clear() {
        invalidate()
        preferences.enabled = false
        preferences.enabledAt = nil
        isEnabled = false
        message = ""
        persist()
    }

    private func invalidate() {
        generation = UUID()
        isUpdatingAuthorization = false
        client.remove(identifiers: Array(preferences.requestIdentifiers))
        preferences.requestIdentifiers.removeAll()
        persist()
    }

    private func isCurrent(_ accountID: UUID, token: UUID) -> Bool {
        self.accountID == accountID && generation == token
    }

    private func key(_ accountID: UUID) -> String {
        "fwb.apple-health-workout-notifications.v1.\(accountID.uuidString.lowercased())"
    }

    private func load(_ accountID: UUID) -> Preferences {
        guard let data = defaults.data(forKey: key(accountID)),
              let value = try? JSONDecoder().decode(Preferences.self, from: data) else { return Preferences() }
        return value
    }

    private func persist() {
        guard let accountID, let data = try? JSONEncoder().encode(preferences) else { return }
        defaults.set(data, forKey: key(accountID))
    }

    private func acquireProcessing() async {
        if processing {
            await withCheckedContinuation { processingWaiters.append($0) }
        } else {
            processing = true
        }
    }

    private func releaseProcessing() {
        if processingWaiters.isEmpty {
            processing = false
        } else {
            processingWaiters.removeFirst().resume()
        }
    }
}
