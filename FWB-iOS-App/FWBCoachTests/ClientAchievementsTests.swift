import XCTest
@testable import FWBCoach

final class ClientAchievementsTests: XCTestCase {
    func testEmptyHistoryHasLockedCollectionAndFirstLevel() {
        let result = evaluate([])
        XCTAssertEqual(result.workoutCount, 0)
        XCTAssertEqual(result.prCount, 0)
        XCTAssertEqual(result.xp, 0)
        XCTAssertEqual(result.badges.count, 24)
        XCTAssertEqual(result.mobilityWorkoutCount, 0)
        XCTAssertEqual(result.yogaWorkoutCount, 0)
        XCTAssertTrue(result.badges.allSatisfy { !$0.unlocked && $0.current == 0 && $0.earnedOn == nil })
        XCTAssertTrue(result.events.isEmpty)
        XCTAssertEqual(result.level.number, 1)
        XCTAssertEqual(result.level.name, "Getting Started")
        XCTAssertEqual(result.level.nextXP, 300)
        XCTAssertEqual(result.level.progress, 0)
    }

    func testOnlyFinishedMeaningfulSessionsCount() {
        let result = evaluate([
            row(1, completed: false),
            row(2, reps: 0),
            row(3, type: .warmUp),
            row(4, set: 1_000),
            row(5, code: "WARMUP"),
            row(6, weight: -.infinity),
            row(7, weight: -1),
            row(8, reps: .nan),
            row(9, weight: 0, reps: 10)
        ])
        XCTAssertEqual(result.workoutCount, 1)
        XCTAssertEqual(result.prCount, 0)
        XCTAssertEqual(result.xp, 200)
        XCTAssertEqual(badge("workout-1", in: result).earnedOn, "2026-09-01")
    }

    func testCompletionMarkerAppliesToAllMembersOfSavedSession() {
        let result = evaluate([
            row(1, set: 1, reps: 0),
            row(1, set: 2, completed: false),
            row(2, set: 1, reps: 0, completed: false),
            row(2, set: 2, completed: false)
        ])
        XCTAssertEqual(result.workoutCount, 1)
    }

    func testInvalidAndFutureDatesAreExcludedWithoutTimezoneDependence() {
        let result = evaluate([
            row(1, day: "2026-02-29"), row(2, day: "2026-09-31"),
            row(3, day: "2026-9-01"), row(4, day: "2026-09-26"),
            row(5, day: "0000-09-01"), row(6, day: "2026-09-25"),
            row(7, day: "2024-02-29")
        ])
        XCTAssertEqual(result.workoutCount, 2)
        XCTAssertEqual(evaluate([row(1)], today: "not-a-date").workoutCount, 0)
    }

    func testBaselineAndTiesDoNotAwardPRAndOneExerciseSessionAwardsOnce() {
        let result = evaluate([
            row(1, day: "2026-09-01", weight: 100, reps: 8),
            row(2, day: "2026-09-02", weight: 100, reps: 20),
            row(3, day: "2026-09-03", set: 1, weight: 105, reps: 5),
            row(3, day: "2026-09-03", set: 2, weight: 110, reps: 6),
            row(3, day: "2026-09-03", set: 3, weight: 110, reps: 8)
        ])
        XCTAssertEqual(result.workoutCount, 3)
        XCTAssertEqual(result.prCount, 1)
        let prs = result.events.filter { $0.kind == .pr }
        XCTAssertEqual(prs.count, 1)
        XCTAssertEqual(prs.first?.detail, "110 lb × 8 reps")
        XCTAssertEqual(prs.first?.sessionID, "session:\(uuid(3).uuidString.lowercased())")
        XCTAssertEqual(badge("pr-1", in: result).earnedOn, "2026-09-03")
        XCTAssertEqual(result.xp, 550)
    }

    func testWeightedAndBodyweightRecordsHaveSeparateBaselines() {
        let result = evaluate([
            row(1, day: "2026-09-01", weight: 0, reps: 10),
            row(2, day: "2026-09-02", weight: 25, reps: 8),
            row(3, day: "2026-09-03", weight: 0, reps: 11),
            row(4, day: "2026-09-04", set: 1, weight: 30, reps: 8),
            row(4, day: "2026-09-04", set: 2, weight: 0, reps: 12)
        ])
        XCTAssertEqual(result.prCount, 2)
        let prs = result.events.filter { $0.kind == .pr }
        XCTAssertEqual(prs.map(\.detail), ["11 bodyweight reps", "30 lb × 8 reps"])
    }

    func testExerciseNamesNormalizeAccentsCaseAndSpaceButKeepVariants() {
        let result = evaluate([
            row(1, day: "2026-09-01", name: "  Café   Press ", weight: 40),
            row(2, day: "2026-09-02", name: "CAFE PRESS", weight: 45),
            row(3, day: "2026-09-03", name: "Incline Cafe Press", weight: 50),
            row(4, day: "2026-09-04", name: "", code: "CW01", weight: 10),
            row(5, day: "2026-09-05", name: "", code: "CW01", weight: 20)
        ])
        XCTAssertEqual(result.prCount, 1)
        XCTAssertTrue(result.events.filter { $0.kind == .pr }.first?.id.hasSuffix(":cafe press") == true)
    }

    func testWarmUpTimedAndCardioNeverCompeteForStrengthRecords() {
        let result = evaluate([
            row(1, day: "2026-09-01", weight: 100),
            row(2, day: "2026-09-02", weight: 200, type: .warmUp),
            row(3, day: "2026-09-03", weight: 200, type: .timed, duration: 30),
            row(4, day: "2026-09-04", weight: 200, duration: 30),
            row(5, day: "2026-09-05", code: "CARDIO", weight: 200),
            row(6, day: "2026-09-06", set: 1_000, weight: 300),
            row(7, day: "2026-09-07", weight: 105)
        ])
        XCTAssertEqual(result.prCount, 1)
        XCTAssertEqual(result.cardioWorkoutCount, 1)
    }

    func testTimedRecoveryAndCardioCountAsWorkoutsWithoutPRs() {
        let result = evaluate([
            row(1, day: "2026-09-01", weight: 0, reps: nil, type: .timed, duration: 30),
            row(2, day: "2026-09-02", weight: 0, reps: nil, type: .timed, duration: 60),
            row(3, day: "2026-09-03", code: "CARDIO", weight: 20, reps: 2),
            row(4, day: "2026-09-04", code: "CARDIO", weight: 0, reps: 3, duration: 600),
            row(5, day: "2026-09-05", code: "CARDIO", weight: 0, reps: 10),
            row(6, day: "2026-09-06", weight: 0, reps: nil, type: .timed, duration: 0)
        ])
        XCTAssertEqual(result.workoutCount, 4)
        XCTAssertEqual(result.cardioWorkoutCount, 2)
        XCTAssertEqual(result.prCount, 0)
        XCTAssertEqual(badge("cardio-1", in: result).earnedOn, "2026-09-03")
    }

    func testLatestStableSetAndRowEditsReplaceOldValuesBeforeFiltering() {
        let rows = [
            row(1, day: "2026-09-01", weight: 100),
            row(2, day: "2026-09-02", weight: 150, setID: uuid(102), updated: 10),
            row(2, day: "2026-09-02", weight: 90, setID: uuid(102), updated: 20),
            row(3, day: "2026-09-03", weight: 200, rowID: uuid(103), updated: 10),
            row(3, day: "2026-10-03", weight: 200, rowID: uuid(103), updated: 20),
            row(4, day: "2026-09-04", weight: 200, rowID: uuid(104), updated: 10),
            row(4, day: "2026-09-04", weight: 200, completed: false, rowID: uuid(104), updated: 20)
        ]
        let result = evaluate(rows)
        XCTAssertEqual(result.workoutCount, 2)
        XCTAssertEqual(result.prCount, 0)
        XCTAssertEqual(result, evaluate(Array(rows.reversed())))
    }

    func testLegacyRowsMergeOnlyIntoUnambiguousIdentifiedSessions() {
        let unambiguous = evaluate([
            row(1, title: "  Morning WORKOUT", set: 1),
            row(nil, title: "Morning workout ", set: 2)
        ])
        XCTAssertEqual(unambiguous.workoutCount, 1)
        XCTAssertEqual(unambiguous.events.first?.sessionID, "session:\(uuid(1).uuidString.lowercased())")

        let ambiguous = evaluate([
            row(1, title: "Morning workout"),
            row(2, title: "Morning workout"),
            row(nil, title: "Morning workout")
        ])
        XCTAssertEqual(ambiguous.workoutCount, 3)
        XCTAssertEqual(ClientAchievementEngine.sessionKey(sessionID: nil, entryDate: "2026-09-01", workoutTitle: "  Mórning   WORKOUT "), "legacy:2026-09-01::morning workout")
    }

    func testIdlessDuplicatesUseLatestValueAfterLegacyAliasResolution() {
        let result = evaluate([
            row(1, day: "2026-08-31", weight: 100),
            row(nil, day: "2026-09-01", title: "Training", weight: 200, updated: 10),
            row(2, day: "2026-09-01", title: "Training", weight: 90, updated: 20)
        ])
        XCTAssertEqual(result.workoutCount, 2)
        XCTAssertEqual(result.prCount, 0)
    }

    func testChronologicalOrderingUsesCompletionTimeAndStableIdentity() {
        let first = row(2, day: "2026-09-01", weight: 100, completionTime: 100)
        let second = row(1, day: "2026-09-01", weight: 110, completionTime: 200)
        let future = row(3, day: "2026-10-01", weight: 300)
        let result = evaluate([future, second, first])
        XCTAssertEqual(result.workoutCount, 2)
        XCTAssertEqual(result.prCount, 1)
        XCTAssertEqual(result.events.first(where: { $0.kind == .pr })?.sessionID, "session:\(uuid(1).uuidString.lowercased())")
        XCTAssertEqual(result, evaluate([first, future, second]))
    }

    func testISOWeeksCrossYearBoundaryAndTrackLifetimeBestWithoutDailyPressure() {
        let result = evaluate([
            row(1, day: "2025-12-28"), // Sunday, first week
            row(2, day: "2025-12-29"), // Monday, second week
            row(3, day: "2026-01-04"), // Same second week
            row(4, day: "2026-01-05"), // Third week
            row(5, day: "2026-01-19")  // Gap preserves lifetime best
        ])
        XCTAssertEqual(result.bestWeeks, 3)
        XCTAssertEqual(badge("weeks-3", in: result).earnedOn, "2026-01-05")
        XCTAssertEqual(badge("weeks-8", in: result).current, 3)
    }

    func testComebackRequiresFourteenDaysAndSameDaySessionsDoNotRepeatIt() {
        let result = evaluate([
            row(1, day: "2026-08-01"),
            row(2, day: "2026-08-14"),
            row(3, day: "2026-08-28"),
            row(4, day: "2026-08-28"),
            row(5, day: "2026-09-11")
        ])
        XCTAssertEqual(result.comebackCount, 2)
        XCTAssertEqual(badge("comeback-1", in: result).earnedOn, "2026-08-28")
        XCTAssertEqual(result.events.filter { $0.badgeID == "comeback-1" }.count, 1)
    }

    func testThresholdDatesAndXPRemainStableAndRecomputeAfterDeletion() {
        let rows = (1...6).map { row($0, day: String(format: "2026-09-%02d", $0)) }
        let result = evaluate(rows)
        XCTAssertEqual(badge("workout-5", in: result).earnedOn, "2026-09-05")
        XCTAssertEqual(badge("workout-5", in: result).current, 5)
        XCTAssertEqual(badge("workout-10", in: result).current, 6)
        XCTAssertEqual(result.xp, 800)
        XCTAssertEqual(result.level.number, 3)
        XCTAssertEqual(result.level.progress, 50.0 / 750.0, accuracy: 0.00001)
        XCTAssertEqual(result.events.map(\.id), evaluate(rows).events.map(\.id))

        let afterDeletion = evaluate(Array(rows.prefix(4)))
        XCTAssertFalse(badge("workout-5", in: afterDeletion).unlocked)
        XCTAssertEqual(afterDeletion.workoutCount, 4)
        XCTAssertEqual(afterDeletion.xp, 500)
    }

    func testAllMilestoneIDsAndMaximumLevelAreBounded() {
        let rows = (1...250).map { row($0, completionTime: Double($0)) }
        let result = evaluate(rows)
        XCTAssertEqual(result.badges.map(\.id), [
            "workout-1", "workout-5", "workout-10", "workout-25", "workout-50", "workout-100", "workout-250",
            "pr-1", "pr-5", "pr-10", "pr-25", "weeks-3", "weeks-8", "weeks-12", "comeback-1", "cardio-1",
            "mobility-1", "mobility-10", "mobility-25", "yoga-1", "yoga-10", "yoga-25", "cardio-10", "cardio-50"
        ])
        XCTAssertEqual(result.workoutCount, 250)
        XCTAssertEqual(result.xp, 25_700)
        XCTAssertEqual(result.level.number, 8)
        XCTAssertEqual(result.level.name, "FWB Legend")
        XCTAssertNil(result.level.nextXP)
        XCTAssertNil(result.level.nextName)
        XCTAssertEqual(result.level.progress, 1)
        XCTAssertTrue(result.badges.allSatisfy { (0...1).contains($0.progress) })
    }

    func testSharedWebFixtureUnlocksEveryTierWithIdenticalTotals() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let start = calendar.date(from: DateComponents(year: 2025, month: 1, day: 1))!
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        var rows = (0..<250).map { offset in
            row(offset + 1, day: formatter.string(from: calendar.date(byAdding: .day, value: offset, to: start)!),
                weight: Double(offset + 1))
        }
        for offset in 0..<50 {
            let day = formatter.string(from: calendar.date(byAdding: .day, value: offset, to: start)!)
            rows.append(row(offset + 1, day: day, set: 2, name: "Run", code: "CARDIO", weight: 20))
            if offset < 25 {
                rows.append(row(offset + 1, day: day, set: 3, name: "Hamstring stretch", code: "M1",
                    weight: 0, reps: nil, type: .timed, duration: 30))
                rows.append(row(offset + 1, day: day, set: 4, name: "Tree pose", code: "Y1",
                    weight: 0, reps: nil, type: .timed, duration: 30))
            }
        }
        rows.append(row(251, day: formatter.string(from: calendar.date(byAdding: .day, value: 263, to: start)!), weight: 251))
        let result = evaluate(rows)
        XCTAssertEqual(result.workoutCount, 251)
        XCTAssertEqual(result.prCount, 250)
        XCTAssertEqual(result.comebackCount, 1)
        XCTAssertEqual(result.cardioWorkoutCount, 50)
        XCTAssertEqual(result.mobilityWorkoutCount, 25)
        XCTAssertEqual(result.yogaWorkoutCount, 25)
        XCTAssertTrue(result.badges.allSatisfy(\.unlocked))
        XCTAssertEqual(result.xp, 40_000)
        XCTAssertEqual(badge("mobility-25", in: result).earnedOn, "2025-01-25")
        XCTAssertEqual(badge("yoga-10", in: result).earnedOn, "2025-01-10")
        XCTAssertEqual(badge("cardio-50", in: result).earnedOn, "2025-02-19")
        XCTAssertEqual(result.level.number, 8)
    }

    func testLegacyMobilitySecondsAndGeneratedRecoveryTitlesDoNotCreateStrengthPRs() {
        let result = evaluate([
            row(1, day: "2026-09-01", title: "Mobility", name: "Custom movement", weight: 30, reps: nil),
            row(2, day: "2026-09-02", title: "Mobility", name: "Custom movement", weight: 60, reps: nil),
            row(3, day: "2026-09-03", title: "Custom workout · Upper body recovery · uuid", name: "Gentle movement", weight: 0),
            row(4, day: "2026-09-04", title: "Custom workout · Lower body recovery · uuid", name: "Gentle movement", weight: 0),
            row(5, day: "2026-09-05", title: "Custom workout · Full body recovery · uuid", name: "Gentle movement", weight: 0)
        ])
        XCTAssertEqual(result.workoutCount, 5)
        XCTAssertEqual(result.mobilityWorkoutCount, 5)
        XCTAssertEqual(result.cardioWorkoutCount, 0)
        XCTAssertEqual(result.prCount, 0)
        XCTAssertEqual(badge("mobility-1", in: result).earnedOn, "2026-09-01")
        XCTAssertEqual(badge("mobility-10", in: result).category, "recovery")
    }

    func testAllSeededRecoveryNamesQualifyWithoutTitleInference() {
        let names = ["Cat-Cow", "Side-Lying Open Book", "Shoulder Circles", "Cross-Body Shoulder Stretch",
            "Supine Chest Stretch", "Overhead Triceps Stretch", "Supine Figure-Four Stretch", "Supine Hamstring Stretch",
            "Half-Kneeling Hip Flexor Stretch", "Side-Lying Quad Stretch", "Seated Butterfly Stretch", "Supine Ankle Circles"]
        let result = evaluate(names.enumerated().map { offset, name in
            row(offset + 1, day: String(format: "2026-09-%02d", offset + 1), name: name, weight: 0)
        })
        XCTAssertEqual(result.mobilityWorkoutCount, 12)
        XCTAssertEqual(result.yogaWorkoutCount, 0)
        XCTAssertEqual(result.prCount, 0)
        XCTAssertEqual(badge("mobility-10", in: result).earnedOn, "2026-09-10")
    }

    func testYogaStylesAndPosesCountSessionsRatherThanExercises() {
        let names = ["Vinyasa flow", "Hatha yoga", "Yin yoga", "Downward-facing dog", "Child’s pose", "Warrior II", "Tree pose"]
        var rows = names.enumerated().map { offset, name in
            row(offset + 1, day: String(format: "2026-09-%02d", offset + 1), name: name,
                weight: 0, reps: nil, type: .timed, duration: 30)
        }
        rows.append(row(1, set: 2, name: "Pigeon pose", weight: 0, reps: nil, type: .timed, duration: 30))
        let result = evaluate(rows)
        XCTAssertEqual(result.yogaWorkoutCount, 7)
        XCTAssertEqual(result.mobilityWorkoutCount, 0)
        XCTAssertEqual(result.prCount, 0)
        XCTAssertEqual(badge("yoga-1", in: result).title, "First Flow")
    }

    func testGenericTimedStrengthAndIncidentalWordsDoNotGrantModalityBadges() {
        let names = ["Plank", "Walking lunge", "Dumbbell row", "Yoga mat push-up", "Warrior row", "Stretch goal press"]
        let result = evaluate(names.enumerated().map { offset, name in
            row(offset + 1, title: "Stretch goal — yoga mat strength", name: name,
                weight: 0, reps: nil, type: .timed, duration: 30)
        })
        XCTAssertEqual(result.workoutCount, 6)
        XCTAssertEqual(result.mobilityWorkoutCount, 0)
        XCTAssertEqual(result.yogaWorkoutCount, 0)
        XCTAssertEqual(result.cardioWorkoutCount, 0)
    }

    func testRecoveryDurationWrappersDoNotMislabelYogaOrMobilityAsCardio() {
        let result = evaluate([
            row(1, title: "Mobility", name: "Stretching", code: "CARDIO", weight: 10, reps: nil),
            row(2, name: "Hatha yoga", code: "CARDIO", weight: 20, reps: nil),
            row(3, name: "Running", weight: 0, reps: nil, type: .timed, duration: 600),
            row(4, name: "Running", weight: 0, reps: 10)
        ])
        XCTAssertEqual(result.mobilityWorkoutCount, 1)
        XCTAssertEqual(result.yogaWorkoutCount, 1)
        XCTAssertEqual(result.cardioWorkoutCount, 1)
        XCTAssertEqual(badge("cardio-1", in: result).category, "cardio")
    }

    func testMixedCompletedWorkCountsEachModalityOnceAndIgnoresDraftsAndWarmups() {
        let rows = [
            row(1, set: 1, name: "Hip stretch", weight: 0, reps: 6),
            row(1, set: 2, name: "Tree pose", weight: 0, reps: nil, duration: 30),
            row(1, set: 3, name: "Run", code: "CARDIO", weight: 20, reps: nil),
            row(2, name: "Hip stretch", type: .warmUp),
            row(3, name: "Yoga", completed: false)
        ]
        let result = evaluate(rows + rows)
        XCTAssertEqual(result.workoutCount, 1)
        XCTAssertEqual(result.mobilityWorkoutCount, 1)
        XCTAssertEqual(result.yogaWorkoutCount, 1)
        XCTAssertEqual(result.cardioWorkoutCount, 1)
        XCTAssertEqual(result.prCount, 0)
        XCTAssertEqual(result.badges.filter(\.unlocked).count, 4)
    }

    private func evaluate(_ records: [WorkoutHistoryRecord], today: String = "2026-09-25") -> AchievementSnapshot {
        ClientAchievementEngine.evaluate(records: records, today: today)
    }

    private func badge(_ id: String, in snapshot: AchievementSnapshot) -> ClientAchievementBadge {
        snapshot.badges.first { $0.id == id }!
    }

    private func uuid(_ value: Int) -> UUID {
        UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", value))!
    }

    private func row(
        _ session: Int?, day: String = "2026-09-01", title: String = "Training",
        set: Int = 1, name: String = "Bench Press", code: String = "A1",
        weight: Double = 100, reps: Double? = 8, type: WorkoutSetType? = .working,
        duration: Double? = nil, completed: Bool = true, completionTime: Double = 1_000,
        rowID: UUID? = nil, setID: UUID? = nil, updated: Double? = nil
    ) -> WorkoutHistoryRecord {
        WorkoutHistoryRecord(
            rowID: rowID, sessionID: session.map(uuid), setID: setID, entryDate: day,
            workoutTitle: title, exerciseCode: code, exerciseName: name, setNumber: set,
            weightUsed: weight, reps: reps, notes: nil,
            updatedAt: updated.map { Date(timeIntervalSince1970: $0) },
            completedAt: completed ? Date(timeIntervalSince1970: completionTime) : nil,
            setType: type, durationSeconds: duration)
    }
}
