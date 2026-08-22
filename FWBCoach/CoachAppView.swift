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

    var body: some View {
        Group {
            switch sessionStore.state {
            case .restoring:
                LaunchView()
            case .signedOut:
                LoginView(sessionStore: sessionStore)
            case .signedIn(let account):
                ClientRootView(sessionStore: sessionStore, account: account)
            }
        }
        .preferredColorScheme(appearancePreference.colorScheme(at: appearanceDate))
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
                await workoutSyncStore.retryPending()
                if case .signedIn(let account) = sessionStore.state {
                    await readinessSyncStore.retryPending(clientEmail: account.email)
                }
            }
        }
    }
}

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
