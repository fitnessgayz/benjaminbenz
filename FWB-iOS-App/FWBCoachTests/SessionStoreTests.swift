import Supabase
import XCTest
@testable import FWBCoach

@MainActor
final class SessionStoreTests: XCTestCase {
    func testRecoveryLinkRequiresPasswordChangeInsteadOfGrantingAppAccess() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: nil)
        auth.recoverySession = session
        let store = SessionStore(authentication: auth)

        let handled = await store.handleIncomingURL(URL(string: "fwb://auth/password-reset?code=valid")!)

        XCTAssertTrue(handled)
        XCTAssertEqual(store.state, .passwordRecovery)
        XCTAssertEqual(auth.roleChecks, 0)
    }

    func testCompletingRecoveryUpdatesPasswordAndReturnsToSignIn() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: nil)
        auth.recoverySession = session
        let store = SessionStore(authentication: auth)
        _ = await store.handleIncomingURL(URL(string: "fwb://auth/password-reset?code=valid")!)

        let updated = await store.changePassword("new-password", confirmation: "new-password", isRecovery: true)

        XCTAssertTrue(updated)
        XCTAssertEqual(auth.updatedPasswords, ["new-password"])
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(auth.currentSession)
        XCTAssertEqual(store.message, "Password updated. Sign in with your new password.")
    }

    func testPasswordRecoveryEventCannotSignClientIn() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: nil)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()

        auth.currentSession = session
        auth.send(.passwordRecovery, session: session)
        await waitUntil { store.state == .passwordRecovery }

        XCTAssertEqual(auth.roleChecks, 0)
    }

    func testSignedInClientCanChangePasswordWithoutSigningOut() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: session)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()

        let updated = await store.changePassword("new-password", confirmation: "new-password")

        XCTAssertTrue(updated)
        XCTAssertEqual(auth.updatedPasswords, ["new-password"])
        XCTAssertEqual(store.state, signedIn(session))
        XCTAssertEqual(auth.signOutCalls, 0)
    }

    func testPasswordValidationRejectsShortAndMismatchedValues() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: session)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()

        let shortPasswordAccepted = await store.changePassword("short", confirmation: "short")
        XCTAssertFalse(shortPasswordAccepted)
        XCTAssertEqual(store.passwordMessage, "Use at least 8 characters.")
        let mismatchedPasswordAccepted = await store.changePassword("long-enough", confirmation: "different")
        XCTAssertFalse(mismatchedPasswordAccepted)
        XCTAssertEqual(store.passwordMessage, "The passwords do not match.")
        XCTAssertTrue(auth.updatedPasswords.isEmpty)
    }

    func testSavedExpiredSessionRestoresWhileOffline() async {
        let session = makeSession(expired: true)
        let auth = SessionAuthenticationStub(session: session)
        auth.validSessionResult = .failure(URLError(.notConnectedToInternet))
        let store = SessionStore(authentication: auth, verifiedClients: verifiedReceipt(for: session))

        await store.restoreSession()

        XCTAssertEqual(store.state, signedIn(session))
        XCTAssertEqual(auth.currentSession, session)
        XCTAssertTrue(store.canRetryAccess)
        XCTAssertEqual(auth.signOutCalls, 0)
    }

    func testVerifiedReceiptRestoresClientOnlyAfterTransientFailureIsConfirmed() async {
        let session = makeSession(expired: true)
        let auth = SessionAuthenticationStub(session: session)
        var continuation: CheckedContinuation<Session, Error>?
        auth.validSessionOperation = {
            try await withCheckedThrowingContinuation { continuation = $0 }
        }
        let store = SessionStore(authentication: auth, verifiedClients: verifiedReceipt(for: session))
        let restore = Task { await store.restoreSession() }
        await waitUntil { continuation != nil }

        XCTAssertEqual(store.state, .restoring, "A receipt is not an unconditional authorization grant.")
        continuation?.resume(throwing: URLError(.timedOut))
        await restore.value
        XCTAssertEqual(store.state, signedIn(session))
    }

    func testFreshInstallStaysSignedOutWithoutRequestingCredentialsFromNetwork() async {
        let auth = SessionAuthenticationStub(session: nil)
        let store = SessionStore(authentication: auth)

        await store.restoreSession()

        XCTAssertEqual(store.state, .signedOut)
        XCTAssertEqual(auth.validSessionCalls, 0)
    }

    func testRestoreRunsOnlyOnceAndForegroundUsesValidSessionAccessor() async {
        let auth = SessionAuthenticationStub(session: makeSession())
        let store = SessionStore(authentication: auth)

        await store.restoreSession()
        await store.restoreSession()
        XCTAssertEqual(auth.validSessionCalls, 1)
        await store.refreshSession()
        XCTAssertEqual(auth.validSessionCalls, 2)
    }

    func testForegroundNetworkFailureKeepsClientSignedIn() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: session)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        auth.validSessionResult = .failure(URLError(.networkConnectionLost))

        await store.refreshSession()

        XCTAssertEqual(store.state, signedIn(session))
        XCTAssertEqual(auth.signOutCalls, 0)
    }

    func testConfirmedRevocationReturnsToSignInAndClearsLocalSession() async {
        let auth = SessionAuthenticationStub(session: makeSession())
        auth.validSessionResult = .failure(AuthError.sessionMissing)
        let store = SessionStore(authentication: auth)

        await store.restoreSession()

        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(auth.currentSession)
        XCTAssertEqual(auth.signOutCalls, 1)
        XCTAssertEqual(store.message, "Your session has ended. Please sign in again.")
    }

    func testSDKRevocationEventSignsOutAnOpenApp() async {
        let auth = SessionAuthenticationStub(session: makeSession())
        let store = SessionStore(authentication: auth)
        await store.restoreSession()

        auth.currentSession = nil
        auth.send(.signedOut)
        await waitUntil { store.state == .signedOut }

        XCTAssertEqual(store.message, "Your session has ended. Please sign in again.")
    }

    func testTokenRefreshUsesLatestStoredIdentityNotBufferedEventValue() async {
        let original = makeSession()
        let updated = makeSession(email: "updated@example.com", id: original.user.id)
        let auth = SessionAuthenticationStub(session: original)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()

        auth.currentSession = updated
        auth.send(.tokenRefreshed, session: original)
        await waitUntil { store.state == self.signedIn(updated) }

        XCTAssertEqual(store.state, signedIn(updated))
    }

    func testDelayedInitialSessionCannotUndoExplicitSignOut() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: session)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        await store.signOut()

        auth.send(.initialSession, session: session)
        await settleEvents()

        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(auth.currentSession)
    }

    func testLateRefreshCannotRestoreSessionAfterExplicitSignOut() async {
        let session = makeSession(expired: true)
        let auth = SessionAuthenticationStub(session: session)
        var continuation: CheckedContinuation<Session, Error>?
        auth.validSessionOperation = {
            try await withCheckedThrowingContinuation { continuation = $0 }
        }
        let store = SessionStore(authentication: auth)
        let restore = Task { await store.restoreSession() }
        await waitUntil { continuation != nil }
        let signingOut = Task { await store.signOut() }
        await waitUntil { store.state == .signedOut }

        // Match the SDK: an in-flight refresh can save tokens and emit an event
        // before its awaiting call resumes, even after a local sign-out.
        auth.currentSession = session
        auth.send(.tokenRefreshed, session: session)
        continuation?.resume(returning: session)
        await restore.value
        await signingOut.value
        // A later, independent buffered refresh is also cleared rather than accepted.
        auth.currentSession = session
        auth.send(.tokenRefreshed, session: session)
        await waitUntil { auth.currentSession == nil }

        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(auth.currentSession)
        XCTAssertEqual(auth.signOutCalls, 2)
    }

    func testCancelledRestoreDoesNotGrantAccessToAnUnverifiedStoredAccount() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: session)
        var continuation: CheckedContinuation<Session, Error>?
        auth.validSessionOperation = {
            try await withCheckedThrowingContinuation { continuation = $0 }
        }
        let store = SessionStore(authentication: auth, verifiedClients: verifiedReceipt(for: session))
        let restore = Task { await store.restoreSession() }
        await waitUntil { continuation != nil }
        restore.cancel()
        continuation?.resume(returning: makeSession(email: "stale@example.com"))
        await restore.value

        XCTAssertEqual(store.state, .signedOut)
    }

    func testSignOutCompletesWhenServerLogoutFails() async {
        let auth = SessionAuthenticationStub(session: makeSession())
        auth.signOutError = URLError(.notConnectedToInternet)
        var prepared = false
        let store = SessionStore(authentication: auth, prepareForSignOut: { prepared = true })
        await store.restoreSession()

        await store.signOut()

        XCTAssertTrue(prepared)
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(auth.currentSession)
        XCTAssertFalse(store.isSubmitting)
    }

    func testSignInNormalizesEmailAndKeepsPasswordOnlyInAuthCall() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: nil)
        auth.signInResult = .success(session)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()

        await store.signIn(email: "  CLIENT@EXAMPLE.COM\n", password: "synthetic-password")

        XCTAssertEqual(auth.signedInEmail, "client@example.com")
        XCTAssertEqual(auth.signInCalls, 1)
        XCTAssertEqual(store.state, signedIn(session))
        XCTAssertFalse(store.isSubmitting)
    }

    func testProfileCannotSignInWithoutPassword() async {
        let auth = SessionAuthenticationStub(session: nil)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()

        await store.signIn(email: "client@example.com", password: "")

        XCTAssertEqual(auth.signInCalls, 0)
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertEqual(store.message, "Enter your email and password.")
    }

    func testServerVerifiedCoachAccountEntersCoachRoleRatherThanClientRole() async {
        let auth = SessionAuthenticationStub(session: makeSession(email: AppConfiguration.coachEmail))
        auth.resolvedRole = .coach
        let store = SessionStore(authentication: auth)

        await store.restoreSession()

        guard case .signedIn(let account) = store.state else { return XCTFail("Expected verified coach access") }
        XCTAssertTrue(account.isCoach)
        XCTAssertEqual(auth.validSessionCalls, 1)
        XCTAssertEqual(auth.roleChecks, 1)
    }

    func testServerVerifiedClientReceiptPersistsAndRestoresMatchingSessionOffline() async throws {
        let suite = "VerifiedClientSessionTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: session)
        let first = SessionStore(authentication: auth, verifiedClients: VerifiedClientSessionStore(defaults: defaults))
        await first.restoreSession()
        XCTAssertEqual(auth.roleChecks, 1)
        let relaunchedReceipt = VerifiedClientSessionStore(defaults: defaults)
        let offline = SessionAuthenticationStub(session: session)
        offline.validSessionResult = .failure(URLError(.notConnectedToInternet))
        let relaunched = SessionStore(authentication: offline, verifiedClients: relaunchedReceipt)
        await relaunched.restoreSession()
        XCTAssertEqual(relaunched.state, signedIn(session))
        XCTAssertEqual(offline.roleChecks, 0, "The network failure occurs before role verification; only a matching client receipt permits the shell.")
    }

    func testUnverifiedPersistedSessionCannotRestoreOffline() async {
        let auth = SessionAuthenticationStub(session: makeSession())
        auth.validSessionResult = .failure(URLError(.notConnectedToInternet))
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertTrue(store.canRetryAccess)
        XCTAssertEqual(auth.signOutCalls, 0)
    }

    func testReceiptRequiresBothMatchingSDKUserIDAndEmail() async {
        let verified = makeSession()
        for different in [makeSession(email: "changed@example.com", id: verified.user.id), makeSession(email: verified.user.email!)] {
            let auth = SessionAuthenticationStub(session: different)
            auth.validSessionResult = .failure(URLError(.timedOut))
            let store = SessionStore(authentication: auth, verifiedClients: verifiedReceipt(for: verified))
            await store.restoreSession()
            XCTAssertEqual(store.state, .signedOut)
        }
    }

    func testCoachIntentCannotUseAClientReceiptWhenRoleCheckIsOffline() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: session)
        auth.signInResult = .success(session)
        auth.roleError = URLError(.notConnectedToInternet)
        let store = SessionStore(authentication: auth, verifiedClients: verifiedReceipt(for: session))
        await store.signIn(email: session.user.email!, password: "synthetic-password", intent: .coach)
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertTrue(store.canRetryAccess)
    }

    func testPermissionFailureCannotUseReceiptAndInvalidatesIt() async {
        let session = makeSession()
        let receipt = verifiedReceipt(for: session)
        let auth = SessionAuthenticationStub(session: session)
        auth.roleError = PostgrestError(code: "42501", message: "Permission denied")
        let store = SessionStore(authentication: auth, verifiedClients: receipt)
        await store.restoreSession()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(receipt.verifiedClient(for: session))
    }

    func testCoachClassificationNeverPersistsAnOfflineGrant() async {
        let session = makeSession()
        let receipt = verifiedReceipt(for: session)
        let auth = SessionAuthenticationStub(session: session)
        auth.resolvedRole = .coach
        let store = SessionStore(authentication: auth, verifiedClients: receipt)
        await store.restoreSession()
        guard case .signedIn(let account) = store.state else { return XCTFail("Expected verified coach") }
        XCTAssertTrue(account.isCoach)
        XCTAssertNil(receipt.verifiedClient(for: session))
        auth.roleError = URLError(.notConnectedToInternet)
        await store.refreshSession()
        XCTAssertEqual(store.state, .signedOut)
    }

    func testExplicitLogoutAndRevocationClearVerifiedClientReceipt() async {
        for revoked in [false, true] {
            let session = makeSession()
            let receipt = VerifiedClientSessionStore()
            let auth = SessionAuthenticationStub(session: session)
            let store = SessionStore(authentication: auth, verifiedClients: receipt)
            await store.restoreSession()
            XCTAssertNotNil(receipt.verifiedClient(for: session))
            if revoked {
                auth.currentSession = nil
                auth.send(.signedOut)
                await waitUntil { store.state == .signedOut }
            } else {
                await store.signOut()
            }
            XCTAssertNil(receipt.verifiedClient(for: session))
        }
    }

    func testRememberedProfileAloneNeverAuthorizesOfflineAccess() async {
        let session = makeSession()
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("profile-auth-test-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: file) }
        let profile = RememberedProfileStore(fileURL: file)
        profile.remember(account: SignedInAccount(id: session.user.id, email: session.user.email!), displayName: "Remembered client")
        let auth = SessionAuthenticationStub(session: session)
        auth.validSessionResult = .failure(URLError(.notConnectedToInternet))
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        XCTAssertNotNil(profile.profile)
        XCTAssertEqual(store.state, .signedOut)
    }

    func testAuthObservationDoesNotRetainSessionStore() async {
        let auth = SessionAuthenticationStub(session: makeSession())
        var store: SessionStore? = SessionStore(authentication: auth)
        weak var weakStore = store
        await store?.restoreSession()
        await settleEvents()

        store = nil
        await waitUntil { weakStore == nil }

        XCTAssertNil(weakStore)
    }

    func testSignInWaitsForOldRefreshBeforeSwitchingAccounts() async {
        let oldSession = makeSession(expired: true)
        let auth = SessionAuthenticationStub(session: oldSession)
        var continuation: CheckedContinuation<Session, Error>?
        auth.validSessionOperation = {
            try await withCheckedThrowingContinuation { continuation = $0 }
        }
        let store = SessionStore(authentication: auth)
        let restore = Task { await store.restoreSession() }
        await waitUntil { continuation != nil }
        let signingOut = Task { await store.signOut() }
        await waitUntil { store.state == .signedOut }
        auth.signInResult = .success(makeSession(email: "second@example.com"))

        await store.signIn(email: "second@example.com", password: "synthetic-password")
        XCTAssertEqual(auth.signInCalls, 0)
        XCTAssertEqual(store.state, .signedOut)

        continuation?.resume(throwing: URLError(.cancelled))
        await restore.value
        await signingOut.value
        await store.signIn(email: "second@example.com", password: "synthetic-password")
        XCTAssertEqual(auth.signInCalls, 1)
        if case .signedIn(let account) = store.state {
            XCTAssertEqual(account.email, "second@example.com")
        } else { XCTFail("The new client should be signed in after the old refresh ends.") }
    }

    func testBufferedSignOutCannotCancelPendingCredentialSignIn() async {
        let session = makeSession(email: "second@example.com")
        let auth = SessionAuthenticationStub(session: nil)
        var continuation: CheckedContinuation<Session, Error>?
        auth.signInOperation = {
            try await withCheckedThrowingContinuation { continuation = $0 }
        }
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        let signingIn = Task { await store.signIn(email: "second@example.com", password: "synthetic-password") }
        await waitUntil { continuation != nil }

        auth.send(.signedOut)
        await auth.waitForAuthEvents()
        XCTAssertTrue(store.isSubmitting, "A logout from the previous account cannot cancel pending credentials.")
        XCTAssertNil(store.message)

        continuation?.resume(returning: session)
        await signingIn.value
        XCTAssertEqual(store.state, signedIn(session))
    }

    func testRevocationDuringNewAccountRoleVerificationStillPreventsSignIn() async {
        let session = makeSession(email: "second@example.com")
        let auth = SessionAuthenticationStub(session: nil)
        auth.signInResult = .success(session)
        var continuation: CheckedContinuation<AccountRole, Error>?
        auth.roleOperation = {
            try await withCheckedThrowingContinuation { continuation = $0 }
        }
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        let signingIn = Task { await store.signIn(email: "second@example.com", password: "synthetic-password") }
        await waitUntil { continuation != nil }

        auth.currentSession = nil
        auth.send(.signedOut)
        await auth.waitForAuthEvents()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertEqual(store.message, "Your session has ended. Please sign in again.")

        continuation?.resume(returning: .client)
        await signingIn.value
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(auth.currentSession)
    }

    func testFailedCredentialSignInRejectsLaterSessionEvents() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: nil)
        auth.signInResult = .failure(URLError(.timedOut))
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        await store.signIn(email: "client@example.com", password: "synthetic-password")

        auth.currentSession = session
        auth.send(.tokenRefreshed, session: session)
        await auth.waitForAuthEvents()

        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(auth.currentSession)
        XCTAssertEqual(auth.signOutCalls, 1)
    }

    func testCancelledCredentialSignInCannotReenableSessionEvents() async {
        let session = makeSession()
        let auth = SessionAuthenticationStub(session: nil)
        var continuation: CheckedContinuation<Session, Error>?
        auth.signInOperation = {
            try await withCheckedThrowingContinuation { continuation = $0 }
        }
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        let signingIn = Task { await store.signIn(email: "client@example.com", password: "synthetic-password") }
        await waitUntil { continuation != nil }
        signingIn.cancel()
        continuation?.resume(returning: session)
        await signingIn.value
        await auth.waitForAuthEvents()
        let priorSignOutCalls = auth.signOutCalls
        auth.currentSession = session
        auth.send(.tokenRefreshed, session: session)
        await auth.waitForAuthEvents()

        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(auth.currentSession)
        XCTAssertEqual(auth.signOutCalls, priorSignOutCalls + 1)
    }

    func testUnexpectedAccountRefreshCannotSwitchOpenClient() async {
        let auth = SessionAuthenticationStub(session: makeSession())
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        auth.currentSession = makeSession(email: "previous@example.com")
        auth.send(.tokenRefreshed)
        await waitUntil { store.state == .signedOut && auth.currentSession == nil }
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(auth.currentSession)
    }

    private func signedIn(_ session: Session) -> SessionStore.State {
        .signedIn(SignedInAccount(id: session.user.id, email: session.user.email!))
    }

    private func verifiedReceipt(for session: Session) -> VerifiedClientSessionStore {
        let receipt = VerifiedClientSessionStore()
        receipt.remember(SignedInAccount(id: session.user.id, email: session.user.email!))
        return receipt
    }

    private func makeSession(
        email: String = "client@example.com", id: UUID = UUID(), expired: Bool = false
    ) -> Session {
        let now = Date()
        return Session(
            accessToken: "synthetic-access-token", tokenType: "bearer", expiresIn: 3_600,
            expiresAt: now.addingTimeInterval(expired ? -3_600 : 3_600).timeIntervalSince1970,
            refreshToken: "synthetic-refresh-token",
            user: User(id: id, appMetadata: [:], userMetadata: [:], aud: "authenticated",
                       email: email, createdAt: now, updatedAt: now)
        )
    }

    private func waitUntil(
        file: StaticString = #filePath, line: UInt = #line, _ condition: () -> Bool
    ) async {
        for _ in 0..<200 {
            if condition() { return }
            try? await Task.sleep(nanoseconds: 1_000_000)
        }
        XCTAssertTrue(condition(), "Timed out waiting for the auth transition.", file: file, line: line)
    }

    private func settleEvents() async {
        for _ in 0..<10 { await Task.yield() }
    }
}

@MainActor
private final class SessionAuthenticationStub: SessionAuthenticating {
    var currentSession: Session?
    private let events = SessionAuthEventBuffer()
    var authStateChanges: AsyncStream<(event: AuthChangeEvent, session: Session?)> {
        AsyncStream(unfolding: { [events] in await events.next() })
    }
    var validSessionOperation: (() async throws -> Session)?
    var validSessionResult: Result<Session, Error>?
    var signInResult: Result<Session, Error>?
    var signInOperation: (() async throws -> Session)?
    var roleOperation: (() async throws -> AccountRole)?
    var signOutError: Error?
    var roleError: Error?
    var recoverySession: Session?
    var resolvedRole: AccountRole = .client
    private(set) var roleChecks = 0
    private(set) var validSessionCalls = 0
    private(set) var signInCalls = 0
    private(set) var signOutCalls = 0
    private(set) var signedInEmail: String?
    private(set) var updatedPasswords: [String] = []

    init(session: Session?) {
        currentSession = session
    }

    func validSession() async throws -> Session {
        validSessionCalls += 1
        if let validSessionOperation { return try await validSessionOperation() }
        if let validSessionResult { return try validSessionResult.get() }
        guard let currentSession else { throw AuthError.sessionMissing }
        return currentSession
    }

    func restore() async throws -> SessionAuthIdentity {
        guard currentSession != nil else { throw AuthError.sessionMissing }
        return identity(try await validSession())
    }

    func refresh() async throws -> SessionAuthIdentity { identity(try await validSession()) }

    func role(for identity: SessionAuthIdentity) async throws -> AccountRole {
        roleChecks += 1
        if let roleOperation { return try await roleOperation() }
        if let roleError { throw roleError }
        return resolvedRole
    }

    func signIn(email: String, password: String) async throws -> SessionAuthIdentity {
        signInCalls += 1
        signedInEmail = email
        let session: Session
        if let signInOperation { session = try await signInOperation() }
        else if let signInResult { session = try signInResult.get() }
        else { throw AuthError.sessionMissing }
        currentSession = session
        send(.signedIn, session: session)
        return identity(session)
    }

    func resetPassword(email: String) async throws {}

    func recoverPassword(from url: URL) async throws {
        guard let recoverySession else { throw AuthError.sessionMissing }
        currentSession = recoverySession
        send(.signedIn, session: recoverySession)
    }

    func updatePassword(_ password: String) async throws {
        updatedPasswords.append(password)
        send(.userUpdated, session: currentSession)
    }

    func signOut() async throws {
        signOutCalls += 1
        currentSession = nil
        send(.signedOut)
        if let signOutError { throw signOutError }
    }

    func send(_ event: AuthChangeEvent, session: Session? = nil) {
        events.send((event, session))
    }

    func waitForAuthEvents() async { await events.waitUntilHandled() }

    private func identity(_ session: Session) -> SessionAuthIdentity {
        SessionAuthIdentity(id: session.user.id, email: session.user.email)
    }
}

/// An event is handled when the observer asks for its next event. This lets
/// concurrency tests order SDK events without relying on sleeps or Task.yield.
@MainActor
private final class SessionAuthEventBuffer {
    typealias Event = (event: AuthChangeEvent, session: Session?)
    private var iterator: AsyncStream<Event>.Iterator
    private let continuation: AsyncStream<Event>.Continuation
    private var sent = 0
    private var delivered = 0
    private var handled = 0
    private var waiters: [(target: Int, continuation: CheckedContinuation<Void, Never>)] = []

    init() {
        let stream = AsyncStream<Event>.makeStream()
        iterator = stream.stream.makeAsyncIterator()
        continuation = stream.continuation
    }

    func send(_ event: Event) {
        sent += 1
        continuation.yield(event)
    }

    func next() async -> Event? {
        handled = delivered
        let ready = waiters.filter { $0.target <= handled }
        waiters.removeAll { $0.target <= handled }
        ready.forEach { $0.continuation.resume() }
        var nextIterator = iterator
        let event = await nextIterator.next()
        iterator = nextIterator
        if event != nil { delivered += 1 }
        return event
    }

    func waitUntilHandled() async {
        let target = sent
        guard handled < target else { return }
        await withCheckedContinuation { waiters.append((target, $0)) }
    }
}
