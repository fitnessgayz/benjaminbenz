import Foundation
import Observation

@MainActor
@Observable
final class AppSession {
    enum Phase {
        case restoring
        case signedOut
        case signedIn
    }

    private(set) var phase: Phase = .restoring
    private(set) var programs: [CoachProgram] = []
    private(set) var coachEmail = ""
    private(set) var isRefreshing = false
    var errorMessage: String?

    private let api: SupabaseClient
    private let keychain: KeychainStore
    private var authSession: AuthSession?

    init(api: SupabaseClient = SupabaseClient(), keychain: KeychainStore = KeychainStore()) {
        self.api = api
        self.keychain = keychain
    }

    func restore() async {
        guard phase == .restoring else { return }
        do {
            guard let data = try keychain.read() else {
                phase = .signedOut
                return
            }
            let saved = try JSONDecoder().decode(AuthSession.self, from: data)
            let refreshed = try await api.refresh(refreshToken: saved.refreshToken)
            try accept(refreshed)
            await refreshPrograms()
        } catch {
            try? keychain.delete()
            authSession = nil
            phase = .signedOut
        }
    }

    func signIn(email: String, password: String) async {
        errorMessage = nil
        do {
            let session = try await api.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                password: password
            )
            try accept(session)
            await refreshPrograms()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshPrograms() async {
        guard let authSession else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            programs = try await api.fetchActivePrograms(accessToken: authSession.accessToken)
            errorMessage = nil
        } catch let error as SupabaseError {
            if case .server(let status, _) = error, status == 401 {
                await refreshSessionAndPrograms()
            } else {
                errorMessage = error.localizedDescription
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        try? keychain.delete()
        authSession = nil
        coachEmail = ""
        programs = []
        errorMessage = nil
        phase = .signedOut
    }

    private func refreshSessionAndPrograms() async {
        guard let authSession else { return }
        do {
            let refreshed = try await api.refresh(refreshToken: authSession.refreshToken)
            try accept(refreshed)
            programs = try await api.fetchActivePrograms(accessToken: refreshed.accessToken)
            errorMessage = nil
        } catch {
            signOut()
            errorMessage = "Your session expired. Sign in again."
        }
    }

    private func accept(_ session: AuthSession) throws {
        let email = session.user.email?.lowercased() ?? ""
        guard email == AppConfiguration.coachEmail else {
            throw CoachAccessError.notAuthorized
        }
        let data = try JSONEncoder().encode(session)
        try keychain.save(data)
        authSession = session
        coachEmail = email
        phase = .signedIn
    }
}

enum CoachAccessError: LocalizedError {
    case notAuthorized

    var errorDescription: String? {
        "This account is not configured for the FWB Coach app."
    }
}
