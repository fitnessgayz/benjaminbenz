import Foundation
import Supabase

/// Health reads and account sharing have separate, initially empty selections.
@MainActor
final class AppleHealthImportStore: ObservableObject {
    static let shared = AppleHealthImportStore()
    @Published private(set) var account: SignedInAccount?
    @Published private(set) var selectedCategories: Set<AppleHealthImportCategory> = []
    @Published private(set) var snapshot: AppleHealthImportSnapshot?
    @Published private(set) var isWorking = false
    @Published private(set) var refreshedAt: Date?
    @Published private(set) var sharedCategories: Set<AppleHealthImportCategory> = []
    @Published private(set) var sharingLoaded = false
    @Published private(set) var isUpdatingSharing = false
    @Published private(set) var sharingMessage = "Sharing is off until you choose categories below."
    @Published private(set) var message = "Choose the information you want to view, then allow access in Apple Health."
    let detectionNotifications: WorkoutDetectionNotificationStore
    private let reader: any AppleHealthImportReading
    private let defaults: UserDefaults
    private let repository: (any AppleHealthImportRepository)?
    private var generation = 0
    private var sharingRevision = 0
    @Published private(set) var automaticWorkoutSyncEnabled = false
    @Published private(set) var backgroundSyncMessage = "Automatic workout import is off."
    private var refreshTask: Task<Void, Never>?
    private var refreshRequested = false
    private var refreshID = UUID()
    private var backgroundConfigurationTask: Task<Void, Never>?
    private var lastAttempt: Date?
    var isAvailable: Bool { reader.isAvailable }

    init(reader: (any AppleHealthImportReading)? = nil, defaults: UserDefaults = .standard,
         repository: (any AppleHealthImportRepository)? = nil,
         detectionNotifications: WorkoutDetectionNotificationStore? = nil) {
        self.reader = reader ?? AppleHealthImportReader()
        self.defaults = defaults
        self.detectionNotifications = detectionNotifications ?? (reader == nil
            ? WorkoutDetectionNotificationStore(defaults: defaults)
            : WorkoutDetectionNotificationStore.fixture(defaults: defaults))
        // Injected readers used by previews/tests never reach a real backend.
        self.repository = repository ?? (reader == nil ? SupabaseAppleHealthImportRepository() : nil)
    }

    /// Call with nil on sign-out and the signed-in account on authentication changes.
    /// Category/notification choices and deduplication IDs are stored locally;
    /// readable Health measurements stay in memory.
    func configure(account: SignedInAccount?) {
        let account = account?.isCoach == false ? account : nil
        guard self.account != account else { return }
        generation += 1
        refreshTask?.cancel()
        refreshTask = nil
        refreshID = UUID()
        refreshRequested = false
        reader.stopObserving()
        self.account = account
        detectionNotifications.configure(accountID: account?.id)
        snapshot = nil; refreshedAt = nil; lastAttempt = nil; isWorking = false
        sharedCategories = []; sharingLoaded = false; isUpdatingSharing = false
        sharingMessage = "Choose which categories to share with your FWB account and coach."
        selectedCategories = Set((account.flatMap { defaults.stringArray(forKey: key($0)) } ?? []).compactMap(AppleHealthImportCategory.init(rawValue:)))
        automaticWorkoutSyncEnabled = account.map { defaults.bool(forKey: automaticKey($0)) } == true
            && selectedCategories.contains(.workouts)
        message = "Choose the information you want to view, then allow access in Apple Health."
        observe()
        scheduleBackgroundDelivery()
    }

    func select(_ category: AppleHealthImportCategory, enabled: Bool) {
        guard let account, !isWorking, !isUpdatingSharing else { return }
        if enabled { selectedCategories.insert(category) } else { selectedCategories.remove(category) }
        defaults.set(selectedCategories.map(\.rawValue), forKey: key(account))
        snapshot = snapshot?.filtered(to: selectedCategories)
        if !selectedCategories.contains(.workouts) {
            automaticWorkoutSyncEnabled = false
            defaults.removeObject(forKey: automaticKey(account))
            detectionNotifications.clear()
        }
        observe()
        scheduleBackgroundDelivery()
    }

    func requestAccess() async {
        guard !selectedCategories.isEmpty, !isWorking, account != nil else { return }
        let token = generation
        isWorking = true
        do {
            try await reader.requestAccess(to: selectedCategories)
            guard token == generation else { return }
            // Prompt completion does not reveal whether read access was granted.
            message = "Health permission choices saved. Checking for available information…"
            // Queries installed before consent can fail; install fresh observers.
            observe()
            scheduleBackgroundDelivery()
            isWorking = false
            await refresh(force: true)
        } catch {
            guard token == generation else { return }
            isWorking = false
            message = "Apple Health could not be opened. Try again on your iPhone."
        }
    }

    /// Register synchronously during launch, before a background Health delivery.
    /// The existing verified-client receipt must match the locally restored session;
    /// cloud writes still validate identity and consent with the server.
    func restoreObservationAtLaunch() {
        let account = VerifiedClientSessionStore(defaults: defaults)
            .verifiedClient(for: AppConfiguration.supabase.auth.currentSession)
        configure(account: account)
        if account == nil { scheduleBackgroundDelivery() }
    }

    func setAutomaticWorkoutSync(_ enabled: Bool) async {
        guard let account, !isWorking, !isUpdatingSharing,
              !enabled || (isAvailable && selectedCategories.contains(.workouts)) else { return }
        let token = generation
        automaticWorkoutSyncEnabled = enabled
        defaults.set(enabled, forKey: automaticKey(account))
        await scheduleBackgroundDelivery().value
        guard token == generation, !Task.isCancelled else { return }
        if enabled { await refresh(force: true) }
    }

    func refresh(force: Bool = false, now: Date = Date()) async {
        guard let account, !selectedCategories.isEmpty, !isUpdatingSharing else { return }
        // Deliveries arriving during a read require another pass. All callers await
        // the same drain so HealthKit completion is not acknowledged prematurely.
        if let refreshTask {
            if force { refreshRequested = true }
            await awaitRefresh(refreshTask, id: refreshID)
            return
        }
        guard !isWorking else { return } // Permission prompt owns this state.
        guard force || defaults.bool(forKey: pendingKey(account)) || lastAttempt == nil
                || now.timeIntervalSince(lastAttempt!) > 180 else { return }
        let token = generation
        isWorking = true
        let id = UUID()
        refreshID = id
        let task = Task { [weak self] in
            guard let self else { return }
            var passDate = now
            repeat {
                refreshRequested = false
                lastAttempt = passDate
                defaults.set(true, forKey: pendingKey(account))
                let succeeded = await readAndSync(now: passDate, token: token)
                guard token == generation, !Task.isCancelled else { return }
                if succeeded && !refreshRequested { defaults.removeObject(forKey: pendingKey(account)) }
                passDate = Date()
            } while refreshRequested
            isWorking = false
            refreshTask = nil
        }
        refreshTask = task
        await awaitRefresh(task, id: id)
    }

    private func awaitRefresh(_ task: Task<Void, Never>, id: UUID) async {
        await withTaskCancellationHandler {
            await task.value
        } onCancel: {
            Task { @MainActor [weak self] in
                guard let self, refreshID == id else { return }
                task.cancel()
                refreshTask = nil
                refreshID = UUID()
                refreshRequested = false
                isWorking = false
                // Leave the pending marker for the next delivery or app activation.
            }
        }
    }

    private func readAndSync(now: Date, token: Int) async -> Bool {
        do {
            let result = try await reader.read(categories: selectedCategories, now: now)
            guard token == generation, !Task.isCancelled else { return false }
            snapshot = result; refreshedAt = now
            if selectedCategories.contains(.workouts), let account {
                await detectionNotifications.process(workouts: result.workouts, accountID: account.id, now: now)
                guard token == generation, !Task.isCancelled else { return false }
            }
            message = result.workouts.isEmpty && result.daily.isEmpty
                ? "No readable information in the last 30 days. You may have no records, or Apple Health access may be off."
                : "Available information refreshed. Missing values mean no readable data; they are not zero."
            if !sharingLoaded { await loadSharing() }
            guard token == generation, !Task.isCancelled else { return false }
            let consented = sharedCategories.intersection(selectedCategories)
            if let repository {
                guard sharingLoaded else { return false }
                if !consented.isEmpty, let account {
                    do {
                        try await repository.sync(result, categories: consented, account: account)
                        guard token == generation, !Task.isCancelled else { return false }
                        sharingMessage = "Selected information synced to your FWB account and coach."
                    } catch {
                        guard token == generation, !Task.isCancelled else { return false }
                        sharingMessage = "Device readings refreshed, but sharing could not finish. FWB will retry when active."
                        return false
                    }
                }
            }
            return true
        } catch {
            guard token == generation, !Task.isCancelled else { return false }
            message = "The refresh did not finish. Previously loaded information is still shown. FWB will retry when active."
            return false
        }
    }

    func clearLocalData() {
        generation += 1
        refreshTask?.cancel()
        refreshTask = nil
        refreshID = UUID()
        refreshRequested = false
        reader.stopObserving()
        if let account {
            defaults.removeObject(forKey: key(account))
            defaults.removeObject(forKey: automaticKey(account))
            defaults.removeObject(forKey: pendingKey(account))
        }
        automaticWorkoutSyncEnabled = false
        detectionNotifications.clear()
        scheduleBackgroundDelivery()
        selectedCategories = []; snapshot = nil; refreshedAt = nil; lastAttempt = nil; isWorking = false
        message = "Apple Health viewing is off and the local preview was cleared. Your records in Apple Health are unchanged."
    }

    func loadSharing() async {
        guard let account, let repository, !isUpdatingSharing else { return }
        let token = generation
        let revision = sharingRevision
        do {
            let categories = try await repository.sharedCategories(account: account)
            guard token == generation, revision == sharingRevision, !Task.isCancelled else { return }
            sharedCategories = categories; sharingLoaded = true
            sharingMessage = categories.isEmpty ? "Sharing is off." : "Only selected categories are shared. Turn off a category to delete its imported FWB data."
        } catch {
            guard token == generation, revision == sharingRevision, !Task.isCancelled else { return }
            sharingLoaded = false
            sharingMessage = "Sharing is unavailable. Your device readings remain available. Try again later."
        }
    }

    /// Called only after the user confirms the category and FWB/coach destination.
    func setSharing(_ categories: Set<AppleHealthImportCategory>) async {
        guard let account, let repository, sharingLoaded, !isUpdatingSharing, !isWorking,
              categories.subtracting(sharedCategories).isSubset(of: selectedCategories) else { return }
        let token = generation
        sharingRevision += 1
        isUpdatingSharing = true
        do {
            try await repository.setSharedCategories(categories, account: account)
            guard token == generation else { return }
            sharedCategories = categories
            sharingMessage = categories.isEmpty ? "Sharing stopped and imported FWB data deleted. Apple Health and manual logs are unchanged." : "Sharing choices saved. Refreshing selected information…"
            isUpdatingSharing = false
            if !categories.isEmpty { await refresh(force: true) }
        } catch {
            guard token == generation else { return }
            isUpdatingSharing = false
            // A lost response can hide a successful revoke. Reconcile with the server.
            await loadSharing()
            guard token == generation else { return }
            sharingMessage = "Could not confirm the change. The switches show the latest confirmed sharing choices; try again."
        }
    }

    private func key(_ account: SignedInAccount) -> String { "appleHealthReadCategories.\(account.id.uuidString.lowercased())" }
    private func automaticKey(_ account: SignedInAccount) -> String { "appleHealthAutomaticWorkouts.\(account.id.uuidString.lowercased())" }
    private func pendingKey(_ account: SignedInAccount) -> String { "appleHealthPendingRefresh.\(account.id.uuidString.lowercased())" }

    @discardableResult
    private func scheduleBackgroundDelivery() -> Task<Void, Never> {
        let previous = backgroundConfigurationTask
        let token = generation
        let enabled = account != nil && automaticWorkoutSyncEnabled && selectedCategories.contains(.workouts)
        let task = Task { [weak self] in
            await previous?.value
            guard let self, token == generation else { return }
            do {
                try await reader.setBackgroundWorkoutDelivery(enabled: enabled)
                guard token == generation else { return }
                backgroundSyncMessage = enabled
                    ? "Automatic import is on. iOS decides when background updates arrive; opening FWB also refreshes workouts."
                    : "Automatic background import is off. Workouts still refresh when you open FWB or tap Sync now."
            } catch {
                guard token == generation else { return }
                backgroundSyncMessage = "Background updates are unavailable. Open FWB Training or tap Sync now to import workouts."
            }
        }
        backgroundConfigurationTask = task
        return task
    }

    private func observe() {
        let token = generation
        reader.observe(categories: selectedCategories) { [weak self] in
            guard let self, token == generation, let account else { return }
            // This marker contains no Health values. A bounded observer delivery
            // can finish safely; failed/offline reads are retried on activation.
            defaults.set(true, forKey: pendingKey(account))
            await refresh(force: true)
        }
    }
}
