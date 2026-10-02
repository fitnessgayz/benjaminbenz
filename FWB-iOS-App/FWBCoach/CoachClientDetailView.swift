import SwiftUI
import Supabase
import SafariServices

private struct CoachAccountIDKey: EnvironmentKey { static let defaultValue: UUID? = nil }
extension EnvironmentValues {
    var coachAccountID: UUID? {
        get { self[CoachAccountIDKey.self] }
        set { self[CoachAccountIDKey.self] = newValue }
    }
}

struct CoachClientDetailView: View {
    @Environment(\.messagingInbox) private var messagingInbox
    let program: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    @State private var action: String?
    @State private var message = ""
    @State private var working = false
    @Environment(\.dismiss) private var dismiss

    private var current: CoachClientProgram { store.programs.first { $0.id == program.id } ?? program }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(current.name).font(.title2.bold())
                    Text(current.email).foregroundStyle(.secondary).textSelection(.enabled)
                    Text(current.isArchived ? "Archived client" : "\(current.sessionRemaining) sessions remaining")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Color.fwbLime)
                }.padding(.vertical, 8)
            }
            Section("Client workspace") {
                if let messagingInbox {
                    NavigationLink {
                        MessageConversationView(store: messagingInbox.conversation(clientEmail: current.email, clientName: current.name))
                    } label: { Label("View messages", systemImage: "bubble.left.and.bubble.right") }
                    .accessibilityIdentifier("coach.client.messages")
                }
                NavigationLink { CoachProfileEditor(program: current, store: store, section: .profile) } label: { Label("Profile", systemImage: "person.crop.circle") }
                NavigationLink { CoachTrainingBlocksView(program: current, store: store) } label: { Label("Program", systemImage: "calendar") }
                NavigationLink { CoachClientWorkoutsView(program: current, store: store) } label: { Label("Workouts & logging", systemImage: "dumbbell") }
                NavigationLink { CoachFoodView(program: current, store: store) } label: { Label("Food", systemImage: "fork.knife") }
                NavigationLink { CoachClientProgressView(program: current, store: store) } label: { Label("Progress", systemImage: "chart.xyaxis.line") }
                NavigationLink { CoachProfileEditor(program: current, store: store, section: .notes) } label: { Label("Coach notes", systemImage: "note.text") }
                NavigationLink { CoachClientLogsView(program: current, store: store) } label: { Label("Workout logs", systemImage: "list.clipboard") }
                NavigationLink { CoachProfileEditor(program: current, store: store, section: .sessions) } label: { Label("Sessions", systemImage: "checkmark.calendar") }
                NavigationLink { CoachQuestionnaireView(program: current, store: store) } label: { Label("Questionnaire", systemImage: "checklist") }
            }
            Section("Account") {
                Button("Send sign-in invitation") { action = "invite" }
                Button(current.isArchived ? "Restore client" : "Archive client") { action = current.isArchived ? "restore" : "archive" }
                Button("Delete client", role: .destructive) { action = current.isArchived ? "delete_archived" : "delete" }
            }
            if !message.isEmpty { Section { Text(message).font(.callout).textSelection(.enabled) } }
        }
        .navigationTitle(current.name).navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden).background(Color.fwbBackground)
        .disabled(working)
        .task(id: current.email) { store.selectProgram(current.id); await store.loadSelectedClient() }
        .refreshable { await store.reload(); store.selectProgram(current.id); await store.loadSelectedClient() }
        .confirmationDialog(actionTitle, isPresented: Binding(get: { action != nil }, set: { if !$0 { action = nil } }), titleVisibility: .visible) {
            if let action {
                Button(action == "invite" ? "Send invitation" : action == "archive" ? "Archive client" : action == "restore" ? "Restore client" : "Delete client", role: action.hasPrefix("delete") ? .destructive : nil) { perform(action) }
            }
            Button("Cancel", role: .cancel) { action = nil }
        } message: {
            Text(action == "invite" ? "This emails a sign-in invitation to \(current.email)." : action?.hasPrefix("delete") == true ? "Permanently delete \(current.name)’s saved client programs? Their login and workout history remain. This cannot be undone." : "Update \(current.name)’s status across all saved programs?")
        }
    }

    private var actionTitle: String { action == "invite" ? "Send invitation?" : action?.hasPrefix("delete") == true ? "Delete client?" : "Update client status?" }
    private func perform(_ selected: String) {
        action = nil; working = true; message = ""
        Task { @MainActor in
            defer { working = false }
            do {
                if selected == "invite" {
                    _ = try await store.inviteClient(email: current.email, name: current.name)
                    message = "Invitation sent to \(current.email)."
                } else {
                    try await store.manageClient(current, action: selected)
                    if selected.hasPrefix("delete") { dismiss() }
                    else { message = selected == "restore" ? "Client restored." : "Client archived." }
                }
            } catch { message = error.localizedDescription }
        }
    }
}

enum CoachProfileSection: String {
    case profile = "Profile", food = "Nutrition targets", notes = "Coach notes", sessions = "Sessions"
}

struct CoachProfileEditor: View {
    let program: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    let section: CoachProfileSection
    @State private var draft: CoachClientProgram
    @State private var saving = false
    @State private var message = ""
    @State private var showNewPackage = false
    @State private var packageTotal = "10"
    @State private var sessionDate = Date()
    @State private var cancelPrompt = false
    @Environment(\.dismiss) private var dismiss

    init(program: CoachClientProgram, store: CoachWorkspaceStore, section: CoachProfileSection) {
        self.program = program; self.store = store; self.section = section
        _draft = State(initialValue: program)
    }

    var body: some View {
        Form {
            if section == .profile {
                Section("Contact") {
                    field("Name", "client_name"); field("Email", "client_email", keyboard: .emailAddress)
                    field("Phone", "client_phone", keyboard: .phonePad); field("Initials", "initials")
                }
                Section("Starting measurements") {
                    field("Height", "height"); field("Weight", "starting_weight"); field("Body fat", "starting_bodyfat")
                }
            } else if section == .food {
                Section("Daily targets") {
                    nutritionField("Calories", "calories"); nutritionField("Protein (g)", "protein")
                    nutritionField("Carbohydrates (g)", "carbs"); nutritionField("Fat (g)", "fat")
                }
                Section("Nutrition guide") { TextEditor(text: nestedText("nutrition_plan", "guide")).frame(minHeight: 150) }
            } else if section == .notes {
                Section {
                    field("Title", "coach_note_title")
                    TextEditor(text: text("coach_note_body")).frame(minHeight: 220)
                } header: { Text("Coach note") } footer: { Text("These notes are visible to the client.") }
            } else {
                sessionFields
            }
            if !message.isEmpty { Section { Text(message).foregroundStyle(.red) } }
        }
        .navigationTitle(section.rawValue).navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden).background(Color.fwbBackground)
        .navigationBarBackButtonHidden(saving || draft != program)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                if draft != program { Button("Cancel") { cancelPrompt = true }.disabled(saving) }
            }
            ToolbarItem(placement: .navigationBarTrailing) { Button(saving ? "Saving…" : "Save", action: save).bold().disabled(saving || draft == program) }
        }
        .disabled(saving)
        .confirmationDialog("Discard unsaved changes?", isPresented: $cancelPrompt, titleVisibility: .visible) {
            Button("Discard", role: .destructive) { dismiss() }; Button("Keep editing", role: .cancel) { }
        }
        .alert("Start a new package?", isPresented: $showNewPackage) {
            TextField("Sessions in new package", text: $packageTotal).keyboardType(.numberPad)
            Button("Start package") {
                guard let total = Int(packageTotal), total > 0 else { message = "Enter a session total greater than zero."; return }
                var history = draft.raw.array("session_package_history")
                history.insert(.object([
                    "label": .string("\(draft.raw.int("session_count_total")) session package"),
                    "used": .number(Double(draft.raw.int("session_count_used"))),
                    "total": .number(Double(draft.raw.int("session_count_total"))),
                    "dates": draft["session_dates"],
                    "archived_at": .string(ISO8601DateFormatter().string(from: Date()))
                ]), at: 0)
                draft["session_package_history"] = .array(history)
                draft["session_count_used"] = .number(0); draft["session_count_total"] = .number(Double(total))
                draft["session_dates"] = .array([])
                message = "Review the new package, then tap Save."
            }
            Button("Cancel", role: .cancel) { }
        } message: { Text("The current package and its dates will move to package history when you save.") }
    }

    @ViewBuilder private var sessionFields: some View {
        Section("Current package") {
            Stepper("Used: \(draft.raw.int("session_count_used"))", value: integer("session_count_used"), in: 0...10000)
            Stepper("Total: \(draft.raw.int("session_count_total"))", value: integer("session_count_total"), in: 0...10000)
            field("Google Sheet URL", "sheet_url", keyboard: .URL)
            if let url = CoachDate.safeURL(draft.text("sheet_url")) {
                Link("Open session sheet", destination: url)
            }
            Button("Start a new package") { showNewPackage = true }
        }
        Section("Session dates") {
            DatePicker("Session date", selection: $sessionDate, displayedComponents: .date)
            Button("Add date") {
                var dates = draft.raw.array("session_dates")
                let value = CoachDate.day(sessionDate)
                if !dates.contains(.string(value)) { dates.append(.string(value)); draft["session_dates"] = .array(dates.sorted { $0.stringValue < $1.stringValue }) }
            }
            ForEach(Array(draft.raw.array("session_dates").enumerated()), id: \.offset) { index, value in
                HStack { Text(value.stringValue); Spacer(); Button(role: .destructive) { var dates = draft.raw.array("session_dates"); dates.remove(at: index); draft["session_dates"] = .array(dates) } label: { Image(systemName: "minus.circle") }.accessibilityLabel("Remove \(value.stringValue)") }
            }
        }
        Section("Package history") {
            if draft.raw.array("session_package_history").isEmpty { Text("No previous packages.").foregroundStyle(.secondary) }
            ForEach(Array(draft.raw.array("session_package_history").enumerated()), id: \.offset) { _, package in
                let row = package.objectValue
                VStack(alignment: .leading, spacing: 5) {
                    Text(row.string("label").isEmpty ? "Previous package" : row.string("label")).bold()
                    Text("\(row.int("used")) / \(row.int("total")) sessions · \(String(row.string("archived_at").prefix(10)))")
                    Text(row.array("dates").map(\.stringValue).joined(separator: ", ")).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
    private func field(_ title: String, _ key: String, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading) { Text(title).font(.caption).foregroundStyle(.secondary); TextField(title, text: text(key), axis: .vertical).keyboardType(keyboard).textInputAutocapitalization(keyboard == .emailAddress || keyboard == .URL ? .never : .sentences).autocorrectionDisabled(keyboard == .emailAddress || keyboard == .URL) }
    }
    private func nutritionField(_ title: String, _ key: String) -> some View {
        HStack { Text(title); TextField(title, text: nestedText("nutrition_plan", key)).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
    }
    private func text(_ key: String) -> Binding<String> { Binding(get: { draft.text(key) }, set: { draft.setText(key, $0) }) }
    private func nestedText(_ object: String, _ key: String) -> Binding<String> { Binding(get: { draft.raw.object(object).string(key) }, set: { value in var row = draft.raw.object(object); row[key] = .string(value); draft[object] = .object(row) }) }
    private func integer(_ key: String) -> Binding<Int> { Binding(get: { draft.raw.int(key) }, set: { draft[key] = .number(Double($0)) }) }
    private func save() {
        if section == .profile && (!draft.email.contains("@") || draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { message = "Enter the client’s name and a valid email."; return }
        if section == .sessions && !draft.text("sheet_url").isEmpty && CoachDate.safeURL(draft.text("sheet_url")) == nil { message = "Enter a valid HTTPS sheet URL."; return }
        saving = true; message = ""
        Task { @MainActor in
            defer { saving = false }
            do {
                if section == .profile || section == .sessions || section == .food { _ = try await store.saveProfile(draft, originalEmail: program.email) }
                else { _ = try await store.saveProgram(draft) }
                dismiss()
            } catch { message = error.localizedDescription }
        }
    }
}

struct CoachTrainingBlocksView: View {
    let program: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    @State private var actionProgram: CoachClientProgram?
    @State private var deletePrompt = false
    @State private var copyProgram: CoachClientProgram?
    @State private var message = ""
    @State private var busy = false
    @State private var newDraft: CoachClientProgram?

    var body: some View {
        List {
            Section {
                NavigationLink("Edit current program") { CoachProgramEditor(store: store, program: program) }
                Button("Create a training block") {
                    newDraft = program.newBlock()
                }
            }
            Section("Program history") {
                ForEach(store.programs(for: program.email)) { item in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack { Text(item.programTitle).bold(); if item.isActive { Text("ACTIVE").font(.caption.bold()).foregroundStyle(Color.fwbLime) } }
                        Text(item.text("program_summary")).font(.subheadline).foregroundStyle(.secondary)
                        NavigationLink("View & edit") { CoachProgramEditor(store: store, program: item) }
                        HStack {
                            if !item.isActive { Button("Restore") { restore(item) } }
                            Button("Copy to client") { copyProgram = item }
                            Spacer()
                            Button("Delete", role: .destructive) { actionProgram = item; deletePrompt = true }
                        }.buttonStyle(.borderless).font(.subheadline)
                    }.padding(.vertical, 6)
                }
            }
            if !message.isEmpty { Text(message).font(.callout).foregroundStyle(.red) }
        }
        .navigationTitle("Program").navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden).background(Color.fwbBackground).disabled(busy)
        .sheet(item: $copyProgram) { source in NavigationStack { CoachCopyProgramView(source: source, store: store) } }
        .sheet(item: $newDraft) { source in NavigationStack { CoachProgramEditor(store: store, program: source) } }
        .confirmationDialog("Delete this training block?", isPresented: $deletePrompt, titleVisibility: .visible) {
            Button("Delete program", role: .destructive) {
                guard let item = actionProgram else { return }; busy = true
                Task { @MainActor in defer { busy = false }; do { try await store.deleteProgram(item) } catch { message = error.localizedDescription } }
            }
        } message: { Text("The saved block will be permanently deleted. Deleting an active block may leave this client without an active program.") }
    }
    private func restore(_ item: CoachClientProgram) {
        busy = true
        Task { @MainActor in defer { busy = false }; do { var restored = item; restored["active"] = .bool(true); _ = try await store.saveProgram(restored) } catch { message = error.localizedDescription } }
    }
}

private struct CoachCopyProgramView: View {
    let source: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    @State private var targetID: UUID?
    @State private var busy = false
    @State private var message = ""
    @State private var confirm = false
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        Form {
            Section { Text("Copy \(source.programTitle) to another client."); Picker("Client", selection: $targetID) { Text("Choose client").tag(nil as UUID?); ForEach(store.clientPrograms(archived: false).filter { $0.email != source.email }) { Text($0.name).tag(Optional($0.id)) } } }
            Section { Button(busy ? "Copying…" : "Copy program") { confirm = true }.disabled(targetID == nil || busy) } footer: { Text("This becomes the recipient’s active program. Their profile, sessions, and previous programs are preserved.") }
            if !message.isEmpty { Text(message).foregroundStyle(.red) }
        }.navigationTitle("Copy program").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) } }
            .confirmationDialog("Make this the client’s active program?", isPresented: $confirm, titleVisibility: .visible) {
                Button("Copy program") {
                    guard let target = store.programs.first(where: { $0.id == targetID }) else { return }; busy = true
                    Task { @MainActor in defer { busy = false }; do { _ = try await store.copyProgram(source, to: target); dismiss() } catch { message = error.localizedDescription } }
                }
            }
    }
}

struct CoachClientWorkoutsView: View {
    let program: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    @Environment(\.coachAccountID) private var coachID
    @State private var customWorkout: Workout?
    private var workouts: [Workout] { program.clientProgram?.assignedWorkouts ?? [] }
    var body: some View {
        List {
            Section {
                NavigationLink("Edit workout plan") { CoachProgramEditor(store: store, program: program) }
                Button { customWorkout = Workout(id: UUID(), title: "Custom workout", focus: "Coach session", format: "custom", exercises: []) } label: { Label("Log a custom workout", systemImage: "plus") }
            }
            Section("Assigned workouts") {
                if workouts.isEmpty { Text("No assigned workouts. Add a workout to the program, or log a custom session.").foregroundStyle(.secondary) }
                ForEach(workouts) { workout in
                    NavigationLink { logger(workout) } label: {
                        VStack(alignment: .leading, spacing: 6) { Text(workout.title).bold(); Text("\(workout.exercises.count) exercises · \(workout.focus)").font(.subheadline).foregroundStyle(.secondary) }
                    }
                }
            }
        }.navigationTitle("Workouts").navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden).background(Color.fwbBackground)
            .sheet(item: $customWorkout) { workout in NavigationStack { logger(workout).toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { customWorkout = nil } } } } }
    }
    @ViewBuilder private func logger(_ workout: Workout) -> some View {
        if let coachID {
            WorkoutLoggingView(workout: workout, clientEmail: program.email,
                suggestedExercises: workouts.flatMap(\.exercises), previewMode: store.isPreview,
                coachAccountID: coachID) { EmptyView() }
                .navigationTitle(program.name).navigationBarTitleDisplayMode(.inline)
        } else { Text("Sign in as a coach to log this client’s workout.") }
    }
}

struct CoachFoodView: View {
    let program: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    private var foodLogs: [CoachJSONObject] { CoachClientRecords.rows(store.foodLogs, email: program.email) }
    var body: some View {
        List {
            Section { NavigationLink("Edit nutrition targets") { CoachProfileEditor(program: program, store: store, section: .food) } }
            Section("Recent food logs") {
                CoachDataStatus(store: store, resource: "client_food_logs", empty: foodLogs.isEmpty, noun: "food logs", clientProgram: program)
                ForEach(Array(foodLogs.enumerated()), id: \.offset) { _, row in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(row.string("food_name").isEmpty ? row.string("meal") : row.string("food_name")).bold()
                        Text("\(row.string("entry_date")) · \(row.string("meal"))").font(.caption).foregroundStyle(.secondary)
                        Text("\(row.string("calories")) kcal · P \(row.string("protein"))g · C \(row.string("carbs"))g · F \(row.string("fat"))g").font(.subheadline)
                        if !row.string("notes").isEmpty { Text(row.string("notes")).font(.subheadline) }
                    }
                }
            }
        }.navigationTitle("Food").navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden).background(Color.fwbBackground)
            .task(id: program.email) { await loadClient() }
            .refreshable { await loadClient() }
    }
    private func loadClient() async { store.selectProgram(program.id); await store.loadSelectedClient() }
}

struct CoachQuestionnaireView: View {
    let program: CoachClientProgram
    @ObservedObject var store: CoachWorkspaceStore
    private var record: CoachJSONObject? { store.questionnaires.first { ContinuitySync.normalize(email: $0.string("linked_client_email")) == program.email } }
    var body: some View {
        List {
            if let error = store.questionnairesError {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button("Try again") { Task { await store.reload() } }
                }
            }
            if let record {
                Section("Client responses") {
                    ForEach(record.object("answers").keys.sorted(), id: \.self) { key in
                        let value = record.object("answers")[key] ?? .null
                        VStack(alignment: .leading, spacing: 5) { Text(CoachDate.label(key)).font(.caption).foregroundStyle(.secondary); Text(CoachDate.display(value)).textSelection(.enabled) }
                    }
                }
            } else if store.isLoading {
                ProgressView("Loading questionnaire…")
            } else if store.questionnairesError == nil {
                Text("No questionnaires saved yet.").foregroundStyle(.secondary)
            }
        }.navigationTitle("Questionnaire").navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden).background(Color.fwbBackground)
            .refreshable { await store.reload() }
    }
}

struct CoachDataStatus: View {
    @ObservedObject var store: CoachWorkspaceStore
    let resource: String
    let empty: Bool
    let noun: String
    var clientProgram: CoachClientProgram? = nil
    var body: some View {
        if let error = store.detailErrors[resource] {
            VStack(alignment: .leading) { Text(error).foregroundStyle(.red); Button("Try again") { Task {
                if let clientProgram { store.selectProgram(clientProgram.id) }
                await store.loadSelectedClient()
            } } }
        } else if store.isLoadingDetails { ProgressView("Loading \(noun)…") }
        else if empty { Text("No \(noun) saved yet.").foregroundStyle(.secondary) }
    }
}

enum CoachDate {
    static func day(_ date: Date) -> String { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f.string(from: date) }
    static func safeURL(_ text: String) -> URL? { guard let url = URL(string: text), url.scheme == "https", url.host != nil, url.user == nil, url.password == nil else { return nil }; return url }
    static func label(_ key: String) -> String { key.replacingOccurrences(of: "_", with: " ").capitalized }
    static func display(_ value: CoachJSON) -> String {
        switch value { case .array(let values): return values.map(display).joined(separator: ", ")
        case .object(let object): return object.keys.sorted().map { "\(label($0)): \(display(object[$0]!))" }.joined(separator: "\n")
        case .bool(let value): return value ? "Yes" : "No"
        case .null: return "Not provided"
        default: return value.stringValue }
    }
}
