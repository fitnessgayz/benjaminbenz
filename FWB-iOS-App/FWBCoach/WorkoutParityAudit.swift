#if DEBUG
import SwiftUI

/// A simulator entry point for exercising the production logger with local
/// fixtures. WorkoutLoggingView owns the preview-mode side-effect boundary.
struct WorkoutParityAuditRootView: View {
    @State private var selection = WorkoutParityAuditScenario.launchSelection

    var body: some View {
        VStack(spacing: 0) {
            Picker("Workout preview", selection: $selection) {
                ForEach(WorkoutParityAuditScenario.allCases) { scenario in
                    Text(scenario.title).tag(scenario)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .accessibilityIdentifier("workout.parityAudit.scenario")

            WorkoutLoggingView(
                workout: selection.workout,
                clientEmail: "parity.preview@example.invalid",
                embedded: true,
                previewMode: true,
                previewFormat: selection.format
            ) {
                EmptyView()
            }
            .id(selection)
        }
        .frame(maxWidth: ProcessInfo.processInfo.arguments.contains("--parity-narrow") ? 320 : .infinity)
        .background(Color.fwbBackground)
        .preferredColorScheme(.light)
        .dynamicTypeSize(ProcessInfo.processInfo.arguments.contains("--parity-large-text") ? .accessibility3 : .large)
    }
}

private enum WorkoutParityAuditScenario: String, CaseIterable, Identifiable {
    case straight, superset, circuit, assigned, overflow

    var id: String { rawValue }

    static var launchSelection: Self {
        let arguments = ProcessInfo.processInfo.arguments
        if let marker = arguments.firstIndex(of: "--parity-scenario"),
           arguments.indices.contains(marker + 1),
           let scenario = Self(rawValue: arguments[marker + 1]) {
            return scenario
        }
        return allCases.first { arguments.contains("--parity-\($0.rawValue)") } ?? .straight
    }

    var title: String {
        switch self {
        case .straight: "Straight"
        case .superset: "Superset"
        case .circuit: "Circuit"
        case .assigned: "Assigned"
        case .overflow: "Long text"
        }
    }

    var format: CustomWorkoutFormat? {
        switch self {
        case .straight: .single
        case .superset: .superset
        case .circuit: .circuit
        case .assigned, .overflow: nil
        }
    }

    var workout: Workout {
        switch self {
        case .straight:
            Workout(
                id: UUID(uuidString: "38DCE5B9-DC5B-4430-AB0B-52531F312101")!,
                title: "Custom Workout", format: "custom",
                exercises: [
                    exercise("CW1", "Dumbbell Shoulder Press", sets: 3, reps: "8–10"),
                    exercise("CW2", "Heel-Elevated Goblet Squat", sets: 3, reps: "10–12")
                ]
            )
        case .superset:
            Workout(
                id: UUID(uuidString: "38DCE5B9-DC5B-4430-AB0B-52531F312102")!,
                title: "Custom Workout", format: "custom",
                exercises: [
                    exercise("A1", "Dumbbell Shoulder Press", sets: 3, reps: "8–10"),
                    exercise("A2", "Heel-Elevated Goblet Squat", sets: 3, reps: "10–12"),
                    exercise("B1", "One-Arm Dumbbell Row", sets: 3, reps: "10/side"),
                    exercise("B2", "Dumbbell Romanian Deadlift", sets: 3, reps: "10")
                ]
            )
        case .circuit:
            Workout(
                id: UUID(uuidString: "38DCE5B9-DC5B-4430-AB0B-52531F312103")!,
                title: "Custom Workout", format: "custom",
                exercises: [
                    exercise("C1", "Goblet Squat", sets: 3, reps: "10"),
                    exercise("C2", "Push-Up", sets: 3, reps: "8–12"),
                    exercise("C3", "One-Arm Dumbbell Row", sets: 3, reps: "10/side")
                ]
            )
        case .overflow:
            Workout(
                id: UUID(uuidString: "38DCE5B9-DC5B-4430-AB0B-52531F312105")!,
                title: "Recovery mobility", focus: "Long exercise text", format: "straight",
                exercises: [
                    Exercise(
                        code: "A1", name: "Supine Figure-Four Stretch with a Comfortable Range of Motion",
                        prescription: "2 × 20–30 seconds per side, moving slowly and keeping the crossed knee relaxed",
                        rest: "20–30 seconds, then repeat on the other side",
                        instructions: [
                            "Lie on your back with knees bent. Rest one ankle above the other knee, then gently bring the support leg toward your chest if comfortable. Keep the crossed knee relaxed and repeat on both sides.",
                            "Breathe slowly throughout the stretch. Use only a small range that feels easy and stop if you feel pain."
                        ],
                        video: "https://example.com/exercise-demo"
                    ),
                    Exercise(
                        code: "B1", name: "Shoulder Circles", prescription: "2 × 8–10 reps",
                        instructions: ["Stand or sit comfortably. Make slow, relaxed shoulder circles using a small range that feels easy. Change direction partway through."]
                    )
                ]
            )
        case .assigned:
            Workout(
                id: UUID(uuidString: "38DCE5B9-DC5B-4430-AB0B-52531F312104")!,
                title: "Full Body Strength", focus: "Coach assigned", format: "superset",
                exercises: [
                    exercise("A1", "Dumbbell Shoulder Press", sets: 4, reps: "8–10"),
                    exercise("A2", "Heel-Elevated Goblet Squat", sets: 3, reps: "10–12"),
                    exercise("B1", "One-Arm Dumbbell Row", sets: 2, reps: "10/side"),
                    exercise("B2", "Dumbbell Romanian Deadlift", sets: 3, reps: "10")
                ]
            )
        }
    }

    private func exercise(_ code: String, _ name: String, sets: Int, reps: String) -> Exercise {
        Exercise(
            code: code, name: name, prescription: "\(sets) × \(reps)",
            rest: "60 sec", instructions: ["Use a controlled tempo and a comfortable range of motion."]
        )
    }
}

/// Saved-set fixtures for exercising PR and history controls without contacting
/// a backend. Each PR's weight and repetitions belong to one actual record.
enum WorkoutParityAuditData {
    static let history: [WorkoutHistorySession] = {
        let exercises: [(code: String, name: String, weight: Double)] = [
            ("A1", "Dumbbell Shoulder Press", 30),
            ("A2", "Heel-Elevated Goblet Squat", 50),
            ("B1", "One-Arm Dumbbell Row", 40),
            ("B2", "Dumbbell Romanian Deadlift", 70),
            ("C1", "Goblet Squat", 45),
            ("C2", "Push-Up", 0)
        ]
        return ["2026-09-17", "2026-09-24"].enumerated().map { index, date in
            let sessionID = UUID(uuidString: index == 0
                ? "5790D933-934C-487C-96A9-2DB35C2BFD01"
                : "5790D933-934C-487C-96A9-2DB35C2BFD02")!
            let records = exercises.enumerated().flatMap { exerciseIndex, exercise in
                (1...2).map { set in
                    WorkoutHistoryRecord(
                        sessionID: sessionID, entryDate: date, workoutTitle: "Preview full body workout",
                        exerciseCode: exercise.code, exerciseName: exercise.name,
                        exerciseOrder: exerciseIndex + 1, setNumber: set,
                        weightUsed: exercise.weight == 0 ? 0 : exercise.weight + Double(index * 5),
                        reps: exercise.weight == 0 ? Double(10 + index * 2) : Double(index == 0 ? 12 : 8),
                        notes: "Preview history", effortScale: .rir, effortValue: 2, setType: .working
                    )
                }
            }
            return WorkoutHistorySession(entryDate: date, workoutTitle: "Preview full body workout", records: records)
        }
    }()
}

/// Keeps simulator previews from replacing or cancelling a real rest alert.
@MainActor
final class WorkoutParityPreviewNotifications: RestTimerNotificationScheduling {
    func replace(with plan: RestTimerNotificationPlan) { }
    func cancel(ownerID: UUID) { }
}
#endif
