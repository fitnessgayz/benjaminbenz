#if DEBUG
import SwiftUI

/// Renders the production workout chooser from an in-memory program, without signing in.
struct WorkoutOptionsAuditRootView: View {
    private static let program: ClientProgram = {
        let base = ClientProgram.preview
        return ClientProgram(
            id: base.id, clientEmail: base.clientEmail, clientName: base.clientName, initials: base.initials,
            programTitle: "Weekly Superset Strength + Pickleball Mobility", programSummary: base.programSummary,
            sessionCountUsed: base.sessionCountUsed, sessionCountTotal: base.sessionCountTotal,
            fitnessGoal: base.fitnessGoal, focusTarget: base.focusTarget,
            coachNoteTitle: base.coachNoteTitle, coachNoteBody: base.coachNoteBody, nutritionPlan: base.nutritionPlan,
            workouts: (1...7).map { index in
                Workout(title: "Workout \(index)", focus: "Strength", format: "single", exercises: base.workouts[0].exercises)
            }, updatedAt: nil, syncSource: nil, sourceVersion: nil
        )
    }()
    @StateObject private var store = ClientProgramStore(previewProgram: Self.program)

    var body: some View {
        NavigationStack {
            WorkoutLibraryView(store: store, clientEmail: ClientProgram.preview.clientEmail)
        }
        .preferredColorScheme(ProcessInfo.processInfo.arguments.contains("--workout-options-audit-dark") ? .dark : .light)
    }
}

/// Exercises the production generator and logger with local fixture data only.
struct WorkoutGeneratorAuditRootView: View {
    private var initialPreferences: WorkoutGenerationPreferences {
        let rawFocus = ProcessInfo.processInfo.arguments.first { $0.hasPrefix("--workout-generator-focus=") }?
            .split(separator: "=", maxSplits: 1).last.map(String.init)
        return WorkoutGenerationPreferences(focus: rawFocus.flatMap(WorkoutGenerationFocus.init(rawValue:)) ?? .fullBody)
    }

    var body: some View {
        NavigationStack {
            WorkoutGeneratorView(previewLibrary: Self.library, previewSavedLaunches: savedLaunches, initialPreferences: initialPreferences)
        }
        .preferredColorScheme(ProcessInfo.processInfo.arguments.contains("--workout-generator-dark") ? .dark : .light)
        .dynamicTypeSize(ProcessInfo.processInfo.arguments.contains("--workout-generator-large-text") ? .accessibility3 : .large)
    }

    private var savedLaunches: [GeneratedWorkoutLaunch] {
        guard ProcessInfo.processInfo.arguments.contains("--saved-workout-management-audit") else { return [] }
        return [WorkoutGenerationFocus.fullBody, .upperBody].compactMap { focus in
            guard let plan = try? WorkoutGenerator.generate(library: Self.library, history: [], preferences: .init(focus: focus), seed: 42) else { return nil }
            return GeneratedWorkoutLaunch(plan: plan, createdAt: Date(timeIntervalSince1970: 1_790_377_200),
                id: ContinuitySync.stableUUID(namespace: "saved-workout-management-audit", name: focus.rawValue))
        }
    }

    static let library: [ApprovedExercise] = [
        exercise("Dumbbell Floor Press", muscle: "chest", equipment: "dumbbell", movement: "horizontal_push"),
        exercise("Push-Up", muscle: "chest", equipment: "bodyweight", movement: "horizontal_push"),
        exercise("Dumbbell Row", muscle: "back", equipment: "dumbbell", movement: "horizontal_pull"),
        exercise("Cable Row", muscle: "back", equipment: "cable", movement: "horizontal_pull"),
        exercise("Goblet Squat", muscle: "quads", equipment: "dumbbell", movement: "squat"),
        exercise("Bodyweight Squat", muscle: "quads", equipment: "bodyweight", movement: "squat"),
        exercise("Dumbbell Romanian Deadlift", muscle: "hamstrings", equipment: "dumbbell", movement: "hinge"),
        exercise("Glute Bridge", muscle: "glutes", equipment: "bodyweight", movement: "hinge"),
        exercise("Dumbbell Shoulder Press", muscle: "shoulders", equipment: "dumbbell", movement: "vertical_push"),
        exercise("Dumbbell Curl", muscle: "biceps", equipment: "dumbbell", movement: "curl"),
        exercise("Cable Triceps Pushdown", muscle: "triceps", equipment: "cable", movement: "extension"),
        exercise("Plank", muscle: "core", equipment: "bodyweight", movement: "hold", reps: "30 sec"),
        exercise("Side Plank", muscle: "core", equipment: "bodyweight", movement: "hold", reps: "20 sec each"),
        recovery("Doorway Pec Stretch", muscle: "chest"),
        recovery("Cross-Body Shoulder Stretch", muscle: "shoulders"),
        recovery("Child’s Pose Lat Stretch", muscle: "lats"),
        recovery("Open Book Rotation", muscle: "back", reps: "6 each"),
        recovery("Cat-Cow", muscle: "back", reps: "8"),
        recovery("Seated Thoracic Rotation", muscle: "back", reps: "6 each"),
        recovery("Half-Kneeling Hip Flexor Stretch", muscle: "quads"),
        recovery("Supine Hamstring Stretch", muscle: "hamstrings"),
        recovery("Figure-Four Glute Stretch", muscle: "glutes"),
        recovery("Standing Calf Stretch", muscle: "calves"),
        recovery("90/90 Hip Switch", muscle: "glutes", reps: "6 each"),
        recovery("Adductor Rock-Back", muscle: "adductors", reps: "6 each")
    ]

    private static func recovery(_ name: String, muscle: String, reps: String = "30 sec each") -> ApprovedExercise {
        ApprovedExercise(
            id: ContinuitySync.stableUUID(namespace: "workout-generator-audit-recovery", name: name),
            name: name, aliases: [], primaryMuscle: muscle, secondaryMuscles: [],
            equipment: "bodyweight", difficulty: "beginner", movementPattern: "mobility",
            defaultSets: 2, defaultReps: reps, defaultRestSeconds: 20,
            substitutionGroup: muscle, demoURL: nil, instructions: "Move gently in a comfortable range."
        )
    }

    private static func exercise(_ name: String, muscle: String, equipment: String, movement: String, reps: String = "8-12") -> ApprovedExercise {
        ApprovedExercise(
            id: ContinuitySync.stableUUID(namespace: "workout-generator-audit", name: name),
            name: name, aliases: [], primaryMuscle: muscle, secondaryMuscles: [],
            equipment: equipment, difficulty: "beginner", movementPattern: movement,
            defaultSets: 3, defaultReps: reps, defaultRestSeconds: 60,
            substitutionGroup: muscle, demoURL: nil, instructions: "Move with control."
        )
    }
}
#endif
