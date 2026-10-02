import SwiftUI

struct CoachNotificationRoute: Equatable {
    enum Section: String {
        case overview, profile, program, workouts, food, progress, notes, logs, sessions
    }
    let section: Section
    let programID: UUID?
    let clientEmail: String?

    /// Interpret the existing web notification contract; never navigate to its URL.
    static func parse(webURL raw: String?) -> CoachNotificationRoute? {
        guard let raw, !raw.isEmpty, let url = URLComponents(string: raw),
              url.path == "/coach-admin.html", url.user == nil, url.password == nil,
              url.fragment == nil else { return nil }
        if url.scheme != nil || url.host != nil {
            guard url.scheme?.lowercased() == "https", url.host?.lowercased() == "benjaminbenz.com",
                  url.port == nil || url.port == 443 else { return nil }
        } else {
            guard raw.hasPrefix("/coach-admin.html"), !raw.hasPrefix("//") else { return nil }
        }
        let items = url.queryItems ?? []
        for name in ["tab", "client", "client_email"] where items.filter({ $0.name == name }).count > 1 { return nil }
        let tab = items.first { $0.name == "tab" }?.value ?? "clients"
        let section: Section
        switch tab {
        case "home", "clients", "library", "notifications": section = .overview
        case "nutrition", "food": section = .food
        default: guard let value = Section(rawValue: tab) else { return nil }; section = value
        }
        let client = items.first { $0.name == "client" }?.value
        let programID = client.flatMap(UUID.init(uuidString:))
        if let client, !client.isEmpty, programID == nil { return nil }
        let email = items.first { $0.name == "client_email" }?.value.map { ContinuitySync.normalize(email: $0) }
        if let email, email.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) == nil { return nil }
        return CoachNotificationRoute(section: section, programID: programID, clientEmail: email)
    }

    @MainActor func client(in workspace: CoachWorkspaceStore) -> CoachClientProgram? {
        if let programID { return workspace.programs.first { $0.id == programID } }
        if let clientEmail { return workspace.programs(for: clientEmail).first }
        return nil
    }
}

struct CoachNotificationInboxView: View {
    @ObservedObject var store: NotificationInboxStore
    @ObservedObject var workspace: CoachWorkspaceStore
    @State private var unreadOnly = false
    @State private var markingRead = false

    private var notifications: [ClientNotification] { store.notifications.filter { !unreadOnly || $0.isUnread } }

    var body: some View {
        List {
            Section {
                Picker("Notifications", selection: $unreadOnly) {
                    Text("All").tag(false); Text("Unread").tag(true)
                }.pickerStyle(.segmented)
            }
            if case .failed(let message) = store.state {
                Section { Text(message).foregroundStyle(.red); Button("Try again") { Task { await reload() } } }
            } else if (store.state == .loading || store.state == .idle) && store.notifications.isEmpty && !workspace.isPreview {
                Section { ProgressView("Loading notifications…") }
            } else if notifications.isEmpty {
                Section { Text(unreadOnly ? "No unread notifications." : "No client updates yet.").foregroundStyle(.secondary) }
            }
            ForEach(notifications) { notification in
                NavigationLink {
                    CoachNotificationDetailView(notification: notification, store: store, workspace: workspace)
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Circle().fill(notification.isUnread ? Color.fwbLime : Color.clear).frame(width: 7, height: 7).padding(.top, 7)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(notification.title).font(.headline)
                            Text(notification.body).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
                            Text(notification.relativeDateLabel).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }.swipeActions {
                    if notification.isUnread && !workspace.isPreview {
                        Button("Mark read") { Task { await store.markRead(notification.id) } }.tint(Color.fwbLime)
                    }
                }
            }
        }
        .navigationTitle("Notifications").navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden).background(Color.fwbBackground)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(markingRead ? "Updating…" : "Read all") {
                    markingRead = true
                    Task { await store.markAllRead(); markingRead = false }
                }.disabled(markingRead || store.unreadCount == 0 || workspace.isPreview)
            }
        }
        .task { if !workspace.isPreview { await store.loadIfNeeded() } }
        .refreshable { await reload() }
    }
    private func reload() async { if !workspace.isPreview { await store.reload() } }
}

private struct CoachNotificationDetailView: View {
    let notification: ClientNotification
    @ObservedObject var store: NotificationInboxStore
    @ObservedObject var workspace: CoachWorkspaceStore
    private var route: CoachNotificationRoute? { CoachNotificationRoute.parse(webURL: notification.webURL) }

    var body: some View {
        List {
            Section {
                Text(notification.title).font(.title2.bold())
                Text(notification.body).textSelection(.enabled)
                Text(notification.relativeDateLabel).font(.caption).foregroundStyle(.secondary)
            }
            Section("Client workspace") {
                if let route, let client = route.client(in: workspace) {
                    NavigationLink {
                        CoachNotificationDestination(program: client, section: route.section, workspace: workspace)
                    } label: { Label("Open \(client.name)’s \(label(route.section))", systemImage: "person.crop.circle") }
                } else {
                    if route?.programID != nil || route?.clientEmail != nil {
                        Text("The linked client is unavailable. Refresh the client list or choose a client below.").foregroundStyle(.secondary)
                    } else {
                        Text("This update has no linked client. Choose a client to continue.").foregroundStyle(.secondary)
                    }
                    NavigationLink("Choose client") {
                        CoachNotificationClientPicker(workspace: workspace, section: route?.section ?? .overview)
                    }
                }
            }
        }
        .navigationTitle("Client update").navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden).background(Color.fwbBackground)
        .task { if !workspace.isPreview { await store.markRead(notification.id) } }
    }

    private func label(_ section: CoachNotificationRoute.Section) -> String {
        switch section {
        case .overview: "workspace"
        case .food: "nutrition"
        default: section.rawValue
        }
    }
}

private struct CoachNotificationClientPicker: View {
    @ObservedObject var workspace: CoachWorkspaceStore
    let section: CoachNotificationRoute.Section
    @State private var search = ""
    private var clients: [CoachClientProgram] {
        (workspace.clientPrograms(archived: false) + workspace.clientPrograms(archived: true))
            .filter { search.isEmpty || ($0.name + " " + $0.email).localizedCaseInsensitiveContains(search) }
    }
    var body: some View {
        List {
            if let error = workspace.errorMessage { Text(error).foregroundStyle(.red) }
            if clients.isEmpty { Text(workspace.isLoading ? "Loading clients…" : "No matching clients.").foregroundStyle(.secondary) }
            ForEach(clients) { client in
                NavigationLink {
                    CoachNotificationDestination(program: client, section: section, workspace: workspace)
                } label: {
                    VStack(alignment: .leading) { Text(client.name); Text(client.email).font(.caption).foregroundStyle(.secondary) }
                }
            }
        }.navigationTitle("Choose client").searchable(text: $search, prompt: "Name or email")
            .refreshable { await workspace.reload() }
    }
}

private struct CoachNotificationDestination: View {
    let program: CoachClientProgram
    let section: CoachNotificationRoute.Section
    @ObservedObject var workspace: CoachWorkspaceStore
    @ViewBuilder var body: some View {
        Group {
            switch section {
            case .overview: CoachClientDetailView(program: program, store: workspace)
            case .profile: CoachProfileEditor(program: program, store: workspace, section: .profile)
            case .program: CoachTrainingBlocksView(program: program, store: workspace)
            case .workouts: CoachClientWorkoutsView(program: program, store: workspace)
            case .food: CoachFoodView(program: program, store: workspace)
            case .progress: CoachClientProgressView(program: program, store: workspace)
            case .notes: CoachProfileEditor(program: program, store: workspace, section: .notes)
            case .logs: CoachClientLogsView(program: program, store: workspace)
            case .sessions: CoachProfileEditor(program: program, store: workspace, section: .sessions)
            }
        }.task(id: program.email) { workspace.selectProgram(program.id); await workspace.loadSelectedClient() }
    }
}
