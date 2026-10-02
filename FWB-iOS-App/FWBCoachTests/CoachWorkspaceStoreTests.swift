import XCTest
@testable import FWBCoach

@MainActor
final class CoachWorkspaceStoreTests: XCTestCase {
    private let aliceID = UUID(uuidString: "A1100000-0000-0000-0000-000000000001")!
    private let bobID = UUID(uuidString: "B0B00000-0000-0000-0000-000000000002")!

    private func row(id: UUID? = nil, email: String = "alice@example.com", title: String = "Strength", active: Bool = true) -> CoachJSONObject {
        let exercise: CoachJSONObject = ["name": .string("Squat"), "prescription": .string("3 x 8"), "future_exercise_field": .object(["nested": .bool(true)])]
        let workout: CoachJSONObject = ["title": .string("Day 1"), "future_workout_field": .array([.null, .number(3)]), "exercises": .array([.object(exercise)])]
        return ["id": .string((id ?? aliceID).uuidString), "client_email": .string(email), "client_name": .string(email.hasPrefix("bob") ? "Bob" : "Alice"),
         "program_title": .string(title), "active": .bool(active), "client_archived": .bool(false),
         "updated_at": .string("2026-09-25T12:00:00Z"), "session_count_used": .number(2), "session_count_total": .number(10),
         "nutrition_plan": .object(["protein": .string("140"), "future_nutrition_field": .bool(true)]),
         "workouts": .array([.object(workout)])]
    }

    func testProgramEditsPreserveUnknownNestedFieldsAndOriginalRevision() throws {
        let original = row()
        var program = CoachClientProgram(raw: original)
        program.setText("program_title", "Updated title")
        let payload = CoachWorkspaceStore.programPayload(program)
        let encoded = try JSONEncoder().encode(payload)
        let decoded = try JSONDecoder().decode(CoachJSONObject.self, from: encoded)
        XCTAssertEqual(decoded.object("program").array("workouts"), original.array("workouts"))
        XCTAssertEqual(program.originalRaw, original)
        XCTAssertEqual(decoded.string("program_id"), aliceID.uuidString)
        XCTAssertEqual(decoded.object("program").string("program_title"), "Updated title")
    }

    func testNewClientAndBlockHaveStableLocalIdentityAndInsertPayload() {
        let draft = CoachClientProgram.newClient(email: " ALICE@EXAMPLE.COM ", name: "Alice")
        XCTAssertEqual(draft.id, draft.id)
        XCTAssertFalse(draft.isPersisted)
        XCTAssertEqual(draft.email, "alice@example.com")
        XCTAssertEqual(CoachWorkspaceStore.programPayload(draft).string("program_id"), "")
        var raw = row()
        raw["client_workout_layout"] = .object(["version": .number(2)])
        let next = CoachClientProgram(raw: raw).newBlock()
        XCTAssertFalse(next.isPersisted)
        XCTAssertNil(next.raw["updated_at"])
        XCTAssertNil(next.raw["client_workout_layout"])
        XCTAssertEqual(next.raw.int("session_count_used"), 2)
        XCTAssertEqual(next.raw.object("nutrition_plan"), raw.object("nutrition_plan"))
        XCTAssertTrue(next.raw.array("workouts").isEmpty)
    }

    func testCopyKeepsDestinationIdentityProfileAndSourceTraining() {
        let source = CoachClientProgram(raw: row())
        var targetRaw = row(id: bobID, email: "bob@example.com", title: "Other")
        targetRaw["session_count_total"] = .number(24)
        targetRaw["nutrition_plan"] = .object(["calories": .string("2500")])
        let copy = source.copied(to: CoachClientProgram(raw: targetRaw))
        XCTAssertEqual(copy.email, "bob@example.com")
        XCTAssertEqual(copy.name, "Bob")
        XCTAssertEqual(copy.raw.int("session_count_total"), 24)
        XCTAssertEqual(copy.raw.object("nutrition_plan"), targetRaw.object("nutrition_plan"))
        XCTAssertEqual(copy.raw.array("workouts"), source.raw.array("workouts"))
        XCTAssertEqual(copy.programTitle, "Strength")
        XCTAssertFalse(copy.isPersisted)
        XCTAssertNil(copy.raw["updated_at"])
    }

    func testGroupingUsesNormalizedEmailAndPrefersCurrentProgram() {
        let old = CoachClientProgram(raw: row(id: UUID(), email: " ALICE@EXAMPLE.COM ", title: "Old", active: false))
        let current = CoachClientProgram(raw: row())
        let bob = CoachClientProgram(raw: row(id: bobID, email: "bob@example.com"))
        let store = CoachWorkspaceStore(previewPrograms: [old, bob, current])
        XCTAssertEqual(store.clientPrograms(archived: false).map(\.id), [current.id, bob.id])
        XCTAssertEqual(store.programs(for: " Alice@example.com ").count, 2)
    }

    func testStaleProgramCannotInvokeSaveEndpoint() async throws {
        let original = row()
        var latest = original
        latest["updated_at"] = .string("2026-09-25T12:01:00Z")
        let backend = FakeCoachWorkspaceBackend(tables: ["client_programs": [latest]])
        let store = CoachWorkspaceStore(backend: backend)
        var edited = CoachClientProgram(raw: original)
        edited.setText("program_title", "Unsaved edits")
        do { _ = try await store.saveProgram(edited); XCTFail("Expected stale edit rejection") }
        catch { XCTAssertTrue(error.localizedDescription.contains("changed since")) }
        XCTAssertTrue(backend.invocations.isEmpty)
        XCTAssertFalse(store.isSaving)
        XCTAssertNotNil(store.errorMessage)
    }

    func testSaveIncludesOriginalIDAndCompleteProgramAndAcceptsServerRow() async throws {
        let original = row()
        var saved = original
        saved["program_title"] = .string("New title")
        saved["updated_at"] = .string("2026-09-25T12:01:00Z")
        let backend = FakeCoachWorkspaceBackend(tables: ["client_programs": [original]])
        backend.responses["save-client-program"] = ["program": .object(saved), "message": .string("Saved")]
        let store = CoachWorkspaceStore(backend: backend)
        var edited = CoachClientProgram(raw: original)
        edited.setText("program_title", "New title")
        let result = try await store.saveProgram(edited)
        XCTAssertEqual(backend.invocations.first?.name, "save-client-program")
        XCTAssertEqual(backend.invocations.first?.body.string("program_id"), aliceID.uuidString)
        XCTAssertEqual(backend.invocations.first?.body.object("program").array("workouts"), original.array("workouts"))
        XCTAssertEqual(result.originalRaw, saved)
        XCTAssertEqual(store.selectedProgram?.programTitle, "New title")
    }

    func testProgramEmailChangeUsesProfileEndpointAndStaleProfileIsRejected() async throws {
        let original = row()
        let backend = FakeCoachWorkspaceBackend(tables: ["client_programs": [original]])
        let store = CoachWorkspaceStore(backend: backend)
        var edited = CoachClientProgram(raw: original)
        edited.setText("client_email", "new@example.com")
        do { _ = try await store.saveProgram(edited); XCTFail("Direct email migration should fail") }
        catch { XCTAssertTrue(error.localizedDescription.contains("client profile")) }
        XCTAssertTrue(backend.invocations.isEmpty)
        var saved = edited.raw; saved["updated_at"] = .string("new revision")
        backend.responses["update-client-profile"] = ["program": .object(saved)]
        let result = try await store.saveProfile(edited, originalEmail: "alice@example.com")
        XCTAssertEqual(result.email, "new@example.com")
        XCTAssertEqual(backend.invocations.last?.name, "update-client-profile")
        XCTAssertEqual(backend.invocations.last?.body.string("old_email"), "alice@example.com")
        XCTAssertNil(backend.invocations.last?.body["workouts"])
        backend.tables["client_programs"] = [saved]
        do { _ = try await store.saveProfile(edited, originalEmail: "alice@example.com"); XCTFail("Stale profile should fail") }
        catch { XCTAssertTrue(error.localizedDescription.contains("changed since")) }
        XCTAssertEqual(backend.invocations.count, 1)
    }

    func testDetailResourceFailureDoesNotHideOtherResources() async throws {
        let backend = FakeCoachWorkspaceBackend(tables: ["client_programs": [row()], "client_food_logs": [["id": .string(UUID().uuidString), "client_email": .string("alice@example.com"), "entry_date": .string("2026-09-25")]]])
        backend.failedTables = ["client_progress"]
        let store = CoachWorkspaceStore(backend: backend)
        await store.load()
        await store.loadSelectedClient()
        XCTAssertNotNil(store.detailErrors["client_progress"])
        XCTAssertNil(store.detailErrors["client_food_logs"])
        XCTAssertEqual(store.foodLogs.count, 1)
        XCTAssertFalse(store.isLoadingDetails)
        XCTAssertNil(store.errorMessage)
    }

    func testFailedClientRefreshRetainsLastConfirmedCohortAndReportsFailure() async {
        let backend = FakeCoachWorkspaceBackend(tables: ["client_programs": [row()]])
        let store = CoachWorkspaceStore(backend: backend)
        await store.load()
        backend.failedTables = ["client_programs"]
        await store.reload()
        XCTAssertEqual(store.programs.count, 1)
        XCTAssertNotNil(store.errorMessage)
        XCTAssertFalse(store.isLoading)
    }

    func testCalendarRequestSurroundsSelectedDayWithinServerRangeLimit() async throws {
        let backend = FakeCoachWorkspaceBackend()
        backend.responses["coach-calendar-events"] = ["events": .array([.object(["title": .string("Session")])])]
        let store = CoachWorkspaceStore(backend: backend)
        let selected = try XCTUnwrap(ContinuityDateCoding.date(from: "2021-03-15T12:00:00Z"))
        await store.loadCalendar(around: selected)
        let payload = try XCTUnwrap(backend.invocations.first?.body)
        let from = try XCTUnwrap(ContinuityDateCoding.date(from: payload.string("from")))
        let to = try XCTUnwrap(ContinuityDateCoding.date(from: payload.string("to")))
        XCTAssertLessThan(from, selected)
        XCTAssertGreaterThan(to, selected)
        XCTAssertEqual(to.timeIntervalSince(from), 130 * 86400, accuracy: 1)
        XCTAssertLessThan(to.timeIntervalSince(from), 184 * 86400)
        XCTAssertEqual(store.calendarEvents.first?.string("title"), "Session")
        XCTAssertNil(store.calendarError)
    }

    func testChangingClientDiscardsAnInFlightPreviousClientResponse() async throws {
        let backend = FakeCoachWorkspaceBackend(tables: ["client_programs": [row(), row(id: bobID, email: "bob@example.com")]])
        backend.suspendEmail = "alice@example.com"
        let store = CoachWorkspaceStore(backend: backend)
        await store.load()
        store.selectProgram(aliceID)
        let firstLoad = Task { await store.loadSelectedClient() }
        for _ in 0..<1000 {
            if backend.pending.count == 5 { break }
            await Task.yield()
        }
        XCTAssertEqual(backend.pending.count, 5, "Expected all client resource requests to suspend")
        store.selectProgram(bobID)
        await store.loadSelectedClient()
        backend.finishSuspended(with: [["client_email": .string("alice@example.com"), "private_note": .string("Alice only")]])
        await firstLoad.value
        XCTAssertEqual(store.selectedProgramID, bobID)
        XCTAssertTrue(store.logs.isEmpty)
        XCTAssertTrue(store.photos.isEmpty)
        XCTAssertTrue(store.progress.isEmpty)
        XCTAssertFalse(store.isLoadingDetails)
    }

    func testProgressUpsertUsesEmailAndDateAndPreservesUnknownMeasurements() async throws {
        let backend = FakeCoachWorkspaceBackend()
        let store = CoachWorkspaceStore(backend: backend)
        let measurement: CoachJSONObject = ["waist": .number(32), "custom_measurement": .number(9)]
        try await store.saveProgress(["client_email": .string("ALICE@EXAMPLE.COM"), "entry_date": .string("2026-09-25"), "measurements": .object(measurement), "id": .string("discard-id"), "created_at": .string("discard")])
        XCTAssertEqual(backend.writes.first?.conflict, "client_email,entry_date")
        XCTAssertEqual(backend.writes.first?.values.string("client_email"), "alice@example.com")
        XCTAssertEqual(backend.writes.first?.values.object("measurements"), measurement)
        XCTAssertNil(backend.writes.first?.values["id"])
    }

    func testExercisePayloadRemovesReadonlyFieldsAndVideoValidationPrecedesWrites() async throws {
        let raw: CoachJSONObject = ["id": .string(aliceID.uuidString), "created_at": .string("old"), "name": .string(" Squat "), "default_sets": .number(3), "default_rest_seconds": .number(90), "instructions": .string("Brace"), "demo_url": .string("")]
        let payload = try CoachWorkspaceStore.exercisePayload(raw)
        XCTAssertNil(payload["id"])
        XCTAssertNil(payload["created_at"])
        XCTAssertEqual(payload.string("name"), "Squat")
        XCTAssertEqual(payload["demo_url"], .null)
        let backend = FakeCoachWorkspaceBackend()
        let store = CoachWorkspaceStore(backend: backend)
        do { _ = try await store.saveExercise(raw, id: nil, videoData: Data([1]), videoExtension: "exe"); XCTFail("Unsupported upload must fail") }
        catch { XCTAssertTrue(error.localizedDescription.contains("50 MB")) }
        XCTAssertTrue(backend.writes.isEmpty)
        XCTAssertTrue(backend.uploadPaths.isEmpty)
    }

    func testAnalysisOnlyIncludesSelectedClientAndPreviewCannotMutate() async throws {
        let backend = FakeCoachWorkspaceBackend()
        backend.responses["analyze-workout"] = ["analysis": .object(["analysis_text": .string("Example")])]
        let store = CoachWorkspaceStore(backend: backend)
        _ = try await store.analyze(client: CoachClientProgram(raw: row()), logs: [["client_email": .string("alice@example.com"), "exercise_name": .string("Squat")], ["client_email": .string("bob@example.com"), "exercise_name": .string("Private")]])
        XCTAssertEqual(backend.invocations.first?.body.array("logs").count, 1)
        XCTAssertNil(backend.invocations.first?.body.array("logs").first?.objectValue["client_email"])
        let preview = CoachWorkspaceStore(previewPrograms: [CoachClientProgram(raw: row())])
        do { _ = try await preview.inviteClient(email: "alice@example.com", name: "Alice"); XCTFail("Preview cannot send email") }
        catch { XCTAssertTrue(error.localizedDescription.contains("Preview data")) }
        XCTAssertTrue(preview.isPreview)
    }

    func testExerciseDemoURLAllowsWebYouTubeAndOwnPublicVideoOnly() throws {
        let origin = AppConfiguration.supabaseURL.absoluteString
        for value in ["https://www.youtube.com/watch?v=example", "https://youtube.com/shorts/example", "https://youtu.be/example", "\(origin)/storage/v1/object/public/exercise-videos/abc-123/demo.mov"] {
            XCTAssertEqual(try CoachWorkspaceStore.validatedExerciseDemoURL(value), value)
        }
        XCTAssertNil(try CoachWorkspaceStore.validatedExerciseDemoURL(" \n"))
        let invalid = ["javascript:alert(1)", "http://youtube.com/watch?v=example", "https://user:pass@youtube.com/watch?v=example", "https://youtube.com.evil.example/watch?v=example", "https://example.com/video.mp4", "https://youtube.com:8443/watch?v=example", "https://m.youtube.com/watch?v=example", "\(origin)/storage/v1/object/public/progress-photos/abc/demo.mp4", "\(origin)/storage/v1/object/public/exercise-videos/abc/demo.html", "https://other.supabase.co/storage/v1/object/public/exercise-videos/abc/demo.mp4", "\(origin)/storage/v1/object/public/exercise-videos/abc/%64emo.mp4"]
        for value in invalid { XCTAssertThrowsError(try CoachWorkspaceStore.validatedExerciseDemoURL(value), value) }
    }

    func testExerciseInvalidDemoRejectsWriteButNewUploadReplacesInvalidLink() async throws {
        let row: CoachJSONObject = ["name": .string("Squat"), "default_sets": .number(3), "default_rest_seconds": .number(90), "demo_url": .string("https://untrusted.example/old-video.mp4")]
        let backend = FakeCoachWorkspaceBackend()
        let store = CoachWorkspaceStore(backend: backend)
        do { _ = try await store.saveExercise(row, id: nil); XCTFail("Invalid URL must not save") }
        catch { XCTAssertTrue(error.localizedDescription.contains("YouTube")) }
        XCTAssertTrue(backend.writes.isEmpty)
        _ = try await store.saveExercise(row, id: nil, videoData: Data([1]), videoExtension: "mp4")
        XCTAssertEqual(backend.uploadPaths.count, 1)
        XCTAssertEqual(backend.writes.count, 1)
        let savedURL = try XCTUnwrap(backend.writes.first?.values.string("demo_url"))
        XCTAssertTrue(savedURL.hasPrefix(AppConfiguration.supabaseURL.absoluteString + "/storage/v1/object/public/exercise-videos/"))
        XCTAssertTrue(savedURL.hasSuffix(".mp4"))
    }

    func testAllProgramPagesLoadBeyondSupabaseDefaultPage() async {
        let rows = (0..<501).map { index -> CoachJSONObject in
            var item = row(id: UUID(), email: "client\(index)@example.com")
            item["client_name"] = .string("Client \(index)")
            return item
        }
        let backend = FakeCoachWorkspaceBackend(tables: ["client_programs": rows])
        let store = CoachWorkspaceStore(backend: backend)
        await store.load()
        XCTAssertEqual(store.programs.count, 501)
        XCTAssertEqual(backend.selectOffsets["client_programs"], [0, 500])
    }
}

@MainActor
private final class FakeCoachWorkspaceBackend: CoachWorkspaceBackend {
    struct Invocation { let name: String; let body: CoachJSONObject }
    struct Write { let table: String; let values: CoachJSONObject; let id: String?; let conflict: String? }
    var tables: [String: [CoachJSONObject]]
    var failedTables: Set<String> = []
    var responses: [String: CoachJSONObject] = [:]
    var invocations: [Invocation] = []
    var writes: [Write] = []
    var uploadPaths: [String] = []
    var selectOffsets: [String: [Int]] = [:]
    var suspendEmail: String?
    var pending: [CheckedContinuation<[CoachJSONObject], Error>] = []
    init(tables: [String: [CoachJSONObject]] = [:]) { self.tables = tables }

    func select(table: String, filters: [String: String], order: String, ascending: Bool, offset: Int, limit: Int) async throws -> [CoachJSONObject] {
        selectOffsets[table, default: []].append(offset)
        if failedTables.contains(table) { throw CoachWorkspaceError(message: "Permission denied for \(table)") }
        if let suspendEmail, filters["client_email"] == suspendEmail {
            return try await withCheckedThrowingContinuation { pending.append($0) }
        }
        let rows = (tables[table] ?? []).filter { row in filters.allSatisfy {
            if $0.key.hasSuffix(".gte") { return row.string(String($0.key.dropLast(4))) >= $0.value }
            return row.string($0.key).lowercased() == $0.value.lowercased()
        } }
        return Array(rows.dropFirst(offset).prefix(limit))
    }
    func finishSuspended(with rows: [CoachJSONObject]) {
        suspendEmail = nil
        let continuations = pending; pending = []
        continuations.forEach { $0.resume(returning: rows) }
    }
    func invoke(_ function: String, body: CoachJSONObject) async throws -> CoachJSONObject {
        invocations.append(Invocation(name: function, body: body))
        return responses[function] ?? [:]
    }
    func write(table: String, values: CoachJSONObject, id: String?, onConflict: String?) async throws -> CoachJSONObject {
        writes.append(Write(table: table, values: values, id: id, conflict: onConflict))
        return values
    }
    func delete(table: String, id: String) async throws {}
    func rpc(_ function: String, params: CoachJSONObject) async throws -> Int { invocations.append(Invocation(name: function, body: params)); return 1 }
    func uploadVideo(path: String, data: Data, contentType: String) async throws -> URL { uploadPaths.append(path); return URL(string: AppConfiguration.supabaseURL.absoluteString + "/storage/v1/object/public/exercise-videos/\(path)")! }
    func signedURL(bucket: String, path: String) async throws -> URL { URL(string: "https://example.com/private-file")! }
}
