import SwiftUI

/// The draft edits only the selected fields. Existing workout/exercise metadata
/// remains in the JSON passed to the same save endpoint used by the coach website.
struct CoachProgramEditingDraft: Equatable {
    private let originalProgram: CoachClientProgram
    var raw: CoachJSONObject
    var workouts: [CoachWorkoutEditingDraft]

    init(program: CoachClientProgram) {
        originalProgram = program
        raw = program.raw
        workouts = program.raw.array("workouts").map(CoachWorkoutEditingDraft.init)
    }

    var program: CoachClientProgram {
        var result = raw
        let updated = workouts.filter(\.isIncluded).map(\.value)
        if updated != raw.array("workouts") { result["workouts"] = .array(updated) }
        var program = originalProgram
        program.raw = result
        return program
    }

    var validationMessage: String? {
        if raw.string("program_title").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Add a program title."
        }
        let included = workouts.filter(\.isIncluded)
        if included.count > 7 { return "Include up to seven workouts in this program." }
        for (index, workout) in included.enumerated() {
            if workout.raw.string("title").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return "Add a title for workout \(index + 1)."
            }
            var codes = Set<String>()
            for exercise in workout.exercises {
                if let message = exercise.progressionValidationMessage { return message }
                if exercise.raw.string("name").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    return "Name each exercise in \(workout.raw.string("title"))."
                }
                let code = exercise.raw.string("code").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                if code.isEmpty { return "Add an exercise code in \(workout.raw.string("title"))." }
                if !codes.insert(code).inserted { return "Use a different code for each exercise in \(workout.raw.string("title"))." }
            }
        }
        return nil
    }
}

struct CoachWorkoutEditingDraft: Identifiable, Equatable {
    let id = UUID()
    private let original: CoachJSON
    var raw: CoachJSONObject
    var isIncluded = true
    var exercises: [CoachExerciseEditingDraft]

    init(_ value: CoachJSON) {
        original = value
        raw = value.objectValue
        exercises = value.objectValue.array("exercises").map(CoachExerciseEditingDraft.init)
    }

    init(number: Int) {
        self.init(.object([
            "id": .string(UUID().uuidString), "title": .string("Workout \(number)"),
            "focus": .string(""), "format": .string("single"), "exercises": .array([])
        ]))
    }

    var value: CoachJSON {
        var result = raw
        let updated = exercises.map(\.value)
        if updated != raw.array("exercises") { result["exercises"] = .array(updated) }
        if result == original.objectValue { return original }
        return .object(result)
    }

    var nextExerciseCode: String {
        let existing = Set(exercises.map { $0.raw.string("code").trimmingCharacters(in: .whitespacesAndNewlines).uppercased() })
        var number = 1
        while existing.contains("A\(number)") { number += 1 }
        return "A\(number)"
    }
}

struct CoachExerciseEditingDraft: Identifiable, Equatable {
    let id = UUID()
    private let original: CoachJSON
    var raw: CoachJSONObject

    init(_ value: CoachJSON) {
        original = value
        raw = value.objectValue
    }

    init(code: String, libraryEntry: CoachJSONObject? = nil) {
        var fields: CoachJSONObject = ["code": .string(code), "name": .string("")]
        if let entry = libraryEntry {
            fields["name"] = .string(entry.string("name"))
            fields["prescription"] = .string("\(entry.string("default_reps")) x \(max(1, entry.int("default_sets"))) sets")
            fields["rest"] = .string("\(entry.int("default_rest_seconds")) sec")
            fields["video"] = .string(entry.string("demo_url"))
            fields["muscles"] = .string(entry.string("primary_muscle").replacingOccurrences(of: "_", with: " "))
            fields["instructions"] = .array(entry.string("instructions").components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.map(CoachJSON.string))
        }
        self.init(.object(fields))
    }

    var value: CoachJSON {
        var result = raw
        if let config = storedProgression,
           config.exerciseKey != WorkoutProgression.exerciseKey(raw.string("name")) {
            result["progression"] = .null
        }
        return result == original.objectValue ? original : .object(result)
    }

    private var storedProgression: WorkoutProgressionConfig? {
        guard let value = raw["progression"], let data = try? JSONEncoder().encode(value) else { return nil }
        return try? JSONDecoder().decode(WorkoutProgressionConfig.self, from: data)
    }

    var progression: WorkoutProgressionConfig {
        get {
            let name = raw.string("name")
            if let stored = storedProgression, stored.exerciseKey == WorkoutProgression.exerciseKey(name) { return stored }
            let exercise = Exercise(code: raw.string("code"), name: name, prescription: raw.string("prescription"))
            return WorkoutProgression.defaultConfig(for: exercise, plannedSets: nil)
                ?? WorkoutProgressionConfig(enabled: false, exerciseKey: WorkoutProgression.exerciseKey(name),
                    repMin: 8, repMax: 12, plannedSets: 3, targetRIR: 2, increment: 2.5, unit: "lb", requiredSessions: 2)
        }
        set {
            var config = newValue
            config.exerciseKey = WorkoutProgression.exerciseKey(raw.string("name"))
            raw["progression"] = WorkoutProgressionIntegration.json(config)
            if config.enabled {
                raw["prescription"] = .string("\(config.plannedSets) × \(config.repMin)–\(config.repMax)")
            }
        }
    }

    var prescription: String {
        get { raw.string("prescription") }
        set {
            let previous = Exercise(code: raw.string("code"), name: raw.string("name"),
                prescription: raw.string("prescription"), progression: storedProgression)
            let updated = WorkoutProgressionIntegration.revisedConfig(from: previous,
                name: previous.name, prescription: newValue)
            raw["prescription"] = .string(newValue)
            // A TextField emits partially typed ranges. Do not disable a configured
            // plan while the coach is still entering it; validation blocks ambiguous saves.
            if storedProgression != nil,
               WorkoutProgression.defaultConfig(name: previous.name, prescription: newValue, plannedSets: nil) != nil {
                raw["progression"] = WorkoutProgressionIntegration.json(updated)
            }
        }
    }

    var progressionValidationMessage: String? {
        guard let config = storedProgression, config.enabled else { return nil }
        guard WorkoutProgression.defaultConfig(name: raw.string("name"), prescription: raw.string("prescription"), plannedSets: nil) != nil else {
            return "Add a clear sets-and-reps prescription, or turn off suggested targets."
        }
        return WorkoutProgression.normalizedConfig(config) == nil ? "Check the progression rep range, sets, RIR, and weight increment." : nil
    }

    var instructionText: String {
        get {
            for key in ["instructions", "instruction", "howTo", "how_to", "cues"] {
                guard let value = raw[key] else { continue }
                if case .array(let steps) = value { return steps.map(\.stringValue).joined(separator: "\n") }
                if case .string(let text) = value { return text }
            }
            return ""
        }
        set {
            raw["instructions"] = .array(newValue.components(separatedBy: .newlines).map(CoachJSON.string))
        }
    }

    var video: String {
        get {
            ["video", "videoUrl", "video_url", "youtube_url"].map { raw.string($0) }.first { !$0.isEmpty } ?? ""
        }
        set { raw["video"] = .string(newValue) }
    }
}

struct CoachProgramEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: CoachWorkspaceStore
    @State private var draft: CoachProgramEditingDraft
    private let original: CoachClientProgram
    private let onSaved: ((CoachClientProgram) -> Void)?
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showingDiscardConfirmation = false

    init(store: CoachWorkspaceStore, program: CoachClientProgram, onSaved: ((CoachClientProgram) -> Void)? = nil) {
        self.store = store
        original = program
        self.onSaved = onSaved
        _draft = State(initialValue: CoachProgramEditingDraft(program: program))
    }

    private var hasChanges: Bool { !original.isPersisted || draft.program.raw != original.raw }

    var body: some View {
        Form {
            Section {
                LabeledContent("Client", value: original.name)
                TextField("Program title", text: text("program_title"))
                    .accessibilityIdentifier("coach.program.title")
                TextField("Program summary", text: text("program_summary"), axis: .vertical)
                    .lineLimit(3...7)
                Toggle("Active program", isOn: activeProgram)
            } header: {
                Text("Program")
            } footer: {
                Text("Saving an active program makes it the client's current training block.")
            }

            Section("Goals & focus") {
                TextField("Fitness goal", text: text("fitness_goal"), axis: .vertical)
                TextField("Focus target", text: text("focus_target"), axis: .vertical)
                TextField("Coach note title", text: text("coach_note_title"))
                TextField("Coach note", text: text("coach_note_body"), axis: .vertical)
                    .lineLimit(3...8)
            }

            Section {
                ForEach($draft.workouts) { $workout in
                    NavigationLink {
                        CoachWorkoutEditor(workout: $workout, library: store.library)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(workout.raw.string("title").isEmpty ? "Untitled workout" : workout.raw.string("title"))
                                .foregroundStyle(workout.isIncluded ? Color.primary : Color.secondary)
                            Text(workout.isIncluded ? "\(workout.exercises.count) exercises" : "Excluded from this program")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { draft.workouts.remove(atOffsets: $0) }
                .onMove { draft.workouts.move(fromOffsets: $0, toOffset: $1) }

                Button {
                    draft.workouts.append(CoachWorkoutEditingDraft(number: draft.workouts.count + 1))
                } label: {
                    Label("Add workout", systemImage: "plus.circle")
                }
                .disabled(draft.workouts.count >= 7)
                .accessibilityIdentifier("coach.program.add-workout")
            } header: {
                Text("Workouts · \(draft.workouts.filter(\.isIncluded).count) included")
            } footer: {
                Text("Include up to seven workouts. Open a workout to edit its exercises or exclude it. Use Edit to reorder or remove workouts.")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(Color.fwbRed)
                        .accessibilityIdentifier("coach.program.error")
                }
            }
        }
        .disabled(isSaving)
        .scrollContentBackground(.hidden)
        .background(Color.fwbBackground)
        .navigationTitle(original.isPersisted ? "Edit program" : "New program")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") {
                    if hasChanges { showingDiscardConfirmation = true } else { dismiss() }
                }.disabled(isSaving)
            }
            ToolbarItemGroup(placement: .primaryAction) {
                EditButton().disabled(isSaving)
                Button {
                    Task { await save() }
                } label: {
                    if isSaving { ProgressView() } else { Text("Save").bold() }
                }
                .disabled(isSaving || !hasChanges)
                .accessibilityIdentifier("coach.program.save")
            }
        }
        .confirmationDialog("Discard unsaved changes?", isPresented: $showingDiscardConfirmation, titleVisibility: .visible) {
            Button("Discard changes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        }
        .navigationBarBackButtonHidden(true)
        .interactiveDismissDisabled(hasChanges || isSaving)
    }


    private func text(_ key: String) -> Binding<String> {
        Binding(get: { draft.raw.string(key) }, set: { draft.raw[key] = .string($0) })
    }

    private var activeProgram: Binding<Bool> {
        Binding(get: { draft.raw.bool("active", default: true) }, set: { draft.raw["active"] = .bool($0) })
    }

    @MainActor
    private func save() async {
        guard !isSaving else { return }
        if let validation = draft.validationMessage {
            errorMessage = validation
            return
        }
        isSaving = true
        errorMessage = nil
        do {
            let saved = try await store.saveProgram(draft.program)
            onSaved?(saved)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}

private struct CoachWorkoutEditor: View {
    @Binding var workout: CoachWorkoutEditingDraft
    let library: [CoachJSONObject]
    @State private var showingLibrary = false

    private let formats = [("single", "Straight sets"), ("superset", "Superset"), ("circuit", "Circuit"), ("mobility", "Mobility"), ("custom", "Custom")]

    var body: some View {
        Form {
            Section("Workout") {
                Toggle("Include in program", isOn: $workout.isIncluded)
                TextField("Workout title", text: text("title"))
                TextField("Training focus", text: text("focus"), axis: .vertical)
                Picker("Format", selection: text("format")) {
                    ForEach(formats, id: \.0) { value, title in Text(title).tag(value) }
                    if !formats.contains(where: { $0.0 == workout.raw.string("format") }) {
                        Text(workout.raw.string("format").isEmpty ? "Unspecified" : workout.raw.string("format").capitalized)
                            .tag(workout.raw.string("format"))
                    }
                }
            }

            Section {
                ForEach($workout.exercises) { $exercise in
                    NavigationLink {
                        CoachExerciseEditor(exercise: $exercise)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(exercise.raw.string("name").isEmpty ? "New exercise" : exercise.raw.string("name"))
                            Text([exercise.raw.string("code"), exercise.raw.string("prescription"), exercise.raw.string("rest")]
                                .filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { workout.exercises.remove(atOffsets: $0) }
                .onMove { workout.exercises.move(fromOffsets: $0, toOffset: $1) }

                Button {
                    workout.exercises.append(CoachExerciseEditingDraft(code: workout.nextExerciseCode))
                } label: { Label("Add exercise", systemImage: "plus.circle") }

                Button {
                    showingLibrary = true
                } label: { Label("Choose from exercise library", systemImage: "books.vertical") }
                .disabled(library.isEmpty)
            } header: {
                Text("Exercises")
            } footer: {
                Text("Open an exercise to edit its target, rest, demonstration, and instructions. Use Edit to reorder or remove exercises.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.fwbBackground)
        .navigationTitle("Workout")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { EditButton() }
        .sheet(isPresented: $showingLibrary) {
            CoachProgramLibraryPicker(library: library) { entry in
                workout.exercises.append(CoachExerciseEditingDraft(code: workout.nextExerciseCode, libraryEntry: entry))
            }
        }
    }

    private func text(_ key: String) -> Binding<String> {
        Binding(get: { workout.raw.string(key) }, set: { workout.raw[key] = .string($0) })
    }
}

private struct CoachExerciseEditor: View {
    @Binding var exercise: CoachExerciseEditingDraft

    var body: some View {
        Form {
            Section("Exercise") {
                TextField("Exercise name", text: text("name"))
                TextField("Code (A1, A2, B1…)", text: text("code"))
                    .textInputAutocapitalization(.characters)
                TextField("Muscles", text: text("muscles"))
            }
            Section("Prescription") {
                TextField("Target (8–12 reps x 3 sets)", text: $exercise.prescription, axis: .vertical)
                TextField("Rest (60 sec)", text: text("rest"))
            }
            Section {
                Toggle("Suggested targets", isOn: progression(\.enabled))
                if exercise.progression.enabled {
                    Stepper("Minimum reps: \(exercise.progression.repMin)", value: progression(\.repMin), in: 1...50)
                    Stepper("Maximum reps: \(exercise.progression.repMax)", value: progression(\.repMax), in: 1...50)
                    Stepper("Working sets: \(exercise.progression.plannedSets)", value: progression(\.plannedSets), in: 1...12)
                    Stepper("Target RIR: \(WorkoutProgressionIntegration.number(exercise.progression.targetRIR))", value: progression(\.targetRIR), in: 0...5, step: 0.5)
                    LabeledContent("Weight increase (\(exercise.progression.unit))") {
                        TextField("Increment", value: progression(\.increment), format: .number)
                            .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .accessibilityIdentifier("coach.exercise.progression.increment")
                    }
                    Stepper("Successful sessions: \(exercise.progression.requiredSessions)", value: progression(\.requiredSessions), in: 2...5)
                    if let message = exercise.progressionValidationMessage {
                        Text(message).foregroundStyle(.red).font(.footnote)
                    }
                }
            } header: { Text("Progressive overload") } footer: {
                Text("Build reps within this range before suggesting a weight increase. Targets remain editable and only completed comparable sessions count. Equipment must support the chosen increment.")
            }
            Section {
                TextField("YouTube or uploaded video URL", text: $exercise.video, axis: .vertical)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
            } header: { Text("Demonstration") }
            Section {
                TextField("Add a coaching cue on each line", text: $exercise.instructionText, axis: .vertical)
                    .lineLimit(5...12)
            } header: { Text("Instructions") }
        }
        .scrollContentBackground(.hidden)
        .background(Color.fwbBackground)
        .navigationTitle("Exercise")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func progression<Value>(_ keyPath: WritableKeyPath<WorkoutProgressionConfig, Value>) -> Binding<Value> {
        Binding(get: { exercise.progression[keyPath: keyPath] }, set: { value in
            var config = exercise.progression
            config[keyPath: keyPath] = value
            exercise.progression = config
        })
    }

    private func text(_ key: String) -> Binding<String> {
        Binding(get: { exercise.raw.string(key) }, set: { exercise.raw[key] = .string($0) })
    }
}

private struct CoachProgramLibraryPicker: View {
    @Environment(\.dismiss) private var dismiss
    let library: [CoachJSONObject]
    let onSelect: (CoachJSONObject) -> Void
    @State private var search = ""

    private var matches: [CoachJSONObject] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return library.filter { row in
            row.bool("is_active", default: true) && (query.isEmpty || row.string("name").localizedCaseInsensitiveContains(query))
        }
    }

    var body: some View {
        NavigationStack {
            List(Array(matches.enumerated()), id: \.offset) { _, row in
                Button {
                    onSelect(row)
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.string("name")).foregroundStyle(.primary)
                        Text([row.string("primary_muscle"), row.string("equipment")]
                            .filter { !$0.isEmpty }.joined(separator: " · ").replacingOccurrences(of: "_", with: " "))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .searchable(text: $search, prompt: "Search exercises")
            .overlay {
                if matches.isEmpty { Text("No matching exercises").foregroundStyle(.secondary) }
            }
            .navigationTitle("Exercise library")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}
