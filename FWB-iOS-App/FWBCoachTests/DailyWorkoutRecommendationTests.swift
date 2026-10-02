import XCTest
@testable import FWBCoach

final class DailyWorkoutRecommendationTests: XCTestCase {
    private let programID = UUID(uuidString: "10101010-1010-1010-1010-101010101010")!
    private let firstID = UUID(uuidString: "20202020-2020-2020-2020-202020202020")!
    private let email = "client@example.test"
    private let day = "2026-09-25"

    func testReadyReturnsExactAssignedWorkoutWithoutIncreasingVolume() throws {
        let original = workout()
        let result = recommend([original], checkIn())
        XCTAssertEqual(result.level, .planned)
        XCTAssertEqual(result.workout, original)
        XCTAssertEqual(result.originalWorkout, original)
        XCTAssertEqual(result.generatorPreferences.intensity, .moderate)
        XCTAssertEqual(result.generatorPreferences.focus, .fullBody)
    }

    func testLowerMoodAloneSuggestsShorterSessionNotRecovery() throws {
        let original = workout()
        let result = recommend([original], checkIn(mood: 1))
        let adjusted = try XCTUnwrap(result.workout)
        XCTAssertEqual(result.level, .lighter)
        XCTAssertEqual(adjusted.exercises[0].prescription, "8–10 reps x 2 sets")
        XCTAssertTrue(result.reasons.contains { $0.contains("lower mood") })
        XCTAssertNotEqual(adjusted.id, original.id)
        XCTAssertNotEqual(adjusted.title, original.title)
    }

    func testLowEnergyShortensWithoutChangingRestInstructionsOrLoads() throws {
        let source = Exercise(code: "A1", name: "Squat", prescription: "4 sets x 8 reps @ 40 kg", rest: "120 sec", instructions: ["Keep control"], video: "https://youtu.be/demo")
        let original = workout(exercises: [source])
        let before = program([original])
        let result = DailyWorkoutRecommendationEngine.recommend(program: before, history: [], checkIn: checkIn(energy: 2))
        let adjusted = try XCTUnwrap(result.workout?.exercises.first)
        XCTAssertEqual(result.level, .lighter)
        XCTAssertEqual(adjusted.prescription, "3 sets x 8 reps @ 40 kg")
        XCTAssertEqual(adjusted.code, source.code)
        XCTAssertEqual(adjusted.name, source.name)
        XCTAssertEqual(adjusted.rest, source.rest)
        XCTAssertEqual(adjusted.instructions, source.instructions)
        XCTAssertEqual(adjusted.video, source.video)
        XCTAssertEqual(before, program([original]))
    }

    func testWarmupCooldownOrderAndSupersetAssignmentsSurvive() throws {
        let exercises = [
            Exercise(code: "WARMUP", name: "Warm-up", prescription: "3 sets x 30 sec"),
            Exercise(code: "A1", name: "Press", prescription: "3 x 10"),
            Exercise(code: "A2", name: "Row", prescription: "3 x 10"),
            Exercise(code: "COOLDOWN", name: "Cool-down", prescription: "3 sets x 30 sec")
        ]
        let original = workout(format: "superset", exercises: exercises)
        let adjusted = try XCTUnwrap(recommend([original], checkIn(mood: 2)).workout)
        XCTAssertEqual(adjusted.format, original.format)
        XCTAssertEqual(adjusted.exercises.map(\.code), original.exercises.map(\.code))
        XCTAssertEqual(adjusted.exercises.first, original.exercises.first)
        XCTAssertEqual(adjusted.exercises.last, original.exercises.last)
        XCTAssertEqual(adjusted.exercises[1].prescription, "2 x 10")
        XCTAssertEqual(WorkoutSequencePlanner.inferredAssignments(for: adjusted), WorkoutSequencePlanner.inferredAssignments(for: original))
    }

    func testTimeTargetsAndOneSetAreRetained() throws {
        let original = workout(exercises: [
            Exercise(code: "A1", name: "Plank", prescription: "30 sec x 3 sets"),
            Exercise(code: "A2", name: "Carry", prescription: "1 set x 40 sec")
        ])
        let adjusted = try XCTUnwrap(recommend([original], checkIn(mood: 1)).workout)
        XCTAssertEqual(adjusted.exercises[0].prescription, "30 sec x 2 sets")
        XCTAssertEqual(adjusted.exercises[1], original.exercises[1])
        XCTAssertEqual(GeneratedWorkoutLoggerPreparation.initialSetType(for: adjusted.exercises[0]), .timed)
    }

    func testAmbiguousPrescriptionIsNeverRewritten() throws {
        for prescription in ["3–4 sets x 10", "As prescribed", "10 reps", "2/3 sets", "30 minutes"] {
            let original = workout(exercises: [Exercise(code: "A1", name: "Exercise", prescription: prescription)])
            let adjusted = try XCTUnwrap(recommend([original], checkIn(mood: 1)).workout)
            XCTAssertEqual(adjusted.exercises[0].prescription, prescription)
        }
    }

    func testRecoverySelectsOnlyExplicitAssignedRecoveryAndPreservesOriginalAlternate() throws {
        let strength = workout()
        let mobility = Workout(title: "Coach mobility", focus: "Ankles and hips", format: "mobility", exercises: [Exercise(code: "M1", name: "Hip mobility", prescription: "4 rounds x 30 sec")])
        let result = recommend([strength, mobility], checkIn(energy: 1))
        XCTAssertEqual(result.level, .recovery)
        XCTAssertEqual(result.originalWorkout, strength)
        XCTAssertEqual(result.workout?.focus, mobility.focus)
        XCTAssertEqual(result.workout?.exercises[0].prescription, "2 rounds x 30 sec")
        XCTAssertEqual(result.generatorPreferences.intensity, .easy)
        XCTAssertEqual(result.generatorPreferences.minutes, 20)
        XCTAssertEqual(result.generatorPreferences.focus, .recoveryFull)
    }

    func testRecoveryDoesNotRelabelHeavyOrMixedRoutineAsRecovery() {
        let mixed = Workout(title: "Strength + mobility", format: "superset", exercises: workout().exercises)
        let result = recommend([mixed], checkIn(soreness: 5))
        XCTAssertEqual(result.level, .recovery)
        XCTAssertNil(result.workout)
        XCTAssertEqual(result.originalWorkout, mixed)
        XCTAssertTrue(result.changes[0].contains("no assigned recovery routine"))
        XCTAssertEqual(result.generatorPreferences.focus, .recoveryFull)
        XCTAssertEqual(result.generatorPreferences.intensity, .easy)
    }

    func testNextWorkoutUsesLatestCompletedMatchInUnsortedHistory() {
        let first = workout()
        let second = Workout(title: "Lower body", exercises: first.exercises)
        let third = Workout(title: "Upper body", exercises: first.exercises)
        let history = [session(first, date: "2026-09-20"), session(third, date: "2026-09-21"), session(second, date: "2026-09-24")]
        let result = recommend([first, second, third], checkIn(), history: history)
        XCTAssertEqual(result.originalWorkout, third)
    }

    func testRotationWrapsAndIgnoresUnfinishedUnrelatedAndFutureSessions() {
        let first = workout()
        let second = Workout(title: "Lower body", exercises: first.exercises)
        let other = Workout(title: "Custom workout · Something else", exercises: first.exercises)
        let history = [session(second, date: "2026-09-20"), session(first, date: "2026-09-24", completed: false), session(other, date: "2026-09-24"), session(first, date: "2026-09-26")]
        XCTAssertEqual(recommend([first, second], checkIn(), history: history).workout, first)
    }

    func testDailyAdjustedHistoryAdvancesNextDayAndStaysPutSameDay() throws {
        let first = workout()
        let second = Workout(title: "Lower body", exercises: first.exercises)
        let yesterdayCheckIn = checkIn(mood: 2, date: "2026-09-24")
        let adjusted = try XCTUnwrap(recommend([first, second], yesterdayCheckIn).workout)
        let history = [session(adjusted, date: "2026-09-24")]
        XCTAssertEqual(recommend([first, second], checkIn(), history: history).originalWorkout, second)
        XCTAssertEqual(recommend([first, second], yesterdayCheckIn, history: history).originalWorkout, first)
    }

    func testSameDayAssignedCompletionDoesNotAdvanceAnotherWorkout() {
        let first = workout()
        let second = Workout(title: "Lower body", exercises: first.exercises)
        XCTAssertEqual(recommend([first, second], checkIn(), history: [session(first, date: day)]).workout, first)
    }

    func testDailyHistoryKeepsSourceIdentityWhenAssignedTitleChanges() throws {
        let first = workout()
        let second = Workout(title: "Lower body", exercises: first.exercises)
        let adjusted = try XCTUnwrap(recommend([first, second], checkIn(mood: 2, date: "2026-09-24")).workout)
        let renamed = Workout(id: first.id, title: "Renamed by coach", focus: first.focus, format: first.format, exercises: first.exercises)
        XCTAssertEqual(recommend([renamed, second], checkIn(), history: [session(adjusted, date: "2026-09-24")]).originalWorkout, second)
    }

    func testLegacyLogsCanAdvanceWithoutModernCompletionMarker() {
        let first = workout()
        let second = Workout(title: "Lower body", exercises: first.exercises)
        let record = WorkoutHistoryRecord(hasSessionIdentity: false, entryDate: "2026-09-24", workoutTitle: first.title, exerciseCode: "A1", exerciseName: "Press", setNumber: 1, weightUsed: 20, reps: 10, notes: nil)
        let history = [WorkoutHistorySession(entryDate: "2026-09-24", workoutTitle: first.title, records: [record])]
        XCTAssertEqual(recommend([first, second], checkIn(), history: history).workout, second)
    }

    func testDailyIdentityIsStableAndScopesAccountDateProgramAndSource() throws {
        let original = workout()
        let result = try XCTUnwrap(recommend([original], checkIn(mood: 1)).workout)
        let sameDay = try XCTUnwrap(recommend([original], checkIn(energy: 2, mood: 2)).workout)
        XCTAssertEqual(result.id, sameDay.id)
        XCTAssertEqual(result.title, sameDay.title)
        XCTAssertFalse(result.title.contains(email))
        XCTAssertFalse(result.title.fwbWorkoutDisplayTitle.contains(result.id.uuidString.lowercased()))
        let id = DailyWorkoutRecommendationEngine.dailyID
        XCTAssertEqual(id(email, day, programID, firstID), id(" CLIENT@EXAMPLE.TEST ", day, programID, firstID))
        XCTAssertNotEqual(result.id, id("other@example.test", day, programID, firstID))
        XCTAssertNotEqual(result.id, id(email, "2026-09-26", programID, firstID))
        XCTAssertNotEqual(result.id, id(email, day, UUID(), firstID))
        XCTAssertNotEqual(result.id, id(email, day, programID, UUID()))
    }

    func testMissingEmptyAndOtherClientProgramsUseGeneratorFallback() {
        for program in [nil, self.program([]), self.program([Workout(title: "Empty")]), self.program([workout()], email: "other@example.test")] {
            let result = DailyWorkoutRecommendationEngine.recommend(program: program, history: [], checkIn: checkIn())
            XCTAssertNil(result.workout)
            XCTAssertNil(result.originalWorkout)
            XCTAssertEqual(result.generatorPreferences.intensity, .moderate)
        }
    }

    func testEmptyWorkoutIsSkippedWithinAssignedSequence() {
        let valid = workout()
        XCTAssertEqual(recommend([Workout(title: "Empty"), valid], checkIn()).workout, valid)
    }

    func testPhysicalReadinessBoundariesAndInvalidMutableRatingsAreClamped() {
        XCTAssertEqual(recommend([workout()], checkIn(energy: 4, sleep: 4, soreness: 2)).level, .planned) // 80
        XCTAssertEqual(recommend([workout()], checkIn(energy: 3, sleep: 4, soreness: 2)).level, .lighter) // 73
        XCTAssertEqual(recommend([workout()], checkIn(energy: 3, sleep: 3, soreness: 3)).level, .lighter) // 60
        XCTAssertEqual(recommend([workout()], checkIn(energy: 2, sleep: 3, soreness: 3)).level, .recovery) // 53
        var checkIn = checkIn()
        checkIn.energy = -100
        checkIn.sleepRecovery = 999
        checkIn.soreness = -100
        checkIn.mood = 999
        XCTAssertEqual(recommend([workout()], checkIn).level, .recovery)
        checkIn.energy = 999
        XCTAssertEqual(recommend([workout()], checkIn).level, .planned)
    }

    private func workout(format: String = "superset", exercises: [Exercise]? = nil) -> Workout {
        Workout(id: firstID, title: "Full body", focus: "Strength", format: format, exercises: exercises ?? [Exercise(code: "A1", name: "Press", prescription: "8–10 reps x 3 sets", rest: "90 sec")])
    }

    private func checkIn(energy: Int = 5, sleep: Int = 5, soreness: Int = 1, mood: Int? = 5, date: String? = nil) -> ReadinessCheckIn {
        ReadinessCheckIn(clientEmail: email, localDate: date ?? day, energy: energy, soreness: soreness, sleepRecovery: sleep, mood: mood, note: "")
    }

    private func program(_ workouts: [Workout], email: String? = nil) -> ClientProgram {
        ClientProgram(id: programID, clientEmail: email ?? self.email, clientName: "Client", initials: "C", programTitle: "Program", programSummary: "", sessionCountUsed: 0, sessionCountTotal: 10, fitnessGoal: "", focusTarget: "", coachNoteTitle: "", coachNoteBody: "", nutritionPlan: nil, workouts: workouts, updatedAt: nil, syncSource: nil, sourceVersion: nil)
    }

    private func recommend(_ workouts: [Workout], _ checkIn: ReadinessCheckIn, history: [WorkoutHistorySession] = []) -> DailyWorkoutRecommendation {
        DailyWorkoutRecommendationEngine.recommend(program: program(workouts), history: history, checkIn: checkIn)
    }

    private func session(_ workout: Workout, date: String, completed: Bool = true) -> WorkoutHistorySession {
        let record = WorkoutHistoryRecord(entryDate: date, workoutTitle: workout.title, exerciseCode: "A1", exerciseName: "Press", setNumber: 1, weightUsed: 20, reps: 10, notes: nil, completedAt: completed ? Date(timeIntervalSince1970: 1_000) : nil)
        return WorkoutHistorySession(entryDate: date, workoutTitle: workout.title, records: [record])
    }
}
