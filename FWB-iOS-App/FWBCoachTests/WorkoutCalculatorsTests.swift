import XCTest
@testable import FWBCoach

final class WorkoutCalculatorsTests: XCTestCase {
    func testOneRepMaxUsesEpleyFormula() throws {
        let estimate = try XCTUnwrap(OneRepMaxCalculator.estimate(weight: 225, reps: 5))

        XCTAssertEqual(estimate, 262.5, accuracy: 0.001)
        XCTAssertEqual(OneRepMaxCalculator.roundedToNearestFive(estimate), 265)
    }

    func testOneRepMaxPreservesTrueSingleAndRejectsInvalidInputs() {
        XCTAssertEqual(OneRepMaxCalculator.estimate(weight: 315, reps: 1), 315)
        XCTAssertNil(OneRepMaxCalculator.estimate(weight: 0, reps: 5))
        XCTAssertNil(OneRepMaxCalculator.estimate(weight: 225, reps: 0))
    }

    func testOneRepMaxTrainingLoadsRoundToNearestFive() {
        XCTAssertEqual(OneRepMaxCalculator.trainingWeight(oneRepMax: 265, percentage: 70), 185)
        XCTAssertEqual(OneRepMaxCalculator.trainingWeight(oneRepMax: 265, percentage: 90), 240)
    }

    func testEightToTwelveRepProgramStartsAtLighterEndOfRecommendedRange() throws {
        let recommendation = try XCTUnwrap(
            OneRepMaxCalculator.recommendation(oneRepMax: 265, repRange: 8...12)
        )

        XCTAssertEqual(recommendation.percentageRange.lowerBound, 0.70, accuracy: 0.001)
        XCTAssertEqual(recommendation.percentageRange.upperBound, 0.80, accuracy: 0.001)
        XCTAssertEqual(recommendation.startingWeight, 185)
        XCTAssertEqual(recommendation.workingWeightRange.lowerBound, 185)
        XCTAssertEqual(recommendation.workingWeightRange.upperBound, 210)
    }

    func testRepBasedRecommendationRejectsUnsupportedRanges() {
        XCTAssertNil(OneRepMaxCalculator.recommendation(oneRepMax: 0, repRange: 8...12))
        XCTAssertNil(OneRepMaxCalculator.recommendation(oneRepMax: 200, repRange: 31...35))
    }

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

    func testDecimalWeightsPersistAcrossStraightSupersetAndCircuitSessions() throws {
        let exercise = Exercise(code: "A1", name: "Hip Thrust")
        let formats: [(name: String, assignment: WorkoutGroupAssignment?)] = [
            ("Straight Sets", nil),
            (
                "Superset",
                WorkoutGroupAssignment(id: "SUPERSET_1", kind: .superset, label: "Superset 1")
            ),
            (
                "Circuit",
                WorkoutGroupAssignment(id: "CIRCUIT_1", kind: .circuit, label: "Circuit 1")
            )
        ]

        for format in formats {
            let draft = WorkoutSetDraft(
                exercise: exercise,
                setNumber: 1,
                weight: "137.5",
                reps: "8"
            )
            let assignments = format.assignment.map { [exercise.id: $0] } ?? [:]
            let session = OfflineWorkoutSession(
                clientEmail: "client@example.com",
                entryDate: "2026-09-03",
                workoutTitle: format.name,
                exercises: [exercise],
                drafts: [draft],
                groupAssignments: assignments
            )

            let data = try JSONEncoder().encode(session)
            let restored = try JSONDecoder().decode(OfflineWorkoutSession.self, from: data)
            let restoredDraft = try XCTUnwrap(restored.restoredDrafts.first)

            XCTAssertEqual(restored.sets.first?.weight, "137.5", format.name)
            XCTAssertEqual(restoredDraft.weight, "137.5", format.name)
            XCTAssertEqual(restoredDraft.weightValue, 137.5, accuracy: 0.001, format.name)
            XCTAssertEqual(restored.restoredGroupAssignments[exercise.id], format.assignment, format.name)
        }
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

    func testExerciseSuggestionsExpandDBToDumbbell() {
        XCTAssertEqual(
            ExerciseNameIdentity.key(for: "DB Bench Press"),
            ExerciseNameIdentity.key(for: "Dumbbell Bench Press")
        )

        XCTAssertEqual(
            ExerciseSuggestionLibrary.matches(
                query: "DB Bench Press",
                within: ["Dumbbell Bench Press", "Barbell Bench Press"]
            ).first,
            "Dumbbell Bench Press"
        )
    }

    func testExerciseSuggestionsOfferCanonicalChestPressSynonym() {
        XCTAssertEqual(
            ExerciseSuggestionLibrary.matches(
                query: "Dumbbell Chest Press",
                within: ["Dumbbell Bench Press"]
            ).first,
            "Dumbbell Bench Press"
        )
    }

    func testGenericDBShoulderPressOffersSeatedAndStandingChoices() {
        let matches = ExerciseSuggestionLibrary.matches(
            query: "DB Shoulder Press",
            within: [
                "Seated Dumbbell Shoulder Press",
                "Standing Dumbbell Shoulder Press",
                "Machine Shoulder Press"
            ]
        )

        XCTAssertTrue(matches.contains("Seated Dumbbell Shoulder Press"))
        XCTAssertTrue(matches.contains("Standing Dumbbell Shoulder Press"))
        XCTAssertFalse(matches.contains("Machine Shoulder Press"))
    }

    func testExerciseSuggestionsKeepEquipmentAndAngleVariantsSeparate() {
        XCTAssertFalse(
            ExerciseSuggestionLibrary.matches(
                query: "Barbell Bench Press",
                within: ["Dumbbell Bench Press"]
            ).contains("Dumbbell Bench Press")
        )
        XCTAssertFalse(
            ExerciseSuggestionLibrary.matches(
                query: "Decline Dumbbell Press",
                within: ["Incline Dumbbell Press"]
            ).contains("Incline Dumbbell Press")
        )
        XCTAssertFalse(
            ExerciseSuggestionLibrary.matches(
                query: "Hip Thrust Machine",
                within: ["Hip Thrust"]
            ).contains("Hip Thrust")
        )
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

final class WorkoutRoundLayoutTests: XCTestCase {
    func testWarmUpNumbersDoNotInflateDisplayedRoundCount() {
        let squat = Exercise(code: "A1", name: "Squat")
        let row = Exercise(code: "A2", name: "Row")
        let drafts = [
            WorkoutSetDraft(exercise: squat, setNumber: WorkoutSetNumber.warmUp(1), weight: "45"),
            WorkoutSetDraft(exercise: squat, setNumber: 1),
            WorkoutSetDraft(exercise: squat, setNumber: 2),
            WorkoutSetDraft(exercise: row, setNumber: 1),
            WorkoutSetDraft(exercise: row, setNumber: 3)
        ]
        XCTAssertEqual(WorkoutRoundLayout.roundCount(exercises: [squat, row], drafts: drafts), 3)
        XCTAssertEqual(WorkoutRoundLayout.roundCount(exercises: [squat], drafts: Array(drafts.prefix(1))), 0)
    }

    func testRemovingLastRoundPreservesShorterAssignedExerciseAndWarmUps() {
        let squat = Exercise(code: "A1", name: "Squat")
        let row = Exercise(code: "A2", name: "Row")
        let unrelated = Exercise(code: "B1", name: "Curl")
        let squatLast = WorkoutSetDraft(exercise: squat, setNumber: 3)
        let rowLast = WorkoutSetDraft(exercise: row, setNumber: 2)
        let warmUp = WorkoutSetDraft(exercise: squat, setNumber: WorkoutSetNumber.warmUp(1))
        let otherLast = WorkoutSetDraft(exercise: unrelated, setNumber: 5)
        let ids = WorkoutRoundLayout.lastRoundSetIDs(exercises: [squat, row], drafts: [squatLast, rowLast, warmUp, otherLast])
        XCTAssertEqual(ids, Set([squatLast.id]))
        XCTAssertFalse(ids.contains(rowLast.id))
        XCTAssertFalse(ids.contains(warmUp.id))
        XCTAssertFalse(ids.contains(otherLast.id))
    }

    func testPartiallyNamedCustomGroupRetainsItsAssignment() {
        let exercise = Exercise(code: "CW01", name: "Squat")
        let assignment = WorkoutGroupAssignment(id: "CUSTOM_SUPERSET_2", kind: .superset, label: "Superset 2")
        let custom = WorkoutRoundLayout.sections(exercises: [exercise], assignments: [exercise.id: assignment], preserveSingleGroups: true)
        let assigned = WorkoutRoundLayout.sections(exercises: [exercise], assignments: [exercise.id: assignment], preserveSingleGroups: false)
        XCTAssertEqual(custom.count, 1)
        XCTAssertEqual(custom.first?.assignment, assignment)
        XCTAssertNil(assigned.first?.assignment)
    }

    func testCircuitFormatGroupsThreeExercisesWithoutLosingRemainder() {
        let exercises = (1...7).map { Exercise(code: "CW\($0)", name: "Exercise \($0)") }
        let assignments = WorkoutRoundLayout.circuitAssignments(exercises: exercises)
        XCTAssertEqual(assignments.count, 7)
        XCTAssertEqual(assignments[exercises[0].id]?.id, assignments[exercises[2].id]?.id)
        XCTAssertNotEqual(assignments[exercises[2].id]?.id, assignments[exercises[3].id]?.id)
        XCTAssertEqual(assignments[exercises[6].id]?.label, "Circuit 3")
    }

    func testCompletionRejectsEmptyInvalidEffortAndMissingTimedDuration() {
        let exercise = Exercise(code: "A1", name: "Squat")
        XCTAssertFalse(WorkoutRoundLayout.canComplete(WorkoutSetDraft(exercise: exercise, setNumber: 1)))
        XCTAssertFalse(WorkoutRoundLayout.canComplete(WorkoutSetDraft(exercise: exercise, setNumber: 1, reps: "5", effortScale: .rir, effort: "99")))
        XCTAssertFalse(WorkoutRoundLayout.canComplete(WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "20", setType: .timed)))
        XCTAssertTrue(WorkoutRoundLayout.canComplete(WorkoutSetDraft(exercise: exercise, setNumber: 1, duration: "30", setType: .timed)))
        XCTAssertTrue(WorkoutRoundLayout.canComplete(WorkoutSetDraft(exercise: exercise, setNumber: 1, reps: "5")))
    }

    func testFirstNamedFourthSupersetStaysBetweenEmptyThirdAndFifthSlots() {
        let exercise = Exercise(code: "CW07", name: "Squat")
        let assignment = WorkoutGroupAssignment(id: "CUSTOM_SUPERSET_4", kind: .superset, label: "Superset 4")
        let sections = WorkoutRoundLayout.sections(exercises: [exercise], assignments: [exercise.id: assignment], preserveSingleGroups: true)
        let slots = WorkoutRoundLayout.groupSlots(sections: sections, format: .superset)
        XCTAssertEqual(slots.map(\.number), [1, 2, 3, 4, 5])
        XCTAssertEqual(slots[3].section?.exercises, [exercise])
        XCTAssertNil(slots[0].section)
        XCTAssertNil(slots[4].section)
        let emptySlots = WorkoutRoundLayout.groupSlots(sections: [], format: .superset)
        XCTAssertEqual(slots.map(\.id), emptySlots.map(\.id))
    }

    func testGroupSlotsKeepAddedSixthGroupAndUngroupedExercise() {
        let assigned = Exercise(code: "CW16", name: "Row")
        let standalone = Exercise(code: "ADD17", name: "Plank")
        let assignment = WorkoutGroupAssignment(id: "CUSTOM_CIRCUIT_6", kind: .circuit, label: "Circuit 6")
        let sections = WorkoutRoundLayout.sections(exercises: [assigned, standalone], assignments: [assigned.id: assignment], preserveSingleGroups: true)
        let slots = WorkoutRoundLayout.groupSlots(sections: sections, format: .circuit)
        XCTAssertEqual(slots.count, 7)
        XCTAssertEqual(slots[5].section?.exercises, [assigned])
        XCTAssertEqual(slots[6].section?.exercises, [standalone])
        XCTAssertEqual(Set(slots.map(\.id)).count, slots.count)
    }

}

final class WorkoutHistoryCopyPlanTests: XCTestCase {
    func testRepeatedCopiesHaveFreshWorkoutAndStorageIdentity() {
        let session = sourceSession(records: [record()])
        let first = WorkoutHistoryCopyPlan(session: session)
        let second = WorkoutHistoryCopyPlan(session: session)
        XCTAssertNotEqual(first.id, second.id)
        XCTAssertNotEqual(first.workout.id, second.workout.id)
        XCTAssertNotEqual(first.workout.title, second.workout.title)
        XCTAssertNotEqual(first.workout.title, session.workoutTitle)
        XCTAssertEqual(first.session, session)
    }

    func testSeedPreservesSetValuesButNeverSourceSetIdentityOrCompletion() throws {
        let sourceID = UUID()
        let source = record(setID: sourceID, setType: .timed, duration: 45)
        let session = sourceSession(records: [source])
        let plan = WorkoutHistoryCopyPlan(session: session)
        let draft = try XCTUnwrap(WorkoutHistoryCopyPlan.seedDrafts(session: session, exercises: plan.workout.exercises).first)
        XCTAssertNotEqual(draft.id, sourceID)
        XCTAssertFalse(draft.isCompleted)
        XCTAssertEqual(draft.weight, "25")
        XCTAssertEqual(draft.reps, "8")
        XCTAssertEqual(draft.duration, "45")
        XCTAssertEqual(draft.notes, "Controlled tempo")
        XCTAssertEqual(draft.effortScale, .rir)
        XCTAssertEqual(draft.effort, "2")
        XCTAssertEqual(draft.setType, .timed)
        XCTAssertEqual(draft.exerciseCode, plan.workout.exercises.first?.code)
    }

    func testCopyKeepsExerciseWarmUpsAndExcludesSessionCardioAndWarmUp() {
        let session = sourceSession(records: [
            record(),
            record(setNumber: WorkoutSetNumber.warmUp(1), setType: .warmUp),
            record(code: "CARDIO", name: "Treadmill"),
            record(code: "WARMUP", name: "Session warm-up")
        ])
        let plan = WorkoutHistoryCopyPlan(session: session)
        let drafts = WorkoutHistoryCopyPlan.seedDrafts(session: session, exercises: plan.workout.exercises)
        XCTAssertEqual(plan.workout.exercises.count, 1)
        XCTAssertEqual(drafts.count, 2)
        XCTAssertEqual(drafts.filter(\.isWarmUp).count, 1)
        XCTAssertTrue(drafts.allSatisfy { !$0.isCompleted })
        XCTAssertEqual(session.records.count, 4)
    }

    func testConsolidatedSourceExerciseCopiesEverySetWithUniqueLogKeys() {
        let session = sourceSession(records: [
            record(code: "A1", setNumber: 1),
            record(code: "B1", setNumber: 1),
            record(code: "A1", setNumber: WorkoutSetNumber.warmUp(1), setType: .warmUp),
            record(code: "B1", setNumber: WorkoutSetNumber.warmUp(1), setType: .warmUp)
        ])
        let plan = WorkoutHistoryCopyPlan(session: session)
        let drafts = WorkoutHistoryCopyPlan.seedDrafts(session: session, exercises: plan.workout.exercises)
        XCTAssertEqual(drafts.count, 4)
        XCTAssertEqual(Set(drafts.map(\.logKey)).count, 4)
        XCTAssertEqual(drafts.filter { !$0.isWarmUp }.map(\.setNumber), [1, 2])
        XCTAssertEqual(drafts.filter(\.isWarmUp).map(\.setNumber), [1001, 1002])
    }

    func testChangingCopyDateUsesFreshSetIdentityAndKeepsEditedValues() throws {
        let exercise = Exercise(code: "CW01", name: "Squat")
        let saved = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "135", reps: "6", notes: "Edited in copy", effortScale: .rir, effort: "1", isCompleted: true)
        let fresh = try XCTUnwrap(WorkoutHistoryCopyPlan.freshDrafts([saved], exercises: [exercise]).first)
        XCTAssertNotEqual(fresh.id, saved.id)
        XCTAssertFalse(fresh.isCompleted)
        XCTAssertEqual(fresh.weight, "135")
        XCTAssertEqual(fresh.reps, "6")
        XCTAssertEqual(fresh.notes, "Edited in copy")
        XCTAssertEqual(fresh.effortScale, .rir)
        XCTAssertEqual(fresh.effort, "1")
        XCTAssertTrue(saved.isCompleted)
    }

    private func sourceSession(records: [WorkoutHistoryRecord]) -> WorkoutHistorySession {
        WorkoutHistorySession(entryDate: "2026-09-20", workoutTitle: "Custom workout", records: records)
    }

    private func record(setID: UUID = UUID(), code: String = "A1", name: String = "Squat", setNumber: Int = 1, setType: WorkoutSetType = .working, duration: Double? = nil) -> WorkoutHistoryRecord {
        WorkoutHistoryRecord(
            sessionID: UUID(), setID: setID, entryDate: "2026-09-20", workoutTitle: "Custom workout",
            exerciseCode: code, exerciseName: name, setNumber: setNumber, weightUsed: 25, reps: 8,
            notes: "Controlled tempo", completedAt: Date(), effortScale: .rir, effortValue: 2,
            setType: setType, durationSeconds: duration
        )
    }
}

final class ExerciseMediaTests: XCTestCase {
    func testApprovedExerciseDecodesAliasesAndBrandedMedia() throws {
        let id = UUID()
        let json = """
        {
          "id": "\(id.uuidString)",
          "name": "Dumbbell Bench Press",
          "aliases": ["Flat Dumbbell Press", "DB Bench Press"],
          "primary_muscle": "Chest",
          "secondary_muscles": ["Triceps", "Front Delts"],
          "equipment": "Dumbbells",
          "difficulty": "Intermediate",
          "movement_pattern": "Push",
          "default_sets": 3,
          "default_reps": "8-12",
          "default_rest_seconds": 90,
          "substitution_group": "horizontal-press",
          "demo_url": "https://example.com/demo",
          "image_url": "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/dumbbell-bench-press.webp",
          "motion_url": "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/motion/dumbbell-bench-press.webp",
          "instructions": "Press the dumbbells above the chest."
        }
        """

        let exercise = try JSONDecoder().decode(ApprovedExercise.self, from: Data(json.utf8))

        XCTAssertEqual(exercise.id, id)
        XCTAssertEqual(exercise.aliases, ["Flat Dumbbell Press", "DB Bench Press"])
        XCTAssertTrue(exercise.imageURL?.contains("/webp-768/dumbbell-bench-press.webp") == true)
        XCTAssertTrue(exercise.motionURL?.contains("/motion/dumbbell-bench-press.webp") == true)
        XCTAssertEqual(
            ExerciseNameIdentity.canonicalName(for: "flat dumbbell press", approvedExercises: [exercise]),
            "Dumbbell Bench Press"
        )
        XCTAssertEqual(
            ExerciseNameIdentity.canonicalName(for: "DB bench press", approvedExercises: [exercise]),
            "Dumbbell Bench Press"
        )
    }

    func testApprovedExerciseAllowsMissingOptionalMedia() throws {
        let json = """
        {
          "id": "\(UUID().uuidString)",
          "name": "Bodyweight Squat",
          "aliases": [],
          "primary_muscle": "Quadriceps",
          "secondary_muscles": [],
          "equipment": "Bodyweight",
          "difficulty": "Beginner",
          "movement_pattern": "Squat",
          "default_sets": 3,
          "default_reps": "10-12",
          "default_rest_seconds": 60,
          "substitution_group": "squat",
          "demo_url": null,
          "instructions": "Squat with control."
        }
        """

        let exercise = try JSONDecoder().decode(ApprovedExercise.self, from: Data(json.utf8))

        XCTAssertNil(exercise.imageURL)
        XCTAssertNil(exercise.motionURL)
    }

    func testExerciseThumbnailUsesApproved480WebPVariant() throws {
        let full = try XCTUnwrap(URL(string: "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/dumbbell-bench-press.webp"))

        let thumbnail = try XCTUnwrap(ExerciseMediaURL.thumbnail(for: full))

        XCTAssertEqual(
            thumbnail.absoluteString,
            "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-480/dumbbell-bench-press.webp"
        )
    }

    func testExerciseThumbnailDoesNotRewriteUnapprovedOrNonWebPMedia() throws {
        let unapproved = try XCTUnwrap(URL(string: "https://example.com/webp-768/dumbbell-bench-press.webp"))
        let png = try XCTUnwrap(URL(string: "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/png/dumbbell-bench-press.png"))

        XCTAssertEqual(ExerciseMediaURL.thumbnail(for: unapproved), unapproved)
        XCTAssertEqual(ExerciseMediaURL.thumbnail(for: png), png)
    }

    func testOnlyApprovedBrandedWebPCardsUseThePhotoPanelCrop() throws {
        let branded = try XCTUnwrap(URL(string: "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/dumbbell-bench-press.webp"))
        let branded480 = try XCTUnwrap(URL(string: "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-480/arnold-press.webp"))
        let legacy = try XCTUnwrap(URL(string: "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/dumbbell-bench-press.png"))
        let outside = try XCTUnwrap(URL(string: "https://example.com/webp-768/dumbbell-bench-press.webp"))

        XCTAssertTrue(ExerciseMediaURL.isBrandedCard(branded))
        XCTAssertTrue(ExerciseMediaURL.isBrandedCard(branded480))
        XCTAssertEqual(ExerciseMediaURL.thumbnail(for: branded480), branded480)
        XCTAssertFalse(ExerciseMediaURL.isBrandedCard(legacy))
        XCTAssertFalse(ExerciseMediaURL.isBrandedCard(outside))
    }

    func testExerciseMediaUsesThumbnailBeforeFullResolutionFallback() throws {
        let full = try XCTUnwrap(URL(string: "https://example.com/card-768.webp"))
        let thumbnail = try XCTUnwrap(URL(string: "https://example.com/card-480.webp"))
        let media = ExerciseMedia(
            imageURL: full,
            thumbnailURL: thumbnail,
            instructions: "Brace, lower with control, and press to the start position.",
            primaryMuscle: "Chest",
            equipment: "Dumbbells",
            fallbackDemoURL: nil
        )

        XCTAssertTrue(media.hasVisual)
        XCTAssertEqual(media.thumbnailURLs, [thumbnail, full])
        XCTAssertFalse(media.instructions.isEmpty)
        XCTAssertFalse(media.cropsThumbnailToPhotoPanels)
    }
}
