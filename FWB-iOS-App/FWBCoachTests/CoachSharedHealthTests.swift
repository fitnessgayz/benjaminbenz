import XCTest
@testable import FWBCoach

@MainActor
final class CoachSharedHealthTests: XCTestCase {
    private let owner = UUID(uuidString: "A1100000-0000-0000-0000-000000000001")!
    private let email = "alice@example.com"
    private var now: Date { ContinuityDateCoding.date(from: "2026-09-25T12:00:00Z")! }
    private func settings(_ categories: [String]) -> CoachJSONObject {
        ["user_id": .string(owner.uuidString), "client_email": .string(email), "shared_categories": .array(categories.map(CoachJSON.string))]
    }
    private func daily() -> CoachJSONObject {
        ["user_id": .string(owner.uuidString), "client_email": .string(email), "date": .string("2026-09-24"), "steps": .number(8000), "sleep_minutes": .number(450), "body_weight_kg": .number(75), "updated_at": .string("2026-09-25T10:00:00Z")]
    }
    private func workout() -> CoachJSONObject {
        ["user_id": .string(owner.uuidString), "client_email": .string(email), "healthkit_id": .string(UUID().uuidString), "started_at": .string("2026-09-24T11:00:00Z"), "duration_seconds": .number(1800), "active_calories": .number(150), "average_heart_rate": .number(120)]
    }
    private func attachment() -> CoachJSONObject {
        ["id": .string(UUID().uuidString), "owner_user_id": .string(owner.uuidString), "client_email": .string(email), "storage_path": .string("\(owner.uuidString.lowercased())/workout.jpg"), "mime_type": .string("image/jpeg"), "workout_date": .string("2026-09-24")]
    }

    func testConsentIntersectionRemovesRevokedFieldsAndWorkouts() {
        let snapshot = CoachSharedHealthPolicy.snapshot(email: email, initial: settings(["activity", "recovery", "bodyWeight", "workouts"]), current: settings(["activity"]), daily: [daily()], workouts: [workout()], now: now)
        XCTAssertEqual(snapshot.categories, ["activity"])
        XCTAssertEqual(snapshot.daily.first?.double("steps"), 8000)
        XCTAssertNil(snapshot.daily.first?["sleep_minutes"])
        XCTAssertNil(snapshot.daily.first?["body_weight_kg"])
        XCTAssertNil(snapshot.daily.first?["user_id"])
        XCTAssertTrue(snapshot.workouts.isEmpty)
    }

    func testOwnerChangedOrConsentRemovedReturnsEmptySnapshot() {
        var changed = settings(["activity"]); changed["user_id"] = .string(UUID().uuidString)
        for current in [changed, settings([])] {
            XCTAssertEqual(CoachSharedHealthPolicy.snapshot(email: email, initial: settings(["activity"]), current: current, daily: [daily()], workouts: [], now: now), .empty)
        }
        XCTAssertEqual(CoachSharedHealthPolicy.snapshot(email: email, initial: settings(["activity"]), current: nil, daily: [daily()], workouts: [], now: now), .empty)
    }

    func testSnapshotRejectsWrongOwnersEmailsDatesAndOutOfRangeValues() {
        var wrongOwner = daily(); wrongOwner["user_id"] = .string(UUID().uuidString)
        var wrongEmail = daily(); wrongEmail["client_email"] = .string("bob@example.com")
        var old = daily(); old["date"] = .string("2025-01-01")
        var invalidDate = daily(); invalidDate["date"] = .string("2026-09-31")
        var invalidMetric = daily(); invalidMetric["steps"] = .number(200001)
        var badWorkout = workout(); badWorkout["duration_seconds"] = .number(0)
        let snapshot = CoachSharedHealthPolicy.snapshot(email: email, initial: settings(["activity", "workouts"]), current: settings(["activity", "workouts"]), daily: [wrongOwner, wrongEmail, old, invalidDate, invalidMetric], workouts: [badWorkout, workout()], now: now)
        XCTAssertEqual(snapshot.daily.count, 1)
        XCTAssertEqual(snapshot.daily.first?["steps"], .null)
        XCTAssertEqual(snapshot.workouts.count, 1)
    }

    func testSettingsAmbiguityAndMismatchedEmailFailClosed() {
        XCTAssertThrowsError(try CoachSharedHealthPolicy.settings([settings(["activity"]), settings(["activity"])], email: email))
        XCTAssertThrowsError(try CoachSharedHealthPolicy.settings([settings(["activity"])], email: "bob@example.com"))
        XCTAssertNil(try CoachSharedHealthPolicy.settings([], email: email))
    }

    func testStoreQueriesOnlyConsentedColumnsAndRechecksConsent() async {
        let backend = FakeCoachHealthBackend()
        backend.sharingRows = [[settings(["activity", "workouts"])], [settings(["activity"])]]
        backend.days = [daily()]; backend.imports = [workout()]
        let store = CoachSharedHealthStore(backend: backend)
        await store.load(email: email, now: now)
        XCTAssertEqual(backend.requestedColumns, ["steps"])
        XCTAssertEqual(backend.settingsReads, 2)
        XCTAssertEqual(store.snapshot.categories, ["activity"])
        XCTAssertTrue(store.snapshot.workouts.isEmpty)
        XCTAssertEqual(store.healthState, .ready)
    }

    func testAttachmentLoadWorksWithoutHealthSharingAndSignsOnlySelectedRows() async throws {
        let backend = FakeCoachHealthBackend()
        let file = attachment(); backend.files = [file]
        let store = CoachSharedHealthStore(backend: backend)
        await store.load(email: email, now: now)
        XCTAssertEqual(store.healthState, .notShared)
        XCTAssertEqual(store.attachments.count, 1)
        XCTAssertTrue(backend.signedPaths.isEmpty)
        _ = try await store.openAttachment(file)
        XCTAssertEqual(backend.signedPaths, [file.string("storage_path")])
        var other = file; other["client_email"] = .string("bob@example.com")
        do { _ = try await store.openAttachment(other); XCTFail("Must reject another client") } catch { }
        XCTAssertEqual(backend.signedPaths.count, 1)
    }

    func testAttachmentPathsCannotEscapeOwnerFolder() {
        let good = attachment()
        XCTAssertTrue(CoachSharedHealthPolicy.validAttachment(good, email: email))
        for path in ["\(UUID())/workout.jpg", "\(owner)/../private.jpg", "\(owner)/nested/private.jpg", "https://example.com/private.jpg"] {
            var row = good; row["storage_path"] = .string(path)
            XCTAssertFalse(CoachSharedHealthPolicy.validAttachment(row, email: email))
        }
    }

    func testHealthFailureDoesNotHideExplicitAttachments() async {
        let backend = FakeCoachHealthBackend(); backend.failSettings = true; backend.files = [attachment()]
        let store = CoachSharedHealthStore(backend: backend)
        await store.load(email: email, now: now)
        guard case .failed = store.healthState else { return XCTFail("Must report sharing error") }
        XCTAssertEqual(store.attachmentState, .ready)
        XCTAssertEqual(store.attachments.count, 1)
        XCTAssertEqual(store.snapshot, .empty)
    }

    func testActorChangeNeverPublishesSharedData() async {
        let backend = FakeCoachHealthBackend()
        backend.sharingRows = [[settings(["activity"])], [settings(["activity"])]]
        backend.days = [daily()]; backend.files = [attachment()]; backend.changeActorAfterInitialRead = true
        let store = CoachSharedHealthStore(backend: backend)
        await store.load(email: email, now: now)
        guard case .failed = store.healthState, case .failed = store.attachmentState else { return XCTFail("Both results must reject changed authentication") }
        XCTAssertEqual(store.snapshot, .empty)
        XCTAssertTrue(store.attachments.isEmpty)
    }
}

@MainActor
private final class FakeCoachHealthBackend: CoachSharedHealthBackend {
    var sharingRows: [[CoachJSONObject]] = [[]]
    var days: [CoachJSONObject] = []
    var imports: [CoachJSONObject] = []
    var files: [CoachJSONObject] = []
    var requestedColumns: [String] = []
    var settingsReads = 0
    var signedPaths: [String] = []
    var failSettings = false
    var changeActorAfterInitialRead = false
    private var actorReads = 0
    private let actor = UUID()
    func actorID() async throws -> UUID { actorReads += 1; return changeActorAfterInitialRead && actorReads > 1 ? UUID() : actor }
    func settings(email: String) async throws -> [CoachJSONObject] {
        if failSettings { throw CoachWorkspaceError(message: "Sharing unavailable") }
        let value = sharingRows[min(settingsReads, sharingRows.count - 1)]; settingsReads += 1; return value
    }
    func daily(email: String, owner: String, columns: [String], since: Date, through: Date) async throws -> [CoachJSONObject] { requestedColumns = columns; return days }
    func workouts(email: String, owner: String, since: Date, through: Date) async throws -> [CoachJSONObject] { imports }
    func attachments(email: String, offset: Int, limit: Int) async throws -> [CoachJSONObject] { Array(files.dropFirst(offset).prefix(limit)) }
    func signedAttachment(path: String) async throws -> URL { signedPaths.append(path); return URL(string: "https://example.com/signed-image")! }
}
