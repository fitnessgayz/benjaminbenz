import XCTest
import Supabase
@testable import FWBCoach

@MainActor
final class CoachNotificationSettingsTests: XCTestCase {
    private let account = SignedInAccount(id: UUID(), email: "coach@example.com", role: .coach)

    func testMissingPreferencesLoadDoesNotCreateRow() async {
        let backend = NotificationBackendMock()
        let store = CoachNotificationSettingsStore(account: account, backend: backend)
        await store.load()
        XCTAssertTrue(store.didLoad)
        XCTAssertEqual(store.schema, .modern)
        XCTAssertTrue(backend.writes.isEmpty)
        XCTAssertEqual(backend.reads, ["client_notification_preferences:probe", "client_notification_preferences:*"])
    }

    func testOnlyKnownSchemaErrorsEnableFallback() {
        for code in ["42703", "42P01", "PGRST204", "PGRST205"] {
            XCTAssertTrue(CoachNotificationSchema.permitsFallback(PostgrestError(code: code, message: "Missing schema")))
        }
        XCTAssertFalse(CoachNotificationSchema.permitsFallback(PostgrestError(code: "42501", message: "Not authorized")))
        XCTAssertFalse(CoachNotificationSchema.permitsFallback(URLError(.notConnectedToInternet)))
    }

    func testDeniedProbeDoesNotReadFallbackOrWriteDefaults() async {
        let backend = NotificationBackendMock()
        backend.probeError = PostgrestError(code: "42501", message: "Permission denied")
        let store = CoachNotificationSettingsStore(account: account, backend: backend)
        await store.load()
        await store.save()
        XCTAssertFalse(store.didLoad)
        XCTAssertNotNil(store.errorMessage)
        XCTAssertEqual(backend.reads, ["client_notification_preferences:probe"])
        XCTAssertTrue(backend.writes.isEmpty)
    }

    func testDeployedSaveMergesLatestCategoriesAndKeepsSharedFlags() async {
        let backend = NotificationBackendMock()
        backend.probeError = PostgrestError(code: "42703", message: "Column missing")
        backend.rows = [
            ["push_enabled": .bool(false), "categories": .object(["client_message": .bool(true), "low_sessions": .bool(true), "achievement": .bool(false)])],
            ["push_enabled": .bool(false), "timezone": .string("America/Los_Angeles"), "categories": .object(["client_message": .bool(true), "low_sessions": .bool(false), "achievement": .bool(false), "unknown_new_flag": .bool(true)])]
        ]
        let store = CoachNotificationSettingsStore(account: account, backend: backend)
        await store.load()
        XCTAssertEqual(store.schema, .deployed)
        XCTAssertTrue(backend.writes.isEmpty)
        store.setCategory(.workoutComments, enabled: false)
        XCTAssertEqual(store.values.categories[.coachRequests], false)
        await store.save()
        let payload = backend.writes.first
        XCTAssertEqual(backend.tables, ["fwb_notification_settings"])
        XCTAssertEqual(payload?.object("categories").bool("client_message", default: true), false)
        XCTAssertEqual(payload?.object("categories").bool("low_sessions", default: true), false)
        XCTAssertEqual(payload?.object("categories").bool("achievement", default: true), false)
        XCTAssertEqual(payload?.object("categories").bool("unknown_new_flag"), true)
        XCTAssertNil(payload?["push_enabled"])
        XCTAssertNil(payload?["updated_at"])
        XCTAssertNil(payload?["timezone"])
    }

    func testModernSaveOnlyPatchesChangedCoachFields() {
        let original: CoachJSONObject = ["push_enabled": .bool(true), "coach_replies": .bool(false), "client_check_ins": .bool(true)]
        let baseline = CoachNotificationValues(row: original)
        var edited = baseline
        edited.set(.checkIns, enabled: false, schema: .modern)
        let payload = edited.payload(userID: account.id, baseline: baseline, latest: original, schema: .modern)
        XCTAssertEqual(payload, ["user_id": .string(account.id.uuidString), "client_check_ins": .bool(false)])
    }

    func testExplicitSaveCanCreateMissingDeployedRow() async {
        let backend = NotificationBackendMock()
        backend.probeError = PostgrestError(code: "PGRST204", message: "Missing schema")
        let store = CoachNotificationSettingsStore(account: account, backend: backend)
        await store.load()
        XCTAssertTrue(backend.writes.isEmpty)
        await store.save()
        XCTAssertEqual(backend.writes.count, 1)
        XCTAssertEqual(backend.writes[0].string("user_id"), account.id.uuidString)
        XCTAssertEqual(backend.writes[0].object("categories").count, 10)
        XCTAssertFalse(backend.writes[0].bool("push_enabled"))
    }

    func testClientAccountCannotReadOrSaveCoachPreferences() async {
        let backend = NotificationBackendMock()
        let client = SignedInAccount(id: UUID(), email: "client@example.com")
        let store = CoachNotificationSettingsStore(account: client, backend: backend)
        await store.load()
        await store.save()
        XCTAssertFalse(store.didLoad)
        XCTAssertTrue(backend.reads.isEmpty)
        XCTAssertTrue(backend.writes.isEmpty)
    }

    func testPreviewNeverCallsInjectedBackend() async {
        let backend = NotificationBackendMock()
        let store = CoachNotificationSettingsStore(account: account, previewMode: true, backend: backend)
        await store.load()
        store.setPush(true)
        await store.save()
        XCTAssertTrue(store.didLoad)
        XCTAssertFalse(store.hasChanges)
        XCTAssertTrue(backend.reads.isEmpty)
        XCTAssertTrue(backend.writes.isEmpty)
    }
}

@MainActor
private final class NotificationBackendMock: CoachNotificationPreferencesBackend {
    var probeError: Error?
    var rows: [CoachJSONObject?] = []
    var reads: [String] = []
    var writes: [CoachJSONObject] = []
    var tables: [String] = []

    func read(table: String, columns: String, userID: UUID) async throws -> CoachJSONObject? {
        reads.append("\(table):\(columns == "*" ? "*" : "probe")")
        if columns != "*" {
            if let probeError { throw probeError }
            return nil
        }
        return rows.isEmpty ? nil : rows.removeFirst()
    }
    func upsert(table: String, values: CoachJSONObject, userID: UUID) async throws -> CoachJSONObject {
        tables.append(table)
        writes.append(values)
        return values
    }
}
