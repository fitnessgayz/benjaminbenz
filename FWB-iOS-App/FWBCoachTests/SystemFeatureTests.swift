import Foundation
import XCTest
import WorkoutKit
@testable import FWBCoach

final class SystemFeatureTests: XCTestCase {
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(secondsFromGMT: 0)!
        return value
    }
    private let noon = Date(timeIntervalSince1970: 1_790_337_600)

    func testWidgetOnlyShowsFreshSameDayAssignment() {
        let snapshot = FWBWidgetWorkoutSnapshot(title: "  Upper body  ", scheduledDate: noon, updatedAt: noon.addingTimeInterval(-60))
        XCTAssertEqual(snapshot.titleForToday(now: noon, calendar: calendar), "Upper body")
        XCTAssertNil(snapshot.titleForToday(now: noon.addingTimeInterval(86_400), calendar: calendar))
    }

    func testWidgetRejectsOldOrFutureRefreshAndMissingAssignment() {
        let old = FWBWidgetWorkoutSnapshot(title: "Private workout", scheduledDate: noon, updatedAt: noon.addingTimeInterval(-86_401))
        XCTAssertNil(old.titleForToday(now: noon, calendar: calendar))
        var future = old
        future.updatedAt = noon.addingTimeInterval(120)
        XCTAssertNil(future.titleForToday(now: noon, calendar: calendar))
        XCTAssertNil(FWBWidgetWorkoutSnapshot(title: "Workout", scheduledDate: nil, updatedAt: noon).titleForToday(now: noon))
    }

    func testWidgetRoundTripContainsOnlyAssignmentFields() throws {
        let value = FWBWidgetWorkoutSnapshot(title: "Leg day", scheduledDate: noon, updatedAt: noon)
        let data = try JSONEncoder().encode(value)
        XCTAssertEqual(try JSONDecoder().decode(FWBWidgetWorkoutSnapshot.self, from: data), value)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(object.keys), Set(["title", "scheduledDate", "updatedAt"]))
    }

    func testRoutesRoundTripWithoutAmbiguousParameters() {
        XCTAssertEqual(FWBSystemRoute.parse(FWBSystemRoute.workouts.url), .workouts)
        XCTAssertEqual(FWBSystemRoute.parse(FWBSystemRoute.startRestTimer(seconds: 90).url), .startRestTimer(seconds: 90))
        for raw in ["https://workouts", "fwb://other", "fwb://workouts/private", "fwb://workouts?account=123", "fwb://rest-timer?seconds=0", "fwb://rest-timer?seconds=3601", "fwb://rest-timer?seconds=90&seconds=30", "fwb://user@workouts", "fwb://workouts#fragment"] {
            XCTAssertNil(FWBSystemRoute.parse(URL(string: raw)!), raw)
        }
    }

    @MainActor
    func testRouterConsumesOnceAndRejectsInvalidTimers() {
        let router = FWBSystemRouter()
        router.enqueue(.startRestTimer(seconds: 90))
        XCTAssertEqual(router.consumePendingRoute(), .startRestTimer(seconds: 90))
        XCTAssertNil(router.consumePendingRoute())
        router.enqueue(.startRestTimer(seconds: -1))
        XCTAssertNil(router.consumePendingRoute())
    }

    @MainActor
    func testDetectedWorkoutRouteSurvivesInitialLoginAndConsumesOnce() throws {
        let accountID = UUID(), workoutID = UUID()
        let payload = try XCTUnwrap(WorkoutDetectionNotificationPayload.parse([
            "kind": "apple_health_workout", "account_id": accountID.uuidString,
            "healthkit_id": workoutID.uuidString
        ]))
        let router = FWBSystemRouter()
        router.enqueueHealthWorkout(payload)
        router.clear(preservingHealthWorkout: true)
        XCTAssertEqual(router.consumeHealthWorkout(accountID: accountID)?.healthkitID, workoutID)
        XCTAssertNil(router.consumeHealthWorkout(accountID: accountID))
    }

    @MainActor
    func testDetectedWorkoutRouteRejectsOtherAccountAndLogoutClearsIt() throws {
        let accountID = UUID(), workoutID = UUID()
        let payload = try XCTUnwrap(WorkoutDetectionNotificationPayload.parse([
            "kind": "apple_health_workout", "account_id": accountID.uuidString,
            "healthkit_id": workoutID.uuidString
        ]))
        let router = FWBSystemRouter()
        router.enqueueHealthWorkout(payload)
        XCTAssertNil(router.consumeHealthWorkout(accountID: UUID()))
        XCTAssertNil(router.pendingHealthWorkout)
        router.enqueueHealthWorkout(payload)
        router.clear()
        XCTAssertNil(router.consumeHealthWorkout(accountID: accountID))
    }

    @MainActor
    func testDetectedWorkoutDoesNotReplacePendingTimerRoute() throws {
        let accountID = UUID()
        let payload = try XCTUnwrap(WorkoutDetectionNotificationPayload.parse([
            "kind": "apple_health_workout", "account_id": accountID.uuidString,
            "healthkit_id": UUID().uuidString
        ]))
        let router = FWBSystemRouter()
        router.enqueue(.startRestTimer(seconds: 90))
        router.enqueueHealthWorkout(payload)
        XCTAssertNotNil(router.consumeHealthWorkout(accountID: accountID))
        XCTAssertEqual(router.consumePendingRoute(), .startRestTimer(seconds: 90))
    }

    @MainActor
    func testWidgetOptInAndLogoutClearSharedData() throws {
        let suite = "SystemFeatureTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let features = WorkoutSystemFeatures(sharedDefaults: defaults)
        features.updateAssignedWorkout(title: "Upper body", scheduledDate: Date())
        XCTAssertNil(defaults.data(forKey: FWBSystemConstants.widgetSnapshotKey))
        features.widgetEnabled = true
        XCTAssertNotNil(defaults.data(forKey: FWBSystemConstants.widgetSnapshotKey))
        features.clearAccount()
        XCTAssertFalse(defaults.bool(forKey: FWBSystemConstants.widgetEnabledKey))
        XCTAssertNil(defaults.data(forKey: FWBSystemConstants.widgetSnapshotKey))
    }

    func testCardioRejectsPastDateAndInvalidDuration() {
        var draft = FWBCardioPlanDraft()
        draft.scheduledDate = noon.addingTimeInterval(-60)
        XCTAssertThrowsError(try draft.validate(now: noon))
        draft.scheduledDate = noon.addingTimeInterval(60)
        draft.durationMinutes = 0
        XCTAssertThrowsError(try draft.validate(now: noon))
        draft.durationMinutes = 30
        XCTAssertNoThrow(try draft.validate(now: noon))
    }

    func testIntervalsValidateTotalAndRoundCountBeforeBuilding() {
        var draft = FWBCardioPlanDraft()
        draft.scheduledDate = noon.addingTimeInterval(60)
        draft.intervals = true
        XCTAssertEqual(draft.totalSeconds, 600)
        draft.rounds = 0
        XCTAssertThrowsError(try draft.validate(now: noon))
        draft.rounds = 50
        draft.workSeconds = 3_600
        XCTAssertThrowsError(try draft.validate(now: noon))
    }

    func testRunningPlanPreservesUserDurationAndStableIdentifier() throws {
        var draft = FWBCardioPlanDraft()
        draft.scheduledDate = noon.addingTimeInterval(60)
        let id = UUID()
        let plan = try draft.makePlan(id: id, now: noon)
        XCTAssertEqual(plan.id, id)
        guard case .goal(let workout) = plan.workout else { return XCTFail("Expected duration workout") }
        XCTAssertEqual(workout.activity, .running)
        XCTAssertEqual(workout.goal, .time(30, .minutes))
    }
}
