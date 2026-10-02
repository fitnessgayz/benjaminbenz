import Foundation

enum AppleHealthImportCategory: String, CaseIterable, Codable, Identifiable {
    case workouts, activity, recovery, bodyWeight
    var id: String { rawValue }
    var sharingFields: String {
        switch self {
        case .workouts: "Workout type, dates, duration, active calories, distance, average heart rate, source app and workout identifiers."
        case .activity: "Daily step counts."
        case .recovery: "Daily sleep duration, resting heart rate and heart-rate variability (HRV)."
        case .bodyWeight: "Daily body weight and measurement identifiers."
        }
    }
    var title: String {
        switch self {
        case .workouts: "Workouts & workout heart rate"
        case .activity: "Daily steps"
        case .recovery: "Sleep, resting heart rate & HRV"
        case .bodyWeight: "Body weight"
        }
    }
}

struct AppleHealthImportedWorkout: Codable, Identifiable, Equatable {
    var healthkitID: UUID
    var activityType: String
    var startedAt: Date
    var endedAt: Date
    var durationSeconds: Double
    var activeCalories: Double?
    var distanceMeters: Double?
    var averageHeartRate: Double?
    var sourceName: String
    var id: UUID { healthkitID }
    enum CodingKeys: String, CodingKey {
        case healthkitID = "healthkit_id", activityType = "activity_type", startedAt = "started_at", endedAt = "ended_at"
        case durationSeconds = "duration_seconds", activeCalories = "active_calories", distanceMeters = "distance_meters"
        case averageHeartRate = "average_heart_rate", sourceName = "source_name"
    }
}

struct AppleHealthDailySummary: Codable, Identifiable, Equatable {
    var date: String
    var steps: Double?
    var sleepMinutes: Double?
    var restingHeartRate: Double?
    var hrvMS: Double?
    var bodyWeightKG: Double?
    var bodyWeightSampleID: UUID?
    var id: String { date }
    var hasData: Bool {
        steps != nil || sleepMinutes != nil || restingHeartRate != nil || hrvMS != nil || bodyWeightKG != nil
    }
    enum CodingKeys: String, CodingKey {
        case date, steps, sleepMinutes = "sleep_minutes", restingHeartRate = "resting_heart_rate"
        case hrvMS = "hrv_ms", bodyWeightKG = "body_weight_kg", bodyWeightSampleID = "body_weight_sample_id"
    }
    func filtered(to categories: Set<AppleHealthImportCategory>) -> Self {
        var copy = self
        if !categories.contains(.activity) { copy.steps = nil }
        if !categories.contains(.recovery) { copy.sleepMinutes = nil; copy.restingHeartRate = nil; copy.hrvMS = nil }
        if !categories.contains(.bodyWeight) { copy.bodyWeightKG = nil; copy.bodyWeightSampleID = nil }
        return copy
    }
}

struct AppleHealthImportSnapshot: Equatable {
    var since: Date
    var workouts: [AppleHealthImportedWorkout] = []
    var daily: [AppleHealthDailySummary] = []
    func filtered(to categories: Set<AppleHealthImportCategory>) -> Self {
        Self(since: since, workouts: categories.contains(.workouts) ? workouts : [],
             daily: daily.map { $0.filtered(to: categories) }.filter(\.hasData))
    }
}

enum AppleHealthImportRules {
    static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    static func day(_ date: Date) -> String { dayFormatter.string(from: date) }
    static func valid(_ value: Double?, in range: ClosedRange<Double>) -> Double? {
        guard let value, value.isFinite, range.contains(value) else { return nil }
        return value
    }
    static func isFWBWorkout(bundleIdentifier: String, syncIdentifier: String?) -> Bool {
        bundleIdentifier.lowercased().hasPrefix("com.benjaminbenz.fwbcoach")
            || (syncIdentifier?.hasPrefix("com.benjaminbenz.fwbcoach.") ?? false)
    }
    /// Sum the union, not individual samples: Watch and phone sleep sources can overlap.
    static func minutesInUnion(_ intervals: [DateInterval], clippedTo window: DateInterval) -> Double? {
        let clipped = intervals.compactMap { interval -> DateInterval? in
            let start = max(interval.start, window.start), end = min(interval.end, window.end)
            return end > start ? DateInterval(start: start, end: end) : nil
        }.sorted { $0.start < $1.start }
        guard var current = clipped.first else { return nil }
        var seconds: TimeInterval = 0
        for interval in clipped.dropFirst() {
            if interval.start <= current.end {
                current = DateInterval(start: current.start, end: max(current.end, interval.end))
            } else { seconds += current.duration; current = interval }
        }
        return (seconds + current.duration) / 60
    }
}
