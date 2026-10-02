import XCTest
@testable import FWBCoach

@MainActor
final class CoachProgressSaveTests: XCTestCase {
    func testSaveReadsLatestRowAndPreservesBlankFieldsWithoutLoadedViewData() async throws {
        let backend = ProgressSaveBackend(rows: [savedRow()])
        let store = CoachWorkspaceStore(backend: backend)
        XCTAssertTrue(store.progress.isEmpty)
        try await store.saveProgress([
            "client_email": .string("client@example.com"), "entry_date": .string("2026-09-25"),
            "bodyweight": .null, "bodyfat": .string("  "), "lean_mass": .null, "goal_note": .string(""),
            "measurements": .object(["waist": .null, "arm": .string(" "), "thigh": .null])
        ])
        let payload = try XCTUnwrap(backend.writes.first?.values)
        XCTAssertEqual(backend.events, ["read", "write"])
        XCTAssertEqual(payload["bodyweight"], .number(180))
        XCTAssertEqual(payload["bodyfat"], .number(18))
        XCTAssertEqual(payload["lean_mass"], .number(147.6))
        XCTAssertEqual(payload["muscle_mass"], .number(88))
        XCTAssertEqual(payload.string("goal_note"), "Latest server note")
        XCTAssertEqual(payload.object("measurements"), savedRow().object("measurements"))
    }

    func testNonblankEditsMergeIntoLatestServerMeasurements() async throws {
        let backend = ProgressSaveBackend(rows: [savedRow()])
        let store = CoachWorkspaceStore(backend: backend)
        try await store.saveProgress([
            "client_email": .string("client@example.com"), "entry_date": .string("2026-09-25"),
            "bodyweight": .number(181), "goal_note": .string("New goal"),
            "measurements": .object(["waist": .number(31.5), "new_measurement": .number(7), "server_only": .null])
        ])
        let payload = try XCTUnwrap(backend.writes.first?.values)
        XCTAssertEqual(payload["bodyweight"], .number(181))
        XCTAssertEqual(payload["bodyfat"], .number(18))
        XCTAssertEqual(payload.string("goal_note"), "New goal")
        XCTAssertEqual(payload.object("measurements")["waist"], .number(31.5))
        XCTAssertEqual(payload.object("measurements")["new_measurement"], .number(7))
        XCTAssertEqual(payload.object("measurements")["server_only"], .object(["value": .number(9)]))
        XCTAssertEqual(payload.object("measurements")["arms"], .number(14))
        XCTAssertEqual(payload.object("measurements")["thighs"], .number(23))
    }

    func testReadFailureStopsSaveInsteadOfReplacingUnknownMeasurements() async {
        let backend = ProgressSaveBackend(rows: [])
        backend.readError = URLError(.notConnectedToInternet)
        let store = CoachWorkspaceStore(backend: backend)
        do {
            try await store.saveProgress(["client_email": .string("client@example.com"), "entry_date": .string("2026-09-25"), "bodyweight": .number(181)])
            XCTFail("Expected the failed preservation read to prevent saving")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("Nothing was saved"))
            XCTAssertTrue(error.localizedDescription.contains("try again"))
        }
        XCTAssertTrue(backend.writes.isEmpty)
        XCTAssertEqual(backend.events, ["read"])
        XCTAssertFalse(store.isSaving)
    }

    func testReadIsBoundToNormalizedClientAndExactDateBeforeUpsert() async throws {
        let backend = ProgressSaveBackend(rows: [])
        let store = CoachWorkspaceStore(backend: backend)
        try await store.saveProgress([
            "client_email": .string(" CLIENT@Example.com "), "entry_date": .string("2026-09-25"),
            "bodyweight": .number(170), "id": .string("do-not-write"), "created_at": .string("do-not-write")
        ])
        let read = try XCTUnwrap(backend.reads.first)
        XCTAssertEqual(read.table, "client_progress")
        XCTAssertEqual(read.filters, ["client_email": "client@example.com", "entry_date": "2026-09-25"])
        XCTAssertEqual(read.order, "updated_at")
        XCTAssertFalse(read.ascending)
        XCTAssertEqual(read.offset, 0)
        XCTAssertEqual(read.limit, 1)
        let write = try XCTUnwrap(backend.writes.first)
        XCTAssertEqual(write.table, "client_progress")
        XCTAssertEqual(write.values.string("client_email"), "client@example.com")
        XCTAssertEqual(write.conflict, "client_email,entry_date")
        XCTAssertNil(write.id)
        XCTAssertNil(write.values["id"])
        XCTAssertNil(write.values["created_at"])
        XCTAssertEqual(write.values["bodyfat"], .null)
        XCTAssertEqual(write.values.string("goal_note"), "")
    }

    func testMismatchedReadCannotMergeAnotherClientOrDateIntoPayload() async {
        for mismatch in [["client_email": CoachJSON.string("other@example.com")], ["entry_date": CoachJSON.string("2026-09-24")]] {
            var row = savedRow()
            for (key, value) in mismatch { row[key] = value }
            let backend = ProgressSaveBackend(rows: [row])
            let store = CoachWorkspaceStore(backend: backend)
            do {
                try await store.saveProgress(["client_email": .string("client@example.com"), "entry_date": .string("2026-09-25")])
                XCTFail("Expected mismatched server context to stop saving")
            } catch { }
            XCTAssertTrue(backend.writes.isEmpty)
        }
    }

    func testReadCancellationDoesNotWrite() async {
        let backend = ProgressSaveBackend(rows: [])
        backend.readError = CancellationError()
        let store = CoachWorkspaceStore(backend: backend)
        do {
            try await store.saveProgress(["client_email": .string("client@example.com"), "entry_date": .string("2026-09-25")])
            XCTFail("Expected cancellation")
        } catch { XCTAssertTrue(error is CancellationError) }
        XCTAssertTrue(backend.writes.isEmpty)
    }

    private func savedRow() -> CoachJSONObject {
        ["client_email": .string("client@example.com"), "entry_date": .string("2026-09-25"),
         "bodyweight": .number(180), "bodyfat": .number(18), "lean_mass": .number(147.6), "muscle_mass": .number(88),
         "goal_note": .string("Latest server note"),
         "measurements": .object(["waist": .number(32), "arm": .number(14), "thigh": .number(23),
                                   "arms": .number(14), "thighs": .number(23), "server_only": .object(["value": .number(9)])])]
    }
}

@MainActor
private final class ProgressSaveBackend: CoachWorkspaceBackend {
    struct Read {
        let table: String
        let filters: [String: String]
        let order: String
        let ascending: Bool
        let offset: Int
        let limit: Int
    }
    struct Write {
        let table: String
        let values: CoachJSONObject
        let id: String?
        let conflict: String?
    }
    let rows: [CoachJSONObject]
    var readError: Error?
    var reads: [Read] = []
    var writes: [Write] = []
    var events: [String] = []

    init(rows: [CoachJSONObject]) { self.rows = rows }

    func select(table: String, filters: [String: String], order: String, ascending: Bool, offset: Int, limit: Int) async throws -> [CoachJSONObject] {
        events.append("read")
        reads.append(Read(table: table, filters: filters, order: order, ascending: ascending, offset: offset, limit: limit))
        if let readError { throw readError }
        return rows
    }
    func write(table: String, values: CoachJSONObject, id: String?, onConflict: String?) async throws -> CoachJSONObject {
        events.append("write")
        writes.append(Write(table: table, values: values, id: id, conflict: onConflict))
        return values
    }
    func invoke(_ function: String, body: CoachJSONObject) async throws -> CoachJSONObject { throw unused() }
    func delete(table: String, id: String) async throws { throw unused() }
    func rpc(_ function: String, params: CoachJSONObject) async throws -> Int { throw unused() }
    func uploadVideo(path: String, data: Data, contentType: String) async throws -> URL { throw unused() }
    func signedURL(bucket: String, path: String) async throws -> URL { throw unused() }
    private func unused() -> Error { CoachWorkspaceError(message: "Unexpected backend operation in progress save test") }
}
