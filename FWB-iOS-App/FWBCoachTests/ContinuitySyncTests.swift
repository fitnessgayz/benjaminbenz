import XCTest
@testable import FWBCoach

final class ContinuitySyncTests: XCTestCase {
    func testStableUUIDIsRepeatableAndNamespaced() {
        let first = ContinuitySync.stableUUID(namespace: "workout", name: "lower body")
        let repeated = ContinuitySync.stableUUID(namespace: "workout", name: "lower body")
        let differentNamespace = ContinuitySync.stableUUID(namespace: "set", name: "lower body")

        XCTAssertEqual(first, repeated)
        XCTAssertNotEqual(first, differentNamespace)
    }

    func testNewerWebSetWinsWithoutBlockingOtherSets() {
        let localDate = Date(timeIntervalSince1970: 1_000)
        let decision = WorkoutConflictResolver.decision(
            localUpdatedAt: localDate,
            baseRemoteUpdatedAt: Date(timeIntervalSince1970: 900),
            localContainsSet: true,
            remote: RemoteWorkoutSetVersion(
                setID: UUID(),
                updatedAt: Date(timeIntervalSince1970: 1_100),
                source: "web_app"
            )
        )

        XCTAssertEqual(decision, .keepRemote)
    }

    func testDeletionRequiresRemoteRowAtOrBeforeBaseVersion() {
        let setID = UUID()
        let base = Date(timeIntervalSince1970: 1_000)

        XCTAssertEqual(
            WorkoutConflictResolver.decision(
                localUpdatedAt: Date(timeIntervalSince1970: 1_100),
                baseRemoteUpdatedAt: base,
                localContainsSet: false,
                remote: RemoteWorkoutSetVersion(
                    setID: setID,
                    updatedAt: base,
                    source: "web_app"
                )
            ),
            .deleteRemote
        )

        XCTAssertEqual(
            WorkoutConflictResolver.decision(
                localUpdatedAt: Date(timeIntervalSince1970: 1_100),
                baseRemoteUpdatedAt: base,
                localContainsSet: false,
                remote: RemoteWorkoutSetVersion(
                    setID: setID,
                    updatedAt: Date(timeIntervalSince1970: 1_050),
                    source: "web_app"
                )
            ),
            .keepRemote
        )
    }

    func testOutboxCoalescesMeasurementEditsByClientAndDate() async throws {
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("continuity-outbox-\(UUID().uuidString).json")
        let outbox = ContinuityOutbox(fileURL: fileURL)
        let first = PendingMeasurementMutation(
            clientEmail: " Client@Example.com ",
            entryDate: "2026-08-21",
            bodyweight: 150,
            bodyfat: nil,
            muscleMass: nil,
            measurements: [:],
            goalNote: "First",
            expectedRemoteUpdatedAt: nil
        )
        let replacement = PendingMeasurementMutation(
            clientEmail: "client@example.com",
            entryDate: "2026-08-21",
            bodyweight: 151,
            bodyfat: nil,
            muscleMass: nil,
            measurements: [:],
            goalNote: "Replacement",
            expectedRemoteUpdatedAt: nil
        )

        try await outbox.enqueue(first)
        try await outbox.enqueue(replacement)

        let pending = await outbox.measurementMutations(email: "CLIENT@example.com")
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.bodyweight, 151)
        XCTAssertEqual(pending.first?.goalNote, "Replacement")
    }
}
