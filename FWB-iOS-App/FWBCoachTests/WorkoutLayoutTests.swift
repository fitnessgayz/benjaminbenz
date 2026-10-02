import XCTest
@testable import FWBCoach

final class WorkoutLayoutTests: XCTestCase {
    func testCoachNavigationUsesCoachDestinationsOnly() {
        XCTAssertEqual(CoachWorkspaceTab.allCases.map(\.rawValue), ["home", "clients", "inbox", "exercises", "account"])
        XCTAssertEqual(Set(CoachWorkspaceTab.allCases.map(\.id)).count, CoachWorkspaceTab.allCases.count)
        XCTAssertEqual(CoachWorkspaceTab.clients.title, "Clients")
    }

    func testCanonicalClientBrandCopy() {
        XCTAssertEqual(FWBBrand.productName, "FWB Training")
        XCTAssertEqual(FWBBrand.promise, "Train with intention. Feel your progress.")
    }

    private let programID = UUID(uuidString: "A6875577-72B1-4EB5-85F1-85A856CA93F0")!
    private var source: [[String: Any]] {
        [
            ["title": "Workout A", "focus": "Strength", "coach_revision": 1,
             "exercises": [["code": "A1", "name": "Press", "prescription": "3 × 8"], ["code": "A2", "name": "Curl"]]],
            ["title": "Workout B", "exercises": [["code": "B1", "name": "Squat"]]]
        ]
    }

    func testV2AppliesPersonalExercisesWithoutReorderingAssignedWorkouts() throws {
        let layout = try makeLayout(exercises: [[
            ["code": "A2", "name": "Row", "prescription": "4 × 10", "rest": "90 sec"],
            ["code": "A1", "name": "Press", "prescription": "3 × 8"]
        ], []])
        let program = try decode(workouts: source, layout: layout)
        XCTAssertEqual(program.workouts.map(\.title), ["Workout A", "Workout B"])
        XCTAssertEqual(program.workouts[0].exercises.map(\.name), ["Row", "Press"])
        XCTAssertEqual(program.workouts[0].exercises[0].prescription, "4 × 10")
        XCTAssertEqual(program.workouts[0].exercises[0].rest, "90 sec")
        XCTAssertTrue(program.workouts[1].exercises.isEmpty)
        XCTAssertEqual(program.assignedWorkouts[0].exercises.map(\.name), ["Press", "Curl"])
        XCTAssertEqual(program.workouts.map(\.id), program.assignedWorkouts.map(\.id))
    }

    func testCoachChangesToUnknownSourceFieldsInvalidateSavedEdits() throws {
        let layout = try makeLayout(exercises: [[ ["name": "Row"] ], []])
        var changed = source
        changed[0]["coach_revision"] = 2
        let program = try decode(workouts: changed, layout: layout)
        XCTAssertEqual(program.workouts, program.assignedWorkouts)
        XCTAssertEqual(program.workouts[0].exercises[0].name, "Press")
    }

    func testCoachPrescriptionChangeInvalidatesSavedEdits() throws {
        let layout = try makeLayout(exercises: [[ ["name": "Row"] ], []])
        var changed = source
        changed[0]["exercises"] = [["name": "Press", "prescription": "5 × 5"]]
        let program = try decode(workouts: changed, layout: layout)
        XCTAssertEqual(program.workouts[0].exercises[0].prescription, "5 × 5")
    }

    func testLegacyMalformedAndWrongVersionLayoutsUseAssignedWorkouts() throws {
        let valid = try makeLayout(exercises: [[ ["name": "Row"] ], []])
        let layouts: [Any] = [
            NSNull(), "invalid", ["version": 1, "source": valid["source"]!, "order": []],
            ["version": "2", "source": valid["source"]!, "exercises": [[]]],
            ["version": 2, "source": "not JSON", "exercises": [[]]],
            ["version": 2, "source": valid["source"]!, "exercises": "invalid"]
        ]
        for layout in layouts {
            let program = try decode(workouts: source, layout: layout)
            XCTAssertEqual(program.workouts, program.assignedWorkouts)
        }
    }

    func testMalformedExerciseArrayFallsBackPerWorkoutAndMissingIndexIsPreserved() throws {
        let malformedExercises: [[Any]] = [[NSNull(), "invalid"]]
        let malformed = try makeLayout(exercises: malformedExercises)
        let invalidProgram = try decode(workouts: source, layout: malformed)
        XCTAssertEqual(invalidProgram.workouts, invalidProgram.assignedWorkouts)

        let partial = try makeLayout(exercises: [[ ["name": "Row"] ]])
        let program = try decode(workouts: source, layout: partial)
        XCTAssertEqual(program.workouts[0].exercises[0].name, "Row")
        XCTAssertEqual(program.workouts[1], program.assignedWorkouts[1])
    }

    func testNumericKeyedExerciseOverridesMatchWebPropertyAccess() throws {
        let layout = try makeLayout(exercises: ["0": [["name": "Row"]], "1": []])
        let program = try decode(workouts: source, layout: layout)
        XCTAssertEqual(program.workouts[0].exercises[0].name, "Row")
        XCTAssertTrue(program.workouts[1].exercises.isEmpty)
    }

    func testNullOptionalProgramFieldsDoNotBlockWorkouts() throws {
        let program = try decode(workouts: source, layout: NSNull())
        XCTAssertEqual(program.clientName, "Client")
        XCTAssertEqual(program.sessionCountUsed, 0)
        XCTAssertEqual(program.workouts.count, 2)
    }

    func testNutritionReplacementPreservesAssignedAndPersonalWorkouts() throws {
        let program = try decode(workouts: source, layout: makeLayout(exercises: [[ ["name": "Row"] ], []]))
        let plan = try XCTUnwrap(ClientProgram.preview.nutritionPlan)
        let updated = program.replacingNutritionPlan(plan)
        XCTAssertEqual(updated.workouts, program.workouts)
        XCTAssertEqual(updated.assignedWorkouts, program.assignedWorkouts)
        XCTAssertEqual(updated.clientWorkoutLayout, program.clientWorkoutLayout)
    }

    @MainActor
    func testProgramSelectionOnlySelectsAvailablePrograms() throws {
        let first = try decode(workouts: source, layout: NSNull())
        let second = try decode(workouts: [], layout: NSNull(), id: UUID())
        let store = ClientProgramStore(previewProgram: first, availablePrograms: [first, second])
        store.selectProgram(second.id)
        XCTAssertEqual(store.program?.id, second.id)
        XCTAssertEqual(store.availablePrograms.count, 2)
        store.selectProgram(UUID())
        XCTAssertEqual(store.program?.id, second.id)
    }

    func testUpdateEncodingMatchesWebFingerprintAndPreservesUnknownExerciseFields() throws {
        let raw = #"[{"title":"A","exercises":[{"name":"Press","code":"A1","coach":{"tempo":"slow"}},{"name":"Row","code":"A2","video_url":"https://example.com/demo","extra":true}]},{"title":"B","exercises":[{"name":"Squat","code":"B1","note":"retain"}]}]"#
        let data = Data("{\"id\":\"\(programID.uuidString)\",\"client_email\":\"client@example.com\",\"workouts\":\(raw)}".utf8)
        let program = try JSONDecoder().decode(ClientProgram.self, from: data)
        let update = try ClientWorkoutLayoutUpdate.make(
            from: program, responseData: data, workoutID: program.workouts[0].id,
            exercises: Array(program.workouts[0].exercises.reversed())
        )
        let encoded = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(update)) as? [String: Any])
        XCTAssertEqual(Set(encoded.keys), ["client_workout_layout"])
        let layout = try XCTUnwrap(encoded["client_workout_layout"] as? [String: Any])
        XCTAssertEqual(layout["source"] as? String, raw)
        let exercises = try XCTUnwrap(layout["exercises"] as? [[[String: Any]]])
        XCTAssertEqual(exercises[0][0]["name"] as? String, "Row")
        XCTAssertEqual(exercises[0][0]["extra"] as? Bool, true)
        XCTAssertNil(exercises[0][0]["video"])
        XCTAssertEqual(exercises[0][0]["video_url"] as? String, "https://example.com/demo")
        XCTAssertEqual((exercises[0][1]["coach"] as? [String: String])?["tempo"], "slow")
        XCTAssertEqual(exercises[1][0]["note"] as? String, "retain")
    }

    func testUpdatePreservesOtherWorkoutOverridesAndRestoreUsesAssignedExercises() throws {
        let original = try decode(workouts: source, layout: makeLayout(exercises: [[ ["code": "A1", "name": "Row"] ], []]))
        let data = try original.workoutLayoutPreviewResponseData()
        let update = try ClientWorkoutLayoutUpdate.make(
            from: original, responseData: data, workoutID: original.workouts[0].id,
            exercises: [Exercise(code: "A1", name: "Row", prescription: "5 × 6")]
        )
        let edited = original.replacingWorkoutLayout(update.clientWorkoutLayout)
        XCTAssertEqual(edited.workouts[0].exercises[0].prescription, "5 × 6")
        XCTAssertTrue(edited.workouts[1].exercises.isEmpty)
        XCTAssertFalse(original.hasSameWorkoutRevision(as: edited))
        let restore = try ClientWorkoutLayoutUpdate.make(from: edited, responseData: data, restoring: true)
        XCTAssertEqual(edited.replacingWorkoutLayout(restore.clientWorkoutLayout).workouts, original.assignedWorkouts)
    }

    @MainActor
    func testPreviewCanEditAndRestoreWithoutAnAuthenticatedSession() async throws {
        let original = ClientProgram.preview
        let store = ClientProgramStore(previewProgram: original)
        let saved = await store.saveWorkoutExercises(
            workoutID: original.workouts[0].id,
            exercises: [Exercise(code: "A1", name: "Preview Row", prescription: "3 × 10")]
        )
        XCTAssertTrue(saved)
        XCTAssertEqual(store.program?.workouts[0].exercises.first?.name, "Preview Row")
        XCTAssertEqual(store.workoutLayoutSaveState, .saved)
        let restored = await store.restoreAssignedWorkoutExercises()
        XCTAssertTrue(restored)
        XCTAssertEqual(store.program?.workouts, original.assignedWorkouts)
    }

    private func makeLayout(exercises: Any) throws -> [String: Any] {
        let data = try JSONSerialization.data(withJSONObject: source, options: [.sortedKeys])
        return ["version": 2, "source": String(decoding: data, as: UTF8.self), "order": [1, 0], "exercises": exercises]
    }

    private func decode(workouts: [[String: Any]], layout: Any, id: UUID? = nil) throws -> ClientProgram {
        let object: [String: Any] = [
            "id": (id ?? programID).uuidString, "client_email": "client@example.com",
            "client_name": NSNull(), "session_count_used": NSNull(),
            "workouts": workouts, "client_workout_layout": layout
        ]
        return try JSONDecoder().decode(ClientProgram.self, from: JSONSerialization.data(withJSONObject: object))
    }
}
