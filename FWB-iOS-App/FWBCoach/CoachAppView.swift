import SwiftUI

/// The client native app lives in fitnessgayz/fwb-ios. This app has no client
/// launch destination, including when an old client session is restored.
struct CoachAppView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var sessionStore = SessionStore()

    var body: some View {
        authenticatedContent
            .preferredColorScheme(.light)
            .onOpenURL { url in
                Task { _ = await sessionStore.handleIncomingURL(url) }
            }
            .task { await sessionStore.restoreSession() }
            .onChange(of: scenePhase) { phase in
                guard phase == .active else { return }
                Task {
                    await sessionStore.refreshSession()
                    if case .signedIn(let account) = sessionStore.state, account.isCoach {
                        await WorkoutOfflineSyncStore.coachStore(accountID: account.id).retryPending()
                    }
                    NotificationCenter.default.post(name: .fwbForegroundRefresh, object: nil)
                }
            }
    }

    @ViewBuilder
    private var authenticatedContent: some View {
        switch sessionStore.state {
        case .restoring:
            ZStack {
                Color.fwbBackground.ignoresSafeArea()
                VStack(spacing: 20) {
                    FWBMark(size: 76)
                    Text("FWB Coach").font(FWBFont.title.weight(.bold))
                    ProgressView().tint(Color.fwbLime)
                }
            }
        case .signedOut:
            LoginView(sessionStore: sessionStore)
        case .passwordRecovery:
            PasswordChangeView(sessionStore: sessionStore, isRecovery: true)
        case .signedIn(let account):
            if account.isCoach {
                CoachRootView(sessionStore: sessionStore, account: account).id(account.id)
            } else {
                // Defense in depth: even a mistakenly injected client state
                // never creates the client training workspace in this bundle.
                LoginView(sessionStore: sessionStore)
                    .task { await sessionStore.signOut() }
            }
        }
    }
}
