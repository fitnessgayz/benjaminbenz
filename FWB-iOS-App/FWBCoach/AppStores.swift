import Foundation
import Supabase

/// Identity comes from Supabase Auth. Editable profile metadata is deliberately absent.
struct SessionAuthIdentity: Equatable {
    let id: UUID
    let email: String?
}

@MainActor
protocol SessionAuthenticating {
    var currentSession: Session? { get }
    var authStateChanges: AsyncStream<(event: AuthChangeEvent, session: Session?)> { get }
    func restore() async throws -> SessionAuthIdentity
    func signIn(email: String, password: String) async throws -> SessionAuthIdentity
    func refresh() async throws -> SessionAuthIdentity
    func role(for identity: SessionAuthIdentity) async throws -> AccountRole
    func resetPassword(email: String) async throws
    func recoverPassword(from url: URL) async throws
    func updatePassword(_ password: String) async throws
    func signOut() async throws
}

extension SessionAuthenticating {
    var currentSession: Session? { nil }
    var authStateChanges: AsyncStream<(event: AuthChangeEvent, session: Session?)> {
        AsyncStream { $0.finish() }
    }
    func recoverPassword(from url: URL) async throws { throw AuthError.sessionMissing }
    func updatePassword(_ password: String) async throws { throw AuthError.sessionMissing }
}

/// This receipt permits only a previously verified client shell during a network outage.
/// It never stores coach access and is unrelated to the display-only remembered profile.
@MainActor
final class VerifiedClientSessionStore {
    private struct Receipt: Codable {
        let accountID: UUID
        let email: String
    }
    private static let key = "fwb.verified-client-session.v1"
    private let defaults: UserDefaults?
    private var receipt: Receipt?

    init(defaults: UserDefaults? = nil) {
        self.defaults = defaults
        receipt = defaults?.data(forKey: Self.key).flatMap { try? JSONDecoder().decode(Receipt.self, from: $0) }
    }
    func remember(_ account: SignedInAccount) {
        guard !account.isCoach else { clear(); return }
        let saved = Receipt(accountID: account.id, email: ContinuitySync.normalize(email: account.email))
        receipt = saved
        if let data = try? JSONEncoder().encode(saved) { defaults?.set(data, forKey: Self.key) }
    }
    func verifiedClient(for session: Session?) -> SignedInAccount? {
        guard let session, let email = session.user.email.map({ ContinuitySync.normalize(email: $0) }),
              let receipt, receipt.accountID == session.user.id, receipt.email == email else { return nil }
        return SignedInAccount(id: receipt.accountID, email: email, role: .client)
    }
    func clear() { receipt = nil; defaults?.removeObject(forKey: Self.key) }
}

private enum SessionAccessError: Error {
    case authentication(Error)
    case roleResolution(Error)
    case invalidIdentity
    case coachRequired
}

@MainActor
private struct SupabaseSessionAuthentication: SessionAuthenticating {
    let client: SupabaseClient

    var currentSession: Session? { client.auth.currentSession }
    var authStateChanges: AsyncStream<(event: AuthChangeEvent, session: Session?)> { client.auth.authStateChanges }

    func restore() async throws -> SessionAuthIdentity {
        guard client.auth.currentSession != nil else { throw AuthError.sessionMissing }
        return identity(try await client.auth.session)
    }

    func signIn(email: String, password: String) async throws -> SessionAuthIdentity {
        identity(try await client.auth.signIn(email: email, password: password))
    }

    func refresh() async throws -> SessionAuthIdentity {
        // Supabase refreshes expired tokens here; avoid forced rotation on every foreground.
        identity(try await client.auth.session)
    }

    func role(for identity: SessionAuthIdentity) async throws -> AccountRole {
        // Verify the session identity with Auth, then ask the same server policy that
        // protects the coach tables. No email constant, selector, or metadata grants access.
        let user = try await client.auth.user()
        guard user.id == identity.id,
              user.email?.lowercased() == identity.email?.lowercased(),
              client.auth.currentSession?.user.id == identity.id else {
            throw SessionAccessError.invalidIdentity
        }
        let isCoach: Bool = try await client.rpc("is_coach_admin").execute().value
        guard client.auth.currentSession?.user.id == identity.id else {
            throw SessionAccessError.invalidIdentity
        }
        return isCoach ? .coach : .client
    }

    func resetPassword(email: String) async throws {
        try await client.auth.resetPasswordForEmail(email, redirectTo: AppConfiguration.passwordResetURL)
    }

    func recoverPassword(from url: URL) async throws {
        _ = try await client.auth.session(from: url)
    }

    func updatePassword(_ password: String) async throws {
        try await client.auth.update(user: UserAttributes(password: password))
    }

    func signOut() async throws {
        // The SDK removes persisted local credentials before attempting the network request.
        try await client.auth.signOut(scope: .local)
    }

    private func identity(_ session: Session) -> SessionAuthIdentity {
        SessionAuthIdentity(id: session.user.id, email: session.user.email)
    }
}

@MainActor
final class SessionStore: ObservableObject {
    enum State: Equatable {
        case restoring
        case signedOut
        case passwordRecovery
        case signedIn(SignedInAccount)
    }

    @Published private(set) var state: State = .restoring
    @Published private(set) var isSubmitting = false
    @Published private(set) var canRetryAccess = false
    @Published private(set) var passwordMessage: String?
    @Published var message: String?

    private enum Operation {
        case restore, refresh, signIn(email: String, password: String)
    }

    private let authentication: any SessionAuthenticating
    // This shipping app is coach-only. Shared regression fixtures may opt out
    // through the injected authenticator initializer, never the production one.
    private let requiredRole: AccountRole?
    private let prepareForSignOut: @MainActor () async -> Void
    private let verifiedClients: VerifiedClientSessionStore
    private var didRestore = false
    private var operationVersion = 0
    private var accessTask: Task<SignedInAccount, Error>?
    private var authEventsTask: Task<Void, Never>?
    private var isSigningOut = false
    private var retryIntent: AccountRole = .client
    private var acceptsSessionEvents = true
    private var pendingSessionCleanups = 0

    init(client: SupabaseClient = AppConfiguration.supabase) {
        authentication = SupabaseSessionAuthentication(client: client)
        requiredRole = AppConfiguration.requiredAccountRole
        verifiedClients = VerifiedClientSessionStore(defaults: .standard)
        prepareForSignOut = {
            RestTimerNotificationManager.shared.cancel()
            await PushRegistrationCoordinator.shared.deactivateCurrentDeviceToken()
        }
    }

    init(authentication: any SessionAuthenticating, requiredRole: AccountRole? = nil, verifiedClients: VerifiedClientSessionStore? = nil, prepareForSignOut: @escaping @MainActor () async -> Void = {}) {
        self.authentication = authentication
        self.requiredRole = requiredRole
        self.verifiedClients = verifiedClients ?? VerifiedClientSessionStore()
        self.prepareForSignOut = prepareForSignOut
    }

#if DEBUG
    init(previewAccount: SignedInAccount, client: SupabaseClient = AppConfiguration.supabase) {
        authentication = SupabaseSessionAuthentication(client: client)
        requiredRole = .coach
        verifiedClients = VerifiedClientSessionStore()
        prepareForSignOut = {}
        state = .signedIn(previewAccount)
        didRestore = true
    }
#endif

    deinit {
        accessTask?.cancel()
        authEventsTask?.cancel()
    }

    func restoreSession() async {
        guard !didRestore else { return }
        didRestore = true
        observeAuthentication()
        await resolve(.restore)
    }

    func refreshSession() async {
        guard case .signedIn = state else { return }
        await resolve(.refresh)
    }

    func retryAccess() async {
        guard canRetryAccess else { return }
        await resolve(.restore, intent: retryIntent)
    }

    func clearPasswordMessage() {
        passwordMessage = nil
    }

    func signIn(email: String, password: String, intent: AccountRole = .client) async {
        guard !isSubmitting, !isSigningOut, pendingSessionCleanups == 0 else { return }
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty, !password.isEmpty else {
            message = "Enter your email and password."
            return
        }
        didRestore = true
        // A buffered logout belongs to the previous session until this credential
        // request returns. It must not cancel the new account's sign-in.
        acceptsSessionEvents = false
        observeAuthentication()
        await resolve(.signIn(email: normalizedEmail, password: password), intent: intent)
    }

    func sendPasswordReset(email: String) async {
        guard !isSubmitting, !isSigningOut, pendingSessionCleanups == 0 else { return }
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty else {
            message = "Enter your email first, then request a reset link."
            return
        }
        isSubmitting = true
        message = nil
        operationVersion += 1
        let version = operationVersion
        do {
            try await authentication.resetPassword(email: normalizedEmail)
            guard version == operationVersion else { return }
            message = "If that account exists, a reset link was sent. Open it on this iPhone to choose a new password."
        } catch {
            guard version == operationVersion else { return }
            message = "The reset link could not be sent. Please try again."
        }
        isSubmitting = false
    }

    func handleIncomingURL(_ url: URL) async -> Bool {
        guard AppConfiguration.isPasswordResetURL(url) else { return false }
        guard !isSigningOut, pendingSessionCleanups == 0 else { return true }
        didRestore = true
        observeAuthentication()
        operationVersion += 1
        accessTask?.cancel()
        accessTask = nil
        acceptsSessionEvents = true
        canRetryAccess = false
        isSubmitting = true
        message = nil
        passwordMessage = nil
        state = .restoring
        do {
            try await authentication.recoverPassword(from: url)
            state = .passwordRecovery
        } catch {
            state = .signedOut
            message = "That reset link is invalid or has expired. Request a new link and open it on this iPhone."
            if authentication.currentSession != nil { try? await clearStoredSession() }
        }
        isSubmitting = false
        return true
    }

    @discardableResult
    func changePassword(_ password: String, confirmation: String, isRecovery: Bool = false) async -> Bool {
        guard !isSubmitting, !isSigningOut, pendingSessionCleanups == 0 else { return false }
        guard password.count >= 8 else {
            passwordMessage = "Use at least 8 characters."
            return false
        }
        guard password == confirmation else {
            passwordMessage = "The passwords do not match."
            return false
        }
        if isRecovery {
            guard state == .passwordRecovery else { return false }
        } else {
            guard case .signedIn = state else { return false }
        }

        isSubmitting = true
        passwordMessage = nil
        do {
            try await authentication.updatePassword(password)
            if isRecovery {
                acceptsSessionEvents = false
                verifiedClients.clear()
                try? await clearStoredSession()
                state = .signedOut
                message = "Password updated. Sign in with your new password."
            } else {
                passwordMessage = "Your password has been updated."
            }
            isSubmitting = false
            return true
        } catch {
            passwordMessage = "We couldn't update your password. Please try again."
            isSubmitting = false
            return false
        }
    }

    func signOut() async {
        guard !isSigningOut else { return }
        isSigningOut = true
        acceptsSessionEvents = false
        verifiedClients.clear()
        operationVersion += 1
        let version = operationVersion
        let pending = accessTask
        pending?.cancel()
        state = .signedOut
        canRetryAccess = false
        isSubmitting = true
        message = nil
        // A late sign-in/refresh response must finish before clearing SDK storage.
        // Cancellation alone does not guarantee that a transport stops its response.
        _ = await pending?.result
        await prepareForSignOut()
        do {
            try await clearStoredSession()
        } catch {
            if version == operationVersion { message = "You were signed out on this device." }
        }
        guard version == operationVersion else { return }
        accessTask = nil
        isSigningOut = false
        isSubmitting = false
    }

    /// Supabase sends this when a session expires or is revoked outside this screen.
    func sessionWasRevoked() {
        guard !isSigningOut else { return }
        acceptsSessionEvents = false
        verifiedClients.clear()
        operationVersion += 1
        accessTask?.cancel()
        accessTask = nil
        state = .signedOut
        isSubmitting = false
        canRetryAccess = false
        message = "Your session has ended. Please sign in again."
    }

    private func revalidateAccess() async {
        guard case .signedIn = state else { return }
        await resolve(.restore)
    }

    private func observeAuthentication() {
        guard authEventsTask == nil else { return }
        let changes = authentication.authStateChanges
        authEventsTask = Task { [weak self] in
            for await change in changes {
                guard !Task.isCancelled else { return }
                await self?.handleAuthChange(change.event)
            }
        }
    }

    private func handleAuthChange(_ event: AuthChangeEvent) async {
        switch event {
        case .initialSession:
            return // A buffered initial event must not undo a later explicit sign-out.
        case .signedOut, .userDeleted:
            guard authentication.currentSession == nil || event == .userDeleted else { return }
            if acceptsSessionEvents { sessionWasRevoked() }
            if event == .userDeleted, authentication.currentSession != nil { try? await clearStoredSession() }
        case .passwordRecovery:
            guard !isSigningOut, acceptsSessionEvents else { return }
            operationVersion += 1
            accessTask?.cancel()
            accessTask = nil
            canRetryAccess = false
            isSubmitting = false
            message = nil
            passwordMessage = nil
            state = .passwordRecovery
        case .signedIn, .tokenRefreshed, .userUpdated, .mfaChallengeVerified:
            guard accessTask == nil, !isSigningOut else { return }
            guard acceptsSessionEvents else {
                // Clear a late SDK refresh rather than letting it resurrect credentials.
                if authentication.currentSession != nil { try? await clearStoredSession() }
                return
            }
            if state == .passwordRecovery { return }
            if case .signedIn(let account) = state,
               let session = authentication.currentSession, account.id != session.user.id {
                // An old refresh must not switch the open workspace to another account.
                sessionWasRevoked()
                try? await clearStoredSession()
                return
            }
            await revalidateAccess() // Read the latest session and verify its server role.
        }
    }

    private func clearStoredSession() async throws {
        pendingSessionCleanups += 1
        defer { pendingSessionCleanups -= 1 }
        try await authentication.signOut()
    }

    private func resolve(_ operation: Operation, intent: AccountRole = .client) async {
        guard accessTask == nil, !isSubmitting, !isSigningOut, pendingSessionCleanups == 0 else { return }
        let previousState = state
        operationVersion += 1
        let version = operationVersion
        isSubmitting = true
        canRetryAccess = false
        message = nil
        retryIntent = intent
        let authentication = self.authentication
        let requiredRole = self.requiredRole
        let request = Task<SignedInAccount, Error> { [weak self] in
            let identity: SessionAuthIdentity
            do {
                switch operation {
                case .restore: identity = try await authentication.restore()
                case .refresh: identity = try await authentication.refresh()
                case .signIn(let email, let password):
                    identity = try await authentication.signIn(email: email, password: password)
                    try Task.checkCancellation()
                    guard self?.operationVersion == version else { throw CancellationError() }
                    // The new session now exists. Revocation must remain active
                    // while its server-side role is being verified.
                    self?.acceptsSessionEvents = true
                }
            } catch { throw SessionAccessError.authentication(error) }
            try Task.checkCancellation()
            guard let email = identity.email?.trimmingCharacters(in: .whitespacesAndNewlines), !email.isEmpty else {
                throw SessionAccessError.invalidIdentity
            }
            let role: AccountRole
            do { role = try await authentication.role(for: identity) }
            catch { throw SessionAccessError.roleResolution(error) }
            try Task.checkCancellation()
            guard requiredRole == nil || role == requiredRole else { throw SessionAccessError.coachRequired }
            guard intent != .coach || role == .coach else { throw SessionAccessError.coachRequired }
            return SignedInAccount(id: identity.id, email: email, role: role)
        }
        accessTask = request
        defer {
            if version == operationVersion {
                accessTask = nil
                isSubmitting = false
            }
        }
        do {
            let account = try await withTaskCancellationHandler {
                try await request.value
            } onCancel: { request.cancel() }
            guard version == operationVersion, !Task.isCancelled else { return }
            verifiedClients.remember(account)
            acceptsSessionEvents = true
            state = .signedIn(account)
        } catch {
            guard version == operationVersion else { return }
            if error is CancellationError || Task.isCancelled {
                state = previousState == .restoring ? .signedOut : previousState
                return
            }
            if case .restore = operation, previousState == .restoring,
               case SessionAccessError.authentication(let underlying) = error,
               let authError = underlying as? AuthError, authError.errorCode == .sessionNotFound,
               authentication.currentSession == nil {
                verifiedClients.clear()
                state = .signedOut
                return
            }
            if case SessionAccessError.coachRequired = error {
                let accessMessage = requiredRole == .coach
                    ? "This is FWB Coach. Sign in with a coach account. For your training, use the FWB client app or client website."
                    : "This account does not have coach access. Choose Client to sign in to your training."
                await clearRejectedSession(message: accessMessage, version: version)
                return
            }
            if Self.requiresSignIn(error) {
                await clearRejectedSession(message: "Your session has ended. Please sign in again.", version: version)
                return
            }
            if case SessionAccessError.invalidIdentity = error {
                await clearRejectedSession(message: "We couldn't verify this account. Please sign in again.", version: version)
                return
            }
            if case .signIn = operation, case SessionAccessError.authentication(let underlying) = error {
                state = .signedOut
                message = Self.isCredentialError(underlying)
                    ? "That email or password did not work. Please try again."
                    : "We couldn't reach sign-in. Check your connection and try again."
                return
            }
            // Only transient transport failures permit an offline client shell. A matching
            // SDK session plus a prior server-verification receipt is required on relaunch.
            if requiredRole != .coach, intent != .coach, Self.isTransientNetworkFailure(error),
               let account = verifiedClients.verifiedClient(for: authentication.currentSession) {
                acceptsSessionEvents = true
                state = .signedIn(account)
            } else {
                if !Self.isTransientNetworkFailure(error) { verifiedClients.clear() }
                state = .signedOut
            }
            canRetryAccess = true
            message = "We couldn't confirm your account access. Check your connection and tap Retry access."
        }
    }

    private func clearRejectedSession(message: String, version: Int) async {
        verifiedClients.clear()
        acceptsSessionEvents = false
        state = .signedOut
        canRetryAccess = false
        isSigningOut = true
        try? await clearStoredSession()
        guard version == operationVersion else { return }
        isSigningOut = false
        self.message = message
    }

    private static func requiresSignIn(_ error: Error) -> Bool {
        if case SessionAccessError.authentication(let error) = error { return requiresSignIn(error) }
        if case SessionAccessError.roleResolution(let error) = error { return requiresSignIn(error) }
        if case SessionAccessError.invalidIdentity = error { return true }
        guard let error = error as? AuthError else { return false }
        return ["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used",
                "bad_jwt", "invalid_jwt", "user_not_found", "user_banned"].contains(error.errorCode.rawValue)
    }

    private static func isTransientNetworkFailure(_ error: Error) -> Bool {
        if case SessionAccessError.authentication(let error) = error { return isTransientNetworkFailure(error) }
        if case SessionAccessError.roleResolution(let error) = error { return isTransientNetworkFailure(error) }
        guard let error = error as? URLError else { return false }
        return [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost,
                .cannotConnectToHost, .dnsLookupFailed, .internationalRoamingOff, .dataNotAllowed].contains(error.code)
    }

    private static func isCredentialError(_ error: Error) -> Bool {
        guard let error = error as? AuthError else { return false }
        return ["invalid_credentials", "email_not_confirmed", "user_banned"].contains(error.errorCode.rawValue)
    }
}

@MainActor
final class ClientProgramStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    enum NutritionSaveState: Equatable {
        case idle
        case saving
        case saved
        case queued
        case conflict(String)
        case failed(String)
    }

    enum WorkoutLayoutSaveState: Equatable {
        case idle
        case saving
        case saved
        case conflict(String)
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var program: ClientProgram?
    @Published private(set) var availablePrograms: [ClientProgram] = []
    @Published private(set) var nutritionSaveState: NutritionSaveState = .idle
    @Published private(set) var workoutLayoutSaveState: WorkoutLayoutSaveState = .idle

    private let client: SupabaseClient
    /// Child flows must keep the demo's fixture data instead of querying a signed-in account.
    let isPreview: Bool
    private var activeWorkoutLayoutSave: UUID?
    private var programReadGeneration = 0

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
        isPreview = false
    }

#if DEBUG
    init(previewProgram: ClientProgram, availablePrograms: [ClientProgram]? = nil, client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
        isPreview = true
        program = previewProgram
        self.availablePrograms = availablePrograms ?? [previewProgram]
        state = .loaded
    }
#endif

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await reload()
    }

    func selectProgram(_ programID: UUID) {
        guard let selected = availablePrograms.first(where: { $0.id == programID }),
              program?.id != selected.id else { return }
        program = selected
        nutritionSaveState = .idle
        workoutLayoutSaveState = .idle
        guard !isPreview else { return }
        Task {
            if let pending = await ContinuityOutbox.shared.nutritionMutation(programID: selected.id) {
                _ = await synchronizeNutrition(pending)
            }
        }
    }

    func reload() async {
        guard !isPreview, activeWorkoutLayoutSave == nil else { return }
        programReadGeneration += 1
        let generation = programReadGeneration
        state = .loading

        do {
            let session = try await client.auth.session
            guard let accountEmail = session.user.email.map({ ContinuitySync.normalize(email: $0) }),
                  !accountEmail.isEmpty else {
                state = .failed("Your account email is missing. Sign in again and retry.")
                return
            }
            let escapedEmail = accountEmail.replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "%", with: "\\%").replacingOccurrences(of: "_", with: "\\_")
            let programs: [ClientProgram] = try await client
                .from("client_programs")
                .select()
                .ilike("client_email", pattern: escapedEmail)
                .eq("active", value: true)
                .or("client_archived.is.null,client_archived.eq.false")
                .order("updated_at", ascending: false, nullsFirst: false)
                .order("created_at", ascending: false, nullsFirst: false)
                .order("id", ascending: false)
                .execute()
                .value

            try Task.checkCancellation()
            guard generation == programReadGeneration else { return }
            let selectedID = program?.id
            availablePrograms = programs
            program = programs.first(where: { $0.id == selectedID }) ?? programs.first
            if let programID = program?.id,
               let pending = await ContinuityOutbox.shared.nutritionMutation(programID: programID) {
                _ = await synchronizeNutrition(pending)
            }
            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            guard generation == programReadGeneration else { return }
            ErrorReporting.capture(error, operation: .loadPrograms)
            state = .failed("Your training plan could not be loaded. Check your connection and try again.")
        }
    }

    @discardableResult
    func saveWorkoutExercises(workoutID: UUID, exercises: [Exercise]) async -> Bool {
        await saveWorkoutLayout(workoutID: workoutID, exercises: exercises, restoring: false)
    }

    @discardableResult
    func restoreAssignedWorkoutExercises() async -> Bool {
        await saveWorkoutLayout(workoutID: nil, exercises: nil, restoring: true)
    }

    private func saveWorkoutLayout(workoutID: UUID?, exercises: [Exercise]?, restoring: Bool) async -> Bool {
        guard activeWorkoutLayoutSave == nil else { return false }
        guard let baseline = program else {
            workoutLayoutSaveState = .failed("Select a program before changing exercises.")
            return false
        }
        if isPreview {
            do {
                let update = try ClientWorkoutLayoutUpdate.make(
                    from: baseline, responseData: baseline.workoutLayoutPreviewResponseData(),
                    workoutID: workoutID, exercises: exercises, restoring: restoring
                )
                replaceAvailableProgram(baseline.replacingWorkoutLayout(update.clientWorkoutLayout))
                workoutLayoutSaveState = .saved
                return true
            } catch {
                workoutLayoutSaveState = .failed("These exercise changes could not be applied to the preview.")
                return false
            }
        }
        activeWorkoutLayoutSave = baseline.id
        programReadGeneration += 1
        workoutLayoutSaveState = .saving
        defer {
            activeWorkoutLayoutSave = nil
            if program != nil, state == .loading { state = .loaded }
        }
        do {
            let session = try await client.auth.session
            guard session.user.email.map({ ContinuitySync.normalize(email: $0) }) == ContinuitySync.normalize(email: baseline.clientEmail) else {
                throw ClientWorkoutLayoutError.invalidSource
            }
            let response = try await client.from("client_programs").select()
                .eq("id", value: baseline.id.uuidString).eq("active", value: true)
                .or("client_archived.is.null,client_archived.eq.false").single().execute()
            let current = try JSONDecoder().decode(ClientProgram.self, from: response.data)
            guard baseline.hasSameWorkoutRevision(as: current) else {
                replaceAvailableProgram(current)
                if program?.id == baseline.id {
                    workoutLayoutSaveState = .conflict("Your exercises changed on another device or with your coach. The latest version is loaded; review it before editing again.")
                }
                state = .loaded
                return false
            }
            let update = try ClientWorkoutLayoutUpdate.make(
                from: current, responseData: response.data, workoutID: workoutID, exercises: exercises, restoring: restoring
            )
            guard let revision = current.updatedAt, !revision.isEmpty else { throw ClientWorkoutLayoutError.invalidSource }
            try Task.checkCancellation()
            // set_client_programs_updated_at runs before every update (the existing
            // live schema). This guards coach changes and competing client edits
            // without putting the entire workout JSON in a potentially huge URL.
            let records: [ClientProgram] = try await client.from("client_programs").update(update)
                .eq("id", value: current.id.uuidString)
                .eq("active", value: true)
                .or("client_archived.is.null,client_archived.eq.false")
                .eq("updated_at", value: revision)
                .select().execute().value
            guard let saved = records.first else {
                if program?.id == baseline.id {
                    workoutLayoutSaveState = .conflict("Your program changed while saving. Refresh your programs, then review the latest exercises before trying again.")
                }
                return false
            }
            replaceAvailableProgram(saved)
            state = .loaded
            if program?.id == baseline.id { workoutLayoutSaveState = .saved }
            return true
        } catch is CancellationError {
            if program?.id == baseline.id { workoutLayoutSaveState = .idle }
            return false
        } catch {
            ErrorReporting.capture(error, operation: .saveWorkoutLayout)
            if program?.id == baseline.id {
                workoutLayoutSaveState = .failed("Your exercise changes could not be saved. Check your connection and try again.")
            }
            return false
        }
    }

    func saveNutritionPlan(programID: UUID, plan: NutritionPlan) async -> Bool {
        guard let targetProgram = availablePrograms.first(where: { $0.id == programID }) else {
            nutritionSaveState = .failed("This program is no longer available. Refresh your programs and try again.")
            return false
        }
        if program?.id == programID { nutritionSaveState = .saving }
        let mutation = PendingNutritionMutation(
            programID: programID,
            plan: plan,
            expectedRemoteUpdatedAt: targetProgram.nutritionPlan?.updatedAt ?? ""
        )

        switch await synchronizeNutrition(mutation) {
        case .saved: return true
        case .conflict: return false
        case .retry: break
        }

        do {
            try await ContinuityOutbox.shared.enqueue(mutation)
            if let savedProgram = availablePrograms.first(where: { $0.id == programID }) {
                replaceAvailableProgram(savedProgram.replacingNutritionPlan(plan))
            }
            if program?.id == programID { nutritionSaveState = .queued }
            return true
        } catch {
            ErrorReporting.capture(error, operation: .saveNutritionLocally)
            if program?.id == programID {
                nutritionSaveState = .failed("Your targets could not be secured on this iPhone. Try saving again.")
            }
            return false
        }
    }

    private enum NutritionSyncResult { case saved, conflict, retry }

    private func synchronizeNutrition(_ mutation: PendingNutritionMutation) async -> NutritionSyncResult {
        do {
            let current: ClientProgram = try await client
                .from("client_programs")
                .select()
                .eq("id", value: mutation.programID.uuidString)
                .single()
                .execute()
                .value

            let remoteDate = ContinuityDateCoding.date(from: current.nutritionPlan?.updatedAt)
            let localDate = ContinuityDateCoding.date(from: mutation.plan.updatedAt) ?? .distantPast
            let expectedDate = ContinuityDateCoding.date(from: mutation.expectedRemoteUpdatedAt)
            if let remoteDate, remoteDate > localDate, remoteDate != expectedDate {
                replaceAvailableProgram(current)
                try? await ContinuityOutbox.shared.removeNutrition(programID: mutation.programID)
                if program?.id == mutation.programID {
                    nutritionSaveState = .conflict("Targets changed on the website after this edit. The newer website targets were kept.")
                }
                return .conflict
            }

            let updatedProgram: ClientProgram
            do {
                updatedProgram = try await client
                    .from("client_programs")
                    .update(ClientNutritionPlanSyncUpdate(nutritionPlan: mutation.plan))
                    .eq("id", value: mutation.programID.uuidString)
                    .select()
                    .single()
                    .execute()
                    .value
            } catch {
                updatedProgram = try await client
                    .from("client_programs")
                    .update(ClientNutritionPlanUpdate(nutritionPlan: mutation.plan))
                    .eq("id", value: mutation.programID.uuidString)
                    .select()
                    .single()
                    .execute()
                    .value
            }

            replaceAvailableProgram(updatedProgram)
            try? await ContinuityOutbox.shared.removeNutrition(programID: mutation.programID)
            if program?.id == mutation.programID { nutritionSaveState = .saved }
            return .saved
        } catch is CancellationError {
            if program?.id == mutation.programID { nutritionSaveState = .idle }
            return .retry
        } catch {
            ErrorReporting.capture(error, operation: .syncNutrition)
            return .retry
        }
    }

    private func replaceAvailableProgram(_ updated: ClientProgram) {
        if let index = availablePrograms.firstIndex(where: { $0.id == updated.id }) {
            availablePrograms[index] = updated
        }
        // A save that finishes after a program switch must not switch the UI back.
        if program?.id == updated.id { program = updated }
    }
}

@MainActor
final class ExerciseSuggestionStore: ObservableObject {
    @Published private(set) var historyNames: [String] = []

    private let client: SupabaseClient
    private var loadedEmail: String?

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    func load(email: String) async {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty, loadedEmail != normalizedEmail else { return }

        loadedEmail = normalizedEmail

        do {
            let records: [ExerciseNameRecord] = try await client
                .from("client_workout_logs")
                .select("exercise_code,exercise_name")
                .eq("client_email", value: normalizedEmail)
                .order("exercise_name", ascending: true)
                .limit(1_000)
                .execute()
                .value

            historyNames = ExerciseSuggestionLibrary.merged([
                records.compactMap { record in
                    let code = record.exerciseCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                    return ["WARMUP", "CARDIO"].contains(code) ? nil : record.exerciseName
                }
            ])
        } catch is CancellationError {
            return
        } catch {
            historyNames = []
        }
    }
}

@MainActor
final class ExerciseLibraryStore: ObservableObject {
    @Published private(set) var exercises: [ApprovedExercise] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private let client: SupabaseClient
    private var didLoad = false

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    var suggestionNames: [String] {
        ExerciseSuggestionLibrary.merged([exercises.map(\.name)])
    }

    func loadIfNeeded() async {
        guard !didLoad else { return }
        didLoad = true
        isLoading = true
        errorMessage = nil

        defer { isLoading = false }

        do {
            exercises = try await client
                .from("exercise_library")
                .select()
                // Opt in only for library reads; older clients exclude recovery movements.
                .setHeader(name: "x-fwb-recovery-catalog", value: "1")
                .eq("is_active", value: true)
                .eq("is_approved", value: true)
                .order("sort_order", ascending: true)
                .order("name", ascending: true)
                .execute()
                .value
        } catch is CancellationError {
            didLoad = false
        } catch {
            exercises = []
            didLoad = false
            errorMessage = "The exercise library could not load. Check your connection and try again."
        }
    }

    func reload() async {
        guard !isLoading else { return }
        didLoad = false
        await loadIfNeeded()
    }
}

private actor WorkoutHistoryCache {
    static let shared = WorkoutHistoryCache()

    private struct Container: Codable {
        var schemaVersion = 1
        var recordsByClient: [String: [WorkoutHistoryRecord]] = [:]
    }

    private let fileManager: FileManager
    private let fileURL: URL

    init(fileManager: FileManager = .default, fileURL: URL? = nil) {
        self.fileManager = fileManager
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let applicationSupport = fileManager.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            ).first ?? fileManager.temporaryDirectory
            self.fileURL = applicationSupport
                .appendingPathComponent("FWBTraining", isDirectory: true)
                .appendingPathComponent("workout-history.json", isDirectory: false)
        }
    }

    func records(email: String) -> [WorkoutHistoryRecord] {
        read().recordsByClient[email] ?? []
    }

    func store(_ records: [WorkoutHistoryRecord], email: String) throws {
        var container = read()
        container.recordsByClient[email] = records
        try write(container)
    }

    private func read() -> Container {
        guard let data = try? Data(contentsOf: fileURL),
              let container = try? JSONDecoder().decode(Container.self, from: data) else {
            return Container()
        }
        return container
    }

    private func write(_ container: Container) throws {
        let directory = fileURL.deletingLastPathComponent()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(container).write(to: fileURL, options: [.atomic, .completeFileProtection])
    }
}

enum WorkoutHistoryDeletionTarget: Equatable, Encodable {
    case session(UUID)
    case rows([UUID])

    init?(_ session: WorkoutHistorySession) {
        guard !session.records.isEmpty,
              session.records.allSatisfy({ $0.hasSessionIdentity && $0.entryDate == session.entryDate && $0.workoutTitle == session.workoutTitle }) else { return nil }
        if let id = session.sessionID {
            guard session.records.allSatisfy({ $0.sessionID == id }) else { return nil }
            self = .session(id)
        } else {
            let ids = session.records.compactMap(\.rowID)
            guard ids.count == session.records.count, Set(ids).count == ids.count else { return nil }
            self = .rows(ids.sorted { $0.uuidString < $1.uuidString })
        }
    }

    func includes(_ record: WorkoutHistoryRecord) -> Bool {
        switch self {
        case .session(let id): return record.sessionID == id
        case .rows(let ids): return record.rowID.map { ids.contains($0) } ?? false
        }
    }

    enum CodingKeys: String, CodingKey { case sessionID = "p_session_id", logIDs = "p_log_ids" }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .session(let id): try container.encode(id, forKey: .sessionID)
        case .rows(let ids): try container.encode(ids, forKey: .logIDs)
        }
    }
}

struct WorkoutHistoryDeletionResult: Decodable {
    let deletedCount: Int
    let sessionID: UUID?
    enum CodingKeys: String, CodingKey { case deletedCount = "deleted_count", sessionID = "session_id" }
}

enum WorkoutHistoryDeletionError: Error {
    case differentAccount, unknownIdentity, unconfirmed
}

@MainActor
protocol WorkoutHistoryDeletionService {
    func delete(_ target: WorkoutHistoryDeletionTarget, email: String) async throws -> WorkoutHistoryDeletionResult
}

@MainActor
final class SupabaseWorkoutHistoryDeletionService: WorkoutHistoryDeletionService {
    private let client: SupabaseClient
    private let accountEmail: (@MainActor () async throws -> String)?
    init(client: SupabaseClient = AppConfiguration.supabase,
         accountEmail: (@MainActor () async throws -> String)? = nil) {
        self.client = client
        self.accountEmail = accountEmail
    }

    func delete(_ target: WorkoutHistoryDeletionTarget, email: String) async throws -> WorkoutHistoryDeletionResult {
        let authenticatedEmail: String
        if let accountEmail { authenticatedEmail = try await accountEmail() }
        else { authenticatedEmail = try await client.auth.session.user.email ?? "" }
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty,
              authenticatedEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalizedEmail else {
            throw WorkoutHistoryDeletionError.differentAccount
        }
        let result: WorkoutHistoryDeletionResult = try await client
            .rpc("delete_client_workout_session", params: target).execute().value
        guard result.deletedCount >= 0, result.sessionID != nil else { throw WorkoutHistoryDeletionError.unconfirmed }
        if case .session(let id) = target, result.sessionID != id { throw WorkoutHistoryDeletionError.unconfirmed }
        return result
    }
}

@MainActor
final class WorkoutHistoryStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var sessions: [WorkoutHistorySession] = []
    @Published private(set) var hasCompleteHistory = false
    private var loadedEmail: String?
    @Published private(set) var deletingSessionID: String?
    @Published private(set) var deletionError: String?
    @Published private(set) var deletionNotice: String?
    private var loadRevision = UUID()
    private var incompleteHistoryRevision: UUID?
    private var locallyDeletedSessionIDs: Set<UUID> = []

    private let client: SupabaseClient
    private let cache: WorkoutHistoryCache
    private let offlineRepository: OfflineWorkoutRepository
    private let deletionService: WorkoutHistoryDeletionService
    private let refreshPending: @MainActor () async -> Void

    init(client: SupabaseClient = AppConfiguration.supabase,
         deletionService: WorkoutHistoryDeletionService? = nil,
         offlineRepository: OfflineWorkoutRepository = .shared,
         cacheURL: URL? = nil,
         refreshPending: @escaping @MainActor () async -> Void = { await WorkoutOfflineSyncStore.shared.refreshPendingCount() }) {
        self.client = client
        self.deletionService = deletionService ?? SupabaseWorkoutHistoryDeletionService(client: client)
        self.offlineRepository = offlineRepository
        self.refreshPending = refreshPending
        self.cache = cacheURL.map { WorkoutHistoryCache(fileURL: $0) } ?? .shared
    }

    func dismissDeletionError() { deletionError = nil }

    @discardableResult
    func delete(_ session: WorkoutHistorySession, email: String) async -> Bool {
        guard deletingSessionID == nil else { return false }
        guard let target = WorkoutHistoryDeletionTarget(session) else {
            deletionError = "This log needs to be refreshed before it can be deleted. Pull down to refresh, then try again."
            return false
        }
        deletingSessionID = session.id
        deletionError = nil
        deletionNotice = nil
        // A load started before deletion must not replace the list with stale rows.
        loadRevision = UUID()
        defer { deletingSessionID = nil }
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        do {
            let result = try await deletionService.delete(target, email: normalizedEmail)
            if let id = result.sessionID { locallyDeletedSessionIDs.insert(id) }
            sessions.removeAll { saved in
                saved.records.contains(where: target.includes)
                    || (saved.sessionID.map { locallyDeletedSessionIDs.contains($0) } ?? false)
            }
            state = .loaded
            deletionNotice = "Workout deleted from your logs."
            // The server already deleted the log and rejects any stale writes.
            // Clean local recovery after confirmation, so failed requests retain data.
            do {
                if let id = result.sessionID {
                    try await offlineRepository.markDeleted(sessionID: id, email: normalizedEmail)
                }
                let cached = await cache.records(email: normalizedEmail)
                try await cache.store(cached.filter { record in
                    !target.includes(record) && !(record.sessionID.map { locallyDeletedSessionIDs.contains($0) } ?? false)
                }, email: normalizedEmail)
            } catch {
                ErrorReporting.capture(error, operation: .deleteWorkoutHistory)
            }
            await refreshPending()
            NotificationCenter.default.post(name: .fwbForegroundRefresh, object: nil)
            return true
        } catch {
            ErrorReporting.capture(error, operation: .deleteWorkoutHistory)
            deletionError = error is WorkoutHistoryDeletionError
                ? "Your account or this log changed. Refresh your logs and try again."
                : "The workout could not be deleted. Check your connection and try again."
            if state == .loading { state = .loaded }
            return false
        }
    }

    func loadIfNeeded(email: String) async {
        guard state == .idle || loadedEmail != email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else { return }
        await reload(email: email)
    }

    func reload(email: String) async {
        guard deletingSessionID == nil else { return }
        let revision = UUID()
        loadRevision = revision
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if loadedEmail != normalizedEmail {
            sessions = []
            locallyDeletedSessionIDs = []
        }
        loadedEmail = normalizedEmail
        hasCompleteHistory = false
        guard !normalizedEmail.isEmpty else {
            state = .failed("Your account email is missing. Sign in again and retry.")
            return
        }
        state = .loading
        locallyDeletedSessionIDs.formUnion(await offlineRepository.deletedSessionIDs(email: normalizedEmail))
        let cachedRecords = await cache.records(email: normalizedEmail).filter { record in
            !(record.sessionID.map { locallyDeletedSessionIDs.contains($0) } ?? false)
        }
        guard loadRevision == revision else { return }
        if !cachedRecords.isEmpty {
            sessions = Self.makeSessions(from: cachedRecords)
        }

        do {
            let pageSize = 500
            var offset = 0
            var allRecords: [WorkoutHistoryRecord] = []
            while true {
                let page = try await loadHistoryPage(
                    email: normalizedEmail,
                    from: offset,
                    to: offset + pageSize - 1,
                    revision: revision
                )

                guard !Task.isCancelled else { return }
                allRecords.append(contentsOf: page)

                guard page.count == pageSize else { break }
                offset += pageSize
            }

            guard loadRevision == revision else { return }
            allRecords.removeAll { record in record.sessionID.map { locallyDeletedSessionIDs.contains($0) } ?? false }
            sessions = Self.makeSessions(from: allRecords)
            try? await cache.store(allRecords, email: normalizedEmail)
            guard loadRevision == revision else { return }
            hasCompleteHistory = incompleteHistoryRevision != revision
            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            guard loadRevision == revision else { return }
            ErrorReporting.capture(error, operation: .loadWorkoutHistory)
            state = sessions.isEmpty
                ? .failed("Your workout history could not be loaded. Check your connection and try again.")
                : .loaded
        }
    }

    private func loadHistoryPage(email: String, from: Int, to: Int, revision: UUID) async throws -> [WorkoutHistoryRecord] {
        do {
            return try await client
                .from("client_workout_logs")
                .select(
                    "id,session_id,set_id,entry_date,workout_title,exercise_code,exercise_name,exercise_order,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at,effort_scale,effort_value,set_type,duration_seconds,progression_target"
                )
                .eq("client_email", value: email)
                .order("entry_date", ascending: false)
                .order("updated_at", ascending: false)
                .order("id", ascending: true)
                .range(from: from, to: to)
                .execute()
                .value
        } catch {
            guard WorkoutProgressionIntegration.isMissingTargetColumn(error) else { throw error }
            do {
                return try await client
                    .from("client_workout_logs")
                    .select(
                        "id,session_id,set_id,entry_date,workout_title,exercise_code,exercise_name,exercise_order,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at,effort_scale,effort_value,set_type,duration_seconds"
                    )
                    .eq("client_email", value: email)
                    .order("entry_date", ascending: false)
                    .order("updated_at", ascending: false)
                    .order("id", ascending: true)
                    .range(from: from, to: to)
                    .execute()
                    .value
            } catch {
                // Legacy fallback is useful for logs, but cannot prove achievement eligibility.
                if loadRevision == revision { incompleteHistoryRevision = revision }
                do {
                    return try await client
                        .from("client_workout_logs")
                        .select(
                            "id,session_id,set_id,entry_date,workout_title,exercise_code,exercise_name,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at"
                        )
                        .eq("client_email", value: email)
                        .order("entry_date", ascending: false)
                        .order("updated_at", ascending: false)
                        .order("id", ascending: true)
                        .range(from: from, to: to)
                        .execute()
                        .value
                } catch {
                    return try await client
                        .from("client_workout_logs")
                        .select("id,entry_date,workout_title,exercise_code,exercise_name,set_number,weight_used,reps,notes")
                        .eq("client_email", value: email)
                        .order("entry_date", ascending: false)
                        .order("workout_title", ascending: true)
                        .order("exercise_code", ascending: true)
                        .order("set_number", ascending: true)
                        .order("id", ascending: true)
                        .range(from: from, to: to)
                        .execute()
                        .value
                }
            }
        }
    }

    static func makeSessions(from records: [WorkoutHistoryRecord]) -> [WorkoutHistorySession] {
        struct SessionKey: Hashable {
            let sessionID: UUID?
            let entryDate: String
            let workoutTitle: String
        }

        return Dictionary(grouping: records) { record in
            SessionKey(
                sessionID: record.sessionID,
                entryDate: record.entryDate,
                workoutTitle: record.workoutTitle
            )
        }
        .map { key, records in
            var recordsByIdentity: [String: WorkoutHistoryRecord] = [:]
            for record in records {
                let identity: String
                if let setID = record.setID {
                    identity = setID.uuidString.lowercased()
                } else {
                    identity = "legacy|\(record.exerciseCode.lowercased())|\(record.setNumber)"
                }

                if let saved = recordsByIdentity[identity],
                   (saved.updatedAt ?? .distantPast) > (record.updatedAt ?? .distantPast) {
                    continue
                }
                recordsByIdentity[identity] = record
            }
            let deduplicated = Array(recordsByIdentity.values)
            return WorkoutHistorySession(
                entryDate: key.entryDate,
                workoutTitle: key.workoutTitle,
                records: deduplicated
            )
        }
        .sorted { left, right in
            if left.entryDate == right.entryDate {
                return left.workoutTitle.localizedCaseInsensitiveCompare(right.workoutTitle) == .orderedAscending
            }
            return left.entryDate > right.entryDate
        }
    }
}

/// Date/title identify the picker destination, but a reset can create several
/// distinct sessions there. Restore only the most recently updated session so
/// identical exercise codes from older workouts never overwrite its sets.
enum WorkoutSessionRestoration {
    static func recordsForLatestSession(from records: [WorkoutLogRecord]) -> [WorkoutLogRecord] {
        var selected: WorkoutLogRecord?
        for record in records where record.sessionID != nil {
            let updated = record.updatedAt ?? record.completedAt ?? .distantPast
            let selectedUpdated = selected?.updatedAt ?? selected?.completedAt ?? .distantPast
            if selected == nil || updated > selectedUpdated { selected = record }
        }
        guard let sessionID = selected?.sessionID else {
            // Legacy rows without a session identity retain their original path.
            return records
        }
        return records.filter { $0.sessionID == sessionID }
    }
}

@MainActor
final class WorkoutLogStore: ObservableObject {
    enum SaveState: Equatable {
        case idle
        case loading
        case ready
        case saving
        case saved
        case failed(String)
    }

    @Published private(set) var state: SaveState = .idle
    @Published private(set) var remoteSessionID: UUID?
    @Published private(set) var baseRemoteUpdatedAt: Date?
    @Published private(set) var completedAt: Date?

    private let client: SupabaseClient
    private var loadedKeys: Set<WorkoutLogKey> = []
    private var supportsEffortColumns = true

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    func load(
        email: String,
        workoutTitle: String,
        entryDate: String,
        excludedExerciseCodes: Set<String> = []
    ) async -> [WorkoutLogRecord] {
        state = .loading
        remoteSessionID = nil
        baseRemoteUpdatedAt = nil
        completedAt = nil

        do {
            let normalizedEmail = ContinuitySync.normalize(email: email)
            let records: [WorkoutLogRecord]
            var attemptedPreProgressionSchema = false
            do {
                do {
                    records = try await client
                        .from("client_workout_logs")
                        .select("session_id,set_id,exercise_code,exercise_name,exercise_order,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at,effort_scale,effort_value,set_type,duration_seconds,progression_target")
                        .eq("client_email", value: normalizedEmail)
                        .eq("entry_date", value: entryDate)
                        .eq("workout_title", value: workoutTitle)
                        .order("updated_at", ascending: false)
                        .execute()
                        .value
                } catch {
                    guard WorkoutProgressionIntegration.isMissingTargetColumn(error) else { throw error }
                    attemptedPreProgressionSchema = true
                    records = try await client
                        .from("client_workout_logs")
                        .select("session_id,set_id,exercise_code,exercise_name,exercise_order,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at,effort_scale,effort_value,set_type,duration_seconds")
                        .eq("client_email", value: normalizedEmail)
                        .eq("entry_date", value: entryDate)
                        .eq("workout_title", value: workoutTitle)
                        .order("updated_at", ascending: false)
                        .execute()
                        .value
                }
                supportsEffortColumns = true
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                guard attemptedPreProgressionSchema else { throw error }
                do {
                    records = try await client
                        .from("client_workout_logs")
                        .select("session_id,set_id,exercise_code,exercise_name,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at")
                        .eq("client_email", value: normalizedEmail)
                        .eq("entry_date", value: entryDate)
                        .eq("workout_title", value: workoutTitle)
                        .order("updated_at", ascending: false)
                        .execute()
                        .value
                    supportsEffortColumns = false
                } catch {
                    records = try await loadRecords(
                        email: normalizedEmail,
                        workoutTitle: workoutTitle,
                        entryDate: entryDate,
                        columns: "exercise_code,exercise_name,set_number,weight_used,reps,notes"
                    )
                    supportsEffortColumns = false
                }
            }
            let sessionRecords = WorkoutSessionRestoration.recordsForLatestSession(from: records)
            remoteSessionID = sessionRecords.compactMap(\.sessionID).first
            baseRemoteUpdatedAt = sessionRecords.compactMap(\.updatedAt).max()
            completedAt = sessionRecords.compactMap(\.completedAt).max()
            let visibleRecords = sessionRecords.filter {
                !excludedExerciseCodes.contains($0.exerciseCode.uppercased())
            }
            loadedKeys = Set(visibleRecords.map(\.key))
            state = .ready
            return visibleRecords
        } catch is CancellationError {
            return []
        } catch {
            ErrorReporting.capture(error, operation: .loadWorkoutSets)
            state = .failed("Existing sets could not be loaded. You can try again before saving.")
            return []
        }
    }

    private func loadRecords(
        email: String,
        workoutTitle: String,
        entryDate: String,
        columns: String
    ) async throws -> [WorkoutLogRecord] {
        try await client
            .from("client_workout_logs")
            .select(columns)
            .eq("client_email", value: email)
            .eq("entry_date", value: entryDate)
            .eq("workout_title", value: workoutTitle)
            .order("exercise_code", ascending: true)
            .order("set_number", ascending: true)
            .execute()
            .value
    }

    func save(
        email: String,
        workoutTitle: String,
        entryDate: String,
        drafts: [WorkoutSetDraft]
    ) async -> Bool {
        if drafts.contains(where: {
            $0.setType == .timed && $0.containsEntry && $0.durationValue <= 0
        }) {
            state = .failed("Enter a duration for every timed set before saving.")
            return false
        }

        var nextExerciseOrder = 0
        var exerciseOrder: [String: Int] = [:]
        for draft in drafts where exerciseOrder[draft.exerciseCode] == nil {
            exerciseOrder[draft.exerciseCode] = nextExerciseOrder
            nextExerciseOrder += 1
        }

        let payloads = drafts.compactMap { draft -> WorkoutLogPayload? in
            guard draft.containsEntry else { return nil }

            return WorkoutLogPayload(
                sessionID: remoteSessionID ?? UUID(),
                setID: draft.id,
                workoutTemplateID: nil,
                clientEmail: email.lowercased(),
                entryDate: entryDate,
                workoutTitle: workoutTitle,
                exerciseCode: draft.exerciseCode,
                exerciseName: draft.exerciseName,
                exerciseOrder: exerciseOrder[draft.exerciseCode] ?? 0,
                setNumber: draft.setNumber,
                weightUsed: Double(draft.weight) ?? 0,
                reps: draft.setType == .timed ? nil : Double(draft.reps),
                notes: draft.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? nil
                    : draft.notes.trimmingCharacters(in: .whitespacesAndNewlines),
                source: ContinuitySync.source,
                sourceVersion: ContinuitySync.sourceVersion,
                clientUpdatedAt: ContinuityDateCoding.string(from: Date()),
                completedAt: completedAt.map(ContinuityDateCoding.string),
                effortScale: draft.validatedEffortValue == nil ? nil : draft.effortScale,
                effortValue: draft.validatedEffortValue,
                setType: draft.setType,
                durationSeconds: draft.setType == .timed ? Double(draft.duration) : nil
            )
        }

        if let invalidDraft = drafts.first(where: { $0.effortValidationMessage != nil }) {
            state = .failed(invalidDraft.effortValidationMessage ?? "Check the effort rating and try again.")
            return false
        }

        guard !payloads.isEmpty || !loadedKeys.isEmpty else {
            state = .failed("Enter weight, reps, time, a note, or effort for at least one set.")
            return false
        }

        state = .saving

        do {
            if !payloads.isEmpty {
                do {
                    try await client
                        .from("client_workout_logs")
                        .upsert(payloads, onConflict: "session_id,set_id")
                        .execute()
                } catch {
                    try await client
                        .from("client_workout_logs")
                        .upsert(
                            payloads.map(LegacyWorkoutLogPayload.init),
                            onConflict: "client_email,entry_date,workout_title,exercise_code,set_number"
                        )
                        .execute()
                }
            }

            let currentKeys = Set(
                drafts
                    .filter(\.containsEntry)
                    .map(\.logKey)
            )
            let removedKeys = loadedKeys.subtracting(currentKeys)

            for key in removedKeys {
                try await client
                    .from("client_workout_logs")
                    .delete()
                    .eq("client_email", value: email.lowercased())
                    .eq("entry_date", value: entryDate)
                    .eq("workout_title", value: workoutTitle)
                    .eq("exercise_code", value: key.exerciseCode)
                    .eq("set_number", value: key.setNumber)
                    .execute()
            }

            loadedKeys = currentKeys
            state = .saved
            return true
        } catch is CancellationError {
            return false
        } catch {
            ErrorReporting.capture(error, operation: .saveWorkoutSets)
            state = .failed("Your sets could not be saved. Check your connection and try again.")
            return false
        }
    }
}
