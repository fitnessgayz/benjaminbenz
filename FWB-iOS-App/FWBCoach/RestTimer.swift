import SwiftUI
import UIKit
import Combine
import UserNotifications

/// Local timer alerts are scheduled on this device. They do not require APNs,
/// a push entitlement, or a server; permission is requested only from Settings.
struct RestTimerNotificationPlan: Equatable {
    static let identifier = "fwb.rest-timer.complete"
    let deadline: Date
    let exerciseName: String
    let ownerID: UUID

    init(deadline: Date, exerciseName: String, ownerID: UUID = UUID()) {
        self.deadline = deadline
        self.exerciseName = exerciseName
        self.ownerID = ownerID
    }

    var dateComponents: DateComponents {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        // Calendar triggers have second precision. Never fire before the deadline.
        let fireDate = Date(timeIntervalSince1970: ceil(deadline.timeIntervalSince1970))
        var components = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireDate)
        components.calendar = calendar
        components.timeZone = calendar.timeZone
        return components
    }
}

@MainActor
protocol RestTimerNotificationScheduling: AnyObject {
    func replace(with plan: RestTimerNotificationPlan)
    func cancel(ownerID: UUID)
}

@MainActor
final class RestTimerNotificationManager: ObservableObject, RestTimerNotificationScheduling {
    static let shared = RestTimerNotificationManager()
    static let preferenceKey = "restTimerNotificationsEnabled"

    @Published private(set) var isEnabled: Bool
    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published private(set) var isWorking = false
    @Published private(set) var message = ""

    private let center: UNUserNotificationCenter
    private let defaults: UserDefaults
    private var activePlan: RestTimerNotificationPlan?
    private var updateGeneration = 0
    private var notificationUpdateTask: Task<Void, Never>?

    init(center: UNUserNotificationCenter = .current(), defaults: UserDefaults = .standard) {
        self.center = center
        self.defaults = defaults
        isEnabled = defaults.bool(forKey: Self.preferenceKey)
    }

    var authorizationLabel: String {
        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return isEnabled
                ? "Get an alert when rest ends, even with your iPhone locked."
                : "Turn on timer alerts to hear when rest ends."
        case .denied:
            return "Allow notifications in iPhone Settings to receive timer alerts."
        case .notDetermined:
            return "You’ll be asked for permission when timer alerts are turned on."
        @unknown default:
            return "Notification permission has not been confirmed."
        }
    }

    func refreshAuthorizationStatus() async {
        authorizationStatus = await center.notificationSettings().authorizationStatus
    }

    /// Call only in response to the user's explicit settings toggle.
    func setEnabled(_ enabled: Bool) async {
        guard !isWorking else { return }
        isWorking = true
        message = ""
        defer { isWorking = false }

        if enabled {
            do {
                await refreshAuthorizationStatus()
                if authorizationStatus == .notDetermined {
                    _ = try await center.requestAuthorization(options: [.alert, .sound])
                    await refreshAuthorizationStatus()
                }
                guard Self.allowsAlerts(authorizationStatus) else {
                    saveEnabled(false)
                    message = "Timer alerts need notification permission."
                    updateNotification()
                    return
                }
            } catch {
                saveEnabled(false)
                message = "Couldn’t enable timer alerts. Please try again."
                updateNotification()
                return
            }
        }

        saveEnabled(enabled)
        updateNotification()
    }

    func replace(with plan: RestTimerNotificationPlan) {
        activePlan = plan
        updateNotification()
    }

    func cancel(ownerID: UUID) {
        guard activePlan?.ownerID == ownerID else { return }
        cancel()
    }

    func cancel() {
        activePlan = nil
        updateNotification()
    }

    private func saveEnabled(_ enabled: Bool) {
        isEnabled = enabled
        defaults.set(enabled, forKey: Self.preferenceKey)
    }

    private static func allowsAlerts(_ status: UNAuthorizationStatus) -> Bool {
        status == .authorized || status == .provisional || status == .ephemeral
    }

    private func updateNotification() {
        updateGeneration += 1
        let generation = updateGeneration
        let previousUpdate = notificationUpdateTask
        let requestedPlan = isEnabled ? activePlan : nil
        let identifiers = [RestTimerNotificationPlan.identifier]
        // Cancel immediately on pause, reset, or opt-out. Serialize additions so
        // an older in-flight add cannot recreate a canceled timer notification.
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
        notificationUpdateTask = Task { [weak self] in
            await previousUpdate?.value
            guard let self, self.updateGeneration == generation else { return }
            self.center.removePendingNotificationRequests(withIdentifiers: identifiers)
            guard let plan = requestedPlan, plan.deadline > Date() else { return }
            let status = await self.center.notificationSettings().authorizationStatus
            guard self.updateGeneration == generation,
                  self.isEnabled, Self.allowsAlerts(status), plan.deadline > Date() else { return }

            let content = UNMutableNotificationContent()
            content.title = "Rest complete"
            content.body = plan.exerciseName.isEmpty
                ? "Your next set is ready."
                : "Your next set of \(plan.exerciseName) is ready."
            content.sound = .default
            content.userInfo = ["kind": "rest_timer", "tab": "workouts"]
            let trigger = UNCalendarNotificationTrigger(dateMatching: plan.dateComponents, repeats: false)
            let request = UNNotificationRequest(
                identifier: RestTimerNotificationPlan.identifier, content: content, trigger: trigger
            )
            do {
                try await self.center.add(request)
                if self.updateGeneration != generation {
                    self.center.removePendingNotificationRequests(withIdentifiers: identifiers)
                }
            } catch {
                guard self.updateGeneration == generation else { return }
                self.message = "The timer is running, but its alert couldn’t be scheduled."
            }
        }
    }
}

@MainActor
final class RestTimerStore: ObservableObject {
    enum Phase: Equatable {
        case idle
        case running
        case paused
        case complete
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var remainingSeconds = 0
    @Published private(set) var exerciseName = ""

    private let notificationScheduler: any RestTimerNotificationScheduling
    private let notificationOwnerID = UUID()
    private let now: () -> Date
    private var countdownTask: Task<Void, Never>?
    private var foregroundSubscription: AnyCancellable?
    private var hapticsEnabled = true
    private var endDate: Date?
    var companionSessionID: String?
    private var appleTimerID = UUID()
    private var appleDurationSeconds = 60
    private var appleUpdatedAt = Date()
    private let integratesAppleFeatures: Bool

    init(
        notificationScheduler: (any RestTimerNotificationScheduling)? = nil,
        now: @escaping () -> Date = Date.init
    ) {
        self.notificationScheduler = notificationScheduler ?? RestTimerNotificationManager.shared
        integratesAppleFeatures = notificationScheduler == nil
        self.now = now
        foregroundSubscription = NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in self?.synchronizeClock() }
            }
    }

    var isVisible: Bool { phase != .idle }

    var timeLabel: String {
        String(format: "%02d:%02d", remainingSeconds / 60, remainingSeconds % 60)
    }

    func start(seconds: Int, exerciseName: String, hapticsEnabled: Bool) {
        countdownTask?.cancel()
        remainingSeconds = min(max(seconds, 1), 86_400)
        appleTimerID = UUID()
        appleDurationSeconds = remainingSeconds
        self.exerciseName = exerciseName
        self.hapticsEnabled = hapticsEnabled
        endDate = now().addingTimeInterval(TimeInterval(remainingSeconds))
        phase = .running
        scheduleNotification()
        WorkoutHaptics.selection(isEnabled: hapticsEnabled)
        runCountdown()
        publishAppleState()
    }

    func togglePause() {
        switch phase {
        case .running:
            synchronizeClock()
            guard phase == .running else { return }
            countdownTask?.cancel()
            endDate = nil
            phase = .paused
            notificationScheduler.cancel(ownerID: notificationOwnerID)
        case .paused:
            guard remainingSeconds > 0 else { return }
            endDate = now().addingTimeInterval(TimeInterval(remainingSeconds))
            phase = .running
            scheduleNotification()
            runCountdown()
        case .idle, .complete:
            break
        }
        publishAppleState()
    }

    /// Move an active deadline without accumulating rounding errors. Paused
    /// timers remain paused; adding time to a completed timer starts it again.
    func adjust(seconds: Int) {
        guard seconds != 0, phase != .idle else { return }
        if phase == .running {
            synchronizeClock()
        }
        switch phase {
        case .running:
            endDate = endDate?.addingTimeInterval(TimeInterval(seconds))
            if let endDate, endDate <= now() { notificationScheduler.cancel(ownerID: notificationOwnerID) }
            synchronizeClock()
            if phase == .running { scheduleNotification() }
        case .paused:
            remainingSeconds = max(0, remainingSeconds + seconds)
            if remainingSeconds == 0 { complete() }
        case .complete:
            guard seconds > 0 else { return }
            appleTimerID = UUID()
            appleDurationSeconds = seconds
            remainingSeconds = seconds
            endDate = now().addingTimeInterval(TimeInterval(seconds))
            phase = .running
            scheduleNotification()
            runCountdown()
        case .idle:
            break
        }
        WorkoutHaptics.selection(isEnabled: hapticsEnabled)
        publishAppleState()
    }

    func addThirtySeconds() {
        adjust(seconds: 30)
    }

    func dismiss() {
        countdownTask?.cancel()
        endDate = nil
        phase = .idle
        remainingSeconds = 0
        exerciseName = ""
        notificationScheduler.cancel(ownerID: notificationOwnerID)
        publishAppleState()
    }

    /// Recompute from the original deadline after suspension; never count ticks.
    func synchronizeClock() {
        guard phase == .running, let endDate else { return }
        remainingSeconds = max(Int(ceil(endDate.timeIntervalSince(now()))), 0)
        if remainingSeconds == 0 { complete() }
    }

    private func scheduleNotification() {
        guard let endDate, phase == .running else { return }
        if integratesAppleFeatures && WatchCompanionBridge.shared.watchOwnsRestAlert(for: appleTimerID) {
            notificationScheduler.cancel(ownerID: notificationOwnerID)
            return
        }
        notificationScheduler.replace(with: RestTimerNotificationPlan(deadline: endDate, exerciseName: exerciseName, ownerID: notificationOwnerID))
    }

    private func publishAppleState() {
        guard integratesAppleFeatures else { return }
        appleUpdatedAt = now()
        AppleCompanionCoordinator.shared.restChanged(self)
    }

    func watchSnapshot(accountID: String, sessionID: String) -> FWBWatchRestSnapshot {
        FWBWatchRestSnapshot(id: appleTimerID, accountID: accountID, sessionID: sessionID,
            exerciseName: exerciseName, durationSeconds: appleDurationSeconds, deadline: endDate,
            pausedRemainingSeconds: remainingSeconds,
            phase: FWBWatchRestSnapshot.Phase(rawValue: String(describing: phase)) ?? .idle,
            updatedAt: appleUpdatedAt)
    }

    func refreshAppleAlertOwnership() {
        guard integratesAppleFeatures, phase == .running else { return }
        scheduleNotification()
    }

    func applyWatchSnapshot(_ snapshot: FWBWatchRestSnapshot) {
        countdownTask?.cancel()
        appleTimerID = snapshot.id
        appleDurationSeconds = snapshot.durationSeconds
        appleUpdatedAt = snapshot.updatedAt
        exerciseName = snapshot.exerciseName
        companionSessionID = snapshot.sessionID
        endDate = snapshot.deadline
        remainingSeconds = snapshot.remainingSeconds(at: now())
        switch snapshot.phase {
        case .idle: phase = .idle
        case .running: phase = remainingSeconds > 0 ? .running : .complete
        case .paused: phase = .paused
        case .complete: phase = .complete
        }
        if phase == .running { scheduleNotification(); runCountdown() }
        else { notificationScheduler.cancel(ownerID: notificationOwnerID) }
        // Preserve the Watch's revision, rather than echoing a newer synthetic edit.
        AppleCompanionCoordinator.shared.restChanged(self)
    }

    private func runCountdown() {
        countdownTask?.cancel()
        countdownTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled, let self, self.phase == .running else { return }
                self.synchronizeClock()
            }
        }
    }

    private func complete() {
        countdownTask?.cancel()
        endDate = nil
        remainingSeconds = 0
        phase = .complete
        publishAppleState()
        // Let the already-scheduled alert fire at its deadline. Canceling here
        // could race the OS delivery if a final tick runs while backgrounded.
        WorkoutHaptics.success(isEnabled: hapticsEnabled)
        UIAccessibility.post(notification: .announcement, argument: "Rest complete")

        countdownTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled, self?.phase == .complete else { return }
            self?.dismiss()
        }
    }
}

enum RestDurationParser {
    static func seconds(from value: String, defaultSeconds: Int = 60) -> Int {
        let normalized = value
            .lowercased()
            .replacingOccurrences(of: "–", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !normalized.isEmpty else { return defaultSeconds }

        if normalized.contains(":"),
           let colon = normalized.firstIndex(of: ":"),
           let minutes = Int(normalized[..<colon]),
           let seconds = Int(normalized[normalized.index(after: colon)...].prefix { $0.isNumber }) {
            return max((minutes * 60) + seconds, 1)
        }

        let numberText = normalized.prefix { $0.isNumber || $0 == "." }
        guard let firstValue = Double(numberText) else { return defaultSeconds }

        if normalized.contains("min") {
            return max(Int((firstValue * 60).rounded()), 1)
        }

        return max(Int(firstValue.rounded()), 1)
    }
}

private enum WorkoutHaptics {
    static func selection(isEnabled: Bool) {
        guard isEnabled else { return }
        let generator = UISelectionFeedbackGenerator()
        generator.prepare()
        generator.selectionChanged()
    }

    static func success(isEnabled: Bool) {
        guard isEnabled else { return }
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(.success)
    }
}

struct RestTimerBanner: View {
    @ObservedObject var store: RestTimerStore

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: store.phase == .complete ? "checkmark.circle.fill" : "timer")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(store.phase == .complete ? Color.fwbLime : Color.fwbWarmWhite)

                VStack(alignment: .leading, spacing: 2) {
                    Text(store.phase == .complete ? "REST COMPLETE" : "REST TIMER")
                        .font(.footnote.bold())
                        .tracking(1)
                        .foregroundStyle(Color.fwbLime)
                    Text(store.exerciseName.fwbTitleCased)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.fwbMuted)
                        .lineLimit(1)
                }

                Spacer(minLength: 10)

                Text(store.timeLabel)
                    .font(.system(.title2, design: .monospaced).weight(.black))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .accessibilityLabel("Rest time remaining")
                    .accessibilityValue(store.timeLabel)
            }

            HStack(spacing: 10) {
                Button {
                    store.togglePause()
                } label: {
                    Label(store.phase == .paused ? "Resume" : "Pause", systemImage: store.phase == .paused ? "play.fill" : "pause.fill")
                }
                .disabled(store.phase == .complete)

                Button("+30 sec") {
                    store.addThirtySeconds()
                }

                Button("Skip") {
                    store.dismiss()
                }
                .accessibilityLabel("Skip rest timer")
            }
            .font(.footnote.weight(.bold))
            .foregroundStyle(Color.fwbWarmWhite)
            .buttonStyle(RestTimerControlButtonStyle())
        }
        .padding(14)
        .background(Color.fwbCard, in: Rectangle())
        .overlay {
            Rectangle()
                .stroke(store.phase == .complete ? Color.fwbLime : Color.fwbLine, lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.35), radius: 12, y: -3)
        .accessibilityElement(children: .contain)
    }
}

private struct RestTimerControlButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .frame(minHeight: 36)
            .background(Color.fwbSurface, in: Rectangle())
            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.35)
    }
}
