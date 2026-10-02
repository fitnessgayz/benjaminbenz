import XCTest
@testable import FWBCoach

@MainActor
final class DailyMoodCheckInTests: XCTestCase {
    private let email = "client@example.com"
    private let today = Date(timeIntervalSince1970: 1_790_380_800)

    func testExistingOfflineCheckInWithoutMoodStillDecodes() throws {
        let source = checkIn(mood: nil)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(source)) as? [String: Any])
        object.removeValue(forKey: "mood")
        object.removeValue(forKey: "hasEatenToday")
        let decoded = try JSONDecoder().decode(ReadinessCheckIn.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(decoded.mood)
        XCTAssertNil(decoded.hasEatenToday)
        XCTAssertEqual(decoded.energy, source.energy)
        XCTAssertEqual(decoded.note, source.note)
    }

    func testMoodAndNoteSurviveOfflineRoundTrip() throws {
        let source = checkIn(mood: 2, note: "Busy day — keep it short")
        let decoded = try JSONDecoder().decode(ReadinessCheckIn.self, from: JSONEncoder().encode(source))
        XCTAssertEqual(decoded, source)
    }

    func testInvalidMoodInputIsBoundedToScale() {
        XCTAssertEqual(checkIn(mood: 0).mood, 1)
        XCTAssertEqual(checkIn(mood: 20).mood, 5)
        XCTAssertNil(checkIn(mood: nil).mood)
    }

    func testCurrentAndLegacyPayloadKeepMoodReadableWithoutAnUndeployedColumn() throws {
        let source = checkIn(mood: 4, note: "Training after work")
        for data in [try JSONEncoder().encode(ReadinessCheckInPayload(source)), try JSONEncoder().encode(LegacyReadinessCheckInPayload(source))] {
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            XCTAssertNil(object["mood"])
            XCTAssertEqual(object["note"] as? String, "Mood check-in: Good (4/5)\n\nTraining after work")
            XCTAssertEqual(object["client_email"] as? String, email)
            XCTAssertNil(object["win"], "Daily updates must not erase weekly answers.")
            XCTAssertNil(object["challenge"])
        }
    }

    func testEveryMoodRoundTripsThroughHumanReadableRemoteNote() throws {
        for mood in 1...5 {
            let note = "Day \(mood)\n\nMood check-in: Great (5/5)"
            let encoded = try XCTUnwrap(ReadinessMoodNote.encode(mood: mood, note: note))
            let decoded = ReadinessMoodNote.decode(encoded)
            XCTAssertEqual(decoded.mood, mood)
            XCTAssertEqual(decoded.note, note)
        }
        XCTAssertEqual(ReadinessMoodNote.decode("Mood check-in: Okay (3/5)").mood, 3)
        XCTAssertEqual(ReadinessMoodNote.decode("Mood check-in: Okay (3/5)").note, "")
    }

    func testUnrelatedOrMalformedNotesNeverBecomeMoodAnswers() {
        for note in ["Feeling 2/5", "Mood check-in: Great (2/5)", "Mood check-in: Great (6/5)", "Mood check-in: Good (4/5) extra text", "Notes\nMood check-in: Low (2/5)"] {
            let decoded = ReadinessMoodNote.decode(note)
            XCTAssertNil(decoded.mood)
            XCTAssertEqual(decoded.note, note)
        }
        XCTAssertNil(ReadinessMoodNote.encode(mood: nil, note: ""))
        XCTAssertEqual(ReadinessMoodNote.encode(mood: nil, note: "Legacy note"), "Legacy note")
    }

    func testRemoteCheckInRestoresMoodAndRemovesOnlyItsHeading() throws {
        let remote = try remoteRecord(note: "Mood check-in: Low (2/5)\n\nStressful afternoon", sleep: 4)
        let decoded = try XCTUnwrap(remote.checkIn)
        XCTAssertEqual(decoded.mood, 2)
        XCTAssertEqual(decoded.note, "Stressful afternoon")
        XCTAssertEqual(decoded.sleepRecovery, 4)
        XCTAssertEqual(decoded.syncState, .synced)
        XCTAssertEqual(decoded.clientEmail, email)
    }

    func testLegacyRemoteWithoutMoodUsesStressRecoveryAndPreservesNote() throws {
        let decoded = try XCTUnwrap(remoteRecord(note: "Coach context", sleep: nil).checkIn)
        XCTAssertNil(decoded.mood)
        XCTAssertEqual(decoded.sleepRecovery, 4)
        XCTAssertEqual(decoded.note, "Coach context")
    }

    func testOlderRemoteMoodCannotReplaceQueuedNewerEdit() async throws {
        let repository = temporaryRepository()
        let newer = checkIn(mood: 2, note: "Latest", updatedAt: today.addingTimeInterval(60))
        try await repository.save(newer)
        var older = checkIn(mood: 5, note: "Old")
        older.syncState = .synced
        let merged = try await repository.mergeRemote(older)
        XCTAssertEqual(merged, newer)
        let pending = try await repository.queuedCheckIns()
        XCTAssertEqual(pending, [newer])
    }

    func testSuccessfulUploadCannotMarkNewerMoodEditAsSynced() async throws {
        let repository = temporaryRepository()
        let uploaded = checkIn(mood: 5)
        try await repository.save(uploaded)
        var newer = uploaded
        newer.mood = 1
        newer.note = "Updated while upload was pending"
        newer.updatedAt = today.addingTimeInterval(1)
        try await repository.save(newer)
        let result = try await repository.markSynced(uploaded)
        XCTAssertEqual(result, newer)
        XCTAssertEqual(result?.syncState, .queued)
    }

    func testNewerRemoteMoodMergesAndRetainsStableLocalIdentity() async throws {
        let repository = temporaryRepository()
        let local = checkIn(mood: 3)
        try await repository.save(local)
        var remote = checkIn(mood: 1, updatedAt: today.addingTimeInterval(2))
        remote.syncState = .synced
        let merged = try await repository.mergeRemote(remote)
        XCTAssertEqual(merged.id, local.id)
        XCTAssertEqual(merged.mood, 1)
        XCTAssertEqual(merged.syncState, .synced)
    }

    func testLoadClearsYesterdayAndPreviewSaveCreatesNewDailyIdentity() async {
        let yesterday = checkIn(mood: 4, updatedAt: today.addingTimeInterval(-86_400))
        let store = DailyReadinessStore(previewCheckIn: yesterday, clientEmail: email, now: { self.today })
        await store.load()
        XCTAssertNil(store.today)
        let didSave = await store.save(energy: 2, soreness: 2, sleepRecovery: 4, mood: 2, hasEatenToday: true, note: "Today")
        XCTAssertTrue(didSave)
        XCTAssertNotEqual(store.today?.id, yesterday.id)
        XCTAssertEqual(store.today?.localDate, ReadinessCheckIn.localDateKey(for: today))
        XCTAssertEqual(store.today?.mood, 2)
    }

    func testSaveReusesIdentityOnlyForTheSameDayWithoutRequiringReload() async {
        let previous = checkIn(mood: 4)
        var currentTime = today
        let store = DailyReadinessStore(previewCheckIn: previous, clientEmail: email, now: { currentTime })
        _ = await store.save(energy: 3, soreness: 2, sleepRecovery: 4, mood: 3, hasEatenToday: true, note: "Updated")
        XCTAssertEqual(store.today?.id, previous.id)
        currentTime = today.addingTimeInterval(86_400)
        _ = await store.save(energy: 3, soreness: 2, sleepRecovery: 4, mood: 2, hasEatenToday: true, note: "New day")
        XCTAssertNotEqual(store.today?.id, previous.id)
    }

    func testLateLoadCannotOverwriteSavedMood() async {
        let backend = DeferredReadinessSync()
        let store = DailyReadinessStore(clientEmail: email, syncStore: backend, now: { self.today })
        let loading = Task { await store.load() }
        await backend.waitUntilLoading()
        _ = await store.save(energy: 3, soreness: 2, sleepRecovery: 4, mood: 1, hasEatenToday: true, note: "Just saved")
        backend.finishLoading(with: checkIn(mood: 5, note: "Stale server answer"))
        await loading.value
        XCTAssertEqual(store.today?.mood, 1)
        XCTAssertEqual(store.today?.note, "Just saved")
        XCTAssertEqual(store.state, .loaded)
    }

    func testLoadCrossingMidnightCannotExposeYesterdayAsToday() async {
        var currentTime = today
        let backend = DeferredReadinessSync()
        let store = DailyReadinessStore(clientEmail: email, syncStore: backend, now: { currentTime })
        let loading = Task { await store.load() }
        await backend.waitUntilLoading()
        currentTime = today.addingTimeInterval(86_400)
        backend.finishLoading(with: checkIn(mood: 5))
        await loading.value
        XCTAssertNil(store.today)
        XCTAssertEqual(store.state, .idle)
    }

    private func checkIn(mood: Int?, note: String = "Note", updatedAt: Date? = nil) -> ReadinessCheckIn {
        let date = updatedAt ?? today
        return ReadinessCheckIn(clientEmail: email, localDate: ReadinessCheckIn.localDateKey(for: date), energy: 4, soreness: 2, sleepRecovery: 4, mood: mood, hasEatenToday: true, note: note, updatedAt: date)
    }

    private func remoteRecord(note: String, sleep: Int?) throws -> ReadinessRemoteRecord {
        var object: [String: Any] = ["id": UUID().uuidString, "client_email": " CLIENT@example.com ", "occurred_on": "2026-09-25", "energy": 4, "soreness": 2, "stress": 2, "note": note, "created_at": "2026-09-25T08:00:00Z", "updated_at": "2026-09-25T09:00:00Z"]
        if let sleep { object["sleep_recovery"] = sleep }
        return try JSONDecoder().decode(ReadinessRemoteRecord.self, from: JSONSerialization.data(withJSONObject: object))
    }

    private func temporaryRepository() -> ReadinessCheckInRepository {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return ReadinessCheckInRepository(fileURL: directory.appendingPathComponent("readiness.json"))
    }
}

@MainActor
private final class DeferredReadinessSync: DailyReadinessSyncing {
    private var loadContinuation: CheckedContinuation<ReadinessCheckIn?, Never>?
    private var waitingForLoad: CheckedContinuation<Void, Never>?

    func loadToday(clientEmail: String) async throws -> ReadinessCheckIn? {
        await withCheckedContinuation { continuation in
            loadContinuation = continuation
            waitingForLoad?.resume()
            waitingForLoad = nil
        }
    }

    func save(_ checkIn: ReadinessCheckIn) async throws -> ReadinessCheckIn { checkIn }

    func waitUntilLoading() async {
        if loadContinuation != nil { return }
        await withCheckedContinuation { waitingForLoad = $0 }
    }

    func finishLoading(with value: ReadinessCheckIn?) {
        loadContinuation?.resume(returning: value)
        loadContinuation = nil
    }
}
