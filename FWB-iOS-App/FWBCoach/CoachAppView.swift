import SwiftUI

struct CoachAppView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var sessionStore = SessionStore()
    @StateObject private var workoutSyncStore = WorkoutOfflineSyncStore.shared
    @StateObject private var readinessSyncStore = ReadinessSyncStore.shared
    @AppStorage(AppAppearancePreference.modeKey) private var storedAppearanceMode = AppAppearanceMode.dark.rawValue
    @AppStorage(AppAppearancePreference.lightStartKey) private var lightStartMinute = AppAppearancePreference.defaultLightStart
    @AppStorage(AppAppearancePreference.darkStartKey) private var darkStartMinute = AppAppearancePreference.defaultDarkStart
    @State private var appearanceDate = Date()

    private var appearancePreference: AppAppearancePreference {
        AppAppearancePreference(
            mode: AppAppearanceMode(rawValue: storedAppearanceMode) ?? .dark,
            lightStartMinute: lightStartMinute,
            darkStartMinute: darkStartMinute
        )
    }

    private var appearanceTaskID: String {
        "\(storedAppearanceMode)|\(lightStartMinute)|\(darkStartMinute)"
    }

    private var effectiveColorScheme: ColorScheme {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--force-dark-audit") {
            return .dark
        }
        if ProcessInfo.processInfo.arguments.contains("--force-light-audit") {
            return .light
        }
#endif
        return appearancePreference.colorScheme(at: appearanceDate)
    }

    var body: some View {
        Group {
#if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--workout-input-audit") {
                WorkoutInputAuditRootView()
            } else if ProcessInfo.processInfo.environment["FWB_NOTIFICATIONS_PREVIEW"] == "1" {
                NotificationFeatureDebugRootView()
            } else if ProcessInfo.processInfo.environment["FWB_UI_AUDIT"] == "1"
                || ProcessInfo.processInfo.arguments.contains("--ui-audit") {
                ClientFeatureAuditRootView()
            } else {
                authenticatedContent
            }
#else
            authenticatedContent
#endif
        }
        .preferredColorScheme(effectiveColorScheme)
        .task(id: appearanceTaskID) {
            appearanceDate = Date()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                guard !Task.isCancelled else { return }
                appearanceDate = Date()
            }
        }
        .task {
            await sessionStore.restoreSession()
            await workoutSyncStore.retryPending()
            if case .signedIn(let account) = sessionStore.state {
                await readinessSyncStore.activate(clientEmail: account.email)
            }
        }
        .onChange(of: sessionStore.state) { state in
            guard case .signedIn(let account) = state else { return }
            Task {
                await readinessSyncStore.activate(clientEmail: account.email)
            }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            appearanceDate = Date()
            Task {
                await sessionStore.refreshSession()
                await workoutSyncStore.retryPending()
                if case .signedIn(let account) = sessionStore.state {
                    await readinessSyncStore.retryPending(clientEmail: account.email)
                }
                NotificationCenter.default.post(name: .fwbForegroundRefresh, object: nil)
            }
        }
    }

    @ViewBuilder
    private var authenticatedContent: some View {
        switch sessionStore.state {
        case .restoring:
            LaunchView()
        case .signedOut:
            LoginView(sessionStore: sessionStore)
        case .signedIn(let account):
            ClientRootView(sessionStore: sessionStore, account: account)
        }
    }
}

#if DEBUG
private struct WorkoutInputAuditRootView: View {
    private let workout = Workout(
        id: UUID(uuidString: "4D7E2631-9462-424D-9795-25A2E0BD2A55")!,
        title: "Workout Input Audit",
        focus: "Input regression",
        format: "custom",
        exercises: [
            Exercise(code: "A1", name: "Hip Thrust", prescription: "3 x 8-12")
        ]
    )

    var body: some View {
        NavigationStack {
            WorkoutLoggingView(
                workout: workout,
                clientEmail: "preview.client@example.com"
            )
            .navigationTitle("Input Audit")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
#endif

#if DEBUG
private struct ClientFeatureAuditRootView: View {
    private let account = SignedInAccount(
        id: UUID(uuidString: "A11D17A0-0000-4000-8000-000000000001")!,
        email: "preview.client@example.com"
    )
    @StateObject private var sessionStore: SessionStore
    private let initialTab: ClientRootTab

    init() {
        let account = SignedInAccount(
            id: UUID(uuidString: "A11D17A0-0000-4000-8000-000000000001")!,
            email: "preview.client@example.com"
        )
        _sessionStore = StateObject(wrappedValue: SessionStore(previewAccount: account))
        initialTab = switch ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix("--audit-tab=") }) {
        case "--audit-tab=workouts": .workouts
        case "--audit-tab=progress": .progress
        case "--audit-tab=macros": .macros
        case "--audit-tab=account": .account
        default: .today
        }
    }

    var body: some View {
        ClientRootView(
            sessionStore: sessionStore,
            account: account,
            programStore: ClientProgramStore(previewProgram: .preview),
            initialTab: initialTab
        )
    }
}
#endif

private struct LaunchView: View {
    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            VStack(spacing: 18) {
                FWBMark(size: 76)
                Text("FWB TRAINING")
                    .font(.title.weight(.black))
                    .fontWidth(.condensed)
                    .tracking(0.8)
                    .foregroundStyle(Color.fwbWarmWhite)
                ProgressView()
                    .tint(.fwbLime)
            }
        }
    }
}

#Preview {
    CoachAppView()
}
