import Foundation

enum FWBSystemConstants {
    static let appGroup = "group.com.benjaminbenz.fwbcoach"
    static let widgetKind = "FWBTodayWorkout"
    static let widgetSnapshotKey = "fwb.widget.workout.v1"
    static let widgetEnabledKey = "fwb.widget.workout.enabled"
}

/// Only explicitly opted-in assignment information is shared with WidgetKit.
/// No account identifiers, health measurements, or training history enter this file.
struct FWBWidgetWorkoutSnapshot: Codable, Equatable {
    var title: String?
    var scheduledDate: Date?
    var updatedAt: Date

    func titleForToday(now: Date = Date(), calendar: Calendar = .current) -> String? {
        guard let title = title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty,
              let scheduledDate, calendar.isDate(scheduledDate, inSameDayAs: now),
              updatedAt <= now.addingTimeInterval(60),
              now.timeIntervalSince(updatedAt) < 86_400 else { return nil }
        return String(title.prefix(100))
    }
}

enum FWBSystemRoute: Codable, Equatable {
    case workouts
    case startRestTimer(seconds: Int)

    static func parse(_ url: URL) -> FWBSystemRoute? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == "fwb", parts.user == nil, parts.password == nil,
              parts.port == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/" else { return nil }
        switch parts.host?.lowercased() {
        case "workouts":
            guard parts.queryItems?.isEmpty != false else { return nil }
            return .workouts
        case "rest-timer":
            let values = parts.queryItems ?? []
            guard values.count == 1, values[0].name == "seconds",
                  let raw = values[0].value, let seconds = Int(raw), (1...3_600).contains(seconds) else { return nil }
            return .startRestTimer(seconds: seconds)
        default: return nil
        }
    }

    var url: URL {
        switch self {
        case .workouts: return URL(string: "fwb://workouts")!
        case .startRestTimer(let seconds): return URL(string: "fwb://rest-timer?seconds=\(seconds)")!
        }
    }
}

enum FWBRestActivityPhase: String, Codable, Hashable {
    case idle, running, paused, complete
}

#if canImport(ActivityKit) && os(iOS)
import ActivityKit

struct FWBRestActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var phase: FWBRestActivityPhase
        var deadline: Date?
        var pausedRemaining: Int
        var updatedAt: Date
        var exerciseName: String? = nil

        var hasExpired: Bool {
            phase == .running && (deadline.map { $0 <= Date() } ?? true)
        }
    }

    var sessionID: UUID
}
#endif
