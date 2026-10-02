import XCTest
@testable import FWBCoach

@MainActor
final class AppleHealthImportTests: XCTestCase {
    private let first = SignedInAccount(id: UUID(), email: "first@example.com")
    private let second = SignedInAccount(id: UUID(), email: "second@example.com")
    private let date = Date(timeIntervalSince1970: 1_790_300_000)

    func testMissingMeasurementsStayMissingWhileRealZeroRemainsZero() {
        XCTAssertNil(AppleHealthImportRules.valid(nil, in: 0...200_000))
        XCTAssertEqual(AppleHealthImportRules.valid(0, in: 0...200_000), 0)
        for value in [Double.nan, Double.infinity, -1, 200_001] {
            XCTAssertNil(AppleHealthImportRules.valid(value, in: 0...200_000))
        }
    }

    func testFWBWorkoutExclusionCoversPhoneWatchAndSyncIdentifiers() {
        XCTAssertTrue(AppleHealthImportRules.isFWBWorkout(bundleIdentifier: "com.benjaminbenz.fwbcoach", syncIdentifier: nil))
        XCTAssertTrue(AppleHealthImportRules.isFWBWorkout(bundleIdentifier: "com.benjaminbenz.fwbcoach.watchapp", syncIdentifier: nil))
        XCTAssertTrue(AppleHealthImportRules.isFWBWorkout(bundleIdentifier: "unknown", syncIdentifier: "com.benjaminbenz.fwbcoach.strength.123"))
        XCTAssertFalse(AppleHealthImportRules.isFWBWorkout(bundleIdentifier: "com.apple.workout", syncIdentifier: nil))
    }

    func testSleepUnionPreventsDuplicateSourcesAndClipsMidnight() {
        let start = date
        let window = DateInterval(start: start, duration: 3_600)
        let sleep = [DateInterval(start: start.addingTimeInterval(-600), duration: 1_800),
                     DateInterval(start: start.addingTimeInterval(600), duration: 1_800),
                     DateInterval(start: start.addingTimeInterval(3_000), duration: 1_200)]
        XCTAssertEqual(AppleHealthImportRules.minutesInUnion(sleep, clippedTo: window), 50)
        XCTAssertNil(AppleHealthImportRules.minutesInUnion([], clippedTo: window))
    }

    func testFilteringRemovesUnselectedDataWithoutInventingValues() {
        let row = AppleHealthDailySummary(date: "2026-09-25", steps: 5000, sleepMinutes: 420, restingHeartRate: 60, hrvMS: 55, bodyWeightKG: 80, bodyWeightSampleID: UUID())
        let activity = row.filtered(to: [.activity])
        XCTAssertEqual(activity.steps, 5000)
        XCTAssertNil(activity.sleepMinutes)
        XCTAssertNil(activity.hrvMS)
        XCTAssertNil(activity.restingHeartRate)
        XCTAssertNil(activity.bodyWeightKG)
        XCTAssertNil(activity.bodyWeightSampleID)
        XCTAssertFalse(row.filtered(to: []).hasData)
    }

    func testReadAccessAndAccountStartOptedOut() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        await store.refresh(force: true)
        await store.requestAccess()
        XCTAssertTrue(store.selectedCategories.isEmpty)
        XCTAssertEqual(reader.readCount, 0)
        XCTAssertEqual(reader.requestCount, 0)
    }

    func testPermissionPromptCompletionDoesNotClaimReadPermission() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.activity, enabled: true)
        await store.requestAccess()
        XCTAssertEqual(reader.requestCount, 1)
        XCTAssertEqual(reader.observeCount, 3) // Configure, select, completed permission prompt.
        XCTAssertTrue(store.message.contains("No readable information"))
        XCTAssertFalse(store.message.contains("Connected"))
        XCTAssertEqual(store.snapshot?.daily.count, 0)
    }

    func testAccountChangeClearsInMemoryDataAndDoesNotCarryOptIn() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.activity, enabled: true)
        reader.result.daily = [AppleHealthDailySummary(date: "2026-09-25", steps: 8000)]
        await store.refresh(force: true)
        XCTAssertNotNil(store.snapshot)
        store.configure(account: second)
        XCTAssertNil(store.snapshot)
        XCTAssertTrue(store.selectedCategories.isEmpty)
        store.configure(account: first)
        XCTAssertEqual(store.selectedCategories, [.activity])
        XCTAssertNil(store.snapshot)
    }

    func testTurningOffCategoryImmediatelyClearsItsPreview() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.bodyWeight, enabled: true)
        reader.result.daily = [AppleHealthDailySummary(date: "2026-09-25", bodyWeightKG: 80)]
        await store.refresh(force: true)
        store.select(.bodyWeight, enabled: false)
        XCTAssertEqual(store.snapshot?.daily.count, 0)
    }

    func testRefreshThrottleAndExplicitRefresh() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.activity, enabled: true)
        await store.refresh(now: date)
        await store.refresh(now: date.addingTimeInterval(30))
        XCTAssertEqual(reader.readCount, 1)
        await store.refresh(force: true, now: date.addingTimeInterval(31))
        XCTAssertEqual(reader.readCount, 2)
    }

    func testFailedRefreshPreservesPreviouslyLoadedReadings() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.activity, enabled: true)
        reader.result.daily = [AppleHealthDailySummary(date: "2026-09-25", steps: 8000)]
        await store.refresh(force: true)
        reader.failure = true
        await store.refresh(force: true)
        XCTAssertEqual(store.snapshot?.daily.first?.steps, 8000)
        XCTAssertTrue(store.message.contains("did not finish"))
        XCTAssertFalse(store.isWorking)
    }

    func testClearingPreviewStopsObservationAndRemovesDeviceOptIn() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.activity, enabled: true)
        await store.refresh(force: true)
        store.clearLocalData()
        XCTAssertNil(store.snapshot)
        XCTAssertTrue(store.selectedCategories.isEmpty)
        XCTAssertNil(reader.onChanged)
        store.configure(account: second)
        store.configure(account: first)
        XCTAssertTrue(store.selectedCategories.isEmpty)
    }

    func testLateReadCannotPopulateDifferentAccount() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.activity, enabled: true)
        reader.shouldSuspend = true
        let task = Task { await store.refresh(force: true) }
        while reader.continuation == nil { await Task.yield() }
        store.configure(account: second)
        reader.continuation?.resume(returning: AppleHealthImportSnapshot(since: date, daily: [AppleHealthDailySummary(date: "2026-09-25", steps: 999)]))
        await task.value
        XCTAssertNil(store.snapshot)
        XCTAssertEqual(store.account, second)
        XCTAssertFalse(store.isWorking)
    }

    func testAutomaticImportsDefaultOffAndRequireWorkoutSelection() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        await store.setAutomaticWorkoutSync(true)
        XCTAssertFalse(store.automaticWorkoutSyncEnabled)
        store.select(.workouts, enabled: true)
        await store.setAutomaticWorkoutSync(true)
        XCTAssertTrue(store.automaticWorkoutSyncEnabled)
        XCTAssertEqual(reader.backgroundChanges.last, true)
        XCTAssertEqual(reader.requestCount, 0) // Never invent Health or cloud consent.
        XCTAssertTrue(store.sharedCategories.isEmpty)
    }

    func testAutomaticChoiceIsAccountScopedAndClearedWithWorkoutSelection() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.workouts, enabled: true)
        await store.setAutomaticWorkoutSync(true)
        store.configure(account: second)
        XCTAssertFalse(store.automaticWorkoutSyncEnabled)
        store.configure(account: first)
        XCTAssertTrue(store.automaticWorkoutSyncEnabled)
        store.select(.workouts, enabled: false)
        XCTAssertFalse(store.automaticWorkoutSyncEnabled)
        await store.setAutomaticWorkoutSync(false)
        XCTAssertEqual(reader.backgroundChanges.last, false)
        store.configure(account: second)
        store.configure(account: first)
        XCTAssertFalse(store.automaticWorkoutSyncEnabled)
    }

    func testBackgroundFailureKeepsForegroundImportAvailable() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.workouts, enabled: true)
        reader.backgroundFailure = true
        await store.setAutomaticWorkoutSync(true)
        XCTAssertTrue(store.backgroundSyncMessage.contains("unavailable"))
        XCTAssertEqual(reader.readCount, 1)
        XCTAssertNotNil(store.snapshot)
    }

    func testObserverWaitsForReadAndDrainsChangeArrivingDuringRead() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.workouts, enabled: true)
        reader.shouldSuspend = true
        let firstRead = Task { await store.refresh(force: true, now: date) }
        while reader.continuation == nil { await Task.yield() }
        var completed = false
        let delivery = Task { await reader.onChanged?(); completed = true }
        // Let the delivery join the in-flight read.
        for _ in 0..<10 { await Task.yield() }
        XCTAssertFalse(completed)
        reader.shouldSuspend = false
        reader.continuation?.resume(returning: reader.result)
        await firstRead.value
        await delivery.value
        XCTAssertEqual(reader.readCount, 2)
        XCTAssertGreaterThan(reader.readDates[1], reader.readDates[0])
        XCTAssertTrue(completed)
        XCTAssertFalse(store.isWorking)
    }

    func testFailedReadRetriesOnForegroundWithoutThrottle() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.workouts, enabled: true)
        reader.failure = true
        await store.refresh(now: date)
        reader.failure = false
        await store.refresh(now: date.addingTimeInterval(1))
        XCTAssertEqual(reader.readCount, 2)
        XCTAssertNotNil(store.snapshot)
    }

    func testStaleObserverCannotReadForAnotherAccount() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.workouts, enabled: true)
        let stale = reader.onChanged
        store.configure(account: second)
        store.select(.workouts, enabled: true)
        await stale?()
        XCTAssertEqual(reader.readCount, 0)
    }

    func testCancelledDeliveryLeavesRetryAndRejectsLateRead() async {
        let (store, reader) = makeStore()
        store.configure(account: first)
        store.select(.workouts, enabled: true)
        reader.shouldSuspend = true
        let delivery = Task { await reader.onChanged?() }
        while reader.continuation == nil { await Task.yield() }
        delivery.cancel()
        while store.isWorking { await Task.yield() }
        reader.shouldSuspend = false
        reader.continuation?.resume(returning: reader.result)
        await delivery.value
        XCTAssertNil(store.snapshot)
        await store.refresh()
        XCTAssertEqual(reader.readCount, 2)
        XCTAssertNotNil(store.snapshot)
    }

    func testCoachAccountNeverReadsDeviceHealth() async {
        let (store, reader) = makeStore()
        store.configure(account: SignedInAccount(id: first.id, email: first.email, role: .coach))
        store.select(.workouts, enabled: true)
        await store.refresh(force: true)
        XCTAssertNil(store.account)
        XCTAssertEqual(reader.readCount, 0)
    }

    func testDisablingWorkoutReadsAlsoDisablesDetectionNotifications() async {
        let (store, _) = makeStore()
        store.configure(account: first)
        store.select(.workouts, enabled: true)
        await store.detectionNotifications.setEnabled(true)
        XCTAssertTrue(store.detectionNotifications.isEnabled)
        store.select(.workouts, enabled: false)
        XCTAssertFalse(store.detectionNotifications.isEnabled)
    }

    func testClearingHealthPreviewDisablesDetectionNotifications() async {
        let (store, _) = makeStore()
        store.configure(account: first)
        store.select(.workouts, enabled: true)
        await store.detectionNotifications.setEnabled(true)
        store.clearLocalData()
        XCTAssertFalse(store.detectionNotifications.isEnabled)
    }

    private func makeStore() -> (AppleHealthImportStore, FakeHealthReader) {
        let defaults = UserDefaults(suiteName: "AppleHealthImportTests.\(UUID())")!
        let reader = FakeHealthReader()
        return (AppleHealthImportStore(reader: reader, defaults: defaults), reader)
    }
}

@MainActor
private final class FakeHealthReader: AppleHealthImportReading {
    var isAvailable = true
    var readCount = 0
    var readDates: [Date] = []
    var observeCount = 0
    var backgroundChanges: [Bool] = []
    var backgroundFailure = false
    var requestCount = 0
    var failure = false
    var shouldSuspend = false
    var result = AppleHealthImportSnapshot(since: Date())
    var onChanged: (@MainActor () async -> Void)?
    var continuation: CheckedContinuation<AppleHealthImportSnapshot, Error>?
    func requestAccess(to categories: Set<AppleHealthImportCategory>) async throws { requestCount += 1 }
    func read(categories: Set<AppleHealthImportCategory>, now: Date) async throws -> AppleHealthImportSnapshot {
        readCount += 1
        readDates.append(now)
        if failure { throw AppleHealthImportError.unavailable }
        if shouldSuspend { return try await withCheckedThrowingContinuation { continuation = $0 } }
        return result
    }
    func observe(categories: Set<AppleHealthImportCategory>, changed: @escaping @MainActor () async -> Void) { observeCount += 1; onChanged = changed }
    func stopObserving() { onChanged = nil }
    func setBackgroundWorkoutDelivery(enabled: Bool) async throws {
        backgroundChanges.append(enabled)
        if backgroundFailure { throw AppleHealthImportError.unavailable }
    }
}

@MainActor
final class AppleHealthSharingTests: XCTestCase {
    let account = SignedInAccount(id: UUID(), email: "fixture@example.test")
    private func makeStore() -> (AppleHealthImportStore, SharingReader, SharingRepository) {
        let reader = SharingReader(), repo = SharingRepository()
        let store = AppleHealthImportStore(reader: reader, defaults: UserDefaults(suiteName: "SharingTests.\(UUID())")!, repository: repo)
        store.configure(account: account)
        return (store, reader, repo)
    }
    func testReadingHealthNeverEnablesSharing() async {
        let (store, _, repo) = makeStore()
        store.select(.activity, enabled: true)
        await store.requestAccess()
        XCTAssertTrue(store.sharedCategories.isEmpty)
        XCTAssertEqual(repo.uploads.count, 0)
        XCTAssertEqual(repo.writes, 0)
    }
    func testExplicitSharingUploadsOnlySelectedCategories() async {
        let (store, _, repo) = makeStore()
        store.select(.activity, enabled: true)
        store.select(.bodyWeight, enabled: true)
        await store.loadSharing()
        await store.setSharing([.activity])
        XCTAssertEqual(repo.shared, [.activity])
        XCTAssertEqual(repo.uploads.count, 1)
        let payload = AppleHealthSnapshotUpload(snapshot: repo.uploads[0], categories: [.activity], accountID: account.id)
        XCTAssertEqual(payload.p_expected_user_id, account.id)
        XCTAssertEqual(payload.p_daily[0].steps, 1000)
        XCTAssertNil(payload.p_daily[0].bodyWeightKG)
        XCTAssertTrue(payload.p_workouts.isEmpty)
    }
    func testCannotShareCategoryThatWasNotSelectedForReading() async {
        let (store, _, repo) = makeStore()
        await store.loadSharing()
        await store.setSharing([.recovery])
        XCTAssertEqual(repo.writes, 0)
    }
    func testDisableSharingDoesNotReadHealthAgain() async {
        let (store, reader, repo) = makeStore()
        store.select(.activity, enabled: true)
        await store.loadSharing()
        await store.setSharing([.activity])
        let previous = reader.readCount
        await store.setSharing([])
        XCTAssertEqual(repo.shared, [])
        XCTAssertEqual(reader.readCount, previous)
        XCTAssertTrue(store.sharedCategories.isEmpty)
    }
    func testUnknownSharingStatusBlocksWrites() async {
        let (store, _, repo) = makeStore()
        store.select(.activity, enabled: true)
        repo.failLoad = true
        await store.loadSharing()
        await store.setSharing([.activity])
        XCTAssertFalse(store.sharingLoaded)
        XCTAssertEqual(repo.writes, 0)
    }
    func testLostRevokeResponseReconcilesServerConsent() async {
        let (store, _, repo) = makeStore()
        store.select(.activity, enabled: true)
        await store.loadSharing()
        await store.setSharing([.activity])
        repo.failAfterWrite = true
        await store.setSharing([])
        XCTAssertEqual(store.sharedCategories, [])
        XCTAssertFalse(store.isUpdatingSharing)
        XCTAssertTrue(store.sharingLoaded)
    }
    func testFailedCloudUploadRetriesWithoutWaitingForThrottle() async {
        let (store, _, repo) = makeStore()
        store.select(.activity, enabled: true)
        await store.loadSharing()
        await store.setSharing([.activity])
        let before = repo.uploads.count
        repo.failSync = true
        await store.refresh(force: true)
        repo.failSync = false
        await store.refresh()
        XCTAssertEqual(repo.uploads.count, before + 1)
    }

    func testAccountChangeDiscardsLateConsentLoad() async {
        let (store, _, repo) = makeStore()
        repo.suspendLoad = true
        let task = Task { await store.loadSharing() }
        while repo.continuation == nil { await Task.yield() }
        store.configure(account: SignedInAccount(id: UUID(), email: "other@example.test"))
        repo.continuation?.resume(returning: [.bodyWeight])
        await task.value
        XCTAssertFalse(store.sharingLoaded)
        XCTAssertTrue(store.sharedCategories.isEmpty)
    }
}
@MainActor
private final class SharingReader: AppleHealthImportReading {
    var isAvailable = true
    var readCount = 0
    func requestAccess(to categories: Set<AppleHealthImportCategory>) async throws {}
    func read(categories: Set<AppleHealthImportCategory>, now: Date) async throws -> AppleHealthImportSnapshot {
        readCount += 1
        return AppleHealthImportSnapshot(since: now.addingTimeInterval(-86400), daily: [AppleHealthDailySummary(date: AppleHealthImportRules.day(now), steps: 1000, bodyWeightKG: 80)])
    }
    func observe(categories: Set<AppleHealthImportCategory>, changed: @escaping @MainActor () async -> Void) {}
    func stopObserving() {}
}
@MainActor
private final class SharingRepository: AppleHealthImportRepository {
    var shared: Set<AppleHealthImportCategory> = []
    var uploads: [AppleHealthImportSnapshot] = []
    var writes = 0
    var failLoad = false
    var failAfterWrite = false
    var suspendLoad = false
    var failSync = false
    var continuation: CheckedContinuation<Set<AppleHealthImportCategory>, Error>?
    func sharedCategories(account: SignedInAccount) async throws -> Set<AppleHealthImportCategory> {
        if failLoad { throw AppleHealthImportError.unavailable }
        if suspendLoad { return try await withCheckedThrowingContinuation { continuation = $0 } }
        return shared
    }
    func setSharedCategories(_ categories: Set<AppleHealthImportCategory>, account: SignedInAccount) async throws {
        writes += 1; shared = categories
        if failAfterWrite { throw AppleHealthImportError.unavailable }
    }
    func sync(_ snapshot: AppleHealthImportSnapshot, categories: Set<AppleHealthImportCategory>, account: SignedInAccount) async throws {
        if failSync { throw AppleHealthImportError.unavailable }
        uploads.append(snapshot.filtered(to: categories))
    }
}

@MainActor
final class AppleHealthObserverDeliveryTests: XCTestCase {
    func testCompletionWaitsForProcessingAndFiresOnlyOnce() async {
        var finishCount = 0
        var continuation: CheckedContinuation<Void, Never>?
        let delivery = AppleHealthObserverDelivery { finishCount += 1 }
        delivery.start { await withCheckedContinuation { continuation = $0 } }
        while continuation == nil { await Task.yield() }
        XCTAssertEqual(finishCount, 0)
        continuation?.resume()
        while finishCount == 0 { await Task.yield() }
        delivery.cancel()
        XCTAssertEqual(finishCount, 1)
    }

    func testTimeoutCompletesAndLateProcessingCannotCompleteTwice() async {
        var finishCount = 0
        var continuation: CheckedContinuation<Void, Never>?
        let delivery = AppleHealthObserverDelivery(timeoutNanoseconds: 1_000_000) { finishCount += 1 }
        delivery.start { await withCheckedContinuation { continuation = $0 } }
        while continuation == nil || finishCount == 0 { await Task.yield() }
        XCTAssertEqual(finishCount, 1)
        continuation?.resume()
        for _ in 0..<10 { await Task.yield() }
        delivery.cancel()
        XCTAssertEqual(finishCount, 1)
    }

    func testStopBeforeProcessingStillAcknowledgesOnce() {
        var finishCount = 0
        let delivery = AppleHealthObserverDelivery { finishCount += 1 }
        delivery.cancel()
        delivery.start { XCTFail("Cancelled delivery must not start") }
        delivery.cancel()
        XCTAssertEqual(finishCount, 1)
    }
}
