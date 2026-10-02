import XCTest
@testable import FWBCoach

@MainActor
final class RestTimerNotificationTests: XCTestCase {
    func testStartAndAdjustUseTheAbsoluteDeadline() {
        let scheduler = RecordingRestTimerScheduler()
        var now = Date(timeIntervalSince1970: 1_800_000_000.25)
        let start = now
        let store = RestTimerStore(notificationScheduler: scheduler, now: { now })
        defer { store.dismiss() }

        store.start(seconds: 60, exerciseName: "Squat", hapticsEnabled: false)
        XCTAssertEqual(scheduler.plan?.deadline, start.addingTimeInterval(60))
        XCTAssertEqual(scheduler.plan?.exerciseName, "Squat")

        now = now.addingTimeInterval(10.4)
        store.adjust(seconds: 15)
        XCTAssertEqual(scheduler.plan?.deadline, start.addingTimeInterval(75))
        XCTAssertEqual(store.remainingSeconds, 65)
        XCTAssertEqual(store.phase, .running)

        store.adjust(seconds: -15)
        XCTAssertEqual(scheduler.plan?.deadline, start.addingTimeInterval(60))
        XCTAssertEqual(store.remainingSeconds, 50)
    }

    func testPauseCancelsAndChangingPausedTimeDoesNotRestart() {
        let scheduler = RecordingRestTimerScheduler()
        var now = Date(timeIntervalSince1970: 1_800_000_000)
        let store = RestTimerStore(notificationScheduler: scheduler, now: { now })
        defer { store.dismiss() }

        store.start(seconds: 60, exerciseName: "Press", hapticsEnabled: false)
        now = now.addingTimeInterval(10)
        store.togglePause()
        XCTAssertEqual(store.remainingSeconds, 50)
        XCTAssertEqual(store.phase, .paused)
        XCTAssertNil(scheduler.plan)

        now = now.addingTimeInterval(300)
        store.adjust(seconds: -15)
        XCTAssertEqual(store.remainingSeconds, 35)
        XCTAssertEqual(store.phase, .paused)
        XCTAssertNil(scheduler.plan)

        store.togglePause()
        XCTAssertEqual(store.phase, .running)
        XCTAssertEqual(scheduler.plan?.deadline, now.addingTimeInterval(35))
    }

    func testReducingRunningTimerToZeroCancelsTheFutureAlert() {
        let scheduler = RecordingRestTimerScheduler()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let store = RestTimerStore(notificationScheduler: scheduler, now: { now })
        defer { store.dismiss() }

        store.start(seconds: 10, exerciseName: "Row", hapticsEnabled: false)
        store.adjust(seconds: -15)
        XCTAssertEqual(store.remainingSeconds, 0)
        XCTAssertEqual(store.phase, .complete)
        XCTAssertNil(scheduler.plan)
    }

    func testForegroundRecoveryUsesClockAndPreservesScheduledDelivery() {
        let scheduler = RecordingRestTimerScheduler()
        var now = Date(timeIntervalSince1970: 1_800_000_000)
        let store = RestTimerStore(notificationScheduler: scheduler, now: { now })
        defer { store.dismiss() }

        store.start(seconds: 60, exerciseName: "Row", hapticsEnabled: false)
        now = now.addingTimeInterval(45)
        store.synchronizeClock()
        XCTAssertEqual(store.remainingSeconds, 15)

        now = now.addingTimeInterval(20)
        store.synchronizeClock()
        XCTAssertEqual(store.remainingSeconds, 0)
        XCTAssertEqual(store.phase, .complete)
        // The final timer tick must not race and cancel OS alert delivery.
        XCTAssertNotNil(scheduler.plan)
    }

    func testAddingTimeToCompletedTimerSchedulesAgainAndDismissCancels() {
        let scheduler = RecordingRestTimerScheduler()
        var now = Date(timeIntervalSince1970: 1_800_000_000)
        let store = RestTimerStore(notificationScheduler: scheduler, now: { now })
        store.start(seconds: 10, exerciseName: "Press", hapticsEnabled: false)
        now = now.addingTimeInterval(20)
        store.synchronizeClock()

        store.addThirtySeconds()
        XCTAssertEqual(store.phase, .running)
        XCTAssertEqual(store.remainingSeconds, 30)
        XCTAssertEqual(scheduler.plan?.deadline, now.addingTimeInterval(30))

        store.dismiss()
        XCTAssertNil(scheduler.plan)
        XCTAssertEqual(store.phase, .idle)
        XCTAssertEqual(store.exerciseName, "")
        XCTAssertEqual(store.remainingSeconds, 0)
    }

    func testDismissingAnOlderTimerDoesNotCancelANewerTimer() {
        let scheduler = RecordingRestTimerScheduler()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let older = RestTimerStore(notificationScheduler: scheduler, now: { now })
        let newer = RestTimerStore(notificationScheduler: scheduler, now: { now })
        defer { newer.dismiss() }

        older.start(seconds: 60, exerciseName: "Squat", hapticsEnabled: false)
        newer.start(seconds: 90, exerciseName: "Press", hapticsEnabled: false)
        older.dismiss()
        XCTAssertEqual(scheduler.plan?.exerciseName, "Press")
        XCTAssertEqual(scheduler.plan?.deadline, now.addingTimeInterval(90))
    }

    func testNotificationTriggerRoundsUpAndFixesTimeZone() throws {
        let deadline = Date(timeIntervalSince1970: 1_800_000_000.25)
        let plan = RestTimerNotificationPlan(deadline: deadline, exerciseName: "Squat")
        let components = plan.dateComponents
        let triggerDate = try XCTUnwrap(components.calendar?.date(from: components))

        XCTAssertEqual(triggerDate.timeIntervalSince1970, 1_800_000_001, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(triggerDate, deadline)
        XCTAssertEqual(components.timeZone?.secondsFromGMT(), 0)
        XCTAssertEqual(RestTimerNotificationPlan.identifier, "fwb.rest-timer.complete")
    }
}

@MainActor
private final class RecordingRestTimerScheduler: RestTimerNotificationScheduling {
    private(set) var plan: RestTimerNotificationPlan?

    func replace(with plan: RestTimerNotificationPlan) {
        self.plan = plan
    }

    func cancel(ownerID: UUID) {
        guard plan?.ownerID == ownerID else { return }
        plan = nil
    }
}
