import XCTest
@testable import FWBCoach

final class WatchCompanionTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private func workout() -> FWBWatchWorkoutSnapshot {
        FWBWatchWorkoutSnapshot(accountID: "client-a", sessionID: "session-a", title: "Workout", exerciseID: "press", exerciseName: "Press", setID: "set-1", setNumber: 1, totalSets: 3, suggestedWeight: 25, suggestedReps: 10, weightUnit: "lb")
    }
    private func command() -> FWBWatchCommand {
        FWBWatchCommand(kind: .completeSet, accountID: "client-a", sessionID: "session-a", exerciseID: "press", setID: "set-1", weight: 25, reps: 10, createdAt: now)
    }
    private func timer() -> FWBWatchRestSnapshot {
        FWBWatchRestSnapshot(accountID: "client-a", sessionID: "session-a", exerciseName: "Press", durationSeconds: 90, deadline: now.addingTimeInterval(90), pausedRemainingSeconds: 90, phase: .running, updatedAt: now)
    }

    func testCountdownUsesDeadlineAndNeverGoesNegative() {
        let timer = timer()
        XCTAssertEqual(timer.remainingSeconds(at: now.addingTimeInterval(0.5)), 90)
        XCTAssertEqual(timer.remainingSeconds(at: now.addingTimeInterval(65)), 25)
        XCTAssertEqual(timer.remainingSeconds(at: now.addingTimeInterval(500)), 0)
    }

    func testCorruptedFarFutureDeadlineCannotOverflowIntegerConversion() {
        var timer = timer()
        timer.deadline = Date(timeIntervalSince1970: Double.greatestFiniteMagnitude)
        XCTAssertEqual(timer.remainingSeconds(at: now), 86_400)
    }

    func testPauseResumePreservesRemainingTimeAcrossLongSuspension() {
        var timer = timer()
        timer.pause(at: now.addingTimeInterval(20))
        XCTAssertEqual(timer.phase, .paused)
        XCTAssertEqual(timer.remainingSeconds(at: now.addingTimeInterval(5_000)), 70)
        timer.resume(at: now.addingTimeInterval(5_000))
        XCTAssertEqual(timer.deadline, now.addingTimeInterval(5_070))
    }

    func testRestartCreatesNewCompletionIdentity() {
        var timer = timer()
        let originalID = timer.id
        timer.restart(at: now.addingTimeInterval(50))
        XCTAssertNotEqual(timer.id, originalID)
        XCTAssertEqual(timer.deadline, now.addingTimeInterval(140))
    }

    func testPauseAfterDeadlineCompletesWithoutResuming() {
        var timer = timer()
        timer.pause(at: now.addingTimeInterval(100))
        timer.resume(at: now.addingTimeInterval(110))
        XCTAssertEqual(timer.phase, .complete)
        XCTAssertNil(timer.deadline)
    }

    func testWrongAccountAndStaleSetAreRejected() {
        let command = command()
        XCTAssertNotNil(command.rejectionReason(accountID: "client-b", workout: workout(), rest: nil, now: now))
        var nextSet = workout()
        nextSet.setID = "set-2"
        XCTAssertNotNil(command.rejectionReason(accountID: "client-a", workout: nextSet, rest: nil, now: now))
    }

    func testExpiredAndFutureCommandsAreRejected() {
        XCTAssertNotNil(command().rejectionReason(accountID: "client-a", workout: workout(), rest: nil, now: now.addingTimeInterval(86_401)))
        XCTAssertNotNil(command().rejectionReason(accountID: "client-a", workout: workout(), rest: nil, now: now.addingTimeInterval(-301)))
    }

    func testInvalidMeasurementsAreRejected() {
        var command = command()
        command.weight = .infinity
        XCTAssertNotNil(command.rejectionReason(accountID: "client-a", workout: workout(), rest: nil, now: now))
        command.weight = 0
        command.reps = 0
        XCTAssertNotNil(command.rejectionReason(accountID: "client-a", workout: workout(), rest: nil, now: now))
    }

    func testTimedSetRequiresDurationRatherThanReps() {
        var workout = workout()
        workout.setType = "timed"
        var command = command()
        XCTAssertNotNil(command.rejectionReason(accountID: "client-a", workout: workout, rest: nil, now: now))
        command.durationSeconds = 45
        command.reps = nil
        XCTAssertNil(command.rejectionReason(accountID: "client-a", workout: workout, rest: nil, now: now))
    }

    func testStaleTimerAndWrongPhaseAreRejected() {
        let current = timer()
        var paused = current
        paused.pause(at: now.addingTimeInterval(20))
        var command = FWBWatchCommand(kind: .pauseRest, accountID: "client-a", sessionID: "session-a", rest: paused, createdAt: now.addingTimeInterval(20))
        XCTAssertNil(command.rejectionReason(accountID: "client-a", workout: nil, rest: current, now: now.addingTimeInterval(20)))
        command.rest?.phase = .running
        XCTAssertNotNil(command.rejectionReason(accountID: "client-a", workout: nil, rest: current, now: now.addingTimeInterval(20)))
        command.rest = paused
        command.rest?.id = UUID()
        XCTAssertNotNil(command.rejectionReason(accountID: "client-a", workout: nil, rest: current, now: now.addingTimeInterval(20)))
    }

    func testWireRejectsOversizeDataAndRoundTripsPendingCommand() throws {
        let command = command()
        XCTAssertEqual(FWBWatchWire.decode(FWBWatchCommand.self, from: FWBWatchWire.encode(command)), command)
        XCTAssertNil(FWBWatchWire.decode(FWBWatchContext.self, from: Data(repeating: 0, count: 128_001)))
    }

    func testRestartCannotReplaceANewerPhoneTimerInTheSameSession() {
        let previous = timer()
        var restarted = previous
        restarted.restart(at: now.addingTimeInterval(20))
        let command = FWBWatchCommand(kind: .restartRest, accountID: "client-a", sessionID: "session-a",
            baseRestID: previous.id, rest: restarted, createdAt: now.addingTimeInterval(20))
        XCTAssertNil(command.rejectionReason(accountID: "client-a", workout: nil, rest: previous, now: now.addingTimeInterval(20)))
        let newerPhoneTimer = timer()
        XCTAssertNotNil(command.rejectionReason(accountID: "client-a", workout: nil, rest: newerPhoneTimer, now: now.addingTimeInterval(20)))
    }

    func testQueuedRestartThenPauseKeepsTheOriginalPhoneTimerIdentity() {
        let previous = timer()
        var restarted = previous
        restarted.restart(at: now.addingTimeInterval(20))
        restarted.pause(at: now.addingTimeInterval(25))
        let command = FWBWatchCommand(kind: .pauseRest, accountID: "client-a", sessionID: "session-a",
            baseRestID: previous.id, rest: restarted, createdAt: now.addingTimeInterval(25))
        XCTAssertNil(command.rejectionReason(accountID: "client-a", workout: nil, rest: previous, now: now.addingTimeInterval(25)))
        XCTAssertEqual(restarted.remainingSeconds(at: now.addingTimeInterval(100)), 85)
    }

    @MainActor
    func testPhoneDeduplicatesSuccessfulCommandAcrossBridgeRecreation() async throws {
        let suite = "WatchCompanionTests.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        var command = command()
        command.createdAt = Date()
        let bridge = WatchCompanionBridge(defaults: defaults, session: nil)
        bridge.activate(accountID: "client-a")
        command.connectionID = bridge.connectionID
        let message = [FWBWatchWire.commandKey: try XCTUnwrap(FWBWatchWire.encode(command))]
        bridge.publish(workout: workout())
        var saveCount = 0
        bridge.onCommand = { _ in saveCount += 1; return .accepted }
        _ = await bridge.receive(message)
        _ = await bridge.receive(message)
        XCTAssertEqual(saveCount, 1)
        let restored = WatchCompanionBridge(defaults: defaults, session: nil)
        restored.activate(accountID: "client-a")
        restored.publish(workout: workout())
        restored.onCommand = { _ in saveCount += 1; return .accepted }
        let reply = await restored.receive(message)
        XCTAssertEqual(saveCount, 1)
        XCTAssertEqual(FWBWatchWire.decode(FWBWatchReceipt.self, from: reply[FWBWatchWire.receiptKey])?.outcome.status, .accepted)
    }

    @MainActor
    func testAccountSwitchRejectsOldSetWithoutCallingMutation() async throws {
        let suite = "WatchCompanionTests.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let bridge = WatchCompanionBridge(defaults: defaults, session: nil)
        bridge.activate(accountID: "client-b")
        var count = 0
        bridge.onCommand = { _ in count += 1; return .accepted }
        let reply = await bridge.receive([FWBWatchWire.commandKey: try XCTUnwrap(FWBWatchWire.encode(command()))])
        XCTAssertEqual(count, 0)
        XCTAssertEqual(FWBWatchWire.decode(FWBWatchReceipt.self, from: reply[FWBWatchWire.receiptKey])?.outcome.status, .rejected)
    }

    @MainActor
    func testLogoutAndBackInRejectsOldConnectionCommands() async throws {
        let suite = "WatchCompanionTests.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let bridge = WatchCompanionBridge(defaults: defaults, session: nil)
        bridge.activate(accountID: "client-a")
        var command = command()
        command.createdAt = Date()
        command.connectionID = bridge.connectionID
        bridge.clearAccount()
        bridge.activate(accountID: "client-a")
        bridge.publish(workout: workout())
        var count = 0
        bridge.onCommand = { _ in count += 1; return .accepted }
        let reply = await bridge.receive([FWBWatchWire.commandKey: try XCTUnwrap(FWBWatchWire.encode(command))])
        XCTAssertEqual(count, 0)
        XCTAssertEqual(FWBWatchWire.decode(FWBWatchReceipt.self, from: reply[FWBWatchWire.receiptKey])?.outcome.status, .rejected)
    }

    @MainActor
    func testDeferredSetRemainsDurableAndRetriesWhenLoggerPublishes() async throws {
        let suite = "WatchCompanionTests.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let bridge = WatchCompanionBridge(defaults: defaults, session: nil)
        bridge.activate(accountID: "client-a")
        bridge.publish(workout: workout())
        var command = command()
        command.createdAt = Date()
        command.connectionID = bridge.connectionID
        let message = [FWBWatchWire.commandKey: try XCTUnwrap(FWBWatchWire.encode(command))]
        bridge.onCommand = { _ in .deferred() }
        let reply = await bridge.receive(message)
        XCTAssertEqual(FWBWatchWire.decode(FWBWatchReceipt.self, from: reply[FWBWatchWire.receiptKey])?.outcome.status, .deferred)
        let restored = WatchCompanionBridge(defaults: defaults, session: nil)
        restored.activate(accountID: "client-a")
        restored.publish(workout: workout())
        let saved = expectation(description: "queued set saved after restart")
        restored.onCommand = { _ in saved.fulfill(); return .accepted }
        await fulfillment(of: [saved], timeout: 2)
    }
}
