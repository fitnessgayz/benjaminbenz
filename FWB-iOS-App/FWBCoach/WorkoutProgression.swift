import Foundation

struct WorkoutProgressionConfig: Codable, Equatable, Hashable {
    var enabled: Bool
    var exerciseKey: String
    var repMin: Int
    var repMax: Int
    var plannedSets: Int
    var targetRIR: Double
    var increment: Double
    var unit: String
    var requiredSessions: Int

    enum CodingKeys: String, CodingKey {
        case enabled, increment, unit
        case exerciseKey = "exercise_key", repMin = "rep_min", repMax = "rep_max"
        case plannedSets = "planned_sets", targetRIR = "target_rir", requiredSessions = "required_sessions"
    }

    init(enabled: Bool, exerciseKey: String, repMin: Int, repMax: Int, plannedSets: Int,
         targetRIR: Double, increment: Double, unit: String, requiredSessions: Int = 2) {
        self.enabled = enabled; self.exerciseKey = exerciseKey; self.repMin = repMin; self.repMax = repMax
        self.plannedSets = plannedSets; self.targetRIR = targetRIR; self.increment = increment
        self.unit = unit; self.requiredSessions = requiredSessions
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try values.decode(Bool.self, forKey: .enabled)
        exerciseKey = try values.decode(String.self, forKey: .exerciseKey)
        repMin = try values.decode(Int.self, forKey: .repMin)
        repMax = try values.decode(Int.self, forKey: .repMax)
        plannedSets = try values.decode(Int.self, forKey: .plannedSets)
        targetRIR = try values.decode(Double.self, forKey: .targetRIR)
        increment = try values.decode(Double.self, forKey: .increment)
        unit = try values.decode(String.self, forKey: .unit)
        requiredSessions = try values.decodeIfPresent(Int.self, forKey: .requiredSessions) ?? 2
    }
}

struct WorkoutProgressionTarget: Codable, Equatable {
    let setNumber: Int
    let weight: Double
    let reps: Int
}

struct WorkoutProgressionRecommendation: Codable, Equatable {
    let kind: String
    let reason: String
    let targets: [WorkoutProgressionTarget]
}

/// Explicit input also makes the shared web/iOS fixtures executable without UI or storage.
struct WorkoutProgressionHistoryInput: Decodable {
    let sessionID: String?
    let knownIdentity: Bool?
    let knownSetType: Bool?
    let exerciseName: String
    let exerciseCode: String?
    let setNumber: Int
    let weightUsed: Double
    let reps: Double?
    let effortScale: String?
    let effortValue: Double?
    let setType: String?
    let completedAt: String?
    let entryDate: String
    let progressionTarget: WorkoutProgressionConfig?

    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id", knownIdentity = "fwb_session_identity_known", knownSetType = "fwb_set_type_known"
        case exerciseName = "exercise_name", exerciseCode = "exercise_code", setNumber = "set_number"
        case weightUsed = "weight_used", reps, effortScale = "effort_scale", effortValue = "effort_value"
        case setType = "set_type", completedAt = "completed_at", entryDate = "entry_date", progressionTarget = "progression_target"
    }

    init(_ row: WorkoutHistoryRecord) {
        sessionID = row.sessionID?.uuidString.lowercased(); knownIdentity = row.hasSessionIdentity; knownSetType = row.hasKnownSetType
        exerciseName = row.exerciseName; exerciseCode = row.exerciseCode; setNumber = row.setNumber
        weightUsed = row.weightUsed; reps = row.reps; effortScale = row.effortScale?.rawValue
        effortValue = row.effortValue; setType = row.setType?.rawValue
        completedAt = row.completedAt.map { ISO8601DateFormatter().string(from: $0) }
        entryDate = row.entryDate; progressionTarget = row.progressionTarget
    }
}

/// Deterministic suggestions only. Applying a target and completing a set are separate actions.
/// Rules and user-facing explanations match js/workout-progression.js.
enum WorkoutProgression {
    private static let maxAge: TimeInterval = 42 * 24 * 60 * 60
    private static func text(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }
    static func exerciseKey(_ name: String) -> String {
        text(name).isEmpty ? "" : "name:" + text(name)
    }
    static func normalizedConfig(_ config: WorkoutProgressionConfig) -> WorkoutProgressionConfig? {
        guard config.exerciseKey.hasPrefix("name:"),
              exerciseKey(String(config.exerciseKey.dropFirst(5))) == config.exerciseKey,
              (1...50).contains(config.repMin), (config.repMin...50).contains(config.repMax),
              (1...20).contains(config.plannedSets), config.targetRIR.isFinite, (0...5).contains(config.targetRIR),
              config.increment.isFinite, config.increment > 0, config.increment <= 100,
              ["lb", "kg"].contains(config.unit), (2...5).contains(config.requiredSessions) else { return nil }
        return config
    }
    private static func matches(_ pattern: String, _ value: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }
    private static func unsupported(_ name: String, prescription: String = "") -> Bool {
        let name = text(name)
        if matches(#"\b(assisted|assistance|stretch|mobility|foam roll|cardio)\b"#, name)
            || matches(#"\b(sec|secs|seconds?|minutes?|mins?|amrap|failure)\b"#, text(prescription)) { return true }
        let bodyweight = matches(#"\b(bodyweight|push[ -]?ups?|pull[ -]?ups?|chin[ -]?ups?|dips?|plank|dead bug|bird dog|burpee|jumping jack|mountain climber|inverted row|glute bridge|leg raise|knee raise|ab wheel|bear crawl)\b"#, name)
        return bodyweight && !matches(#"\b(weighted|dumbbell|barbell|cable|machine)\b"#, name)
    }
    static func defaultConfig(for exercise: Exercise, plannedSets: Int? = nil) -> WorkoutProgressionConfig? {
        guard !exercise.hasInvalidProgression else { return nil }
        if var configured = exercise.progression {
            guard normalizedConfig(configured) != nil, configured.exerciseKey == exerciseKey(exercise.name) else { return nil }
            if let plannedSets { configured.plannedSets = plannedSets }
            return normalizedConfig(configured)
        }
        return defaultConfig(name: exercise.name, prescription: exercise.prescription, plannedSets: plannedSets)
    }
    static func defaultConfig(name: String, prescription: String, plannedSets: Int? = nil) -> WorkoutProgressionConfig? {
        guard !unsupported(name, prescription: prescription) else { return nil }
        let value = text(prescription)
        let range = #"(\d{1,2})(?:\s*[-–—−]\s*(\d{1,2}))?"#
        func captures(_ pattern: String) -> [String]? {
            guard let expression = try? NSRegularExpression(pattern: pattern),
                  let match = expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) else { return nil }
            return (1..<match.numberOfRanges).map { index in
                Range(match.range(at: index), in: value).map { String(value[$0]) } ?? ""
            }
        }
        let low: Int, high: Int, sets: Int?
        if let values = captures("^" + range + #"\s*(?:reps?)?(?:\s*(?:x|×)\s*(\d{1,2})\s*sets?)?(?:\s*(?:each|per side|/side))?$"#), let lower = Int(values[0]) {
            low = lower; high = Int(values[1]) ?? lower; sets = Int(values[2])
        } else if let values = captures(#"^(\d{1,2})\s*(?:sets?\s*(?:of|x|×)|x|×)\s*"# + range + #"(?:\s*reps?)?(?:\s*(?:each|per side|/side))?$"#), let lower = Int(values[1]) {
            low = lower; high = Int(values[2]) ?? lower; sets = Int(values[0])
        } else { return nil }
        guard let count = plannedSets ?? sets else { return nil }
        return normalizedConfig(WorkoutProgressionConfig(enabled: true, exerciseKey: exerciseKey(name), repMin: low, repMax: high,
            plannedSets: count, targetRIR: 2, increment: 2.5, unit: "lb"))
    }
    private static func sameConfig(_ saved: WorkoutProgressionConfig?, _ config: WorkoutProgressionConfig) -> Bool {
        guard let saved, normalizedConfig(saved) != nil, saved.enabled else { return false }
        return saved.exerciseKey == config.exerciseKey && saved.repMin == config.repMin && saved.repMax == config.repMax
            && saved.plannedSets == config.plannedSets && saved.targetRIR == config.targetRIR
            && saved.increment == config.increment && saved.unit == config.unit && saved.requiredSessions == config.requiredSessions
    }
    private static func dayIsValid(_ value: String) -> Bool {
        guard matches(#"^\d{4}-\d{2}-\d{2}$"#, value) else { return false }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyy-MM-dd"; formatter.isLenient = false
        guard let date = formatter.date(from: value) else { return false }
        return formatter.string(from: date) == value
    }
    private static func timestamp(_ value: String?) -> Date? {
        guard let value, matches(#"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"#, value), dayIsValid(String(value.prefix(10))) else { return nil }
        let parser = ISO8601DateFormatter()
        if value.contains(".") { parser.formatOptions.insert(.withFractionalSeconds) }
        return parser.date(from: value)
    }
    private static func rir(_ row: WorkoutProgressionHistoryInput) -> Double? {
        guard let effort = row.effortValue, effort.isFinite else { return nil }
        if row.effortScale == "rir", (0...10).contains(effort) { return effort }
        if row.effortScale == "rpe", (1...10).contains(effort) { return 10 - effort }
        return nil
    }
    private static func result(_ kind: String, _ reason: String, _ targets: [WorkoutProgressionTarget] = []) -> WorkoutProgressionRecommendation {
        WorkoutProgressionRecommendation(kind: kind, reason: reason, targets: targets)
    }
    static func recommend(config: WorkoutProgressionConfig, history: [WorkoutHistoryRecord], now: Date = Date(),
                          excludedSessionID: UUID? = nil, historyComplete: Bool = true) -> WorkoutProgressionRecommendation {
        recommend(config: config, inputs: history.filter { exerciseKey($0.exerciseName) == config.exerciseKey }.map(WorkoutProgressionHistoryInput.init), now: now,
            excludedSessionID: excludedSessionID?.uuidString.lowercased(), historyComplete: historyComplete)
    }
    static func recommend(config: WorkoutProgressionConfig, inputs: [WorkoutProgressionHistoryInput], now: Date,
                          excludedSessionID: String? = nil, historyComplete: Bool = true) -> WorkoutProgressionRecommendation {
        guard normalizedConfig(config) != nil else {
            return result("unavailable", "Set a valid rep range, working-set count, effort target, and weight increment first.")
        }
        guard config.enabled else { return result("disabled", "Suggested targets are turned off for this exercise.") }
        guard !unsupported(String(config.exerciseKey.dropFirst(5))) else {
            return result("unavailable", "This exercise needs a different progression method. Set its targets manually.")
        }
        guard now.timeIntervalSince1970.isFinite else { return result("unavailable", "Workout history is unavailable. Keep your planned targets.") }
        guard historyComplete else { return result("unavailable", "Load your complete recent workout history before using suggested targets.") }
        let today = String(ISO8601DateFormatter().string(from: now).prefix(10))
        struct Session {
            var rows: [WorkoutProgressionHistoryInput]
            var time: Date
            let id: String
        }
        var groups: [String: Session] = [:]
        var latestAmbiguousTime = Date.distantPast
        for row in inputs {
            guard exerciseKey(row.exerciseName) == config.exerciseKey,
                  excludedSessionID == nil || row.sessionID?.lowercased() != excludedSessionID?.lowercased(),
                  dayIsValid(row.entryDate), row.entryDate <= today,
                  row.setType != "warm_up", row.setNumber < 1000, row.exerciseCode != "CARDIO" else { continue }
            let completed = timestamp(row.completedAt)
            if let completed, completed > now { continue }
            // Incomplete and nonstandard sessions remain barriers in chronology.
            let sessionTime = completed ?? min(now, timestamp(row.entryDate + "T23:59:59Z") ?? now)
            guard let identity = row.sessionID, !identity.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, row.knownIdentity != false else {
                latestAmbiguousTime = max(latestAmbiguousTime, sessionTime)
                continue
            }
            let key = identity.lowercased()
            var session = groups[key] ?? Session(rows: [], time: sessionTime, id: key)
            session.rows.append(row); session.time = max(session.time, sessionTime); groups[key] = session
        }
        let sessions = groups.values.sorted { $0.time == $1.time ? $0.id < $1.id : $0.time > $1.time }
        guard let first = sessions.first else { return result("baseline", "Log a complete workout to establish your starting weight. No weight is guessed.") }
        guard latestAmbiguousTime < first.time else {
            return result("baseline", "Your newest matching history has no reliable session identity. Log a complete session with this plan first.")
        }
        struct Assessment {
            let rows: [WorkoutProgressionHistoryInput]
            let comparable: Bool
            let legacy: Bool
            let fresh: Bool
            let effortMet: Bool
            let upper: Bool
            let below: Bool
            let targets: [WorkoutProgressionTarget]
        }
        func assess(_ session: Session) -> Assessment {
            let rows = session.rows.sorted { $0.setNumber < $1.setNumber }
            let complete = rows.count == config.plannedSets && rows.enumerated().allSatisfy { index, row in
                guard let reps = row.reps else { return false }
                return row.setNumber == index + 1 && row.knownSetType != false
                    && (row.setType == nil || row.setType == "working") && timestamp(row.completedAt) != nil
                    && row.weightUsed.isFinite && row.weightUsed > 0
                    && reps.isFinite && reps.rounded() == reps && (1...1000).contains(reps)
            }
            let comparable = complete && rows.allSatisfy { sameConfig($0.progressionTarget, config) }
            let legacy = complete && config.unit == "lb" && rows.allSatisfy { $0.progressionTarget == nil }
            let fresh = now.timeIntervalSince(session.time) <= maxAge
            let effortMet = rows.allSatisfy { (rir($0) ?? -1) >= config.targetRIR }
            let upper = comparable && fresh && effortMet && rows.allSatisfy { ($0.reps ?? 0) >= Double(config.repMax) }
            let below = comparable && fresh && rows.contains { ($0.reps ?? 0) < Double(config.repMin) }
            let targets: [WorkoutProgressionTarget] = complete ? rows.map {
                WorkoutProgressionTarget(setNumber: $0.setNumber, weight: $0.weightUsed,
                    reps: max(config.repMin, min(config.repMax, Int($0.reps ?? 0))))
            } : []
            return Assessment(rows: rows, comparable: comparable, legacy: legacy, fresh: fresh,
                effortMet: effortMet, upper: upper, below: below, targets: targets)
        }
        let latest = assess(first)
        guard latest.comparable || latest.legacy else { return result("baseline", "Your latest session is incomplete or uses different targets. Log a complete session with this plan first.") }
        if latest.legacy { return result("hold", "Repeat your last working weights. Earlier logs did not save the planned targets, so they cannot justify an increase.", latest.targets) }
        guard latest.fresh else { return result("hold", "Your last comparable workout was over 42 days ago. Re-establish these targets before progressing.", latest.targets) }
        let recent = sessions.filter { $0.time > latestAmbiguousTime }.prefix(config.requiredSessions).map(assess)
        if recent.count == config.requiredSessions && recent.allSatisfy(\.below) {
            return result("review", "Recent sessions missed the lower rep target. Keep the load and review the plan with your coach.", latest.targets)
        }
        guard latest.effortMet else { return result("hold", "Keep the same weight and record enough reps in reserve before progressing.", latest.targets) }
        let uniformWeight = latest.rows[0].weightUsed
        let canIncrease = recent.count == config.requiredSessions && recent.allSatisfy { session in
            session.upper && session.rows.allSatisfy { $0.weightUsed == uniformWeight }
        }
        if canIncrease {
            guard config.increment <= uniformWeight * 0.10 + 1e-9 else {
                return result("hold", "Your configured weight jump is over 10%. Choose a smaller equipment increment or review it with your coach.", latest.targets)
            }
            return result("increase", "You reached the upper rep target with the planned effort in your last \(config.requiredSessions) sessions.", latest.targets.map {
                WorkoutProgressionTarget(setNumber: $0.setNumber, weight: (($0.weight + config.increment) * 10000).rounded() / 10000, reps: config.repMin)
            })
        }
        if latest.rows.allSatisfy({ row in guard let reps = row.reps else { return false }; return reps >= Double(config.repMin) && reps <= Double(config.repMax) }),
           let index = latest.targets.firstIndex(where: { $0.reps < config.repMax }) {
            return result("reps", "Keep the same weight and aim for one additional total rep with the planned effort.", latest.targets.enumerated().map { i, target in
                WorkoutProgressionTarget(setNumber: target.setNumber, weight: target.weight, reps: target.reps + (i == index ? 1 : 0))
            })
        }
        return result("hold", "Repeat these targets until you consistently reach the upper rep target with the planned effort.", latest.targets)
    }
}
