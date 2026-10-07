import Supabase
import XCTest
@testable import FWBCoach

final class WorkoutParityTests: XCTestCase {
    private let press = Exercise(code: "A1", name: "Dumbbell Press", prescription: "3 × 8–10")
    private let row = Exercise(code: "A2", name: "Dumbbell Row", prescription: "2 × 10")
    private let squat = Exercise(code: "B1", name: "Goblet Squat", prescription: "4 × 8")

    func testStraightSetsKeepEachExerciseAndStableIdentityAfterReorder() {
        let exercises = [press, row, squat]
        let groups = WorkoutParityModel.groups(exercises: exercises, assignments: [:])
        XCTAssertEqual(groups.map(\.format), [.single, .single, .single])
        XCTAssertEqual(groups.map(\.title), ["Dumbbell Press", "Dumbbell Row", "Goblet Squat"])
        XCTAssertEqual(groups.flatMap(\.exercises), exercises)
        let reordered = WorkoutParityModel.groups(exercises: [squat, press, row], assignments: [:])
        XCTAssertEqual(reordered[1].id, groups[0].id)
    }

    func testCustomSupersetsAndCircuitsUseTheSameProjection() {
        let exercises = [press, row, squat]
        let pairs = WorkoutParityModel.groups(exercises: exercises,
            assignments: WorkoutSequencePlanner.customAssignments(for: .superset, exercises: exercises))
        XCTAssertEqual(pairs.map(\.format), [.superset, .single])
        XCTAssertEqual(pairs[0].exercises, [press, row])
        XCTAssertEqual(pairs[1].exercises, [squat])

        let circuit = WorkoutParityModel.groups(exercises: exercises,
            assignments: WorkoutSequencePlanner.customAssignments(for: .circuit, exercises: exercises))
        XCTAssertEqual(circuit.count, 1)
        XCTAssertEqual(circuit[0].format, .circuit)
        XCTAssertEqual(circuit[0].exercises, exercises)
    }

    func testAssignedNonadjacentGroupsRetainOrderAndPrescriptions() {
        let workout = Workout(title: "Assigned", format: "superset", exercises: [press, squat, row])
        let groups = WorkoutParityModel.groups(exercises: workout.exercises,
            assignments: WorkoutSequencePlanner.inferredAssignments(for: workout))
        XCTAssertEqual(groups.map(\.format), [.superset, .single])
        XCTAssertEqual(groups[0].exercises, [press, row])
        XCTAssertEqual(groups[0].exercises.map(\.prescription), ["3 × 8–10", "2 × 10"])
        XCTAssertEqual(groups[1].exercises, [squat])
    }

    func testMixedGroupsWithMatchingIDsButDifferentKindsStaySeparate() {
        let fourth = Exercise(code: "B2", name: "Lunge")
        let pair = WorkoutGroupAssignment(id: "A", kind: .superset, label: "Pair")
        let circuit = WorkoutGroupAssignment(id: "A", kind: .circuit, label: "Circuit")
        let groups = WorkoutParityModel.groups(exercises: [press, row, squat, fourth], assignments: [
            press.id: pair, row.id: pair, squat.id: circuit, fourth.id: circuit
        ])
        XCTAssertEqual(groups.map(\.format), [.superset, .circuit])
        XCTAssertEqual(Set(groups.map(\.id)).count, 2)
    }

    func testRoundsPreserveUnequalSetCountsGapsAndSeparateWarmups() {
        let group = pairedGroup()
        let drafts = [
            draft(press, set: 1), draft(row, set: 1), draft(press, set: 3),
            draft(press, set: WorkoutSetNumber.warmUp(1)), draft(row, set: WorkoutSetNumber.warmUp(2))
        ]
        XCTAssertEqual(WorkoutParityModel.roundCount(group: group, drafts: drafts), 2)
        XCTAssertEqual(WorkoutParityModel.roundDrafts(group: group, round: 1, drafts: drafts).map(\.exerciseCode), ["A1", "A2"])
        XCTAssertEqual(WorkoutParityModel.roundDrafts(group: group, round: 2, drafts: drafts).map(\.setNumber), [3])
        XCTAssertEqual(WorkoutParityModel.roundDrafts(group: group, round: 0, drafts: drafts).map(\.setNumber), [1001, 1002])
        XCTAssertTrue(WorkoutParityModel.roundDrafts(group: group, round: 3, drafts: drafts).isEmpty)
        XCTAssertTrue(WorkoutParityModel.roundDrafts(group: group, round: -1, drafts: drafts).isEmpty)
    }

    func testOptionalWarmupAndExplicitBodyweightValidation() {
        var warmup = draft(press, set: 1001)
        warmup.notes = "Optional preparation"
        XCTAssertNil(WorkoutParityModel.validationMessage(for: warmup))
        warmup.weight = "0"
        XCTAssertNotNil(WorkoutParityModel.validationMessage(for: warmup))
        warmup.reps = "0"
        XCTAssertNil(WorkoutParityModel.validationMessage(for: warmup))

        var working = draft(press, set: 1, reps: "8")
        XCTAssertNotNil(WorkoutParityModel.validationMessage(for: working))
        working.weight = "0"
        XCTAssertNil(WorkoutParityModel.validationMessage(for: working))
        working.reps = "0"
        XCTAssertNotNil(WorkoutParityModel.validationMessage(for: working))
        working.reps = "8"
        for weight in ["-1", "nan", "inf"] {
            working.weight = weight
            XCTAssertNotNil(WorkoutParityModel.validationMessage(for: working))
        }
    }

    func testTimedDurationAndRIRValidation() {
        var timed = WorkoutSetDraft(exercise: press, setNumber: 1, setType: .timed)
        XCTAssertNotNil(WorkoutParityModel.validationMessage(for: timed))
        for value in ["0", "-3", "nan", "inf"] {
            timed.duration = value
            XCTAssertNotNil(WorkoutParityModel.validationMessage(for: timed))
        }
        timed.duration = "30"
        XCTAssertNil(WorkoutParityModel.validationMessage(for: timed))
        timed.effortScale = .rir
        for value in ["0", "5", "2.5"] {
            timed.effort = value
            XCTAssertNil(WorkoutParityModel.validationMessage(for: timed))
        }
        for value in ["-1", "6", "nan"] {
            timed.effort = value
            XCTAssertNotNil(WorkoutParityModel.validationMessage(for: timed))
        }
    }

    func testPersonalRecordIsOneActualSetExcludingWarmupAndOtherExercises() {
        let heavy = record(press, weight: 80, reps: 5)
        let history = [
            record(press, weight: 60, reps: 15), heavy,
            record(press, weight: 100, reps: 12, type: .warmUp),
            record(row, weight: 120, reps: 8),
            record(press, weight: 120, reps: 0)
        ]
        XCTAssertEqual(WorkoutParityModel.personalRecord(for: press, history: history), heavy)
        let bodyweight = record(press, weight: 0, reps: 20)
        XCTAssertEqual(WorkoutParityModel.personalRecord(for: press, history: [bodyweight]), bodyweight)
    }

    func testCopyPRFillsEmptyFieldsWithoutOverwritingOtherMetricsOrCompletedRows() {
        var first = draft(press, set: 1, weight: "35")
        first.notes = "Keep my note"
        first.effort = "2"
        first.effortScale = .rir
        var second = draft(row, set: 1)
        second.isCompleted = true
        let copy = WorkoutParityModel.copyPersonalRecords(group: pairedGroup(), round: 1,
            drafts: [first, second], history: [record(press, weight: 80, reps: 5), record(row, weight: 50, reps: 10)])
        XCTAssertEqual(copy.drafts[0].weight, "35")
        XCTAssertEqual(copy.drafts[0].reps, "5")
        XCTAssertEqual(copy.drafts[0].notes, first.notes)
        XCTAssertEqual(copy.drafts[0].effort, first.effort)
        XCTAssertEqual(copy.drafts[1], second)
        XCTAssertEqual(copy.changes.map(\.field), [.reps])
        XCTAssertEqual(copy.copiedDraftIDs, [first.id])
    }

    func testUndoPreservesLaterEditsAndCompletedSets() {
        let original = [draft(press, set: 1), draft(row, set: 1)]
        let copy = WorkoutParityModel.copyPersonalRecords(group: pairedGroup(), round: 1,
            drafts: original, history: [record(press, weight: 80, reps: 5), record(row, weight: 50, reps: 10)])
        var edited = copy.drafts
        edited[0].weight = "85"
        edited[1].isCompleted = true
        let undone = WorkoutParityModel.undoCopy(copy, in: edited)
        XCTAssertEqual(undone[0].weight, "85")
        XCTAssertEqual(undone[0].reps, "")
        XCTAssertEqual(undone[1], edited[1])
    }

    func testCopyPreviousRoundMatchesExerciseAndFillsEachFieldIndependently() {
        let drafts = [draft(press, set: 1, weight: "0", reps: "8"),
                      draft(row, set: 1, weight: "50", reps: "10"),
                      draft(press, set: 2, reps: "12"), draft(row, set: 2, weight: "55")]
        let copy = WorkoutParityModel.copyPreviousRound(group: pairedGroup(), round: 2, drafts: drafts)
        XCTAssertEqual(copy.drafts[2].weight, "0")
        XCTAssertEqual(copy.drafts[2].reps, "12")
        XCTAssertEqual(copy.drafts[3].weight, "55")
        XCTAssertEqual(copy.drafts[3].reps, "10")
        XCTAssertEqual(WorkoutParityModel.undoCopy(copy, in: copy.drafts), drafts)
        XCTAssertTrue(WorkoutParityModel.copyPreviousRound(group: pairedGroup(), round: 1, drafts: drafts).changes.isEmpty)
    }

    func testTimedPersonalRecordCopiesOnlyDurationFromTimedHistory() {
        let group = WorkoutParityModel.groups(exercises: [press], assignments: [:])[0]
        let target = WorkoutSetDraft(exercise: press, setNumber: 1, weight: "10", setType: .timed)
        let copy = WorkoutParityModel.copyPersonalRecords(group: group, round: 1, drafts: [target], history: [
            record(press, weight: 80, reps: 5),
            record(press, weight: 0, reps: nil, type: .timed, duration: 45),
            record(press, weight: 0, reps: nil, type: .timed, duration: 30)
        ])
        XCTAssertEqual(copy.drafts[0].duration, "45")
        XCTAssertEqual(copy.drafts[0].weight, "10")
        XCTAssertEqual(copy.drafts[0].reps, "")
        XCTAssertEqual(copy.changes.map(\.field), [.duration])
    }

    func testWorkingRoundLogsValidWarmupsAndIgnoresPartialOrNotesOnlyWarmups() {
        let working = draft(press, set: 1, weight: "35", reps: "8")
        var alreadyLogged = draft(row, set: 1, weight: "40", reps: "10")
        alreadyLogged.isCompleted = true
        let validWarmup = draft(press, set: 1001, weight: "15", reps: "10")
        let partialWarmup = draft(row, set: 1001, weight: "20")
        var notesOnlyWarmup = draft(press, set: 1002)
        notesOnlyWarmup.notes = "May do an extra warm-up"
        var loggedWarmup = draft(row, set: 1002, weight: "10", reps: "8")
        loggedWarmup.isCompleted = true

        let selected = WorkoutParityModel.rowsToLog(group: pairedGroup(), round: 1,
            drafts: [working, alreadyLogged, validWarmup, partialWarmup, notesOnlyWarmup, loggedWarmup])

        XCTAssertEqual(selected.map(\.id), [working.id, validWarmup.id])
        XCTAssertFalse(partialWarmup.isCompleted)
        XCTAssertFalse(notesOnlyWarmup.isCompleted)
    }

    func testExplicitWarmupReturnsEnteredInvalidRowsForValidation() {
        let invalid = draft(press, set: 1001, weight: "20")
        var notesOnly = draft(row, set: 1001)
        notesOnly.notes = "Optional"
        let blank = draft(press, set: 1002)

        let selected = WorkoutParityModel.rowsToLog(group: pairedGroup(), round: 0,
            drafts: [invalid, notesOnly, blank])

        XCTAssertEqual(selected.map(\.id), [invalid.id])
        XCTAssertNotNil(WorkoutParityModel.validationMessage(for: selected[0]))
        XCTAssertTrue(WorkoutParityModel.rowsToLog(group: pairedGroup(), round: -1, drafts: [invalid]).isEmpty)
    }

    func testFinishRejectsEmptyWorkoutIncludingBlankSlotsAndWarmupsOnly() {
        XCTAssertNotNil(WorkoutParityModel.finishValidationMessage(drafts: []))
        let blankExercise = Exercise(code: "CW1", name: "  ")
        let blankSlot = draft(blankExercise, set: 1)
        var warmup = draft(press, set: 1001, weight: "20", reps: "10")
        warmup.isCompleted = true
        XCTAssertNotNil(WorkoutParityModel.finishValidationMessage(drafts: [blankSlot, warmup]))
    }

    func testFinishRejectsPartiallyLoggedWorkout() {
        var completed = draft(press, set: 1, weight: "35", reps: "8")
        completed.isCompleted = true
        let pending = draft(press, set: 2, weight: "35", reps: "8")
        XCTAssertNotNil(WorkoutParityModel.finishValidationMessage(drafts: [completed, pending]))
    }

    func testFinishRejectsInvalidWorkingRowsEvenWhenMarkedComplete() {
        var invalid = draft(press, set: 1, weight: "35")
        XCTAssertNotNil(WorkoutParityModel.finishValidationMessage(drafts: [invalid]))
        invalid.isCompleted = true
        XCTAssertNotNil(WorkoutParityModel.finishValidationMessage(drafts: [invalid]))
        invalid.reps = "8"
        invalid.effortScale = .rir
        invalid.effort = "6"
        XCTAssertNotNil(WorkoutParityModel.finishValidationMessage(drafts: [invalid]))
    }

    func testFinishRejectsMissingExerciseNameEvenWhenMetricsAreCompleted() {
        let unnamed = Exercise(code: "CW1", name: " \n ")
        var completed = draft(unnamed, set: 1, weight: "35", reps: "8")
        completed.isCompleted = true
        XCTAssertEqual(WorkoutParityModel.finishValidationMessage(drafts: [completed]),
            "Name each exercise before finishing.")
    }

    func testFinishAllowsValidCompletedSetsAndIgnoresOptionalWarmupsAndBlankSlots() {
        var bodyweight = draft(press, set: 1, weight: "0", reps: "8")
        bodyweight.isCompleted = true
        var timed = WorkoutSetDraft(exercise: row, setNumber: 1, duration: "45", setType: .timed)
        timed.isCompleted = true
        let partialWarmup = draft(press, set: 1001, weight: "10")
        let blankSlot = draft(Exercise(code: "CW3", name: ""), set: 1)

        XCTAssertNil(WorkoutParityModel.finishValidationMessage(
            drafts: [bodyweight, timed, partialWarmup, blankSlot]))
    }

    func testReferenceSuggestionsPreserveCanonicalPrecedenceAndOriginalOrdering() {
        let approved = [
            approvedExercise("Coach Press", aliases: ["DB bench press", "shared alias"]),
            approvedExercise("Dumbbell Bench Press", aliases: ["shared alias"]),
            approvedExercise("Élevated Reach", aliases: ["reach & rotate"])
        ]
        let exercises = [Exercise(code: "CW1", name: "db bench press"), Exercise(code: "CW2", name: " ")]
        let suggested = [Exercise(code: "S1", name: "shared alias"), Exercise(code: "S2", name: "custom TRX move")]
        let historyNames = ["reach and rotate", "élevated reach", "  custom TRX move  "]
        let snapshot = WorkoutEntryReferenceData.make(exercises: exercises, suggestedExercises: suggested,
            approvedExercises: approved, historyNames: historyNames, history: [])
        let originalRawNames = [ExerciseSuggestionLibrary.merged([approved.map(\.name)]), ExerciseLibrary.names,
            suggested.map(\.name), exercises.map(\.name), historyNames].flatMap { $0 }.map {
                ExerciseNameIdentity.canonicalName(for: $0, approvedExercises: approved)
            }

        XCTAssertEqual(snapshot.suggestionNames, ExerciseSuggestionLibrary.merged([originalRawNames]))
        XCTAssertTrue(snapshot.suggestionNames.contains("Coach Press"))
        XCTAssertFalse(snapshot.suggestionNames.contains("Dumbbell Bench Press"))
        XCTAssertFalse(snapshot.suggestionNames.contains("Shared Alias"))
        XCTAssertTrue(snapshot.suggestionNames.contains("Custom TRX Move"))
        XCTAssertTrue(snapshot.suggestionNames.contains("Exercise"))
    }

    func testReferenceSnapshotRefreshAfterRenameKeepsRecordsBoundToExerciseName() {
        let original = Exercise(code: "CW1", name: "Custom Reach")
        let renamed = Exercise(code: "CW1", name: "Custom Pull")
        let reachRecord = record(original, weight: 20, reps: 10)
        let pullRecord = record(renamed, weight: 50, reps: 8)
        let history = [WorkoutHistorySession(entryDate: "2026-09-24", workoutTitle: "Previous workout",
            records: [reachRecord, pullRecord])]
        let before = WorkoutEntryReferenceData.make(exercises: [original], suggestedExercises: [],
            approvedExercises: [], historyNames: [], history: history)
        let after = WorkoutEntryReferenceData.make(exercises: [renamed], suggestedExercises: [],
            approvedExercises: [], historyNames: [], history: history)

        XCTAssertEqual(before.personalRecord(for: original, setType: .working), reachRecord)
        XCTAssertNil(before.personalRecord(for: renamed, setType: .working))
        XCTAssertEqual(after.personalRecord(for: renamed, setType: .working), pullRecord)
        XCTAssertTrue(after.suggestionNames.contains("Custom Pull"))
        XCTAssertFalse(after.suggestionNames.contains("Custom Reach"))
        XCTAssertTrue(before.suggestionNames.contains("Custom Reach"))
    }

    func testReferenceSuggestionsRefreshWhenCatalogAliasesOrSuggestionSourcesLoad() {
        let exercise = Exercise(code: "CW1", name: "Anchor Reach")
        let before = WorkoutEntryReferenceData.make(exercises: [exercise], suggestedExercises: [],
            approvedExercises: [approvedExercise("Coach Stretch")], historyNames: [], history: [])
        let after = WorkoutEntryReferenceData.make(exercises: [exercise],
            suggestedExercises: [Exercise(code: "S1", name: "Suggested Balance")],
            approvedExercises: [approvedExercise("Coach Stretch", aliases: ["Anchor Reach"])],
            historyNames: ["Historical Rotation"], history: [])

        XCTAssertTrue(before.suggestionNames.contains("Anchor Reach"))
        XCTAssertFalse(after.suggestionNames.contains("Anchor Reach"))
        XCTAssertTrue(after.suggestionNames.contains("Coach Stretch"))
        XCTAssertTrue(after.suggestionNames.contains("Suggested Balance"))
        XCTAssertTrue(after.suggestionNames.contains("Historical Rotation"))
    }

    func testReferencePersonalRecordsRefreshWhenHistoryArrivesWithoutMutatingOldSnapshot() {
        let before = WorkoutEntryReferenceData.make(exercises: [press], suggestedExercises: [],
            approvedExercises: [], historyNames: [], history: [])
        let result = record(press, weight: 80, reps: 5)
        let after = WorkoutEntryReferenceData.make(exercises: [press], suggestedExercises: [],
            approvedExercises: [], historyNames: [], history: [
                WorkoutHistorySession(entryDate: result.entryDate, workoutTitle: result.workoutTitle, records: [result])
            ])

        XCTAssertNil(WorkoutEntryReferenceData.empty.personalRecord(for: press, setType: .working))
        XCTAssertTrue(WorkoutEntryReferenceData.empty.suggestionNames.isEmpty)
        XCTAssertNil(before.personalRecord(for: press, setType: .working))
        XCTAssertEqual(after.personalRecord(for: press, setType: .working), result)
    }

    func testReferencePersonalRecordsSupportTypeChangesAndPreserveOriginalTieBreaks() {
        let earliest = record(press, weight: 80, reps: 5, date: "2026-08-01", set: 1)
        let timed = record(press, weight: 0, reps: nil, type: .timed, duration: 60)
        let records = [
            record(press, weight: 80, reps: 5, date: "2026-09-01"),
            record(press, weight: 80, reps: 5, date: "2026-08-01", set: 2),
            earliest, timed,
            record(press, weight: 100, reps: 5, type: .warmUp),
            record(press, weight: 0, reps: nil, type: .timed, duration: 45),
            record(row, weight: 200, reps: 5)
        ]
        let snapshot = WorkoutEntryReferenceData.make(exercises: [press], suggestedExercises: [],
            approvedExercises: [], historyNames: [], history: [
                WorkoutHistorySession(entryDate: "2026-09-24", workoutTitle: "History", records: records)
            ])

        for setType in WorkoutSetType.allCases {
            XCTAssertEqual(snapshot.personalRecord(for: press, setType: setType),
                WorkoutParityModel.personalRecord(for: press, history: records, setType: setType))
        }
        XCTAssertEqual(snapshot.personalRecord(for: press, setType: .working), earliest)
        XCTAssertEqual(snapshot.personalRecord(for: press, setType: .timed), timed)
    }

    private func approvedExercise(_ name: String, aliases: [String] = []) -> ApprovedExercise {
        ApprovedExercise(id: UUID(), name: name, aliases: aliases, primaryMuscle: "", secondaryMuscles: [],
            equipment: "", difficulty: "", movementPattern: "", defaultSets: 3, defaultReps: "8",
            defaultRestSeconds: 60, substitutionGroup: "", demoURL: nil, instructions: "")
    }

    private func pairedGroup() -> WorkoutParityGroup {
        let assignment = WorkoutGroupAssignment(id: "A", kind: .superset, label: "Superset A")
        return WorkoutParityModel.groups(exercises: [press, row], assignments: [press.id: assignment, row.id: assignment])[0]
    }

    private func draft(_ exercise: Exercise, set: Int, weight: String = "", reps: String = "") -> WorkoutSetDraft {
        WorkoutSetDraft(exercise: exercise, setNumber: set, weight: weight, reps: reps)
    }

    private func record(
        _ exercise: Exercise, weight: Double, reps: Double?,
        type: WorkoutSetType = .working, duration: Double? = nil,
        date: String = "2026-09-24", set: Int = 1
    ) -> WorkoutHistoryRecord {
        WorkoutHistoryRecord(entryDate: date, workoutTitle: "Previous workout",
            exerciseCode: exercise.code, exerciseName: exercise.name, setNumber: set,
            weightUsed: weight, reps: reps, notes: nil, setType: type, durationSeconds: duration)
    }
}

@MainActor
final class ExerciseLibraryStoreTests: XCTestCase {
    func testRecoveryCatalogOptInLoadsApprovedExercisesWithoutChangingOtherRequests() async throws {
        let transport = ExerciseLibraryHTTPStub()
        ExerciseLibraryURLProtocol.transport = transport
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ExerciseLibraryURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer {
            session.invalidateAndCancel()
            ExerciseLibraryURLProtocol.transport = nil
        }
        let client = SupabaseClient(
            supabaseURL: URL(string: "https://exercise-library-tests.example.com")!,
            supabaseKey: "test-key",
            options: .init(
                auth: .init(storage: ExerciseLibraryAuthStorage(), autoRefreshToken: false, accessToken: { nil }),
                global: .init(session: session)
            )
        )
        let store = ExerciseLibraryStore(client: client)

        await store.loadIfNeeded()

        XCTAssertNil(store.errorMessage)
        XCTAssertFalse(store.isLoading)
        XCTAssertEqual(store.exercises.map(\.name), ["Standing Chest Opener"])
        XCTAssertEqual(store.exercises.first?.movementPattern, "mobility")
        XCTAssertEqual(store.exercises.first?.defaultReps, "30 seconds")

        // Using the same client for another query must not opt it into the catalog.
        try await client.from("workout_programs").select("id").execute()

        let requests = transport.requests
        XCTAssertEqual(requests.count, 2)
        let libraryRequest = try XCTUnwrap(requests.first)
        XCTAssertEqual(libraryRequest.httpMethod, "GET")
        XCTAssertEqual(libraryRequest.url?.path, "/rest/v1/exercise_library")
        XCTAssertEqual(libraryRequest.value(forHTTPHeaderField: "x-fwb-recovery-catalog"), "1")
        let url = try XCTUnwrap(libraryRequest.url)
        let query = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
        let filters = Dictionary(uniqueKeysWithValues: (query.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(filters["is_active"], "eq.true")
        XCTAssertEqual(filters["is_approved"], "eq.true")
        XCTAssertEqual(filters["order"], "sort_order.asc.nullslast,name.asc.nullslast")
        let otherRequest = try XCTUnwrap(requests.last)
        XCTAssertEqual(otherRequest.url?.path, "/rest/v1/workout_programs")
        XCTAssertNil(otherRequest.value(forHTTPHeaderField: "x-fwb-recovery-catalog"))
    }
}

private struct ExerciseLibraryAuthStorage: AuthLocalStorage {
    func store(key: String, value: Data) throws {}
    func retrieve(key: String) throws -> Data? { nil }
    func remove(key: String) throws {}
}

private final class ExerciseLibraryHTTPStub: @unchecked Sendable {
    private let lock = NSLock()
    private var capturedRequests: [URLRequest] = []

    var requests: [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return capturedRequests
    }

    func response(for request: URLRequest) -> Data {
        lock.lock()
        capturedRequests.append(request)
        lock.unlock()
        guard request.url?.path == "/rest/v1/exercise_library",
              request.value(forHTTPHeaderField: "x-fwb-recovery-catalog") == "1" else {
            return Data("[]".utf8)
        }
        return Data("""
        [{
            "id": "11111111-1111-4111-8111-111111111111",
            "name": "Standing Chest Opener", "aliases": [],
            "primary_muscle": "chest", "secondary_muscles": ["shoulders"],
            "equipment": "bodyweight", "difficulty": "beginner", "movement_pattern": "mobility",
            "default_sets": 1, "default_reps": "30 seconds", "default_rest_seconds": 15,
            "substitution_group": "upper_body_recovery", "demo_url": null,
            "instructions": "Move gently through a comfortable range.",
            "is_active": true, "is_approved": true
        }]
        """.utf8)
    }
}

private final class ExerciseLibraryURLProtocol: URLProtocol {
    nonisolated(unsafe) static var transport: ExerciseLibraryHTTPStub?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let transport = Self.transport, let url = request.url,
              let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil,
                                             headerFields: ["Content-Type": "application/json"]) else {
            client?.urlProtocol(self, didFailWithError: URLError(.cancelled))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: transport.response(for: request))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
