import ActivityKit
import Combine
import Foundation
import UIKit
import WidgetKit

extension Notification.Name {
    static let fwbSystemRouteRequested = Notification.Name("fwb.system.route.requested")
}

@MainActor
final class FWBSystemRouter: ObservableObject {
    static let shared = FWBSystemRouter()
    @Published private(set) var pendingRoute: FWBSystemRoute?
    @Published private(set) var pendingHealthWorkout: WorkoutDetectionNotificationPayload?

    func enqueueHealthWorkout(_ payload: WorkoutDetectionNotificationPayload) {
        pendingHealthWorkout = payload
        NotificationCenter.default.post(name: .fwbSystemRouteRequested, object: nil)
    }

    func consumeHealthWorkout(accountID: UUID) -> WorkoutDetectionNotificationPayload? {
        defer { pendingHealthWorkout = nil }
        guard pendingHealthWorkout?.accountID == accountID else { return nil }
        return pendingHealthWorkout
    }

    func enqueue(_ route: FWBSystemRoute) {
        if case .startRestTimer(let seconds) = route, !(1...3_600).contains(seconds) { return }
        pendingRoute = route
        NotificationCenter.default.post(name: .fwbSystemRouteRequested, object: nil)
    }

    @discardableResult
    func receive(url: URL) -> Bool {
        guard let route = FWBSystemRoute.parse(url) else { return false }
        enqueue(route)
        return true
    }

    func consumePendingRoute() -> FWBSystemRoute? {
        defer { pendingRoute = nil }
        return pendingRoute
    }

    func clear(preservingHealthWorkout: Bool = false) {
        pendingRoute = nil
        if !preservingHealthWorkout { pendingHealthWorkout = nil }
    }
}

@MainActor
final class WorkoutSystemFeatures: ObservableObject {
    static let shared = WorkoutSystemFeatures()
    @Published private(set) var liveActivityMessage = ""
    @Published var showExerciseOnLockScreen: Bool {
        didSet {
            UserDefaults.standard.set(showExerciseOnLockScreen, forKey: Self.exerciseVisibleKey)
            if var state = latestTimerState {
                state.exerciseName = showExerciseOnLockScreen ? latestExerciseName : nil
                latestTimerState = state
                enqueueActivityUpdate(state)
            }
        }
    }
    @Published var liveActivitiesEnabled: Bool {
        didSet {
            UserDefaults.standard.set(liveActivitiesEnabled, forKey: Self.liveEnabledKey)
            if let latestTimerState { enqueueActivityUpdate(latestTimerState) }
            else if !liveActivitiesEnabled { endRestTimer() }
        }
    }
    @Published var widgetEnabled: Bool {
        didSet {
            sharedDefaults?.set(widgetEnabled, forKey: FWBSystemConstants.widgetEnabledKey)
            writeWidgetSnapshot()
        }
    }

    private static let liveEnabledKey = "fwb.rest.liveActivities.enabled"
    private static let exerciseVisibleKey = "fwb.rest.liveActivities.exerciseVisible"
    private let sharedDefaults: UserDefaults?
    private var latestWorkout: FWBWidgetWorkoutSnapshot?
    private var latestTimerState: FWBRestActivityAttributes.ContentState?
    private var latestExerciseName: String?
    private var activityTask: Task<Void, Never>?
    private var activityGeneration = 0

    init(sharedDefaults: UserDefaults? = UserDefaults(suiteName: FWBSystemConstants.appGroup)) {
        self.sharedDefaults = sharedDefaults
        liveActivitiesEnabled = UserDefaults.standard.object(forKey: Self.liveEnabledKey) as? Bool ?? true
        showExerciseOnLockScreen = UserDefaults.standard.bool(forKey: Self.exerciseVisibleKey)
        widgetEnabled = sharedDefaults?.bool(forKey: FWBSystemConstants.widgetEnabledKey) ?? false
    }

    /// Called on start, pause, resume, adjustment, and completion — never every tick.
    /// Exercise names stay off the Lock Screen unless explicitly enabled.
    func updateRestTimer(deadline: Date?, pausedRemaining: Int?, phase: FWBRestActivityPhase, exerciseName: String) {
        let trimmed = exerciseName.trimmingCharacters(in: .whitespacesAndNewlines)
        latestExerciseName = trimmed.isEmpty ? nil : String(trimmed.prefix(100))
        let state = FWBRestActivityAttributes.ContentState(
            phase: phase, deadline: deadline, pausedRemaining: max(0, pausedRemaining ?? 0), updatedAt: Date(),
            exerciseName: showExerciseOnLockScreen ? latestExerciseName : nil
        )
        latestTimerState = state
        enqueueActivityUpdate(state)
    }

    func endRestTimer() {
        let state = FWBRestActivityAttributes.ContentState(phase: .idle, deadline: nil, pausedRemaining: 0, updatedAt: Date())
        latestTimerState = nil
        enqueueActivityUpdate(state)
    }

    func restoreActivities() {
        let previous = activityTask
        activityTask = Task { @MainActor in
            await previous?.value
            for activity in Activity<FWBRestActivityAttributes>.activities {
                let state = activity.content.state
                if !self.liveActivitiesEnabled || state.hasExpired || state.phase == .idle || state.phase == .complete
                    || Date().timeIntervalSince(state.updatedAt) >= 28_800 {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
        }
    }

    func updateAssignedWorkout(title: String?, scheduledDate: Date?) {
        latestWorkout = FWBWidgetWorkoutSnapshot(title: title, scheduledDate: scheduledDate, updatedAt: Date())
        writeWidgetSnapshot()
    }

    func clearAccount(preservingHealthWorkout: Bool = false) {
        latestWorkout = nil
        widgetEnabled = false
        showExerciseOnLockScreen = false
        latestExerciseName = nil
        sharedDefaults?.removeObject(forKey: FWBSystemConstants.widgetSnapshotKey)
        FWBSystemRouter.shared.clear(preservingHealthWorkout: preservingHealthWorkout)
        endRestTimer()
        WidgetCenter.shared.reloadTimelines(ofKind: FWBSystemConstants.widgetKind)
    }

    private func writeWidgetSnapshot() {
        if widgetEnabled, let latestWorkout, let data = try? JSONEncoder().encode(latestWorkout) {
            sharedDefaults?.set(data, forKey: FWBSystemConstants.widgetSnapshotKey)
        } else {
            sharedDefaults?.removeObject(forKey: FWBSystemConstants.widgetSnapshotKey)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: FWBSystemConstants.widgetKind)
    }

    /// Serializing lifecycle operations prevents a slow update from resurrecting a dismissed timer.
    private func enqueueActivityUpdate(_ state: FWBRestActivityAttributes.ContentState) {
        activityGeneration += 1
        let generation = activityGeneration
        let previous = activityTask
        activityTask = Task { @MainActor in
            await previous?.value
            guard generation == self.activityGeneration else { return }
            var activities = Activity<FWBRestActivityAttributes>.activities
                .filter { $0.activityState == .active || $0.activityState == .stale }
            if !self.liveActivitiesEnabled || state.phase == .idle || state.phase == .complete || state.hasExpired {
                let final = FWBRestActivityAttributes.ContentState(phase: .complete, deadline: nil, pausedRemaining: 0, updatedAt: Date())
                for activity in activities {
                    await activity.end(ActivityContent(state: final, staleDate: nil),
                                       dismissalPolicy: state.phase == .complete ? .after(Date().addingTimeInterval(10)) : .immediate)
                }
                return
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                self.liveActivityMessage = "Live Activities are disabled in iPhone Settings."
                return
            }
            let staleDate = state.phase == .running ? state.deadline : state.updatedAt.addingTimeInterval(28_800)
            let content = ActivityContent(state: state, staleDate: staleDate)
            if let active = activities.first {
                activities.removeFirst()
                for duplicate in activities { await duplicate.end(nil, dismissalPolicy: .immediate) }
                await active.update(content)
                self.liveActivityMessage = ""
            } else if UIApplication.shared.applicationState == .active {
                do {
                    _ = try Activity.request(attributes: FWBRestActivityAttributes(sessionID: UUID()), content: content, pushType: nil)
                    self.liveActivityMessage = ""
                } catch {
                    self.liveActivityMessage = "Couldn’t show the Lock Screen timer. The timer and rest alert still work in FWB Training."
                }
            }
        }
    }
}
