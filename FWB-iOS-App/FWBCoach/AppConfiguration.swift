import Foundation
import Supabase

enum AppConfiguration {
    static let supabaseURL = URL(string: "https://qukdfjeupjhpthfbaonv.supabase.co")!
    static let supabasePublishableKey = "sb_publishable_qeOpd7yy_l0K2iwm7ri6VA_EqD7NOjy"
    static let coachEmail = "benjaminbenz.fit@gmail.com"

    static let clientWebPortalURL = URL(string: "https://benjaminbenz.com/client-dashboard.html")!
    static let coachWebPortalURL = URL(string: "https://benjaminbenz.com/coach-admin.html")!
    static let passwordResetURL = URL(string: "https://benjaminbenz.com/client-invite.html")!
    static let supportURL = URL(string: "mailto:fwb@benjaminbenz.com?subject=FWB%20Training%20support")!
    static let accountDeletionRequestURL = URL(string: "mailto:fwb@benjaminbenz.com?subject=FWB%20Training%20account%20deletion%20request")!

    static let supabase = SupabaseClient(
        supabaseURL: supabaseURL,
        supabaseKey: supabasePublishableKey,
        options: SupabaseClientOptions(
            auth: .init(
                storage: appAuthStorage,
                emitLocalSessionAsInitialSession: true
            )
        )
    )

    private static var appAuthStorage: any AuthLocalStorage {
        #if targetEnvironment(simulator)
        SimulatorAuthStorage()
        #else
        KeychainLocalStorage(service: "com.benjaminbenz.fwbcoach.auth")
        #endif
    }
}

#if targetEnvironment(simulator)
private struct SimulatorAuthStorage: AuthLocalStorage {
    private func namespaced(_ key: String) -> String {
        "com.benjaminbenz.fwbcoach.simulator-auth.\(key)"
    }

    func store(key: String, value: Data) throws {
        UserDefaults.standard.set(value, forKey: namespaced(key))
    }

    func retrieve(key: String) throws -> Data? {
        UserDefaults.standard.data(forKey: namespaced(key))
    }

    func remove(key: String) throws {
        UserDefaults.standard.removeObject(forKey: namespaced(key))
    }
}
#endif
