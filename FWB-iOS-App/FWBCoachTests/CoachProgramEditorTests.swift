import XCTest
@testable import FWBCoach

final class CoachProgramEditorTests: XCTestCase {
    func testUnchangedDraftPreservesCompleteDocumentAndOriginalRevision() {
        let original = sampleProgram()
        let draft = CoachProgramEditingDraft(program: original)
        XCTAssertEqual(draft.program, original)
        XCTAssertEqual(draft.program.raw, original.raw)
        XCTAssertEqual(draft.program.originalRaw, original.originalRaw)
    }

    func testProgramAndExerciseEditsPreserveUnknownFieldsAndLoadedSnapshot() {
        let original = sampleProgram()
        var draft = CoachProgramEditingDraft(program: original)
        draft.raw["program_title"] = .string("Next block")
        draft.workouts[0].raw["title"] = .string("Upper body")
        draft.workouts[0].exercises[0].raw["prescription"] = .string("8 reps/side x 4 sets")
        let result = draft.program
        XCTAssertEqual(result.originalRaw, original.originalRaw)
        XCTAssertEqual(result.id, original.id)
        XCTAssertEqual(result.raw["unknown_program_data"], original.raw["unknown_program_data"])
        XCTAssertEqual(result.raw["nutrition_plan"], original.raw["nutrition_plan"])
        XCTAssertEqual(result.raw["session_package_history"], original.raw["session_package_history"])
        let workout = result.raw.array("workouts")[0].objectValue
        XCTAssertEqual(workout["unknown_workout_data"], .object(["tempo": .string("controlled")]))
        XCTAssertEqual(workout.string("id"), "original-workout-id")
        let exercise = workout.array("exercises")[0].objectValue
        XCTAssertEqual(exercise["unknown_exercise_data"], .array([.number(10), .bool(true)]))
        XCTAssertEqual(exercise.string("prescription"), "8 reps/side x 4 sets")
        XCTAssertEqual(exercise.string("video_url"), "https://youtu.be/demo")
    }

    func testLegacyDraftWithoutUpdatedAtRetainsUneditedOriginalForFreshnessCheck() {
        var raw = sampleProgram().raw
        raw.removeValue(forKey: "updated_at")
        let original = CoachClientProgram(raw: raw)
        var draft = CoachProgramEditingDraft(program: original)
        draft.raw["program_summary"] = .string("Updated summary")
        XCTAssertEqual(draft.program.originalRaw, raw)
        XCTAssertNotEqual(draft.program.raw, raw)
    }

    func testNewProgramKeepsStableLocalIdentityAndOmitsServerID() {
        let original = CoachClientProgram.newClient(email: "client@example.com", name: "Client")
        var draft = CoachProgramEditingDraft(program: original)
        draft.raw["program_title"] = .string("First block")
        XCTAssertEqual(draft.program.id, original.id)
        XCTAssertEqual(draft.program.id, draft.program.id)
        XCTAssertNil(draft.program.raw["id"])
        XCTAssertFalse(draft.program.isPersisted)
    }

    func testExcludingAndReorderingWorkoutsDoesNotRewriteRemainingMetadata() {
        let original = sampleProgram()
        var draft = CoachProgramEditingDraft(program: original)
        let extra = CoachWorkoutEditingDraft(.object([
            "title": .string("Second workout"), "custom": .bool(true), "exercises": .array([])
        ]))
        draft.workouts.append(extra)
        draft.workouts.swapAt(0, 1)
        XCTAssertEqual(draft.program.raw.array("workouts")[0], extra.value)
        draft.workouts[1].isIncluded = false
        XCTAssertEqual(draft.program.raw.array("workouts"), [extra.value])
        draft.workouts[1].isIncluded = true
        XCTAssertEqual(draft.program.raw.array("workouts")[1], original.raw.array("workouts")[0])
    }

    func testExerciseReorderAndDeletionPreserveMetadataOfRetainedExercises() {
        var draft = CoachProgramEditingDraft(program: sampleProgram())
        let originalExercise = draft.workouts[0].exercises[0].value
        let second = CoachExerciseEditingDraft(.object(["code": .string("B1"), "name": .string("Row"), "extra": .number(7)]))
        draft.workouts[0].exercises.append(second)
        draft.workouts[0].exercises.swapAt(0, 1)
        XCTAssertEqual(draft.workouts[0].value.objectValue.array("exercises"), [second.value, originalExercise])
        draft.workouts[0].exercises.remove(at: 1)
        XCTAssertEqual(draft.workouts[0].value.objectValue.array("exercises"), [second.value])
    }

    func testInstructionsAndVideoAliasesRemainUnchangedUntilEdited() {
        var exercise = CoachExerciseEditingDraft(.object([
            "name": .string("Row"), "code": .string("A1"),
            "how_to": .string("First cue\nSecond cue"), "video_url": .string("https://youtu.be/demo"),
            "extra": .number(5)
        ]))
        XCTAssertEqual(exercise.instructionText, "First cue\nSecond cue")
        XCTAssertEqual(exercise.video, "https://youtu.be/demo")
        XCTAssertNil(exercise.value.objectValue["instructions"])
        XCTAssertNil(exercise.value.objectValue["video"])
        exercise.instructionText = "Updated cue\nKeep control"
        exercise.video = "https://youtu.be/replacement"
        XCTAssertEqual(exercise.value.objectValue.array("instructions"), [.string("Updated cue"), .string("Keep control")])
        XCTAssertEqual(exercise.value.objectValue.string("video"), "https://youtu.be/replacement")
        XCTAssertEqual(exercise.value.objectValue["extra"], .number(5))
    }

    func testLibraryExerciseCarriesTargetsInstructionsAndUploadedDemoWithoutInventedWeight() {
        let demo = "https://project.supabase.co/storage/v1/object/public/exercise-videos/coach/video.mp4"
        let exercise = CoachExerciseEditingDraft(code: "A2", libraryEntry: [
            "name": .string("Single-arm Press"), "default_reps": .string("10/side"), "default_sets": .number(3),
            "default_rest_seconds": .number(75), "demo_url": .string(demo), "instructions": .string("Keep control.\nBreathe."),
            "primary_muscle": .string("shoulders")
        ])
        XCTAssertEqual(exercise.raw.string("prescription"), "10/side x 3 sets")
        XCTAssertEqual(exercise.raw.string("rest"), "75 sec")
        XCTAssertEqual(exercise.video, demo)
        XCTAssertEqual(exercise.instructionText, "Keep control.\nBreathe.")
        XCTAssertNil(exercise.raw["weight"])
    }

    func testSevenWorkoutLimitAndDuplicateCodesAreValidated() {
        var draft = CoachProgramEditingDraft(program: sampleProgram())
        draft.workouts = (1...8).map(CoachWorkoutEditingDraft.init(number:))
        XCTAssertTrue(draft.validationMessage?.contains("seven") == true)
        draft.workouts[7].isIncluded = false
        XCTAssertNil(draft.validationMessage)
        draft = CoachProgramEditingDraft(program: sampleProgram())
        draft.workouts[0].exercises.append(CoachExerciseEditingDraft(.object(["name": .string("Other press"), "code": .string(" a1 ")])))
        XCTAssertTrue(draft.validationMessage?.contains("different code") == true)
    }

    func testBlankNewExerciseRequiresNameAndCodeAndGeneratedCodeAvoidsCollision() {
        var draft = CoachProgramEditingDraft(program: sampleProgram())
        XCTAssertEqual(draft.workouts[0].nextExerciseCode, "A2")
        draft.workouts[0].exercises.append(CoachExerciseEditingDraft(code: draft.workouts[0].nextExerciseCode))
        XCTAssertTrue(draft.validationMessage?.contains("Name each exercise") == true)
        draft.workouts[0].exercises[1].raw["name"] = .string("Row")
        XCTAssertNil(draft.validationMessage)
        draft.workouts[0].exercises[1].raw["code"] = .string("")
        XCTAssertTrue(draft.validationMessage?.contains("exercise code") == true)
    }

    private func sampleProgram() -> CoachClientProgram {
        CoachClientProgram(raw: [
            "id": .string("10000000-0000-0000-0000-000000000001"),
            "updated_at": .string("2026-09-25T12:00:00Z"),
            "client_email": .string("client@example.com"), "client_name": .string("Client"),
            "program_title": .string("Training block"), "program_summary": .string("Original summary"),
            "nutrition_plan": .object(["protein": .number(120)]),
            "session_package_history": .array([.object(["total": .number(12)])]),
            "unknown_program_data": .object(["nested": .array([.bool(true), .null])]),
            "workouts": .array([.object([
                "id": .string("original-workout-id"), "title": .string("Strength"), "format": .string("single"),
                "unknown_workout_data": .object(["tempo": .string("controlled")]),
                "exercises": .array([.object([
                    "code": .string("A1"), "name": .string("Press"), "prescription": .string("10 reps x 3 sets"),
                    "rest": .string("60 sec"), "video_url": .string("https://youtu.be/demo"),
                    "how_to": .string("Move with control."), "unknown_exercise_data": .array([.number(10), .bool(true)])
                ])])
            ])])
        ])
    }
}
