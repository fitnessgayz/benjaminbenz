import SwiftUI

struct ProgramDetailView: View {
    let program: CoachProgram

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                identity
                sessionCard
                DetailCard(title: "Program", systemImage: "square.stack.3d.up.fill") {
                    DetailValue(label: "Title", value: program.programTitle)
                    DetailValue(label: "Summary", value: program.programSummary, fallback: "No summary yet")
                    DetailValue(label: "Goal", value: program.fitnessGoal, fallback: "Not set")
                    DetailValue(label: "Focus", value: program.focusTarget, fallback: "Not set")
                }
                DetailCard(title: "Starting point", systemImage: "chart.line.uptrend.xyaxis") {
                    DetailValue(label: "Height", value: program.height)
                    DetailValue(label: "Weight", value: program.startingWeight)
                    DetailValue(label: "Body fat", value: program.startingBodyfat)
                }
                DetailCard(title: "Coach note", systemImage: "note.text") {
                    DetailValue(label: program.coachNoteTitle.isEmpty ? "Current note" : program.coachNoteTitle,
                                value: program.coachNoteBody,
                                fallback: "No coach note yet")
                }
                contactActions
            }
            .padding(20)
        }
        .background(FWBTheme.paper)
        .navigationTitle(program.displayName)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var identity: some View {
        HStack(spacing: 16) {
            Text(program.displayInitials)
                .font(.title2.weight(.black))
                .frame(width: 68, height: 68)
                .background(FWBTheme.lime, in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(program.displayName)
                    .font(.title.weight(.black))
                Text(program.clientEmail)
                    .font(.subheadline)
                    .foregroundStyle(FWBTheme.muted)
            }
        }
    }

    private var sessionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Sessions", systemImage: "calendar")
                    .font(.headline)
                Spacer()
                Text("\(program.sessionCountUsed) of \(program.sessionCountTotal) used")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(FWBTheme.muted)
            }
            ProgressView(value: program.sessionProgress)
                .tint(FWBTheme.lime)
                .scaleEffect(x: 1, y: 2, anchor: .center)
            Text("\(program.sessionsRemaining) remaining")
                .font(.title2.weight(.black))
        }
        .padding(20)
        .background(FWBTheme.ink, in: RoundedRectangle(cornerRadius: 22))
        .foregroundStyle(.white)
    }

    @ViewBuilder
    private var contactActions: some View {
        if let emailURL = URL(string: "mailto:\(program.clientEmail)") {
            Link(destination: emailURL) {
                Label("Email client", systemImage: "envelope.fill")
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.plain)
            .fontWeight(.black)
            .foregroundStyle(FWBTheme.ink)
            .background(FWBTheme.lime, in: RoundedRectangle(cornerRadius: 16))
        }
    }
}

private struct DetailCard<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label(title, systemImage: systemImage)
                .font(.headline.weight(.black))
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(.white, in: RoundedRectangle(cornerRadius: 22))
    }
}

private struct DetailValue: View {
    let label: String
    let value: String
    var fallback = "Not set"

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.caption2.weight(.black))
                .tracking(1.2)
                .foregroundStyle(FWBTheme.muted)
            Text(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : value)
                .font(.body.weight(.semibold))
        }
    }
}

#Preview {
    NavigationStack { ProgramDetailView(program: .preview) }
}
