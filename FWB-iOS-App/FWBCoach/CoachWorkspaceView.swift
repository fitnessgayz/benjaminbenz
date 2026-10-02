import SwiftUI
import UniformTypeIdentifiers

enum CoachWorkspaceTab: String, CaseIterable, Identifiable {
    case home, clients, inbox, exercises, account
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var icon: String {
        switch self {
        case .home: "house"
        case .clients: "person.2"
        case .inbox: "tray"
        case .exercises: "dumbbell"
        case .account: "person.crop.circle"
        }
    }
}

struct CoachRootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var sessionStore: SessionStore
    let account: SignedInAccount
    private let previewMode: Bool
    @StateObject private var store: CoachWorkspaceStore
    @StateObject private var notificationStore: NotificationInboxStore
    @StateObject private var messagingStore: MessagingInboxStore
    @State private var selectedTab: CoachWorkspaceTab
    @State private var showingPushInbox = false

    init(
        sessionStore: SessionStore,
        account: SignedInAccount,
        store: CoachWorkspaceStore? = nil,
        previewMode: Bool = false,
        initialTab: CoachWorkspaceTab = .home,
        messagingStore: MessagingInboxStore? = nil
    ) {
        self.sessionStore = sessionStore
        self.account = account
        self.previewMode = previewMode
        _store = StateObject(wrappedValue: store ?? CoachWorkspaceStore())
        _notificationStore = StateObject(wrappedValue: NotificationInboxStore(accountID: account.id))
        _messagingStore = StateObject(wrappedValue: messagingStore ?? MessagingInboxStore(account: account))
        _selectedTab = State(initialValue: initialTab)
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                CoachHomeView(store: store, notificationStore: notificationStore, previewMode: previewMode)
            }
            .environment(\.clientNavigationTabIsSelected, selectedTab == .home)
            .tabItem { Label("Home", systemImage: "house") }
            .tag(CoachWorkspaceTab.home)

            NavigationStack { CoachClientsView(store: store) }
                .environment(\.clientNavigationTabIsSelected, selectedTab == .clients)
                .tabItem { Label("Clients", systemImage: "person.2") }
                .tag(CoachWorkspaceTab.clients)

            NavigationStack { CoachExerciseLibraryView(store: store) }
                .tabItem { Label("Exercises", systemImage: "dumbbell") }
                .tag(CoachWorkspaceTab.exercises)

            if !previewMode {
                NavigationStack { CoachMessageInboxView(inbox: messagingStore) }
                    .environment(\.clientNavigationTabIsSelected, selectedTab == .inbox)
                    .tabItem { Label("Inbox", systemImage: "tray") }
                    .badge(messagingStore.unreadCount)
                    .tag(CoachWorkspaceTab.inbox)
            }

            NavigationStack {
                CoachAccountView(sessionStore: sessionStore, account: account, previewMode: previewMode)
            }
            .tabItem { Label("Account", systemImage: "person.crop.circle") }
            .tag(CoachWorkspaceTab.account)
        }
        .tint(Color.fwbLime)
        .environment(\.coachAccountID, account.id)
        .environment(\.messagingInbox, previewMode ? nil : messagingStore)
        .task(id: scenePhase) {
            guard scenePhase == .active, !previewMode else { return }
            while !Task.isCancelled {
                await messagingStore.refresh()
                do { try await Task.sleep(nanoseconds: 15_000_000_000) } catch { return }
            }
        }
        .onChange(of: sessionStore.state) { state in
            if state != .signedIn(account) { messagingStore.invalidate() }
        }
        .task {
            await store.load()
            if !previewMode {
                await notificationStore.loadIfNeeded()
                await PushRegistrationCoordinator.shared.activate(account: account)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in
            guard !previewMode else { return }
            Task { await store.reload(); await notificationStore.reload() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .fwbNotificationInboxShouldOpen)) { _ in
            guard !previewMode else { return }
            showingPushInbox = true
            Task { await notificationStore.reload() }
        }
        .sheet(isPresented: $showingPushInbox) {
            NavigationStack {
                CoachNotificationInboxView(store: notificationStore, workspace: store)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { showingPushInbox = false } } }
            }.environment(\.coachAccountID, account.id).environment(\.messagingInbox, messagingStore)
        }
    }
}

private struct CoachHomeView: View {
    @ObservedObject var store: CoachWorkspaceStore
    @ObservedObject var notificationStore: NotificationInboxStore
    let previewMode: Bool

    private var clients: [CoachClientProgram] { store.clientPrograms(archived: false) }
    private var attention: [CoachClientProgram] { clients.filter { $0.sessionRemaining <= 2 } }
    private var inactiveClients: [CoachClientProgram] {
        guard !store.isLoading, store.recentLogsError == nil else { return [] }
        let cutoff = CoachWorkspaceDisplay.dayKey(Calendar.current.date(byAdding: .day, value: -14, to: Date()) ?? Date())
        return clients.filter { client in
            let dates = store.recentLogs.filter { $0.string("client_email").lowercased() == client.email.lowercased() }.map { $0.string("entry_date") }
            if let latest = dates.max() { return latest < cutoff }
            return true // The store paginates the complete 15-day window.
        }
    }
    private var recentWorkouts: [CoachRecentWorkout] {
        var seen = Set<String>()
        return store.recentLogs.compactMap { row in
            let email = row.string("client_email")
            let title = row.string("workout_title")
            let date = row.string("entry_date")
            let id = [email, title, date, row.string("session_id")].joined(separator: "|")
            guard seen.insert(id).inserted else { return nil }
            return CoachRecentWorkout(id: id, email: email, title: title, date: date)
        }.sorted { $0.date > $1.date }
    }

    private var workoutsThisWeek: Int {
        let cutoff = CoachWorkspaceDisplay.dayKey(Calendar.current.date(byAdding: .day, value: -6, to: Date()) ?? Date())
        let today = CoachWorkspaceDisplay.dayKey(Date())
        return recentWorkouts.filter { $0.date >= cutoff && $0.date <= today }.count
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("COACH WORKSPACE")
                        .font(FWBFont.caption.weight(.bold))
                        .foregroundStyle(Color.fwbLime)
                    Text("Today’s overview")
                        .font(FWBFont.title.weight(.bold))
                    Text(Date(), style: .date)
                        .font(FWBFont.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                }
                CoachWorkspaceLoadStatus(store: store)

                if !store.isLoading || !store.programs.isEmpty {
                    HStack(spacing: 12) {
                        metric("Clients", value: store.errorMessage != nil && store.programs.isEmpty ? nil : clients.count, icon: "person.2")
                        metric("Low sessions", value: store.errorMessage != nil && store.programs.isEmpty ? nil : attention.count, icon: "calendar.badge.exclamationmark")
                    }

                    HStack(spacing: 12) {
                        metric("Workouts · 7 days", value: store.recentLogsError == nil ? workoutsThisWeek : nil, icon: "checkmark.circle")
                        metric("Sessions left", value: store.errorMessage == nil ? clients.reduce(0) { $0 + $1.sessionRemaining } : nil, icon: "calendar")
                    }
                    NavigationLink {
                        CoachCalendarView(store: store)
                    } label: {
                        CoachWorkspaceLinkLabel(title: "Training calendar", subtitle: "See appointments and client session dates.", icon: "calendar")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("coach.home.calendar")

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Needs attention").font(FWBFont.title3.weight(.bold))
                        if attention.isEmpty {
                            Text(store.errorMessage == nil ? "No clients are running low on sessions." : "Client session status could not be confirmed. Retry the workspace above.")
                                .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                        } else {
                            ForEach(attention.prefix(8)) { client in
                                NavigationLink {
                                    CoachClientDetailView(program: client, store: store)
                                } label: {
                                    CoachWorkspaceLinkLabel(title: client.name, subtitle: "\(max(0, client.sessionRemaining)) sessions remaining", icon: "calendar.badge.clock")
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recent workouts").font(FWBFont.title3.weight(.bold))
                        if store.recentLogsError != nil && !recentWorkouts.isEmpty {
                            Text("Recent workouts couldn’t refresh. Showing previously loaded workouts; pull down to retry.")
                                .font(FWBFont.footnote).foregroundStyle(Color.fwbRed)
                        }
                        if recentWorkouts.isEmpty {
                            Text(store.recentLogsError == nil ? "Client workout logs will appear here after a session is saved." : "Recent workout data is unavailable. Pull down to retry.")
                                .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                        }
                        ForEach(recentWorkouts.prefix(8)) { workout in
                            if let client = store.programs(for: workout.email).first {
                                NavigationLink {
                                    CoachClientDetailView(program: client, store: store)
                                } label: {
                                    CoachWorkspaceLinkLabel(
                                        title: client.name,
                                        subtitle: "\(workout.title.fwbWorkoutDisplayTitle) · \(CoachWorkspaceDisplay.date(workout.date))",
                                        icon: "figure.strengthtraining.traditional"
                                    )
                                }
                                .buttonStyle(.plain)
                            } else {
                                CoachWorkspaceLinkLabel(title: workout.email, subtitle: "\(workout.title.fwbWorkoutDisplayTitle) · \(CoachWorkspaceDisplay.date(workout.date))", icon: "figure.strengthtraining.traditional", showsArrow: false)
                            }
                        }
                    }

                    if !inactiveClients.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("No recent workouts").font(FWBFont.title3.weight(.bold))
                            Text("No workout appears in the last 14 days. This uses the latest 1,000 saved set records; open a client’s full history for details.")
                                .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
                            ForEach(inactiveClients.prefix(8)) { client in
                                NavigationLink {
                                    CoachClientDetailView(program: client, store: store)
                                } label: {
                                    CoachWorkspaceLinkLabel(title: client.name, subtitle: "Review workout history", icon: "clock.arrow.circlepath")
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(FWBLayout.pagePadding)
        }
        .background(Color.fwbBackground)
        .foregroundStyle(Color.fwbWarmWhite)
        .navigationTitle("Home")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                NavigationLink {
                    if previewMode {
                        CoachWorkspaceEmpty(icon: "bell", title: "Notification preview", message: "Your live inbox is available when signed in as a coach.")
                    } else {
                        CoachNotificationInboxView(store: notificationStore, workspace: store)
                    }
                } label: {
                    Label("Notifications", systemImage: notificationStore.unreadCount > 0 ? "bell.badge" : "bell")
                }
                .accessibilityIdentifier("coach.notifications")
            }
        }
        .refreshable { await store.reload() }
    }

    private func metric(_ title: String, value: Int?, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).foregroundStyle(Color.fwbLime)
            Text(value.map(String.init) ?? "—").font(FWBFont.title.weight(.bold))
            Text(title).font(FWBFont.caption).foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }
}

private struct CoachRecentWorkout: Identifiable {
    let id: String
    let email: String
    let title: String
    let date: String
}

private struct CoachClientsView: View {
    @ObservedObject var store: CoachWorkspaceStore
    @State private var search = ""
    @State private var showArchived = false
    @State private var newClientRequest: CoachNewClientRequest?

    private var clients: [CoachClientProgram] {
        store.clientPrograms(archived: showArchived).filter { client in
            search.isEmpty || [client.name, client.email, client.programTitle].joined(separator: " ").localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Picker("Client status", selection: $showArchived) {
                    Text("Active").tag(false)
                    Text("Archived").tag(true)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("coach.clients.status")
                CoachWorkspaceLoadStatus(store: store)
                if clients.isEmpty && !store.isLoading {
                    CoachWorkspaceEmpty(
                        icon: "person.2",
                        title: store.errorMessage != nil ? "Clients unavailable" : search.isEmpty ? (showArchived ? "No archived clients" : "No clients yet") : "No matching clients",
                        message: store.errorMessage != nil ? "The client list could not be confirmed. Retry loading above." : (search.isEmpty ? "Add a client to set up their training program." : "Try another name or email.")
                    )
                }
                ForEach(clients) { client in
                    NavigationLink {
                        CoachClientDetailView(program: client, store: store)
                    } label: {
                        CoachWorkspaceLinkLabel(
                            title: client.name,
                            subtitle: "\(client.programTitle)\n\(client.email)",
                            icon: "person.crop.circle"
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("coach.client.\(client.id.uuidString)")
                }
            }
            .padding(FWBLayout.pagePadding)
        }
        .background(Color.fwbBackground)
        .navigationTitle("Clients")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Name, email, or program")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { newClientRequest = CoachNewClientRequest() } label: { Label("Add client", systemImage: "plus") }
                    .accessibilityIdentifier("coach.clients.add")
            }
        }
        .sheet(item: $newClientRequest) { _ in CoachNewClientSheet(store: store) }
        .refreshable { await store.reload() }
    }
}

private struct CoachNewClientRequest: Identifiable { let id = UUID() }

private struct CoachNewClientSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: CoachWorkspaceStore
    @State private var name = ""
    @State private var email = ""
    @State private var title = "Client Program"
    @State private var sessions = 0
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Client") {
                    TextField("Full name", text: $name).textContentType(.name)
                    TextField("Email", text: $email).textContentType(.emailAddress).textInputAutocapitalization(.never).keyboardType(.emailAddress).autocorrectionDisabled()
                }
                Section("Starting program") {
                    TextField("Program title", text: $title)
                    Stepper("Sessions purchased: \(sessions)", value: $sessions, in: 0...999)
                }
                Section {
                    Text("After creating the client, open their profile to add workouts, nutrition, session dates, and an invitation.")
                        .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
                    if let error { Text(error).foregroundStyle(Color.fwbRed) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.fwbBackground)
            .navigationTitle("New client")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(isSaving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Create", action: save)
                        .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty || !email.contains("@"))
                        .accessibilityIdentifier("coach.clients.create")
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
        .tint(Color.fwbLime)
    }

    private func save() {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !store.programs.contains(where: { $0.email.lowercased() == normalizedEmail }) else {
            error = "A client with that email already exists. Open their profile to add another program."
            return
        }
        isSaving = true
        error = nil
        Task {
            defer { isSaving = false }
            do {
                var client = CoachClientProgram.newClient(email: normalizedEmail, name: name.trimmingCharacters(in: .whitespacesAndNewlines))
                client["program_title"] = .string(title.isEmpty ? "Client Program" : title)
                client["session_count_total"] = .number(Double(sessions))
                _ = try await store.saveProgram(client)
                dismiss()
            } catch { self.error = error.localizedDescription }
        }
    }
}

private struct CoachCalendarView: View {
    @ObservedObject var store: CoachWorkspaceStore
    @State private var selectedDate = Date()
    @State private var isLoading = true

    private var selectedDay: String { CoachWorkspaceDisplay.dayKey(selectedDate) }
    private var appointments: [CoachJSONObject] {
        store.calendarEvents.filter {
            !$0.bool("canceled", default: false) && CoachWorkspaceDisplay.eventDay($0.string("start")) == selectedDay
        }
    }
    private var sessionClients: [CoachClientProgram] {
        store.clientPrograms(archived: false).filter { client in
            client.raw.array("session_dates").contains { String($0.stringValue.prefix(10)) == selectedDay }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DatePicker("Training day", selection: $selectedDate, displayedComponents: .date)
                    .datePickerStyle(.graphical).tint(Color.fwbLime).fwbCard()
                if isLoading { ProgressView("Loading appointments…").frame(maxWidth: .infinity, alignment: .leading) }
                if let message = store.calendarError {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(message).font(FWBFont.subheadline).foregroundStyle(Color.fwbRed)
                        Button("Retry calendar") { Task { await loadCalendar() } }.disabled(isLoading)
                    }.fwbCard()
                }
                Text(selectedDate, style: .date).font(FWBFont.title3.weight(.bold))
                ForEach(Array(appointments.enumerated()), id: \.offset) { _, event in
                    CoachWorkspaceLinkLabel(
                        title: event.string("title").isEmpty ? "Appointment" : event.string("title"),
                        subtitle: event.bool("all_day", default: false) ? "All day" : CoachWorkspaceDisplay.time(event.string("start")),
                        icon: "calendar", showsArrow: false
                    )
                }
                ForEach(sessionClients) { client in
                    NavigationLink {
                        CoachClientDetailView(program: client, store: store)
                    } label: {
                        CoachWorkspaceLinkLabel(title: client.name, subtitle: "Client session date", icon: "person.crop.circle")
                    }.buttonStyle(.plain)
                }
                if appointments.isEmpty && sessionClients.isEmpty && !isLoading {
                    Text(store.calendarError == nil ? "No appointments or client session dates on this day." : "Calendar appointments could not be confirmed.")
                        .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                }
            }.padding(FWBLayout.pagePadding)
        }
        .background(Color.fwbBackground)
        .foregroundStyle(Color.fwbWarmWhite)
        .navigationTitle("Training calendar")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: selectedDate) { await loadCalendar() }
        .refreshable { await loadCalendar() }
    }

    private func loadCalendar() async {
        isLoading = true
        await store.loadCalendar(around: selectedDate)
        if !Task.isCancelled { isLoading = false }
    }
}

private struct CoachExerciseEditorRequest: Identifiable {
    let id = UUID()
    let record: CoachJSONObject?
}

private struct CoachExerciseLibraryView: View {
    @ObservedObject var store: CoachWorkspaceStore
    @State private var search = ""
    @State private var editor: CoachExerciseEditorRequest?

    private var exercises: [CoachJSONObject] {
        store.library.filter { row in
            search.isEmpty || ([row.string("name"), row.string("primary_muscle"), row.string("equipment"), row.string("movement_pattern")] + row.array("aliases").map(\.stringValue))
                .joined(separator: " ").localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text("Exercises, coaching cues, and demos shared with clients.")
                    .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                CoachWorkspaceLoadStatus(store: store)
                if let libraryError = store.libraryError {
                    Label(libraryError, systemImage: "exclamationmark.circle")
                        .font(FWBFont.subheadline).foregroundStyle(Color.fwbRed)
                }
                if store.libraryError == nil || !store.library.isEmpty {
                    Text("\(exercises.count) exercises").font(FWBFont.caption.weight(.semibold)).foregroundStyle(Color.fwbMuted)
                }
                ForEach(Array(exercises.enumerated()), id: \.offset) { _, exercise in
                    Button { editor = CoachExerciseEditorRequest(record: exercise) } label: {
                        CoachWorkspaceLinkLabel(
                            title: exercise.string("name"),
                            subtitle: "\(CoachWorkspaceDisplay.label(exercise.string("primary_muscle"))) · \(CoachWorkspaceDisplay.label(exercise.string("equipment")))\n\(exercise.bool("is_approved", default: false) ? "Approved" : "Hidden")\(exercise.bool("is_active", default: true) ? "" : " · Archived")",
                            icon: "dumbbell"
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("coach.exercise.\(exercise.string("id"))")
                }
                if exercises.isEmpty && !store.isLoading {
                    CoachWorkspaceEmpty(icon: "dumbbell", title: store.libraryError != nil ? "Library unavailable" : search.isEmpty ? "No exercises yet" : "No matching exercises", message: store.libraryError == nil ? "Add an exercise or try a different search." : "The library could not be confirmed. Pull down to retry.")
                }
                Text("To correct an exercise name or delete saved sets for one client, open their workout history from Clients.")
                    .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
            }.padding(FWBLayout.pagePadding)
        }
        .background(Color.fwbBackground)
        .navigationTitle("Exercise library")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Name, muscle, or equipment")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { editor = CoachExerciseEditorRequest(record: nil) } label: { Label("Add exercise", systemImage: "plus") }
                    .accessibilityIdentifier("coach.exercises.add")
            }
        }
        .sheet(item: $editor) { request in CoachExerciseEditorSheet(store: store, record: request.record) }
        .refreshable { await store.reload() }
    }
}

private struct CoachExerciseEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: CoachWorkspaceStore
    private let recordID: UUID?
    @State private var values: CoachJSONObject
    @State private var aliases: String
    @State private var secondaryMuscles: String
    @State private var isSaving = false
    @State private var showVideoImporter = false
    @State private var videoData: Data?
    @State private var videoName = ""
    @State private var videoExtension = "mp4"
    @State private var videoContentType = "video/mp4"
    @State private var error: String?

    init(store: CoachWorkspaceStore, record: CoachJSONObject?) {
        self.store = store
        recordID = record.flatMap { UUID(uuidString: $0.string("id")) }
        _aliases = State(initialValue: record?.array("aliases").map(\.stringValue).joined(separator: ", ") ?? "")
        _secondaryMuscles = State(initialValue: record?.array("secondary_muscles").map(\.stringValue).joined(separator: ", ") ?? "")
        _values = State(initialValue: [
            "name": .string(""), "primary_muscle": .string("chest"), "equipment": .string("bodyweight"),
            "difficulty": .string("beginner"), "default_sets": .number(3), "default_reps": .string("8–12"),
            "default_rest_seconds": .number(90), "is_approved": .bool(true), "is_active": .bool(true)
        ].merging(record ?? [:], uniquingKeysWith: { _, saved in saved }))
    }

    var body: some View {
        NavigationStack {
            Form {
                identitySection
                targetsSection
                demoSection
                Section("Coaching instructions") {
                    TextField("Cues clients should see", text: text("instructions"), axis: .vertical)
                        .lineLimit(4...10)
                }
                Section("Availability") {
                    Toggle("Approved for clients", isOn: flag("is_approved"))
                    Toggle("Active in the library", isOn: flag("is_active"))
                    Text("Inactive or unapproved exercises are excluded from new generated workouts. Existing saved workouts retain their exercise details.")
                        .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
                }
                if let error { Section { Text(error).foregroundStyle(Color.fwbRed) } }
            }
            .font(FWBFont.body)
            .scrollContentBackground(.hidden)
            .background(Color.fwbBackground)
            .navigationTitle(recordID == nil ? "New exercise" : "Edit exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(isSaving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save", action: save)
                        .disabled(isSaving || values.string("name").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("coach.exercises.save")
                }
            }
            .interactiveDismissDisabled(isSaving)
            .fileImporter(isPresented: $showVideoImporter, allowedContentTypes: [.movie, .video], allowsMultipleSelection: false, onCompletion: selectVideo)
        }
        .tint(Color.fwbLime)
    }

    private var identitySection: some View {
        Section("Exercise") {
            TextField("Exercise name", text: text("name"))
                .accessibilityIdentifier("coach.exercises.name")
            selection("Primary muscle", key: "primary_muscle", options: ["chest", "back", "lats", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core", "adductors", "full_body"])
            selection("Equipment", key: "equipment", options: ["bodyweight", "dumbbell", "barbell", "cable", "machine", "smith_machine", "bench", "other"])
            selection("Difficulty", key: "difficulty", options: ["beginner", "intermediate", "advanced"])
            TextField("Secondary muscles, separated by commas", text: $secondaryMuscles)
            TextField("Search aliases, separated by commas", text: $aliases)
        }
    }

    private var targetsSection: some View {
        Section("Movement and targets") {
            TextField("Movement pattern, e.g. horizontal_push", text: text("movement_pattern")).textInputAutocapitalization(.never).autocorrectionDisabled()
            TextField("Substitution group, e.g. horizontal_press", text: text("substitution_group")).textInputAutocapitalization(.never).autocorrectionDisabled()
            Stepper("Default sets: \(values.int("default_sets"))", value: number("default_sets"), in: 1...10)
            TextField("Default reps or duration", text: text("default_reps"))
            Stepper("Rest: \(values.int("default_rest_seconds")) seconds", value: number("default_rest_seconds"), in: 0...600, step: 5)
        }
    }

    private var demoSection: some View {
        Section("Exercise demo") {
            TextField("YouTube or uploaded video URL", text: text("demo_url"))
                .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            if let url = CoachWorkspaceDisplay.demoURL(values.string("demo_url")) {
                Link("Watch current demo", destination: url)
            }
            Button { showVideoImporter = true } label: { Label("Choose video file", systemImage: "square.and.arrow.up") }
                .disabled(isSaving)
                .accessibilityIdentifier("coach.exercises.upload")
            if videoData != nil {
                Text("\(videoName) · Ready to upload when you save")
                    .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
                Button("Cancel video selection") { videoData = nil; videoName = "" }
            }
            Text("MP4, MOV, M4V, or WebM, up to 50 MB. Saving uploads the selected video and replaces this exercise’s demo link. Anyone with the demo link can view it.")
                .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
        }
    }

    private func selection(_ title: String, key: String, options: [String]) -> some View {
        Picker(title, selection: text(key)) {
            ForEach(options, id: \.self) { Text(CoachWorkspaceDisplay.label($0)).tag($0) }
        }
    }
    private func text(_ key: String) -> Binding<String> { Binding(get: { values.string(key) }, set: { values[key] = .string($0) }) }
    private func number(_ key: String) -> Binding<Int> { Binding(get: { values.int(key) }, set: { values[key] = .number(Double($0)) }) }
    private func flag(_ key: String) -> Binding<Bool> { Binding(get: { values.bool(key, default: true) }, set: { values[key] = .bool($0) }) }
    private func listValue(_ value: String) -> CoachJSON {
        .array(value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.map(CoachJSON.string))
    }
    private func selectVideo(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            let granted = url.startAccessingSecurityScopedResource()
            defer { if granted { url.stopAccessingSecurityScopedResource() } }
            let ext = url.pathExtension.lowercased()
            let mime = ["mp4": "video/mp4", "mov": "video/quicktime", "m4v": "video/x-m4v", "webm": "video/webm"]
            guard let contentType = mime[ext] else { throw CoachVideoSelectionError.unsupported }
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0 && size <= 50 * 1024 * 1024 else { throw CoachVideoSelectionError.tooLarge }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            guard !data.isEmpty && data.count <= 50 * 1024 * 1024 else { throw CoachVideoSelectionError.tooLarge }
            videoData = data
            videoName = url.lastPathComponent
            videoExtension = ext
            videoContentType = contentType
            error = nil
        } catch { self.error = error.localizedDescription }
    }
    private func save() {
        isSaving = true
        error = nil
        var payload = values
        payload["aliases"] = listValue(aliases)
        payload["secondary_muscles"] = listValue(secondaryMuscles)
        Task {
            defer { isSaving = false }
            do {
                _ = try await store.saveExercise(payload, id: recordID, videoData: videoData, videoExtension: videoExtension, videoContentType: videoContentType)
                dismiss()
            } catch { self.error = error.localizedDescription }
        }
    }
}

private enum CoachVideoSelectionError: LocalizedError {
    case unsupported, tooLarge
    var errorDescription: String? {
        switch self {
        case .unsupported: "Choose an MP4, MOV, M4V, or WebM video."
        case .tooLarge: "Choose a video between 1 byte and 50 MB."
        }
    }
}

private struct CoachAccountView: View {
    @ObservedObject var sessionStore: SessionStore
    let account: SignedInAccount
    let previewMode: Bool
    @State private var confirmSignOut = false

    var body: some View {
        List {
            Section("Coach account") {
                Label(account.email, systemImage: "person.crop.circle")
                    .font(FWBFont.body)
                Label("Coach access", systemImage: "checkmark.shield")
                    .foregroundStyle(Color.fwbMuted)
            }
            Section("Settings") {
                NavigationLink { CoachNotificationSettingsView(account: account, previewMode: previewMode) } label: { Label("Notifications", systemImage: "bell") }
            }
            Section {
                Button("Sign out", role: .destructive) { confirmSignOut = true }
                    .disabled(previewMode)
                    .accessibilityIdentifier("coach.account.signOut")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.fwbBackground)
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Sign out of your coach account?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await sessionStore.signOut() } }
            Button("Cancel", role: .cancel) { }
        }
    }
}

private struct CoachWorkspaceLoadStatus: View {
    @ObservedObject var store: CoachWorkspaceStore
    var body: some View {
        if store.isLoading {
            HStack(spacing: 12) { ProgressView(); Text("Loading coach workspace…").font(FWBFont.subheadline) }
                .frame(maxWidth: .infinity, alignment: .leading).fwbCard()
        }
        if let message = store.errorMessage {
            VStack(alignment: .leading, spacing: 10) {
                Label(message, systemImage: "exclamationmark.circle").font(FWBFont.subheadline).foregroundStyle(Color.fwbRed)
                Button("Retry") { Task { await store.reload() } }.disabled(store.isLoading)
            }.frame(maxWidth: .infinity, alignment: .leading).fwbCard()
        }
    }
}

private struct CoachWorkspaceLinkLabel: View {
    let title: String
    let subtitle: String
    let icon: String
    var showsArrow = true
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(FWBFont.title3).foregroundStyle(Color.fwbLime).frame(width: 32).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(FWBFont.headline.weight(.bold)).foregroundStyle(Color.fwbWarmWhite)
                Text(subtitle).font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .multilineTextAlignment(.leading)
            if showsArrow { Image(systemName: "chevron.right").font(FWBFont.caption.weight(.bold)).foregroundStyle(Color.fwbMuted).accessibilityHidden(true) }
        }
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
    }
}

private struct CoachWorkspaceEmpty: View {
    let icon: String
    let title: String
    let message: String
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: icon).font(FWBFont.headline.weight(.bold))
            Text(message).font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
        }.frame(maxWidth: .infinity, alignment: .leading).fwbCard()
    }
}

private enum CoachWorkspaceDisplay {
    static func label(_ raw: String) -> String { raw.replacingOccurrences(of: "_", with: " ").fwbTitleCased }
    static func dayKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    static func date(_ value: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: String(value.prefix(10)))?.formatted(date: .abbreviated, time: .omitted) ?? value
    }
    static func eventDay(_ value: String) -> String {
        guard value.count > 10 else { return String(value.prefix(10)) }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value) else { return String(value.prefix(10)) }
        return dayKey(date)
    }
    static func time(_ value: String) -> String {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return (fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value))?.formatted(date: .omitted, time: .shortened) ?? "Time unavailable"
    }
    static func demoURL(_ value: String) -> URL? {
        guard let url = URL(string: value), url.scheme?.lowercased() == "https", url.user == nil, url.password == nil, let host = url.host?.lowercased() else { return nil }
        let youtube = ["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"].contains(host)
        let uploaded = host.hasSuffix(".supabase.co") && url.path.hasPrefix("/storage/v1/object/public/exercise-videos/")
        return youtube || uploaded ? url : nil
    }
}

#if DEBUG
struct CoachWorkspaceAuditRootView: View {
    private static let account = SignedInAccount(id: UUID(uuidString: "C0AC4000-0000-4000-8000-000000000001")!, email: "coach@example.com", role: .coach)
    @StateObject private var sessionStore = SessionStore(previewAccount: account)
    @StateObject private var store = CoachWorkspaceStore(previewPrograms: [
        CoachClientProgram(raw: [
            "id": .string("C11E0000-0000-4000-8000-000000000001"), "client_email": .string("alex@example.com"),
            "client_name": .string("Alex Morgan"), "program_title": .string("Strength Foundations"),
            "initials": .string("AM"), "active": .bool(true), "client_archived": .bool(false),
            "session_count_total": .number(12), "session_count_used": .number(10),
            "session_dates": .array([.string(CoachWorkspaceDisplay.dayKey(Date()))]), "workouts": .array([])
        ]),
        CoachClientProgram(raw: [
            "id": .string("C11E0000-0000-4000-8000-000000000002"), "client_email": .string("jordan@example.com"),
            "client_name": .string("Jordan Lee"), "program_title": .string("Build and Move"),
            "initials": .string("JL"), "active": .bool(true), "client_archived": .bool(false),
            "session_count_total": .number(12), "session_count_used": .number(4), "workouts": .array([])
        ])
    ], library: [
        ["id": .string("E0000000-0000-4000-8000-000000000001"), "name": .string("Dumbbell Floor Press"), "primary_muscle": .string("chest"), "equipment": .string("dumbbell"), "difficulty": .string("beginner"), "movement_pattern": .string("horizontal_push"), "default_sets": .number(3), "default_reps": .string("8–12"), "default_rest_seconds": .number(75), "is_active": .bool(true), "is_approved": .bool(true)],
        ["id": .string("E0000000-0000-4000-8000-000000000002"), "name": .string("Goblet Squat"), "primary_muscle": .string("quads"), "equipment": .string("dumbbell"), "difficulty": .string("beginner"), "movement_pattern": .string("squat"), "default_sets": .number(3), "default_reps": .string("8–12"), "default_rest_seconds": .number(90), "is_active": .bool(true), "is_approved": .bool(true)]
    ], recentLogs: [
        ["client_email": .string("alex@example.com"), "workout_title": .string("Lower Body Strength"), "entry_date": .string(CoachWorkspaceDisplay.dayKey(Date()))]
    ])

    var body: some View {
        CoachRootView(
            sessionStore: sessionStore, account: Self.account, store: store, previewMode: true,
            initialTab: ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix("--coach-audit-tab=") })
                .flatMap { CoachWorkspaceTab(rawValue: String($0.dropFirst("--coach-audit-tab=".count))) } ?? .home
        )
        .preferredColorScheme(ProcessInfo.processInfo.arguments.contains("--force-dark-audit") ? .dark : .light)
    }
}
#endif
