import XCTest
@testable import FWBCoach

final class WorkoutGeneratorTests: XCTestCase {
    private var now: Date {
        Calendar(identifier: .gregorian).date(from: DateComponents(year: 2026, month: 9, day: 25, hour: 12))!
    }

    func testFullBodyAlwaysIncludesPushPullAndLegsWithinRequestedTime() throws {
        for minutes in WorkoutGenerator.durations {
            for intensity in WorkoutGenerationIntensity.allCases {
                for seed in UInt64(0)..<8 {
                    let preferences = WorkoutGenerationPreferences(minutes: minutes, intensity: intensity)
                    let plan = try generate(library(), preferences, seed: seed)
                    let muscles = Set(plan.exercises.map { $0.source.primaryMuscle })
                    XCTAssertFalse(muscles.isDisjoint(with: ["chest", "shoulders"]))
                    XCTAssertFalse(muscles.isDisjoint(with: ["back", "lats"]))
                    XCTAssertFalse(muscles.isDisjoint(with: ["quads", "hamstrings", "glutes"]))
                    XCTAssertLessThanOrEqual(plan.estimatedMinutes, minutes)
                    XCTAssertGreaterThan(plan.estimatedMinutes, 3)
                }
            }
        }
    }

    func testBroadFocusPreservesRequiredMuscleGroups() throws {
        let expected: [(WorkoutGenerationFocus, [[String]])] = [
            (.upperBody, [["chest", "shoulders"], ["back", "lats"]]),
            (.lowerBody, [["quads"], ["hamstrings", "glutes"]]),
            (.chestBack, [["chest"], ["back", "lats"]]),
            (.arms, [["biceps"], ["triceps"]])
        ]
        for (focus, groups) in expected {
            let plan = try generate(library(), WorkoutGenerationPreferences(focus: focus, minutes: 20))
            let muscles = Set(plan.exercises.map { $0.source.primaryMuscle })
            for group in groups { XCTAssertFalse(muscles.isDisjoint(with: group)) }
            XCTAssertTrue(muscles.isSubset(of: Set(focus.muscles)))
        }
    }

    func testSingleMuscleWorkoutsAreCappedAtFourExercises() throws {
        let plan = try generate((1...7).map { entry("Press \($0)") }, WorkoutGenerationPreferences(focus: .chest, minutes: 60))
        XCTAssertEqual(plan.exercises.count, 4)
        XCTAssertTrue(plan.notes.contains { $0.contains("Choose more equipment") })
    }

    func testEquipmentSelectionAllowsBodyweightButNoUnavailableEquipment() throws {
        let plan = try generate([
            entry("Floor Push-Up", equipment: "bodyweight"),
            entry("Dumbbell Floor Press", equipment: "dumbbell"),
            entry("Cable Fly", equipment: "cable"),
            entry("Barbell Floor Press", equipment: "barbell")
        ], WorkoutGenerationPreferences(focus: .chest, equipment: [.dumbbell]))
        XCTAssertEqual(Set(plan.exercises.map { $0.source.equipment }), ["bodyweight", "dumbbell"])
    }

    func testEmptyEquipmentSelectionStillAllowsBodyweight() throws {
        let plan = try generate([entry("Push-Up", equipment: "bodyweight")], WorkoutGenerationPreferences(focus: .chest, equipment: []))
        XCTAssertEqual(plan.exercises.count, 1)
    }

    func testBenchDependentExercisesNeedBenchAndPrimaryEquipment() throws {
        let names = ["Dumbbell Bench Press", "Incline Dumbbell Press", "Decline Dumbbell Press", "Dumbbell Chest Fly"]
        for name in names {
            let exercise = entry(name, equipment: "dumbbell")
            XCTAssertThrowsError(try generate([exercise], WorkoutGenerationPreferences(focus: .chest, equipment: [.dumbbell])))
            XCTAssertThrowsError(try generate([exercise], WorkoutGenerationPreferences(focus: .chest, equipment: [.bench])))
            XCTAssertEqual(try generate([exercise], WorkoutGenerationPreferences(focus: .chest, equipment: [.dumbbell, .bench])).exercises.count, 1)
        }
    }

    func testUnrepresentedStationsAndRacksRequireFullGym() throws {
        let stationExercises = [
            entry("Pull-Up", muscle: "back", equipment: "bodyweight"),
            entry("Hanging Leg Raise", muscle: "core", equipment: "bodyweight"),
            entry("Inverted Row", muscle: "back", equipment: "bodyweight"),
            entry("Dip", muscle: "triceps", equipment: "bodyweight"),
            entry("Barbell Back Squat", muscle: "quads", equipment: "barbell"),
            entry("Back Extension", muscle: "hamstrings", equipment: "bodyweight")
        ]
        for exercise in stationExercises {
            let focus = WorkoutGenerationFocus(rawValue: exercise.primaryMuscle)!
            XCTAssertThrowsError(try generate([exercise], WorkoutGenerationPreferences(focus: focus, equipment: [.bodyweight, .bench, .barbell])))
            XCTAssertEqual(try generate([exercise], WorkoutGenerationPreferences(focus: focus, equipment: [.fullGym])).exercises.count, 1)
        }
    }

    func testBenchDipsAndMachineInclineDoNotRequireExtraStations() throws {
        XCTAssertEqual(try generate([entry("Bench Dip", muscle: "triceps", equipment: "bodyweight")], WorkoutGenerationPreferences(focus: .triceps, equipment: [.bench])).exercises.count, 1)
        XCTAssertEqual(try generate([entry("Incline Chest Press", equipment: "machine")], WorkoutGenerationPreferences(focus: .chest, equipment: [.machine])).exercises.count, 1)
    }

    func testEasyExcludesIntermediateAndEveryIntensityExcludesAdvanced() throws {
        let exercises = [entry("Beginner Press"), entry("Intermediate Press", difficulty: "intermediate"), entry("Advanced Press", difficulty: "advanced")]
        let easy = try generate(exercises, WorkoutGenerationPreferences(focus: .chest, intensity: .easy))
        XCTAssertEqual(easy.exercises.map { $0.source.name }, ["Beginner Press"])
        for intensity in WorkoutGenerationIntensity.allCases {
            let plan = try generate(exercises, WorkoutGenerationPreferences(focus: .chest, intensity: intensity))
            XCTAssertFalse(plan.exercises.contains { $0.source.difficulty == "advanced" })
            XCTAssertTrue(plan.exercises.allSatisfy { $0.sets <= (intensity == .easy ? 2 : intensity == .moderate ? 3 : 4) })
        }
    }

    func testSharedRecoveryEntriesNeverReplaceStrengthExercises() throws {
        let recovery = ["mobility", "stretch", "stretching", "flexibility", "  ReCoVeRy  "]
            .map { entry("Gentle \($0)", movement: $0, reps: "20-30 sec", sets: 2, rest: 20) }
        for intensity in WorkoutGenerationIntensity.allCases {
            let preferences = WorkoutGenerationPreferences(focus: .chest, intensity: intensity)
            XCTAssertThrowsError(try generate(recovery, preferences))
            let plan = try generate(recovery + [entry("Push-Up")], preferences)
            XCTAssertEqual(plan.exercises.map { $0.source.name }, ["Push-Up"])
        }
    }

    func testRecoveryEntriesAreExcludedFromStrengthSwaps() throws {
        let plan = try generate([entry("Push-Up")], WorkoutGenerationPreferences(focus: .chest))
        let stretch = entry("Supine Chest Stretch", movement: "stretching", reps: "20-30 sec", sets: 2, rest: 20)
        let press = entry("Another Press")
        let alternatives = WorkoutGenerator.alternatives(for: plan.exercises[0], in: plan, library: [stretch, press], history: [], now: now)
        XCTAssertEqual(alternatives.map { $0.source.id }, [press.id])
        let replacement = GeneratedWorkoutExercise(source: stretch, sets: 2, reps: "20-30 sec", restSeconds: 45)
        XCTAssertThrowsError(try WorkoutGenerator.replacing(at: 0, with: replacement, in: plan))
    }

    func testRecoveryFocusesUseOnlyGentleMovementsAndAlwaysNormalizeToEasy() throws {
        for focus in [WorkoutGenerationFocus.recoveryUpper, .recoveryLower, .recoveryFull] {
            for minutes in WorkoutGenerator.durations {
                for intensity in WorkoutGenerationIntensity.allCases {
                    let preferences = WorkoutGenerationPreferences(focus: focus, equipment: [], minutes: minutes, intensity: intensity)
                    let plan = try generate(library() + recoveryLibrary(), preferences)
                    XCTAssertEqual(plan.title, focus.title)
                    XCTAssertEqual(plan.preferences.intensity, .easy)
                    XCTAssertFalse(plan.exercises.isEmpty)
                    XCTAssertTrue(plan.exercises.allSatisfy {
                        ["mobility", "stretching"].contains($0.source.movementPattern)
                            && $0.source.equipment == "bodyweight" && $0.source.difficulty == "beginner"
                            && (1...2).contains($0.sets) && (0...60).contains($0.restSeconds)
                            && focus.muscles.contains($0.source.primaryMuscle)
                    })
                    XCTAssertLessThanOrEqual(plan.estimatedMinutes, minutes)
                    XCTAssertTrue(plan.notes.contains { $0.contains("Move slowly within a comfortable range") })
                    XCTAssertFalse(plan.notes.contains { $0.contains("controlled weight") })
                }
            }
        }
    }

    func testFullRecoveryRequiresBothUpperAndLowerRegions() throws {
        let upper = recoveryLibrary().filter { WorkoutGenerationFocus.recoveryUpper.muscles.contains($0.primaryMuscle) }
        let lower = recoveryLibrary().filter { WorkoutGenerationFocus.recoveryLower.muscles.contains($0.primaryMuscle) }
        let core = entry("Gentle Core Mobility", muscle: "core", movement: "mobility", reps: "6-8", sets: 2, rest: 20)
        XCTAssertThrowsError(try generate(upper + [core], WorkoutGenerationPreferences(focus: .recoveryFull)))
        XCTAssertThrowsError(try generate(lower + [core], WorkoutGenerationPreferences(focus: .recoveryFull)))
        XCTAssertThrowsError(try generate([core], WorkoutGenerationPreferences(focus: .recoveryFull)))
        for seed in UInt64(0)..<12 {
            let plan = try generate(upper + lower + [core], WorkoutGenerationPreferences(focus: .recoveryFull, minutes: 20), seed: seed)
            let muscles = Set(plan.exercises.map { $0.source.primaryMuscle })
            XCTAssertFalse(muscles.isDisjoint(with: WorkoutGenerationFocus.recoveryUpper.muscles))
            XCTAssertFalse(muscles.isDisjoint(with: WorkoutGenerationFocus.recoveryLower.muscles))
        }
        // Recovery does not impose strength push/pull or quad/hinge requirements.
        XCTAssertNoThrow(try generate([upper[0]], WorkoutGenerationPreferences(focus: .recoveryUpper)))
        XCTAssertNoThrow(try generate([lower[0]], WorkoutGenerationPreferences(focus: .recoveryLower)))
    }

    func testRecoveryRejectsStrengthLoadedAdvancedAndExcessiveTargets() throws {
        let invalid = [
            entry("Push-Up"),
            entry("Weighted Mobility", equipment: "dumbbell", movement: "mobility", reps: "6"),
            entry("Intermediate Stretch", difficulty: "intermediate", movement: "stretching", reps: "30 sec"),
            entry("Advanced Stretch", difficulty: "advanced", movement: "stretching", reps: "30 sec"),
            entry("Excess Mobility Reps", movement: "mobility", reps: "13 each"),
            entry("Long Stretch", movement: "stretching", reps: "61 sec per side"),
            entry("Long Timed Stretch", movement: "stretching", reps: "2 min")
        ]
        for exercise in invalid {
            XCTAssertThrowsError(try generate([exercise], WorkoutGenerationPreferences(focus: .recoveryUpper, intensity: .challenging)), exercise.name)
        }
        XCTAssertThrowsError(try generate(library(), WorkoutGenerationPreferences(focus: .recoveryFull))) { error in
            XCTAssertTrue(error.localizedDescription.contains("approved mobility or stretching"))
            XCTAssertFalse(error.localizedDescription.contains("add available equipment"))
        }
    }

    func testRecoveryBoundsSetsAndRestWithoutIncreasingGentleTargets() throws {
        for reps in ["12 per side", "60 sec each", "1 min/side"] {
            let plan = try generate([
                entry("Gentle Upper Mobility", movement: "mobility", reps: reps, sets: 10, rest: 600)
            ], WorkoutGenerationPreferences(focus: .recoveryUpper, intensity: .challenging))
            XCTAssertEqual(plan.exercises.first?.sets, 2)
            XCTAssertEqual(plan.exercises.first?.restSeconds, 60)
            XCTAssertEqual(plan.exercises.first?.reps, reps)
        }
        let noRest = try generate([
            entry("Gentle Chest Stretch", movement: "stretching", reps: "30 sec", sets: 1, rest: 0)
        ], WorkoutGenerationPreferences(focus: .recoveryUpper))
        XCTAssertEqual(noRest.exercises.first?.sets, 1)
        XCTAssertEqual(noRest.exercises.first?.restSeconds, 0)
    }

    func testRecoveryEstimatesBothSidesAndExplainsShorterSessions() throws {
        let oneSide = try generate([
            entry("Chest Stretch", movement: "stretching", reps: "20-30 sec", sets: 2, rest: 20)
        ], WorkoutGenerationPreferences(focus: .recoveryUpper, minutes: 60))
        let eachSide = try generate([
            entry("Shoulder Stretch", muscle: "shoulders", movement: "stretching", reps: "20-30 sec each", sets: 2, rest: 20)
        ], WorkoutGenerationPreferences(focus: .recoveryUpper, minutes: 60))
        XCTAssertEqual(oneSide.estimatedMinutes, 6)
        XCTAssertEqual(eachSide.estimatedMinutes, 7)
        XCTAssertEqual(eachSide.exercises.first?.prescription, "20-30 sec/side x 2 sets")
        XCTAssertEqual(eachSide.exercises.first?.exercise(code: "CW1").rest, "20 sec")
        XCTAssertTrue(eachSide.notes.contains { $0.contains("3 minutes to ease into movement") })
        XCTAssertTrue(eachSide.notes.contains { $0.contains("about 7 minutes of gentle recovery") && $0.contains("no need to add extra work") })
        XCTAssertFalse(eachSide.notes.contains { $0.contains("Choose more equipment") })
    }

    func testRecoverySwapsStayGentleAndKeepCoverage() throws {
        let original = entry("Cat-Cow", muscle: "back", movement: "mobility", reps: "6-8", sets: 2, rest: 20, group: "spine_mobility")
        let lower = entry("Hip Stretch", muscle: "glutes", movement: "stretching", reps: "30 sec each", sets: 2, rest: 20)
        let plan = try generate([original, lower], WorkoutGenerationPreferences(focus: .recoveryFull))
        let originalIndex = try XCTUnwrap(plan.exercises.firstIndex { $0.id == original.id })
        let alternate = entry("Side-Lying Open Book", muscle: "back", movement: "mobility", reps: "6-8 each", sets: 2, rest: 20, group: "spine_mobility")
        let alternatives = WorkoutGenerator.alternatives(for: plan.exercises[originalIndex], in: plan, library: [
            original, lower, alternate,
            entry("Row", muscle: "back", equipment: "cable", movement: "horizontal_pull"),
            entry("Long Spine Stretch", muscle: "back", movement: "stretching", reps: "61 sec"),
            entry("Weighted Spine Mobility", muscle: "back", equipment: "dumbbell", movement: "mobility", reps: "8")
        ], history: [], now: now)
        XCTAssertEqual(alternatives.map(\.id), [alternate.id])
        let replaced = try WorkoutGenerator.replacing(at: originalIndex, with: XCTUnwrap(alternatives.first), in: plan)
        XCTAssertEqual(replaced.preferences.intensity, .easy)
        XCTAssertTrue(replaced.exercises.contains { $0.source.primaryMuscle == "back" })
        XCTAssertTrue(replaced.exercises.contains { $0.source.primaryMuscle == "glutes" })
        XCTAssertLessThanOrEqual(replaced.estimatedMinutes, plan.preferences.minutes)

        let anotherLower = GeneratedWorkoutExercise(
            source: entry("Another Hip Stretch", muscle: "glutes", movement: "stretching", reps: "30 sec", sets: 2, rest: 20),
            sets: 2, reps: "30 sec", restSeconds: 20)
        XCTAssertThrowsError(try WorkoutGenerator.replacing(at: originalIndex, with: anotherLower, in: plan))
    }

    func testRecoverySwapRejectsEditedTargetsBeyondGentleBounds() throws {
        let plan = try generate([
            entry("Chest Stretch", movement: "stretching", reps: "30 sec", sets: 2, rest: 20)
        ], WorkoutGenerationPreferences(focus: .recoveryUpper))
        let alternate = entry("Another Chest Stretch", movement: "stretching", reps: "30 sec", sets: 2, rest: 20)
        let invalidTargets: [(Int, String, Int)] = [
            (3, "30 sec", 20), (2, "30 sec", 61), (2, "30 sec", -1),
            (2, "61 sec each", 20), (2, "13 reps", 20)
        ]
        for (sets, reps, rest) in invalidTargets {
            let replacement = GeneratedWorkoutExercise(source: alternate, sets: sets, reps: reps, restSeconds: rest)
            XCTAssertThrowsError(try WorkoutGenerator.replacing(at: 0, with: replacement, in: plan))
        }
        let strength = GeneratedWorkoutExercise(source: entry("Push-Up"), sets: 2, reps: "10", restSeconds: 45)
        XCTAssertThrowsError(try WorkoutGenerator.replacing(at: 0, with: strength, in: plan))
        let noRest = GeneratedWorkoutExercise(source: alternate, sets: 1, reps: "30 sec", restSeconds: 0)
        XCTAssertNoThrow(try WorkoutGenerator.replacing(at: 0, with: noRest, in: plan))
    }

    func testRecoverySwapNormalizesCallerProvidedIntensity() throws {
        let plan = try generate([
            entry("Chest Stretch", movement: "stretching", reps: "30 sec", sets: 2, rest: 20)
        ], WorkoutGenerationPreferences(focus: .recoveryUpper))
        var preferences = plan.preferences
        preferences.intensity = .challenging
        let supplied = GeneratedWorkoutPlan(title: plan.title, preferences: preferences, estimatedMinutes: plan.estimatedMinutes,
                                            exercises: plan.exercises, notes: plan.notes)
        let replacement = GeneratedWorkoutExercise(
            source: entry("Another Chest Stretch", movement: "stretching", reps: "30 sec", sets: 2, rest: 20),
            sets: 2, reps: "30 sec", restSeconds: 20)
        let updated = try WorkoutGenerator.replacing(at: 0, with: replacement, in: supplied)
        XCTAssertEqual(updated.preferences.intensity, .easy)
    }

    func testInvalidMetadataNeverEntersGeneratedPlan() throws {
        let invalid = [
            entry("Unsupported Muscle", muscle: "unknown"), entry("Unsupported Equipment", equipment: "kettlebell"),
            entry("Missing Movement", movement: " "), entry("No Sets", sets: 0), entry("Too Many Sets", sets: 11),
            entry("Negative Rest", rest: -1), entry("Excess Rest", rest: 601), entry("AMRAP", reps: "AMRAP"),
            entry("Failure", reps: "to failure"), entry("High Reps", reps: "31"), entry("Reverse Range", reps: "12-8"),
            entry("Zero Reps", reps: "0"), entry("Long Hold", reps: "121 sec"), entry("x"), entry("---")
        ]
        for exercise in invalid {
            XCTAssertThrowsError(try generate([exercise], WorkoutGenerationPreferences(focus: .chest)), exercise.name)
        }
        let plan = try generate(invalid + [entry("Valid Press")], WorkoutGenerationPreferences(focus: .chest))
        XCTAssertEqual(plan.exercises.map { $0.source.name }, ["Valid Press"])
    }

    func testDuplicateNamesAndIDsAreExcluded() throws {
        let first = entry("Flat Press")
        let plan = try generate([
            first, entry("flat-press"), entry("Different Name", id: first.id), entry("Another Press")
        ], WorkoutGenerationPreferences(focus: .chest))
        XCTAssertEqual(plan.exercises.count, 2)
        XCTAssertEqual(Set(plan.exercises.map(\.id)).count, 2)
    }

    func testNumericAndUnilateralTargetsSurviveConversionWithRestAndInstructions() throws {
        for reps in ["8-12 each", "8-12 per side", "8-12/side"] {
            let plan = try generate([entry("Single Arm Press", reps: reps, rest: 90)], WorkoutGenerationPreferences(focus: .chest))
            let generated = try XCTUnwrap(plan.exercises.first)
            let exercise = generated.exercise(code: "CW1")
            XCTAssertEqual(generated.reps, reps)
            XCTAssertEqual(exercise.prescription, "8-12 reps/side x 3 sets")
            XCTAssertEqual(exercise.code, "CW1")
            XCTAssertEqual(exercise.rest, "90 sec")
            XCTAssertEqual(exercise.instructions, ["Move with control.", "Keep a comfortable range."])
            XCTAssertFalse(exercise.prescription.contains("kg"))
            XCTAssertFalse(exercise.prescription.contains("lb"))
        }
    }

    func testTimedTargetsAndBothSidesAreIncludedInEstimate() throws {
        let oneSide = try generate([entry("Hold", muscle: "core", reps: "30 s")], WorkoutGenerationPreferences(focus: .core))
        let eachSide = try generate([entry("Side Hold", muscle: "core", reps: "30 s each")], WorkoutGenerationPreferences(focus: .core))
        XCTAssertEqual(oneSide.exercises.first?.prescription, "30 sec x 3 sets")
        XCTAssertEqual(eachSide.exercises.first?.prescription, "30 sec/side x 3 sets")
        XCTAssertEqual(oneSide.estimatedMinutes, 8)
        XCTAssertEqual(eachSide.estimatedMinutes, 9)
        let minutes = try generate([entry("Hold", muscle: "core", reps: "1 min per side")], WorkoutGenerationPreferences(focus: .core))
        XCTAssertEqual(minutes.exercises.first?.prescription, "1 min/side x 3 sets")
        XCTAssertEqual(minutes.estimatedMinutes, 12)
    }

    func testLongUnilateralExerciseCannotCrowdOutRequiredMuscles() throws {
        let plan = try generate([
            entry("Long Push Hold", reps: "120 sec each", sets: 4, rest: 180),
            entry("Row", muscle: "back", reps: "120 sec each", sets: 4, rest: 180),
            entry("Squat", muscle: "quads", reps: "120 sec each", sets: 4, rest: 180)
        ], WorkoutGenerationPreferences(minutes: 20, intensity: .challenging))
        XCTAssertEqual(Set(plan.exercises.map { $0.source.primaryMuscle }), ["chest", "back", "quads"])
        XCTAssertEqual(plan.exercises.map(\.sets), [1, 1, 1])
        XCTAssertLessThanOrEqual(plan.estimatedMinutes, 20)
    }

    func testRecentHistoryVariesSelectionThroughAliasesWithoutCreatingWeightTargets() throws {
        let recent = entry("Familiar Press", aliases: ["Old Press Name"])
        let exercises = [recent] + (1...4).map { entry("Fresh Press \($0)") }
        let history = [record("Old Press Name", date: "2026-09-25")]
        let plan = try WorkoutGenerator.generate(library: exercises, history: history, preferences: WorkoutGenerationPreferences(focus: .chest, minutes: 60), seed: 42, now: now)
        XCTAssertFalse(plan.exercises.contains { $0.id == recent.id })
        XCTAssertTrue(plan.notes.contains { $0.contains("Recent exercise history") })
        XCTAssertTrue(plan.exercises.allSatisfy { !$0.prescription.contains("999") })
    }

    func testFutureOldAndMalformedHistoryDoesNotChangeSelection() throws {
        let exercises = (1...6).map { entry("Press \($0)") }
        let preferences = WorkoutGenerationPreferences(focus: .chest, minutes: 60)
        let baseline = try generate(exercises, preferences)
        let history = ["2026-09-26", "2026-09-10", "2026-02-30", "2026-9-25", "invalid"].map { record("Press 1", date: $0) }
        let actual = try WorkoutGenerator.generate(library: exercises, history: history, preferences: preferences, seed: 42, now: now)
        XCTAssertEqual(actual, baseline)
    }

    func testSameSeedProducesSamePlanAndFourteenDayHistoryIsUsed() throws {
        let exercises = library()
        XCTAssertEqual(try generate(exercises, WorkoutGenerationPreferences()), try generate(exercises, WorkoutGenerationPreferences()))
        let history = [record("Push-Up", date: "2026-09-11")]
        let plan = try WorkoutGenerator.generate(library: exercises, history: history, preferences: WorkoutGenerationPreferences(), seed: 42, now: now)
        XCTAssertTrue(plan.recentHistoryUsed)
    }

    func testEmptyLibraryMissingRequiredGroupAndInvalidDurationFailClearly() {
        XCTAssertThrowsError(try generate([], WorkoutGenerationPreferences()))
        XCTAssertThrowsError(try generate([entry("Push-Up")], WorkoutGenerationPreferences()))
        XCTAssertThrowsError(try generate(library(), WorkoutGenerationPreferences(minutes: 25))) { error in
            XCTAssertEqual(error.localizedDescription, "Choose a 20, 30, 45, or 60 minute workout.")
        }
    }

    func testSparseLibraryReturnsHonestShortageNote() throws {
        let plan = try generate([entry("Push-Up")], WorkoutGenerationPreferences(focus: .chest, minutes: 60))
        XCTAssertEqual(plan.exercises.count, 1)
        XCTAssertLessThan(plan.estimatedMinutes, 60)
        XCTAssertTrue(plan.notes.contains { $0.contains("about \(plan.estimatedMinutes) minutes") })
    }

    func testSwapsPreferEquivalentMovementAndStayWithinEquipmentAndTime() throws {
        let original = entry("Floor Press", equipment: "dumbbell", group: "horizontal_press")
        let plan = try generate([original], WorkoutGenerationPreferences(focus: .chest, equipment: [.dumbbell], minutes: 20))
        let equivalent = entry("Another Floor Press", equipment: "dumbbell", group: "horizontal_press")
        let alternatives = WorkoutGenerator.alternatives(for: plan.exercises[0], in: plan, library: [
            original, equivalent, entry("Push-Up", equipment: "bodyweight", movement: "push"),
            entry("Bench Press", equipment: "dumbbell"), entry("Cable Press", equipment: "cable")
        ], history: [], now: now)
        XCTAssertEqual(alternatives.first?.id, equivalent.id)
        XCTAssertEqual(alternatives.count, 2)
        let replaced = try WorkoutGenerator.replacing(at: 0, with: XCTUnwrap(alternatives.first), in: plan)
        XCTAssertEqual(replaced.exercises.first?.id, equivalent.id)
        XCTAssertLessThanOrEqual(replaced.estimatedMinutes, 20)
    }

    func testSwapRejectsDuplicatesWrongEquipmentMissingGroupAndOvertime() throws {
        let plan = try generate(library(), WorkoutGenerationPreferences(minutes: 20))
        XCTAssertThrowsError(try WorkoutGenerator.replacing(at: 0, with: plan.exercises[1], in: plan))
        XCTAssertThrowsError(try WorkoutGenerator.replacing(at: -1, with: plan.exercises[0], in: plan))
        let chest = try generate([entry("Push-Up", equipment: "bodyweight")], WorkoutGenerationPreferences(focus: .chest, equipment: [.bodyweight]))
        let cable = GeneratedWorkoutExercise(source: entry("Cable Fly", equipment: "cable"), sets: 3, reps: "10", restSeconds: 60)
        XCTAssertThrowsError(try WorkoutGenerator.replacing(at: 0, with: cable, in: chest))
        let balanced = try generate([
            entry("Push-Up"), entry("Row", muscle: "back"), entry("Squat", muscle: "quads")
        ], WorkoutGenerationPreferences(minutes: 20))
        let pullIndex = try XCTUnwrap(balanced.exercises.firstIndex { $0.source.primaryMuscle == "back" })
        let extraPush = GeneratedWorkoutExercise(source: entry("Another Push-Up"), sets: 1, reps: "10", restSeconds: 60)
        XCTAssertThrowsError(try WorkoutGenerator.replacing(at: pullIndex, with: extraPush, in: balanced))
        let core = try generate([entry("Plank", muscle: "core")], WorkoutGenerationPreferences(focus: .core, minutes: 20))
        let long = GeneratedWorkoutExercise(source: entry("Long Hold", muscle: "core", reps: "120 sec/side"), sets: 4, reps: "120 sec/side", restSeconds: 180)
        XCTAssertThrowsError(try WorkoutGenerator.replacing(at: 0, with: long, in: core))
    }

    func testOnlySafeApprovedDemoURLsAreCarriedIntoWorkout() throws {
        let accepted = ["https://www.youtube.com/watch?v=abc", "https://youtu.be/abc", "https://project-id.supabase.co/storage/v1/object/public/exercise-videos/coach/video-1.mp4"]
        let rejected = ["http://youtube.com/watch?v=abc", "javascript:alert(1)", "https://youtube.com.evil.test/video", "https://user:password@youtube.com/watch?v=abc", "https://project.supabase.co/storage/v1/object/public/other/video.mp4", "https://project.supabase.co/storage/v1/object/public/exercise-videos/video.mp4?token=private"]
        for url in accepted + rejected {
            let plan = try generate([entry("Press", demo: url)], WorkoutGenerationPreferences(focus: .chest))
            XCTAssertEqual(plan.exercises[0].exercise(code: "CW1").video, accepted.contains(url) ? url : "")
        }
    }

    func testSelectableMusclesHaveStableNamingOrderAndExcludePresets() {
        XCTAssertEqual(WorkoutGenerationFocus.selectableMuscles, [
            .chest, .back, .shoulders, .glutes, .core, .quads, .hamstrings,
            .calves, .biceps, .triceps, .lats, .adductors
        ])
        XCTAssertEqual(Set(WorkoutGenerationFocus.selectableMuscles).count, 12)
        XCTAssertFalse(WorkoutGenerationFocus.selectableMuscles.contains { $0.isRecovery })
        XCTAssertFalse(WorkoutGenerationFocus.selectableMuscles.contains(.arms))
    }

    func testMuscleSelectionsNormalizeInvalidValuesAndOverrideStrengthPresets() {
        let input = WorkoutGenerationPreferences(focus: .lowerBody, selectedMuscles: [.triceps, .shoulders, .chest, .fullBody, .arms, .recoveryFull])
        let normalized = input.normalized
        XCTAssertEqual(normalized.selectedMuscles, [.chest, .shoulders, .triceps])
        XCTAssertEqual(normalized.focus, .lowerBody)
        XCTAssertEqual(normalized.focusTitle, "Chest, Shoulders & Triceps")
        XCTAssertEqual(input.focusTitle, normalized.focusTitle)
        XCTAssertEqual(normalized.targetMuscles, ["chest", "shoulders", "triceps"])
        XCTAssertEqual(normalized.requiredMuscleGroups, [["chest"], ["shoulders"], ["triceps"]])
        XCTAssertFalse(normalized.isRecovery)
        XCTAssertEqual(normalized.normalized, normalized)
        let invalidOnly = WorkoutGenerationPreferences(focus: .arms, selectedMuscles: [.fullBody, .recoveryLower]).normalized
        XCTAssertTrue(invalidOnly.selectedMuscles.isEmpty)
        XCTAssertEqual(invalidOnly.focusTitle, "Arms")
        XCTAssertEqual(invalidOnly.requiredMuscleGroups, [["biceps"], ["triceps"]])
    }

    func testRecoveryClearsMuscleSelectionsAndRetainsItsGentleCoverageContract() throws {
        let input = WorkoutGenerationPreferences(focus: .recoveryFull, intensity: .challenging, selectedMuscles: [.chest, .quads, .lats])
        let normalized = input.normalized
        XCTAssertTrue(input.isRecovery)
        XCTAssertEqual(input.focusTitle, "Full body recovery")
        XCTAssertEqual(input.requiredMuscleGroups, WorkoutGenerationPreferences(focus: .recoveryFull).requiredMuscleGroups)
        XCTAssertTrue(normalized.selectedMuscles.isEmpty)
        XCTAssertEqual(normalized.intensity, .easy)
        let plan = try generate(recoveryLibrary() + library(), input)
        XCTAssertEqual(plan.title, "Full body recovery")
        XCTAssertTrue(plan.preferences.selectedMuscles.isEmpty)
        XCTAssertTrue(plan.exercises.allSatisfy { ["mobility", "stretching"].contains($0.source.movementPattern) })
    }

    func testMultipleMusclesAreAllCoveredForEveryDurationIntensityAndSeed() throws {
        let selection: Set<WorkoutGenerationFocus> = [.chest, .shoulders, .triceps]
        for minutes in WorkoutGenerator.durations {
            for intensity in WorkoutGenerationIntensity.allCases {
                for seed in UInt64(0)..<8 {
                    let preferences = WorkoutGenerationPreferences(minutes: minutes, intensity: intensity, selectedMuscles: selection)
                    let plan = try generate(library(), preferences, seed: seed)
                    XCTAssertEqual(plan.title, "Chest, Shoulders & Triceps workout")
                    XCTAssertEqual(Set(plan.exercises.map { $0.source.primaryMuscle }), ["chest", "shoulders", "triceps"])
                    XCTAssertEqual(plan.preferences.selectedMuscles, selection)
                    XCTAssertEqual(Set(plan.exercises.map(\.id)).count, plan.exercises.count)
                    XCTAssertLessThanOrEqual(plan.estimatedMinutes, minutes)
                    XCTAssertTrue(plan.exercises.allSatisfy { $0.sets <= (intensity == .easy ? 2 : intensity == .moderate ? 3 : 4) })
                }
            }
        }
    }

    func testBackAndExplicitLatsShareOneStrictRequirementWithoutDoubleReservation() throws {
        let preferences = WorkoutGenerationPreferences(minutes: 20, selectedMuscles: [.back, .lats, .chest])
        XCTAssertEqual(preferences.focusTitle, "Chest, Back & Lats")
        XCTAssertEqual(preferences.targetMuscles, ["chest", "back", "lats"])
        XCTAssertEqual(preferences.requiredMuscleGroups, [["chest"], ["lats"]])
        let plan = try generate([
            entry("Long Chest Hold", reps: "120 sec each", rest: 180),
            entry("Long Lat Pull", muscle: "lats", reps: "120 sec each", rest: 180)
        ], preferences)
        XCTAssertEqual(Set(plan.exercises.map { $0.source.primaryMuscle }), ["chest", "lats"])
        XCTAssertLessThanOrEqual(plan.estimatedMinutes, 20)
        XCTAssertThrowsError(try generate([entry("Push-Up"), entry("Row", muscle: "back")], preferences))
        let broadBack = try generate([entry("Lat Pull", muscle: "lats")], WorkoutGenerationPreferences(selectedMuscles: [.back]))
        XCTAssertEqual(broadBack.exercises.first?.source.primaryMuscle, "lats")
    }

    func testSingleExplicitMusclePreservesLegacySingleFocusBehavior() throws {
        let exercises = (1...7).map { entry("Press \($0)") }
        let old = try generate(exercises, WorkoutGenerationPreferences(focus: .chest, minutes: 60), seed: 4)
        let selected = try generate(exercises, WorkoutGenerationPreferences(minutes: 60, selectedMuscles: [.chest]), seed: 4)
        XCTAssertEqual(selected.exercises, old.exercises)
        XCTAssertEqual(selected.estimatedMinutes, old.estimatedMinutes)
        XCTAssertEqual(selected.title, old.title)
        XCTAssertEqual(selected.exercises.count, 4)
        let existing = try generate(library(), WorkoutGenerationPreferences(focus: .chestBack))
        XCTAssertTrue(existing.preferences.selectedMuscles.isEmpty)
        XCTAssertEqual(existing.title, "Chest & back workout")
    }

    func testUnavailableSelectedMusclesFailWithEquipmentAndSelectionRemedies() {
        let selection: Set<WorkoutGenerationFocus> = [.chest, .shoulders, .triceps]
        XCTAssertThrowsError(try generate(library(), WorkoutGenerationPreferences(equipment: [.bodyweight], selectedMuscles: selection))) { error in
            XCTAssertTrue(error.localizedDescription.contains("Chest, Shoulders & Triceps"))
            XCTAssertTrue(error.localizedDescription.contains("equipment and intensity"))
            XCTAssertTrue(error.localizedDescription.contains("choose fewer muscles"))
        }
        XCTAssertThrowsError(try generate([
            entry("Press"), entry("Intermediate Curl", muscle: "biceps", difficulty: "intermediate")
        ], WorkoutGenerationPreferences(intensity: .easy, selectedMuscles: [.chest, .biceps])))
        XCTAssertThrowsError(try generate([
            entry("Press"), entry("Triceps Stretch", muscle: "triceps", movement: "stretching", reps: "30 sec")
        ], WorkoutGenerationPreferences(selectedMuscles: [.chest, .triceps])))
    }

    func testMoreSelectedGroupsThanWorkoutSlotsFailInsteadOfDroppingAMuscle() throws {
        let selection: Set<WorkoutGenerationFocus> = [.chest, .back, .shoulders, .glutes, .core]
        XCTAssertThrowsError(try generate(library(), WorkoutGenerationPreferences(minutes: 20, selectedMuscles: selection))) { error in
            XCTAssertTrue(error.localizedDescription.contains("20 minutes"))
            XCTAssertTrue(error.localizedDescription.contains("fewer muscles"))
            XCTAssertTrue(error.localizedDescription.contains("longer workout"))
        }
        let plan = try generate(library(), WorkoutGenerationPreferences(minutes: 30, selectedMuscles: selection))
        XCTAssertEqual(plan.exercises.count, 5)
        for group in plan.preferences.requiredMuscleGroups {
            XCTAssertTrue(plan.exercises.contains { group.contains($0.source.primaryMuscle) })
        }
        XCTAssertThrowsError(try generate(library(), WorkoutGenerationPreferences(minutes: 60, selectedMuscles: Set(WorkoutGenerationFocus.selectableMuscles)))) { error in
            XCTAssertTrue(error.localizedDescription.contains("Select fewer muscles"))
            XCTAssertFalse(error.localizedDescription.contains("longer workout"))
        }
    }

    func testFourFastGroupsFitTwentyMinutesAndEightGroupsFitSixtyButNineDoNot() throws {
        let four: Set<WorkoutGenerationFocus> = [.chest, .shoulders, .biceps, .triceps]
        let short = try generate(library(), WorkoutGenerationPreferences(minutes: 20, selectedMuscles: four))
        XCTAssertEqual(short.exercises.count, 4)
        XCTAssertEqual(Set(short.exercises.map { $0.source.primaryMuscle }), Set(four.map(\.rawValue)))
        XCTAssertLessThanOrEqual(short.estimatedMinutes, 20)
        let eight = Set(WorkoutGenerationFocus.selectableMuscles.prefix(8))
        let long = try generate(library(), WorkoutGenerationPreferences(minutes: 60, selectedMuscles: eight))
        XCTAssertEqual(long.exercises.count, 8)
        XCTAssertLessThanOrEqual(long.estimatedMinutes, 60)
        for group in long.preferences.requiredMuscleGroups {
            XCTAssertTrue(long.exercises.contains { group.contains($0.source.primaryMuscle) })
        }
        let nine = Set(WorkoutGenerationFocus.selectableMuscles.prefix(9))
        XCTAssertThrowsError(try generate(library(), WorkoutGenerationPreferences(minutes: 60, selectedMuscles: nine))) { error in
            XCTAssertTrue(error.localizedDescription.contains("Select fewer muscles"))
        }
    }

    func testMultipleMusclesCannotExceedDurationEvenWhenEveryMuscleHasAnExercise() throws {
        let selection: Set<WorkoutGenerationFocus> = [.chest, .shoulders, .biceps, .triceps]
        let exercises = selection.map { entry("Long \($0.title) Exercise", muscle: $0.rawValue, reps: "120 sec each", sets: 4, rest: 180) }
        XCTAssertThrowsError(try generate(exercises, WorkoutGenerationPreferences(minutes: 20, selectedMuscles: selection))) { error in
            XCTAssertTrue(error.localizedDescription.contains("20 minutes"))
        }
        let longer = try generate(exercises, WorkoutGenerationPreferences(minutes: 30, selectedMuscles: selection))
        XCTAssertEqual(longer.exercises.count, 4)
        XCTAssertLessThanOrEqual(longer.estimatedMinutes, 30)
    }

    func testMultiMuscleSwapOptionsAndManualReplacementCannotDropExplicitLats() throws {
        let preferences = WorkoutGenerationPreferences(equipment: [.bodyweight], selectedMuscles: [.chest, .back, .lats])
        let original = entry("Lat Pull", muscle: "lats")
        let plan = try generate([entry("Press"), original], preferences)
        let index = try XCTUnwrap(plan.exercises.firstIndex { $0.source.primaryMuscle == "lats" })
        let alternate = entry("Another Lat Pull", muscle: "lats")
        let back = entry("Back Row", muscle: "back")
        let alternatives = WorkoutGenerator.alternatives(for: plan.exercises[index], in: plan, library: [
            alternate, back, entry("Cable Lat Pull", muscle: "lats", equipment: "cable"),
            entry("Lat Stretch", muscle: "lats", movement: "stretching", reps: "30 sec")
        ], history: [], now: now)
        XCTAssertEqual(alternatives.map(\.id), [alternate.id])
        let updated = try WorkoutGenerator.replacing(at: index, with: XCTUnwrap(alternatives.first), in: plan)
        XCTAssertEqual(updated.preferences.selectedMuscles, preferences.selectedMuscles)
        XCTAssertEqual(Set(updated.exercises.map { $0.source.primaryMuscle }), ["chest", "lats"])
        XCTAssertThrowsError(try WorkoutGenerator.replacing(at: index,
            with: GeneratedWorkoutExercise(source: back, sets: 1, reps: "10", restSeconds: 60), in: plan))
    }

    func testMultipleMuscleSelectionStillUsesRecentHistoryToVaryExercises() throws {
        let recent = entry("Familiar Press", aliases: ["Old Press Name"])
        let exercises = [recent, entry("Triceps Press", muscle: "triceps")] + (1...4).map { entry("Fresh Press \($0)") }
        let preferences = WorkoutGenerationPreferences(minutes: 60, selectedMuscles: [.chest, .triceps])
        let plan = try WorkoutGenerator.generate(library: exercises, history: [record("Old Press Name", date: "2026-09-25")],
            preferences: preferences, seed: 42, now: now)
        XCTAssertFalse(plan.exercises.contains { $0.id == recent.id })
        XCTAssertTrue(plan.recentHistoryUsed)
        XCTAssertEqual(Set(plan.exercises.map { $0.source.primaryMuscle }), ["chest", "triceps"])
        XCTAssertTrue(plan.exercises.allSatisfy { !$0.prescription.contains("999") })
    }

    func testMultiMuscleLaunchRoundTripKeepsHumanTitleExercisesAndUniqueIdentity() throws {
        let plan = try generate(library(), WorkoutGenerationPreferences(selectedMuscles: [.chest, .shoulders, .triceps]))
        let launch = GeneratedWorkoutLaunch(plan: plan, createdAt: now)
        let restored = try JSONDecoder().decode(GeneratedWorkoutLaunch.self, from: JSONEncoder().encode(launch))
        XCTAssertEqual(restored, launch)
        XCTAssertEqual(restored.title, "Chest, Shoulders & Triceps workout")
        XCTAssertEqual(restored.workout.title.fwbWorkoutDisplayTitle, restored.title)
        XCTAssertEqual(restored.workout.exercises.map(\.name), plan.exercises.map { $0.source.name })
        XCTAssertEqual(restored.workout.id, launch.id)
        XCTAssertNotEqual(GeneratedWorkoutLaunch(plan: plan).workout.title, launch.workout.title)
    }

    private func generate(_ exercises: [ApprovedExercise], _ preferences: WorkoutGenerationPreferences, seed: UInt64 = 42) throws -> GeneratedWorkoutPlan {
        try WorkoutGenerator.generate(library: exercises, history: [], preferences: preferences, seed: seed, now: now)
    }

    private func entry(
        _ name: String, id: UUID = UUID(), aliases: [String] = [], muscle: String = "chest",
        equipment: String = "bodyweight", difficulty: String = "beginner", movement: String = "horizontal_push",
        reps: String = "10", sets: Int = 3, rest: Int = 60, group: String = "", demo: String? = nil
    ) -> ApprovedExercise {
        ApprovedExercise(id: id, name: name, aliases: aliases, primaryMuscle: muscle, secondaryMuscles: [],
                         equipment: equipment, difficulty: difficulty, movementPattern: movement,
                         defaultSets: sets, defaultReps: reps, defaultRestSeconds: rest,
                         substitutionGroup: group, demoURL: demo, instructions: "Move with control.\nKeep a comfortable range.")
    }

    private func library() -> [ApprovedExercise] {
        [
            entry("Push-Up"), entry("Dumbbell Floor Press", equipment: "dumbbell"),
            entry("Cable Row", muscle: "back", equipment: "cable", movement: "horizontal_pull"),
            entry("Lat Pulldown", muscle: "lats", equipment: "machine", movement: "vertical_pull"),
            entry("Squat", muscle: "quads", movement: "squat"),
            entry("Dumbbell Romanian Deadlift", muscle: "hamstrings", equipment: "dumbbell", movement: "hinge"),
            entry("Glute Bridge", muscle: "glutes", movement: "hip_extension"),
            entry("Standing Dumbbell Press", muscle: "shoulders", equipment: "dumbbell", movement: "vertical_push"),
            entry("Dumbbell Curl", muscle: "biceps", equipment: "dumbbell", movement: "elbow_flexion"),
            entry("Cable Pushdown", muscle: "triceps", equipment: "cable", movement: "elbow_extension"),
            entry("Calf Raise", muscle: "calves", movement: "plantar_flexion"),
            entry("Plank", muscle: "core", movement: "anti_extension", reps: "30 sec"),
            entry("Adductor Machine", muscle: "adductors", equipment: "machine", movement: "adduction")
        ]
    }

    /// Matches the recovery catalog's prescription metadata without requiring a network account.
    private func recoveryLibrary() -> [ApprovedExercise] {
        [
            entry("Cat-Cow", muscle: "back", movement: "mobility", reps: "6-8", sets: 2, rest: 20),
            entry("Side-Lying Open Book", muscle: "back", movement: "mobility", reps: "6-8 each", sets: 2, rest: 20),
            entry("Shoulder Circles", muscle: "shoulders", movement: "mobility", reps: "8-10", sets: 2, rest: 20),
            entry("Cross-Body Shoulder Stretch", muscle: "shoulders", movement: "stretching", reps: "20-30 sec each", sets: 2, rest: 20),
            entry("Supine Chest Stretch", movement: "stretching", reps: "20-30 sec", sets: 2, rest: 20),
            entry("Overhead Triceps Stretch", muscle: "triceps", movement: "stretching", reps: "20-30 sec each", sets: 2, rest: 20),
            entry("Supine Figure-Four Stretch", muscle: "glutes", movement: "stretching", reps: "20-30 sec each", sets: 2, rest: 20),
            entry("Supine Hamstring Stretch", muscle: "hamstrings", movement: "stretching", reps: "20-30 sec each", sets: 2, rest: 20),
            entry("Half-Kneeling Hip Flexor Stretch", muscle: "quads", movement: "stretching", reps: "20-30 sec each", sets: 2, rest: 20),
            entry("Side-Lying Quad Stretch", muscle: "quads", movement: "stretching", reps: "20-30 sec each", sets: 2, rest: 20),
            entry("Seated Butterfly Stretch", muscle: "adductors", movement: "stretching", reps: "20-30 sec", sets: 2, rest: 20),
            entry("Supine Ankle Circles", muscle: "calves", movement: "mobility", reps: "8-10 each", sets: 2, rest: 20)
        ]
    }

    private func record(_ name: String, date: String) -> WorkoutHistoryRecord {
        WorkoutHistoryRecord(entryDate: date, workoutTitle: "Previous session", exerciseCode: "A1", exerciseName: name,
                             setNumber: 1, weightUsed: 999, reps: 10, notes: nil)
    }
}
