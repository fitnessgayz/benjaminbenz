import XCTest
@testable import FWBCoach

@MainActor
final class ActiveWorkoutSessionTests: XCTestCase {
    func testDiskRoundTripKeepsOriginalSessionDateClockAndCompleteDraft() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let original = fixture()
        ActiveWorkoutSessionStore(clientEmail: "client@example.com", directory: directory).start(original)
        let store = ActiveWorkoutSessionStore(clientEmail: "client@example.com", directory: directory)
        let restored = try XCTUnwrap(store.session)
        XCTAssertEqual(restored, original)
        XCTAssertEqual(restored.workout.id, original.workoutID)
        XCTAssertEqual(restored.workout.title, original.snapshot.workoutTitle)
        XCTAssertEqual(restored.workout.focus, "Full body")
        XCTAssertEqual(restored.workout.format, "custom")
        XCTAssertEqual(restored.workout.exercises, original.snapshot.restoredExercises)
        XCTAssertEqual(restored.drafts, original.drafts)
        XCTAssertEqual(restored.drafts.map(\.isCompleted), [true, false, false])
        XCTAssertFalse(restored.drafts.last!.containsEntry)
        XCTAssertEqual(restored.groupAssignments["CW01"]?.kind, .superset)
        XCTAssertNil(store.storageError)
    }

    func testAccountNormalizationIsolationAndOwnershipValidation() {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let original = fixture(email: " CLIENT@example.com ")
        let owner = ActiveWorkoutSessionStore(clientEmail: "Client@Example.com", directory: directory)
        owner.start(original)
        XCTAssertEqual(ActiveWorkoutSessionStore(clientEmail: " client@example.com ", directory: directory).session, original)
        let other = ActiveWorkoutSessionStore(clientEmail: "other@example.com", directory: directory)
        XCTAssertNil(other.session)
        other.start(original)
        XCTAssertNil(other.session)
        let anonymous = ActiveWorkoutSessionStore(clientEmail: "  ", directory: directory)
        anonymous.start(fixture(email: ""))
        XCTAssertNil(anonymous.session)
        XCTAssertNotNil(anonymous.storageError)
    }

    func testOldSessionCannotUpdateOrClearNewWorkout() {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ActiveWorkoutSessionStore(clientEmail: "client@example.com", directory: directory)
        let first = fixture()
        let current = fixture()
        store.start(first)
        store.start(current)
        store.update(first)
        store.clear(sessionID: first.id)
        XCTAssertEqual(store.session, current)
        store.clear(sessionID: current.id)
        XCTAssertNil(store.session)
        XCTAssertNil(ActiveWorkoutSessionStore(clientEmail: "client@example.com", directory: directory).session)
    }

    func testMostRecentLoggerOwnsUpdatesEvenForSameSession() {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ActiveWorkoutSessionStore(clientEmail: "client@example.com", directory: directory)
        let original = fixture()
        let changed = fixture(id: original.id, weight: "75")
        let firstOwner = UUID(), secondOwner = UUID()
        store.start(original)
        store.claim(owner: firstOwner)
        store.claim(owner: secondOwner)
        store.update(changed, owner: firstOwner)
        store.update(changed)
        XCTAssertEqual(store.session, original)
        store.update(changed, owner: secondOwner)
        XCTAssertEqual(store.session, changed)
        store.clear(sessionID: original.id)
        store.update(original, owner: secondOwner)
        XCTAssertNil(store.session)
    }

    func testStartingAnotherWorkoutRevokesPreviousLoggerOwnership() {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = ActiveWorkoutSessionStore(clientEmail: "client@example.com", directory: directory)
        let firstOwner = UUID(), secondOwner = UUID()
        store.start(fixture())
        store.claim(owner: firstOwner)
        let current = fixture()
        store.start(current)
        let changed = fixture(id: current.id, weight: "75")
        store.update(changed, owner: firstOwner)
        XCTAssertEqual(store.session, current)
        store.claim(owner: secondOwner)
        store.update(changed, owner: secondOwner)
        XCTAssertEqual(store.session, changed)
    }

    func testPreviewWorkoutNeverReplacesSignedInWorkout() {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let live = fixture(), preview = fixture()
        ActiveWorkoutSessionStore(clientEmail: "client@example.com", directory: directory).start(live)
        ActiveWorkoutSessionStore(clientEmail: "client@example.com", previewMode: true, directory: directory).start(preview)
        XCTAssertEqual(ActiveWorkoutSessionStore(clientEmail: "client@example.com", directory: directory).session, live)
        let previewStore = ActiveWorkoutSessionStore(clientEmail: "client@example.com", previewMode: true, directory: directory)
        XCTAssertTrue(previewStore.isPreview)
        XCTAssertEqual(previewStore.session, preview)
        previewStore.clear(sessionID: preview.id)
        XCTAssertEqual(ActiveWorkoutSessionStore(clientEmail: "client@example.com", directory: directory).session, live)
    }

    func testWriteFailureKeepsSessionAvailableInMemory() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        try Data("not-a-directory".utf8).write(to: directory)
        let store = ActiveWorkoutSessionStore(clientEmail: "client@example.com", directory: directory)
        let original = fixture()
        store.start(original)
        XCTAssertEqual(store.session, original)
        XCTAssertNotNil(store.storageError)
    }

    private func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    private func fixture(email: String = "client@example.com", id: UUID = UUID(), weight: String = "40") -> ActiveWorkoutSession {
        let exercise = Exercise(code: "CW01", name: "Press", prescription: "3 x 8", rest: "90 sec",
                                instructions: ["Move slowly."], video: "https://example.com/demo.mp4")
        let blank = Exercise(code: "CW02", name: "", prescription: "3 sets")
        let assignments = [exercise.id: WorkoutGroupAssignment(id: "A", kind: .superset, label: "Superset A")]
        let drafts = [
            WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: weight, reps: "8", effortScale: .rir, effort: "2", isCompleted: true),
            WorkoutSetDraft(exercise: exercise, setNumber: 2, weight: "42.5", reps: "6", notes: "Unlogged entry"),
            WorkoutSetDraft(exercise: blank, setNumber: 1)
        ]
        let date = Date(timeIntervalSince1970: 1_790_000_000)
        let workoutID = UUID()
        let snapshot = OfflineWorkoutSession(clientEmail: email, sessionID: id, workoutTemplateID: workoutID,
            entryDate: "2026-09-25", workoutTitle: "Custom workout · Full body · generated-id",
            exercises: [exercise, blank], drafts: drafts, groupAssignments: assignments, updatedAt: date,
            baseRemoteUpdatedAt: date.addingTimeInterval(-60), energyBefore: 4, energyAfter: 3, loggedSetsOnly: true)
        return ActiveWorkoutSession(snapshot: snapshot, startedAt: date, entryDate: date,
            workoutID: workoutID, workoutFocus: "Full body", workoutFormat: "custom", isGeneratedWorkout: true,
            customWorkoutFormatRaw: "superset", energyBefore: 4, energyAfter: 3)
    }
}
