import Foundation
import Supabase

/// Planned targets belong to the session, not to the number of sets left after editing.
enum WorkoutProgressionIntegration {
    static func recommendedRepRange(for exercise: Exercise, drafts: [WorkoutSetDraft]) -> ClosedRange<Int>? {
        guard let config = config(for: exercise, drafts: drafts), config.enabled else { return nil }
        return config.repMin...config.repMax
    }

    /// Keep prescribed reps as guidance rather than treating them as logged data.
    static func recommendedRepsPlaceholder(for exercise: Exercise, drafts: [WorkoutSetDraft]) -> String? {
        guard let range = recommendedRepRange(for: exercise, drafts: drafts) else { return nil }
        return range.lowerBound == range.upperBound
            ? String(range.lowerBound)
            : "\(range.lowerBound)–\(range.upperBound)"
    }

    static func config(for exercise: Exercise, drafts: [WorkoutSetDraft]) -> WorkoutProgressionConfig? {
        let rows = drafts.filter { $0.exerciseCode == exercise.code && $0.exerciseName == exercise.name && $0.setType == .working }
        if let frozen = rows.compactMap(\.progressionTarget).first { return frozen }
        guard !rows.contains(where: \.isCompleted) else { return nil }
        return WorkoutProgression.defaultConfig(for: exercise, plannedSets: rows.count)
    }

    static func freeze(exercises: [Exercise], drafts: [WorkoutSetDraft]) -> [WorkoutSetDraft] {
        var result = drafts
        for exercise in exercises {
            guard let config = config(for: exercise, drafts: drafts), config.unit == "lb" else { continue }
            for index in result.indices where result[index].exerciseCode == exercise.code
                && result[index].exerciseName == exercise.name && result[index].setType == .working
                && result[index].progressionTarget == nil {
                result[index].progressionTarget = config
            }
        }
        return result
    }

    /// Fill each empty field independently. Logged sets and nonstandard sets are never touched.
    static func applying(_ targets: [WorkoutProgressionTarget], to exercise: Exercise,
                         drafts: [WorkoutSetDraft]) -> [WorkoutSetDraft] {
        var result = drafts
        for index in result.indices where result[index].exerciseCode == exercise.code
            && result[index].exerciseName == exercise.name && result[index].setType == .working
            && !result[index].isCompleted {
            guard let target = targets.first(where: { $0.setNumber == result[index].setNumber }) else { continue }
            if result[index].weight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                result[index].weight = number(target.weight)
            }
            if result[index].reps.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                result[index].reps = String(target.reps)
            }
        }
        return result
    }

    /// Retain coach effort/increment preferences while keeping edited prescriptions truthful.
    static func revisedConfig(from exercise: Exercise, name: String, prescription: String) -> WorkoutProgressionConfig? {
        guard WorkoutProgression.exerciseKey(exercise.name) == WorkoutProgression.exerciseKey(name),
              var config = exercise.progression else { return nil }
        guard exercise.prescription != prescription else { return config }
        if let parsed = WorkoutProgression.defaultConfig(name: name, prescription: prescription, plannedSets: nil) {
            config.repMin = parsed.repMin
            config.repMax = parsed.repMax
            config.plannedSets = parsed.plannedSets
        } else {
            config.enabled = false
        }
        return config
    }

    static func recoveryConfig(for exercise: Exercise) -> WorkoutProgressionConfig? {
        guard var config = WorkoutProgression.defaultConfig(for: exercise, plannedSets: nil) else { return nil }
        config.enabled = false
        return config
    }

    static func json(_ config: WorkoutProgressionConfig?) -> WorkoutLayoutJSON {
        guard let config, let data = try? JSONEncoder().encode(config),
              let value = try? JSONDecoder().decode(WorkoutLayoutJSON.self, from: data) else { return .null }
        return value
    }

    static func token(_ config: WorkoutProgressionConfig?) -> String {
        guard let config else { return "" }
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return (try? encoder.encode(config)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
    }

    static func isMissingTargetColumn(_ error: Error) -> Bool {
        guard let databaseError = error as? PostgrestError,
              let code = databaseError.code, ["42703", "PGRST204"].contains(code) else { return false }
        return databaseError.message.lowercased().contains("progression_target")
    }

    static func number(_ value: Double) -> String {
        value.rounded() == value ? String(format: "%.0f", value) : String(value)
    }
}
