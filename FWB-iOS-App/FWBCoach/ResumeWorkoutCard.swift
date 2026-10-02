import SwiftUI

private struct ActiveWorkoutSessionStoreKey: EnvironmentKey {
    static let defaultValue: ActiveWorkoutSessionStore? = nil
}

extension EnvironmentValues {
    var activeWorkoutSessionStore: ActiveWorkoutSessionStore? {
        get { self[ActiveWorkoutSessionStoreKey.self] }
        set { self[ActiveWorkoutSessionStoreKey.self] = newValue }
    }
}

/// Both tabs link to the same account-scoped active session.
struct ResumeWorkoutCard: View {
    @Environment(\.activeWorkoutSessionStore) private var store

    var body: some View {
        if let store { ActiveWorkoutResumeCard(store: store) }
    }
}

private struct ActiveWorkoutResumeCard: View {
    @ObservedObject var store: ActiveWorkoutSessionStore

    var body: some View {
        Group {
            if let session = store.session {
                VStack(alignment: .leading, spacing: 12) {
                    Text("WORKOUT IN PROGRESS")
                        .font(FWBFont.caption.weight(.bold))
                        .foregroundStyle(Color.fwbLime)
                    Text(session.workout.title.fwbWorkoutDisplayTitle)
                        .font(FWBFont.title3.weight(.bold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Pick up where you left off.")
                        .font(FWBFont.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                    NavigationLink(value: session) {
                        Label("Resume workout", systemImage: "play.fill")
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .accessibilityIdentifier("workout.resume")
                    if let message = store.storageError {
                        Text(message).font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
                    }
                }
                .fwbCard()
            }
        }
    }
}
