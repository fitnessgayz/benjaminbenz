import Supabase
import XCTest
@testable import FWBCoach

@MainActor
final class WorkoutHistoryDeletionTests: XCTestCase {
    private let firstID = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let secondID = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!

    func testModernTargetUsesOnlyTheSelectedSessionNotSameDateOrTitle() throws {
        let first = record(sessionID: firstID)
        let second = record(sessionID: secondID)
        let target = try XCTUnwrap(WorkoutHistoryDeletionTarget(session([first])))
        XCTAssertEqual(target, .session(firstID))
        XCTAssertTrue(target.includes(first))
        XCTAssertFalse(target.includes(second))
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(target)) as? [String: Any])
        XCTAssertEqual(body.keys.sorted(), ["p_session_id"])
        XCTAssertEqual((body["p_session_id"] as? String)?.lowercased(), firstID.uuidString.lowercased())
    }

    func testLegacyTargetUsesEveryExactRowIDAndNeverDateOrTitlePredicates() throws {
        let first = record(rowID: firstID, sessionID: nil)
        let second = record(rowID: secondID, sessionID: nil, setNumber: 2)
        let target = try XCTUnwrap(WorkoutHistoryDeletionTarget(session([first, second])))
        XCTAssertEqual(target, .rows([firstID, secondID]))
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(target)) as? [String: Any])
        XCTAssertEqual(body.keys.sorted(), ["p_log_ids"])
        XCTAssertEqual((body["p_log_ids"] as? [String])?.count, 2)
    }

    func testMixedUnknownEmptyOrDuplicateIdentityIsRejected() {
        XCTAssertNil(WorkoutHistoryDeletionTarget(session([])))
        XCTAssertNil(WorkoutHistoryDeletionTarget(session([record(sessionID: firstID), record(sessionID: secondID)])))
        XCTAssertNil(WorkoutHistoryDeletionTarget(session([record(sessionID: firstID), record(sessionID: nil)])))
        XCTAssertNil(WorkoutHistoryDeletionTarget(session([record(sessionID: firstID, known: false)])))
        XCTAssertNil(WorkoutHistoryDeletionTarget(session([record(sessionID: nil)])))
        XCTAssertNil(WorkoutHistoryDeletionTarget(session([record(rowID: firstID, sessionID: nil), record(rowID: firstID, sessionID: nil)])))
    }

    func testMissingServerIdentityStaysUnknownAfterCacheRoundTrip() throws {
        let json = """
        {"id":"11111111-1111-4111-8111-111111111111","entry_date":"2026-09-26","workout_title":"Workout A","exercise_code":"A1","exercise_name":"Chest Press","set_number":1,"weight_used":50}
        """
        let decoded = try JSONDecoder().decode(WorkoutHistoryRecord.self, from: Data(json.utf8))
        XCTAssertFalse(decoded.hasSessionIdentity)
        XCTAssertNil(WorkoutHistoryDeletionTarget(session([decoded])))
        let cached = try JSONDecoder().decode(WorkoutHistoryRecord.self, from: JSONEncoder().encode(decoded))
        XCTAssertFalse(cached.hasSessionIdentity)
        XCTAssertNil(WorkoutHistoryDeletionTarget(session([cached])))
    }

    func testDeletingSessionPurgesItsPendingQueueAndDraftButPreservesAnotherSameDaySession() async throws {
        let repository = OfflineWorkoutRepository(inMemory: true)
        let first = offlineSession(id: firstID)
        let second = offlineSession(id: secondID)
        try await repository.enqueue(first)
        try await repository.enqueue(second)
        try await repository.markDeleted(sessionID: firstID, email: " CLIENT@EXAMPLE.COM ")
        let queue = await repository.queuedSessions()
        let draft = await repository.draft(id: second.id)
        XCTAssertEqual(queue.map(\.stableSessionID), [secondID])
        XCTAssertEqual(draft?.stableSessionID, secondID)
        do { try await repository.enqueue(first); XCTFail("A deleted session must not return to the outbox") }
        catch is DeletedWorkoutSessionError { }
        do { try await repository.saveDraft(first); XCTFail("A deleted session must not return to recovery") }
        catch is DeletedWorkoutSessionError { }
    }

    func testDeletionTombstonePersistsAcrossRestartAndIsBoundToItsOwner() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("history-delete-\(UUID()).json")
        defer { try? FileManager.default.removeItem(at: file) }
        let first = OfflineWorkoutRepository(fileURL: file)
        try await first.enqueue(offlineSession(id: firstID))
        try await first.markDeleted(sessionID: firstID, email: "client@example.com")
        let restored = OfflineWorkoutRepository(fileURL: file)
        let deleted = await restored.isDeleted(sessionID: firstID, email: "CLIENT@example.com")
        let anotherOwner = await restored.isDeleted(sessionID: firstID, email: "other@example.com")
        let queue = await restored.queuedSessions()
        XCTAssertTrue(deleted)
        XCTAssertFalse(anotherOwner)
        XCTAssertTrue(queue.isEmpty)
        try await restored.enqueue(offlineSession(id: firstID, email: "other@example.com"))
    }

    func testOldRecoveryFileWithoutTombstonesRemainsReadable() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("history-delete-legacy-\(UUID()).json")
        defer { try? FileManager.default.removeItem(at: file) }
        try Data("{\"schemaVersion\":3,\"drafts\":{},\"queue\":{}}".utf8).write(to: file)
        let repository = OfflineWorkoutRepository(fileURL: file)
        try await repository.enqueue(offlineSession(id: firstID))
        let count = await repository.pendingCount()
        XCTAssertEqual(count, 1)
    }

    func testServiceVerifiesTheSignedInOwnerBeforeCallingTheServer() async throws {
        let fixture = HistoryDeletionHTTPFixture()
        defer { fixture.close() }
        let service = SupabaseWorkoutHistoryDeletionService(client: fixture.client, accountEmail: { "other@example.com" })
        do {
            _ = try await service.delete(.session(firstID), email: "client@example.com")
            XCTFail("Wrong account must be rejected")
        } catch WorkoutHistoryDeletionError.differentAccount { }
        XCTAssertEqual(fixture.transport.requests.count, 0)
    }

    func testServiceUsesAtomicSessionRPCAndVerifiesReturnedSession() async throws {
        let fixture = HistoryDeletionHTTPFixture()
        defer { fixture.close() }
        let service = SupabaseWorkoutHistoryDeletionService(client: fixture.client, accountEmail: { "client@example.com" })
        fixture.transport.responseSessionID = firstID
        let result = try await service.delete(.session(firstID), email: " CLIENT@example.com ")
        XCTAssertEqual(result.sessionID, firstID)
        let request = try XCTUnwrap(fixture.transport.requests.first)
        XCTAssertEqual(request.url?.path, "/rest/v1/rpc/delete_client_workout_session")
        XCTAssertEqual(request.httpMethod, "POST")
        let body = try fixture.transport.jsonBody(request)
        XCTAssertEqual(body.keys.sorted(), ["p_session_id"])
        fixture.transport.responseSessionID = secondID
        do { _ = try await service.delete(.session(firstID), email: "client@example.com"); XCTFail("Wrong result must fail") }
        catch WorkoutHistoryDeletionError.unconfirmed { }
    }

    func testStoreDeletesOnlyConfirmedSessionAndRemovesItsOfflineRecovery() async throws {
        let fixture = HistoryDeletionHTTPFixture()
        defer { fixture.close() }
        fixture.transport.rows = [record(sessionID: firstID), record(sessionID: secondID)]
        fixture.transport.responseSessionID = firstID
        let repository = OfflineWorkoutRepository(inMemory: true)
        try await repository.enqueue(offlineSession(id: firstID))
        try await repository.enqueue(offlineSession(id: secondID))
        let cache = temporaryCache()
        defer { try? FileManager.default.removeItem(at: cache) }
        let store = makeStore(fixture, repository: repository, cache: cache)
        await store.reload(email: "client@example.com")
        XCTAssertEqual(store.sessions.count, 2)
        let target = try XCTUnwrap(store.sessions.first { $0.sessionID == firstID })
        let didDelete = await store.delete(target, email: "client@example.com")
        XCTAssertTrue(didDelete)
        XCTAssertEqual(store.sessions.compactMap(\.sessionID), [secondID])
        let queued = await repository.queuedSessions()
        XCTAssertEqual(queued.map(\.stableSessionID), [secondID])
        XCTAssertNil(store.deletionError)
        XCTAssertNil(store.deletingSessionID)
        XCTAssertEqual(store.deletionNotice, "Workout deleted from your logs.")
        // An old/in-flight server snapshot must not put locally deleted data back.
        await store.reload(email: "client@example.com")
        XCTAssertEqual(store.sessions.compactMap(\.sessionID), [secondID])
    }

    func testFailedDeleteKeepsHistoryAndPendingEditsAndCanRetry() async throws {
        let fixture = HistoryDeletionHTTPFixture()
        defer { fixture.close() }
        fixture.transport.rows = [record(sessionID: firstID)]
        fixture.transport.responseSessionID = firstID
        fixture.transport.failDeletion = true
        let repository = OfflineWorkoutRepository(inMemory: true)
        try await repository.enqueue(offlineSession(id: firstID))
        let cache = temporaryCache()
        defer { try? FileManager.default.removeItem(at: cache) }
        let store = makeStore(fixture, repository: repository, cache: cache)
        await store.reload(email: "client@example.com")
        let target = try XCTUnwrap(store.sessions.first)
        let failed = await store.delete(target, email: "client@example.com")
        let count = await repository.pendingCount()
        XCTAssertFalse(failed)
        XCTAssertEqual(store.sessions.count, 1)
        XCTAssertEqual(count, 1)
        XCTAssertNotNil(store.deletionError)
        XCTAssertNil(store.deletionNotice)
        fixture.transport.failDeletion = false
        let retried = await store.delete(target, email: "client@example.com")
        XCTAssertTrue(retried)
        XCTAssertTrue(store.sessions.isEmpty)
        XCTAssertNil(store.deletionError)
    }

    func testGeneratedSavedNameShowsTheHumanTitleWithCaseInsensitiveWrapperAndUUID() {
        let suffix = "e5b179d1-d9b9-4347-9bf9-7cdbb1e5c7b5"
        for raw in ["Custom workout · Full body workout · " + suffix,
                    "  CUSTOM WORKOUT · Full body workout · " + suffix.uppercased() + "  ",
                    "Custom Workout·Full body workout·" + suffix] {
            XCTAssertEqual(raw.fwbWorkoutDisplayTitle.fwbTitleCased, "Full Body Workout")
        }
    }

    func testReadableNamesPreserveMeaningfulAssignedNamesAcronymsAndNonUUIDSuffixes() {
        for (raw, expected) in [
            ("Workout A · RDL + TRX", "Workout A · RDL + TRX"),
            ("Benjamin’s Friday strength", "Benjamin’s Friday Strength"),
            ("Custom workout · Lower body · Week 2", "Lower Body · Week 2"),
            ("Workout A · deadbeef", "Workout A · Deadbeef"),
            ("Workout A · e5b179d1-d9b9-4347-9bf9-not-a-real-uuid", "Workout A · E5b179d1-D9b9-4347-9bf9-Not-A-Real-Uuid"),
            ("Custom workout", "Custom Workout")
        ] {
            XCTAssertEqual(raw.fwbWorkoutDisplayTitle.fwbTitleCased, expected)
        }
    }

    func testCopyAndCSVUseReadableNamesWithoutChangingTheOriginalIdentity() throws {
        let raw = "Custom workout · Full body workout · e5b179d1-d9b9-4347-9bf9-7cdbb1e5c7b5"
        let record = WorkoutHistoryRecord(sessionID: firstID, entryDate: "2026-09-26", workoutTitle: raw,
            exerciseCode: "A1", exerciseName: "Chest Press", setNumber: 1, weightUsed: 50, reps: 10, notes: nil)
        let log = WorkoutHistorySession(entryDate: record.entryDate, workoutTitle: raw, records: [record])
        let copy = WorkoutHistoryCopyPlan(session: log)
        XCTAssertEqual(copy.workout.title.fwbWorkoutDisplayTitle.fwbTitleCased, "Copy Of Full Body Workout")
        XCTAssertEqual(log.workoutTitle, raw)
        XCTAssertEqual(log.sessionID, firstID)
        XCTAssertEqual(WorkoutHistoryDeletionTarget(log), .session(firstID))
        let csv = try XCTUnwrap(String(data: WorkoutHistoryCSVDocument(sessions: [log]).data, encoding: .utf8))
        XCTAssertTrue(csv.contains("Full Body Workout"))
        XCTAssertFalse(csv.contains("Custom workout"))
        XCTAssertFalse(csv.contains("e5b179d1"))
        let oldCopy = "Copy of " + raw + " · abc123ef"
        XCTAssertEqual(oldCopy.fwbWorkoutDisplayTitle.fwbTitleCased, "Copy Of Full Body Workout")
    }

    private func makeStore(_ fixture: HistoryDeletionHTTPFixture, repository: OfflineWorkoutRepository, cache: URL) -> WorkoutHistoryStore {
        WorkoutHistoryStore(client: fixture.client,
            deletionService: SupabaseWorkoutHistoryDeletionService(client: fixture.client, accountEmail: { "client@example.com" }),
            offlineRepository: repository, cacheURL: cache, refreshPending: {})
    }
    private func temporaryCache() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("history-delete-cache-\(UUID()).json")
    }
    private func record(rowID: UUID? = nil, sessionID: UUID?, known: Bool = true, setNumber: Int = 1) -> WorkoutHistoryRecord {
        WorkoutHistoryRecord(rowID: rowID, hasSessionIdentity: known, sessionID: sessionID,
            entryDate: "2026-09-26", workoutTitle: "Workout A", exerciseCode: "A1", exerciseName: "Chest Press",
            setNumber: setNumber, weightUsed: 50, reps: 10, notes: nil)
    }
    private func session(_ records: [WorkoutHistoryRecord]) -> WorkoutHistorySession {
        WorkoutHistorySession(entryDate: "2026-09-26", workoutTitle: "Workout A", records: records)
    }
    private func offlineSession(id: UUID, email: String = "client@example.com") -> OfflineWorkoutSession {
        OfflineWorkoutSession(clientEmail: email, sessionID: id, entryDate: "2026-09-26",
                              workoutTitle: "Workout A", exercises: [], drafts: [])
    }
}

private final class HistoryDeletionHTTPTransport: @unchecked Sendable {
    private let lock = NSLock()
    var rows: [WorkoutHistoryRecord] = []
    var responseSessionID: UUID?
    var failDeletion = false
    private(set) var requests: [URLRequest] = []
    func response(_ request: URLRequest) throws -> (Int, Data) {
        lock.lock(); defer { lock.unlock() }
        requests.append(request)
        if request.url?.path == "/rest/v1/client_workout_logs" {
            return (200, try JSONEncoder().encode(rows))
        }
        if request.url?.path == "/rest/v1/rpc/delete_client_workout_session" {
            if failDeletion { return (503, Data("{\"message\":\"Synthetic failure\",\"code\":\"test\"}".utf8)) }
            return (200, try JSONSerialization.data(withJSONObject: [
                "deleted_count": 1, "session_id": responseSessionID?.uuidString ?? ""
            ]))
        }
        throw URLError(.unsupportedURL)
    }
    func jsonBody(_ request: URLRequest) throws -> [String: Any] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var bytes = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&bytes, maxLength: bytes.count)
                if count <= 0 { break }
                data.append(contentsOf: bytes.prefix(count))
            }
        }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}

@MainActor
private final class HistoryDeletionHTTPFixture {
    let transport = HistoryDeletionHTTPTransport()
    let session: URLSession
    let client: SupabaseClient
    init() {
        HistoryDeletionURLProtocol.transport = transport
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HistoryDeletionURLProtocol.self]
        session = URLSession(configuration: configuration)
        client = SupabaseClient(supabaseURL: URL(string: "https://history-tests.example.com")!, supabaseKey: "test-key",
            options: .init(auth: .init(storage: HistoryDeletionAuthStorage(), autoRefreshToken: false, accessToken: { nil }),
                           global: .init(session: session)))
    }
    func close() { session.invalidateAndCancel(); HistoryDeletionURLProtocol.transport = nil }
}
private struct HistoryDeletionAuthStorage: AuthLocalStorage {
    func store(key: String, value: Data) throws {}
    func retrieve(key: String) throws -> Data? { nil }
    func remove(key: String) throws {}
}
private final class HistoryDeletionURLProtocol: URLProtocol {
    nonisolated(unsafe) static var transport: HistoryDeletionHTTPTransport?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            guard let transport = Self.transport else { throw URLError(.cancelled) }
            let (status, data) = try transport.response(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                                           headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@MainActor
final class WorkoutHistoryReadinessTests: XCTestCase {
    func testMissingAccountClearsPreviousHistoryAndAwardReadiness() async {
        let fixture = HistoryReadinessHTTPFixture()
        defer { fixture.close() }
        let store = fixture.makeStore()
        await store.reload(email: "client@example.com")
        XCTAssertTrue(store.hasCompleteHistory)
        XCTAssertFalse(store.sessions.isEmpty)

        await store.reload(email: "   ")

        XCTAssertFalse(store.hasCompleteHistory)
        XCTAssertTrue(store.sessions.isEmpty)
        guard case .failed = store.state else { return XCTFail("Missing account must fail closed") }
    }

    func testFullHistoryLoadsPastTenThousandRowsWithStablePaginationOrder() async throws {
        let fixture = HistoryReadinessHTTPFixture()
        defer { fixture.close() }
        fixture.transport.configure(rowCount: 10_001)
        let store = fixture.makeStore()

        await store.loadIfNeeded(email: " CLIENT@example.com ")

        XCTAssertEqual(store.state, .loaded)
        XCTAssertTrue(store.hasCompleteHistory)
        XCTAssertEqual(store.sessions.flatMap(\.records).count, 10_001)
        XCTAssertEqual(Set(store.sessions.flatMap(\.records).compactMap(\.rowID)).count, 10_001)
        let requests = fixture.transport.requests
        XCTAssertEqual(requests.count, 21)
        XCTAssertEqual(requests.compactMap { Int(HistoryReadinessHTTPTransport.query($0)["offset"] ?? "") },
                       stride(from: 0, through: 10_000, by: 500).map { $0 })
        for request in requests {
            let query = HistoryReadinessHTTPTransport.query(request)
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/rest/v1/client_workout_logs")
            XCTAssertEqual(query["client_email"], "eq.client@example.com")
            XCTAssertEqual(query["limit"], "500")
            XCTAssertEqual(query["order"], "entry_date.desc.nullslast,updated_at.desc.nullslast,id.asc.nullslast")
            XCTAssertTrue(query["select"]?.contains("completed_at") == true)
            XCTAssertTrue(query["select"]?.contains("set_type") == true)
        }
        await store.loadIfNeeded(email: "client@example.com")
        XCTAssertEqual(fixture.transport.requests.count, 21, "Loaded history should not refetch for a differently cased owner string")
    }

    func testLegacyFallbackKeepsLogsVisibleButCannotCertifyAchievementHistory() async throws {
        let fixture = HistoryReadinessHTTPFixture()
        defer { fixture.close() }
        fixture.transport.configure(rowCount: 1, mode: .missingFullSchema)
        let store = fixture.makeStore()

        await store.reload(email: "client@example.com")

        XCTAssertEqual(store.state, .loaded)
        XCTAssertEqual(store.sessions.count, 1)
        XCTAssertFalse(store.hasCompleteHistory)
        XCTAssertEqual(fixture.transport.requests.count, 3)
        let preProgressionFallback = fixture.transport.requests[1]
        let preProgressionQuery = HistoryReadinessHTTPTransport.query(preProgressionFallback)
        XCTAssertFalse(preProgressionQuery["select"]?.contains("progression_target") == true)
        XCTAssertTrue(preProgressionQuery["select"]?.contains("set_type") == true)
        let fallback = try XCTUnwrap(fixture.transport.requests.last)
        let query = HistoryReadinessHTTPTransport.query(fallback)
        XCTAssertFalse(query["select"]?.contains("set_type") == true)
        XCTAssertTrue(query["order"]?.hasSuffix("id.asc.nullslast") == true)

        // A successful later revision must recover instead of inheriting the old
        // fallback's incomplete marker forever.
        fixture.transport.configure(rowCount: 1)
        await store.reload(email: "client@example.com")
        XCTAssertTrue(store.hasCompleteHistory)
        XCTAssertEqual(store.state, .loaded)
    }

    func testCachedLogsRemainVisibleWithoutClaimingACompleteFailedRefresh() async {
        let fixture = HistoryReadinessHTTPFixture()
        defer { fixture.close() }
        let store = fixture.makeStore()
        await store.reload(email: "client@example.com")
        XCTAssertTrue(store.hasCompleteHistory)
        let savedIDs = store.sessions.map(\.id)

        fixture.transport.configure(rowCount: 1, mode: .failed)
        await store.reload(email: "client@example.com")

        XCTAssertEqual(store.state, .loaded)
        XCTAssertEqual(store.sessions.map(\.id), savedIDs)
        XCTAssertFalse(store.hasCompleteHistory)
    }

    func testAccountSwitchClearsOldSessionsWhileNewOwnerIsLoading() async throws {
        let fixture = HistoryReadinessHTTPFixture()
        defer { fixture.close() }
        let store = fixture.makeStore()
        await store.loadIfNeeded(email: "first@example.com")
        XCTAssertEqual(store.sessions.first?.workoutTitle, "first@example.com training")
        XCTAssertTrue(store.hasCompleteHistory)

        let requested = expectation(description: "Second account history requested")
        fixture.transport.holdNextResponse(email: "second@example.com", requested: requested)
        let loading = Task { await store.loadIfNeeded(email: " SECOND@example.com ") }
        await fulfillment(of: [requested], timeout: 3)

        XCTAssertEqual(store.state, .loading)
        XCTAssertTrue(store.sessions.isEmpty, "An account switch must not display the previous client's workout or badges")
        XCTAssertFalse(store.hasCompleteHistory)
        fixture.transport.releaseHeldResponse()
        await loading.value

        XCTAssertEqual(store.state, .loaded)
        XCTAssertTrue(store.hasCompleteHistory)
        XCTAssertEqual(store.sessions.map(\.workoutTitle), ["second@example.com training"])
        let request = try XCTUnwrap(fixture.transport.requests.last)
        XCTAssertEqual(HistoryReadinessHTTPTransport.query(request)["client_email"], "eq.second@example.com")
    }

    func testStaleFallbackCannotMarkANewerSuccessfulAccountLoadIncomplete() async {
        let fixture = HistoryReadinessHTTPFixture()
        defer { fixture.close() }
        let store = fixture.makeStore()
        let requested = expectation(description: "First account full-schema request held")
        fixture.transport.configure(rowCount: 1, mode: .missingFullSchema)
        fixture.transport.holdNextResponse(email: "first@example.com", requested: requested)
        let oldLoad = Task { await store.reload(email: "first@example.com") }
        await fulfillment(of: [requested], timeout: 3)

        fixture.transport.configure(rowCount: 1)
        await store.reload(email: "second@example.com")
        XCTAssertTrue(store.hasCompleteHistory)
        XCTAssertEqual(store.sessions.map(\.workoutTitle), ["second@example.com training"])

        // The held response is the original schema failure. Its fallback succeeds
        // after the second account has already completed its own full-schema load.
        fixture.transport.releaseHeldResponse()
        await oldLoad.value
        XCTAssertTrue(store.hasCompleteHistory)
        XCTAssertEqual(store.state, .loaded)
        XCTAssertEqual(store.sessions.map(\.workoutTitle), ["second@example.com training"])
    }
}

private final class HistoryReadinessHTTPTransport: @unchecked Sendable {
    enum Mode { case fullSchema, missingFullSchema, failed }
    private let lock = NSLock()
    private var capturedRequests: [URLRequest] = []
    private var rowCount = 1
    private var mode: Mode = .fullSchema
    private var heldEmail: String?
    private var requestExpectation: XCTestExpectation?
    private var heldResponse: (() -> Void)?

    var requests: [URLRequest] {
        lock.lock(); defer { lock.unlock() }
        return capturedRequests
    }

    func configure(rowCount: Int, mode: Mode = .fullSchema) {
        lock.lock(); defer { lock.unlock() }
        self.rowCount = rowCount
        self.mode = mode
    }

    func holdNextResponse(email: String, requested: XCTestExpectation) {
        lock.lock(); defer { lock.unlock() }
        heldEmail = email
        requestExpectation = requested
    }

    func releaseHeldResponse() {
        lock.lock()
        let response = heldResponse
        heldResponse = nil
        lock.unlock()
        response?()
    }

    func respond(to request: URLRequest, completion: @escaping (Result<(Int, Data), Error>) -> Void) {
        lock.lock()
        capturedRequests.append(request)
        let count = rowCount
        let selectedMode = mode
        let fields = Self.query(request)
        let email = String((fields["client_email"] ?? "").dropFirst(3))
        let shouldHold = heldEmail == email
        let requested = shouldHold ? requestExpectation : nil
        if shouldHold { heldEmail = nil; requestExpectation = nil }
        lock.unlock()

        let result = Result { try Self.response(request, fields: fields, email: email, rowCount: count, mode: selectedMode) }
        if shouldHold {
            lock.lock()
            heldResponse = { completion(result) }
            lock.unlock()
            requested?.fulfill()
        } else {
            completion(result)
        }
    }

    static func query(_ request: URLRequest) -> [String: String] {
        guard let url = request.url,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return [:] }
        return Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
    }

    private static func response(_ request: URLRequest, fields: [String: String], email: String,
                                 rowCount: Int, mode: Mode) throws -> (Int, Data) {
        guard request.url?.path == "/rest/v1/client_workout_logs" else { throw URLError(.unsupportedURL) }
        let selected = Set((fields["select"] ?? "").split(separator: ",").map(String.init))
        if mode == .failed {
            return (400, Data("{\"message\":\"Synthetic history schema failure\",\"code\":\"42703\"}".utf8))
        }
        if mode == .missingFullSchema, selected.contains("progression_target") {
            return (400, Data("{\"message\":\"column client_workout_logs.progression_target does not exist\",\"code\":\"42703\"}".utf8))
        }
        if mode == .missingFullSchema, selected.contains("set_type") {
            return (400, Data("{\"message\":\"column client_workout_logs.set_type does not exist\",\"code\":\"42703\"}".utf8))
        }
        let start = Int(fields["offset"] ?? "0") ?? 0
        let limit = Int(fields["limit"] ?? "500") ?? 500
        let end = min(rowCount, start + limit)
        guard start < end else { return (200, Data("[]".utf8)) }
        let rows: [[String: Any]] = (start..<end).map { index in
            let identifier = String(format: "00000000-0000-4000-8000-%012d", index + 1)
            let row: [String: Any] = [
                "id": identifier, "set_id": identifier,
                "session_id": "10000000-0000-4000-8000-000000000001",
                "entry_date": "2026-09-25", "workout_title": "\(email) training",
                "exercise_code": "A1", "exercise_name": "Chest Press", "exercise_order": 0,
                "set_number": index + 1, "weight_used": 50, "reps": 10,
                "source": "ios", "source_version": 1,
                "updated_at": "2026-09-25T10:00:00Z", "completed_at": "2026-09-25T10:00:00Z",
                "set_type": "working"
            ]
            return row.filter { selected.contains($0.key) }
        }
        return (200, try JSONSerialization.data(withJSONObject: rows))
    }
}

@MainActor
private final class HistoryReadinessHTTPFixture {
    let transport = HistoryReadinessHTTPTransport()
    private let session: URLSession
    private let client: SupabaseClient
    private let cacheURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("history-readiness-\(UUID()).json")

    init() {
        HistoryReadinessURLProtocol.transport = transport
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HistoryReadinessURLProtocol.self]
        session = URLSession(configuration: configuration)
        client = SupabaseClient(supabaseURL: URL(string: "https://history-readiness.example.com")!, supabaseKey: "test-key",
            options: .init(auth: .init(storage: HistoryReadinessAuthStorage(), autoRefreshToken: false, accessToken: { nil }),
                           global: .init(session: session)))
    }

    func makeStore() -> WorkoutHistoryStore {
        WorkoutHistoryStore(client: client, offlineRepository: OfflineWorkoutRepository(inMemory: true),
                            cacheURL: cacheURL, refreshPending: {})
    }

    func close() {
        transport.releaseHeldResponse()
        session.invalidateAndCancel()
        HistoryReadinessURLProtocol.transport = nil
        try? FileManager.default.removeItem(at: cacheURL)
    }
}

private struct HistoryReadinessAuthStorage: AuthLocalStorage {
    func store(key: String, value: Data) throws {}
    func retrieve(key: String) throws -> Data? { nil }
    func remove(key: String) throws {}
}

private final class HistoryReadinessURLProtocol: URLProtocol {
    nonisolated(unsafe) static var transport: HistoryReadinessHTTPTransport?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let transport = Self.transport else {
            client?.urlProtocol(self, didFailWithError: URLError(.cancelled))
            return
        }
        transport.respond(to: request) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let (status, data)):
                guard let url = request.url,
                      let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil,
                                                     headerFields: ["Content-Type": "application/json"]) else {
                    client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
                    return
                }
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client?.urlProtocol(self, didLoad: data)
                client?.urlProtocolDidFinishLoading(self)
            case .failure(let error):
                client?.urlProtocol(self, didFailWithError: error)
            }
        }
    }

    override func stopLoading() {}
}
