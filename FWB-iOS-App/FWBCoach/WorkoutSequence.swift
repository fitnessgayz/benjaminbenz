import Foundation

enum CustomWorkoutFormat: String, CaseIterable, Equatable, Identifiable {
    case single
    case superset
    case circuit

    var id: String { rawValue }

    var title: String {
        switch self {
        case .single: "Straight Sets"
        case .superset: "Superset"
        case .circuit: "Circuit"
        }
    }

    var guide: String {
        switch self {
        case .single: "Finish all sets of one exercise before moving to the next."
        case .superset: "Alternate exercises in pairs, then repeat each pair for your remaining sets."
        case .circuit: "Complete one set of every exercise in order, then begin the next round."
        }
    }

    var systemImage: String {
        switch self {
        case .single: "list.number"
        case .superset: "link"
        case .circuit: "repeat"
        }
    }
}

enum WorkoutGroupKind: String, Codable, CaseIterable, Equatable, Hashable {
    case superset
    case circuit

    var title: String {
        switch self {
        case .superset: "Superset"
        case .circuit: "Circuit"
        }
    }
}

struct WorkoutGroupAssignment: Codable, Equatable, Hashable {
    let id: String
    let kind: WorkoutGroupKind
    let label: String
}

struct WorkoutSequenceSection: Identifiable, Equatable {
    let id: String
    let assignment: WorkoutGroupAssignment?
    let exercises: [Exercise]

    var isGroup: Bool { assignment != nil && exercises.count > 1 }

    var label: String {
        assignment?.label ?? exercises.first?.name ?? "Exercise"
    }
}

struct GuidedWorkoutStep: Equatable {
    let sectionID: String
    let groupLabel: String
    let round: Int
    let roundCount: Int
    let exerciseID: String
    let exerciseName: String
    let position: Int
    let exerciseCount: Int
}

enum WorkoutSequencePlanner {
    static let editableGroupIDs = ["A", "B", "C", "D", "E", "F"]

    static func customAssignments(
        for format: CustomWorkoutFormat,
        exercises: [Exercise]
    ) -> [String: WorkoutGroupAssignment] {
        switch format {
        case .single:
            return [:]
        case .superset:
            var assignments: [String: WorkoutGroupAssignment] = [:]
            for startIndex in stride(from: 0, to: exercises.count, by: 2) {
                let groupNumber = (startIndex / 2) + 1
                let assignment = WorkoutGroupAssignment(
                    id: "CUSTOM_SUPERSET_\(groupNumber)",
                    kind: .superset,
                    label: "Superset \(groupNumber)"
                )
                for exercise in exercises[startIndex..<min(startIndex + 2, exercises.count)] {
                    assignments[exercise.id] = assignment
                }
            }
            return assignments
        case .circuit:
            guard !exercises.isEmpty else { return [:] }
            let assignment = WorkoutGroupAssignment(
                id: "CUSTOM_CIRCUIT_1",
                kind: .circuit,
                label: "Circuit 1"
            )
            return Dictionary(uniqueKeysWithValues: exercises.map { ($0.id, assignment) })
        }
    }

    static func customFormat(
        from assignments: [String: WorkoutGroupAssignment]
    ) -> CustomWorkoutFormat? {
        let kinds = Set(assignments.values.map(\.kind))
        guard kinds.count == 1, let kind = kinds.first else { return nil }
        return kind == .circuit ? .circuit : .superset
    }

    static func nextCustomCircuitAssignment(
        assignments: [String: WorkoutGroupAssignment]
    ) -> WorkoutGroupAssignment {
        let circuitNumbers = assignments.values
            .filter { $0.kind == .circuit }
            .compactMap { assignment in
                Int(assignment.id.split(separator: "_").last ?? "")
            }
        let number = (circuitNumbers.max() ?? 0) + 1
        return WorkoutGroupAssignment(
            id: "CUSTOM_CIRCUIT_\(number)",
            kind: .circuit,
            label: "Circuit \(number)"
        )
    }

    static func inferredAssignments(for workout: Workout) -> [String: WorkoutGroupAssignment] {
        let format = workout.format.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        if format == WorkoutGroupKind.circuit.rawValue, workout.exercises.count > 1 {
            let assignment = WorkoutGroupAssignment(id: "CIRCUIT", kind: .circuit, label: "Circuit")
            return Dictionary(uniqueKeysWithValues: workout.exercises.map { ($0.id, assignment) })
        }

        guard format == WorkoutGroupKind.superset.rawValue || format.isEmpty else { return [:] }

        let grouped = Dictionary(grouping: workout.exercises) { groupKey(for: $0.code) }
        var assignments: [String: WorkoutGroupAssignment] = [:]
        for exercise in workout.exercises {
            guard let key = groupKey(for: exercise.code),
                  let members = grouped[key], members.count > 1 else { continue }
            assignments[exercise.id] = WorkoutGroupAssignment(
                id: key,
                kind: .superset,
                label: "Superset \(key)"
            )
        }
        return assignments
    }

    static func sections(
        exercises: [Exercise],
        assignments: [String: WorkoutGroupAssignment]
    ) -> [WorkoutSequenceSection] {
        var result: [WorkoutSequenceSection] = []
        var emittedGroupIDs: Set<String> = []

        for exercise in exercises {
            guard let assignment = assignments[exercise.id] else {
                result.append(
                    WorkoutSequenceSection(
                        id: "exercise:\(exercise.id)",
                        assignment: nil,
                        exercises: [exercise]
                    )
                )
                continue
            }

            guard !emittedGroupIDs.contains(assignment.id) else { continue }
            emittedGroupIDs.insert(assignment.id)
            let members = exercises.filter { assignments[$0.id]?.id == assignment.id }
            result.append(
                WorkoutSequenceSection(
                    id: "group:\(assignment.id)",
                    assignment: members.count > 1 ? assignment : nil,
                    exercises: members
                )
            )
        }

        return result
    }

    static func normalizedAssignments(
        exercises: [Exercise],
        assignments: [String: WorkoutGroupAssignment]
    ) -> [String: WorkoutGroupAssignment] {
        let validIDs = Set(exercises.map(\.id))
        let validAssignments = assignments.filter { validIDs.contains($0.key) }
        let counts = Dictionary(grouping: validAssignments.values, by: \.id).mapValues(\.count)
        return validAssignments.filter { counts[$0.value.id, default: 0] > 1 }
    }

    static func guidedStep(
        sections: [WorkoutSequenceSection],
        drafts: [WorkoutSetDraft]
    ) -> GuidedWorkoutStep? {
        for section in sections {
            if !section.isGroup {
                let hasPendingExercise = section.exercises.contains { exercise in
                    drafts.contains { matches($0, exercise) && !$0.isCompleted }
                }
                if hasPendingExercise { return nil }
                continue
            }

            let roundCount = section.exercises.reduce(0) { result, exercise in
                max(result, drafts.filter { matches($0, exercise) }.map(\.setNumber).max() ?? 0)
            }

            for round in 1...max(roundCount, 1) {
                for (position, exercise) in section.exercises.enumerated() {
                    guard let draft = drafts.first(where: {
                        matches($0, exercise) && $0.setNumber == round
                    }) else { continue }
                    if !draft.isCompleted {
                        return GuidedWorkoutStep(
                            sectionID: section.id,
                            groupLabel: section.label,
                            round: round,
                            roundCount: roundCount,
                            exerciseID: exercise.id,
                            exerciseName: exercise.name,
                            position: position + 1,
                            exerciseCount: section.exercises.count
                        )
                    }
                }
            }
        }
        return nil
    }

    static func assignment(
        for exercise: Exercise,
        assignments: [String: WorkoutGroupAssignment]
    ) -> WorkoutGroupAssignment? {
        assignments[exercise.id]
    }

    static func groupKey(for code: String) -> String? {
        let normalized = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let letters = String(normalized.prefix(while: \.isLetter))
        let remainder = normalized.dropFirst(letters.count)
        guard !letters.isEmpty,
              !["CW", "ADD"].contains(letters),
              !remainder.isEmpty,
              remainder.allSatisfy(\.isNumber) else { return nil }
        return letters
    }

    static func matches(_ draft: WorkoutSetDraft, _ exercise: Exercise) -> Bool {
        draft.exerciseCode == exercise.code && draft.exerciseName == exercise.name
    }
}
