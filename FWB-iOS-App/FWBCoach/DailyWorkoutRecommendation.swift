import Foundation

/// A recommendation is a session copy. Neither choosing it nor logging it changes the assigned plan.
struct DailyWorkoutRecommendation: Equatable {
    enum Level: String, Equatable {
        case planned, lighter, recovery
    }

    let workout: Workout?
    let originalWorkout: Workout?
    let level: Level
    let headline: String
    let reasons: [String]
    let changes: [String]
    let generatorPreferences: WorkoutGenerationPreferences
}

enum DailyWorkoutRecommendationEngine {
    static func recommend(
        program: ClientProgram?,
        history: [WorkoutHistorySession],
        checkIn: ReadinessCheckIn
    ) -> DailyWorkoutRecommendation {
        let level = recommendationLevel(checkIn)
        let preferences = WorkoutGenerationPreferences(
            focus: level == .recovery ? .recoveryFull : .fullBody,
            minutes: level == .planned ? 30 : 20,
            intensity: level == .planned ? .moderate : .easy
        )
        let reasons = reasons(for: checkIn, level: level)
        guard let program,
              normalizedEmail(program.clientEmail) == normalizedEmail(checkIn.clientEmail),
              !normalizedEmail(checkIn.clientEmail).isEmpty,
              program.workouts.contains(where: { !$0.exercises.isEmpty }) else {
            return DailyWorkoutRecommendation(
                workout: nil, originalWorkout: nil, level: level,
                headline: level == .recovery ? "Make room for recovery" : "Build a session for today",
                reasons: reasons,
                changes: [level == .recovery
                    ? "Choose rest or gentle movement today. If you want a session, the generator starts with easy full-body recovery."
                    : "Choose your focus and available equipment to generate a workout from the approved exercise library."],
                generatorPreferences: preferences
            )
        }

        let original = nextWorkout(program: program, history: history, checkIn: checkIn)
        let selected: Workout?
        if level == .recovery {
            // Only an explicitly assigned recovery/mobility routine is presented as recovery.
            // A strenuous strength routine does not become recovery simply by renaming it.
            selected = isRecoveryWorkout(original) ? original : program.workouts.first(where: isRecoveryWorkout)
        } else {
            selected = original
        }
        guard let selected else {
            return DailyWorkoutRecommendation(
                workout: nil, originalWorkout: original, level: level,
                headline: "Make room for recovery", reasons: reasons,
                changes: ["Your program has no assigned recovery routine. Choose rest or gentle movement, or generate an easy recovery session if you feel up to it."],
                generatorPreferences: preferences
            )
        }

        var changes: [String] = []
        let exercises = selected.exercises.map { exercise -> Exercise in
            guard level != .planned, !isPreparationExercise(exercise),
                  let adjusted = reducedPrescription(exercise.prescription, level: level) else { return exercise }
            changes.append("\(exercise.name): \(exercise.prescription) → \(adjusted)")
            return Exercise(
                code: exercise.code, name: exercise.name, prescription: adjusted,
                rest: exercise.rest, instructions: exercise.instructions, video: exercise.video,
                progression: WorkoutProgressionIntegration.recoveryConfig(for: exercise),
                hasInvalidProgression: exercise.hasInvalidProgression
            )
        }
        if selected.id != original.id {
            changes.insert("Use your assigned \(selected.title) routine for today's recovery option.", at: 0)
        }
        if level == .planned {
            changes.append("Follow the planned exercises, sets, and reps. No extra load or volume is added.")
        } else if changes.isEmpty {
            changes.append("Keep the prescribed movements and use a comfortable effort. No load targets are added.")
        }
        let identifier = dailyID(
            clientEmail: checkIn.clientEmail, localDate: checkIn.localDate,
            programID: program.id, workoutID: selected.id
        )
        let adjustedWorkout = Workout(
            id: identifier,
            title: dailyTitle(source: selected, id: identifier),
            focus: selected.focus, format: selected.format, exercises: exercises
        )
        return DailyWorkoutRecommendation(
            workout: level == .planned ? original : adjustedWorkout, originalWorkout: original, level: level,
            headline: level == .planned ? "Your planned workout" : level == .lighter ? "A shorter session today" : "Your recovery session",
            reasons: reasons, changes: changes, generatorPreferences: preferences
        )
    }

    static func dailyID(clientEmail: String, localDate: String, programID: UUID, workoutID: UUID) -> UUID {
        ContinuitySync.stableUUID(
            namespace: "fwb-daily-check-in-workout-v1",
            name: [normalizedEmail(clientEmail), localDate, programID.uuidString.lowercased(), workoutID.uuidString.lowercased()].joined(separator: "|")
        )
    }

    private static func recommendationLevel(_ checkIn: ReadinessCheckIn) -> DailyWorkoutRecommendation.Level {
        // Clamp again because Codable and mutable fields can bypass initializer validation.
        let energy = rating(checkIn.energy)
        let sleep = rating(checkIn.sleepRecovery)
        let soreness = rating(checkIn.soreness)
        let score = Int((Double(energy + sleep + 6 - soreness) / 15 * 100).rounded())
        if energy == 1 || sleep == 1 || soreness == 5 || score < 60 { return .recovery }
        // Mood can suggest a shorter session, but never diagnoses physical recovery.
        if energy <= 2 || sleep <= 2 || soreness >= 4 || score < 80 || checkIn.mood.map({ rating($0) <= 2 }) == true {
            return .lighter
        }
        return .planned
    }

    private static func reasons(for checkIn: ReadinessCheckIn, level: DailyWorkoutRecommendation.Level) -> [String] {
        var values: [String] = []
        if rating(checkIn.energy) <= 2 { values.append("You reported low energy today.") }
        if rating(checkIn.sleepRecovery) <= 2 { values.append("You reported less restorative sleep.") }
        if rating(checkIn.soreness) >= 4 { values.append("You reported more soreness today.") }
        if checkIn.mood.map({ rating($0) <= 2 }) == true { values.append("You reported a lower mood, so a shorter session may feel more manageable.") }
        if values.isEmpty {
            values.append(level == .planned
                ? "Your energy and recovery support following your plan today."
                : "Your check-in suggests keeping today's effort comfortable.")
        }
        return values
    }

    private static func nextWorkout(program: ClientProgram, history: [WorkoutHistorySession], checkIn: ReadinessCheckIn) -> Workout {
        let workouts = program.workouts.filter { !$0.exercises.isEmpty }
        let completed = history.filter { session in
            session.entryDate <= checkIn.localDate && isCompleted(session)
        }.sorted { left, right in
            if left.entryDate != right.entryDate { return left.entryDate > right.entryDate }
            let leftCompletion = left.records.compactMap(\.completedAt).max() ?? .distantPast
            let rightCompletion = right.records.compactMap(\.completedAt).max() ?? .distantPast
            if leftCompletion != rightCompletion { return leftCompletion > rightCompletion }
            return left.id < right.id
        }
        for session in completed {
            guard let index = workouts.firstIndex(where: { source in
                if normalizedTitle(source.title) == normalizedTitle(session.workoutTitle) { return true }
                let id = dailyID(clientEmail: checkIn.clientEmail, localDate: session.entryDate, programID: program.id, workoutID: source.id)
                return session.workoutTitle.hasPrefix("Custom workout · Today: ") &&
                    session.workoutTitle.hasSuffix(" · \(id.uuidString.lowercased())")
            }) else { continue }
            // Reopening/updating today's check-in should not assign a second workout.
            if session.entryDate == checkIn.localDate { return workouts[index] }
            return workouts[(index + 1) % workouts.count]
        }
        return workouts[0]
    }

    private static func isCompleted(_ session: WorkoutHistorySession) -> Bool {
        // Modern logs have a completion marker. Older logs predate session completion tracking.
        session.records.contains { $0.completedAt != nil } ||
            session.records.contains { !$0.hasSessionIdentity && !$0.isWarmUp && (($0.reps ?? 0) > 0 || ($0.durationSeconds ?? 0) > 0 || $0.isCardio) }
    }

    private static func dailyTitle(source: Workout, id: UUID) -> String {
        "Custom workout · Today: \(source.title) · \(id.uuidString.lowercased())"
    }

    private static func isRecoveryWorkout(_ workout: Workout) -> Bool {
        guard !workout.exercises.isEmpty else { return false }
        let format = workout.format.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if ["mobility", "recovery", "stretching"].contains(format) { return true }
        // Restrict title inference to explicit recovery labels; incidental references such as
        // "Strength + mobility" do not make a strength session a recovery session.
        let title = normalizedTitle(workout.title)
        return ["mobility", "recovery", "active recovery", "recovery day", "mobility day", "stretching", "easy mobility"].contains(title)
    }

    private static func isPreparationExercise(_ exercise: Exercise) -> Bool {
        let code = exercise.code.uppercased().filter(\.isLetter)
        if ["WARMUP", "COOLDOWN"].contains(code) { return true }
        let name = normalizedTitle(exercise.name).replacingOccurrences(of: "-", with: " ")
        return name.contains("warm up") || name.contains("warmup") || name.contains("cool down") || name.contains("cooldown")
    }

    /// Replace only an unambiguous set/round count. Keep reps, durations, loads and cues byte-for-byte.
    private static func reducedPrescription(_ prescription: String, level: DailyWorkoutRecommendation.Level) -> String? {
        let patterns = [#"(?i)\b([1-9]|1[0-2])\s*(?:sets?|rounds?)\b"#, #"^\s*([1-9]|1[0-2])\s*[x×]\s*\d"#]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: prescription, range: NSRange(prescription.startIndex..., in: prescription)),
                  let range = Range(match.range(at: 1), in: prescription),
                  let count = Int(prescription[range]), count > 1 else { continue }
            if range.lowerBound > prescription.startIndex {
                let prefix = prescription[..<range.lowerBound].trimmingCharacters(in: .whitespaces)
                if let last = prefix.last, last.isNumber || "-–—/".contains(last) { continue }
            }
            let target = level == .recovery ? max(1, count / 2) : max(1, count - 1)
            var value = prescription
            value.replaceSubrange(range, with: String(target))
            return value
        }
        return nil
    }

    private static func rating(_ value: Int) -> Int { min(5, max(1, value)) }
    private static func normalizedEmail(_ value: String) -> String { value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
    private static func normalizedTitle(_ value: String) -> String { value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
}
