import SwiftUI

struct SettingsView: View {
    let session: AppSession

    var body: some View {
        List {
            Section("Coach account") {
                LabeledContent("Signed in as", value: session.coachEmail)
                LabeledContent("Workspace", value: "FWB Client")
            }
            Section("Connection") {
                Label("Supabase sync active", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Programs and client details come from the same protected records used by FWB Client.")
                    .font(.footnote)
                    .foregroundStyle(FWBTheme.muted)
            }
            Section {
                Button("Sign out", role: .destructive) {
                    session.signOut()
                }
            }
        }
        .navigationTitle("Settings")
    }
}
