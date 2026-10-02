import SwiftUI

struct WorkoutProgressionSettings: View {
    @Environment(\.dismiss) private var dismiss
    let exercise: Exercise
    let onSave: (WorkoutProgressionConfig) -> Void
    @State private var config: WorkoutProgressionConfig

    init(exercise: Exercise, plannedSets: Int, onSave: @escaping (WorkoutProgressionConfig) -> Void) {
        self.exercise = exercise
        self.onSave = onSave
        _config = State(initialValue: WorkoutProgression.defaultConfig(for: exercise, plannedSets: plannedSets)
            ?? WorkoutProgressionConfig(enabled: true, exerciseKey: WorkoutProgression.exerciseKey(exercise.name),
                repMin: 8, repMax: 12, plannedSets: max(1, plannedSets), targetRIR: 2,
                increment: 2.5, unit: "lb", requiredSessions: 2))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(exercise.name).font(.headline)
                    Toggle("Suggested targets", isOn: $config.enabled)
                    Stepper("Minimum reps: \(config.repMin)", value: $config.repMin, in: 1...50)
                    Stepper("Maximum reps: \(config.repMax)", value: $config.repMax, in: 1...50)
                    Stepper("Target RIR: \(WorkoutProgressionIntegration.number(config.targetRIR))",
                            value: $config.targetRIR, in: 0...5, step: 0.5)
                    LabeledContent("Weight increase (lb)") {
                        TextField("Increment", value: $config.increment, format: .number)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                    }
                } footer: {
                    Text("Use an increase your equipment supports. Targets use pounds, and only completed normal working sets count. This session's plan is fixed when you start, log a set, or use suggested targets.")
                }
                if config.repMax < config.repMin {
                    Text("Maximum reps must be at least the minimum.").foregroundStyle(.red)
                }
            }
            .navigationTitle("Progression targets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        config.unit = "lb"
                        onSave(config)
                        dismiss()
                    }
                    .disabled(WorkoutProgression.normalizedConfig(config) == nil)
                }
            }
        }
    }
}
