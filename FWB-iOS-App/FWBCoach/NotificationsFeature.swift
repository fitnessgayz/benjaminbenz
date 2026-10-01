import Foundation
import Supabase
import SwiftUI
import UIKit
import UserNotifications

struct ClientNotification: Codable, Identifiable, Equatable {
    let id: UUID
    let userID: UUID
    let kind: String
    let title: String
    let body: String
    let createdAt: String
    var readAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userID = "user_id"
        case kind
        case title
        case body
        case createdAt = "created_at"
        case readAt = "read_at"
    }

    var isUnread: Bool { readAt == nil }

    var category: ClientNotificationCategory {
        ClientNotificationCategory(rawValue: kind) ?? .general
    }

    var relativeDateLabel: String {
        guard let date = NotificationDateParser.date(from: createdAt) else { return "Recently" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

enum ClientNotificationCategory: String, CaseIterable {
    case coachReply = "coach_reply"
    case programUpdate = "program_update"
    case workoutReminder = "workout_reminder"
    case achievement
    case weeklyCheckIn = "weekly_check_in"
    case general

    var label: String {
        switch self {
        case .coachReply: "Coach reply"
        case .programUpdate: "Program update"
        case .workoutReminder: "Workout reminder"
        case .achievement: "Achievement"
        case .weeklyCheckIn: "Weekly check-in"
        case .general: "FWB update"
        }
    }

    var icon: String {
        switch self {
        case .coachReply: "bubble.left.and.bubble.right.fill"
        case .programUpdate: "list.clipboard.fill"
        case .workoutReminder: "figure.strengthtraining.traditional"
        case .achievement: "trophy.fill"
        case .weeklyCheckIn: "checklist"
        case .general: "bell.fill"
        }
    }
}

private enum NotificationDateParser {
    static func date(from value: String) -> Date? {
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractionalFormatter.date(from: value) {
            return date
        }

        return ISO8601DateFormatter().date(from: value)
    }
}

private struct NotificationReadUpdate: Encodable {
    let readAt: String

    enum CodingKeys: String, CodingKey {
        case readAt = "read_at"
    }
}

@MainActor
final class NotificationInboxStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var notifications: [ClientNotification]

    private let accountID: UUID
    private let client: SupabaseClient
    private let defaults: UserDefaults
    private var pendingReadIDs: Set<UUID>

    init(
        accountID: UUID,
        client: SupabaseClient = AppConfiguration.supabase,
        defaults: UserDefaults = .standard,
        previewNotifications: [ClientNotification] = []
    ) {
        self.accountID = accountID
        self.client = client
        self.defaults = defaults

        let cached = Self.loadCachedNotifications(accountID: accountID, defaults: defaults)
        notifications = previewNotifications.isEmpty ? cached : previewNotifications
        pendingReadIDs = Self.loadPendingReadIDs(accountID: accountID, defaults: defaults)
        state = previewNotifications.isEmpty ? .idle : .loaded
    }

    var unreadCount: Int {
        notifications.filter(\.isUnread).count
    }

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await reload()
    }

    func reload() async {
        if notifications.isEmpty {
            state = .loading
        }

        do {
            var records: [ClientNotification] = try await client
                .from("client_notifications")
                .select("id,user_id,kind,title,body,created_at,read_at")
                .eq("user_id", value: accountID.uuidString)
                .order("created_at", ascending: false)
                .limit(100)
                .execute()
                .value

            let pendingTimestamp = ISO8601DateFormatter().string(from: Date())
            for index in records.indices where pendingReadIDs.contains(records[index].id) {
                records[index].readAt = pendingTimestamp
            }

            notifications = records
            saveCache()
            state = .loaded
            await retryPendingReadReceipts()
        } catch is CancellationError {
            return
        } catch {
            if notifications.isEmpty {
                state = .failed(
                    "Your notification inbox is not available yet. Pull to refresh after notification setup is activated."
                )
            } else {
                state = .loaded
            }
        }
    }

    func markRead(_ notificationID: UUID) async {
        guard let index = notifications.firstIndex(where: { $0.id == notificationID }),
              notifications[index].isUnread else { return }

        let timestamp = ISO8601DateFormatter().string(from: Date())
        notifications[index].readAt = timestamp
        pendingReadIDs.insert(notificationID)
        saveCache()
        savePendingReadIDs()
        await uploadReadReceipt(notificationID: notificationID, timestamp: timestamp)
    }

    func markAllRead() async {
        let unreadIDs = notifications.filter(\.isUnread).map(\.id)
        for id in unreadIDs {
            await markRead(id)
        }
    }

    private func retryPendingReadReceipts() async {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        for id in pendingReadIDs {
            await uploadReadReceipt(notificationID: id, timestamp: timestamp)
        }
    }

    private func uploadReadReceipt(notificationID: UUID, timestamp: String) async {
        do {
            try await client
                .from("client_notifications")
                .update(NotificationReadUpdate(readAt: timestamp))
                .eq("id", value: notificationID.uuidString)
                .eq("user_id", value: accountID.uuidString)
                .execute()

            pendingReadIDs.remove(notificationID)
            savePendingReadIDs()
        } catch is CancellationError {
            return
        } catch {
            // The local read state is retained and retried on the next refresh.
        }
    }

    private var cacheKey: String { "notificationInbox.\(accountID.uuidString)" }
    private var pendingReadKey: String { "notificationPendingReads.\(accountID.uuidString)" }

    private func saveCache() {
        guard let data = try? JSONEncoder().encode(notifications) else { return }
        defaults.set(data, forKey: cacheKey)
    }

    private func savePendingReadIDs() {
        defaults.set(pendingReadIDs.map(\.uuidString), forKey: pendingReadKey)
    }

    private static func loadCachedNotifications(accountID: UUID, defaults: UserDefaults) -> [ClientNotification] {
        let key = "notificationInbox.\(accountID.uuidString)"
        guard let data = defaults.data(forKey: key),
              let records = try? JSONDecoder().decode([ClientNotification].self, from: data) else {
            return []
        }
        return records
    }

    private static func loadPendingReadIDs(accountID: UUID, defaults: UserDefaults) -> Set<UUID> {
        let key = "notificationPendingReads.\(accountID.uuidString)"
        let values = defaults.stringArray(forKey: key) ?? []
        return Set(values.compactMap(UUID.init(uuidString:)))
    }
}

struct NotificationPreferences: Codable, Equatable {
    var coachReplies = true
    var programUpdates = true
    var workoutReminders = true
    var achievements = true
    var weeklyCheckIns = true
}

private struct NotificationPreferencesRecord: Codable {
    let userID: UUID
    let coachReplies: Bool
    let programUpdates: Bool
    let workoutReminders: Bool
    let achievements: Bool
    let weeklyCheckIns: Bool
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case coachReplies = "coach_replies"
        case programUpdates = "program_updates"
        case workoutReminders = "workout_reminders"
        case achievements
        case weeklyCheckIns = "weekly_check_ins"
        case updatedAt = "updated_at"
    }

    init(userID: UUID, preferences: NotificationPreferences) {
        self.userID = userID
        coachReplies = preferences.coachReplies
        programUpdates = preferences.programUpdates
        workoutReminders = preferences.workoutReminders
        achievements = preferences.achievements
        weeklyCheckIns = preferences.weeklyCheckIns
        updatedAt = ISO8601DateFormatter().string(from: Date())
    }

    var preferences: NotificationPreferences {
        NotificationPreferences(
            coachReplies: coachReplies,
            programUpdates: programUpdates,
            workoutReminders: workoutReminders,
            achievements: achievements,
            weeklyCheckIns: weeklyCheckIns
        )
    }
}

@MainActor
final class NotificationPreferenceStore: ObservableObject {
    @Published private(set) var preferences: NotificationPreferences
    @Published private(set) var isLoading = false
    @Published private(set) var syncMessage = "Preferences are saved on this iPhone."

    private let accountID: UUID
    private let client: SupabaseClient
    private let defaults: UserDefaults
    private var saveTask: Task<Void, Never>?

    init(
        accountID: UUID,
        client: SupabaseClient = AppConfiguration.supabase,
        defaults: UserDefaults = .standard
    ) {
        self.accountID = accountID
        self.client = client
        self.defaults = defaults

        if let data = defaults.data(forKey: Self.cacheKey(accountID: accountID)),
           let saved = try? JSONDecoder().decode(NotificationPreferences.self, from: data) {
            preferences = saved
        } else {
            preferences = NotificationPreferences()
        }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let rows: [NotificationPreferencesRecord] = try await client
                .from("client_notification_preferences")
                .select()
                .eq("user_id", value: accountID.uuidString)
                .limit(1)
                .execute()
                .value

            if let row = rows.first {
                preferences = row.preferences
                persistLocally()
                syncMessage = "Preferences are synced with your FWB account."
            } else {
                await sync()
            }
        } catch is CancellationError {
            return
        } catch {
            syncMessage = "Saved on this iPhone. Account sync will begin after notification setup is activated."
        }
    }

    func set(_ keyPath: WritableKeyPath<NotificationPreferences, Bool>, to enabled: Bool) {
        preferences[keyPath: keyPath] = enabled
        persistLocally()
        syncMessage = "Saving…"

        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 450_000_000)
            guard !Task.isCancelled else { return }
            await sync()
        }
    }

    private func sync() async {
        do {
            try await client
                .from("client_notification_preferences")
                .upsert(
                    NotificationPreferencesRecord(userID: accountID, preferences: preferences),
                    onConflict: "user_id"
                )
                .execute()
            syncMessage = "Preferences are synced with your FWB account."
        } catch is CancellationError {
            return
        } catch {
            syncMessage = "Saved on this iPhone. Account sync will begin after notification setup is activated."
        }
    }

    private func persistLocally() {
        guard let data = try? JSONEncoder().encode(preferences) else { return }
        defaults.set(data, forKey: Self.cacheKey(accountID: accountID))
    }

    private static func cacheKey(accountID: UUID) -> String {
        "notificationPreferences.\(accountID.uuidString)"
    }
}

@MainActor
final class SystemNotificationPermissionStore: ObservableObject {
    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published private(set) var isWorking = false
    @Published private(set) var message = ""

    private let center = UNUserNotificationCenter.current()

    var authorizationTitle: String {
        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral: "Allowed"
        case .denied: "Off in iPhone Settings"
        case .notDetermined: "Not requested"
        @unknown default: "Not confirmed"
        }
    }

    var authorizationDetail: String {
        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            "FWB can show local alerts and is ready to register this device when remote push is activated."
        case .denied:
            "FWB cannot show local or future coach alerts unless you allow notifications in iPhone Settings."
        case .notDetermined:
            "Choose Allow Notifications when you’re ready. FWB asks only after you tap the button below."
        @unknown default:
            "Your current notification permission could not be confirmed."
        }
    }

    var remoteFoundationDetail: String {
#if targetEnvironment(simulator)
        "The Simulator cannot receive a production APNs device token. Test final device registration on an iPhone after Apple push capability is enabled."
#else
        "This build contains the APNs token handoff. Registration will complete only after Apple push capability and server credentials are activated."
#endif
    }

    func refresh() async {
        authorizationStatus = await center.notificationSettings().authorizationStatus
    }

    func requestAuthorization() async {
        isWorking = true
        message = ""
        defer { isWorking = false }

        do {
            _ = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            await refresh()

            if authorizationStatus == .authorized
                || authorizationStatus == .provisional
                || authorizationStatus == .ephemeral {
                PushRegistrationCoordinator.shared.registerForRemoteNotificationsIfAvailable()
                message = "Notification permission is ready on this iPhone."
            } else {
                message = "Notifications remain off."
            }
        } catch is CancellationError {
            return
        } catch {
            message = "Notification permission could not be requested. Please try again."
        }
    }
}

struct NotificationInboxView: View {
    enum Filter: String, CaseIterable, Identifiable {
        case all = "All"
        case unread = "Unread"

        var id: String { rawValue }
    }

    @ObservedObject var store: NotificationInboxStore
    @State private var filter: Filter = .all

    private var visibleNotifications: [ClientNotification] {
        switch filter {
        case .all: store.notifications
        case .unread: store.notifications.filter(\.isUnread)
        }
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            content
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .toolbar {
            if store.unreadCount > 0 {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Mark All Read") {
                        Task { await store.markAllRead() }
                    }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                    .accessibilityIdentifier("notifications.markAllRead")
                }
            }
        }
        .task {
            await store.loadIfNeeded()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch store.state {
        case .idle, .loading:
            if store.notifications.isEmpty {
                ProgressView("Loading notifications…")
                    .tint(Color.fwbLime)
                    .foregroundStyle(Color.fwbMuted)
            } else {
                inboxList
            }
        case .failed(let message):
            if store.notifications.isEmpty {
                FWBErrorState(message: message) {
                    Task { await store.reload() }
                }
            } else {
                inboxList
            }
        case .loaded:
            if store.notifications.isEmpty {
                FWBEmptyState(
                    icon: "bell.slash",
                    title: "You’re all caught up",
                    message: "Coach replies, program updates, reminders, and achievements will appear here."
                )
            } else {
                inboxList
            }
        }
    }

    private var inboxList: some View {
        List {
            Section {
                Picker("Notification filter", selection: $filter) {
                    ForEach(Filter.allCases) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.fwbBackground)
                .listRowInsets(EdgeInsets(top: 10, leading: 20, bottom: 10, trailing: 20))
            }

            if visibleNotifications.isEmpty {
                Section {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 36))
                            .foregroundStyle(Color.fwbLime)
                        Text("No unread notifications")
                            .font(.headline.weight(.black))
                        Text("New coaching updates will appear here when they arrive.")
                            .font(.subheadline)
                            .foregroundStyle(Color.fwbMuted)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 34)
                    .listRowBackground(Color.fwbBackground)
                    .listRowSeparator(.hidden)
                }
            } else {
                Section("LATEST") {
                    ForEach(visibleNotifications) { notification in
                        NavigationLink {
                            NotificationDetailView(notification: notification, store: store)
                        } label: {
                            NotificationRow(notification: notification)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Color.fwbCard)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            if notification.isUnread {
                                Button {
                                    Task { await store.markRead(notification.id) }
                                } label: {
                                    Label("Mark Read", systemImage: "envelope.open.fill")
                                }
                                .tint(Color.fwbLime)
                            }
                        }
                    }
                }
                .textCase(nil)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable {
            await store.reload()
        }
    }
}

private struct NotificationRow: View {
    let notification: ClientNotification

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: notification.category.icon)
                .font(.headline)
                .foregroundStyle(notification.isUnread ? Color.black : Color.fwbLime)
                .frame(width: 42, height: 42)
                .background(notification.isUnread ? Color.fwbAccentFill : Color.fwbSurface, in: Rectangle())

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(notification.category.label.uppercased())
                        .font(.caption2.weight(.black))
                        .tracking(0.8)
                        .foregroundStyle(notification.isUnread ? Color.fwbLime : Color.fwbMuted)

                    Spacer()

                    Text(notification.relativeDateLabel)
                        .font(.caption)
                        .foregroundStyle(Color.fwbMuted)
                }

                Text(notification.title)
                    .font(.headline.weight(notification.isUnread ? .black : .semibold))
                    .foregroundStyle(Color.fwbWarmWhite)

                Text(notification.body)
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .lineLimit(2)
            }

            if notification.isUnread {
                Circle()
                    .fill(Color.fwbLime)
                    .frame(width: 8, height: 8)
                    .padding(.top, 6)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(notification.isUnread ? "Unread" : "Read"), \(notification.category.label), \(notification.title), \(notification.body), \(notification.relativeDateLabel)"
        )
    }
}

private struct NotificationDetailView: View {
    let notification: ClientNotification
    @ObservedObject var store: NotificationInboxStore

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack(spacing: 12) {
                        Image(systemName: notification.category.icon)
                            .font(.title3)
                            .foregroundStyle(Color.black)
                            .frame(width: 48, height: 48)
                            .background(Color.fwbAccentFill, in: Rectangle())

                        VStack(alignment: .leading, spacing: 3) {
                            Text(notification.category.label.uppercased())
                                .font(.footnote.weight(.black))
                                .tracking(1)
                                .foregroundStyle(Color.fwbLime)
                            Text(notification.relativeDateLabel)
                                .font(.footnote)
                                .foregroundStyle(Color.fwbMuted)
                        }
                    }

                    FWBRule()

                    Text(notification.title)
                        .font(.largeTitle.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)

                    Text(notification.body)
                        .font(.body)
                        .foregroundStyle(Color.fwbWarmWhite.opacity(0.9))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .fwbCard()
                .padding(20)
            }
        }
        .navigationTitle("Update")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .task {
            await store.markRead(notification.id)
        }
    }
}

struct NotificationPreferencesView: View {
    @StateObject private var store: NotificationPreferenceStore
    @StateObject private var permissionStore = SystemNotificationPermissionStore()

    init(account: SignedInAccount) {
        _store = StateObject(wrappedValue: NotificationPreferenceStore(accountID: account.id))
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    SectionHeading(kicker: "STAY IN THE LOOP", title: "Notification Preferences")
                    permissionCard
                    categoryCard
                    deliveryFoundationCard
                }
                .padding(20)
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .task {
            await permissionStore.refresh()
            await store.load()
        }
    }

    private var permissionCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: permissionIcon)
                    .font(.title3)
                    .foregroundStyle(Color.black)
                    .frame(width: 44, height: 44)
                    .background(Color.fwbAccentFill, in: Rectangle())

                VStack(alignment: .leading, spacing: 3) {
                    Text("IPHONE PERMISSION")
                        .font(.footnote.bold())
                        .tracking(1)
                        .foregroundStyle(Color.fwbLime)
                    Text(permissionStore.authorizationTitle)
                        .font(.title3.weight(.black))
                        .fontWidth(.condensed)
                }
            }

            Text(permissionStore.authorizationDetail)
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            if !permissionStore.message.isEmpty {
                Text(permissionStore.message)
                    .font(.footnote)
                    .foregroundStyle(Color.fwbWarmWhite)
            }

            if permissionStore.authorizationStatus == .notDetermined {
                Button {
                    Task { await permissionStore.requestAuthorization() }
                } label: {
                    if permissionStore.isWorking {
                        ProgressView().tint(.black)
                    } else {
                        Text("ALLOW NOTIFICATIONS")
                    }
                }
                .buttonStyle(FWBPrimaryButtonStyle())
                .disabled(permissionStore.isWorking)
                .accessibilityIdentifier("notifications.requestPermission")
            }

            if permissionStore.authorizationStatus == .denied,
               let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                Link(destination: settingsURL) {
                    Label("OPEN IPHONE SETTINGS", systemImage: "gear")
                }
                .buttonStyle(FWBSecondaryButtonStyle())
            }
        }
        .fwbCard()
    }

    private var categoryCard: some View {
        VStack(alignment: .leading, spacing: 15) {
            Label("WHAT YOU RECEIVE", systemImage: "slider.horizontal.3")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)

            preferenceToggle(
                title: "Coach replies",
                detail: "Feedback on workouts, exercises, and form checks",
                icon: "bubble.left.and.bubble.right.fill",
                keyPath: \.coachReplies
            )
            FWBRule()
            preferenceToggle(
                title: "Program updates",
                detail: "New or changed workouts from your coach",
                icon: "list.clipboard.fill",
                keyPath: \.programUpdates
            )
            FWBRule()
            preferenceToggle(
                title: "Workout reminders",
                detail: "Scheduled training and missed-workout nudges",
                icon: "figure.strengthtraining.traditional",
                keyPath: \.workoutReminders
            )
            FWBRule()
            preferenceToggle(
                title: "Weekly check-ins",
                detail: "Prompts and coach follow-up for your weekly review",
                icon: "checklist",
                keyPath: \.weeklyCheckIns
            )
            FWBRule()
            preferenceToggle(
                title: "Achievements",
                detail: "Personal bests and meaningful training milestones",
                icon: "trophy.fill",
                keyPath: \.achievements
            )

            Text(store.syncMessage)
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("notifications.preferenceSyncStatus")
        }
        .fwbCard()
    }

    private var deliveryFoundationCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("REMOTE DELIVERY STATUS", systemImage: "antenna.radiowaves.left.and.right")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)

            Text("Push-ready foundation")
                .font(.title3.weight(.black))
                .fontWidth(.condensed)

            Text(permissionStore.remoteFoundationDetail)
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            Label(
                "The in-app inbox and local workout reminders do not depend on production remote push.",
                systemImage: "info.circle.fill"
            )
            .font(.footnote)
            .foregroundStyle(Color.fwbWarmWhite)
        }
        .fwbCard()
    }

    private var permissionIcon: String {
        switch permissionStore.authorizationStatus {
        case .authorized, .provisional, .ephemeral: "checkmark.bell.fill"
        case .denied: "bell.slash.fill"
        default: "bell.badge.fill"
        }
    }

    private func preferenceToggle(
        title: String,
        detail: String,
        icon: String,
        keyPath: WritableKeyPath<NotificationPreferences, Bool>
    ) -> some View {
        Toggle(
            isOn: Binding(
                get: { store.preferences[keyPath: keyPath] },
                set: { store.set(keyPath, to: $0) }
            )
        ) {
            Label {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.bold))
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
            } icon: {
                Image(systemName: icon)
                    .foregroundStyle(Color.fwbLime)
                    .frame(width: 24)
            }
        }
        .tint(Color.fwbLime)
    }
}

#if DEBUG
struct NotificationFeatureDebugRootView: View {
    private let account: SignedInAccount
    @StateObject private var store: NotificationInboxStore

    init() {
        let account = SignedInAccount(
            id: UUID(uuidString: "F0B00000-0000-4000-8000-000000000003")!,
            email: "client@example.com"
        )
        self.account = account
        _store = StateObject(
            wrappedValue: NotificationInboxStore(
                accountID: account.id,
                previewNotifications: [
                    ClientNotification(
                        id: UUID(uuidString: "F0B00000-0000-4000-8000-000000000101")!,
                        userID: account.id,
                        kind: "coach_reply",
                        title: "Great work on today’s session",
                        body: "Your tempo looked strong. Keep the same load next week and aim for one more controlled rep.",
                        createdAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-900)),
                        readAt: nil
                    ),
                    ClientNotification(
                        id: UUID(uuidString: "F0B00000-0000-4000-8000-000000000102")!,
                        userID: account.id,
                        kind: "program_update",
                        title: "Your Friday workout was updated",
                        body: "Two accessory movements were adjusted based on your latest check-in.",
                        createdAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-7_200)),
                        readAt: nil
                    ),
                    ClientNotification(
                        id: UUID(uuidString: "F0B00000-0000-4000-8000-000000000103")!,
                        userID: account.id,
                        kind: "achievement",
                        title: "New personal best",
                        body: "You built on your previous result without sacrificing form.",
                        createdAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-86_400)),
                        readAt: ISO8601DateFormatter().string(from: Date())
                    )
                ]
            )
        )
    }

    var body: some View {
        NavigationStack {
            NotificationInboxView(store: store)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        NavigationLink("Preferences") {
                            NotificationPreferencesView(account: account)
                        }
                        .font(.subheadline.weight(.bold))
                        .accessibilityIdentifier("notifications.debugPreferences")
                    }
                }
        }
        .tint(Color.fwbLime)
    }
}
#endif

#Preview("Notification inbox") {
    let accountID = UUID()
    let store = NotificationInboxStore(
        accountID: accountID,
        previewNotifications: [
            ClientNotification(
                id: UUID(),
                userID: accountID,
                kind: "coach_reply",
                title: "Great work on today’s session",
                body: "Your tempo looked strong. Keep the same load next week and aim for one more controlled rep.",
                createdAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-900)),
                readAt: nil
            ),
            ClientNotification(
                id: UUID(),
                userID: accountID,
                kind: "program_update",
                title: "Your Friday workout was updated",
                body: "Two accessory movements were adjusted based on your check-in.",
                createdAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-86_400)),
                readAt: ISO8601DateFormatter().string(from: Date())
            )
        ]
    )

    NavigationStack {
        NotificationInboxView(store: store)
    }
    .preferredColorScheme(.dark)
}
