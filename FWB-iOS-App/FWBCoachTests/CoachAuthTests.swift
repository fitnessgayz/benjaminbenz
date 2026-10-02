import XCTest
import Supabase
@testable import FWBCoach

@MainActor
final class CoachAuthTests: XCTestCase {
    func testShippingAppRequiresCoachRole() {
        XCTAssertEqual(AppConfiguration.requiredAccountRole, .coach)
    }

    func testCoachBundleRejectsClientRegardlessOfSignInIntent() async {
        let auth = MockSessionAuthentication(role: .client)
        let store = SessionStore(authentication: auth, requiredRole: .coach)
        await store.signIn(email: "client@example.com", password: "password")
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertEqual(auth.signOutCount, 1)
        XCTAssertTrue(store.message?.contains("FWB Coach") == true)
    }

    func testCoachBundleRejectsRestoredClientSession() async {
        let auth = MockSessionAuthentication(role: .client)
        let store = SessionStore(authentication: auth, requiredRole: .coach)
        await store.restoreSession()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertEqual(auth.signOutCount, 1)
    }

    func testCoachBundleAllowsServerVerifiedCoach() async {
        let auth = MockSessionAuthentication(role: .coach)
        let store = SessionStore(authentication: auth, requiredRole: .coach)
        await store.signIn(email: "coach@example.com", password: "password")
        guard case .signedIn(let account) = store.state else { return XCTFail("Expected coach workspace") }
        XCTAssertTrue(account.isCoach)
    }

    func testExistingAccountInitializersRemainClients() {
        let account = SignedInAccount(id: UUID(), email: "client@example.com")
        XCTAssertEqual(account.role, .client)
        XCTAssertFalse(account.isCoach)
    }

    func testServerRoleRoutesCoachEvenThroughNormalSignIn() async {
        let auth = MockSessionAuthentication(role: .coach)
        let store = SessionStore(authentication: auth)
        await store.signIn(email: "  COACH@example.com  ", password: "password")
        XCTAssertEqual(auth.submittedEmail, "coach@example.com")
        XCTAssertEqual(auth.roleChecks, [auth.identity])
        guard case .signedIn(let account) = store.state else { return XCTFail("Expected coach sign-in") }
        XCTAssertTrue(account.isCoach)
        XCTAssertEqual(account.id, auth.identity.id)
        XCTAssertNil(store.message)
    }

    func testCoachEmailAndSelectorCannotGrantCoachRole() async {
        let auth = MockSessionAuthentication(role: .client, email: AppConfiguration.coachEmail)
        let store = SessionStore(authentication: auth)
        await store.signIn(email: AppConfiguration.coachEmail, password: "password", intent: .coach)
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertEqual(auth.signOutCount, 1)
        XCTAssertTrue(store.message?.contains("does not have coach access") == true)
        XCTAssertFalse(store.canRetryAccess)
        XCTAssertEqual(auth.roleChecks.count, 1)
    }

    func testNormalClientSignInRequiresServerRoleCheck() async {
        let auth = MockSessionAuthentication(role: .client)
        let store = SessionStore(authentication: auth)
        await store.signIn(email: "client@example.com", password: "password")
        XCTAssertEqual(auth.roleChecks, [auth.identity])
        guard case .signedIn(let account) = store.state else { return XCTFail("Expected client sign-in") }
        XCTAssertFalse(account.isCoach)
    }

    func testInitialRoleFailureDoesNotExposeEitherWorkspaceAndCanRetry() async {
        let auth = MockSessionAuthentication(role: .coach)
        auth.roleError = URLError(.notConnectedToInternet)
        let store = SessionStore(authentication: auth)
        await store.signIn(email: "coach@example.com", password: "password", intent: .coach)
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertTrue(store.canRetryAccess)
        XCTAssertTrue(store.message?.contains("Retry access") == true)
        XCTAssertFalse(store.message?.contains("password did not work") == true)
        XCTAssertEqual(auth.signOutCount, 0, "Temporary role failure preserves authentication for retry")
        auth.roleError = nil
        await store.retryAccess()
        guard case .signedIn(let account) = store.state else { return XCTFail("Expected recovered coach access") }
        XCTAssertTrue(account.isCoach)
        XCTAssertFalse(store.canRetryAccess)
        XCTAssertEqual(auth.signInCount, 1, "Retry should use the existing authenticated session")
    }

    func testRetryPreservesExplicitCoachIntent() async {
        let auth = MockSessionAuthentication(role: .client)
        auth.roleError = URLError(.timedOut)
        let store = SessionStore(authentication: auth)
        await store.signIn(email: "client@example.com", password: "password", intent: .coach)
        auth.roleError = nil
        await store.retryAccess()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertEqual(auth.signOutCount, 1)
        XCTAssertTrue(store.message?.contains("Choose Client") == true)
    }

    func testRestoreResolvesServerRoleAndRunsOnlyOnce() async {
        let auth = MockSessionAuthentication(role: .coach)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        await store.restoreSession()
        XCTAssertEqual(auth.restoreCount, 1)
        XCTAssertEqual(auth.roleChecks.count, 1)
        guard case .signedIn(let account) = store.state else { return XCTFail("Expected restored coach") }
        XCTAssertTrue(account.isCoach)
    }

    func testCleanInstallWithoutSessionShowsLoginWithoutError() async {
        let auth = MockSessionAuthentication(role: .client)
        auth.restoreError = AuthError.sessionMissing
        auth.currentSession = nil
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertNil(store.message)
        XCTAssertEqual(auth.roleChecks.count, 0)
        XCTAssertFalse(store.canRetryAccess)
    }

    func testRestoreNetworkFailurePreservesSessionAndOffersRetry() async {
        let auth = MockSessionAuthentication(role: .client)
        auth.restoreError = URLError(.notConnectedToInternet)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertTrue(store.canRetryAccess)
        XCTAssertEqual(auth.signOutCount, 0)
        auth.restoreError = nil
        await store.retryAccess()
        guard case .signedIn = store.state else { return XCTFail("Expected retry to restore client") }
    }

    func testTransientForegroundFailurePreservesVerifiedClientOfflineTraining() async {
        let auth = MockSessionAuthentication(role: .client)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        let before = store.state
        auth.refreshError = URLError(.notConnectedToInternet)
        await store.refreshSession()
        XCTAssertEqual(store.state, before)
        XCTAssertEqual(auth.signOutCount, 0)
        XCTAssertTrue(store.canRetryAccess)
    }

    func testCoachRefreshFailureHidesWorkspaceUntilAccessCanBeVerified() async {
        let auth = MockSessionAuthentication(role: .coach)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        auth.roleError = URLError(.timedOut)
        await store.refreshSession()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertTrue(store.canRetryAccess)
        XCTAssertEqual(auth.signOutCount, 0)
    }

    func testServerRoleChangeRemovesCoachAccessOnRefresh() async {
        let auth = MockSessionAuthentication(role: .coach)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        auth.resolvedRole = .client
        await store.refreshSession()
        guard case .signedIn(let account) = store.state else { return XCTFail("Expected client role after server change") }
        XCTAssertFalse(account.isCoach)
        XCTAssertEqual(auth.roleChecks.count, 2)
    }

    func testRevokedRefreshTokenEndsClientSession() async {
        let auth = MockSessionAuthentication(role: .client)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        auth.refreshError = AuthError.sessionMissing
        await store.refreshSession()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertFalse(store.canRetryAccess)
        XCTAssertEqual(auth.signOutCount, 1)
    }

    func testAuthRevocationEventImmediatelyClosesCoachWorkspace() async {
        let auth = MockSessionAuthentication(role: .coach)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        store.sessionWasRevoked()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertTrue(store.message?.contains("session has ended") == true)
        XCTAssertFalse(store.canRetryAccess)
    }

    func testSignOutClosesWorkspaceEvenWhenNetworkLogoutFails() async {
        let auth = MockSessionAuthentication(role: .coach)
        auth.signOutError = URLError(.notConnectedToInternet)
        var prepared = false
        let store = SessionStore(authentication: auth, prepareForSignOut: { prepared = true })
        await store.restoreSession()
        await store.signOut()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertTrue(prepared)
        XCTAssertEqual(auth.signOutCount, 1)
        XCTAssertFalse(store.isSubmitting)
    }

    func testSignOutWaitsForLateSignInThenClearsCredentialsWithoutReopeningUI() async {
        let auth = MockSessionAuthentication(role: .coach)
        auth.suspendSignIn = true
        let store = SessionStore(authentication: auth)
        let signingIn = Task { await store.signIn(email: "coach@example.com", password: "password") }
        await waitUntil { auth.signInContinuation != nil }
        let signingOut = Task { await store.signOut() }
        await waitUntil { store.state == .signedOut }
        XCTAssertEqual(auth.signOutCount, 0)
        auth.finishSignIn()
        await signingIn.value
        await signingOut.value
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertEqual(auth.calls, ["signIn", "signInFinished", "signOut"])
        XCTAssertTrue(auth.roleChecks.isEmpty)
        XCTAssertFalse(store.isSubmitting)
    }

    func testDoubleSubmitDoesNotStartAnotherAuthentication() async {
        let auth = MockSessionAuthentication(role: .coach)
        auth.suspendSignIn = true
        let store = SessionStore(authentication: auth)
        let first = Task { await store.signIn(email: "coach@example.com", password: "password") }
        await waitUntil { auth.signInContinuation != nil }
        await store.signIn(email: "second@example.com", password: "password")
        XCTAssertEqual(auth.signInCount, 1)
        auth.finishSignIn()
        await first.value
    }

    func testCallerCancellationCannotPublishLateCoachResult() async {
        let auth = MockSessionAuthentication(role: .coach)
        auth.suspendSignIn = true
        let store = SessionStore(authentication: auth)
        let task = Task { await store.signIn(email: "coach@example.com", password: "password") }
        await waitUntil { auth.signInContinuation != nil }
        task.cancel()
        auth.finishSignIn()
        await task.value
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertFalse(store.isSubmitting)
        XCTAssertTrue(auth.roleChecks.isEmpty)
    }

    func testMissingEmailCannotEnterWorkspace() async {
        let auth = MockSessionAuthentication(role: .coach, email: nil)
        let store = SessionStore(authentication: auth)
        await store.restoreSession()
        XCTAssertEqual(store.state, .signedOut)
        XCTAssertEqual(auth.signOutCount, 1)
        XCTAssertTrue(auth.roleChecks.isEmpty)
    }

    func testResetAndInputValidationRetainExistingBehavior() async {
        let auth = MockSessionAuthentication(role: .client)
        let store = SessionStore(authentication: auth)
        await store.signIn(email: " ", password: "password")
        XCTAssertEqual(store.message, "Enter your email and password.")
        XCTAssertEqual(auth.signInCount, 0)
        await store.sendPasswordReset(email: " CLIENT@example.com ")
        XCTAssertEqual(auth.resetEmail, "client@example.com")
        XCTAssertEqual(store.message, "If that account exists, a reset link was sent. Open it on this iPhone to choose a new password.")
        XCTAssertFalse(store.isSubmitting)
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<200 {
            if condition() { return }
            await Task.yield()
        }
        XCTFail("Asynchronous auth operation did not reach its expected checkpoint")
    }
}

@MainActor
private final class MockSessionAuthentication: SessionAuthenticating {
    let identity: SessionAuthIdentity
    var currentSession: Session?
    var resolvedRole: AccountRole
    var roleError: Error?
    var restoreError: Error?
    var refreshError: Error?
    var signOutError: Error?
    var suspendSignIn = false
    var signInContinuation: CheckedContinuation<Void, Never>?
    var submittedEmail: String?
    var resetEmail: String?
    var roleChecks: [SessionAuthIdentity] = []
    var calls: [String] = []
    var restoreCount = 0
    var signInCount = 0
    var signOutCount = 0

    init(role: AccountRole, email: String? = "account@example.com") {
        resolvedRole = role
        identity = SessionAuthIdentity(id: UUID(), email: email)
        currentSession = makeSession()
    }

    func restore() async throws -> SessionAuthIdentity {
        restoreCount += 1
        if let restoreError { throw restoreError }
        return identity
    }

    func signIn(email: String, password: String) async throws -> SessionAuthIdentity {
        signInCount += 1
        submittedEmail = email
        calls.append("signIn")
        if suspendSignIn { await withCheckedContinuation { signInContinuation = $0 } }
        calls.append("signInFinished")
        currentSession = makeSession()
        return identity
    }

    func finishSignIn() {
        signInContinuation?.resume()
        signInContinuation = nil
    }

    func refresh() async throws -> SessionAuthIdentity {
        if let refreshError { throw refreshError }
        return identity
    }

    func role(for identity: SessionAuthIdentity) async throws -> AccountRole {
        roleChecks.append(identity)
        if let roleError { throw roleError }
        return resolvedRole
    }

    func resetPassword(email: String) async throws { resetEmail = email }

    func signOut() async throws {
        calls.append("signOut")
        signOutCount += 1
        currentSession = nil
        if let signOutError { throw signOutError }
    }

    private func makeSession() -> Session {
        let now = Date()
        return Session(
            accessToken: "synthetic-access-token", tokenType: "bearer", expiresIn: 3600,
            expiresAt: now.addingTimeInterval(3600).timeIntervalSince1970, refreshToken: "synthetic-refresh-token",
            user: User(id: identity.id, appMetadata: [:], userMetadata: [:], aud: "authenticated",
                       email: identity.email, createdAt: now, updatedAt: now)
        )
    }
}
