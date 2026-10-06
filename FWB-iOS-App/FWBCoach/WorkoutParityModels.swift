import Foundation

/// Reference data changes when the exercise catalog or history changes, not when
/// a workout metric is typed. Keep this value outside the logger's render path.
struct WorkoutEntryReferenceData {
    let suggestionNames: [String]
    private let workingRecords: [ExerciseKey: WorkoutHistoryRecord]
    private let timedRecords: [ExerciseKey: WorkoutHistoryRecord]
    private let previousRecords: [ExerciseKey: [Int: WorkoutHistoryRecord]]

    static let empty = WorkoutEntryReferenceData(
        suggestionNames: [], workingRecords: [:], timedRecords: [:], previousRecords: [:]
    )

    static func make(
        exercises: [Exercise],
        suggestedExercises: [Exercise],
        approvedExercises: [ApprovedExercise],
        historyNames: [String],
        history: [WorkoutHistorySession],
        before entryDate: String = "9999-12-31",
        excluding sessionID: UUID? = nil
    ) -> Self {
        // Match canonicalName's precedence: the first approved name or alias,
        // then the first bundled name. Normalize each catalog entry only once.
        var canonicalNames: [String: String] = [:]
        for exercise in approvedExercises {
            for name in [exercise.name] + exercise.aliases {
                let key = ExerciseNameIdentity.key(for: name)
                if !key.isEmpty && canonicalNames[key] == nil {
                    canonicalNames[key] = exercise.name.fwbTitleCased
                }
            }
        }
        for name in ExerciseLibrary.names {
            let key = ExerciseNameIdentity.key(for: name)
            if !key.isEmpty && canonicalNames[key] == nil {
                canonicalNames[key] = name.fwbTitleCased
            }
        }
        let rawNames = [
            ExerciseSuggestionLibrary.merged([approvedExercises.map(\.name)]),
            ExerciseLibrary.names,
            suggestedExercises.map(\.name),
            exercises.map(\.name),
            historyNames
        ].flatMap { $0 }.map { name -> String in
            let key = ExerciseNameIdentity.key(for: name)
            guard !key.isEmpty else { return "Exercise" }
            return canonicalNames[key] ?? name.trimmingCharacters(in: .whitespacesAndNewlines).fwbTitleCased
        }

        let records = history.flatMap(\.records)
        var workingRecords: [ExerciseKey: WorkoutHistoryRecord] = [:]
        var timedRecords: [ExerciseKey: WorkoutHistoryRecord] = [:]
        var previousRecords: [ExerciseKey: [Int: WorkoutHistoryRecord]] = [:]
        for exercise in exercises {
            let key = ExerciseKey(exercise)
            workingRecords[key] = WorkoutParityModel.personalRecord(for: exercise, history: records, setType: .working)
            timedRecords[key] = WorkoutParityModel.personalRecord(for: exercise, history: records, setType: .timed)
            let recent = WorkoutParityModel.recentHistory(for: exercise, sessions: history,
                through: entryDate, excluding: sessionID, limit: 24)
            if let latestSessionID = recent.first?.sessionID {
                previousRecords[key] = Dictionary(recent.filter { $0.sessionID == latestSessionID }
                    .map { ($0.setNumber, $0) }, uniquingKeysWith: { first, _ in first })
            } else if let latestDate = recent.first?.entryDate {
                previousRecords[key] = Dictionary(recent.filter { $0.entryDate == latestDate }
                    .map { ($0.setNumber, $0) }, uniquingKeysWith: { first, _ in first })
            }
        }
        return Self(
            suggestionNames: ExerciseSuggestionLibrary.merged([rawNames]),
            workingRecords: workingRecords,
            timedRecords: timedRecords,
            previousRecords: previousRecords
        )
    }

    func personalRecord(for exercise: Exercise, setType: WorkoutSetType) -> WorkoutHistoryRecord? {
        let key = ExerciseKey(exercise)
        return setType == .timed ? timedRecords[key] : workingRecords[key]
    }

    func previousRecord(for exercise: Exercise, setNumber: Int) -> WorkoutHistoryRecord? {
        previousRecords[ExerciseKey(exercise)]?[setNumber]
    }

    func previousRecords(for exercise: Exercise) -> [Int: WorkoutHistoryRecord] {
        previousRecords[ExerciseKey(exercise)] ?? [:]
    }

    // An exercise can be renamed while retaining its code. Include both so an
    // old snapshot cannot briefly show that code's previous exercise record.
    private struct ExerciseKey: Hashable {
        let code: String
        let name: String

        init(_ exercise: Exercise) {
            code = exercise.code
            name = exercise.name
        }
    }
}

/// The same projection is used by assigned and custom workout screens. Exercise
/// prescriptions and persisted set numbers remain untouched by presentation.
struct WorkoutParityGroup: Identifiable, Equatable {
    let id: String
    let number: Int
    let format: CustomWorkoutFormat
    let exercises: [Exercise]
    let title: String
}

enum WorkoutParityMetric: String, Equatable {
    case weight, reps, duration
}

struct WorkoutParityCopyChange: Equatable {
    let draftID: UUID
    let field: WorkoutParityMetric
    let previousValue: String
    let copiedValue: String
}

struct WorkoutParityCopyResult: Equatable {
    let drafts: [WorkoutSetDraft]
    let changes: [WorkoutParityCopyChange]

    var copiedDraftIDs: Set<UUID> { Set(changes.map(\.draftID)) }
}

enum WorkoutParityModel {
    static func numberStringForDisplay(_ value: Double) -> String { numberString(value) }

    static func historySummary(_ record: WorkoutHistoryRecord) -> String {
        if record.resolvedSetType == .timed, let duration = record.durationSeconds {
            return "\(numberString(duration)) sec · \(record.entryDate)"
        }
        return "\(numberString(record.weightUsed)) lb × \(numberString(record.reps ?? 0)) reps · \(record.entryDate)"
    }

    static func recentHistory(
        for exercise: Exercise,
        sessions: [WorkoutHistorySession],
        through entryDate: String,
        excluding sessionID: UUID?,
        limit: Int = 12
    ) -> [WorkoutHistoryRecord] {
        guard limit > 0 else { return [] }
        let eligible = sessions.filter { $0.entryDate <= entryDate && $0.sessionID != sessionID }
            .map { session in
                (session: session, updatedAt: session.records.compactMap(\.updatedAt).max() ?? .distantPast)
            }
            .sorted { left, right in
                if left.session.entryDate != right.session.entryDate {
                    return left.session.entryDate > right.session.entryDate
                }
                if left.updatedAt != right.updatedAt { return left.updatedAt > right.updatedAt }
                return left.session.workoutTitle.localizedCaseInsensitiveCompare(right.session.workoutTitle) == .orderedAscending
            }
        var result: [WorkoutHistoryRecord] = []
        for (session, _) in eligible {
            for record in session.records.sorted(by: { $0.setNumber < $1.setNumber }) {
                guard matches(record, exercise), !record.isWarmUp, !record.isCardio else { continue }
                if record.resolvedSetType == .timed {
                    guard let seconds = record.durationSeconds, seconds.isFinite, seconds > 0 else { continue }
                } else {
                    guard record.countsTowardWorkingMetrics, record.weightUsed.isFinite,
                          record.weightUsed >= 0, let reps = record.reps, reps.isFinite, reps > 0 else { continue }
                }
                result.append(record)
                if result.count == limit { return result }
            }
        }
        return result
    }

    static func groups(
        exercises: [Exercise],
        assignments: [String: WorkoutGroupAssignment]
    ) -> [WorkoutParityGroup] {
        var result: [WorkoutParityGroup] = []
        var emitted: Set<String> = []

        for exercise in exercises {
            let assignment = assignments[exercise.id]
            let members = assignment.map { assignment in
                exercises.filter {
                    assignments[$0.id]?.id == assignment.id &&
                        assignments[$0.id]?.kind == assignment.kind
                }
            } ?? [exercise]
            let grouped = assignment != nil && members.count > 1
            let id = grouped
                ? "group:\(assignment!.kind.rawValue):\(assignment!.id)"
                : "exercise:\(exercise.id)"
            guard emitted.insert(id).inserted else { continue }

            let format: CustomWorkoutFormat = grouped
                ? (assignment!.kind == .superset ? .superset : .circuit)
                : .single
            let number = result.count + 1
            let prefix = format == .single ? "Straight sets" : format.title
            result.append(WorkoutParityGroup(
                id: id, number: number, format: format,
                exercises: grouped ? members : [exercise],
                title: "\(prefix) \(number)"
            ))
        }
        return result
    }

    /// Round zero contains optional warm-ups. Working rounds are ordinal, not
    /// storage set numbers; this supports gaps and unequal assigned set counts.
    static func roundDrafts(
        group: WorkoutParityGroup,
        round: Int,
        drafts: [WorkoutSetDraft]
    ) -> [WorkoutSetDraft] {
        guard round >= 0 else { return [] }
        return group.exercises.flatMap { exercise -> [WorkoutSetDraft] in
            let rows = drafts.filter {
                WorkoutSequencePlanner.matches($0, exercise) && $0.isWarmUp == (round == 0)
            }.sorted { $0.setNumber < $1.setNumber }
            if round == 0 { return rows }
            guard rows.indices.contains(round - 1) else { return [] }
            return [rows[round - 1]]
        }
    }

    static func roundCount(group: WorkoutParityGroup, drafts: [WorkoutSetDraft]) -> Int {
        group.exercises.map { exercise in
            drafts.filter { WorkoutSequencePlanner.matches($0, exercise) && !$0.isWarmUp }.count
        }.max() ?? 0
    }

    /// Working-round logging includes fully entered optional warm-ups without
    /// letting an unfinished warm-up block the working sets. Explicit warm-up
    /// logging returns entered invalid rows so the caller can explain the error.
    static func rowsToLog(
        group: WorkoutParityGroup,
        round: Int,
        drafts: [WorkoutSetDraft]
    ) -> [WorkoutSetDraft] {
        guard round >= 0 else { return [] }
        let current = roundDrafts(group: group, round: round, drafts: drafts)
            .filter { !$0.isCompleted }
        if round == 0 { return current.filter(hasMetricEntry) }
        let warmUps = roundDrafts(group: group, round: 0, drafts: drafts).filter {
            !$0.isCompleted && hasMetricEntry($0) &&
                !trimmed($0.exerciseName).isEmpty && validationMessage(for: $0) == nil
        }
        return current + warmUps
    }

    /// Blank custom-exercise slots and all optional warm-ups are excluded from
    /// finish readiness. Every named or entered working row must be valid and
    /// explicitly logged; a completed flag cannot make an unnamed row valid.
    static func finishValidationMessage(drafts: [WorkoutSetDraft]) -> String? {
        let active = drafts.filter {
            !$0.isWarmUp && (!trimmed($0.exerciseName).isEmpty || $0.containsEntry)
        }
        guard !active.isEmpty else {
            return "Add an exercise and log its working sets before finishing."
        }
        if active.contains(where: { trimmed($0.exerciseName).isEmpty }) {
            return "Name each exercise before finishing."
        }
        if let invalid = active.first(where: { !$0.isCompleted || validationMessage(for: $0) != nil }) {
            return "Log every working set for \(invalid.exerciseName) before finishing. Remove any unused sets."
        }
        return nil
    }

    private static func hasMetricEntry(_ draft: WorkoutSetDraft) -> Bool {
        [draft.weight, draft.reps, draft.duration, draft.effort].contains { !trimmed($0).isEmpty }
    }

    /// Optional blank warm-ups do not block a working round or completion.
    /// Explicit zero weight supports bodyweight exercises without treating an
    /// empty field as a logged zero.
    static func validationMessage(for draft: WorkoutSetDraft) -> String? {
        let weight = trimmed(draft.weight)
        let reps = trimmed(draft.reps)
        let duration = trimmed(draft.duration)
        let effort = trimmed(draft.effort)
        if draft.isWarmUp && [weight, reps, duration, effort].allSatisfy(\.isEmpty) {
            return nil
        }
        if draft.setType == .timed {
            guard let value = Double(duration), value.isFinite, value > 0 else {
                return "Enter a duration above 0 seconds."
            }
            if !weight.isEmpty && !isNonnegativeNumber(weight) {
                return "Weight must be 0 or higher."
            }
        } else {
            guard isNonnegativeNumber(weight) else {
                return "Enter weight (0 is allowed)."
            }
            guard let value = Double(reps), value.isFinite,
                  draft.isWarmUp ? value >= 0 : value > 0 else {
                return draft.isWarmUp ? "Enter warm-up reps (0 is allowed)." : "Enter reps above 0."
            }
        }
        if !effort.isEmpty {
            let range: ClosedRange<Double> = draft.effortScale == .rpe ? 1...10 : 0...5
            guard let value = Double(effort), value.isFinite, range.contains(value) else {
                return draft.effortScale == .rpe ? "RPE must be 1 to 10." : "RIR must be 0 to 5."
            }
        }
        return nil
    }

    /// Return one real performance, rather than combining weight and rep maxima
    /// from different sets. Exercise identity follows the existing history rules.
    static func personalRecord(
        for exercise: Exercise,
        history: [WorkoutHistoryRecord],
        setType: WorkoutSetType = .working
    ) -> WorkoutHistoryRecord? {
        let timed = setType == .timed
        return history.filter { record in
            guard matches(record, exercise), !record.isCardio, !record.isWarmUp else { return false }
            if timed {
                guard record.resolvedSetType == .timed, let duration = record.durationSeconds else { return false }
                return duration.isFinite && duration > 0
            }
            guard record.countsTowardWorkingMetrics, record.weightUsed.isFinite,
                  record.weightUsed >= 0, let reps = record.reps else { return false }
            return reps.isFinite && reps > 0
        }.sorted { left, right in
            if timed, left.durationSeconds != right.durationSeconds {
                return (left.durationSeconds ?? 0) > (right.durationSeconds ?? 0)
            }
            if left.weightUsed != right.weightUsed { return left.weightUsed > right.weightUsed }
            if left.reps != right.reps { return (left.reps ?? 0) > (right.reps ?? 0) }
            // Keep the earliest occurrence when a later session ties a PR.
            if left.entryDate != right.entryDate { return left.entryDate < right.entryDate }
            return left.setNumber < right.setNumber
        }.first
    }

    static func copyPersonalRecords(
        group: WorkoutParityGroup,
        round: Int,
        drafts: [WorkoutSetDraft],
        history: [WorkoutHistoryRecord]
    ) -> WorkoutParityCopyResult {
        guard round > 0 else { return WorkoutParityCopyResult(drafts: drafts, changes: []) }
        var updated = drafts
        var changes: [WorkoutParityCopyChange] = []
        for target in roundDrafts(group: group, round: round, drafts: drafts) {
            guard let exercise = group.exercises.first(where: { WorkoutSequencePlanner.matches(target, $0) }),
                  let record = personalRecord(for: exercise, history: history, setType: target.setType),
                  let index = updated.firstIndex(where: { $0.id == target.id }) else { continue }
            if target.setType == .timed {
                if let duration = record.durationSeconds {
                    fill(.duration, value: numberString(duration), draft: &updated[index], changes: &changes)
                }
            } else {
                fill(.weight, value: numberString(record.weightUsed), draft: &updated[index], changes: &changes)
                if let reps = record.reps {
                    fill(.reps, value: numberString(reps), draft: &updated[index], changes: &changes)
                }
            }
        }
        return WorkoutParityCopyResult(drafts: updated, changes: changes)
    }

    static func copyPreviousRound(
        group: WorkoutParityGroup,
        round: Int,
        drafts: [WorkoutSetDraft]
    ) -> WorkoutParityCopyResult {
        guard round > 1 else { return WorkoutParityCopyResult(drafts: drafts, changes: []) }
        var updated = drafts
        var changes: [WorkoutParityCopyChange] = []
        let previous = roundDrafts(group: group, round: round - 1, drafts: drafts)
        for target in roundDrafts(group: group, round: round, drafts: drafts) {
            guard let source = previous.first(where: {
                $0.exerciseCode == target.exerciseCode && $0.exerciseName == target.exerciseName
            }), let index = updated.firstIndex(where: { $0.id == target.id }) else { continue }
            if target.setType == .timed {
                if source.setType == .timed, let value = Double(trimmed(source.duration)), value.isFinite, value > 0 {
                    fill(.duration, value: source.duration, draft: &updated[index], changes: &changes)
                }
            } else if source.setType != .timed {
                if isNonnegativeNumber(trimmed(source.weight)) {
                    fill(.weight, value: source.weight, draft: &updated[index], changes: &changes)
                }
                if let value = Double(trimmed(source.reps)), value.isFinite, value > 0 {
                    fill(.reps, value: source.reps, draft: &updated[index], changes: &changes)
                }
            }
        }
        return WorkoutParityCopyResult(drafts: updated, changes: changes)
    }

    static func copyHistoryRecord(
        _ record: WorkoutHistoryRecord,
        to targetID: UUID,
        drafts: [WorkoutSetDraft]
    ) -> WorkoutParityCopyResult {
        var updated = drafts
        var changes: [WorkoutParityCopyChange] = []
        guard let index = updated.firstIndex(where: { $0.id == targetID }),
              !updated[index].isWarmUp,
              ExerciseNameIdentity.key(for: updated[index].exerciseName) == ExerciseNameIdentity.key(for: record.exerciseName)
        else { return WorkoutParityCopyResult(drafts: drafts, changes: []) }
        guard !updated[index].isCompleted else { return WorkoutParityCopyResult(drafts: drafts, changes: []) }
        if updated[index].setType == .timed {
            if let duration = record.durationSeconds, duration.isFinite, duration > 0 {
                replace(.duration, value: numberString(duration), draft: &updated[index], changes: &changes)
            }
        } else if record.resolvedSetType != .timed, let reps = record.reps {
            replace(.weight, value: numberString(record.weightUsed), draft: &updated[index], changes: &changes)
            replace(.reps, value: numberString(reps), draft: &updated[index], changes: &changes)
        }
        return WorkoutParityCopyResult(drafts: updated, changes: changes)
    }

    /// Undo is field-specific and cannot erase a subsequent edit or logged set.
    static func undoCopy(_ copy: WorkoutParityCopyResult, in drafts: [WorkoutSetDraft]) -> [WorkoutSetDraft] {
        var updated = drafts
        for change in copy.changes.reversed() {
            guard let index = updated.firstIndex(where: { $0.id == change.draftID }),
                  !updated[index].isCompleted,
                  value(change.field, in: updated[index]) == change.copiedValue else { continue }
            set(change.field, value: change.previousValue, draft: &updated[index])
        }
        return updated
    }

    private static func matches(_ record: WorkoutHistoryRecord, _ exercise: Exercise) -> Bool {
        let name = ExerciseNameIdentity.key(for: exercise.name)
        if !name.isEmpty { return ExerciseNameIdentity.key(for: record.exerciseName) == name }
        return !exercise.code.isEmpty && record.exerciseCode == exercise.code
    }

    private static func fill(
        _ field: WorkoutParityMetric, value copied: String,
        draft: inout WorkoutSetDraft, changes: inout [WorkoutParityCopyChange]
    ) {
        let previous = value(field, in: draft)
        guard !draft.isCompleted, trimmed(previous).isEmpty, !trimmed(copied).isEmpty else { return }
        set(field, value: copied, draft: &draft)
        changes.append(WorkoutParityCopyChange(
            draftID: draft.id, field: field, previousValue: previous, copiedValue: copied
        ))
    }

    private static func replace(
        _ field: WorkoutParityMetric, value selected: String,
        draft: inout WorkoutSetDraft, changes: inout [WorkoutParityCopyChange]
    ) {
        let previous = value(field, in: draft)
        guard previous != selected else { return }
        set(field, value: selected, draft: &draft)
        changes.append(WorkoutParityCopyChange(
            draftID: draft.id, field: field, previousValue: previous, copiedValue: selected
        ))
    }

    private static func value(_ field: WorkoutParityMetric, in draft: WorkoutSetDraft) -> String {
        switch field {
        case .weight: draft.weight
        case .reps: draft.reps
        case .duration: draft.duration
        }
    }

    private static func set(_ field: WorkoutParityMetric, value: String, draft: inout WorkoutSetDraft) {
        switch field {
        case .weight: draft.weight = value
        case .reps: draft.reps = value
        case .duration: draft.duration = value
        }
    }

    private static func trimmed(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func isNonnegativeNumber(_ text: String) -> Bool {
        guard let value = Double(text) else { return false }
        return value.isFinite && value >= 0
    }

    private static func numberString(_ value: Double) -> String {
        value.formatted(.number.grouping(.never).precision(.fractionLength(0...8)).locale(Locale(identifier: "en_US_POSIX")))
    }
}
