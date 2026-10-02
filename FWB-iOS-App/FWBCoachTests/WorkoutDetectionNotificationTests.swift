import XCTest
@testable import FWBCoach

@MainActor
final class WorkoutDetectionNotificationTests: XCTestCase {
    private let accountID = UUID()
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    func testStartsOffAndConfigureDoesNotRequestPermission() async {
        let (store, client, _) = makeStore()
        store.configure(accountID: accountID)
        await store.process(workouts: [workout(endingAt: now)], accountID: accountID, now: now)
        XCTAssertFalse(store.isEnabled)
        XCTAssertEqual(client.authorizationRequests, 0)
        XCTAssertTrue(client.plans.isEmpty)
    }

    func testEnableSuppressesKnownAndHistoricalWorkouts() async {
        let (store, client, _) = makeStore()
        let old = workout(endingAt: now.addingTimeInterval(-60))
        let known = workout(endingAt: now)
        store.configure(accountID: accountID)
        await store.setEnabled(true, knownWorkouts: [known], now: now)
        await store.process(workouts: [old, known], accountID: accountID, now: now)
        XCTAssertTrue(store.isEnabled)
        XCTAssertEqual(client.authorizationRequests, 1)
        XCTAssertTrue(client.plans.isEmpty)
    }

    func testFreshWorkoutSchedulesGenericBannerWithAccountScopedPayload() async throws {
        let (store, client, _) = makeStore()
        let fresh = workout(endingAt: now.addingTimeInterval(60))
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(61))
        let plan = try XCTUnwrap(client.plans.first)
        XCTAssertEqual(plan.title, "Workout detected")
        XCTAssertEqual(plan.body, "New activity is available in your FWB Training logs. Tap to view.")
        XCTAssertEqual(plan.payload.accountID, accountID)
        XCTAssertEqual(plan.payload.healthkitID, fresh.healthkitID)
        XCTAssertEqual(Set(plan.payload.userInfo.keys.compactMap { $0 as? String }), ["kind", "account_id", "healthkit_id"])
        XCTAssertTrue(plan.identifier.contains(accountID.uuidString.lowercased()))
        XCTAssertTrue(plan.identifier.contains(fresh.healthkitID.uuidString.lowercased()))
        XCTAssertEqual(WorkoutDetectionNotificationPayload.parse(plan.payload.userInfo), plan.payload)
    }

    func testGroupedBatchUsesNewestWorkoutAndDeduplicatesAcrossRelaunch() async throws {
        let (store, client, defaults) = makeStore()
        let first = workout(endingAt: now.addingTimeInterval(10))
        let latest = workout(endingAt: now.addingTimeInterval(20))
        let rows = [latest, first, first]
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        await store.process(workouts: rows, accountID: accountID, now: now.addingTimeInterval(30))
        await store.process(workouts: rows, accountID: accountID, now: now.addingTimeInterval(31))
        XCTAssertEqual(client.plans.count, 1)
        XCTAssertEqual(client.plans.first?.payload.healthkitID, latest.healthkitID)

        let reloaded = WorkoutDetectionNotificationStore(defaults: defaults, client: client)
        reloaded.configure(accountID: accountID)
        XCTAssertTrue(reloaded.isEnabled)
        await reloaded.process(workouts: rows, accountID: accountID, now: now.addingTimeInterval(32))
        XCTAssertEqual(client.plans.count, 1)
        XCTAssertEqual(client.authorizationRequests, 1)
    }

    func testFutureAndInvalidWorkoutsAreNotNotified() async {
        let (store, client, _) = makeStore()
        var invalid = workout(endingAt: now.addingTimeInterval(10))
        invalid.startedAt = now.addingTimeInterval(11)
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        await store.process(workouts: [invalid, workout(endingAt: now.addingTimeInterval(60))], accountID: accountID, now: now.addingTimeInterval(30))
        XCTAssertTrue(client.plans.isEmpty)
    }

    func testDeniedPermissionStaysOffAndCanBeRetried() async {
        let (store, client, _) = makeStore()
        store.configure(accountID: accountID)
        client.granted = false
        await store.setEnabled(true, now: now)
        XCTAssertFalse(store.isEnabled)
        XCTAssertFalse(store.isUpdatingAuthorization)
        XCTAssertTrue(store.message.contains("Settings"))
        client.granted = true
        await store.setEnabled(true, now: now)
        XCTAssertTrue(store.isEnabled)
        XCTAssertEqual(client.authorizationRequests, 2)
    }

    func testSchedulingFailureRetriesWithoutMarkingWorkoutAsSeen() async {
        let (store, client, _) = makeStore()
        let fresh = workout(endingAt: now.addingTimeInterval(10))
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        client.scheduleFailure = true
        await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(20))
        XCTAssertTrue(store.message.contains("try again"))
        client.scheduleFailure = false
        await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(21))
        XCTAssertEqual(client.plans.count, 2)
        XCTAssertEqual(client.activeIdentifiers.count, 1)
        XCTAssertTrue(store.message.isEmpty)
    }

    func testSystemPermissionRevocationDoesNotConsumeWorkoutOrAskAgain() async {
        let (store, client, _) = makeStore()
        let fresh = workout(endingAt: now.addingTimeInterval(10))
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        client.authorized = false
        await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(20))
        XCTAssertTrue(client.plans.isEmpty)
        XCTAssertTrue(store.message.contains("Settings"))
        client.authorized = true
        await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(21))
        XCTAssertEqual(client.plans.count, 1)
        XCTAssertEqual(client.authorizationRequests, 1)
    }

    func testOptOutRemovesOnlyFeatureNotificationsAndReenableSkipsBacklog() async {
        let (store, client, defaults) = makeStore()
        let fresh = workout(endingAt: now.addingTimeInterval(10))
        client.activeIdentifiers.insert("fwb.rest-timer.complete")
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(20))
        store.clear()
        XCTAssertFalse(store.isEnabled)
        XCTAssertEqual(client.activeIdentifiers, ["fwb.rest-timer.complete"])
        let reloaded = WorkoutDetectionNotificationStore(defaults: defaults, client: client)
        reloaded.configure(accountID: accountID)
        XCTAssertFalse(reloaded.isEnabled)
        let whileDisabled = workout(endingAt: now.addingTimeInterval(25))
        await store.setEnabled(true, now: now.addingTimeInterval(30))
        await store.process(workouts: [fresh, whileDisabled], accountID: accountID, now: now.addingTimeInterval(40))
        XCTAssertEqual(client.plans.count, 1)
    }

    func testAccountSwitchRemovesOldAlertsAndIsolatesPreferencesAndDeduplication() async {
        let (store, client, _) = makeStore()
        let fresh = workout(endingAt: now.addingTimeInterval(10))
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(20))
        let second = UUID()
        store.configure(accountID: second)
        XCTAssertFalse(store.isEnabled)
        XCTAssertTrue(client.activeIdentifiers.isEmpty)
        await store.setEnabled(true, now: now)
        await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(21))
        XCTAssertEqual(client.plans.count, 1)
        await store.process(workouts: [fresh], accountID: second, now: now.addingTimeInterval(21))
        XCTAssertEqual(client.plans.count, 2)
        XCTAssertNotEqual(client.plans[0].identifier, client.plans[1].identifier)
        store.configure(accountID: accountID)
        XCTAssertTrue(store.isEnabled)
        await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(22))
        XCTAssertEqual(client.plans.count, 2)
    }

    func testPermissionCompletionAfterDisableCannotEnableNotifications() async {
        let (store, client, _) = makeStore()
        client.suspendAuthorization = true
        store.configure(accountID: accountID)
        let task = Task { await store.setEnabled(true, now: now) }
        while client.authorizationContinuation == nil { await Task.yield() }
        XCTAssertTrue(store.isUpdatingAuthorization)
        await store.setEnabled(false)
        client.authorizationContinuation?.resume(returning: true)
        await task.value
        XCTAssertFalse(store.isEnabled)
        XCTAssertFalse(store.isUpdatingAuthorization)
    }

    func testPermissionCompletionAfterAccountSwitchCannotEnableOtherAccount() async {
        let (store, client, _) = makeStore()
        client.suspendAuthorization = true
        store.configure(accountID: accountID)
        let task = Task { await store.setEnabled(true, now: now) }
        while client.authorizationContinuation == nil { await Task.yield() }
        store.configure(accountID: UUID())
        client.authorizationContinuation?.resume(returning: true)
        await task.value
        XCTAssertFalse(store.isEnabled)
        store.configure(accountID: accountID)
        XCTAssertFalse(store.isEnabled)
    }

    func testLateScheduleAfterOptOutIsRemovedAgain() async {
        let (store, client, _) = makeStore()
        let fresh = workout(endingAt: now.addingTimeInterval(10))
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        client.suspendScheduling = true
        let task = Task { await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(20)) }
        while client.scheduleContinuation == nil { await Task.yield() }
        store.clear()
        client.scheduleContinuation?.resume()
        await task.value
        XCTAssertFalse(store.isEnabled)
        XCTAssertTrue(client.activeIdentifiers.isEmpty)
        XCTAssertEqual(client.removedIdentifiers.filter { $0 == client.plans.first?.identifier }.count, 2)
    }

    func testCancelledSchedulingRetriesAndDoesNotLeaveDeliveredAlert() async {
        let (store, client, _) = makeStore()
        let fresh = workout(endingAt: now.addingTimeInterval(10))
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        client.suspendScheduling = true
        let task = Task { await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(20)) }
        while client.scheduleContinuation == nil { await Task.yield() }
        task.cancel()
        client.scheduleContinuation?.resume()
        await task.value
        XCTAssertTrue(client.activeIdentifiers.isEmpty)
        client.suspendScheduling = false
        await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(21))
        XCTAssertEqual(client.plans.count, 2)
        XCTAssertEqual(client.activeIdentifiers.count, 1)
    }

    func testLateScheduleAfterAccountSwitchIsRemovedAndDoesNotConsumeOtherAccountWorkout() async {
        let (store, client, _) = makeStore()
        let fresh = workout(endingAt: now.addingTimeInterval(10))
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        client.suspendScheduling = true
        let task = Task { await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(20)) }
        while client.scheduleContinuation == nil { await Task.yield() }
        let second = UUID()
        store.configure(accountID: second)
        await store.setEnabled(true, now: now)
        client.suspendScheduling = false
        client.scheduleContinuation?.resume()
        await task.value
        XCTAssertTrue(client.activeIdentifiers.isEmpty)
        await store.process(workouts: [fresh], accountID: second, now: now.addingTimeInterval(21))
        XCTAssertEqual(client.plans.count, 2)
        XCTAssertEqual(client.activeIdentifiers, [client.plans[1].identifier])
    }

    func testOptOutAfterRelaunchRemovesPersistedFeatureIdentifiers() async {
        let (store, client, defaults) = makeStore()
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        await store.process(workouts: [workout(endingAt: now.addingTimeInterval(10))], accountID: accountID, now: now.addingTimeInterval(20))
        XCTAssertEqual(client.activeIdentifiers.count, 1)
        let reloaded = WorkoutDetectionNotificationStore(defaults: defaults, client: client)
        reloaded.configure(accountID: accountID)
        reloaded.clear()
        XCTAssertTrue(client.activeIdentifiers.isEmpty)
    }

    func testConcurrentRefreshesSerializeAndDeduplicate() async {
        let (store, client, _) = makeStore()
        let fresh = workout(endingAt: now.addingTimeInterval(10))
        store.configure(accountID: accountID)
        await store.setEnabled(true, now: now)
        client.suspendScheduling = true
        let first = Task { await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(20)) }
        while client.scheduleContinuation == nil { await Task.yield() }
        let second = Task { await store.process(workouts: [fresh], accountID: accountID, now: now.addingTimeInterval(21)) }
        for _ in 0..<10 { await Task.yield() }
        XCTAssertEqual(client.plans.count, 1)
        client.suspendScheduling = false
        client.scheduleContinuation?.resume()
        await first.value
        await second.value
        XCTAssertEqual(client.plans.count, 1)
    }

    func testPayloadRejectsOtherKindsAndMalformedAccountIdentifiers() {
        XCTAssertNil(WorkoutDetectionNotificationPayload.parse(["kind": "rest_timer"]))
        XCTAssertNil(WorkoutDetectionNotificationPayload.parse(["kind": "apple_health_workout", "account_id": "invalid", "healthkit_id": UUID().uuidString]))
        XCTAssertNil(WorkoutDetectionNotificationPayload.parse(["kind": "apple_health_workout", "account_id": accountID.uuidString]))
    }

    private func makeStore() -> (WorkoutDetectionNotificationStore, RecordingWorkoutDetectionClient, UserDefaults) {
        let defaults = UserDefaults(suiteName: "WorkoutDetectionNotificationTests.\(UUID())")!
        let client = RecordingWorkoutDetectionClient()
        return (WorkoutDetectionNotificationStore(defaults: defaults, client: client), client, defaults)
    }

    private func workout(endingAt: Date) -> AppleHealthImportedWorkout {
        AppleHealthImportedWorkout(healthkitID: UUID(), activityType: "Running", startedAt: endingAt.addingTimeInterval(-600), endedAt: endingAt, durationSeconds: 600, activeCalories: 100, distanceMeters: 1500, averageHeartRate: 125, sourceName: "Apple Watch")
    }
}

@MainActor
private final class RecordingWorkoutDetectionClient: WorkoutDetectionNotificationClient {
    var granted = true
    var authorized = true
    var authorizationRequests = 0
    var plans: [WorkoutDetectionNotificationPlan] = []
    var activeIdentifiers: Set<String> = []
    var removedIdentifiers: [String] = []
    var scheduleFailure = false
    var suspendAuthorization = false
    var suspendScheduling = false
    var authorizationContinuation: CheckedContinuation<Bool, Never>?
    var scheduleContinuation: CheckedContinuation<Void, Never>?

    func requestAuthorization() async throws -> Bool {
        authorizationRequests += 1
        if suspendAuthorization {
            return await withCheckedContinuation { authorizationContinuation = $0 }
        }
        return granted
    }

    func isAuthorized() async -> Bool { authorized }

    func schedule(_ plan: WorkoutDetectionNotificationPlan) async throws {
        plans.append(plan)
        if scheduleFailure { throw CocoaError(.fileWriteUnknown) }
        if suspendScheduling {
            await withCheckedContinuation { scheduleContinuation = $0 }
        }
        activeIdentifiers.insert(plan.identifier)
    }

    func remove(identifiers: [String]) {
        removedIdentifiers.append(contentsOf: identifiers)
        activeIdentifiers.subtract(identifiers)
    }
}
