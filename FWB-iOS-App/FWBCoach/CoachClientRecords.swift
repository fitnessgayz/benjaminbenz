import SwiftUI
import Charts
import SafariServices

enum CoachClientRecords {
    static let bodyKeys = ["bodyweight", "bodyfat", "lean_mass", "muscle_mass"]
    static let tapeKeys = ["chest", "waist", "hips", "arm", "thigh"]

    static func rows(_ rows: [CoachJSONObject], email: String) -> [CoachJSONObject] {
        let email = ContinuitySync.normalize(email: email)
        guard !email.isEmpty else { return [] }
        return rows.filter { ContinuitySync.normalize(email: $0.string("client_email")) == email }
    }

    static func measurements(_ row: CoachJSONObject) -> CoachJSONObject {
        var values = row.object("measurements")
        if values["arm"] == nil || values["arm"] == .null { values["arm"] = values["arms"] }
        if values["thigh"] == nil || values["thigh"] == .null { values["thigh"] = values["thighs"] }
        return values
    }

    /// Match the website: blank fields preserve the existing check-in for this
    /// client and date, including aliases and unrecognized measurement metadata.
    static func progressPayload(
        email: String, date: String, values: [String: String], note: String,
        existingRows: [CoachJSONObject]
    ) throws -> CoachJSONObject {
        let existing = rows(existingRows, email: email).first { $0.string("entry_date") == date } ?? [:]
        var tape = measurements(existing)
        var result: CoachJSONObject = [
            "client_email": .string(ContinuitySync.normalize(email: email)), "entry_date": .string(date)
        ]
        for key in bodyKeys + tapeKeys {
            let input = (values[key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let value: CoachJSON
            if input.isEmpty {
                value = (bodyKeys.contains(key) ? existing[key] : tape[key]) ?? .null
            } else {
                guard let number = Double(input), number.isFinite, number > 0,
                      key != "bodyfat" || number <= 100 else {
                    throw CoachWorkspaceError(message: "Enter a positive number for \(CoachDate.label(key))\(key == "bodyfat" ? " up to 100" : ""), or leave it blank to keep the saved value.")
                }
                value = .number(number)
            }
            if bodyKeys.contains(key) { result[key] = value } else { tape[key] = value }
        }
        let note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        result["goal_note"] = .string(note.isEmpty ? existing.string("goal_note") : note)
        result["measurements"] = .object(tape)
        return result
    }
}

struct CoachClientProgressView: View {
    let program: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    @State private var editor: CoachProgressDraft?
    @State private var document: CoachDocument?
    @State private var message = ""
    @State private var opening = false
    private var progress: [CoachJSONObject] { CoachClientRecords.rows(store.progress, email: program.email) }
    private var photos: [CoachJSONObject] { CoachClientRecords.rows(store.photos, email: program.email) }
    private var dexaReports: [CoachJSONObject] { CoachClientRecords.rows(store.dexaReports, email: program.email) }
    private var chartRows: [CoachJSONObject] { progress.filter { $0.double("bodyweight") != nil }.sorted { $0.string("entry_date") < $1.string("entry_date") } }

    var body: some View {
        List {
            Section { Button { editor = CoachProgressDraft(row: ["entry_date": .string(CoachDate.day(Date()))]) } label: { Label("Add measurements", systemImage: "plus") } }
            Section {
                NavigationLink { CoachSharedHealthView(program: program, previewMode: store.isPreview) } label: {
                    Label("Shared Apple Health", systemImage: "heart.text.clipboard")
                }
            }
            if chartRows.count > 1 {
                Section("Bodyweight · lb") {
                    Chart(Array(chartRows.enumerated()), id: \.offset) { _, row in
                        LineMark(x: .value("Date", row.string("entry_date")), y: .value("Weight", row.double("bodyweight") ?? 0)).foregroundStyle(Color.fwbLime)
                        PointMark(x: .value("Date", row.string("entry_date")), y: .value("Weight", row.double("bodyweight") ?? 0)).foregroundStyle(Color.fwbLime)
                    }.frame(height: 180).chartYScale(domain: .automatic(includesZero: false)).accessibilityLabel("Bodyweight history")
                }
            }
            Section("Measurements") {
                CoachDataStatus(store: store, resource: "client_progress", empty: progress.isEmpty, noun: "measurements", clientProgram: program)
                ForEach(Array(progress.enumerated()), id: \.offset) { _, row in
                    Button { editor = CoachProgressDraft(row: row) } label: {
                        VStack(alignment: .leading, spacing: 7) {
                            Text(row.string("entry_date")).font(.headline)
                            Text(measurementSummary(row)).font(.subheadline).foregroundStyle(.secondary)
                            if !row.string("goal_note").isEmpty { Text(row.string("goal_note")).font(.subheadline).foregroundStyle(.primary) }
                        }
                    }.tint(.primary)
                }
            }
            Section("Private progress photos") {
                CoachDataStatus(store: store, resource: "client_progress_photos", empty: photos.isEmpty, noun: "progress photos", clientProgram: program)
                ForEach(Array(photos.enumerated()), id: \.offset) { _, row in
                    Button { open(row, bucket: "progress-photos") } label: {
                        Label("\(row.string("captured_on")) · \(row.string("note").isEmpty ? "Progress photo" : row.string("note"))", systemImage: "photo")
                    }
                }
            }
            Section("Private DEXA reports") {
                CoachDataStatus(store: store, resource: "client_dexa_reports", empty: dexaReports.isEmpty, noun: "DEXA reports", clientProgram: program)
                ForEach(Array(dexaReports.enumerated()), id: \.offset) { _, row in
                    Button { open(row, bucket: "dexa-reports") } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Label(row.string("original_filename").isEmpty ? "DEXA report" : row.string("original_filename"), systemImage: "doc.richtext")
                            Text(row.string("extracted_scan_date").isEmpty ? String(row.string("created_at").prefix(10)) : row.string("extracted_scan_date")).font(.caption).foregroundStyle(.secondary)
                            Text(dexaSummary(row)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if opening { ProgressView("Opening private file…") }
            if !message.isEmpty { Text(message).foregroundStyle(.red) }
        }.navigationTitle("Progress").navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden).background(Color.fwbBackground)
            .sheet(item: $editor) { draft in NavigationStack { CoachProgressEditor(program: program, store: store, initial: draft.row) } }
            .sheet(item: $document) { item in CoachDocumentView(url: item.url).ignoresSafeArea() }
            .task(id: program.email) { await loadClient() }
            .refreshable { await loadClient() }
    }
    private func measurementSummary(_ row: CoachJSONObject) -> String {
        let metrics = [("bodyweight", "Weight", "lb"), ("bodyfat", "Body fat", "%"), ("lean_mass", "Lean mass", "lb"), ("muscle_mass", "Muscle", "lb")]
        var values = metrics.compactMap { key, label, unit -> String? in guard row.double(key) != nil else { return nil }; return "\(label) \(row.string(key)) \(unit)" }
        let tape = CoachClientRecords.measurements(row)
        values += ["chest", "waist", "hips", "arm", "thigh"].compactMap { key in guard tape.double(key) != nil else { return nil }; return "\(CoachDate.label(key)) \(tape.string(key)) in" }
        return values.isEmpty ? "No measurements entered" : values.joined(separator: " · ")
    }
    private func dexaSummary(_ row: CoachJSONObject) -> String {
        [("extracted_bodyweight_lb", "lb"), ("extracted_bodyfat_percent", "% body fat"), ("extracted_lean_mass_lb", "lb lean mass")].compactMap { key, unit -> String? in row.double(key) == nil ? nil : "\(row.string(key)) \(unit)" }.joined(separator: " · ")
    }
    private func open(_ row: CoachJSONObject, bucket: String) {
        guard !opening else { return }; opening = true; message = ""
        Task { @MainActor in defer { opening = false }; do { document = CoachDocument(url: try await store.signedURL(bucket: bucket, path: row.string("storage_path"))) } catch { message = error.localizedDescription } }
    }
    private func loadClient() async { store.selectProgram(program.id); await store.loadSelectedClient() }
}

private struct CoachProgressDraft: Identifiable { let id = UUID(); let row: CoachJSONObject }
private struct CoachDocument: Identifiable { let id = UUID(); let url: URL }
private struct CoachDocumentView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) { }
}

private struct CoachProgressEditor: View {
    let program: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    let initial: CoachJSONObject
    @State private var date: Date
    @State private var values: [String: String]
    @State private var note: String
    @State private var busy = false
    @State private var message = ""
    @Environment(\.dismiss) private var dismiss
    private static let bodyKeys = CoachClientRecords.bodyKeys
    private static let tapeKeys = CoachClientRecords.tapeKeys
    init(program: CoachClientProgram, store: CoachWorkspaceStore, initial: CoachJSONObject) {
        self.program = program; self.store = store; self.initial = initial
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        _date = State(initialValue: formatter.date(from: initial.string("entry_date")) ?? Date())
        var values: [String: String] = [:]
        for key in Self.bodyKeys { values[key] = initial.string(key) }
        for key in Self.tapeKeys { values[key] = CoachClientRecords.measurements(initial).string(key) }
        _values = State(initialValue: values); _note = State(initialValue: initial.string("goal_note"))
    }
    var body: some View {
        Form {
            Section { DatePicker("Date", selection: $date, displayedComponents: .date).disabled(initial["id"] != nil) }
            Section("Body composition") {
                metric("Weight · lb", "bodyweight"); metric("Body fat · %", "bodyfat"); metric("Lean mass · lb", "lean_mass"); metric("Muscle mass · lb", "muscle_mass")
            }
            Section("Tape measurements · inches") { ForEach(Self.tapeKeys, id: \.self) { key in metric(CoachDate.label(key), key) } }
            Section { TextEditor(text: $note).frame(minHeight: 120) } header: { Text("Goal note") } footer: { Text("Blank fields keep this date's saved measurements and note.") }
            if !message.isEmpty { Text(message).foregroundStyle(.red) }
        }.navigationTitle("Measurements").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) { Button(busy ? "Saving…" : "Save", action: save).disabled(busy) }
            }.disabled(busy)
    }
    private func metric(_ title: String, _ key: String) -> some View {
        HStack { Text(title); TextField("Not set", text: Binding(get: { values[key] ?? "" }, set: { values[key] = $0 })).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
    }
    private func save() {
        let row: CoachJSONObject
        do {
            row = try CoachClientRecords.progressPayload(email: program.email, date: CoachDate.day(date),
                values: values, note: note, existingRows: store.progress + [initial])
        } catch { message = error.localizedDescription; return }
        busy = true; message = ""
        Task { @MainActor in defer { busy = false }; do { _ = try await store.saveProgress(row); dismiss() } catch { message = error.localizedDescription } }
    }
}

struct CoachClientLogsView: View {
    let program: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    @State private var search = ""
    @State private var dateFilter = false
    @State private var date = Date()
    @State private var analysis: CoachJSONObject?
    @State private var analysisMessage = ""
    @State private var analyzing = false
    @State private var confirmAnalysis = false
    private var logs: [CoachJSONObject] { CoachClientRecords.rows(store.logs, email: program.email) }

    private var decoded: Result<[WorkoutHistorySession], Error> {
        Result { let data = try JSONEncoder().encode(logs); let records = try JSONDecoder().decode([WorkoutHistoryRecord].self, from: data); return WorkoutHistoryStore.makeSessions(from: records) }
    }
    private var sessions: [WorkoutHistorySession] {
        guard case .success(let sessions) = decoded else { return [] }
        return sessions.filter { session in
            (!dateFilter || session.entryDate == CoachDate.day(date)) && (search.isEmpty || (session.workoutTitle + " " + session.records.map(\.exerciseName).joined(separator: " ")).localizedCaseInsensitiveContains(search))
        }
    }
    var body: some View {
        List {
            Section {
                Toggle("Filter by date", isOn: $dateFilter)
                if dateFilter { DatePicker("Date", selection: $date, displayedComponents: .date) }
                NavigationLink("Correct exercise history") { CoachExerciseHistoryTools(program: program, store: store) }
                NavigationLink { CoachSharedHealthView(program: program, previewMode: store.isPreview) } label: {
                    Label("Apple Health & workout attachments", systemImage: "heart.text.clipboard")
                }
            }
            Section("Workout history") {
                CoachDataStatus(store: store, resource: "client_workout_logs", empty: logs.isEmpty, noun: "workouts", clientProgram: program)
                if case .failure = decoded { Text("Some workout records could not be read. Refresh and try again.").foregroundStyle(.red) }
                ForEach(sessions) { session in
                    NavigationLink { WorkoutHistoryDetailView(session: session) } label: {
                        VStack(alignment: .leading, spacing: 5) { Text(session.workoutTitle.fwbWorkoutDisplayTitle).bold(); Text("\(session.entryDate) · \(session.totalSets) sets · \(session.exercises.count) exercises").font(.subheadline).foregroundStyle(.secondary) }
                    }
                }
                if sessions.isEmpty && !logs.isEmpty { Text("No workouts match these filters.").foregroundStyle(.secondary) }
            }
            Section("AI workout review") {
                if let analysis {
                    Text(analysis.string("analysis_text")).textSelection(.enabled)
                    if analysis["usage_count"] != nil { Text("AI uses this month: \(analysis.string("usage_count")) / \(analysis.string("usage_limit"))").font(.caption).foregroundStyle(.secondary) }
                }
                Button(analyzing ? "Analyzing…" : "Analyze workouts") { confirmAnalysis = true }.disabled(analyzing || logs.isEmpty)
                if !analysisMessage.isEmpty { Text(analysisMessage).font(.callout) }
            }
        }.navigationTitle("Workout logs").navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden).background(Color.fwbBackground)
            .searchable(text: $search, prompt: "Workout or exercise")
            .refreshable { await loadClient(); await loadAnalysis() }
            .task(id: program.email) { await loadClient(); await loadAnalysis() }
            .confirmationDialog("Analyze this client’s recent workouts?", isPresented: $confirmAnalysis, titleVisibility: .visible) {
                Button("Analyze workouts") { analyze() }
            } message: { Text("This sends the recent workout logs to the FWB analysis service and uses one monthly AI review.") }
    }
    private func loadAnalysis() async {
        do { analysis = try await store.latestAnalysis(email: program.email) }
        catch { analysisMessage = error.localizedDescription }
    }
    private func loadClient() async { store.selectProgram(program.id); await store.loadSelectedClient() }
    private func analyze() {
        analyzing = true; analysisMessage = ""
        Task { @MainActor in defer { analyzing = false }; do { let result = try await store.analyze(client: program, logs: logs); analysis = result.object("analysis"); analysisMessage = result.string("save_warning").isEmpty ? "Workout review saved." : result.string("save_warning") } catch { analysisMessage = error.localizedDescription } }
    }
}

private struct CoachExerciseHistoryTools: View {
    let program: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    @State private var original = ""
    @State private var corrected = ""
    @State private var message = ""
    @State private var action: String?
    @State private var busy = false
    private var names: [String] { Array(Set(CoachClientRecords.rows(store.logs, email: program.email).map { $0.string("exercise_name") }.filter { !$0.isEmpty })).sorted() }
    var body: some View {
        Form {
            Section("Saved exercise") { Picker("Exercise", selection: $original) { Text("Choose exercise").tag(""); ForEach(names, id: \.self) { Text($0).tag($0) } } }
            Section {
                TextField("Correct exercise name", text: $corrected)
                Button("Update exercise name") { action = "correct" }.disabled(original.isEmpty || corrected.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
            } header: { Text("Correct spelling") } footer: { Text("Updates this exercise name throughout \(program.name)’s saved history.") }
            Section { Button("Delete custom workout history", role: .destructive) { action = "delete" }.disabled(original.isEmpty || busy) } footer: { Text("Permanently removes this exercise's saved custom-workout sets for this client. Assigned-program workout history remains.") }
            if !message.isEmpty { Text(message) }
        }.navigationTitle("Exercise history").navigationBarTitleDisplayMode(.inline)
            .disabled(busy)
            .task(id: program.email) { store.selectProgram(program.id); await store.loadSelectedClient() }
            .confirmationDialog(action == "delete" ? "Permanently delete \(original)?" : "Rename \(original)?", isPresented: Binding(get: { action != nil }, set: { if !$0 { action = nil } }), titleVisibility: .visible) {
                if let action { Button(action == "delete" ? "Delete custom-workout sets" : "Rename exercise", role: action == "delete" ? .destructive : nil) { perform(action) } }
            }
    }
    private func perform(_ selected: String) {
        let originalName = original
        let correctedName = corrected.trimmingCharacters(in: .whitespacesAndNewlines)
        action = nil; busy = true
        Task { @MainActor in defer { busy = false }; do {
            let count: Int
            if selected == "delete" { count = try await store.deleteExerciseHistory(email: program.email, name: originalName) }
            else { count = try await store.correctExerciseName(email: program.email, previous: originalName, corrected: correctedName) }
            store.selectProgram(program.id); await store.loadSelectedClient()
            message = selected == "delete" ? "Deleted \(count) custom-workout sets." : "Updated \(count) saved exercise names."
            original = ""; corrected = ""
        } catch { message = error.localizedDescription } }
    }
}
