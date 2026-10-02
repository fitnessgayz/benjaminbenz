#if DEBUG
import Foundation

enum WorkoutProgressionAudit {
    static func history(exercises: [Exercise], now: Date = Date()) -> [WorkoutHistorySession] {
        let day = DateFormatter()
        day.locale = Locale(identifier: "en_US_POSIX")
        day.dateFormat = "yyyy-MM-dd"
        return [2, 5].map { (days: Int) in
            let date = now.addingTimeInterval(-Double(days) * 86_400)
            let entryDate = day.string(from: date)
            let sessionID = ContinuitySync.stableUUID(namespace: "progression-preview", name: String(days))
            let records = exercises.flatMap { exercise -> [WorkoutHistoryRecord] in
                guard let config = WorkoutProgression.defaultConfig(for: exercise, plannedSets: nil) else { return [] }
                return (1...config.plannedSets).map { set in
                    WorkoutHistoryRecord(sessionID: sessionID, setID: UUID(), entryDate: entryDate,
                        workoutTitle: "Progression preview", exerciseCode: exercise.code,
                        exerciseName: exercise.name, setNumber: set, weightUsed: 30,
                        reps: Double(config.repMax), notes: nil, completedAt: date,
                        effortScale: .rir, effortValue: 2, setType: .working, progressionTarget: config)
                }
            }
            return WorkoutHistorySession(entryDate: entryDate, workoutTitle: "Progression preview", records: records)
        }
    }
}
#endif
