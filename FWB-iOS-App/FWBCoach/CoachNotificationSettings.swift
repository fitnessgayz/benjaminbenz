import SwiftUI
import Supabase
import UserNotifications
import UIKit

enum CoachNotificationCategory: String, CaseIterable, Identifiable {
    case workoutCompleted = "client_workout_completed"
    case workoutComments = "client_workout_comments"
    case checkIns = "client_check_ins"
    case progress = "client_progress_updates"
    case nutrition = "client_nutrition_activity"
    case formChecks = "client_form_checks"
    case dexa = "client_dexa_uploads"
    case questionnaires = "client_questionnaires"
    case coachRequests = "client_coach_requests"
    case sessionBalance = "client_session_balance"
    case inactivity = "client_inactivity"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .workoutCompleted: "Completed workouts"
        case .workoutComments: "Workout comments"
        case .checkIns: "Client check-ins"
        case .progress: "Progress updates"
        case .nutrition: "Nutrition activity"
        case .formChecks: "Form-check videos"
        case .dexa: "DEXA uploads"
        case .questionnaires: "Questionnaires"
        case .coachRequests: "Coach requests"
        case .sessionBalance: "Low session balances"
        case .inactivity: "Client inactivity"
        }
    }
    var deployedKey: String {
        switch self {
        case .workoutCompleted: "workout_completed"
        case .workoutComments, .coachRequests: "client_message"
        case .checkIns: "check_in_submitted"
        case .progress: "progress_submitted"
        case .nutrition: "nutrition_activity"
        case .formChecks: "form_check_submitted"
        case .dexa: "dexa_uploaded"
        case .questionnaires: "questionnaire_submitted"
        case .sessionBalance: "low_sessions"
        case .inactivity: "inactivity"
        }
    }
}

enum CoachNotificationSchema: Equatable {
    case modern, deployed
    var table: String { self == .modern ? "client_notification_preferences" : "fwb_notification_settings" }

    static func permitsFallback(_ error: Error) -> Bool {
        guard let error = error as? PostgrestError, let code = error.code else { return false }
        return ["42703", "42P01", "PGRST204", "PGRST205"].contains(code)
    }
}

struct CoachNotificationValues: Equatable {
    var pushEnabled = false
    var categories = Dictionary(uniqueKeysWithValues: CoachNotificationCategory.allCases.map { ($0, true) })

    init(row: CoachJSONObject? = nil, schema: CoachNotificationSchema = .modern) {
        guard let row else { return }
        pushEnabled = row.bool("push_enabled")
        for category in CoachNotificationCategory.allCases {
            categories[category] = schema == .modern
                ? row.bool(category.rawValue, default: true)
                : row.object("categories").bool(category.deployedKey, default: true)
        }
    }

    mutating func set(_ category: CoachNotificationCategory, enabled: Bool, schema: CoachNotificationSchema) {
        categories[category] = enabled
        if schema == .deployed {
            for linked in CoachNotificationCategory.allCases where linked.deployedKey == category.deployedKey {
                categories[linked] = enabled
            }
        }
    }

    /// Only changed coach preferences are patched. Existing client/shared settings survive.
    func payload(userID: UUID, baseline: Self, latest: CoachJSONObject?, schema: CoachNotificationSchema) -> CoachJSONObject {
        var payload: CoachJSONObject = ["user_id": .string(userID.uuidString)]
        if latest == nil || pushEnabled != baseline.pushEnabled { payload["push_enabled"] = .bool(pushEnabled) }
        var categoryChanges: CoachJSONObject = [:]
        for category in CoachNotificationCategory.allCases where latest == nil || categories[category] != baseline.categories[category] {
            let key = schema == .modern ? category.rawValue : category.deployedKey
            categoryChanges[key] = .bool(categories[category] ?? true)
        }
        if schema == .modern {
            payload.merge(categoryChanges, uniquingKeysWith: { _, new in new })
        } else if !categoryChanges.isEmpty {
            payload["categories"] = .object((latest?.object("categories") ?? [:]).merging(categoryChanges, uniquingKeysWith: { _, new in new }))
        }
        return payload
    }
}

@MainActor
protocol CoachNotificationPreferencesBackend {
    func read(table: String, columns: String, userID: UUID) async throws -> CoachJSONObject?
    func upsert(table: String, values: CoachJSONObject, userID: UUID) async throws -> CoachJSONObject
}

@MainActor
private final class SupabaseCoachNotificationPreferencesBackend: CoachNotificationPreferencesBackend {
    let client: SupabaseClient
    init(client: SupabaseClient = AppConfiguration.supabase) { self.client = client }

    private func requireAccount(_ id: UUID) throws {
        guard client.auth.currentUser?.id == id else {
            throw CoachWorkspaceError(message: "Your sign-in changed. Reopen notification settings after signing in.")
        }
    }
    func read(table: String, columns: String, userID: UUID) async throws -> CoachJSONObject? {
        try requireAccount(userID)
        let rows: [CoachJSONObject] = try await client.from(table).select(columns)
            .eq("user_id", value: userID.uuidString).limit(1).execute().value
        return rows.first
    }
    func upsert(table: String, values: CoachJSONObject, userID: UUID) async throws -> CoachJSONObject {
        try requireAccount(userID)
        return try await client.from(table).upsert(values, onConflict: "user_id").select().single().execute().value
    }
}

@MainActor
final class CoachNotificationSettingsStore: ObservableObject {
    @Published private(set) var values = CoachNotificationValues()
    @Published private(set) var schema = CoachNotificationSchema.modern
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published private(set) var didLoad = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var statusMessage: String?
    private let account: SignedInAccount
    private let backend: (any CoachNotificationPreferencesBackend)?
    private var baseline = CoachNotificationValues()
    private var savedRow: CoachJSONObject?

    init(account: SignedInAccount, previewMode: Bool = false, backend: (any CoachNotificationPreferencesBackend)? = nil) {
        self.account = account
        self.backend = previewMode ? nil : (backend ?? SupabaseCoachNotificationPreferencesBackend())
    }
    var hasChanges: Bool { values != baseline }
    func setPush(_ enabled: Bool) { values.pushEnabled = enabled; statusMessage = nil }
    func setCategory(_ category: CoachNotificationCategory, enabled: Bool) {
        values.set(category, enabled: enabled, schema: schema)
        statusMessage = nil
    }

    func load() async {
        guard !isLoading, !isSaving else { return }
        guard account.isCoach else { errorMessage = "Coach access is required."; return }
        guard let backend else { didLoad = true; return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            do {
                _ = try await backend.read(table: CoachNotificationSchema.modern.table, columns: "user_id,push_enabled,client_workout_completed", userID: account.id)
                schema = .modern
            } catch {
                guard CoachNotificationSchema.permitsFallback(error) else { throw error }
                schema = .deployed
            }
            let row = try await backend.read(table: schema.table, columns: "*", userID: account.id)
            guard !Task.isCancelled else { return }
            savedRow = row
            values = CoachNotificationValues(row: row, schema: schema)
            baseline = values
            didLoad = true
        } catch is CancellationError {
            return
        } catch {
            errorMessage = "Notification preferences could not load. \(error.localizedDescription)"
        }
    }

    func save() async {
        guard didLoad, !isSaving, !isLoading, account.isCoach else { return }
        isSaving = true
        errorMessage = nil
        statusMessage = nil
        defer { isSaving = false }
        guard let backend else {
            baseline = values
            statusMessage = "Preview preferences saved on this screen."
            return
        }
        do {
            // Read immediately before merging a JSON category object to retain unrelated edits.
            let latest = schema == .deployed
                ? try await backend.read(table: schema.table, columns: "*", userID: account.id)
                : savedRow
            let payload = values.payload(userID: account.id, baseline: baseline, latest: latest, schema: schema)
            guard payload.count > 1 else { statusMessage = "Preferences are already up to date."; return }
            let saved = try await backend.upsert(table: schema.table, values: payload, userID: account.id)
            savedRow = saved
            values = CoachNotificationValues(row: saved, schema: schema)
            baseline = values
            statusMessage = "Notification preferences saved."
        } catch {
            errorMessage = "Preferences weren’t saved. \(error.localizedDescription)"
        }
    }
}

struct CoachNotificationSettingsView: View {
    let account: SignedInAccount
    let previewMode: Bool
    @StateObject private var store: CoachNotificationSettingsStore
    @StateObject private var permissionStore = SystemNotificationPermissionStore()
    @State private var localTestMessage: String?
    @State private var isTesting = false
    @State private var registrationMessage: String?

    init(account: SignedInAccount, previewMode: Bool = false) {
        self.account = account
        self.previewMode = previewMode
        _store = StateObject(wrappedValue: CoachNotificationSettingsStore(account: account, previewMode: previewMode))
    }

    private var permissionGranted: Bool {
        [.authorized, .provisional, .ephemeral].contains(permissionStore.authorizationStatus)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Coach notifications").font(FWBFont.title2.weight(.bold))
                    Text("Choose which client updates you want to hear about. Changes are applied when you save.")
                        .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                }
                permissionCard
                if store.isLoading { ProgressView("Loading preferences…") }
                if let error = store.errorMessage {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(error, systemImage: "exclamationmark.circle").font(FWBFont.subheadline).foregroundStyle(Color.fwbRed)
                        if !store.didLoad { Button("Retry") { Task { await store.load() } } }
                    }.fwbCard()
                }
                if store.didLoad {
                    preferencesCard
                    Button(store.isSaving ? "Saving…" : "Save preferences") { Task { await store.save() } }
                        .buttonStyle(FWBPrimaryButtonStyle()).disabled(store.isSaving || store.isLoading)
                        .accessibilityIdentifier("coach.notifications.save")
                }
                if let status = store.statusMessage {
                    Text(status).font(FWBFont.subheadline).foregroundStyle(Color.fwbLime)
                }
                deliveryCard
            }.padding(FWBLayout.pagePadding)
        }
        .background(Color.fwbBackground)
        .foregroundStyle(Color.fwbWarmWhite)
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .tint(Color.fwbLime)
        .task {
            await store.load()
            if !previewMode { await permissionStore.refresh() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .fwbNotificationRegistrationStatusChanged)) { notification in
            registrationMessage = notification.object as? String
        }
    }

    private var permissionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("This iPhone", systemImage: "iphone").font(FWBFont.headline.weight(.bold))
            Text(previewMode ? "Permission preview" : permissionStore.authorizationTitle)
                .font(FWBFont.subheadline.weight(.bold))
            Text("Allow notifications to see alerts on this device. Saving your event preferences is separate from iPhone permission.")
                .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
            if permissionStore.authorizationStatus == .denied {
                Button("Open iPhone Settings") {
                    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                    UIApplication.shared.open(url)
                }.buttonStyle(FWBSecondaryButtonStyle())
            } else {
                Button(permissionGranted ? "Register this iPhone" : "Allow notifications") {
                    Task {
                        guard !previewMode else { localTestMessage = "Device permission stays unchanged in preview."; return }
                        await permissionStore.requestAuthorization()
                        if permissionGranted { await PushRegistrationCoordinator.shared.activate(account: account) }
                    }
                }
                .buttonStyle(FWBSecondaryButtonStyle())
                .disabled(permissionStore.isWorking)
                .accessibilityIdentifier("coach.notifications.permission")
            }
            if !permissionStore.message.isEmpty { Text(permissionStore.message).font(FWBFont.footnote).foregroundStyle(Color.fwbMuted) }
        }
        .fwbCard()
    }

    private var preferencesCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Toggle("Push notifications", isOn: Binding(get: { store.values.pushEnabled }, set: store.setPush))
                .font(FWBFont.headline.weight(.bold))
            FWBRule()
            ForEach(CoachNotificationCategory.allCases) { category in
                Toggle(category.title, isOn: Binding(
                    get: { store.values.categories[category] ?? true },
                    set: { store.setCategory(category, enabled: $0) }
                ))
                .font(FWBFont.body)
                .accessibilityIdentifier("coach.notifications.\(category.rawValue)")
            }
            if store.schema == .deployed {
                Text("Workout comments and coach requests share one message setting for this account.")
                    .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
            }
        }
        .disabled(store.isSaving)
        .fwbCard()
    }

    private var deliveryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Test an alert").font(FWBFont.headline.weight(.bold))
            Text("A local test checks this iPhone’s alert permission. Client push alerts also need the app’s remote notification service to be active; a local test does not confirm remote delivery.")
                .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
            if let registrationMessage { Text(registrationMessage).font(FWBFont.footnote).foregroundStyle(Color.fwbMuted) }
            Button(isTesting ? "Scheduling…" : "Send a local test alert", action: sendTest)
                .buttonStyle(FWBSecondaryButtonStyle()).disabled(isTesting)
                .accessibilityIdentifier("coach.notifications.test")
            if let localTestMessage { Text(localTestMessage).font(FWBFont.footnote).foregroundStyle(Color.fwbMuted) }
        }.fwbCard()
    }

    private func sendTest() {
        guard !previewMode else { localTestMessage = "Preview only. No alert was scheduled."; return }
        isTesting = true
        Task {
            defer { isTesting = false }
            await permissionStore.refresh()
            guard permissionGranted else { localTestMessage = "Allow notifications on this iPhone before sending a test."; return }
            let content = UNMutableNotificationContent()
            content.title = "FWB coach alert"
            content.body = "Your local test notification is ready."
            content.sound = .default
            do {
                try await UNUserNotificationCenter.current().add(UNNotificationRequest(
                    identifier: "fwb.coach.local-test",
                    content: content,
                    trigger: UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
                ))
                localTestMessage = "A local test is scheduled in five seconds."
            } catch { localTestMessage = "The test could not be scheduled. \(error.localizedDescription)" }
        }
    }
}
