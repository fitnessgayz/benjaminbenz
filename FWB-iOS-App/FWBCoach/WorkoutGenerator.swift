import Foundation

enum WorkoutGenerationFocus: String, CaseIterable, Identifiable {
    case fullBody = "full_body", upperBody = "upper_body", lowerBody = "lower_body"
    case chestBack = "chest_back", arms, chest, back, shoulders, glutes, core
    case quads, hamstrings, calves, biceps, triceps, lats, adductors
    case recoveryUpper = "recovery_upper", recoveryLower = "recovery_lower", recoveryFull = "recovery_full"

    /// Stable UI and naming order; presets and recovery regions are not muscles.
    static let selectableMuscles: [Self] = [
        .chest, .back, .shoulders, .glutes, .core, .quads, .hamstrings,
        .calves, .biceps, .triceps, .lats, .adductors
    ]

    var id: String { rawValue }
    var isRecovery: Bool { [.recoveryUpper, .recoveryLower, .recoveryFull].contains(self) }
    var title: String {
        switch self {
        case .fullBody: "Full body"
        case .upperBody: "Upper body"
        case .lowerBody: "Lower body"
        case .chestBack: "Chest & back"
        case .adductors: "Inner thighs"
        case .recoveryUpper: "Upper body recovery"
        case .recoveryLower: "Lower body recovery"
        case .recoveryFull: "Full body recovery"
        default: rawValue.capitalized
        }
    }
    var muscles: [String] {
        switch self {
        case .fullBody, .recoveryFull: Self.allMuscles
        case .upperBody, .recoveryUpper: Self.upperMuscles
        case .lowerBody, .recoveryLower: Self.lowerMuscles
        case .chestBack: ["chest", "back", "lats"]
        case .arms: ["biceps", "triceps"]
        case .back: ["back", "lats"]
        default: [rawValue]
        }
    }
    private static let upperMuscles = ["chest", "back", "lats", "shoulders", "biceps", "triceps"]
    private static let lowerMuscles = ["quads", "hamstrings", "glutes", "calves", "adductors"]
    fileprivate static let allMuscles = [
        "chest", "back", "lats", "shoulders", "biceps", "triceps", "quads",
        "hamstrings", "glutes", "calves", "core", "adductors", "full_body"
    ]
    fileprivate var requiredGroups: [[String]] {
        switch self {
        case .fullBody: [["chest", "shoulders"], ["back", "lats"], ["quads", "hamstrings", "glutes"]]
        case .upperBody: [["chest", "shoulders"], ["back", "lats"]]
        case .lowerBody: [["quads"], ["hamstrings", "glutes"]]
        case .chestBack: [["chest"], ["back", "lats"]]
        case .arms: [["biceps"], ["triceps"]]
        case .recoveryUpper: [Self.upperMuscles]
        case .recoveryLower: [Self.lowerMuscles]
        case .recoveryFull: [Self.upperMuscles, Self.lowerMuscles]
        default: []
        }
    }
}

enum WorkoutGenerationEquipment: String, CaseIterable, Identifiable {
    case fullGym = "full_gym", bodyweight, dumbbell, barbell, cable, machine
    case smithMachine = "smith_machine", bench
    var id: String { rawValue }
    var title: String {
        switch self {
        case .fullGym: "Full gym"
        case .bodyweight: "Bodyweight"
        case .dumbbell: "Dumbbells"
        case .barbell: "Barbell"
        case .cable: "Cables"
        case .machine: "Machines"
        case .smithMachine: "Smith machine"
        case .bench: "Bench"
        }
    }
}

enum WorkoutGenerationIntensity: String, CaseIterable, Identifiable {
    case easy, moderate, challenging
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    fileprivate var guidance: String {
        switch self {
        case .easy: "Keep the effort comfortable and finish each set with several good reps left."
        case .moderate: "Choose a controlled weight and finish each set with a few good reps left."
        case .challenging: "Use a challenging, controlled weight; keep good form and avoid training to failure."
        }
    }
}

struct WorkoutGenerationPreferences: Equatable {
    var focus: WorkoutGenerationFocus = .fullBody
    var equipment: Set<WorkoutGenerationEquipment> = [.fullGym]
    var minutes: Int = 30
    var intensity: WorkoutGenerationIntensity = .moderate
    // Empty preserves existing presets and single-focus callers.
    var selectedMuscles: Set<WorkoutGenerationFocus> = []

    var isRecovery: Bool { focus.isRecovery }

    private var orderedMuscles: [WorkoutGenerationFocus] {
        guard !isRecovery else { return [] }
        return WorkoutGenerationFocus.selectableMuscles.filter { selectedMuscles.contains($0) }
    }

    var focusTitle: String {
        let titles = orderedMuscles.map(\.title)
        guard let last = titles.last else { return focus.title }
        guard titles.count > 1 else { return last }
        return titles.dropLast().joined(separator: ", ") + " & " + last
    }

    var targetMuscles: [String] {
        guard !orderedMuscles.isEmpty else { return focus.muscles }
        return orderedMuscles.flatMap(\.muscles).reduce(into: []) { result, muscle in
            if !result.contains(muscle) { result.append(muscle) }
        }
    }

    var requiredMuscleGroups: [[String]] {
        guard !orderedMuscles.isEmpty else { return focus.requiredGroups }
        let groups = orderedMuscles.map(\.muscles)
        // Lats satisfies an explicit Back selection too. Keep the stricter Lats
        // requirement, so reservation does not demand two pull exercises.
        return groups.enumerated().compactMap { index, group in
            let set = Set(group)
            guard !groups.enumerated().contains(where: { otherIndex, other in
                Set(other).isStrictSubset(of: set) || (otherIndex < index && Set(other) == set)
            }) else { return nil }
            return group
        }
    }

    var normalized: Self {
        var preferences = self
        preferences.selectedMuscles.formIntersection(WorkoutGenerationFocus.selectableMuscles)
        if isRecovery {
            preferences.selectedMuscles = []
            preferences.intensity = .easy
        }
        return preferences
    }
}

struct GeneratedWorkoutExercise: Identifiable, Equatable {
    let source: ApprovedExercise
    let sets: Int
    let reps: String
    let restSeconds: Int
    var id: UUID { source.id }
    var prescription: String {
        guard let info = WorkoutGenerator.repInfo(reps) else { return "" }
        return "\(info.target) x \(sets) sets"
    }
    var rest: String { "\(restSeconds) sec" }

    func exercise(code: String) -> Exercise {
        Exercise(
            code: code, name: source.name.trimmingCharacters(in: .whitespacesAndNewlines),
            prescription: prescription, rest: rest,
            instructions: source.instructions.components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty },
            video: WorkoutGenerator.safeDemoURL(source.demoURL)
        )
    }

    fileprivate func withSets(_ count: Int) -> Self {
        Self(source: source, sets: count, reps: reps, restSeconds: restSeconds)
    }
}

struct GeneratedWorkoutPlan: Equatable {
    let title: String
    let preferences: WorkoutGenerationPreferences
    let estimatedMinutes: Int
    let exercises: [GeneratedWorkoutExercise]
    let notes: [String]
    var recentHistoryUsed: Bool = false
}

enum WorkoutGenerationError: LocalizedError {
    case invalidDuration, unavailable(WorkoutGenerationFocus), unavailableMuscles(String)
    case musclesDoNotFit(String, Int)
    case invalidReplacement, duplicateReplacement, replacementDoesNotFit
    var errorDescription: String? {
        switch self {
        case .invalidDuration: "Choose a 20, 30, 45, or 60 minute workout."
        case .unavailable(let focus):
            focus.isRecovery
                ? "There aren't enough approved mobility or stretching exercises for \(focus.title.lowercased()). Ask your coach to add recovery movements for this area to the exercise library."
                : "There aren't enough approved exercises for \(focus.title.lowercased()) with this equipment and intensity. Try another focus, add available equipment, or ask your coach to expand the library."
        case .unavailableMuscles(let title):
            "The approved library cannot cover \(title) with this equipment and intensity. Add available equipment, choose fewer muscles, or ask your coach to expand the library."
        case .musclesDoNotFit(let title, let minutes):
            minutes < 60
                ? "\(title) cannot all fit in \(minutes) minutes. Select fewer muscles or choose a longer workout."
                : "\(title) cannot all fit in this workout. Select fewer muscles and generate again."
        case .invalidReplacement: "Choose an available replacement that matches your focus, intensity, and equipment."
        case .duplicateReplacement: "That exercise is already in this workout. Choose a different replacement."
        case .replacementDoesNotFit: "That replacement does not fit this workout. Choose another exercise."
        }
    }
}

/// Generates bounded sessions from the active, approved entries supplied by ExerciseLibraryStore.
/// These targets are exercise metadata; they never infer a client's working weight or completed reps.
enum WorkoutGenerator {
    static let durations = [20, 30, 45, 60]

    static func generate(
        library: [ApprovedExercise], history: [WorkoutHistoryRecord],
        preferences: WorkoutGenerationPreferences,
        seed: UInt64 = UInt64.random(in: UInt64.min...UInt64.max), now: Date = Date()
    ) throws -> GeneratedWorkoutPlan {
        let preferences = preferences.normalized
        guard durations.contains(preferences.minutes) else { throw WorkoutGenerationError.invalidDuration }
        let pool = candidates(library, preferences: preferences)
        guard !pool.isEmpty, missingGroups(preferences, sources: pool).isEmpty else {
            throw unavailableError(preferences)
        }
        let recent = recentHistory(history, now: now)
        let limit = min([20: 4, 30: 5, 45: 6, 60: 8][preferences.minutes] ?? 5,
                        preferences.targetMuscles.count <= 2 ? 4 : 8)
        if preferences.requiredMuscleGroups.count > limit {
            throw fitError(preferences)
        }
        var chosen: [GeneratedWorkoutExercise] = []
        var remaining = pool
        while !remaining.isEmpty, chosen.count < limit {
            let missing = missingGroups(preferences, sources: chosen.map(\.source))
            let ranked = remaining.sorted {
                score($0, chosen: chosen, missing: missing, recent: recent, seed: seed)
                    > score($1, chosen: chosen, missing: missing, recent: recent, seed: seed)
            }
            var next: GeneratedWorkoutExercise?
            for entry in ranked {
                var exercise = makeExercise(entry, preferences: preferences)
                let stillMissing = missingGroups(preferences, sources: chosen.map(\.source) + [entry])
                // Reserve the cheapest remaining mandatory group before allocating extra sets.
                let reserve = stillMissing.reduce(0) { sum, group in
                    let minimum = remaining.filter { $0.id != entry.id && group.contains($0.primaryMuscle) }
                        .map { exerciseSeconds(makeExercise($0, preferences: preferences).withSets(1)) }
                        .min() ?? preferences.minutes * 60
                    return sum + minimum
                }
                while exercise.sets > 1, totalSeconds(chosen + [exercise]) + reserve > preferences.minutes * 60 {
                    exercise = exercise.withSets(exercise.sets - 1)
                }
                if totalSeconds(chosen + [exercise]) + reserve <= preferences.minutes * 60 {
                    next = exercise
                    break
                }
            }
            guard let next else { break }
            chosen.append(next)
            remaining.removeAll { $0.id == next.id }
        }
        guard !chosen.isEmpty, missingGroups(preferences, sources: chosen.map(\.source)).isEmpty else {
            throw fitError(preferences)
        }
        return finalize(preferences: preferences, exercises: chosen,
                        recentHistoryUsed: pool.contains { historyPenalty($0, recent: recent) > 0 })
    }

    static func alternatives(
        for exercise: GeneratedWorkoutExercise, in plan: GeneratedWorkoutPlan,
        library: [ApprovedExercise], history: [WorkoutHistoryRecord], now: Date = Date()
    ) -> [GeneratedWorkoutExercise] {
        guard durations.contains(plan.preferences.minutes),
              let index = plan.exercises.firstIndex(of: exercise) else { return [] }
        let others = plan.exercises.enumerated().filter { $0.offset != index }.map(\.element)
        let recent = recentHistory(history, now: now)
        let muscles = ["back", "lats"].contains(exercise.source.primaryMuscle)
            ? ["back", "lats"] : [exercise.source.primaryMuscle]
        func rank(_ entry: ApprovedExercise) -> Double {
            (entry.substitutionGroup.isEmpty || entry.substitutionGroup != exercise.source.substitutionGroup ? 0 : 100)
                + (entry.movementPattern == exercise.source.movementPattern ? 50 : 0)
                + (entry.primaryMuscle == exercise.source.primaryMuscle ? 30 : 0)
                - historyPenalty(entry, recent: recent)
        }
        return candidates(library, preferences: plan.preferences, excludedNames: plan.exercises.map { $0.source.name })
            .filter { entry in muscles.contains(entry.primaryMuscle) && !plan.exercises.contains { $0.id == entry.id } }
            .sorted {
                let left = rank($0), right = rank($1)
                return left == right ? $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending : left > right
            }
            .compactMap { entry in
                var replacement = makeExercise(entry, preferences: plan.preferences.normalized)
                while replacement.sets > 1, totalSeconds(others + [replacement]) > plan.preferences.minutes * 60 {
                    replacement = replacement.withSets(replacement.sets - 1)
                }
                guard missingGroups(plan.preferences, sources: (others + [replacement]).map(\.source)).isEmpty,
                      totalSeconds(others + [replacement]) <= plan.preferences.minutes * 60 else { return nil }
                return replacement
            }
    }

    static func replacing(
        at index: Int, with replacement: GeneratedWorkoutExercise, in plan: GeneratedWorkoutPlan
    ) throws -> GeneratedWorkoutPlan {
        guard plan.exercises.indices.contains(index), durations.contains(plan.preferences.minutes),
              (1...4).contains(replacement.sets), (0...180).contains(replacement.restSeconds),
              repInfo(replacement.reps) != nil,
              !candidates([replacement.source], preferences: plan.preferences.normalized).isEmpty,
              plan.preferences.isRecovery
                ? (gentleRecoveryEntry(replacement.source, reps: replacement.reps)
                    && replacement.sets <= 2 && replacement.restSeconds <= 60)
                : replacement.restSeconds >= 45 else {
            throw WorkoutGenerationError.invalidReplacement
        }
        var exercises = plan.exercises
        exercises[index] = replacement
        guard Set(exercises.map(\.id)).count == exercises.count,
              Set(exercises.map { nameKey($0.source.name) }).count == exercises.count else {
            throw WorkoutGenerationError.duplicateReplacement
        }
        guard missingGroups(plan.preferences, sources: exercises.map(\.source)).isEmpty,
              totalSeconds(exercises) <= plan.preferences.minutes * 60 else {
            throw WorkoutGenerationError.replacementDoesNotFit
        }
        return finalize(preferences: plan.preferences, exercises: exercises, recentHistoryUsed: plan.recentHistoryUsed)
    }

    fileprivate struct RepInfo {
        let seconds: Int
        let target: String
        let timed: Bool
        let high: Int
        let perSideSeconds: Int
    }
    private static let repExpression = try! NSRegularExpression(
        pattern: #"^(\d{1,3})(?:\s*[-–—−]\s*(\d{1,3}))?\s*(reps?|sec(?:onds?)?|s|min(?:utes?)?)?\s*(each|per side|/\s*side)?$"#,
        options: .caseInsensitive
    )
    fileprivate static func repInfo(_ value: String) -> RepInfo? {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let match = repExpression.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        func capture(_ index: Int) -> String {
            Range(match.range(at: index), in: text).map { String(text[$0]) } ?? ""
        }
        guard let low = Int(capture(1)), let high = Int(capture(2).isEmpty ? capture(1) : capture(2)), low >= 1, high >= low else { return nil }
        let unit = capture(3).lowercased()
        let timed = unit.hasPrefix("s") || unit.hasPrefix("min")
        let seconds = high * (unit.hasPrefix("min") ? 60 : timed ? 1 : 3)
        guard timed ? seconds <= 120 : high <= 30 else { return nil }
        let side = !capture(4).isEmpty
        var target = text.replacingOccurrences(of: #"\s*(?:each|per side|/\s*side)$"#, with: "", options: [.regularExpression, .caseInsensitive])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if timed {
            target = target.replacingOccurrences(of: #"(\d)\s*s$"#, with: "$1 sec", options: [.regularExpression, .caseInsensitive])
        } else {
            target = target.replacingOccurrences(of: #"\s*reps?$"#, with: "", options: [.regularExpression, .caseInsensitive])
                .trimmingCharacters(in: .whitespacesAndNewlines) + " reps"
        }
        return RepInfo(seconds: seconds * (side ? 2 : 1), target: target + (side ? "/side" : ""),
                       timed: timed, high: high, perSideSeconds: seconds)
    }

    static func safeDemoURL(_ value: String?) -> String {
        guard let value, let url = URLComponents(string: value), url.scheme == "https",
              url.user == nil, url.password == nil, let host = url.host?.lowercased() else { return "" }
        if ["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"].contains(host) { return value }
        if matches(#"^[a-z0-9-]+\.supabase\.co$"#, host),
           matches(#"^/storage/v1/object/public/exercise-videos/[a-z0-9/-]+\.(mp4|mov|m4v|webm)$"#, url.path),
           url.query == nil, url.fragment == nil { return value }
        return ""
    }

    private static func candidates(
        _ library: [ApprovedExercise], preferences: WorkoutGenerationPreferences, excludedNames: [String] = []
    ) -> [ApprovedExercise] {
        var names = Set(excludedNames.map(nameKey)), ids = Set<UUID>()
        return library.filter { entry in
            let name = entry.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (2...120).contains(name.count), !nameKey(name).isEmpty,
                  WorkoutGenerationFocus.allMuscles.contains(entry.primaryMuscle),
                  let equipment = WorkoutGenerationEquipment(rawValue: entry.equipment), equipment != .fullGym,
                  ["beginner", "intermediate"].contains(entry.difficulty),
                  !entry.movementPattern.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  // Recovery entries stay separate from strength and must have gentle targets.
                  preferences.isRecovery ? gentleRecoveryEntry(entry) : !isRecoveryMovement(entry),
                  (1...10).contains(entry.defaultSets), (0...600).contains(entry.defaultRestSeconds),
                  repInfo(entry.defaultReps) != nil, preferences.targetMuscles.contains(entry.primaryMuscle),
                  preferences.intensity != .easy || entry.difficulty == "beginner",
                  hasEquipment(entry, available: preferences.equipment),
                  !names.contains(nameKey(name)), !ids.contains(entry.id) else { return false }
            names.insert(nameKey(name))
            ids.insert(entry.id)
            return true
        }
    }

    private static func isRecoveryMovement(_ entry: ApprovedExercise) -> Bool {
        ["mobility", "stretch", "stretching", "flexibility", "recovery"].contains(nameKey(entry.movementPattern))
    }

    private static func gentleRecoveryEntry(_ entry: ApprovedExercise, reps: String? = nil) -> Bool {
        guard isRecoveryMovement(entry), entry.difficulty == "beginner", entry.equipment == "bodyweight",
              let target = repInfo(reps ?? entry.defaultReps) else { return false }
        return target.timed ? target.perSideSeconds <= 60 : target.high <= 12
    }

    private static func hasEquipment(_ entry: ApprovedExercise, available input: Set<WorkoutGenerationEquipment>) -> Bool {
        let available = input.union([.bodyweight])
        if available.contains(.fullGym) { return true }
        guard let equipment = WorkoutGenerationEquipment(rawValue: entry.equipment), available.contains(equipment) else { return false }
        let name = nameKey(entry.name)
        if matches(#"\b(hanging|pull up|chin up|inverted row|suspension|trx|rings?|box|step up|back extension)\b"#, name) { return false }
        if equipment == .bodyweight, matches(#"\bdips?\b"#, name), !matches(#"\bbench\b"#, name) { return false }
        if equipment == .barbell, matches(#"\b(back squat|front squat)\b"#, name) { return false }
        if ![.machine, .smithMachine].contains(equipment) {
            if matches(#"\b(bench|incline|decline|chest supported|bulgarian|hip thrust|one arm dumbbell row|dumbbell chest fly|seated dumbbell|seated barbell)\b"#, name), !available.contains(.bench) { return false }
            let requirements: [(String, WorkoutGenerationEquipment)] = [
                ("dumbbell", .dumbbell), ("barbell", .barbell), ("cable", .cable), ("smith", .smithMachine)
            ]
            if requirements.contains(where: { name.contains($0.0) && !available.contains($0.1) }) { return false }
        }
        return true
    }

    private static func makeExercise(_ source: ApprovedExercise, preferences: WorkoutGenerationPreferences) -> GeneratedWorkoutExercise {
        let intensity = preferences.intensity
        let delta = intensity == .easy ? -1 : intensity == .challenging ? 1 : 0
        let cap = intensity == .easy ? 2 : intensity == .challenging ? 4 : 3
        return GeneratedWorkoutExercise(source: source,
                                        sets: preferences.isRecovery ? min(2, source.defaultSets) : min(cap, max(1, source.defaultSets + delta)),
                                        reps: source.defaultReps.trimmingCharacters(in: .whitespacesAndNewlines),
                                        restSeconds: preferences.isRecovery ? min(60, source.defaultRestSeconds) : max(45, min(180, source.defaultRestSeconds)))
    }
    private static func exerciseSeconds(_ exercise: GeneratedWorkoutExercise) -> Int {
        exercise.sets * (repInfo(exercise.reps)?.seconds ?? 0) + max(0, exercise.sets - 1) * exercise.restSeconds + 60
    }
    private static func totalSeconds(_ exercises: [GeneratedWorkoutExercise]) -> Int {
        180 + exercises.reduce(0) { $0 + exerciseSeconds($1) }
    }
    private static func missingGroups(_ preferences: WorkoutGenerationPreferences, sources: [ApprovedExercise]) -> [[String]] {
        preferences.requiredMuscleGroups.filter { group in !sources.contains { group.contains($0.primaryMuscle) } }
    }
    private static func unavailableError(_ preferences: WorkoutGenerationPreferences) -> WorkoutGenerationError {
        preferences.selectedMuscles.isEmpty ? .unavailable(preferences.focus) : .unavailableMuscles(preferences.focusTitle)
    }
    private static func fitError(_ preferences: WorkoutGenerationPreferences) -> WorkoutGenerationError {
        preferences.selectedMuscles.isEmpty ? .unavailable(preferences.focus) : .musclesDoNotFit(preferences.focusTitle, preferences.minutes)
    }
    private static func recentHistory(_ history: [WorkoutHistoryRecord], now: Date) -> [String: Double] {
        guard now.timeIntervalSince1970.isFinite else { return [:] }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let today = calendar.startOfDay(for: now)
        var recent: [String: Double] = [:]
        for row in history {
            guard matches(#"^\d{4}-\d{2}-\d{2}$"#, row.entryDate) else { continue }
            let parts = row.entryDate.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3,
                  let day = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
                  calendar.component(.year, from: day) == parts[0], calendar.component(.month, from: day) == parts[1],
                  calendar.component(.day, from: day) == parts[2],
                  let age = calendar.dateComponents([.day], from: day, to: today).day, (0...14).contains(age) else { continue }
            let name = nameKey(row.exerciseName)
            if !name.isEmpty { recent[name] = max(recent[name] ?? 0, Double(15 - age) / 15) }
        }
        return recent
    }
    private static func historyPenalty(_ entry: ApprovedExercise, recent: [String: Double]) -> Double {
        ([entry.name] + entry.aliases).map { recent[nameKey($0)] ?? 0 }.max().map { $0 * 35 } ?? 0
    }
    private static func score(
        _ entry: ApprovedExercise, chosen: [GeneratedWorkoutExercise], missing: [[String]],
        recent: [String: Double], seed: UInt64
    ) -> Double {
        var hash: UInt32 = 2_166_136_261
        for character in "\(seed):\(entry.id.uuidString.lowercased()):\(nameKey(entry.name))".utf16 {
            hash = (hash ^ UInt32(character)) &* 16_777_619
        }
        let required: Double = missing.contains { $0.contains(entry.primaryMuscle) } ? 200 : 0
        let muscle: Double = chosen.contains { $0.source.primaryMuscle == entry.primaryMuscle } ? 0 : 50
        let pattern: Double = chosen.contains { $0.source.movementPattern == entry.movementPattern } ? 0 : 35
        return required + muscle + pattern - historyPenalty(entry, recent: recent) + Double(hash) / 4_294_967_296 * 12
    }
    private static func finalize(
        preferences: WorkoutGenerationPreferences, exercises: [GeneratedWorkoutExercise], recentHistoryUsed: Bool
    ) -> GeneratedWorkoutPlan {
        let preferences = preferences.normalized
        let estimate = Int(ceil(Double(totalSeconds(exercises)) / 60))
        var notes = preferences.isRecovery
            ? ["Gentle mobility, flexibility, and recovery. Move slowly within a comfortable range and breathe naturally.",
               "Time estimate includes 3 minutes to ease into movement, rests, and transitions."]
            : ["Time estimate includes a 3-minute warm-up, rests between sets, and equipment transitions.", preferences.intensity.guidance]
        if Double(estimate) < Double(preferences.minutes) * 0.8 {
            notes.append(preferences.isRecovery
                ? "This selection provides about \(estimate) minutes of gentle recovery. There is no need to add extra work to fill the time."
                : "This library and equipment combination provides about \(estimate) minutes of training. Choose more equipment or another focus for a longer session.")
        }
        if recentHistoryUsed { notes.append("Recent exercise history helped vary the selection; it does not determine recovery readiness.") }
        return GeneratedWorkoutPlan(title: preferences.isRecovery ? preferences.focusTitle : "\(preferences.focusTitle) workout", preferences: preferences,
                                    estimatedMinutes: estimate, exercises: exercises, notes: notes,
                                    recentHistoryUsed: recentHistoryUsed)
    }
    private static func nameKey(_ value: String) -> String {
        value.decomposedStringWithCompatibilityMapping.lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private static func matches(_ pattern: String, _ value: String) -> Bool {
        value.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }
}
