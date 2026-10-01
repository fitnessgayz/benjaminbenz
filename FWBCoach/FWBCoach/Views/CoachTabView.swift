import SwiftUI

enum CoachTab: Hashable {
    case home
    case clients
    case settings
}

struct CoachTabView: View {
    let session: AppSession
    @State private var selectedTab: CoachTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                HomeView(session: session) {
                    selectedTab = .clients
                }
            }
            .tabItem { Label("Home", systemImage: "house.fill") }
            .tag(CoachTab.home)

            NavigationStack {
                ClientsView(session: session)
            }
            .tabItem { Label("Clients", systemImage: "person.2.fill") }
            .tag(CoachTab.clients)

            NavigationStack {
                SettingsView(session: session)
            }
            .tabItem { Label("Settings", systemImage: "gearshape.fill") }
            .tag(CoachTab.settings)
        }
        .tint(FWBTheme.ink)
        .task {
            if session.programs.isEmpty { await session.refreshPrograms() }
        }
    }
}
