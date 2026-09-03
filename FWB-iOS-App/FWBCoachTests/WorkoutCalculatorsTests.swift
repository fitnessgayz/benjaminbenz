import XCTest
@testable import FWBCoach

final class WorkoutCalculatorsTests: XCTestCase {
    func testPoundPlateBreakdownIsPerSideAndExact() {
        let result = PlateCalculator.calculate(
            targetWeight: 225,
            barWeight: 45,
            inventory: PlateWeightUnit.pounds.defaultInventory
        )

        XCTAssertTrue(result.isExact)
        XCTAssertEqual(result.loadedWeight, 225, accuracy: 0.001)
        XCTAssertEqual(result.platesPerSide, [PlateSelection(weight: 45, countPerSide: 2)])
    }

    func testKilogramPlateBreakdownSupportsFractionalPlates() {
        let inventory = [
            PlateInventoryItem(weight: 20, pairCount: 2),
            PlateInventoryItem(weight: 1.25, pairCount: 1)
        ]
        let result = PlateCalculator.calculate(
            targetWeight: 62.5,
            barWeight: 20,
            inventory: inventory
        )

        XCTAssertTrue(result.isExact)
        XCTAssertEqual(result.loadedWeight, 62.5, accuracy: 0.001)
        XCTAssertEqual(
            result.platesPerSide,
            [PlateSelection(weight: 20, countPerSide: 1), PlateSelection(weight: 1.25, countPerSide: 1)]
        )
    }

    func testImpossibleTargetReturnsNearestInventoryLoad() {
        let result = PlateCalculator.calculate(
            targetWeight: 225,
            barWeight: 45,
            inventory: [PlateInventoryItem(weight: 45, pairCount: 1)]
        )

        XCTAssertFalse(result.isExact)
        XCTAssertEqual(result.loadedWeight, 135, accuracy: 0.001)
        XCTAssertNotNil(result.feedback)
    }

    func testTargetBelowBarReturnsBarAndFeedback() {
        let result = PlateCalculator.calculate(
            targetWeight: 35,
            barWeight: 45,
            inventory: PlateWeightUnit.pounds.defaultInventory
        )

        XCTAssertFalse(result.isExact)
        XCTAssertEqual(result.loadedWeight, 45, accuracy: 0.001)
        XCTAssertTrue(result.platesPerSide.isEmpty)
    }

    func testWarmUpsStartWithBarAndRemainProgressiveAndLoadable() {
        let inventory = PlateWeightUnit.pounds.defaultInventory
        let sets = WarmUpCalculator.generate(
            workingWeight: 225,
            barWeight: 45,
            inventory: inventory
        )

        XCTAssertEqual(sets.first?.weight, 45)
        XCTAssertEqual(sets.first?.isBarOnly, true)
        XCTAssertEqual(sets.map(\.weight), sets.map(\.weight).sorted())
        XCTAssertEqual(Set(sets.map(\.weight)).count, sets.count)
        XCTAssertTrue(sets.allSatisfy { $0.weight < 225 })
        XCTAssertTrue(sets.allSatisfy {
            PlateCalculator.isLoadable($0.weight, barWeight: 45, inventory: inventory)
        })
    }

    func testLowWorkingWeightAvoidsDuplicateBarSets() {
        let sets = WarmUpCalculator.generate(
            workingWeight: 50,
            barWeight: 45,
            inventory: PlateWeightUnit.pounds.defaultInventory
        )

        XCTAssertEqual(sets.count, 1)
        XCTAssertEqual(sets.first?.weight, 45)
    }

    func testBarOnlyWorkingWeightNeedsNoWarmUpSets() {
        XCTAssertTrue(
            WarmUpCalculator.generate(
                workingWeight: 45,
                barWeight: 45,
                inventory: PlateWeightUnit.pounds.defaultInventory
            ).isEmpty
        )
    }

    func testWarmUpDraftUsesReservedTypeWithoutChangingWorkingSetNumbers() {
        let exercise = Exercise(code: "SQ01", name: "Back Squat")
        let warmUp = WorkoutSetDraft(
            exercise: exercise,
            setNumber: WorkoutSetNumber.warmUp(1),
            weight: "45",
            reps: "10"
        )
        let working = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "135", reps: "5")

        XCTAssertEqual(warmUp.setType, .warmUp)
        XCTAssertTrue(warmUp.isWarmUp)
        XCTAssertEqual(working.setType, .working)
        XCTAssertEqual(working.setNumber, 1)
    }

    func testZeroWeightBodyweightSetCountsAsAnEntry() {
        let exercise = Exercise(code: "BW01", name: "Push-up")
        let draft = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "0", reps: "")

        XCTAssertTrue(draft.containsEntry)
        XCTAssertEqual(draft.weightValue, 0)
    }

    func testWarmUpsStayOutOfWorkingHistoryMetrics() {
        let records = [
            WorkoutHistoryRecord(
                entryDate: "2026-08-21",
                workoutTitle: "Lower Strength",
                exerciseCode: "SQ01",
                exerciseName: "Back Squat",
                setNumber: WorkoutSetNumber.warmUp(1),
                weightUsed: 45,
                reps: 10,
                notes: nil
            ),
            WorkoutHistoryRecord(
                entryDate: "2026-08-21",
                workoutTitle: "Lower Strength",
                exerciseCode: "SQ01",
                exerciseName: "Back Squat",
                setNumber: 1,
                weightUsed: 135,
                reps: 5,
                notes: nil
            )
        ]
        let session = WorkoutHistorySession(
            entryDate: "2026-08-21",
            workoutTitle: "Lower Strength",
            records: records
        )

        XCTAssertEqual(session.strengthSetCount, 1)
        XCTAssertEqual(session.totalSets, 1)
        XCTAssertEqual(session.totalReps, 5, accuracy: 0.001)
        XCTAssertEqual(session.totalVolume, 675, accuracy: 0.001)
    }

    func testWarmUpTypeSurvivesOfflineWorkoutRoundTrip() throws {
        let exercise = Exercise(code: "DL01", name: "Deadlift")
        let session = OfflineWorkoutSession(
            clientEmail: "client@example.com",
            entryDate: "2026-08-21",
            workoutTitle: "Pull",
            exercises: [exercise],
            drafts: [
                WorkoutSetDraft(
                    exercise: exercise,
                    setNumber: WorkoutSetNumber.warmUp(1),
                    weight: "45",
                    reps: "8"
                ),
                WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "185", reps: "5")
            ],
            isFinished: true,
            difficultyRating: 4
        )

        let data = try JSONEncoder().encode(session)
        let restored = try JSONDecoder().decode(OfflineWorkoutSession.self, from: data)

        XCTAssertEqual(restored.restoredDrafts.count, 2)
        XCTAssertTrue(restored.restoredDrafts[0].isWarmUp)
        XCTAssertEqual(restored.restoredDrafts[1].setNumber, 1)
        XCTAssertEqual(restored.difficultyRating, 4)
    }

    func testLegacyOfflineWorkoutWithoutDifficultyStillDecodes() throws {
        let exercise = Exercise(code: "SQ01", name: "Back Squat")
        let session = OfflineWorkoutSession(
            clientEmail: "client@example.com",
            entryDate: "2026-08-20",
            workoutTitle: "Lower",
            exercises: [exercise],
            drafts: [WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "135", reps: "5")]
        )
        let data = try JSONEncoder().encode(session)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        object.removeValue(forKey: "difficultyRating")

        let legacyData = try JSONSerialization.data(withJSONObject: object)
        let restored = try JSONDecoder().decode(OfflineWorkoutSession.self, from: legacyData)

        XCTAssertNil(restored.difficultyRating)
        XCTAssertEqual(restored.restoredDrafts.first?.weight, "135")
    }

    func testExerciseSuggestionsConsolidateCaseSpacingAndPunctuationDuplicates() {
        let names = ExerciseSuggestionLibrary.merged([[
            "Push-Up",
            "push up",
            "  PUSH   UP  ",
            "Romanian Deadlift"
        ]])

        XCTAssertEqual(names.count, 2)
        XCTAssertTrue(names.contains("Push-Up"))
        XCTAssertTrue(names.contains("Romanian Deadlift"))
    }

    func testWorkoutHistoryConsolidatesDuplicateExerciseNamesWithoutLosingSets() {
        let records = [
            WorkoutHistoryRecord(
                entryDate: "2026-08-21",
                workoutTitle: "Upper Body",
                exerciseCode: "A1",
                exerciseName: "Dumbbell Bench Press",
                setNumber: 1,
                weightUsed: 50,
                reps: 10,
                notes: nil
            ),
            WorkoutHistoryRecord(
                entryDate: "2026-08-21",
                workoutTitle: "Upper Body",
                exerciseCode: "B2",
                exerciseName: "dumbbell-bench press",
                setNumber: 2,
                weightUsed: 55,
                reps: 8,
                notes: nil
            )
        ]
        let session = WorkoutHistorySession(
            entryDate: "2026-08-21",
            workoutTitle: "Upper Body",
            records: records
        )

        XCTAssertEqual(session.exercises.count, 1)
        XCTAssertEqual(session.exercises.first?.records.count, 2)
        XCTAssertEqual(session.exercises.first?.name, "Dumbbell Bench Press")
    }

    func testCustomSupersetFormatPairsExercisesInOrder() {
        let exercises = [
            Exercise(code: "CW01", name: "Bench Press"),
            Exercise(code: "CW02", name: "Row"),
            Exercise(code: "CW03", name: "Curl"),
            Exercise(code: "CW04", name: "Triceps Extension"),
            Exercise(code: "CW05", name: "Lateral Raise")
        ]

        let assignments = WorkoutSequencePlanner.customAssignments(
            for: .superset,
            exercises: exercises
        )

        XCTAssertEqual(assignments[exercises[0].id]?.label, "Superset 1")
        XCTAssertEqual(assignments[exercises[1].id]?.id, assignments[exercises[0].id]?.id)
        XCTAssertEqual(assignments[exercises[2].id]?.label, "Superset 2")
        XCTAssertEqual(assignments[exercises[3].id]?.id, assignments[exercises[2].id]?.id)
        XCTAssertEqual(assignments[exercises[4].id]?.label, "Superset 3")
    }

    func testCustomCircuitFormatGroupsEveryExercise() {
        let exercises = [
            Exercise(code: "CW01", name: "Squat"),
            Exercise(code: "CW02", name: "Push-up"),
            Exercise(code: "CW03", name: "Row")
        ]

        let assignments = WorkoutSequencePlanner.customAssignments(
            for: .circuit,
            exercises: exercises
        )

        XCTAssertEqual(Set(assignments.values.map(\.id)), Set(["CUSTOM_CIRCUIT_1"]))
        XCTAssertEqual(WorkoutSequencePlanner.customFormat(from: assignments), .circuit)
    }

    func testNextCustomCircuitUsesTheNextAvailableNumber() {
        let exercise = Exercise(code: "CW01", name: "Squat")
        let assignments = [
            exercise.id: WorkoutGroupAssignment(
                id: "CUSTOM_CIRCUIT_3",
                kind: .circuit,
                label: "Circuit 3"
            )
        ]

        let next = WorkoutSequencePlanner.nextCustomCircuitAssignment(assignments: assignments)

        XCTAssertEqual(next.id, "CUSTOM_CIRCUIT_4")
        XCTAssertEqual(next.label, "Circuit 4")
    }
}
