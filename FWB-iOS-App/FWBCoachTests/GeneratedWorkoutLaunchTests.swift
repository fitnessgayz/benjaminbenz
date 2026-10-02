import XCTest
@testable import FWBCoach

final class GeneratedWorkoutLaunchTests: XCTestCase {
    @MainActor
    func testRecoveryLaunchKeepsTimeTargetsAndCanResumeWithoutRecordingActivity() throws {
        for focus: WorkoutGenerationFocus in [.recoveryUpper, .recoveryLower, .recoveryFull] {
            let plan = try WorkoutGenerator.generate(
                library: WorkoutGeneratorAuditRootView.library, history: [],
                preferences: WorkoutGenerationPreferences(focus: focus, equipment: [.bodyweight], minutes: 20), seed: 1
            )
            let launch = GeneratedWorkoutLaunch(plan: plan)
            let restored = try JSONDecoder().decode(GeneratedWorkoutLaunch.self, from: JSONEncoder().encode(launch))
            XCTAssertEqual(restored, launch)
            XCTAssertEqual(restored.workout.title.fwbWorkoutDisplayTitle, focus.title)
            XCTAssertEqual(restored.workout.exercises.count, plan.exercises.count)
            for (exercise, generated) in zip(restored.workout.exercises, plan.exercises) {
                XCTAssertEqual(exercise.prescription, generated.prescription)
                XCTAssertEqual(exercise.rest, generated.rest)
                XCTAssertTrue((1...2).contains(generated.sets))
                if generated.prescription.contains("sec") {
                    XCTAssertEqual(GeneratedWorkoutLoggerPreparation.initialSetType(for: exercise), .timed)
                }
                let draft = WorkoutSetDraft(exercise: exercise, setNumber: 1)
                XCTAssertFalse(draft.containsEntry)
                XCTAssertFalse(draft.isCompleted)
            }
        }
    }

    func testGeneratedTimingSelectsDurationWithoutTreatingRestAsTarget() {
        for prescription in ["30 sec x 3 sets", "20 sec/side x 2 sets", "1 min x 2 sets"] {
            XCTAssertEqual(GeneratedWorkoutLoggerPreparation.initialSetType(for: Exercise(code: "CW01", name: "Hold", prescription: prescription, rest: "60 sec")), .timed)
        }
        XCTAssertEqual(GeneratedWorkoutLoggerPreparation.initialSetType(for: Exercise(code: "CW01", name: "Press", prescription: "8-12 reps x 3 sets", rest: "60 sec")), .working)
    }

    func testRemoteResumeKeepsUnloggedExercisesAndOriginalMetadata() throws {
        let original = GeneratedWorkoutLaunch(plan: try fixturePlan()).workout.exercises[0]
        let unlogged = Exercise(code: "CW02", name: "Squat", prescription: "10 reps x 2 sets", rest: "90 sec")
        let record = try logRecord(code: original.code, name: original.name.uppercased())
        let restored = GeneratedWorkoutLoggerPreparation.restoredExercises(originals: [original, unlogged], records: [record])
        XCTAssertEqual(restored.count, 2)
        XCTAssertEqual(restored.first?.prescription, original.prescription)
        XCTAssertEqual(restored.first?.rest, original.rest)
        XCTAssertEqual(restored.first?.instructions, original.instructions)
        XCTAssertEqual(restored.first?.video, original.video)
        XCTAssertEqual(restored.last, unlogged)
    }

    func testRemoteResumeHonorsRenamesAndManualAdditions() throws {
        let original = GeneratedWorkoutLaunch(plan: try fixturePlan()).workout.exercises[0]
        let restored = GeneratedWorkoutLoggerPreparation.restoredExercises(originals: [original], records: [
            try logRecord(code: original.code, name: "Renamed Exercise"),
            try logRecord(code: "CW03", name: "Manual Addition")
        ])
        XCTAssertEqual(restored.map(\.name), ["Renamed Exercise", "Manual Addition"])
        XCTAssertEqual(restored.first?.prescription, "Custom")
        XCTAssertEqual(restored.first?.video, "")
    }

    func testCompletedResumeDoesNotRestoreRemovedExercises() throws {
        let original = GeneratedWorkoutLaunch(plan: try fixturePlan()).workout.exercises[0]
        let removed = Exercise(code: "CW02", name: "Squat", prescription: "10 reps x 2 sets")
        let restored = GeneratedWorkoutLoggerPreparation.restoredExercises(
            originals: [original, removed], records: [try logRecord(code: original.code, name: original.name)], isCompleted: true
        )
        XCTAssertEqual(restored, [original])
        XCTAssertEqual(GeneratedWorkoutLoggerPreparation.restoredExercises(originals: [original], records: [], isCompleted: true), [])
    }

    func testUploadedDemoRemainsAvailableInLogger() {
        let approved = "https://project.supabase.co/storage/v1/object/public/exercise-videos/demo.mp4"
        XCTAssertEqual(Exercise(code: "CW01", name: "Press", video: approved).demoURL?.absoluteString, approved)
        let unapproved = "https://project.supabase.co/storage/v1/object/public/private-files/demo.mp4"
        XCTAssertNotEqual(Exercise(code: "CW01", name: "Press", video: unapproved).demoURL?.absoluteString, unapproved)
    }

    func testSamePlanCreatesDistinctLogsAndReadableTitles() throws {
        let plan = try fixturePlan()
        let first = GeneratedWorkoutLaunch(plan: plan)
        let second = GeneratedWorkoutLaunch(plan: plan)
        XCTAssertNotEqual(first.workout.title, second.workout.title)
        XCTAssertNotEqual(
            OfflineWorkoutSession.id(clientEmail: "client@example.com", entryDate: "2026-09-25", workoutTitle: first.workout.title),
            OfflineWorkoutSession.id(clientEmail: "client@example.com", entryDate: "2026-09-25", workoutTitle: second.workout.title)
        )
        XCTAssertEqual(first.workout.title.fwbWorkoutDisplayTitle, plan.title)
        XCTAssertEqual(first.workout.format, "custom")
    }

    func testRoundTripPreservesDateIdentityAndPrescription() throws {
        let launch = GeneratedWorkoutLaunch(plan: try fixturePlan(), createdAt: Date(timeIntervalSince1970: 1_790_000_000))
        let restored = try JSONDecoder().decode(GeneratedWorkoutLaunch.self, from: JSONEncoder().encode(launch))
        XCTAssertEqual(restored, launch)
        XCTAssertEqual(restored.workout, launch.workout)
        let exercise = try XCTUnwrap(restored.workout.exercises.first)
        XCTAssertEqual(exercise.code, "CW01")
        XCTAssertEqual(exercise.prescription, "8-12 reps x 3 sets")
        XCTAssertEqual(exercise.rest, "75 sec")
        XCTAssertEqual(exercise.instructions, ["Move with control."])
        XCTAssertEqual(exercise.video, "https://www.youtube.com/watch?v=abc123")
        let draft = WorkoutSetDraft(exercise: exercise, setNumber: 1)
        XCTAssertFalse(draft.isCompleted)
        XCTAssertFalse(draft.containsEntry)
    }

    func testStoreRetainsSessionsAndSeparatesClients() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = GeneratedWorkoutLaunchStore(directory: directory)
        let plan = try fixturePlan()
        let first = GeneratedWorkoutLaunch(plan: plan, createdAt: Date(timeIntervalSince1970: 100))
        let second = GeneratedWorkoutLaunch(plan: plan, createdAt: Date(timeIntervalSince1970: 200))
        try store.save(first, clientEmail: " CLIENT@example.com ")
        try store.save(second, clientEmail: "client@example.com")
        try store.save(second, clientEmail: "client@example.com")
        XCTAssertEqual(try store.load(clientEmail: "CLIENT@example.com"), [second, first])
        XCTAssertEqual(try store.load(clientEmail: "other@example.com"), [])
        XCTAssertThrowsError(try store.save(first, clientEmail: "  "))
    }

    func testCorruptStoreIsNotOverwrittenWhenSaving() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = GeneratedWorkoutLaunchStore(directory: directory)
        let launch = GeneratedWorkoutLaunch(plan: try fixturePlan())
        try store.save(launch, clientEmail: "client@example.com")
        let file = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first)
        let corrupt = Data("invalid-json".utf8)
        try corrupt.write(to: file)
        XCTAssertThrowsError(try store.load(clientEmail: "client@example.com"))
        XCTAssertThrowsError(try store.save(launch, clientEmail: "client@example.com"))
        XCTAssertEqual(try Data(contentsOf: file), corrupt)
    }

    func testLegacyLaunchJSONWithoutArchiveFieldStillDecodesAsActive() throws {
        let launch = GeneratedWorkoutLaunch(plan: try fixturePlan(), createdAt: Date(timeIntervalSince1970: 100))
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(launch)) as? [String: Any])
        json.removeValue(forKey: "archivedAt")
        let legacy = try JSONSerialization.data(withJSONObject: json)
        let restored = try JSONDecoder().decode(GeneratedWorkoutLaunch.self, from: legacy)
        XCTAssertEqual(restored, launch)
        XCTAssertNil(restored.archivedAt)
        XCTAssertFalse(restored.isArchived)
        XCTAssertEqual(restored.workout, launch.workout)
    }

    func testArchiveRestoreRoundTripPreservesTheSavedWorkoutAndItsIdentity() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = GeneratedWorkoutLaunchStore(directory: directory)
        let launch = GeneratedWorkoutLaunch(plan: try fixturePlan(), createdAt: Date(timeIntervalSince1970: 100))
        try store.save(launch, clientEmail: "client@example.com")
        let archived = try XCTUnwrap(store.setArchived(true, id: launch.id, clientEmail: " CLIENT@example.com ").first)
        XCTAssertTrue(archived.isArchived)
        XCTAssertNotNil(archived.archivedAt)
        XCTAssertEqual(archived.id, launch.id)
        XCTAssertEqual(archived.title, launch.title)
        XCTAssertEqual(archived.createdAt, launch.createdAt)
        XCTAssertEqual(archived.estimatedMinutes, launch.estimatedMinutes)
        XCTAssertEqual(archived.exercises, launch.exercises)
        XCTAssertEqual(archived.workout, launch.workout)
        let reopened = GeneratedWorkoutLaunchStore(directory: directory)
        XCTAssertEqual(try reopened.load(clientEmail: "client@example.com"), [archived])
        // A repeated archive preserves the original archive timestamp.
        XCTAssertEqual(try reopened.setArchived(true, id: launch.id, clientEmail: "client@example.com"), [archived])
        XCTAssertEqual(try reopened.setArchived(false, id: launch.id, clientEmail: "client@example.com"), [launch])
        XCTAssertEqual(try store.load(clientEmail: "client@example.com"), [launch])
        XCTAssertFalse(try XCTUnwrap(store.load(clientEmail: "client@example.com").first).isArchived)
    }

    func testArchivingOneLaunchPreservesOtherLaunchesAndTheirOrder() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = GeneratedWorkoutLaunchStore(directory: directory)
        let plan = try fixturePlan()
        let older = GeneratedWorkoutLaunch(plan: plan, createdAt: Date(timeIntervalSince1970: 100))
        let newer = GeneratedWorkoutLaunch(plan: plan, createdAt: Date(timeIntervalSince1970: 200))
        try store.save(older, clientEmail: "client@example.com")
        try store.save(newer, clientEmail: "client@example.com")
        let result = try store.setArchived(true, id: older.id, clientEmail: "client@example.com")
        XCTAssertEqual(result.map(\.id), [newer.id, older.id])
        XCTAssertEqual(result.first, newer)
        XCTAssertTrue(result.last?.isArchived == true)
        // Loading remains inclusive; the UI owns its active/archived filter.
        XCTAssertEqual(try store.load(clientEmail: "client@example.com"), result)
        XCTAssertEqual(result.filter { !$0.isArchived }, [newer])
    }

    func testDeleteRemovesOnlyTheExactLaunchAndLeavesOtherAccountUntouched() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = GeneratedWorkoutLaunchStore(directory: directory)
        let plan = try fixturePlan()
        let first = GeneratedWorkoutLaunch(plan: plan, createdAt: Date(timeIntervalSince1970: 100))
        let second = GeneratedWorkoutLaunch(plan: plan, createdAt: Date(timeIntervalSince1970: 200))
        try store.save(first, clientEmail: "client@example.com")
        try store.save(second, clientEmail: "client@example.com")
        try store.save(first, clientEmail: "other@example.com")
        try store.setArchived(true, id: first.id, clientEmail: "client@example.com")
        XCTAssertEqual(try store.delete(id: first.id, clientEmail: "CLIENT@example.com"), [second])
        XCTAssertEqual(try store.load(clientEmail: "client@example.com"), [second])
        XCTAssertEqual(try store.load(clientEmail: "other@example.com"), [first])
        XCTAssertEqual(try store.delete(id: first.id, clientEmail: "client@example.com"), [second])
        XCTAssertEqual(try store.delete(id: second.id, clientEmail: "client@example.com"), [])
        XCTAssertEqual(try store.load(clientEmail: "client@example.com"), [])
        XCTAssertEqual(try store.load(clientEmail: "other@example.com"), [first])
    }

    func testMissingIDsAreNoOpsAndMissingAccountIsRejected() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = GeneratedWorkoutLaunchStore(directory: directory)
        let id = UUID()
        XCTAssertEqual(try store.setArchived(true, id: id, clientEmail: "client@example.com"), [])
        XCTAssertEqual(try store.delete(id: id, clientEmail: "client@example.com"), [])
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
        let launch = GeneratedWorkoutLaunch(plan: try fixturePlan())
        try store.save(launch, clientEmail: "client@example.com")
        let file = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first)
        let before = try Data(contentsOf: file)
        XCTAssertEqual(try store.setArchived(true, id: id, clientEmail: "client@example.com"), [launch])
        XCTAssertEqual(try store.setArchived(false, id: id, clientEmail: "client@example.com"), [launch])
        XCTAssertEqual(try store.delete(id: id, clientEmail: "client@example.com"), [launch])
        XCTAssertEqual(try Data(contentsOf: file), before)
        for operation in [
            { try store.setArchived(true, id: launch.id, clientEmail: "  ") },
            { try store.delete(id: launch.id, clientEmail: "  ") }
        ] {
            XCTAssertThrowsError(try operation()) { error in
                guard case GeneratedWorkoutLaunchStore.StoreError.missingClient = error else {
                    return XCTFail("Expected missing-client failure")
                }
            }
        }
        XCTAssertEqual(try Data(contentsOf: file), before)
    }

    func testCorruptArchiveStoreIsNotOverwrittenByArchiveRestoreOrDelete() throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = GeneratedWorkoutLaunchStore(directory: directory)
        let launch = GeneratedWorkoutLaunch(plan: try fixturePlan())
        try store.save(launch, clientEmail: "client@example.com")
        let file = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first)
        let corrupt = Data("invalid-json".utf8)
        try corrupt.write(to: file)
        XCTAssertThrowsError(try store.setArchived(true, id: launch.id, clientEmail: "client@example.com"))
        XCTAssertThrowsError(try store.setArchived(false, id: launch.id, clientEmail: "client@example.com"))
        XCTAssertThrowsError(try store.delete(id: launch.id, clientEmail: "client@example.com"))
        XCTAssertEqual(try Data(contentsOf: file), corrupt)
    }

    func testArchiveAndDeleteWriteFailuresLeaveTheOriginalFileIntact() throws {
        let directory = temporaryDirectory()
        defer {
            try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
            try? FileManager.default.removeItem(at: directory)
        }
        let store = GeneratedWorkoutLaunchStore(directory: directory)
        let launch = GeneratedWorkoutLaunch(plan: try fixturePlan())
        try store.save(launch, clientEmail: "client@example.com")
        let file = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first)
        let before = try Data(contentsOf: file)
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: directory.path)
        XCTAssertThrowsError(try store.setArchived(true, id: launch.id, clientEmail: "client@example.com"))
        XCTAssertThrowsError(try store.delete(id: launch.id, clientEmail: "client@example.com"))
        XCTAssertEqual(try Data(contentsOf: file), before)
        XCTAssertEqual(try store.load(clientEmail: "client@example.com"), [launch])
    }

    private func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("generated-archive-\(UUID().uuidString)")
    }

    private func fixturePlan() throws -> GeneratedWorkoutPlan {
        try WorkoutGenerator.generate(library: [ApprovedExercise(
            id: UUID(), name: "Dumbbell Floor Press", aliases: [], primaryMuscle: "chest", secondaryMuscles: [],
            equipment: "dumbbell", difficulty: "beginner", movementPattern: "horizontal_push",
            defaultSets: 3, defaultReps: "8-12", defaultRestSeconds: 75, substitutionGroup: "chest",
            demoURL: "https://www.youtube.com/watch?v=abc123", instructions: "Move with control."
        )], history: [], preferences: WorkoutGenerationPreferences(focus: .chest), seed: 1)
    }

    private func logRecord(code: String, name: String) throws -> WorkoutLogRecord {
        let data = try JSONSerialization.data(withJSONObject: [
            "exercise_code": code, "exercise_name": name,
            "set_number": 1, "weight_used": 20, "reps": 10
        ])
        return try JSONDecoder().decode(WorkoutLogRecord.self, from: data)
    }
}
