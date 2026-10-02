#if DEBUG
import SwiftUI

struct ClientAchievementAuditView: View {
    private var snapshot: AchievementSnapshot {
        ClientAchievementEngine.evaluate(records: ProcessInfo.processInfo.arguments.contains("--achievements-empty") ? [] : Self.records + Self.activityRecords, today: "2026-09-25")
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                ClientAchievementsSection(snapshot: snapshot).padding(16)
            }
            .background(Color.fwbBackground)
            .navigationTitle("Progress")
            .navigationBarTitleDisplayMode(.inline)
        }
        .tint(Color.fwbLime)
        .preferredColorScheme(.light)
        .dynamicTypeSize(ProcessInfo.processInfo.arguments.contains("--achievements-large-text") ? .accessibility3 : .large)
    }

    static let activityRecords: [WorkoutHistoryRecord] = [
        ("Full body recovery", "Hip flexor stretch", "M1", "2026-09-20"),
        ("Yoga", "Vinyasa yoga", "YOGA", "2026-09-21"),
        ("Cardio", "Running", "CARDIO", "2026-09-22")
    ].map { title, name, code, day in
        WorkoutHistoryRecord(
            sessionID: ContinuitySync.stableUUID(namespace: "achievement-audit-activity", name: code),
            setID: ContinuitySync.stableUUID(namespace: "achievement-audit-activity-set", name: code),
            entryDate: day, workoutTitle: title, exerciseCode: code, exerciseName: name,
            setNumber: 1, weightUsed: 0, reps: nil, notes: nil,
            completedAt: ISO8601DateFormatter().date(from: "\(day)T12:00:00Z"),
            setType: .timed, durationSeconds: 600)
    }

    static let records: [WorkoutHistoryRecord] = (0..<12).map { index in
        let day = 3 + (index / 2) * 7 + (index % 2) * 2
        let date = Calendar(identifier: .gregorian).date(byAdding: .day, value: day - 1,
            to: ISO8601DateFormatter().date(from: "2026-08-01T12:00:00Z")!)!
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return WorkoutHistoryRecord(
            sessionID: ContinuitySync.stableUUID(namespace: "achievement-audit-session", name: "\(index)"),
            setID: ContinuitySync.stableUUID(namespace: "achievement-audit-set", name: "\(index)"),
            entryDate: formatter.string(from: date), workoutTitle: "Full body strength",
            exerciseCode: "ROW", exerciseName: "Dumbbell row", setNumber: 1,
            weightUsed: Double(20 + index * 2), reps: 10, notes: nil, completedAt: date, setType: .working)
    }
}
#endif
