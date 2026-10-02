import XCTest
@testable import FWBCoach

final class WorkoutSessionRestoreTests: XCTestCase {
    private let previousSession = UUID(uuidString: "D5C3A2C0-C867-4F3C-B419-859C53B13F01")!
    private let currentSession = UUID(uuidString: "D5C3A2C0-C867-4F3C-B419-859C53B13F02")!

    func testSameDateAndExerciseRestoresOnlyNewestSessionRegardlessOfInputOrder() throws {
        let old = try record(session: previousSession, code: "A1", weight: 30, updated: "2026-09-25T10:00:00Z")
        let current = try record(session: currentSession, code: "A1", weight: 40, updated: "2026-09-25T12:00:00Z")
        let otherCurrent = try record(session: currentSession, code: "A2", weight: 50, updated: "2026-09-25T11:00:00Z")
        for input in [[old, current, otherCurrent], [current, otherCurrent, old]] {
            let restored = WorkoutSessionRestoration.recordsForLatestSession(from: input)
            XCTAssertEqual(restored, [current, otherCurrent])
            XCTAssertEqual(restored.first?.weightUsed, 40)
            XCTAssertTrue(restored.allSatisfy { $0.sessionID == currentSession })
        }
    }

    func testLegacyRowsNeverMixIntoAnIdentifiedSessionOrItsWatermark() throws {
        let legacy = try record(session: nil, code: "A2", weight: 100, updated: "2026-09-25T14:00:00Z", completed: "2026-09-25T14:00:00Z")
        let current = try record(session: currentSession, code: "A1", weight: 40, updated: "2026-09-25T12:00:00Z")
        let old = try record(session: previousSession, code: "A1", weight: 30, updated: "2026-09-25T10:00:00Z", completed: "2026-09-25T10:00:00Z")
        let restored = WorkoutSessionRestoration.recordsForLatestSession(from: [legacy, current, old])
        XCTAssertEqual(restored, [current])
        XCTAssertEqual(restored.compactMap(\.updatedAt).max(), current.updatedAt)
        XCTAssertNil(restored.compactMap(\.completedAt).max())
    }

    func testAllLegacyRowsRemainAvailable() throws {
        let records = [try record(session: nil, code: "A1", weight: 30),
                       try record(session: nil, code: "CARDIO", weight: 20)]
        XCTAssertEqual(WorkoutSessionRestoration.recordsForLatestSession(from: records), records)
        XCTAssertTrue(WorkoutSessionRestoration.recordsForLatestSession(from: []).isEmpty)
    }

    func testMissingTimestampsUseFirstReturnedSessionAndKeepAllItsRows() throws {
        let first = try record(session: currentSession, code: "A1", weight: 40)
        let old = try record(session: previousSession, code: "A1", weight: 30)
        let cardio = try record(session: currentSession, code: "CARDIO", weight: 15)
        XCTAssertEqual(WorkoutSessionRestoration.recordsForLatestSession(from: [first, old, cardio]), [first, cardio])
    }

    private func record(
        session: UUID?, code: String, weight: Double,
        updated: String? = nil, completed: String? = nil
    ) throws -> WorkoutLogRecord {
        var payload: [String: Any] = [
            "exercise_code": code, "exercise_name": "Exercise \(code)",
            "set_number": 1, "weight_used": weight, "reps": 10
        ]
        if let session { payload["session_id"] = session.uuidString }
        if let updated { payload["updated_at"] = updated }
        if let completed { payload["completed_at"] = completed }
        return try JSONDecoder().decode(WorkoutLogRecord.self, from: JSONSerialization.data(withJSONObject: payload))
    }
}
