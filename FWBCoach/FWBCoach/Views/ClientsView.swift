import SwiftUI

struct ClientsView: View {
    let session: AppSession
    @State private var searchText = ""

    private var filteredPrograms: [CoachProgram] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return session.programs }
        return session.programs.filter {
            $0.displayName.lowercased().contains(query) ||
            $0.clientEmail.lowercased().contains(query) ||
            $0.programTitle.lowercased().contains(query)
        }
    }

    var body: some View {
        Group {
            if session.isRefreshing && session.programs.isEmpty {
                ProgressView("Loading clients…")
            } else if filteredPrograms.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                List(filteredPrograms) { program in
                    NavigationLink(value: program) {
                        ClientRow(program: program)
                            .listRowInsets(EdgeInsets())
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .padding(.vertical, 5)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(FWBTheme.paper)
        .navigationTitle("Clients")
        .searchable(text: $searchText, prompt: "Name, email, or program")
        .refreshable { await session.refreshPrograms() }
        .navigationDestination(for: CoachProgram.self) { ProgramDetailView(program: $0) }
    }
}
