import SwiftUI

struct HomeView: View {
    let session: AppSession
    let showClients: () -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                header
                summaryGrid
                recentClients
                if let errorMessage = session.errorMessage {
                    Label(errorMessage, systemImage: "wifi.exclamationmark")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.red)
                }
            }
            .padding(20)
        }
        .background(FWBTheme.paper)
        .refreshable { await session.refreshPrograms() }
        .navigationTitle("Coach home")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await session.refreshPrograms() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(session.isRefreshing)
                .accessibilityLabel("Refresh clients")
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TODAY")
                .font(.caption.weight(.black))
                .tracking(2)
                .foregroundStyle(FWBTheme.muted)
            Text("Your coaching snapshot")
                .font(.system(size: 36, weight: .black, design: .rounded))
            Text("Live data shared with the FWB Client app.")
                .foregroundStyle(FWBTheme.muted)
        }
    }

    private var summaryGrid: some View {
        Grid(horizontalSpacing: 12, verticalSpacing: 12) {
            GridRow {
                SummaryCard(value: "\(session.programs.count)", label: "Active clients", systemImage: "person.2.fill")
                SummaryCard(
                    value: "\(session.programs.reduce(0) { $0 + $1.sessionsRemaining })",
                    label: "Sessions left",
                    systemImage: "calendar"
                )
            }
        }
    }

    private var recentClients: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Clients")
                    .font(.title2.weight(.black))
                Spacer()
                Button("View all", action: showClients)
                    .font(.subheadline.weight(.bold))
            }
            if session.isRefreshing && session.programs.isEmpty {
                ProgressView("Loading clients…")
                    .frame(maxWidth: .infinity, minHeight: 140)
            } else if session.programs.isEmpty {
                ContentUnavailableView(
                    "No active clients",
                    systemImage: "person.2",
                    description: Text("Active client programs will appear here.")
                )
            } else {
                ForEach(session.programs.prefix(4)) { program in
                    NavigationLink(value: program) {
                        ClientRow(program: program)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .navigationDestination(for: CoachProgram.self) { ProgramDetailView(program: $0) }
    }
}

private struct SummaryCard: View {
    let value: String
    let label: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: systemImage)
                .font(.title2.weight(.bold))
            Text(value)
                .font(.system(size: 38, weight: .black, design: .rounded))
            Text(label)
                .font(.footnote.weight(.bold))
                .foregroundStyle(FWBTheme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.white, in: RoundedRectangle(cornerRadius: 20))
    }
}

struct ClientRow: View {
    let program: CoachProgram

    var body: some View {
        HStack(spacing: 14) {
            Text(program.displayInitials)
                .font(.subheadline.weight(.black))
                .frame(width: 48, height: 48)
                .background(FWBTheme.lime, in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(program.displayName)
                    .font(.headline)
                Text(program.programTitle)
                    .font(.subheadline)
                    .foregroundStyle(FWBTheme.muted)
                    .lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text("\(program.sessionsRemaining)")
                    .font(.headline)
                Text("left")
                    .font(.caption)
                    .foregroundStyle(FWBTheme.muted)
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.black))
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 18))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(program.displayName), \(program.programTitle), \(program.sessionsRemaining) sessions remaining")
    }
}

#Preview {
    NavigationStack {
        HomeView(session: AppSession(), showClients: {})
    }
}
