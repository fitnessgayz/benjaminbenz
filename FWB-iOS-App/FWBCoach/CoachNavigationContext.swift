import SwiftUI

// Shared exercise logging and messaging pause their UI when their containing
// coach tab is not selected. These keys retain compatibility with those modules.
private struct ClientNavigationTabIDKey: EnvironmentKey {
    static let defaultValue = "home"
}

private struct ClientNavigationTabIsSelectedKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var clientNavigationTabID: String {
        get { self[ClientNavigationTabIDKey.self] }
        set { self[ClientNavigationTabIDKey.self] = newValue }
    }

    var clientNavigationTabIsSelected: Bool {
        get { self[ClientNavigationTabIsSelectedKey.self] }
        set { self[ClientNavigationTabIsSelectedKey.self] = newValue }
    }
}
