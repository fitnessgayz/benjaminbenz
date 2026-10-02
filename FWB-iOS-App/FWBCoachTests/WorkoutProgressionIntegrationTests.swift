import XCTest
import Supabase
@testable import FWBCoach

final class WorkoutProgressionIntegrationTests: XCTestCase {
    private func exercise(enabled: Bool = true) -> Exercise {
        Exercise(code: "A1", name: "Dumbbell Shoulder Press", prescription: "3 × 8–12",
            progression: WorkoutProgressionConfig(enabled: enabled, exerciseKey: "name:dumbbell shoulder press",
                repMin: 8, repMax: 12, plannedSets: 3, targetRIR: 2, increment: 2.5, unit: "lb"))
    }

    func testApplyingTargetsOnlyFillsEmptyUnfinishedNormalWorkingFields() {
        let exercise = exercise()
        let drafts = [
            WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "41"),
            WorkoutSetDraft(exercise: exercise, setNumber: 2, reps: "9"),
            WorkoutSetDraft(exercise: exercise, setNumber: 3, weight: "30", reps: "10", isCompleted: true),
            WorkoutSetDraft(exercise: exercise, setNumber: WorkoutSetNumber.warmUp(1), weight: "5", reps: "5", setType: .warmUp),
            WorkoutSetDraft(exercise: exercise, setNumber: 4, setType: .drop),
            WorkoutSetDraft(exercise: Exercise(code: "B1", name: exercise.name), setNumber: 1)
        ]
        let targets = (1...4).map { WorkoutProgressionTarget(setNumber: $0, weight: 32.5, reps: 8) }
        let result = WorkoutProgressionIntegration.applying(targets, to: exercise, drafts: drafts)
        XCTAssertEqual(result[0].weight, "41")
        XCTAssertEqual(result[0].reps, "8")
        XCTAssertEqual(result[1].weight, "32.5")
        XCTAssertEqual(result[1].reps, "9")
        XCTAssertEqual(Array(result[2...]), Array(drafts[2...]))
        XCTAssertFalse(result[0].isCompleted)
        XCTAssertFalse(result[1].isCompleted)
        XCTAssertEqual(result.map(\.id), drafts.map(\.id))
    }

    func testRecommendedRepsArePresentedAsPlaceholderWithoutMutatingDrafts() {
        let exercise = exercise()
        let other = Exercise(code: "B1", name: "Plank", prescription: "3 x 30 sec")
        let drafts = [
            WorkoutSetDraft(exercise: exercise, setNumber: 1),
            WorkoutSetDraft(exercise: exercise, setNumber: 2, reps: "10"),
            WorkoutSetDraft(exercise: exercise, setNumber: 3, weight: "25"),
            WorkoutSetDraft(exercise: exercise, setNumber: WorkoutSetNumber.warmUp(1), setType: .warmUp),
            WorkoutSetDraft(exercise: other, setNumber: 1)
        ]

        XCTAssertEqual(
            WorkoutProgressionIntegration.recommendedRepsPlaceholder(for: exercise, drafts: drafts),
            "8–12"
        )
        XCTAssertNil(WorkoutProgressionIntegration.recommendedRepsPlaceholder(for: other, drafts: drafts))
        XCTAssertEqual(drafts[0].reps, "")
        XCTAssertEqual(drafts[1].reps, "10")
        XCTAssertEqual(drafts[2].reps, "")
        XCTAssertEqual(drafts[2].weight, "25")
    }

    func testDisabledProgressionDoesNotProvideRecommendedRepsPlaceholder() {
        let disabled = exercise(enabled: false)
        let drafts = [WorkoutSetDraft(exercise: disabled, setNumber: 1)]
        XCTAssertNil(WorkoutProgressionIntegration.recommendedRepsPlaceholder(for: disabled, drafts: drafts))
    }

    func testFrozenPlanAndConfigurationSurviveOfflineAndActiveSessionRoundTrip() throws {
        let exercise = exercise()
        let drafts = WorkoutProgressionIntegration.freeze(exercises: [exercise],
            drafts: (1...3).map { WorkoutSetDraft(exercise: exercise, setNumber: $0) })
        let snapshot = OfflineWorkoutSession(clientEmail: "preview@example.invalid", entryDate: "2026-09-26",
            workoutTitle: "Progression", exercises: [exercise], drafts: drafts)
        let restored = try JSONDecoder().decode(OfflineWorkoutSession.self, from: JSONEncoder().encode(snapshot))
        XCTAssertEqual(restored.restoredExercises.first?.progression, exercise.progression)
        XCTAssertEqual(restored.restoredDrafts, drafts)
        let active = ActiveWorkoutSession(snapshot: snapshot, startedAt: Date(), entryDate: Date(),
            workoutID: UUID(), workoutFocus: "", workoutFormat: "single", isGeneratedWorkout: false,
            customWorkoutFormatRaw: "single", energyBefore: nil, energyAfter: nil)
        let restoredActive = try JSONDecoder().decode(ActiveWorkoutSession.self, from: JSONEncoder().encode(active))
        XCTAssertEqual(restoredActive.drafts.map(\.progressionTarget), drafts.map(\.progressionTarget))
    }

    func testDeletingSetAfterFreezeCannotLowerOriginalPlannedSetCount() {
        let exercise = exercise()
        let frozen = WorkoutProgressionIntegration.freeze(exercises: [exercise],
            drafts: (1...3).map { WorkoutSetDraft(exercise: exercise, setNumber: $0) })
        let shortened = WorkoutProgressionIntegration.freeze(exercises: [exercise], drafts: Array(frozen.prefix(2)))
        XCTAssertEqual(shortened.map { $0.progressionTarget?.plannedSets }, [3, 3])
    }

    func testLegacyCompletedRowsAreNotRetrofittedWithInventedPlan() {
        let exercise = exercise()
        let drafts = [WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "30", reps: "12", isCompleted: true)]
        XCTAssertEqual(WorkoutProgressionIntegration.freeze(exercises: [exercise], drafts: drafts), drafts)
    }

    func testExplicitDisabledAndMalformedConfigNeverEnableAutomaticTargets() throws {
        let disabled = exercise(enabled: false)
        XCTAssertEqual(WorkoutProgressionIntegration.config(for: disabled,
            drafts: [WorkoutSetDraft(exercise: disabled, setNumber: 1)])?.enabled, false)
        let data = Data(#"{"code":"A1","name":"Dumbbell Shoulder Press","prescription":"3 × 8–12","progression":{"enabled":true}}"#.utf8)
        let malformed = try JSONDecoder().decode(Exercise.self, from: data)
        XCTAssertTrue(malformed.hasInvalidProgression)
        XCTAssertNil(WorkoutProgression.defaultConfig(for: malformed, plannedSets: 3))
    }

    func testHistoryTargetRoundTripAndUnknownSetTypeFailsClosed() throws {
        let config = try XCTUnwrap(exercise().progression)
        let record = WorkoutHistoryRecord(sessionID: UUID(), entryDate: "2026-09-26", workoutTitle: "Test",
            exerciseCode: "A1", exerciseName: "Dumbbell Shoulder Press", setNumber: 1, weightUsed: 30,
            reps: 12, notes: nil, setType: .working, progressionTarget: config)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(record)) as? [String: Any])
        object["set_type"] = "future_special_set"
        object.removeValue(forKey: "fwb_set_type_known")
        let decoded = try JSONDecoder().decode(WorkoutHistoryRecord.self,
            from: JSONSerialization.data(withJSONObject: object))
        XCTAssertEqual(decoded.progressionTarget, config)
        XCTAssertFalse(decoded.hasKnownSetType)
        let cached = try JSONDecoder().decode(WorkoutHistoryRecord.self, from: JSONEncoder().encode(decoded))
        XCTAssertFalse(cached.hasKnownSetType)
    }

    func testCoachRenameInvalidatesOldExerciseConfigAndRetainsOtherMetadata() {
        let exercise = exercise()
        var draft = CoachExerciseEditingDraft(.object(["code": .string(exercise.code), "name": .string(exercise.name),
            "progression": WorkoutProgressionIntegration.json(exercise.progression), "coach_note": .string("Keep control")]))
        draft.raw["name"] = .string("Machine Shoulder Press")
        XCTAssertEqual(draft.value.objectValue["progression"], .null)
        XCTAssertEqual(draft.value.objectValue.string("coach_note"), "Keep control")
    }

    func testPoundsLoggerDoesNotStampKilogramPlansOnEntries() {
        var config = exercise().progression!
        config.unit = "kg"
        let kilograms = Exercise(code: "A1", name: exercise().name, prescription: "3 × 8–12", progression: config)
        let drafts = [WorkoutSetDraft(exercise: kilograms, setNumber: 1, weight: "40", reps: "10")]
        XCTAssertEqual(WorkoutProgressionIntegration.freeze(exercises: [kilograms], drafts: drafts), drafts)
    }

    func testInvalidExplicitMetadataSurvivesOfflineAndLayoutRoundTrip() throws {
        let data = Data(#"{"id":"F677C028-C907-4766-9F23-56F938781D20","client_email":"preview@example.invalid","workouts":[{"title":"Workout A","exercises":[{"code":"A1","name":"Dumbbell Shoulder Press","prescription":"3 × 8–12","progression":{"enabled":true}}]}]}"#.utf8)
        let program = try JSONDecoder().decode(ClientProgram.self, from: data)
        let workout = try XCTUnwrap(program.workouts.first)
        let malformed = try XCTUnwrap(workout.exercises.first)
        let snapshot = OfflineWorkoutSession(clientEmail: "preview@example.invalid", entryDate: "2026-09-26",
            workoutTitle: "Test", exercises: [malformed], drafts: [])
        let restored = try JSONDecoder().decode(OfflineWorkoutSession.self, from: JSONEncoder().encode(snapshot))
        XCTAssertTrue(restored.restoredExercises[0].hasInvalidProgression)
        XCTAssertNil(WorkoutProgression.defaultConfig(for: restored.restoredExercises[0], plannedSets: 3))
        let update = try ClientWorkoutLayoutUpdate.make(from: program, responseData: data,
            workoutID: workout.id, exercises: restored.restoredExercises)
        let updated = program.replacingWorkoutLayout(update.clientWorkoutLayout)
        XCTAssertTrue(updated.workouts[0].exercises[0].hasInvalidProgression)
    }

    func testPrescriptionEditsUpdateRangeWithoutChangingCoachEffortOrIncrement() {
        let original = exercise()
        let revised = WorkoutProgressionIntegration.revisedConfig(from: original,
            name: original.name, prescription: "4 × 6–8")
        XCTAssertEqual(revised?.repMin, 6)
        XCTAssertEqual(revised?.repMax, 8)
        XCTAssertEqual(revised?.plannedSets, 4)
        XCTAssertEqual(revised?.targetRIR, original.progression?.targetRIR)
        XCTAssertEqual(revised?.increment, original.progression?.increment)
        XCTAssertEqual(WorkoutProgressionIntegration.revisedConfig(from: original,
            name: original.name, prescription: "As comfortable")?.enabled, false)
        var coach = CoachExerciseEditingDraft(.object(["code": .string(original.code), "name": .string(original.name),
            "prescription": .string(original.prescription), "progression": WorkoutProgressionIntegration.json(original.progression)]))
        coach.prescription = "4 × "
        XCTAssertNotNil(coach.progressionValidationMessage)
        coach.prescription = "4 × 6–8"
        XCTAssertTrue(coach.progression.enabled)
        XCTAssertEqual(coach.progression.repMax, 8)
        XCTAssertNil(coach.progressionValidationMessage)
    }


    func testOnlyMissingProgressionColumnAllowsCompatibilityFallback() {
        XCTAssertTrue(WorkoutProgressionIntegration.isMissingTargetColumn(
            PostgrestError(code: "42703", message: "column client_workout_logs.progression_target does not exist")))
        XCTAssertTrue(WorkoutProgressionIntegration.isMissingTargetColumn(
            PostgrestError(code: "PGRST204", message: "Could not find the progression_target column in the schema cache")))
        XCTAssertFalse(WorkoutProgressionIntegration.isMissingTargetColumn(CancellationError()))
        XCTAssertFalse(WorkoutProgressionIntegration.isMissingTargetColumn(URLError(.notConnectedToInternet)))
        XCTAssertFalse(WorkoutProgressionIntegration.isMissingTargetColumn(
            PostgrestError(code: "42501", message: "permission denied for progression_target")))
        XCTAssertFalse(WorkoutProgressionIntegration.isMissingTargetColumn(
            PostgrestError(code: "42703", message: "column unrelated_column does not exist")))
    }

}
