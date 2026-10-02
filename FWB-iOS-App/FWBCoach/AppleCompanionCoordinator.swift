import Foundation
import Combine

/// Account-scoped handoff between the logger, Watch commands, and system surfaces.
@MainActor
final class AppleCompanionCoordinator: ObservableObject {
    static let shared = AppleCompanionCoordinator()
    @Published private(set) var account: SignedInAccount?
    private weak var activeTimer: RestTimerStore?
    @Published private(set) var standaloneTimer: RestTimerStore?
    private var loggerSessionID: String?
    private var logSet: ((FWBWatchCommand) async -> FWBWatchCommandOutcome)?
    private var refreshLogger: (() -> Void)?

    func activate(account: SignedInAccount) {
        if let previous = self.account, previous.id != account.id { clearAccount() }
        self.account = account
        AppleHealthImportStore.shared.configure(account: account)
        Task { await AppleHealthImportStore.shared.refresh() }
        let bridge = WatchCompanionBridge.shared
        bridge.activate(accountID: account.id.uuidString.lowercased())
        bridge.onCommand = { [weak self] command in
            guard let self else { return .deferred() }
            return await self.handle(command)
        }
        bridge.onRefresh = { [weak self] in self?.refreshLogger?() }
        bridge.onRestAlertOwnershipChanged = { [weak self] _ in self?.activeTimer?.refreshAppleAlertOwnership() }
        if activeTimer == nil, let rest = bridge.rest,
           rest.phase == .running || rest.phase == .paused {
            let timer = RestTimerStore()
            standaloneTimer = timer
            timer.applyWatchSnapshot(rest)
        }
        WorkoutSystemFeatures.shared.restoreActivities()
    }

    func clearAccount(preservingHealthWorkout: Bool = false) {
        activeTimer?.dismiss()
        activeTimer = nil
        standaloneTimer = nil
        loggerSessionID = nil
        logSet = nil
        refreshLogger = nil
        account = nil
        AppleHealthImportStore.shared.configure(account: nil)
        WatchCompanionBridge.shared.clearAccount()
        WorkoutSystemFeatures.shared.clearAccount(preservingHealthWorkout: preservingHealthWorkout)
    }

    func attachLogger(sessionID: String, refresh: @escaping () -> Void,
                      logSet: @escaping (FWBWatchCommand) async -> FWBWatchCommandOutcome) {
        loggerSessionID = sessionID
        self.logSet = logSet
        refreshLogger = refresh
    }

    func detachLogger(sessionID: String) {
        guard loggerSessionID == sessionID else { return }
        loggerSessionID = nil
        logSet = nil
        refreshLogger = nil
        WatchCompanionBridge.shared.publish(workout: nil)
    }

    func restChanged(_ timer: RestTimerStore) {
        guard let account else { return }
        if timer.phase == .idle, activeTimer !== timer { return }
        if activeTimer !== timer {
            activeTimer?.dismiss()
            if standaloneTimer !== timer { standaloneTimer = nil }
        }
        activeTimer = timer
        objectWillChange.send()
        let snapshot = timer.watchSnapshot(accountID: account.id.uuidString.lowercased(), sessionID: timer.companionSessionID ?? "standalone")
        WatchCompanionBridge.shared.publish(rest: snapshot)
        WorkoutSystemFeatures.shared.updateRestTimer(
            deadline: snapshot.deadline,
            pausedRemaining: snapshot.phase == .paused ? snapshot.pausedRemainingSeconds : nil,
            phase: FWBRestActivityPhase(rawValue: snapshot.phase.rawValue) ?? .idle,
            exerciseName: snapshot.exerciseName
        )
    }

    func startStandaloneRest(seconds: Int) {
        guard account != nil else { return }
        if standaloneTimer == nil { standaloneTimer = RestTimerStore() }
        standaloneTimer?.companionSessionID = "standalone"
        standaloneTimer?.start(seconds: min(max(seconds, 1), 86_400), exerciseName: "Rest timer", hapticsEnabled: true)
    }

    private func handle(_ command: FWBWatchCommand) async -> FWBWatchCommandOutcome {
        guard account?.id.uuidString.lowercased() == command.accountID else { return .rejected("Sign in to the matching account on iPhone.") }
        if command.kind == .completeSet {
            guard loggerSessionID == command.sessionID, let logSet else { return .deferred() }
            return await logSet(command)
        }
        guard let timer = activeTimer, let rest = command.rest else { return .rejected("This timer is no longer active.") }
        timer.applyWatchSnapshot(rest)
        return .accepted
    }
}
