import Foundation

struct AchievementSnapshot: Equatable {
    let workoutCount: Int
    let prCount: Int
    let bestWeeks: Int
    let comebackCount: Int
    let cardioWorkoutCount: Int
    let mobilityWorkoutCount: Int
    let yogaWorkoutCount: Int
    let xp: Int
    let level: AchievementLevel
    let badges: [ClientAchievementBadge]
    /// Chronological. IDs are stable when the same saved history is evaluated again.
    let events: [ClientAchievementEvent]
}

struct AchievementLevel: Equatable {
    let number: Int
    let name: String
    let minimumXP: Int
    let nextXP: Int?
    let nextName: String?
    let progress: Double
}

struct ClientAchievementBadge: Identifiable, Equatable {
    let id: String
    let title: String
    let detail: String
    let icon: String
    let category: String
    let tier: String
    let target: Int
    let current: Int
    let unlocked: Bool
    let earnedOn: String?

    var progress: Double { min(1, max(0, Double(current) / Double(max(target, 1)))) }
}

enum AchievementEventKind: String, Equatable {
    case badge, pr
}

struct ClientAchievementEvent: Identifiable, Equatable {
    let id: String
    let kind: AchievementEventKind
    let sessionID: String
    let date: String
    let title: String
    let detail: String
    let badgeID: String?
}

/// A deterministic projection of saved workout history shared in meaning with
/// the web achievement engine. No device ledger, mutations, or current-time reads.
enum ClientAchievementEngine {
    private struct Definition {
        let id: String
        let title: String
        let detail: String
        let icon: String
        let category: String
        let tier: String
        let target: Int
        let metric: Metric
    }

    private enum Metric { case workouts, records, weeks, comebacks, cardio, mobility, yoga }

    private struct Session {
        let id: String
        let date: String
        let day: Date
        let completedAt: Date
        let records: [WorkoutHistoryRecord]
    }

    private struct ExerciseBest {
        var name: String
        var weight: Double = 0
        var weightReps: Double = 0
        var bodyweightReps: Double = 0
    }

    private struct Earned {
        let date: String
    }

    private static let definitions: [Definition] = [
        workout(1, "First Spark", "bronze"),
        workout(5, "Finding Your Groove", "bronze"),
        workout(10, "Double Digits", "silver"),
        workout(25, "Momentum Maker", "silver"),
        workout(50, "Half Century", "gold"),
        workout(100, "Century Club", "gold"),
        workout(250, "The Long Game", "platinum"),
        record(1, "Personal Best", "bronze"),
        record(5, "Record Breaker", "silver"),
        record(10, "Raising the Bar", "gold"),
        record(25, "Limit Lifter", "platinum"),
        weeks(3, "Finding Your Rhythm", "bronze"),
        weeks(8, "Built to Last", "silver"),
        weeks(12, "Consistency Icon", "gold"),
        Definition(id: "comeback-1", title: "Welcome Back",
            detail: "Complete a workout after 14 or more days away.",
            icon: "arrow.uturn.backward", category: "consistency", tier: "bronze", target: 1, metric: .comebacks),
        Definition(id: "cardio-1", title: "Heart Starter",
            detail: "Complete a workout with cardio.",
            icon: "heart.fill", category: "cardio", tier: "bronze", target: 1, metric: .cardio),
        activity(.mobility, 1, "Stretch Start", "bronze"),
        activity(.mobility, 10, "Mobility Builder", "silver"),
        activity(.mobility, 25, "Move Freely", "gold"),
        activity(.yoga, 1, "First Flow", "bronze"),
        activity(.yoga, 10, "Flow State", "silver"),
        activity(.yoga, 25, "Rooted & Rising", "gold"),
        activity(.cardio, 10, "Cardio Groove", "silver"),
        activity(.cardio, 50, "Endurance Engine", "gold")
    ]

    private static let levels: [(xp: Int, name: String)] = [
        (0, "Getting Started"), (300, "Finding Your Groove"), (750, "Momentum Maker"),
        (1_500, "Consistency Crew"), (3_000, "Dedicated"), (5_000, "Trailblazer"),
        (8_000, "All-Star"), (12_000, "FWB Legend")
    ]

    static func evaluate(records: [WorkoutHistoryRecord], today: String) -> AchievementSnapshot {
        let sessions = completedSessions(records: records, today: today)
        var workoutCount = 0
        var prCount = 0
        var bestWeeks = 0
        var comebackCount = 0
        var cardioWorkoutCount = 0
        var mobilityWorkoutCount = 0
        var yogaWorkoutCount = 0
        var previousTrainingDay: Date?
        var previousWeek: Date?
        var consecutiveWeeks = 0
        var bestByExercise: [String: ExerciseBest] = [:]
        var earned: [String: Earned] = [:]
        var events: [ClientAchievementEvent] = []

        for session in sessions {
            workoutCount += 1
            if session.records.contains(where: { isCardio($0) && isMeaningful($0) }) {
                cardioWorkoutCount += 1
            }
            if session.records.contains(where: { isMobility($0) && isMeaningful($0) }) { mobilityWorkoutCount += 1 }
            if session.records.contains(where: { isYoga($0) && isMeaningful($0) }) { yogaWorkoutCount += 1 }
            if let previousTrainingDay,
               calendar.dateComponents([.day], from: previousTrainingDay, to: session.day).day ?? 0 >= 14 {
                comebackCount += 1
            }
            previousTrainingDay = session.day

            let week = monday(for: session.day)
            if week != previousWeek {
                let gap = previousWeek.flatMap { calendar.dateComponents([.day], from: $0, to: week).day }
                consecutiveWeeks = gap == 7 ? consecutiveWeeks + 1 : 1
                bestWeeks = max(bestWeeks, consecutiveWeeks)
                previousWeek = week
            }

            let currentBests = exerciseBests(session.records)
            for key in currentBests.keys.sorted() {
                guard let current = currentBests[key] else { continue }
                let previous = bestByExercise[key]
                let weightImproved = (previous?.weight ?? 0) > 0 && current.weight > (previous?.weight ?? 0)
                let bodyweightImproved = (previous?.bodyweightReps ?? 0) > 0
                    && current.bodyweightReps > (previous?.bodyweightReps ?? 0)
                if weightImproved || bodyweightImproved {
                    prCount += 1
                    let detail = weightImproved
                        ? "\(number(current.weight)) lb × \(number(current.weightReps)) reps"
                        : "\(number(current.bodyweightReps)) bodyweight reps"
                    events.append(ClientAchievementEvent(
                        id: "pr:\(session.id):\(key)", kind: .pr, sessionID: session.id,
                        date: session.date, title: "New PR · \(current.name)", detail: detail, badgeID: nil))
                }
                bestByExercise[key] = ExerciseBest(
                    name: current.name,
                    weight: max(current.weight, previous?.weight ?? 0),
                    weightReps: current.weight >= (previous?.weight ?? 0) ? current.weightReps : previous?.weightReps ?? 0,
                    bodyweightReps: max(current.bodyweightReps, previous?.bodyweightReps ?? 0))
            }

            for definition in definitions where earned[definition.id] == nil {
                let value = count(definition.metric, workouts: workoutCount, records: prCount,
                    weeks: bestWeeks, comebacks: comebackCount, cardio: cardioWorkoutCount,
                    mobility: mobilityWorkoutCount, yoga: yogaWorkoutCount)
                guard value >= definition.target else { continue }
                earned[definition.id] = Earned(date: session.date)
                events.append(ClientAchievementEvent(
                    id: "badge:\(definition.id)", kind: .badge, sessionID: session.id, date: session.date,
                    title: definition.title, detail: definition.detail, badgeID: definition.id))
            }
        }

        let badges = definitions.map { definition in
            ClientAchievementBadge(id: definition.id, title: definition.title, detail: definition.detail,
                icon: definition.icon, category: definition.category, tier: definition.tier,
                target: definition.target,
                current: min(definition.target, count(definition.metric, workouts: workoutCount,
                    records: prCount, weeks: bestWeeks, comebacks: comebackCount, cardio: cardioWorkoutCount,
                    mobility: mobilityWorkoutCount, yoga: yogaWorkoutCount)),
                unlocked: earned[definition.id] != nil, earnedOn: earned[definition.id]?.date)
        }
        let xp = workoutCount * 100 + prCount * 50 + earned.count * 100
        let levelIndex = levels.lastIndex { xp >= $0.xp } ?? 0
        let next = levelIndex + 1 < levels.count ? levels[levelIndex + 1] : nil
        let progress = next.map { Double(xp - levels[levelIndex].xp) / Double($0.xp - levels[levelIndex].xp) } ?? 1
        return AchievementSnapshot(workoutCount: workoutCount, prCount: prCount, bestWeeks: bestWeeks,
            comebackCount: comebackCount, cardioWorkoutCount: cardioWorkoutCount,
            mobilityWorkoutCount: mobilityWorkoutCount, yogaWorkoutCount: yogaWorkoutCount, xp: xp,
            level: AchievementLevel(number: levelIndex + 1, name: levels[levelIndex].name,
                minimumXP: levels[levelIndex].xp, nextXP: next?.xp, nextName: next?.name,
                progress: min(1, max(0, progress))), badges: badges, events: events)
    }

    /// Same identity used by the web engine and completion celebrations.
    static func sessionKey(sessionID: UUID?, entryDate: String, workoutTitle: String) -> String {
        sessionID.map { "session:\($0.uuidString.lowercased())" }
            ?? "legacy:\(entryDate)::\(normalize(workoutTitle))"
    }

    private static func completedSessions(records: [WorkoutHistoryRecord], today: String) -> [Session] {
        guard date(today) != nil else { return [] }
        // Deduplicate before filtering. A newer edit must replace the old row even
        // if the edit removes completion or moves the workout to a future date.
        var unique: [String: WorkoutHistoryRecord] = [:]
        var withoutStableIdentity: [WorkoutHistoryRecord] = []
        for record in records {
            guard let stableID = record.setID ?? record.rowID else {
                withoutStableIdentity.append(record)
                continue
            }
            let key = stableID.uuidString.lowercased()
            if let saved = unique[key], !isNewer(record, than: saved) { continue }
            unique[key] = record
        }
        let valid = (Array(unique.values) + withoutStableIdentity)
            .filter { date($0.entryDate) != nil && $0.entryDate <= today }
        var identified: [String: Set<UUID>] = [:]
        for record in valid {
            guard let id = record.sessionID else { continue }
            let legacyKey = sessionKey(sessionID: nil, entryDate: record.entryDate, workoutTitle: record.workoutTitle)
            identified[legacyKey, default: []].insert(id)
        }
        let grouped = Dictionary(grouping: valid) { record -> String in
            let legacyKey = sessionKey(sessionID: nil, entryDate: record.entryDate, workoutTitle: record.workoutTitle)
            if record.sessionID == nil, let candidates = identified[legacyKey], candidates.count == 1,
               let matched = candidates.first {
                return sessionKey(sessionID: matched, entryDate: record.entryDate, workoutTitle: record.workoutTitle)
            }
            return sessionKey(sessionID: record.sessionID, entryDate: record.entryDate, workoutTitle: record.workoutTitle)
        }
        return grouped.compactMap { id, groupedMembers -> Session? in
            // Resolve aliases before applying the legacy fallback identity. Stable
            // set/row IDs remain authoritative when two real sets share a number.
            var idless: [String: WorkoutHistoryRecord] = [:]
            var members = groupedMembers.filter { $0.setID != nil || $0.rowID != nil }
            for member in groupedMembers where member.setID == nil && member.rowID == nil {
                let key = "\(exerciseKey(member)):\(member.setNumber)"
                if let saved = idless[key], !isNewer(member, than: saved) { continue }
                idless[key] = member
            }
            members.append(contentsOf: idless.values)
            guard let entryDate = members.map(\.entryDate).min(), let day = date(entryDate),
                  let completedAt = members.compactMap(\.completedAt).filter({ $0.timeIntervalSince1970.isFinite }).min(),
                  members.contains(where: isMeaningful) else { return nil }
            return Session(id: id, date: entryDate, day: day, completedAt: completedAt, records: members)
        }.sorted {
            if $0.date != $1.date { return $0.date < $1.date }
            if $0.completedAt != $1.completedAt { return $0.completedAt < $1.completedAt }
            return $0.id < $1.id
        }
    }

    private static func exerciseBests(_ records: [WorkoutHistoryRecord]) -> [String: ExerciseBest] {
        var result: [String: ExerciseBest] = [:]
        for record in records {
            guard !isWarmUp(record), !isCardio(record), !isMobility(record), !isYoga(record), record.resolvedSetType != .timed,
                  !(record.durationSeconds.map { $0.isFinite && $0 > 0 } ?? false),
                  record.weightUsed.isFinite, record.weightUsed >= 0,
                  let reps = record.reps, reps.isFinite, reps > 0 else { continue }
            let key = normalize(record.exerciseName)
            // Custom-workout codes are reused between exercises; a name is required.
            guard !key.isEmpty else { continue }
            let name = record.exerciseName.split(whereSeparator: \.isWhitespace).joined(separator: " ")
            var best = result[key] ?? ExerciseBest(name: name)
            if name < best.name { best.name = name }
            if record.weightUsed > 0 {
                if record.weightUsed > best.weight || (record.weightUsed == best.weight && reps > best.weightReps) {
                    best.weight = record.weightUsed
                    best.weightReps = reps
                }
            } else {
                best.bodyweightReps = max(best.bodyweightReps, reps)
            }
            result[key] = best
        }
        return result
    }

    private static func isMeaningful(_ record: WorkoutHistoryRecord) -> Bool {
        guard !isWarmUp(record) else { return false }
        let timed = record.durationSeconds.map { $0.isFinite && $0 > 0 } ?? false
        if cardioCode(record) || legacyRecoveryDuration(record) {
            return timed || (record.weightUsed.isFinite && record.weightUsed > 0)
                || (!cardioCode(record) && (record.reps.map { $0.isFinite && $0 > 0 } ?? false))
        }
        if record.resolvedSetType == .timed || timed { return timed }
        return record.weightUsed.isFinite && record.weightUsed >= 0
            && (record.reps.map { $0.isFinite && $0 > 0 } ?? false)
    }

    private static func isWarmUp(_ record: WorkoutHistoryRecord) -> Bool {
        let code = normalize(record.exerciseCode)
        return record.resolvedSetType == .warmUp || record.setNumber >= 1_000 || code == "warmup"
    }

    private static func cardioCode(_ record: WorkoutHistoryRecord) -> Bool { normalize(record.exerciseCode) == "cardio" }

    private static func activityName(_ value: String) -> String {
        normalize(value).replacingOccurrences(of: "[’']", with: "", options: .regularExpression)
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static let mobilityNames: Set<String> = ["cat cow", "side lying open book", "open book", "shoulder circles",
        "supine ankle circles", "ankle circles", "hip circles", "worlds greatest stretch", "90 90 hip switches"]
    private static let yogaNames: Set<String> = ["downward dog", "downward facing dog", "upward dog", "upward facing dog",
        "childs pose", "child pose", "warrior pose", "warrior 1", "warrior 2", "warrior i", "warrior ii",
        "tree pose", "pigeon pose", "cobra pose", "triangle pose", "mountain pose", "corpse pose",
        "sun salutation", "sun salutations", "savasana", "balasana", "adho mukha svanasana"]
    private static let cardioNames: Set<String> = ["cardio", "walk", "walking", "brisk walk", "run", "running", "jog", "jogging",
        "bike", "biking", "cycling", "stationary bike", "indoor cycling", "elliptical", "stair climber",
        "stairclimber", "rowing", "rowing machine", "swim", "swimming", "treadmill", "jump rope"]

    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }

    private static func mobilityLabel(_ value: String) -> Bool {
        matches(value, "^(?:(?:upper body|lower body|full body|gentle|daily|morning|evening) )?(?:mobility|stretching|flexibility|mobility and flexibility|stretching and mobility)(?: session| workout| routine)?$")
            || matches(value, "^(upper body|lower body|full body) recovery$")
    }

    private static func yogaLabel(_ value: String) -> Bool {
        matches(value, "^(?:(?:morning|evening|gentle|power|restorative|yin|hatha|vinyasa|ashtanga|hot) )?yoga(?: flow| session| class| practice| workout)?$")
            || matches(value, "^(?:vinyasa|hatha|yin yoga)(?: flow| session| class| practice)?$")
    }

    private static func titleMatches(_ record: WorkoutHistoryRecord, _ predicate: (String) -> Bool) -> Bool {
        record.workoutTitle.components(separatedBy: "·").contains { predicate(activityName($0)) }
    }

    private static func isMobility(_ record: WorkoutHistoryRecord) -> Bool {
        let name = activityName(record.exerciseName)
        return ["mobility", "stretch", "stretching", "flexibility", "recovery"].contains(activityName(record.exerciseCode))
            || mobilityNames.contains(name) || mobilityLabel(name)
            || matches(name, "(?:^| )(?:stretch|stretching|mobility|flexibility|foam roll|foam rolling)$")
            || titleMatches(record, mobilityLabel)
    }

    private static func isYoga(_ record: WorkoutHistoryRecord) -> Bool {
        activityName(record.exerciseCode) == "yoga" || yogaNames.contains(activityName(record.exerciseName))
            || yogaLabel(activityName(record.exerciseName)) || titleMatches(record, yogaLabel)
    }

    private static func isCardio(_ record: WorkoutHistoryRecord) -> Bool {
        guard !isMobility(record), !isYoga(record) else { return false }
        return cardioCode(record) || ((record.durationSeconds.map { $0.isFinite && $0 > 0 } ?? false)
            && (cardioNames.contains(activityName(record.exerciseName)) || titleMatches(record, { cardioNames.contains($0) })))
    }

    private static func legacyRecoveryDuration(_ record: WorkoutHistoryRecord) -> Bool {
        // Native Mobility quick-start stores seconds/rounds in weightUsed/reps.
        titleMatches(record, { $0 == "mobility" || yogaLabel($0) })
            || ["mobility", "stretch", "stretching", "flexibility", "yoga"].contains(activityName(record.exerciseCode))
    }

    private static func isNewer(_ candidate: WorkoutHistoryRecord, than saved: WorkoutHistoryRecord) -> Bool {
        let left = candidate.updatedAt.map { $0.timeIntervalSince1970.isFinite ? $0.timeIntervalSince1970 : -.infinity } ?? -.infinity
        let right = saved.updatedAt.map { $0.timeIntervalSince1970.isFinite ? $0.timeIntervalSince1970 : -.infinity } ?? -.infinity
        if left != right { return left > right }
        return tieBreak(candidate) > tieBreak(saved)
    }

    private static func tieBreak(_ record: WorkoutHistoryRecord) -> String {
        [record.entryDate, normalize(record.workoutTitle), normalize(record.exerciseName),
         normalize(record.exerciseCode), String(record.weightUsed), record.reps.map { String($0) } ?? "",
         record.durationSeconds.map { String($0) } ?? "", record.setType?.rawValue ?? "",
         record.completedAt.map { String($0.timeIntervalSince1970) } ?? "", record.sessionID?.uuidString ?? "",
         record.rowID?.uuidString ?? ""].joined(separator: "|")
    }

    private static func exerciseKey(_ record: WorkoutHistoryRecord) -> String {
        let name = normalize(record.exerciseName)
        return name.isEmpty ? normalize(record.exerciseCode) : name
    }

    private static func normalize(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    private static var calendar: Calendar {
        var result = Calendar(identifier: .gregorian)
        result.timeZone = TimeZone(secondsFromGMT: 0)!
        result.firstWeekday = 2
        result.minimumDaysInFirstWeek = 4
        return result
    }

    private static func date(_ string: String) -> Date? {
        let parts = string.split(separator: "-", omittingEmptySubsequences: false)
        guard string.utf8.count == 10, parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              parts.allSatisfy({ $0.utf8.allSatisfy { (48...57).contains($0) } }),
              let year = Int(parts[0]), year >= 1, let month = Int(parts[1]), let day = Int(parts[2]),
              let value = calendar.date(from: DateComponents(year: year, month: month, day: day)) else { return nil }
        let check = calendar.dateComponents([.year, .month, .day], from: value)
        return check.year == year && check.month == month && check.day == day ? value : nil
    }

    private static func monday(for date: Date) -> Date {
        let weekday = calendar.component(.weekday, from: date)
        return calendar.date(byAdding: .day, value: -((weekday + 5) % 7), to: date) ?? date
    }

    private static func number(_ value: Double) -> String {
        value.rounded() == value ? String(format: "%.0f", value) : String(format: "%g", value)
    }

    private static func count(_ metric: Metric, workouts: Int, records: Int, weeks: Int, comebacks: Int, cardio: Int,
        mobility: Int, yoga: Int) -> Int {
        switch metric {
        case .workouts: workouts
        case .records: records
        case .weeks: weeks
        case .comebacks: comebacks
        case .cardio: cardio
        case .mobility: mobility
        case .yoga: yoga
        }
    }

    private static func workout(_ target: Int, _ title: String, _ tier: String) -> Definition {
        Definition(id: "workout-\(target)", title: title,
            detail: "Complete \(target) workout\(target == 1 ? "" : "s").",
            icon: target == 1 ? "sparkles" : "dumbbell.fill", category: "workouts", tier: tier, target: target, metric: .workouts)
    }

    private static func record(_ target: Int, _ title: String, _ tier: String) -> Definition {
        Definition(id: "pr-\(target)", title: title,
            detail: "Set \(target) new personal record\(target == 1 ? "" : "s").",
            icon: "trophy.fill", category: "records", tier: tier, target: target, metric: .records)
    }

    private static func weeks(_ target: Int, _ title: String, _ tier: String) -> Definition {
        Definition(id: "weeks-\(target)", title: title,
            detail: "Complete a workout in \(target) consecutive weeks.",
            icon: "calendar", category: "consistency", tier: tier, target: target, metric: .weeks)
    }

    private static func activity(_ metric: Metric, _ target: Int, _ title: String, _ tier: String) -> Definition {
        let key = metric == .mobility ? "mobility" : metric == .yoga ? "yoga" : "cardio"
        let activity = metric == .mobility ? "stretching or mobility" : key
        return Definition(id: "\(key)-\(target)", title: title,
            detail: "Complete \(target) workout\(target == 1 ? "" : "s") with \(activity).",
            icon: metric == .mobility ? "figure.flexibility" : metric == .yoga ? "figure.yoga" : "heart.fill",
            category: metric == .cardio ? "cardio" : "recovery", tier: tier, target: target, metric: metric)
    }
}
